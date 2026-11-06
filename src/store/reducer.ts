import type { AppData, F2LSolution, NewScramble, NewScrambleSet, Scramble, ScrambleSet, Solve } from '../types';
import { newId } from '../lib/id';
import { createScrambles } from '../lib/scramble';
import { dataToRows, keepIdentity, rowsToData, type Numbering, type Snapshot } from '../sync/rows';

export interface StoreState extends AppData {
  /** What new scrambles and sets continue from; see {@link Numbering}. */
  numbering: Snapshot['numbering'];
  /** The scramble shown in the main panel; null when a set (or nothing) is shown. */
  activeScrambleId: string | null;
  /** The set shown in the main panel; only meaningful while no scramble is active. */
  activeSetId: string | null;
  selectedSolveId: string | null;
}

export type Action =
  | { type: 'ADD_SCRAMBLE'; scramble: NewScramble; setId?: string }
  | { type: 'SELECT_SCRAMBLE'; id: string }
  | { type: 'UPDATE_SCRAMBLE'; id: string; patch: Partial<Pick<Scramble, 'title' | 'favorite' | 'notes'>> }
  | { type: 'DELETE_SCRAMBLE'; id: string }
  | {
      /** Creates a set from existing scrambles (moved out of any other set) followed by newly generated ones. */
      type: 'ADD_SET';
      set: NewScrambleSet;
      scrambleIds: string[];
      newScrambles: NewScramble[];
    }
  | { type: 'ADD_TO_SET'; id: string; scrambleIds: string[] }
  | { type: 'REMOVE_FROM_SET'; scrambleId: string }
  | { type: 'SELECT_SET'; id: string }
  | { type: 'UPDATE_SET'; id: string; patch: Partial<Pick<ScrambleSet, 'title' | 'notes'>> }
  | { type: 'DELETE_SET'; id: string; deleteScrambles: boolean }
  | { type: 'ADD_SOLVE'; solve: Solve }
  | { type: 'UPDATE_SOLVE'; id: string; patch: Partial<Pick<Solve, 'penalty' | 'inspectionPenalty' | 'notes'>> }
  | { type: 'DELETE_SOLVE'; id: string }
  | { type: 'SELECT_SOLVE'; id: string | null }
  | { type: 'ADD_F2L_SOLUTION'; solution: F2LSolution }
  | { type: 'DELETE_F2L_SOLUTION'; id: string }
  /** Replaces everything with the data of an imported file. */
  | { type: 'IMPORT_DATA'; data: AppData }
  /** Adds what `data` has and the store lacks; what the store has stays as it is. */
  | { type: 'MERGE_DATA'; data: AppData }
  /** The database as it now is: after a write made here, or with changes from another device. */
  | { type: 'SYNC'; snapshot: Snapshot };

/** The action that creates a new set of `size` freshly generated scrambles. */
export function addSetAction(size: number): Action {
  return {
    type: 'ADD_SET',
    set: { id: newId(), createdAt: Date.now(), scrambleIds: [] },
    scrambleIds: [],
    newScrambles: createScrambles(size),
  };
}

/**
 * Gives new items their place after everything made so far: the next numbers,
 * and times that are later than the last one's (two made in the same
 * millisecond, or on a device whose clock runs behind, still get an order).
 */
function place<T extends { createdAt: number }>(numbering: Numbering, items: readonly T[]): { placed: Array<T & { number: number }>; numbering: Numbering } {
  let { count, lastAt } = numbering;
  const placed = items.map((item) => {
    lastAt = Math.max(item.createdAt, lastAt + 1);
    count++;
    return { ...item, createdAt: lastAt, number: count };
  });
  return { placed, numbering: { count, lastAt } };
}

/** Takes the scrambles out of every set; sets left empty disappear. */
function withoutScrambles(sets: ScrambleSet[], ids: ReadonlySet<string>): ScrambleSet[] {
  return sets
    .map((set) => {
      const scrambleIds = set.scrambleIds.filter((id) => !ids.has(id));
      return scrambleIds.length === set.scrambleIds.length ? set : { ...set, scrambleIds };
    })
    .filter((set) => set.scrambleIds.length > 0);
}

function selectScramble(state: StoreState, id: string | null): StoreState {
  return { ...state, activeScrambleId: id, activeSetId: null, selectedSolveId: null };
}

/** `data` numbered and tidied the way the database would return it. */
function settled(data: AppData): Snapshot {
  return rowsToData(dataToRows(data));
}

function mergeById<T extends { id: string }>(current: T[], incoming: readonly T[]): T[] {
  const known = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => !known.has(item.id));
  return added.length === 0 ? current : [...current, ...added];
}

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'ADD_SCRAMBLE': {
      const { placed, numbering } = place(state.numbering.scrambles, [action.scramble]);
      const scramble = placed[0]!;
      const sets =
        action.setId === undefined
          ? state.sets
          : state.sets.map((set) => (set.id === action.setId ? { ...set, scrambleIds: [...set.scrambleIds, scramble.id] } : set));
      return selectScramble(
        { ...state, scrambles: [...state.scrambles, scramble], sets, numbering: { ...state.numbering, scrambles: numbering } },
        scramble.id,
      );
    }
    case 'SELECT_SCRAMBLE':
      return selectScramble(state, action.id);
    case 'UPDATE_SCRAMBLE':
      return {
        ...state,
        scrambles: state.scrambles.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'DELETE_SCRAMBLE': {
      const sets = withoutScrambles(state.sets, new Set([action.id]));
      return {
        ...state,
        scrambles: state.scrambles.filter((s) => s.id !== action.id),
        solves: state.solves.filter((s) => s.scrambleId !== action.id),
        sets,
        activeScrambleId: state.activeScrambleId === action.id ? null : state.activeScrambleId,
        activeSetId: sets.some((s) => s.id === state.activeSetId) ? state.activeSetId : null,
        selectedSolveId: null,
      };
    }
    case 'ADD_SET': {
      const known = new Set(state.scrambles.map((s) => s.id));
      const moved = action.scrambleIds.filter((id, i, all) => known.has(id) && all.indexOf(id) === i);
      const created = place(state.numbering.scrambles, action.newScrambles);
      const scrambleIds = [...moved, ...created.placed.map((s) => s.id)];
      if (scrambleIds.length === 0) return state;
      const made = place(state.numbering.sets, [{ ...action.set, scrambleIds }]);
      return selectScramble(
        {
          ...state,
          scrambles: [...state.scrambles, ...created.placed],
          sets: [...withoutScrambles(state.sets, new Set(moved)), made.placed[0]!],
          numbering: { scrambles: created.numbering, sets: made.numbering },
        },
        scrambleIds[0]!,
      );
    }
    case 'ADD_TO_SET': {
      const target = state.sets.find((s) => s.id === action.id);
      if (target === undefined) return state;
      const known = new Set(state.scrambles.map((s) => s.id));
      const moved = action.scrambleIds.filter(
        (id, i, all) => known.has(id) && !target.scrambleIds.includes(id) && all.indexOf(id) === i,
      );
      if (moved.length === 0) return state;
      const sets = withoutScrambles(state.sets, new Set(moved)).map((set) =>
        set.id === action.id ? { ...set, scrambleIds: [...set.scrambleIds, ...moved] } : set,
      );
      return { ...state, sets };
    }
    case 'REMOVE_FROM_SET': {
      const sets = withoutScrambles(state.sets, new Set([action.scrambleId]));
      return {
        ...state,
        sets,
        activeSetId: sets.some((s) => s.id === state.activeSetId) ? state.activeSetId : null,
      };
    }
    case 'SELECT_SET':
      return { ...state, activeScrambleId: null, activeSetId: action.id, selectedSolveId: null };
    case 'UPDATE_SET':
      return {
        ...state,
        sets: state.sets.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'DELETE_SET': {
      const set = state.sets.find((s) => s.id === action.id);
      if (set === undefined) return state;
      const gone = new Set(action.deleteScrambles ? set.scrambleIds : []);
      return {
        ...state,
        scrambles: state.scrambles.filter((s) => !gone.has(s.id)),
        solves: state.solves.filter((s) => !gone.has(s.scrambleId)),
        sets: state.sets.filter((s) => s.id !== action.id),
        // A dissolved set that was being shown hands over to its first scramble.
        activeScrambleId:
          state.activeScrambleId !== null && gone.has(state.activeScrambleId)
            ? null
            : state.activeScrambleId === null && state.activeSetId === action.id && !action.deleteScrambles
              ? (set.scrambleIds[0] ?? null)
              : state.activeScrambleId,
        activeSetId: state.activeSetId === action.id ? null : state.activeSetId,
        selectedSolveId: null,
      };
    }
    case 'ADD_SOLVE':
      return { ...state, solves: [...state.solves, action.solve], selectedSolveId: action.solve.id };
    case 'UPDATE_SOLVE':
      return {
        ...state,
        solves: state.solves.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'DELETE_SOLVE':
      return {
        ...state,
        solves: state.solves.filter((s) => s.id !== action.id),
        selectedSolveId: state.selectedSolveId === action.id ? null : state.selectedSolveId,
      };
    case 'SELECT_SOLVE':
      return { ...state, selectedSolveId: action.id };
    case 'ADD_F2L_SOLUTION':
      return { ...state, f2lSolutions: [...state.f2lSolutions, action.solution] };
    case 'DELETE_F2L_SOLUTION':
      return { ...state, f2lSolutions: state.f2lSolutions.filter((s) => s.id !== action.id) };
    case 'IMPORT_DATA': {
      // Numbered here among themselves; the database then places them among everything ever made.
      const { data, numbering } = settled(action.data);
      return {
        ...data,
        numbering: {
          scrambles: { count: state.numbering.scrambles.count + numbering.scrambles.count, lastAt: Math.max(state.numbering.scrambles.lastAt, numbering.scrambles.lastAt) },
          sets: { count: state.numbering.sets.count + numbering.sets.count, lastAt: Math.max(state.numbering.sets.lastAt, numbering.sets.lastAt) },
        },
        activeScrambleId: data.scrambles.at(-1)?.id ?? null,
        activeSetId: null,
        selectedSolveId: null,
      };
    }
    case 'MERGE_DATA': {
      const merged: AppData = {
        scrambles: mergeById(state.scrambles, action.data.scrambles),
        solves: mergeById(state.solves, action.data.solves),
        sets: mergeById(state.sets, action.data.sets),
        f2lSolutions: mergeById(state.f2lSolutions, action.data.f2lSolutions),
      };
      const { data, numbering } = settled(merged);
      return reducer(state, {
        type: 'SYNC',
        snapshot: {
          data,
          numbering: {
            scrambles: { count: Math.max(state.numbering.scrambles.count, numbering.scrambles.count), lastAt: Math.max(state.numbering.scrambles.lastAt, numbering.scrambles.lastAt) },
            sets: { count: Math.max(state.numbering.sets.count, numbering.sets.count), lastAt: Math.max(state.numbering.sets.lastAt, numbering.sets.lastAt) },
          },
        },
      });
    }
    case 'SYNC': {
      const data = keepIdentity(state, action.snapshot.data);
      const { numbering } = action.snapshot;
      const sameNumbering =
        numbering.scrambles.count === state.numbering.scrambles.count &&
        numbering.scrambles.lastAt === state.numbering.scrambles.lastAt &&
        numbering.sets.count === state.numbering.sets.count &&
        numbering.sets.lastAt === state.numbering.sets.lastAt;
      if (data === state && sameNumbering) return state;
      const hasScramble = (id: string | null) => id !== null && data.scrambles.some((s) => s.id === id);
      // With nothing here before (a device that just joined), open the newest scramble that arrived.
      const activeScrambleId = hasScramble(state.activeScrambleId)
        ? state.activeScrambleId
        : state.scrambles.length === 0 && state.activeSetId === null
          ? (data.scrambles.at(-1)?.id ?? null)
          : null;
      return {
        ...state,
        scrambles: data.scrambles,
        solves: data.solves,
        sets: data.sets,
        f2lSolutions: data.f2lSolutions,
        numbering: sameNumbering ? state.numbering : numbering,
        activeScrambleId,
        activeSetId: activeScrambleId === null && data.sets.some((s) => s.id === state.activeSetId) ? state.activeSetId : null,
        selectedSolveId: data.solves.some((s) => s.id === state.selectedSolveId) ? state.selectedSolveId : null,
      };
    }
  }
}

/** The state the app starts with: the database's data, showing what was shown last time if it is still there. */
export function initialState(snapshot: Snapshot, storedScramble: string | null, storedSet: string | null): StoreState {
  const { data, numbering } = snapshot;
  const base = { ...data, numbering, selectedSolveId: null };
  if (storedScramble !== null && data.scrambles.some((s) => s.id === storedScramble)) {
    return { ...base, activeScrambleId: storedScramble, activeSetId: null };
  }
  if (storedSet !== null && data.sets.some((s) => s.id === storedSet)) {
    return { ...base, activeScrambleId: null, activeSetId: storedSet };
  }
  return { ...base, activeScrambleId: data.scrambles.at(-1)?.id ?? null, activeSetId: null };
}

/** True when an action changed the stored data (and not only what is selected). */
export function dataChanged(prev: StoreState, next: StoreState): boolean {
  return prev.scrambles !== next.scrambles || prev.solves !== next.solves || prev.sets !== next.sets || prev.f2lSolutions !== next.f2lSolutions;
}
