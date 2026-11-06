import { describe, expect, it } from 'vitest';
import { dataToRows, rowsToData, type Snapshot } from '../sync/rows';
import type { AppData, NewScramble } from '../types';
import { initialState, reducer, type StoreState } from './reducer';

const SEQUENCE = "R U R' U'";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fresh = (n: number, at: number): NewScramble => ({ id: id(n), scramble: SEQUENCE, createdAt: at, favorite: false });

const EMPTY: Snapshot = rowsToData({ scramble: [], scrambleSet: [], solve: [], f2lSolution: [] });
const start = (): StoreState => initialState(EMPTY, null, null);
const dataOf = ({ scrambles, solves, sets, f2lSolutions }: StoreState): AppData => ({ scrambles, solves, sets, f2lSolutions });
/** What the database would return for the state: its data read back from its rows. */
const readBack = (state: StoreState) => rowsToData(dataToRows(dataOf(state)));

describe('reducer numbering', () => {
  it('numbers new scrambles one after another', () => {
    let state = reducer(start(), { type: 'ADD_SCRAMBLE', scramble: fresh(1, 10) });
    state = reducer(state, { type: 'ADD_SCRAMBLE', scramble: fresh(2, 20) });
    expect(state.scrambles.map((s) => s.number)).toEqual([1, 2]);
    expect(state.activeScrambleId).toBe(id(2));
  });

  it('never reuses the number of a deleted scramble', () => {
    let state = reducer(start(), { type: 'ADD_SCRAMBLE', scramble: fresh(1, 10) });
    state = reducer(state, { type: 'ADD_SCRAMBLE', scramble: fresh(2, 20) });
    state = reducer(state, { type: 'DELETE_SCRAMBLE', id: id(2) });
    state = reducer(state, { type: 'ADD_SCRAMBLE', scramble: fresh(3, 30) });
    expect(state.scrambles.map((s) => s.number)).toEqual([1, 3]);
  });

  it('gives the scrambles of a new set distinct times in their order, as the database will number them', () => {
    const state = reducer(start(), {
      type: 'ADD_SET',
      set: { id: id(21), createdAt: 50, scrambleIds: [] },
      scrambleIds: [],
      newScrambles: [fresh(3, 50), fresh(1, 50), fresh(2, 50)],
    });
    expect(state.scrambles.map((s) => [s.id, s.createdAt, s.number])).toEqual([
      [id(3), 50, 1],
      [id(1), 51, 2],
      [id(2), 52, 3],
    ]);
    expect(state.sets[0]).toMatchObject({ number: 1, scrambleIds: [id(3), id(1), id(2)] });
    expect(readBack(state).data).toEqual(dataOf(state));
  });

  it('makes a scramble later than the last one even when the clock is behind', () => {
    let state = reducer(start(), { type: 'ADD_SCRAMBLE', scramble: fresh(1, 1000) });
    state = reducer(state, { type: 'ADD_SCRAMBLE', scramble: fresh(2, 400) });
    expect(state.scrambles.map((s) => [s.createdAt, s.number])).toEqual([
      [1000, 1],
      [1001, 2],
    ]);
  });
});

describe('reducer SYNC', () => {
  const two = () => {
    let state = reducer(start(), { type: 'ADD_SCRAMBLE', scramble: fresh(1, 10) });
    state = reducer(state, { type: 'ADD_SCRAMBLE', scramble: fresh(2, 20) });
    return reducer(state, { type: 'SELECT_SCRAMBLE', id: id(1) });
  };

  it('changes nothing when the database returns what the app already shows', () => {
    const state = two();
    expect(reducer(state, { type: 'SYNC', snapshot: readBack(state) })).toBe(state);
  });

  it('takes changes from another device and keeps what is open', () => {
    const state = two();
    const snapshot = readBack(state);
    snapshot.data.scrambles[1] = { ...snapshot.data.scrambles[1]!, title: 'From the phone' };
    const next = reducer(state, { type: 'SYNC', snapshot });
    expect(next.scrambles[1]?.title).toBe('From the phone');
    expect(next.scrambles[0]).toBe(state.scrambles[0]);
    expect(next.activeScrambleId).toBe(id(1));
  });

  it('closes a scramble another device deleted', () => {
    const state = two();
    const snapshot = readBack(state);
    snapshot.data.scrambles.shift();
    expect(reducer(state, { type: 'SYNC', snapshot }).activeScrambleId).toBeNull();
  });

  it('opens the newest scramble when data arrives on a device that had none', () => {
    const next = reducer(start(), { type: 'SYNC', snapshot: readBack(two()) });
    expect(next.activeScrambleId).toBe(id(2));
  });
});

describe('reducer MERGE_DATA', () => {
  it('adds what is missing, numbered with the rest by creation order', () => {
    const state = reducer(start(), { type: 'ADD_SCRAMBLE', scramble: fresh(2, 20) });
    const next = reducer(state, {
      type: 'MERGE_DATA',
      data: {
        scrambles: [
          { ...fresh(1, 10), number: 1 },
          { ...fresh(2, 20), number: 2, title: 'ignored: already here' },
        ],
        solves: [{ id: id(11), scrambleId: id(1), timeMs: 9000, penalty: 'none', createdAt: 100 }],
        sets: [],
        f2lSolutions: [],
      },
    });
    expect(next.scrambles.map((s) => [s.id, s.number, s.title])).toEqual([
      [id(1), 1, undefined],
      [id(2), 2, undefined],
    ]);
    expect(next.solves).toHaveLength(1);
    expect(next.activeScrambleId).toBe(id(2));
  });
});
