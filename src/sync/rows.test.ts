import { describe, expect, it } from 'vitest';
import type { AppData, Scramble, ScrambleSet, Solve } from '../types';
import { dataToRows, diffData, keepIdentity, rowsToData, scrambleRow, type Row, type Rows } from './rows';

const SEQUENCE = "R U R' U'";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const scramble = (n: number, at: number, extra: Partial<Scramble> = {}): Scramble => ({
  id: id(n),
  scramble: SEQUENCE,
  createdAt: at,
  number: 0,
  favorite: false,
  ...extra,
});
const solve = (n: number, scrambleN: number, at: number, extra: Partial<Solve> = {}): Solve => ({
  id: id(n),
  scrambleId: id(scrambleN),
  timeMs: 12345,
  penalty: 'none',
  createdAt: at,
  ...extra,
});
const set = (n: number, at: number, members: number[], extra: Partial<ScrambleSet> = {}): ScrambleSet => ({
  id: id(n),
  createdAt: at,
  number: 0,
  scrambleIds: members.map(id),
  ...extra,
});
const data = (partial: Partial<AppData>): AppData => ({ scrambles: [], solves: [], sets: [], f2lSolutions: [], ...partial });
const rows = (partial: Partial<Rows>): Rows => ({ scramble: [], scrambleSet: [], solve: [], f2lSolution: [], ...partial });
const deleted = (row: Row): Row => ({ ...row, deleted: true });

describe('rowsToData', () => {
  it('numbers scrambles by the order they were made in', () => {
    const { data: result } = rowsToData(rows({ scramble: [scrambleRow(scramble(3, 30)), scrambleRow(scramble(1, 10)), scrambleRow(scramble(2, 20))] }));
    expect(result.scrambles.map((s) => [s.id, s.number])).toEqual([
      [id(1), 1],
      [id(2), 2],
      [id(3), 3],
    ]);
  });

  it('lets a deleted scramble keep its place, so the others keep their numbers', () => {
    const { data: result, numbering } = rowsToData(
      rows({ scramble: [scrambleRow(scramble(1, 10)), deleted(scrambleRow(scramble(2, 20))), scrambleRow(scramble(3, 30))] }),
    );
    expect(result.scrambles.map((s) => s.number)).toEqual([1, 3]);
    expect(numbering.scrambles).toEqual({ count: 3, lastAt: 30 });
  });

  it('gives two devices the same numbers for scrambles each made while offline', () => {
    const here = [scrambleRow(scramble(1, 10)), scrambleRow(scramble(2, 40))];
    const there = [scrambleRow(scramble(3, 20)), scrambleRow(scramble(4, 40))];
    const one = rowsToData(rows({ scramble: [...here, ...there] })).data.scrambles.map((s) => [s.id, s.number]);
    const other = rowsToData(rows({ scramble: [...there, ...here] })).data.scrambles.map((s) => [s.id, s.number]);
    expect(one).toEqual(other);
    // Same millisecond: the ids decide, the same way everywhere.
    expect(one).toEqual([
      [id(1), 1],
      [id(3), 2],
      [id(2), 3],
      [id(4), 4],
    ]);
  });

  it('leaves out rows that have not fully arrived or are not valid', () => {
    const incomplete: Row = { id: id(2), deleted: false, values: { title: 'only a title so far' } };
    const invalid: Row = { id: id(3), deleted: false, values: { moves: 'not a scramble', madeAt: 30 } };
    const { data: result } = rowsToData(rows({ scramble: [scrambleRow(scramble(1, 10)), incomplete, invalid] }));
    expect(result.scrambles.map((s) => s.id)).toEqual([id(1)]);
  });

  it('keeps solves of shown scrambles only, oldest first', () => {
    const all = data({ scrambles: [scramble(1, 10)], solves: [solve(11, 1, 200), solve(12, 9, 150), solve(13, 1, 100)] });
    expect(rowsToData(dataToRows(all)).data.solves.map((s) => s.id)).toEqual([id(13), id(11)]);
  });

  it('gives a scramble two sets list to the older set and drops a set left empty', () => {
    const all = data({
      scrambles: [scramble(1, 10), scramble(2, 20)],
      sets: [set(22, 200, [2, 1]), set(21, 100, [1, 7]), set(23, 300, [1])],
    });
    expect(rowsToData(dataToRows(all)).data.sets.map((s) => [s.id, s.number, s.scrambleIds])).toEqual([
      [id(21), 1, [id(1)]],
      [id(22), 2, [id(2)]],
    ]);
  });

  it('reads back exactly what was written', () => {
    const all = data({
      scrambles: [scramble(1, 10, { number: 1, title: 'Final', notes: 'n', favorite: true }), scramble(2, 20, { number: 2 })],
      solves: [solve(11, 1, 100, { penalty: 'plus2', inspectionPenalty: 'none', notes: 'lucky' }), solve(12, 2, 200)],
      sets: [set(21, 300, [2, 1], { number: 1, title: 'Round 1' })],
      f2lSolutions: [{ id: id(31), caseId: 'f2l-1', alg: "R U R'", source: "(R U R')", note: 'easy', createdAt: 400 }],
    });
    expect(rowsToData(dataToRows(all)).data).toEqual(all);
  });
});

describe('diffData', () => {
  const before = data({ scrambles: [scramble(1, 10, { number: 1 }), scramble(2, 20, { number: 2 })], solves: [solve(11, 1, 100)] });

  it('writes nothing when nothing changed', () => {
    expect(diffData(before, { ...before })).toEqual([]);
  });

  it('writes a new row whole', () => {
    const after = { ...before, scrambles: [...before.scrambles, scramble(3, 30, { number: 3, title: 'New' })] };
    expect(diffData(before, after)).toEqual([
      { kind: 'put', table: 'scramble', id: id(3), values: { moves: SEQUENCE, madeAt: 30, favorite: null, title: 'New', notes: null } },
    ]);
  });

  it('writes only the columns that changed, so edits of different fields on two devices both last', () => {
    const after = { ...before, scrambles: [{ ...before.scrambles[0]!, favorite: true }, before.scrambles[1]!] };
    expect(diffData(before, after)).toEqual([{ kind: 'patch', table: 'scramble', id: id(1), values: { favorite: 1 } }]);
  });

  it('never writes the number: it follows from the rows', () => {
    const after = { ...before, scrambles: [{ ...before.scrambles[0]!, number: 7 }, before.scrambles[1]!] };
    expect(diffData(before, after)).toEqual([]);
  });

  it('marks what is gone as deleted', () => {
    const after = { ...before, scrambles: [before.scrambles[1]!], solves: [] };
    expect(diffData(before, after)).toEqual([
      { kind: 'remove', table: 'scramble', id: id(1) },
      { kind: 'remove', table: 'solve', id: id(11) },
    ]);
  });

  it('writes a set whose scrambles changed as its new list', () => {
    const withSet = { ...before, sets: [set(21, 300, [1])] };
    const after = { ...withSet, sets: [{ ...withSet.sets[0]!, scrambleIds: [id(1), id(2)] }] };
    expect(diffData(withSet, after)).toEqual([
      { kind: 'patch', table: 'scrambleSet', id: id(21), values: { members: JSON.stringify([id(1), id(2)]) } },
    ]);
  });
});

describe('keepIdentity', () => {
  it('keeps everything that reads back equal, so nothing re-renders', () => {
    const current = data({ scrambles: [scramble(1, 10, { number: 1 })], sets: [set(21, 300, [1], { number: 1 })] });
    const readBack = rowsToData(dataToRows(current)).data;
    expect(readBack).not.toBe(current);
    expect(keepIdentity(current, readBack)).toBe(current);
  });

  it('replaces only what differs', () => {
    const current = data({ scrambles: [scramble(1, 10, { number: 1 }), scramble(2, 20, { number: 2 })] });
    const incoming = data({ scrambles: [{ ...current.scrambles[0]! }, { ...current.scrambles[1]!, title: 'From the phone' }] });
    const result = keepIdentity(current, incoming);
    expect(result.scrambles[0]).toBe(current.scrambles[0]);
    expect(result.scrambles[1]?.title).toBe('From the phone');
    expect(result.solves).toBe(current.solves);
  });
});
