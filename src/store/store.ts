import { reducer, type Action, type StoreState } from './reducer';

type Watcher = (prev: StoreState, next: StoreState, action: Action) => void;

/** The app's state outside React: components subscribe to it, and the database follows every change made to it. */
export interface Store {
  getState(): StoreState;
  subscribe(listener: () => void): () => void;
  dispatch(action: Action): void;
  /** Calls `watcher` with every change, before the components hear of it. */
  watch(watcher: Watcher): void;
}

export function createStore(initial: StoreState): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  const watchers: Watcher[] = [];
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      const prev = state;
      const next = reducer(prev, action);
      if (next === prev) return;
      state = next;
      for (const watcher of watchers) watcher(prev, next, action);
      for (const listener of listeners) listener();
    },
    watch(watcher) {
      watchers.push(watcher);
    },
  };
}
