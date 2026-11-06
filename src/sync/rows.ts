/**
 * The app's data as rows of the synced database, and back. Everything here is
 * plain data in, plain data out: the database itself is in `db.ts`.
 *
 * A row holds only what the user made. What follows from the rows is worked
 * out when they are read, because two devices can each add rows while
 * offline and nothing stored could stay right on both:
 *
 * - The number in "Scramble #n" is the scramble's place among all scrambles
 *   ever made, in the order they were made. Deleted rows stay in the database
 *   (marked deleted) and keep their place, so deleting never renumbers.
 * - A set lists its scrambles; a scramble two sets list belongs to the older
 *   set, and a set left with no scrambles is not shown.
 */
import { parseF2LSolution, parseScramble, parseSolve } from '../lib/storage';
import type { AppData, F2LSolution, Scramble, ScrambleSet, Solve } from '../types';

export type Value = string | number | null;

export interface Row {
  readonly id: string;
  /** Marked deleted: kept in the database so the deletion reaches other devices. */
  readonly deleted: boolean;
  readonly values: Readonly<Record<string, Value>>;
}

export const DATA_TABLES = ['scramble', 'scrambleSet', 'solve', 'f2lSolution'] as const;
export type DataTable = (typeof DATA_TABLES)[number];
export type Rows = Readonly<Record<DataTable, readonly Row[]>>;

export const EMPTY_ROWS: Rows = { scramble: [], scrambleSet: [], solve: [], f2lSolution: [] };

/** How many scrambles (or sets) were ever made and when the last one was: what a new one continues from. */
export interface Numbering {
  count: number;
  lastAt: number;
}

export interface Snapshot {
  data: AppData;
  numbering: { scrambles: Numbering; sets: Numbering };
}

const text = (value: Value | undefined): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const time = (row: Row): number | null => {
  const at = row.values.madeAt;
  return typeof at === 'number' && Number.isFinite(at) ? at : null;
};

interface Timed {
  row: Row;
  at: number;
}

/** The rows that have their time, in the order they were made; ids break ties the same way everywhere. */
function inOrder(rows: readonly Row[]): Timed[] {
  const timed: Timed[] = [];
  for (const row of rows) {
    const at = time(row);
    if (at !== null) timed.push({ row, at });
  }
  return timed.sort((a, b) => a.at - b.at || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
}

function numbering(ordered: readonly Timed[]): Numbering {
  return { count: ordered.length, lastAt: ordered.at(-1)?.at ?? 0 };
}

function memberIds(value: Value | undefined): string[] {
  if (typeof value !== 'string') return [];
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** What the rows say, as the app shows it. Rows that are deleted, incomplete or invalid are left out. */
export function rowsToData(rows: Rows): Snapshot {
  const scrambleOrder = inOrder(rows.scramble);
  const scrambles: Scramble[] = [];
  scrambleOrder.forEach(({ row, at }, index) => {
    if (row.deleted) return;
    const { moves, favorite, title, notes } = row.values;
    const scramble = parseScramble({ id: row.id, scramble: moves, createdAt: at, number: index + 1, favorite: favorite === 1, title, notes });
    if (scramble !== null) scrambles.push(scramble);
  });
  const scrambleIds = new Set(scrambles.map((s) => s.id));

  const setOrder = inOrder(rows.scrambleSet);
  const sets: ScrambleSet[] = [];
  const claimed = new Set<string>();
  setOrder.forEach(({ row, at }, index) => {
    if (row.deleted) return;
    const members: string[] = [];
    for (const id of memberIds(row.values.members)) {
      if (!scrambleIds.has(id) || claimed.has(id)) continue;
      claimed.add(id);
      members.push(id);
    }
    if (members.length === 0) return;
    const set: ScrambleSet = { id: row.id, createdAt: at, number: index + 1, scrambleIds: members };
    const title = text(row.values.title);
    const notes = text(row.values.notes);
    if (title !== undefined) set.title = title;
    if (notes !== undefined) set.notes = notes;
    sets.push(set);
  });

  const solves: Solve[] = [];
  for (const { row, at } of inOrder(rows.solve)) {
    if (row.deleted) continue;
    const { scrambleId, timeMs, penalty, inspectionPenalty, notes } = row.values;
    const solve = parseSolve(
      { id: row.id, scrambleId, timeMs, penalty: penalty ?? 'none', inspectionPenalty: inspectionPenalty ?? undefined, createdAt: at, notes },
      scrambleIds,
    );
    if (solve !== null) solves.push(solve);
  }

  const f2lSolutions: F2LSolution[] = [];
  for (const { row, at } of inOrder(rows.f2lSolution)) {
    if (row.deleted) continue;
    const { caseId, alg, source, note } = row.values;
    const solution = parseF2LSolution({ id: row.id, caseId, alg, source, note, createdAt: at });
    if (solution !== null) f2lSolutions.push(solution);
  }

  return {
    data: { scrambles, solves, sets, f2lSolutions },
    numbering: { scrambles: numbering(scrambleOrder), sets: numbering(setOrder) },
  };
}

const live = (id: string, values: Record<string, Value>): Row => ({ id, deleted: false, values });

export function scrambleRow(s: Scramble): Row {
  // Not a favorite is no value at all rather than a stored "no".
  return live(s.id, { moves: s.scramble, madeAt: s.createdAt, favorite: s.favorite ? 1 : null, title: s.title ?? null, notes: s.notes ?? null });
}

export function setRow(s: ScrambleSet): Row {
  return live(s.id, { members: JSON.stringify(s.scrambleIds), madeAt: s.createdAt, title: s.title ?? null, notes: s.notes ?? null });
}

export function solveRow(s: Solve): Row {
  return live(s.id, {
    scrambleId: s.scrambleId,
    timeMs: s.timeMs,
    madeAt: s.createdAt,
    penalty: s.penalty === 'none' ? null : s.penalty,
    inspectionPenalty: s.inspectionPenalty ?? null,
    notes: s.notes ?? null,
  });
}

export function f2lSolutionRow(s: F2LSolution): Row {
  return live(s.id, { caseId: s.caseId, alg: s.alg, madeAt: s.createdAt, source: s.source ?? null, note: s.note ?? null });
}

/** One write to the database. */
export type Change =
  /** A row that was not there: all its columns. */
  | { kind: 'put'; table: DataTable; id: string; values: Readonly<Record<string, Value>> }
  /** The columns of a row that changed. */
  | { kind: 'patch'; table: DataTable; id: string; values: Readonly<Record<string, Value>> }
  | { kind: 'remove'; table: DataTable; id: string };

function diffTable<T extends { id: string }>(table: DataTable, prev: readonly T[], next: readonly T[], toRow: (item: T) => Row, out: Change[]): void {
  if (prev === next) return;
  const before = new Map(prev.map((item) => [item.id, item]));
  for (const item of next) {
    const old = before.get(item.id);
    before.delete(item.id);
    if (old === item) continue;
    const row = toRow(item);
    if (old === undefined) {
      out.push({ kind: 'put', table, id: item.id, values: row.values });
      continue;
    }
    const oldValues = toRow(old).values;
    const changed: Record<string, Value> = {};
    for (const [column, value] of Object.entries(row.values)) {
      if (oldValues[column] !== value) changed[column] = value;
    }
    if (Object.keys(changed).length > 0) out.push({ kind: 'patch', table, id: item.id, values: changed });
  }
  for (const id of before.keys()) out.push({ kind: 'remove', table, id });
}

/** The writes that turn the stored `prev` into `next`: whole rows for what is new, single columns for what changed. */
export function diffData(prev: AppData, next: AppData): Change[] {
  const changes: Change[] = [];
  diffTable('scramble', prev.scrambles, next.scrambles, scrambleRow, changes);
  diffTable('scrambleSet', prev.sets, next.sets, setRow, changes);
  diffTable('solve', prev.solves, next.solves, solveRow, changes);
  diffTable('f2lSolution', prev.f2lSolutions, next.f2lSolutions, f2lSolutionRow, changes);
  return changes;
}

export function dataToRows(data: AppData): Rows {
  return {
    scramble: data.scrambles.map(scrambleRow),
    scrambleSet: data.sets.map(setRow),
    solve: data.solves.map(solveRow),
    f2lSolution: data.f2lSolutions.map(f2lSolutionRow),
  };
}

function sameItem(a: object, b: object): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const x = (a as Record<string, unknown>)[key];
    const y = (b as Record<string, unknown>)[key];
    return Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every((v, i) => v === y[i]) : x === y;
  });
}

function keep<T extends { id: string }>(current: readonly T[], incoming: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  let same = current.length === incoming.length;
  const result = incoming.map((item, i) => {
    const old = byId.get(item.id);
    const kept = old !== undefined && sameItem(old, item) ? old : item;
    if (kept !== current[i]) same = false;
    return kept;
  });
  return same ? (current as T[]) : result;
}

/**
 * `incoming` with every item (and every list) that equals the one in
 * `current` replaced by it, so that reading the database back after a write
 * changes nothing the app is showing.
 */
export function keepIdentity(current: AppData, incoming: AppData): AppData {
  const scrambles = keep(current.scrambles, incoming.scrambles);
  const solves = keep(current.solves, incoming.solves);
  const sets = keep(current.sets, incoming.sets);
  const f2lSolutions = keep(current.f2lSolutions, incoming.f2lSolutions);
  return scrambles === current.scrambles && solves === current.solves && sets === current.sets && f2lSolutions === current.f2lSolutions
    ? current
    : { scrambles, solves, sets, f2lSolutions };
}
