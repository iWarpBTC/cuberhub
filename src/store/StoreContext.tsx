import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { AppData, NewScramble, NewScrambleSet, Scramble, ScrambleSet, Solve } from '../types';
import { newId } from '../lib/id';
import { createScrambles } from '../lib/scramble';
import {
  loadActiveScrambleId,
  loadActiveSetId,
  loadData,
  saveActiveScrambleId,
  saveActiveSetId,
  saveData,
} from '../lib/storage';

export interface StoreState {
  scrambles: Scramble[];
  solves: Solve[];
  sets: ScrambleSet[];
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
  | { type: 'IMPORT_DATA'; data: AppData };

/** The action that creates a new set of `size` freshly generated scrambles. */
export function addSetAction(size: number): Action {
  return {
    type: 'ADD_SET',
    set: { id: newId(), createdAt: Date.now(), scrambleIds: [] },
    scrambleIds: [],
    newScrambles: createScrambles(size),
  };
}

function nextNumber(items: ReadonlyArray<{ number: number }>): number {
  return items.reduce((max, s) => Math.max(max, s.number), 0) + 1;
}

function numberScrambles(existing: Scramble[], added: NewScramble[]): Scramble[] {
  let next = nextNumber(existing);
  return added.map((s) => ({ ...s, number: next++ }));
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

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'ADD_SCRAMBLE': {
      const [scramble] = numberScrambles(state.scrambles, [action.scramble]);
      const sets =
        action.setId === undefined
          ? state.sets
          : state.sets.map((set) =>
              set.id === action.setId ? { ...set, scrambleIds: [...set.scrambleIds, scramble!.id] } : set,
            );
      return selectScramble({ ...state, scrambles: [...state.scrambles, scramble!], sets }, scramble!.id);
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
      const created = numberScrambles(state.scrambles, action.newScrambles);
      const scrambleIds = [...moved, ...created.map((s) => s.id)];
      if (scrambleIds.length === 0) return state;
      const set: ScrambleSet = { ...action.set, scrambleIds, number: nextNumber(state.sets) };
      return selectScramble(
        {
          ...state,
          scrambles: [...state.scrambles, ...created],
          sets: [...withoutScrambles(state.sets, new Set(moved)), set],
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
    case 'IMPORT_DATA':
      return {
        scrambles: action.data.scrambles,
        solves: action.data.solves,
        sets: action.data.sets,
        activeScrambleId: action.data.scrambles.at(-1)?.id ?? null,
        activeSetId: null,
        selectedSolveId: null,
      };
  }
}

function initialState(): StoreState {
  const data = loadData();
  const storedScramble = loadActiveScrambleId();
  const storedSet = loadActiveSetId();
  if (storedScramble !== null && data.scrambles.some((s) => s.id === storedScramble)) {
    return { ...data, activeScrambleId: storedScramble, activeSetId: null, selectedSolveId: null };
  }
  if (storedSet !== null && data.sets.some((s) => s.id === storedSet)) {
    return { ...data, activeScrambleId: null, activeSetId: storedSet, selectedSolveId: null };
  }
  return { ...data, activeScrambleId: data.scrambles.at(-1)?.id ?? null, activeSetId: null, selectedSolveId: null };
}

const StateContext = createContext<StoreState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    saveData({ scrambles: state.scrambles, solves: state.solves, sets: state.sets });
  }, [state.scrambles, state.solves, state.sets]);

  useEffect(() => {
    saveActiveScrambleId(state.activeScrambleId);
    saveActiveSetId(state.activeScrambleId === null ? state.activeSetId : null);
  }, [state.activeScrambleId, state.activeSetId]);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useStore(): StoreState {
  const state = useContext(StateContext);
  if (state === null) throw new Error('useStore must be used inside StoreProvider');
  return state;
}

export function useDispatch(): Dispatch<Action> {
  const dispatch = useContext(DispatchContext);
  if (dispatch === null) throw new Error('useDispatch must be used inside StoreProvider');
  return dispatch;
}

export function useActiveScramble(): Scramble | null {
  const { scrambles, activeScrambleId } = useStore();
  return useMemo(
    () => scrambles.find((s) => s.id === activeScrambleId) ?? null,
    [scrambles, activeScrambleId],
  );
}

/** The set shown in the main panel (only while no scramble is active). */
export function useActiveSet(): ScrambleSet | null {
  const { sets, activeScrambleId, activeSetId } = useStore();
  return useMemo(
    () => (activeScrambleId !== null ? null : (sets.find((s) => s.id === activeSetId) ?? null)),
    [sets, activeScrambleId, activeSetId],
  );
}

/** The set a scramble belongs to, if any. */
export function useSetOf(scrambleId: string | null): ScrambleSet | null {
  const { sets } = useStore();
  return useMemo(
    () => (scrambleId === null ? null : (sets.find((s) => s.scrambleIds.includes(scrambleId)) ?? null)),
    [sets, scrambleId],
  );
}

/** Solves for one scramble, oldest first. */
export function useSolvesFor(scrambleId: string | null): Solve[] {
  const { solves } = useStore();
  return useMemo(
    () => (scrambleId === null ? [] : solves.filter((s) => s.scrambleId === scrambleId)),
    [solves, scrambleId],
  );
}

/** Solves of each scramble of a set, oldest first, in the set's scramble order. */
export function useSolvesPerScramble(set: ScrambleSet | null): Solve[][] {
  const { solves } = useStore();
  return useMemo(() => {
    if (set === null) return [];
    const byScramble = new Map<string, Solve[]>(set.scrambleIds.map((id) => [id, []]));
    for (const solve of solves) byScramble.get(solve.scrambleId)?.push(solve);
    return set.scrambleIds.map((id) => byScramble.get(id)!);
  }, [solves, set]);
}
