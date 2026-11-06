/**
 * The synced database (Evolu): SQLite in the browser that works offline and,
 * once the user turns sync on, exchanges end-to-end encrypted changes with
 * their other devices through a relay.
 *
 * The rest of the app sees plain rows (`rows.ts`); this module is the only one
 * that knows Evolu's types.
 */
import {
  AppName,
  createAppOwner,
  createConsole,
  createEvolu,
  createOwnerSecret,
  createQueryBuilder,
  createRandomBytes,
  FiniteNumber,
  id,
  Id,
  idToUuid,
  Mnemonic,
  mnemonicToOwnerSecret,
  nullOr,
  SqliteBoolean,
  sqliteFalse,
  sqliteTrue,
  String as Text,
  Uuid,
  uuidToId,
  WebSocketUrl,
  type AppOwner,
  type Evolu,
  type EvoluError,
  type Query,
  type Row as EvoluRow,
} from '@evolu/common';
import { syncStateToOwnerSyncStatus, type DevicePersistence, type OwnerSyncStatus } from '@evolu/common/local-first';
import { createEvoluDeps, createRun } from '@evolu/web';
import type { Row, Value } from './rows';

/**
 * The tables. A released schema only ever grows: tables and columns are added,
 * never renamed, retyped or removed, because devices running an older version
 * of the app keep syncing with it.
 *
 * `madeAt` is the time the user made the thing, in milliseconds. (Evolu's own
 * `createdAt` is the time the row was first written, which for imported data
 * is the time of the import.)
 */
const Schema = {
  scramble: {
    id: id('Scramble'),
    moves: Text,
    madeAt: FiniteNumber,
    favorite: nullOr(SqliteBoolean),
    title: nullOr(Text),
    notes: nullOr(Text),
  },
  scrambleSet: {
    id: id('ScrambleSet'),
    /** The ids of the set's scrambles in the set's order, as JSON. */
    members: Text,
    madeAt: FiniteNumber,
    title: nullOr(Text),
    notes: nullOr(Text),
  },
  solve: {
    id: id('Solve'),
    scrambleId: id('Scramble'),
    timeMs: FiniteNumber,
    madeAt: FiniteNumber,
    /** 'plus2' or 'dnf'; no value is no penalty. */
    penalty: nullOr(Text),
    /** The inspection's 'none', 'plus2' or 'dnf'; no value is a solve timed without inspection. */
    inspectionPenalty: nullOr(Text),
    notes: nullOr(Text),
  },
  f2lSolution: {
    id: id('F2lSolution'),
    caseId: Text,
    alg: Text,
    madeAt: FiniteNumber,
    source: nullOr(Text),
    note: nullOr(Text),
  },
  /** One answered task of a training mode. Never changed afterwards: the progress is worked out from all of them. */
  trainingAttempt: {
    id: id('TrainingAttempt'),
    mode: Text,
    madeAt: FiniteNumber,
    level: FiniteNumber,
    accuracy: FiniteNumber,
    timeMs: FiniteNumber,
    score: FiniteNumber,
    moves: nullOr(FiniteNumber),
    optimal: nullOr(FiniteNumber),
  },
  /** A level of a training mode picked by hand. */
  trainingLevel: {
    id: id('TrainingLevel'),
    mode: Text,
    madeAt: FiniteNumber,
    level: FiniteNumber,
  },
};

export type Table = keyof typeof Schema;

/** How a column's value is written: as it is, or (for ids) in Evolu's form. */
type Kind = 'text' | 'number' | 'flag' | 'ref' | 'refs';

const COLUMNS = {
  scramble: { moves: 'text', madeAt: 'number', favorite: 'flag', title: 'text', notes: 'text' },
  scrambleSet: { members: 'refs', madeAt: 'number', title: 'text', notes: 'text' },
  solve: { scrambleId: 'ref', timeMs: 'number', madeAt: 'number', penalty: 'text', inspectionPenalty: 'text', notes: 'text' },
  f2lSolution: { caseId: 'text', alg: 'text', madeAt: 'number', source: 'text', note: 'text' },
  trainingAttempt: {
    mode: 'text',
    madeAt: 'number',
    level: 'number',
    accuracy: 'number',
    timeMs: 'number',
    score: 'number',
    moves: 'number',
    optimal: 'number',
  },
  trainingLevel: { mode: 'text', madeAt: 'number', level: 'number' },
} satisfies { [T in Table]: Record<Exclude<keyof (typeof Schema)[T], 'id'>, Kind> };

export const TABLES = Object.keys(COLUMNS) as Table[];

// The app's ids are UUIDs; Evolu's ids are the same 16 bytes written its own way.
const toId = (uuid: string) => uuidToId(Uuid.orThrow(uuid));
const fromId = (value: unknown): string | null => (typeof value === 'string' && Id.is(value) ? idToUuid(value) : null);

function encode(kind: Kind, value: Value): unknown {
  if (value === null) return null;
  switch (kind) {
    case 'text':
      return String(value);
    case 'number':
      return typeof value === 'number' ? FiniteNumber.orThrow(value) : null;
    case 'flag':
      return value === 1 ? sqliteTrue : sqliteFalse;
    case 'ref':
      return toId(String(value));
    case 'refs':
      return JSON.stringify((JSON.parse(String(value)) as string[]).map(toId));
  }
}

function decode(kind: Kind, value: unknown): Value {
  switch (kind) {
    case 'text':
      return typeof value === 'string' ? value : null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    case 'flag':
      return value === sqliteTrue ? 1 : null;
    case 'ref':
      return fromId(value);
    case 'refs':
      try {
        const ids: unknown = typeof value === 'string' ? JSON.parse(value) : null;
        return Array.isArray(ids) ? JSON.stringify(ids.map(fromId).filter((id) => id !== null)) : null;
      } catch {
        return null;
      }
  }
}

function decodeRow(table: Table, raw: Readonly<Record<string, unknown>>): Row | null {
  const rowId = fromId(raw.id);
  if (rowId === null) return null;
  const values: Record<string, Value> = {};
  for (const [column, kind] of Object.entries(COLUMNS[table]) as Array<[string, Kind]>) values[column] = decode(kind, raw[column]);
  return { id: rowId, deleted: raw.isDeleted === sqliteTrue, values };
}

/** One write, to any table. */
export type Write =
  | { kind: 'put'; table: Table; id: string; values: Readonly<Record<string, Value>> }
  | { kind: 'patch'; table: Table; id: string; values: Readonly<Record<string, Value>> }
  | { kind: 'remove'; table: Table; id: string };

export type AllRows = Readonly<Record<Table, readonly Row[]>>;

export interface Db {
  /** The rows as last read. A table's list is the same object until that table changes. */
  read(): AllRows;
  /** Calls `listener` when rows changed, by a write made here or by another device. */
  subscribe(listener: () => void): () => void;
  /** Stores the writes. Until `pendingWrites` is back at zero, `read` may not show them yet. */
  write(writes: readonly Write[]): void;
  readonly pendingWrites: number;
  /** The words that are this device's key to the data; entered on another device, they connect it. */
  readonly mnemonic: string;
  /** Whether the browser keeps the database (a private window keeps it only in memory). */
  readonly persistence: Promise<DevicePersistence>;
  /** Starts (or stops) exchanging changes through the relay; remembered for the next start. */
  setSync(on: boolean): void;
  readonly syncOn: boolean;
  /** How the exchange is going; `NoRelays` while sync is off. */
  syncStatus(): OwnerSyncStatus;
  subscribeSyncStatus(listener: () => void): () => void;
}

const OWNER_KEY = 'cuberhub:sync-key';
const FORMER_KEYS_KEY = 'cuberhub:sync-keys-former';
const SYNC_KEY = 'cuberhub:sync';

/** The relay changes go through. The default is Evolu's testing relay, which may delete what it holds. */
export const RELAY_URL: string = (import.meta.env.VITE_SYNC_RELAY as string | undefined) || 'wss://free.evoluhq.com/';

/**
 * The owner of this device's data: a secret made on the first start and kept
 * in the browser's storage, where the data itself has always been. Whoever
 * has its words can read and change the data, so they are shown only when the
 * user asks to connect another device.
 */
function loadOwner(): AppOwner {
  const stored = Mnemonic.fromUnknown(localStorage.getItem(OWNER_KEY) ?? '');
  if (stored.ok) return createAppOwner(mnemonicToOwnerSecret(stored.value));
  const owner = createAppOwner(createOwnerSecret({ randomBytes: createRandomBytes() }));
  localStorage.setItem(OWNER_KEY, owner.mnemonic);
  return owner;
}

/** The words as they should be stored, or null when they are not a valid key. */
export function parseMnemonic(input: string): string | null {
  const result = Mnemonic.fromUnknown(input.trim().toLowerCase().split(/\s+/).join(' '));
  return result.ok ? result.value : null;
}

/**
 * Makes `mnemonic` this device's key and turns sync on. The page has to be
 * reloaded afterwards: the database of the new key is a different one.
 */
export function adoptMnemonic(mnemonic: string): void {
  // The key left behind is kept: its data stays on this device and only that key opens it.
  const former = localStorage.getItem(OWNER_KEY);
  if (former !== null && former !== mnemonic) {
    localStorage.setItem(FORMER_KEYS_KEY, [localStorage.getItem(FORMER_KEYS_KEY), former].filter(Boolean).join('\n'));
  }
  localStorage.setItem(OWNER_KEY, mnemonic);
  localStorage.setItem(SYNC_KEY, 'on');
}

// Evolu reports its every step as info; the app's console keeps to warnings and errors.
const run = createRun(createEvoluDeps({ console: createConsole({ level: 'warn' }) }));

/** A failure that stops the database from working (it may never finish opening then), or null. */
export const dbError = (): EvoluError | null => run.deps.evoluError.get();
export const subscribeDbError = (listener: () => void): (() => void) => run.deps.evoluError.subscribe(listener);

async function open(): Promise<Db> {
  const appOwner = loadOwner();
  // Sync starts off; `setSync` turns it on for the owner.
  const evolu: Evolu<typeof Schema> = await run.ok(
    createEvolu(Schema, { appName: AppName.orThrow('cuberhub'), appOwner, transports: [] }),
  );

  const createQuery = createQueryBuilder(Schema);
  // Every table is read whole, deleted rows included: they keep their place in the numbering.
  // The rows are checked column by column in `decodeRow`, so the queries need no row types of their own.
  const whole = (query: unknown) => query as Query<typeof Schema, EvoluRow>;
  const queries: Record<Table, Query<typeof Schema, EvoluRow>> = {
    scramble: whole(createQuery((db) => db.selectFrom('scramble').selectAll())),
    scrambleSet: whole(createQuery((db) => db.selectFrom('scrambleSet').selectAll())),
    solve: whole(createQuery((db) => db.selectFrom('solve').selectAll())),
    f2lSolution: whole(createQuery((db) => db.selectFrom('f2lSolution').selectAll())),
    trainingAttempt: whole(createQuery((db) => db.selectFrom('trainingAttempt').selectAll())),
    trainingLevel: whole(createQuery((db) => db.selectFrom('trainingLevel').selectAll())),
  };

  const readTable = (table: Table): Row[] => {
    const rows: Row[] = [];
    for (const raw of evolu.getQueryRows(queries[table])) {
      const row = decodeRow(table, raw);
      if (row !== null) rows.push(row);
    }
    return rows;
  };

  await Promise.all(TABLES.map((table) => evolu.loadQuery(queries[table])));
  const current = Object.fromEntries(TABLES.map((table) => [table, readTable(table)])) as Record<Table, Row[]>;
  // Ids ever seen per table, deleted rows included: writing to one of them must be able to bring it back.
  const known = Object.fromEntries(TABLES.map((table) => [table, new Set(current[table].map((row) => row.id))])) as Record<Table, Set<string>>;

  const listeners = new Set<() => void>();
  for (const table of TABLES) {
    evolu.subscribeQuery(queries[table])(() => {
      current[table] = readTable(table);
      for (const row of current[table]) known[table].add(row.id);
      for (const listener of listeners) listener();
    });
  }

  let pendingWrites = 0;
  const onComplete = () => {
    pendingWrites--;
    if (pendingWrites === 0) for (const listener of listeners) listener();
  };

  // The tables differ only in their columns, which `COLUMNS` describes, so one untyped call serves them all.
  const mutate = (kind: 'upsert' | 'update', table: Table, values: Record<string, unknown>) => {
    pendingWrites++;
    (evolu[kind] as (table: Table, values: Record<string, unknown>, options: { onComplete: () => void }) => unknown)(table, values, { onComplete });
  };

  let stopSync: (() => void) | null = null;
  const startSync = () => {
    stopSync ??= evolu.useOwner(appOwner, [{ type: 'WebSocket', url: WebSocketUrl.orThrow(RELAY_URL) }]);
  };
  if (localStorage.getItem(SYNC_KEY) === 'on') startSync();

  return {
    read: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    write(writes) {
      for (const write of writes) {
        const row: Record<string, unknown> = { id: toId(write.id) };
        if (write.kind === 'remove') {
          row.isDeleted = sqliteTrue;
          mutate('update', write.table, row);
          continue;
        }
        const kinds = COLUMNS[write.table] as Record<string, Kind>;
        // A row the database already has (deleted, perhaps) gets every column, so nothing of its past shows through.
        const returning = write.kind === 'put' && known[write.table].has(write.id);
        for (const [column, value] of Object.entries(write.values)) {
          if (value === null && write.kind === 'put' && !returning) continue;
          row[column] = encode(kinds[column]!, value);
        }
        if (returning) row.isDeleted = sqliteFalse;
        known[write.table].add(write.id);
        mutate(write.kind === 'put' && !returning ? 'upsert' : 'update', write.table, row);
      }
    },
    get pendingWrites() {
      return pendingWrites;
    },
    mnemonic: appOwner.mnemonic,
    persistence: evolu.devicePersistence,
    setSync(on) {
      if (on) {
        localStorage.setItem(SYNC_KEY, 'on');
        startSync();
      } else {
        localStorage.removeItem(SYNC_KEY);
        stopSync?.();
        stopSync = null;
      }
      for (const listener of syncListeners) listener();
    },
    get syncOn() {
      return stopSync !== null;
    },
    syncStatus: () => syncStateToOwnerSyncStatus(run.deps.syncState.get(), evolu.name, appOwner.id),
    subscribeSyncStatus(listener) {
      syncListeners.add(listener);
      const unsubscribe = run.deps.syncState.subscribe(listener);
      return () => {
        syncListeners.delete(listener);
        unsubscribe();
      };
    },
  };
}

const syncListeners = new Set<() => void>();

/** The database, opened once. */
export const db: Promise<Db> = open();
