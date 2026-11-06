import { dataChanged } from '../store/reducer';
import type { Store } from '../store/store';
import type { Db, Write } from './db';
import { diffData, rowsToData, type DataTable, type Row, type Rows, type Value } from './rows';

/** Columns the user types into. A write per keystroke would fill the history, so they are written once the typing pauses. */
const TYPED_COLUMNS: ReadonlySet<string> = new Set(['title', 'notes']);
const TYPING_PAUSE_MS = 800;

interface Typed {
  table: DataTable;
  id: string;
  column: string;
  value: Value;
}

/**
 * Keeps the database and the store the same. Every change made in the app is
 * written right away as the rows and columns that differ; whatever the
 * database then holds, with what other devices sent, goes back into the store.
 */
export function persist(db: Db, store: Store): void {
  /** Text typed but not yet written. */
  const typing = new Map<string, Typed>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const writeTyping = () => {
    clearTimeout(timer);
    timer = undefined;
    if (typing.size === 0) return;
    const patches = new Map<string, { table: DataTable; id: string; values: Record<string, Value> }>();
    for (const { table, id, column, value } of typing.values()) {
      const key = `${table}/${id}`;
      const patch = patches.get(key) ?? { table, id, values: {} };
      patch.values[column] = value;
      patches.set(key, patch);
    }
    typing.clear();
    db.write([...patches.values()].map((patch): Write => ({ kind: 'patch', ...patch })));
  };

  store.watch((prev, next, action) => {
    if (action.type === 'SYNC' || !dataChanged(prev, next)) return;
    const now: Write[] = [];
    for (const change of diffData(prev, next)) {
      if (change.kind === 'patch' && Object.keys(change.values).every((column) => TYPED_COLUMNS.has(column))) {
        for (const [column, value] of Object.entries(change.values)) {
          typing.set(`${change.table}/${change.id}/${column}`, { table: change.table, id: change.id, column, value });
        }
      } else {
        now.push(change);
      }
    }
    if (now.length > 0) {
      // In the order things happened: what was typed before comes first.
      writeTyping();
      db.write(now);
    } else if (typing.size > 0) {
      clearTimeout(timer);
      timer = setTimeout(writeTyping, TYPING_PAUSE_MS);
    }
  });

  /** The rows with the text still being typed in place, so reading the database never takes a keystroke back. */
  const withTyping = (rows: Rows): Rows => {
    if (typing.size === 0) return rows;
    const result: Record<DataTable, readonly Row[]> = { ...rows };
    for (const { table, id, column, value } of typing.values()) {
      result[table] = result[table].map((row) => (row.id === id ? { ...row, values: { ...row.values, [column]: value } } : row));
    }
    return result;
  };

  let queued = false;
  db.subscribe(() => {
    if (queued) return;
    queued = true;
    // One read for all the tables a change touched.
    queueMicrotask(() => {
      queued = false;
      // Rows read while writes are on their way may lack them; the database calls again once they are stored.
      if (db.pendingWrites > 0) return;
      store.dispatch({ type: 'SYNC', snapshot: rowsToData(withTyping(db.read())) });
    });
  });

  // A tab going away must not take the last typed words with it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeTyping();
  });
  window.addEventListener('pagehide', writeTyping);
}
