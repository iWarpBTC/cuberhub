import { describe, expect, it } from 'vitest';
import { EXPORT_FORMAT, EXPORT_VERSION, parseImport } from './storage';

const SEQUENCE = "R U R' U'";

function exportJson(scrambles: object[], sets?: unknown): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, scrambles, solves: [], sets });
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
