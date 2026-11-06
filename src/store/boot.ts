import { eventsFromProgress, type DryEvent } from '../lib/dryPractice';
import { newId } from '../lib/id';
import {
  loadActiveScrambleId,
  loadActiveSetId,
  loadStoredData,
  loadStoredDryPractice,
  migrateLegacyStorage,
  parseImport,
  retireStoredData,
  retireStoredDryPractice,
  saveActiveScrambleId,
  saveActiveSetId,
  saveTrainingSettings,
  serializeExport,
  stashCarryOver,
  takeCarryOver,
} from '../lib/storage';
import { adoptMnemonic, db, type Db } from '../sync/db';
import { persist } from '../sync/persist';
import { rowsToData } from '../sync/rows';
import { initialState } from './reducer';
import { createStore, type Store } from './store';
import { createTrainingStore, type TrainingStore } from './training';

export interface Stores {
  db: Db;
  store: Store;
  training: TrainingStore;
}

async function start(): Promise<Stores> {
  const database = await db;
  // Before anything stored is read: bring over what was saved under the app's former name.
  migrateLegacyStorage();
  const store = createStore(initialState(rowsToData(database.read()), loadActiveScrambleId(), loadActiveSetId()));
  persist(database, store);
  const training = createTrainingStore(database);

  // What is shown is remembered per device.
  store.watch((prev, next) => {
    if (prev.activeScrambleId === next.activeScrambleId && prev.activeSetId === next.activeSetId) return;
    saveActiveScrambleId(next.activeScrambleId);
    saveActiveSetId(next.activeScrambleId === null ? next.activeSetId : null);
  });

  // Once: what the app kept in the browser's storage before it had a database.
  const stored = loadStoredData();
  if (stored !== null) store.dispatch({ type: 'MERGE_DATA', data: stored });
  retireStoredData();
  const progress = loadStoredDryPractice();
  if (progress !== null) {
    saveTrainingSettings(progress.settings);
    if (training.events().length === 0) training.add(eventsFromProgress(progress.modes, newId));
    retireStoredDryPractice();
  }

  // What this device had before it joined the data of another one.
  const carried = takeCarryOver();
  if (carried !== null) {
    try {
      const { data, training: events } = JSON.parse(carried) as { data: string; training: DryEvent[] };
      store.dispatch({ type: 'MERGE_DATA', data: parseImport(data) });
      training.add(events);
    } catch {
      // Unreadable: nothing to bring along.
    }
  }

  return { db: database, store, training };
}

/** The database and the stores over it, ready once the database has opened. */
export const stores: Promise<Stores> = start();

/**
 * Connects this device to the data another device shows the key of, and
 * reloads the app on it. With `bringData`, what this device has now is added
 * to that data; otherwise it stays behind under this device's old key.
 */
export function joinDevice({ store, training }: Stores, mnemonic: string, bringData: boolean): void {
  if (bringData) {
    const { scrambles, solves, sets, f2lSolutions } = store.getState();
    stashCarryOver(JSON.stringify({ data: serializeExport({ scrambles, solves, sets, f2lSolutions }), training: training.events() }));
  }
  adoptMnemonic(mnemonic);
  window.location.reload();
}
