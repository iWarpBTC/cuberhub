import { describe, expect, it } from 'vitest';
import { EXPORT_FORMAT, EXPORT_VERSION, ImportError, LEGACY_EXPORT_FORMAT, migrateLegacyStorage, parseImport } from './storage';

const SEQUENCE = "R U R' U'";

function exportJson(scrambles: object[], sets?: unknown, solves: object[] = []): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, scrambles, solves, sets });
}

const THREE = [
  { id: 'a', scramble: SEQUENCE, createdAt: 1, number: 1 },
  { id: 'b', scramble: SEQUENCE, createdAt: 2, number: 2 },
  { id: 'c', scramble: SEQUENCE, createdAt: 3, number: 3 },
];

describe('parseImport scramble numbers', () => {
  it('keeps stored numbers, including gaps left by deleted scrambles', () => {
    const data = parseImport(
      exportJson([
        { id: 'a', scramble: SEQUENCE, createdAt: 1, number: 1 },
        { id: 'c', scramble: SEQUENCE, createdAt: 3, number: 3 },
      ]),
    );
    expect(data.scrambles.map((s) => s.number)).toEqual([1, 3]);
  });

  it('numbers scrambles saved without numbers by creation order', () => {
    const data = parseImport(
      exportJson([
        { id: 'b', scramble: SEQUENCE, createdAt: 2 },
        { id: 'a', scramble: SEQUENCE, createdAt: 1 },
      ]),
    );
    expect(data.scrambles.map((s) => [s.id, s.number])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('numbers unnumbered scrambles after the highest number in use', () => {
    const data = parseImport(
      exportJson([
        { id: 'a', scramble: SEQUENCE, createdAt: 1 },
        { id: 'b', scramble: SEQUENCE, createdAt: 2, number: 5 },
      ]),
    );
    expect(data.scrambles.map((s) => s.number)).toEqual([6, 5]);
  });
});

describe('parseImport F2L solutions', () => {
  const file = (f2lSolutions: unknown) =>
    JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, scrambles: [], solves: [], f2lSolutions });

  it('reads none from files exported before solutions existed', () => {
    expect(parseImport(exportJson([])).f2lSolutions).toEqual([]);
  });

  it('keeps valid solutions in creation order and drops the rest', () => {
    const data = parseImport(
      file([
        { id: 'b', caseId: 'f2l-35', alg: "U' R' F R F' R U' R'", source: "U' (R' F R F')", note: 'sledge', createdAt: 2 },
        { id: 'a', caseId: 'f2l-1', alg: "R U R'", createdAt: 1 },
        { id: 'c', caseId: 'f2l-99', alg: "R U R'", createdAt: 3 },
        { id: 'd', caseId: 'f2l-1', alg: "y R U R'", createdAt: 4 },
        { id: 'e', caseId: 'f2l-1', alg: "R U R'" },
      ]),
    );
    expect(data.f2lSolutions).toEqual([
      { id: 'a', caseId: 'f2l-1', alg: "R U R'", createdAt: 1 },
      { id: 'b', caseId: 'f2l-35', alg: "U' R' F R F' R U' R'", source: "U' (R' F R F')", note: 'sledge', createdAt: 2 },
    ]);
  });

  it('rejects a solutions field that is not an array', () => {
    expect(() => parseImport(file('x'))).toThrow(ImportError);
  });
});

describe('parseImport sets', () => {
  it('reads no sets from files exported before sets existed', () => {
    expect(parseImport(exportJson(THREE)).sets).toEqual([]);
  });

  it('keeps a set with its scramble order, title and notes', () => {
    const data = parseImport(
      exportJson(THREE, [{ id: 's1', createdAt: 5, number: 1, scrambleIds: ['c', 'a'], title: 'Final', notes: 'n' }]),
    );
    expect(data.sets).toEqual([{ id: 's1', createdAt: 5, number: 1, scrambleIds: ['c', 'a'], title: 'Final', notes: 'n' }]);
  });

  it('drops unknown and duplicate scramble ids and scrambles claimed by an earlier set', () => {
    const data = parseImport(
      exportJson(THREE, [
        { id: 's1', createdAt: 5, number: 1, scrambleIds: ['a', 'zzz', 'a', 'b'] },
        { id: 's2', createdAt: 6, number: 2, scrambleIds: ['b', 'c'] },
        { id: 's3', createdAt: 7, number: 3, scrambleIds: ['a'] },
      ]),
    );
    expect(data.sets.map((s) => [s.id, s.scrambleIds])).toEqual([
      ['s1', ['a', 'b']],
      ['s2', ['c']],
    ]);
  });

  it('numbers sets saved without numbers by creation order', () => {
    const data = parseImport(
      exportJson(THREE, [
        { id: 's2', createdAt: 6, scrambleIds: ['b'] },
        { id: 's1', createdAt: 5, scrambleIds: ['a'] },
      ]),
    );
    expect(data.sets.map((s) => [s.id, s.number])).toEqual([
      ['s1', 1],
      ['s2', 2],
    ]);
  });

  it('rejects a sets field that is not an array', () => {
    expect(() => parseImport(exportJson(THREE, 'nope'))).toThrow('invalid-data');
  });
});

describe('parseImport solve penalties', () => {
  const solve = { id: 's', scrambleId: 'a', timeMs: 10000, penalty: 'plus2', createdAt: 1 };

  it('reads a solve without an inspection penalty as timed without inspection', () => {
    expect(parseImport(exportJson(THREE, undefined, [solve])).solves).toEqual([solve]);
  });

  it('keeps an inspection penalty', () => {
    const { solves } = parseImport(exportJson(THREE, undefined, [{ ...solve, inspectionPenalty: 'dnf' }]));
    expect(solves[0]?.inspectionPenalty).toBe('dnf');
  });

  it('drops a solve with an unknown inspection penalty', () => {
    const { solves } = parseImport(exportJson(THREE, undefined, [{ ...solve, inspectionPenalty: 'plus4' }]));
    expect(solves).toEqual([]);
  });
});

describe('parseImport format', () => {
  const file = (format: string) => JSON.stringify({ format, version: EXPORT_VERSION, scrambles: THREE, solves: [] });

  it('still reads a file exported under the former name', () => {
    expect(parseImport(file(LEGACY_EXPORT_FORMAT)).scrambles).toHaveLength(3);
  });

  it('rejects a file of another format', () => {
    expect(() => parseImport(file('cstimer'))).toThrow('not-export');
  });
});

/** An in-memory `Storage`; `quota` caps the total length of the stored values. */
function memoryStorage(initial: Record<string, string>, quota = Infinity): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      const others = [...items].reduce((sum, [k, v]) => (k === key ? sum : sum + v.length), 0);
      if (others + value.length > quota) throw new Error('QuotaExceededError');
      items.set(key, value);
    },
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

function contents(storage: Storage): Record<string, string | null> {
  return Object.fromEntries(Array.from({ length: storage.length }, (_, i) => [storage.key(i)!, storage.getItem(storage.key(i)!)]));
}

describe('migrateLegacyStorage', () => {
  it('moves every key of the former name to the new prefix', () => {
    const storage = memoryStorage({ 'rubik-timer:data': '{"scrambles":[]}', 'rubik-timer:lang': 'cs', 'rubik-timer:dry-practice': '{}' });
    migrateLegacyStorage(storage);
    expect(contents(storage)).toEqual({ 'cuberhub:data': '{"scrambles":[]}', 'cuberhub:lang': 'cs', 'cuberhub:dry-practice': '{}' });
  });

  it('keeps a value already stored under the new name', () => {
    const storage = memoryStorage({ 'rubik-timer:lang': 'cs', 'cuberhub:lang': 'en' });
    migrateLegacyStorage(storage);
    expect(contents(storage)).toEqual({ 'cuberhub:lang': 'en' });
  });

  it('leaves the keys of other apps alone and changes nothing on a second run', () => {
    const storage = memoryStorage({ 'rubik-timer:lang': 'cs', 'other-app:lang': 'de' });
    migrateLegacyStorage(storage);
    migrateLegacyStorage(storage);
    expect(contents(storage)).toEqual({ 'other-app:lang': 'de', 'cuberhub:lang': 'cs' });
  });

  it('moves data that would not fit the quota twice', () => {
    const data = 'x'.repeat(80);
    const storage = memoryStorage({ 'rubik-timer:data': data }, 100);
    migrateLegacyStorage(storage);
    expect(contents(storage)).toEqual({ 'cuberhub:data': data });
  });
});
