import type { AppData, F2LSolution, Penalty, Scramble, ScrambleSet, Solve } from '../types';
import type { Lang } from '../i18n/lang';
import { isValidScramble } from './cube';
import { normalizeId } from './id';
import { F2L_CASES } from './f2l';
import { parseFaceMove } from './f2lTrainer';
import {
  DRY_MODES,
  clampLevel,
  emptyDryPractice,
  emptyProgress,
  type DryMode,
  type DryPracticeData,
  type DrySettings,
  type ModeProgress,
  type TaskRecord,
  type TimeSetting,
} from './dryPractice';

const KEY_PREFIX = 'cuberhub:';
/** The prefix of the keys written while the app was called Rubik Timer. */
const LEGACY_KEY_PREFIX = 'rubik-timer:';

const STORAGE_KEY = `${KEY_PREFIX}data`;
/** Where the data lives on after the database took it over. */
const RETIRED_KEY = `${KEY_PREFIX}data-before-database`;
const CARRY_OVER_KEY = `${KEY_PREFIX}carry-over`;
const ACTIVE_SCRAMBLE_KEY = `${KEY_PREFIX}active-scramble`;
const ACTIVE_SET_KEY = `${KEY_PREFIX}active-set`;
const LIST_OPEN_KEY = `${KEY_PREFIX}list-open`;
const LANG_KEY = `${KEY_PREFIX}lang`;
const FAVORITE_ALGS_KEY = `${KEY_PREFIX}favorite-algorithms`;
const FAVORITES_ONLY_KEY = `${KEY_PREFIX}favorite-algorithms-only`;
const INSPECTION_KEY = `${KEY_PREFIX}inspection`;
const DRY_PRACTICE_KEY = `${KEY_PREFIX}dry-practice`;
const TRAINING_SETTINGS_KEY = `${KEY_PREFIX}training-settings`;

export const EXPORT_FORMAT = 'cuberhub';
/** The format of files exported while the app was called Rubik Timer; still imported. */
export const LEGACY_EXPORT_FORMAT = 'rubik-timer';
export const EXPORT_VERSION = 1;

/**
 * Moves everything stored under the app's former name (Rubik Timer) to the
 * current keys, so the rename loses no data. Call it before anything is
 * read. A value already stored under the new name wins, and with no legacy
 * keys left a second run changes nothing.
 */
export function migrateLegacyStorage(storage: Storage = localStorage): void {
  const legacyKeys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(LEGACY_KEY_PREFIX)) legacyKeys.push(key);
  }
  for (const key of legacyKeys) {
    const value = storage.getItem(key);
    const target = KEY_PREFIX + key.slice(LEGACY_KEY_PREFIX.length);
    // Removed before the copy is written: both together might not fit the quota.
    storage.removeItem(key);
    if (value === null || storage.getItem(target) !== null) continue;
    try {
      storage.setItem(target, value);
    } catch {
      // Writing failed after all; put the value back rather than lose it.
      storage.setItem(key, value);
    }
  }
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  scrambles: Scramble[];
  solves: Solve[];
  /** Absent in files exported before sets existed. */
  sets?: ScrambleSet[];
  /** Absent in files exported before F2L solutions existed. */
  f2lSolutions?: F2LSolution[];
}

export type ImportErrorCode = 'not-json' | 'not-export' | 'version' | 'invalid-data';

/** A rejected import; `code` identifies the reason so the UI can word it. */
export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}

const PENALTIES: readonly Penalty[] = ['none', 'plus2', 'dnf'];

export const EMPTY_DATA: AppData = { scrambles: [], solves: [], sets: [], f2lSolutions: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stored display number, or 0 when missing (data predating stored numbers). */
function parseNumber(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : 0;
}

/** A parsed scramble; `number` is 0 when the data predates stored numbers. */
export function parseScramble(value: unknown): Scramble | null {
  if (!isRecord(value)) return null;
  const { id, scramble, createdAt, number, favorite, title, notes } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof scramble !== 'string' || !isValidScramble(scramble)) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  const result: Scramble = {
    id: normalizeId(id),
    scramble,
    createdAt,
    number: parseNumber(number),
    favorite: favorite === true,
  };
  if (typeof title === 'string' && title.length > 0) result.title = title;
  if (typeof notes === 'string' && notes.length > 0) result.notes = notes;
  return result;
}

export function parseSolve(value: unknown, scrambleIds: ReadonlySet<string>): Solve | null {
  if (!isRecord(value)) return null;
  const { id, scrambleId, timeMs, penalty, inspectionPenalty, createdAt, notes } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof scrambleId !== 'string' || !scrambleIds.has(normalizeId(scrambleId))) return null;
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0) return null;
  if (typeof penalty !== 'string' || !PENALTIES.includes(penalty as Penalty)) return null;
  // Absent for solves timed without inspection (and in older exports).
  if (inspectionPenalty !== undefined && (typeof inspectionPenalty !== 'string' || !PENALTIES.includes(inspectionPenalty as Penalty))) {
    return null;
  }
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  const result: Solve = {
    id: normalizeId(id),
    scrambleId: normalizeId(scrambleId),
    timeMs,
    penalty: penalty as Penalty,
    createdAt,
  };
  if (inspectionPenalty !== undefined) result.inspectionPenalty = inspectionPenalty as Penalty;
  if (typeof notes === 'string' && notes.length > 0) result.notes = notes;
  return result;
}

/**
 * A parsed set. Unknown scramble ids, duplicates and scrambles already
 * claimed by an earlier set are dropped (`claimed` is updated); a set left
 * without scrambles is dropped altogether.
 */
function parseSet(value: unknown, scrambleIds: ReadonlySet<string>, claimed: Set<string>): ScrambleSet | null {
  if (!isRecord(value)) return null;
  const { id, createdAt, number, scrambleIds: members, title, notes } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  if (!Array.isArray(members)) return null;
  const ids: string[] = [];
  for (const raw of members) {
    if (typeof raw !== 'string') continue;
    const member = normalizeId(raw);
    if (!scrambleIds.has(member) || claimed.has(member)) continue;
    claimed.add(member);
    ids.push(member);
  }
  if (ids.length === 0) return null;
  const result: ScrambleSet = { id: normalizeId(id), createdAt, number: parseNumber(number), scrambleIds: ids };
  if (typeof title === 'string' && title.length > 0) result.title = title;
  if (typeof notes === 'string' && notes.length > 0) result.notes = notes;
  return result;
}

const F2L_CASE_IDS = new Set(F2L_CASES.map((c) => c.id));

/** True for a non-empty algorithm of face turns only, as the trainer needs it. */
function isFaceTurnAlgorithm(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => parseFaceMove(token) !== null);
}

export function parseF2LSolution(value: unknown): F2LSolution | null {
  if (!isRecord(value)) return null;
  const { id, caseId, alg, source, note, createdAt } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof caseId !== 'string' || !F2L_CASE_IDS.has(caseId)) return null;
  if (!isFaceTurnAlgorithm(alg)) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  const result: F2LSolution = { id: normalizeId(id), caseId, alg, createdAt };
  if (typeof source === 'string' && source.length > 0) result.source = source;
  if (typeof note === 'string' && note.length > 0) result.note = note;
  return result;
}

/**
 * Numbers items by the order they were made in, which is what their numbers
 * mean, and makes their times distinct (items made in the same millisecond
 * keep the order their stored numbers gave them), so that the order is the
 * same on every device the data syncs to.
 */
function numberByCreation(items: Array<{ createdAt: number; number: number }>): void {
  items.sort((a, b) => a.createdAt - b.createdAt || a.number - b.number);
  let last = -Infinity;
  items.forEach((item, i) => {
    last = Math.max(item.createdAt, last + 1);
    item.createdAt = last;
    item.number = i + 1;
  });
}

function parseData(value: unknown): AppData {
  if (!isRecord(value) || !Array.isArray(value.scrambles) || !Array.isArray(value.solves)) {
    throw new ImportError('invalid-data');
  }
  if (value.sets !== undefined && !Array.isArray(value.sets)) {
    throw new ImportError('invalid-data');
  }
  if (value.f2lSolutions !== undefined && !Array.isArray(value.f2lSolutions)) {
    throw new ImportError('invalid-data');
  }
  const scrambles = value.scrambles
    .map(parseScramble)
    .filter((s): s is Scramble => s !== null);
  numberByCreation(scrambles);
  const ids = new Set(scrambles.map((s) => s.id));
  const solves = value.solves
    .map((s) => parseSolve(s, ids))
    .filter((s): s is Solve => s !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
  const claimed = new Set<string>();
  const sets = (value.sets ?? [])
    .map((s: unknown) => parseSet(s, ids, claimed))
    .filter((s: ScrambleSet | null): s is ScrambleSet => s !== null);
  numberByCreation(sets);
  const f2lSolutions = (value.f2lSolutions ?? [])
    .map(parseF2LSolution)
    .filter((s: F2LSolution | null): s is F2LSolution => s !== null)
    .sort((a: F2LSolution, b: F2LSolution) => a.createdAt - b.createdAt);
  return { scrambles, solves, sets, f2lSolutions };
}

/**
 * The data the app kept in the browser's storage before it had a database, or
 * null when there is none (left). It is read once, to be handed over.
 */
export function loadStoredData(storage: Storage = localStorage): AppData | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const data = parseData(JSON.parse(raw));
    return data.scrambles.length + data.f2lSolutions.length > 0 ? data : null;
  } catch {
    return null;
  }
}

/** Sets the old stored data aside (kept as a backup) once the database has it. */
export function retireStoredData(storage: Storage = localStorage): void {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return;
  storage.removeItem(STORAGE_KEY);
  try {
    storage.setItem(RETIRED_KEY, raw);
  } catch {
    // No room for the backup: the database has the data.
  }
}

/** What a device brings along when it joins the data of another: set aside before the reload, added after it. */
export function stashCarryOver(json: string, storage: Storage = localStorage): void {
  storage.setItem(CARRY_OVER_KEY, json);
}

export function takeCarryOver(storage: Storage = localStorage): string | null {
  const json = storage.getItem(CARRY_OVER_KEY);
  storage.removeItem(CARRY_OVER_KEY);
  return json;
}

export function loadActiveScrambleId(): string | null {
  return localStorage.getItem(ACTIVE_SCRAMBLE_KEY);
}

export function saveActiveScrambleId(id: string | null): void {
  if (id === null) localStorage.removeItem(ACTIVE_SCRAMBLE_KEY);
  else localStorage.setItem(ACTIVE_SCRAMBLE_KEY, id);
}

export function loadActiveSetId(): string | null {
  return localStorage.getItem(ACTIVE_SET_KEY);
}

export function saveActiveSetId(id: string | null): void {
  if (id === null) localStorage.removeItem(ACTIVE_SET_KEY);
  else localStorage.setItem(ACTIVE_SET_KEY, id);
}

/** Whether the scramble list is shown on wide screens; defaults to shown. */
export function loadListOpen(): boolean {
  return localStorage.getItem(LIST_OPEN_KEY) !== 'false';
}

export function saveListOpen(open: boolean): void {
  localStorage.setItem(LIST_OPEN_KEY, String(open));
}

/** The language the user picked, or null if they never switched. */
export function loadLang(): Lang | null {
  const value = localStorage.getItem(LANG_KEY);
  return value === 'en' || value === 'cs' ? value : null;
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang);
}

/** Ids of the cheatsheet algorithms marked as favorite. */
export function loadFavoriteAlgorithms(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAVORITE_ALGS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveFavoriteAlgorithms(ids: readonly string[]): void {
  localStorage.setItem(FAVORITE_ALGS_KEY, JSON.stringify(ids));
}

/** Whether the cheatsheet shows only favorite algorithms. */
export function loadFavoritesOnly(): boolean {
  return localStorage.getItem(FAVORITES_ONLY_KEY) === 'true';
}

export function saveFavoritesOnly(only: boolean): void {
  localStorage.setItem(FAVORITES_ONLY_KEY, String(only));
}

/** Whether solves start with a WCA inspection; defaults to off. */
export function loadInspection(): boolean {
  return localStorage.getItem(INSPECTION_KEY) === 'true';
}

export function saveInspection(on: boolean): void {
  localStorage.setItem(INSPECTION_KEY, String(on));
}

/** A finite number at least `min`, or null. */
function finiteNumber(value: unknown, min = 0): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : null;
}

function parseTaskRecord(value: unknown): TaskRecord | null {
  if (!isRecord(value)) return null;
  const at = finiteNumber(value.at);
  const level = finiteNumber(value.level, 1);
  const accuracy = finiteNumber(value.accuracy);
  const timeMs = finiteNumber(value.timeMs);
  const score = finiteNumber(value.score);
  if (at === null || level === null || accuracy === null || timeMs === null || score === null) return null;
  const record: TaskRecord = { at, level, accuracy, timeMs, score };
  const moves = finiteNumber(value.moves);
  const optimal = finiteNumber(value.optimal);
  if (moves !== null && optimal !== null) {
    record.moves = moves;
    record.optimal = optimal;
  }
  return record;
}

function parseProgress(mode: DryMode, value: unknown): ModeProgress {
  const empty = emptyProgress();
  if (!isRecord(value)) return empty;
  const count = (v: unknown) => Math.floor(finiteNumber(v) ?? 0);
  return {
    level: clampLevel(mode, finiteNumber(value.level, 1) ?? 1),
    points: count(value.points),
    attempts: count(value.attempts),
    correct: count(value.correct),
    streak: count(value.streak),
    bestStreak: count(value.bestStreak),
    recent: Array.isArray(value.recent) ? value.recent.filter((r): r is boolean => typeof r === 'boolean').slice(-5) : [],
    bestScore: finiteNumber(value.bestScore),
    bestTimeMs: finiteNumber(value.bestTimeMs),
    optimalCount: count(value.optimalCount),
    history: Array.isArray(value.history) ? value.history.map(parseTaskRecord).filter((r): r is TaskRecord => r !== null) : [],
  };
}

function parseTimeSetting(value: unknown): TimeSetting {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return 'auto';
}

/**
 * The training progress the app kept in the browser's storage before it had a
 * database, or null when there is none (left). It is read once, to be handed over.
 */
export function loadStoredDryPractice(storage: Storage = localStorage): DryPracticeData | null {
  try {
    const raw = storage.getItem(DRY_PRACTICE_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const modes = isRecord(value.modes) ? value.modes : {};
    const settings = isRecord(value.settings) ? value.settings : {};
    return {
      modes: Object.fromEntries(DRY_MODES.map((mode) => [mode, parseProgress(mode, modes[mode])])) as Record<DryMode, ModeProgress>,
      settings: { memorize: parseTimeSetting(settings.memorize), inspection: parseTimeSetting(settings.inspection) },
    };
  } catch {
    return null;
  }
}

export function retireStoredDryPractice(storage: Storage = localStorage): void {
  storage.removeItem(DRY_PRACTICE_KEY);
}

/** The training time settings: how this device likes to train, so they stay on it. */
export function loadTrainingSettings(): DrySettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TRAINING_SETTINGS_KEY) ?? 'null');
    if (!isRecord(value)) return emptyDryPractice().settings;
    return { memorize: parseTimeSetting(value.memorize), inspection: parseTimeSetting(value.inspection) };
  } catch {
    return emptyDryPractice().settings;
  }
}

export function saveTrainingSettings(settings: DrySettings): void {
  localStorage.setItem(TRAINING_SETTINGS_KEY, JSON.stringify(settings));
}

export function serializeExport(data: AppData): string {
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scrambles: data.scrambles,
    solves: data.solves,
    sets: data.sets,
    f2lSolutions: data.f2lSolutions,
  };
  return JSON.stringify(file, null, 2);
}

/** Parses an exported JSON file. Throws an `ImportError` when invalid. */
export function parseImport(json: string): AppData {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ImportError('not-json');
  }
  if (!isRecord(value) || (value.format !== EXPORT_FORMAT && value.format !== LEGACY_EXPORT_FORMAT)) {
    throw new ImportError('not-export');
  }
  if (value.version !== EXPORT_VERSION) {
    throw new ImportError('version');
  }
  return parseData(value);
}
