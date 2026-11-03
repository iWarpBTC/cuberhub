import type { AppData, Penalty, Scramble, ScrambleSet, Solve } from '../types';
import type { Lang } from '../i18n/lang';
import { isValidScramble } from './cube';

const STORAGE_KEY = 'rubik-timer:data';
const ACTIVE_SCRAMBLE_KEY = 'rubik-timer:active-scramble';
const ACTIVE_SET_KEY = 'rubik-timer:active-set';
const LIST_OPEN_KEY = 'rubik-timer:list-open';
const LANG_KEY = 'rubik-timer:lang';
const FAVORITE_ALGS_KEY = 'rubik-timer:favorite-algorithms';
const FAVORITES_ONLY_KEY = 'rubik-timer:favorite-algorithms-only';
const INSPECTION_KEY = 'rubik-timer:inspection';

export const EXPORT_FORMAT = 'rubik-timer';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  scrambles: Scramble[];
  solves: Solve[];
  /** Absent in files exported before sets existed. */
  sets?: ScrambleSet[];
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

export const EMPTY_DATA: AppData = { scrambles: [], solves: [], sets: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stored display number, or 0 when missing (data predating stored numbers). */
function parseNumber(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : 0;
}

/** A parsed scramble; `number` is 0 when the data predates stored numbers. */
function parseScramble(value: unknown): Scramble | null {
  if (!isRecord(value)) return null;
  const { id, scramble, createdAt, number, favorite, title, notes } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof scramble !== 'string' || !isValidScramble(scramble)) return null;
  if (typeof createdAt !== 'number') return null;
  const result: Scramble = {
    id,
    scramble,
    createdAt,
    number: parseNumber(number),
    favorite: favorite === true,
  };
  if (typeof title === 'string' && title.length > 0) result.title = title;
  if (typeof notes === 'string' && notes.length > 0) result.notes = notes;
  return result;
}

function parseSolve(value: unknown, scrambleIds: ReadonlySet<string>): Solve | null {
  if (!isRecord(value)) return null;
  const { id, scrambleId, timeMs, penalty, inspectionPenalty, createdAt, notes } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof scrambleId !== 'string' || !scrambleIds.has(scrambleId)) return null;
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0) return null;
  if (typeof penalty !== 'string' || !PENALTIES.includes(penalty as Penalty)) return null;
  // Absent for solves timed without inspection (and in older exports).
  if (inspectionPenalty !== undefined && (typeof inspectionPenalty !== 'string' || !PENALTIES.includes(inspectionPenalty as Penalty))) {
    return null;
  }
  if (typeof createdAt !== 'number') return null;
  const result: Solve = {
    id,
    scrambleId,
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
  if (typeof createdAt !== 'number') return null;
  if (!Array.isArray(members)) return null;
  const ids: string[] = [];
  for (const member of members) {
    if (typeof member !== 'string' || !scrambleIds.has(member) || claimed.has(member)) continue;
    claimed.add(member);
    ids.push(member);
  }
  if (ids.length === 0) return null;
  const result: ScrambleSet = { id, createdAt, number: parseNumber(number), scrambleIds: ids };
  if (typeof title === 'string' && title.length > 0) result.title = title;
  if (typeof notes === 'string' && notes.length > 0) result.notes = notes;
  return result;
}

/**
 * Numbers items saved before numbers were stored, continuing after the
 * highest number in use. For such data this matches the numbers shown before,
 * which were positions in creation order.
 */
function assignMissingNumbers(items: Array<{ number: number }>): void {
  let next = items.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  for (const item of items) {
    if (item.number === 0) item.number = next++;
  }
}

function parseData(value: unknown): AppData {
  if (!isRecord(value) || !Array.isArray(value.scrambles) || !Array.isArray(value.solves)) {
    throw new ImportError('invalid-data');
  }
  if (value.sets !== undefined && !Array.isArray(value.sets)) {
    throw new ImportError('invalid-data');
  }
  const scrambles = value.scrambles
    .map(parseScramble)
    .filter((s): s is Scramble => s !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
  assignMissingNumbers(scrambles);
  const ids = new Set(scrambles.map((s) => s.id));
  const solves = value.solves
    .map((s) => parseSolve(s, ids))
    .filter((s): s is Solve => s !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
  const claimed = new Set<string>();
  const sets = (value.sets ?? [])
    .map((s: unknown) => parseSet(s, ids, claimed))
    .filter((s: ScrambleSet | null): s is ScrambleSet => s !== null)
    .sort((a: ScrambleSet, b: ScrambleSet) => a.createdAt - b.createdAt);
  assignMissingNumbers(sets);
  return { scrambles, solves, sets };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY_DATA;
    return parseData(JSON.parse(raw));
  } catch {
    return EMPTY_DATA;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

export function serializeExport(data: AppData): string {
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scrambles: data.scrambles,
    solves: data.solves,
    sets: data.sets,
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
  if (!isRecord(value) || value.format !== EXPORT_FORMAT) {
    throw new ImportError('not-export');
  }
  if (value.version !== EXPORT_VERSION) {
    throw new ImportError('version');
  }
  return parseData(value);
}
