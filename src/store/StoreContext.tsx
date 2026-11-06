import { createContext, use, useContext, useMemo, useSyncExternalStore, type Dispatch, type ReactNode } from 'react';
import type { DryPracticeData } from '../lib/dryPractice';
import type { Scramble, ScrambleSet, Solve } from '../types';
import { stores, type Stores } from './boot';
import type { Action, StoreState } from './reducer';

export { addSetAction, type Action, type StoreState } from './reducer';

const StoresContext = createContext<Stores | null>(null);

/**
 * Gives the app its stores once the database has opened; until then it
 * suspends, so it needs a `Suspense` above it.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoresContext.Provider value={use(stores)}>{children}</StoresContext.Provider>;
}

/** The database and the stores over it, for the few places that need more than the data. */
export function useStores(): Stores {
  const value = useContext(StoresContext);
  if (value === null) throw new Error('useStores must be used inside StoreProvider');
  return value;
}

export function useStore(): StoreState {
  const { store } = useStores();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useDispatch(): Dispatch<Action> {
  return useStores().store.dispatch;
}

/** The training progress and settings. */
export function useTraining(): DryPracticeData {
  const { training } = useStores();
  return useSyncExternalStore(training.subscribe, training.getState);
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
