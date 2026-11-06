import {
  DRY_MODES,
  eventTime,
  recordResult,
  replay,
  toRecord,
  type DryEvent,
  type DryMode,
  type DryPracticeData,
  type DrySettings,
  type Outcome,
  type TaskRecord,
  type TaskResult,
} from '../lib/dryPractice';
import { newId } from '../lib/id';
import { loadTrainingSettings, saveTrainingSettings } from '../lib/storage';
import type { Db, Write } from '../sync/db';
import type { Row, Value } from '../sync/rows';

/** The training progress: worked out from every answered task, wherever it was answered. */
export interface TrainingStore {
  getState(): DryPracticeData;
  subscribe(listener: () => void): () => void;
  /** Scores a result and remembers it. */
  record(result: TaskResult, limitMs: number | null): Outcome;
  setLevel(mode: DryMode, level: number): void;
  setSettings(patch: Partial<DrySettings>): void;
  /** Everything remembered, as it is stored. */
  events(): DryEvent[];
  /** Remembers events made elsewhere (by an earlier version of the app, or under another key). */
  add(events: readonly DryEvent[]): void;
}

const number = (value: Value | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const mode = (value: Value | undefined): DryMode | null => DRY_MODES.find((m) => m === value) ?? null;

function attemptOf(row: Row): DryEvent | null {
  const { level, accuracy, timeMs, score, moves, optimal } = row.values;
  const m = mode(row.values.mode);
  const at = number(row.values.madeAt);
  const [l, a, t, s] = [number(level), number(accuracy), number(timeMs), number(score)];
  if (row.deleted || m === null || at === null || l === null || a === null || t === null || s === null) return null;
  const record: TaskRecord = { at, level: l, accuracy: a, timeMs: t, score: s };
  const [mv, opt] = [number(moves), number(optimal)];
  if (mv !== null && opt !== null) {
    record.moves = mv;
    record.optimal = opt;
  }
  return { kind: 'attempt', id: row.id, mode: m, record };
}

function levelOf(row: Row): DryEvent | null {
  const m = mode(row.values.mode);
  const at = number(row.values.madeAt);
  const level = number(row.values.level);
  if (row.deleted || m === null || at === null || level === null) return null;
  return { kind: 'level', id: row.id, mode: m, at, level };
}

function writeOf(event: DryEvent): Write {
  return event.kind === 'attempt'
    ? {
        kind: 'put',
        table: 'trainingAttempt',
        id: event.id,
        values: {
          mode: event.mode,
          madeAt: event.record.at,
          level: event.record.level,
          accuracy: event.record.accuracy,
          timeMs: event.record.timeMs,
          score: event.record.score,
          moves: event.record.moves ?? null,
          optimal: event.record.optimal ?? null,
        },
      }
    : { kind: 'put', table: 'trainingLevel', id: event.id, values: { mode: event.mode, madeAt: event.at, level: event.level } };
}

export function createTrainingStore(db: Db): TrainingStore {
  let settings = loadTrainingSettings();
  /** Events made here that the database has not shown yet. */
  const fresh = new Map<string, DryEvent>();
  let attemptRows: readonly Row[] | null = null;
  let levelRows: readonly Row[] | null = null;
  let stored: DryEvent[] = [];
  let all: DryEvent[] = [];
  let state: DryPracticeData = { modes: replay([]), settings };
  const listeners = new Set<() => void>();

  /** Reads the database's rows if they changed; true when there is something new to show. */
  const read = (): boolean => {
    const rows = db.read();
    if (rows.trainingAttempt === attemptRows && rows.trainingLevel === levelRows) return false;
    attemptRows = rows.trainingAttempt;
    levelRows = rows.trainingLevel;
    stored = [...attemptRows.map(attemptOf), ...levelRows.map(levelOf)].filter((event) => event !== null);
    for (const event of stored) fresh.delete(event.id);
    return true;
  };

  const settle = () => {
    all = [...stored, ...fresh.values()];
    state = { modes: replay(all), settings };
    for (const listener of listeners) listener();
  };

  /** A time after every event so far, so that what happens now is replayed last. */
  const now = (at: number) => all.reduce((latest, event) => Math.max(latest, eventTime(event) + 1), at);

  const remember = (events: readonly DryEvent[]) => {
    for (const event of events) fresh.set(event.id, event);
    db.write(events.map(writeOf));
    settle();
  };

  read();
  settle();
  db.subscribe(() => {
    if (read()) settle();
  });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    record(result, limitMs) {
      const timed = { ...result, at: now(result.at) };
      const outcome = recordResult(state.modes[result.mode], timed, limitMs);
      remember([{ kind: 'attempt', id: newId(), mode: result.mode, record: toRecord(timed, outcome.score.total) }]);
      return outcome;
    },
    setLevel(mode, level) {
      remember([{ kind: 'level', id: newId(), mode, at: now(Date.now()), level }]);
    },
    setSettings(patch) {
      settings = { ...settings, ...patch };
      saveTrainingSettings(settings);
      state = { ...state, settings };
      for (const listener of listeners) listener();
    },
    events: () => all,
    add(events) {
      const known = new Set(all.map((event) => event.id));
      const added = events.filter((event) => !known.has(event.id));
      if (added.length > 0) remember(added);
    },
  };
}
