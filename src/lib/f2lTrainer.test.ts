import { describe, expect, it } from 'vitest';
import { F2L_CASES } from './f2l';
import { applyMove, formatMove, isSolved, parseFaceMove, pushMove, startTrainer, undoMove, type Move } from './f2lTrainer';

const m = (token: string): Move => parseFaceMove(token)!;
const seq = (moves: readonly Move[]) => moves.map(formatMove).join(' ');
const doMoves = (alg: string, moves: string) =>
  moves
    .split(' ')
    .filter(Boolean)
    .reduce((state, token) => applyMove(state, m(token)), startTrainer(alg));

describe('pushMove', () => {
  it('merges turns of the same face', () => {
    expect(seq(pushMove([m('R')], m('R')))).toBe('R2');
    expect(seq(pushMove([m('R2')], m('R')))).toBe("R'");
    expect(seq(pushMove([m('R')], m("R'")))).toBe('');
    expect(seq(pushMove([m('U'), m('R')], m("R'")))).toBe('U');
  });

  it('looks past turns of the opposite face', () => {
    expect(seq(pushMove([m('R'), m('L')], m("R'")))).toBe('L');
    expect(seq(pushMove([m('R'), m('U')], m("R'")))).toBe("R U R'");
  });
});

describe('F2L trainer', () => {
  const alg = "R U R' U' R U R'";

  it('follows the algorithm move by move', () => {
    let state = startTrainer(alg);
    expect(state.done).toBe(0);
    state = applyMove(state, m('R'));
    state = applyMove(state, m('U'));
    expect(state.done).toBe(2);
    expect(state.deviation).toEqual([]);
    expect(isSolved(state)).toBe(false);
    state = doMoves(alg, "R U R' U' R U R'");
    expect(state.done).toBe(7);
    expect(isSolved(state)).toBe(true);
  });

  it('shows a wrong move as a deviation until it is undone', () => {
    let state = doMoves(alg, 'R F');
    expect(state.done).toBe(1);
    expect(seq(state.deviation)).toBe('F');
    state = applyMove(state, m('U'));
    expect(seq(state.deviation)).toBe('F U');
    state = applyMove(state, m("U'"));
    state = applyMove(state, m("F'"));
    expect(state.deviation).toEqual([]);
    expect(state.done).toBe(1);
    state = applyMove(state, m('U'));
    expect(state.done).toBe(2);
  });

  it('takes two quarter turns as a half turn', () => {
    const state = doMoves("R2 U R2", 'R R U');
    expect(state.done).toBe(2);
    expect(state.deviation).toEqual([]);
  });

  it('turning the wrong way is a deviation of a half turn after the right way', () => {
    const state = doMoves(alg, "R U'");
    expect(state.done).toBe(1);
    expect(seq(state.deviation)).toBe("U'");
  });

  it('undoing the last correct move steps back', () => {
    let state = doMoves(alg, "R U U'");
    expect(state.done).toBe(1);
    expect(state.deviation).toEqual([]);
    state = undoMove(state);
    expect(state.done).toBe(2);
    state = undoMove(undoMove(state));
    expect(state.done).toBe(0);
    expect(state.history).toEqual([]);
    expect(undoMove(state)).toBe(state);
  });

  it('undo reverts a deviation', () => {
    let state = doMoves(alg, 'R F');
    state = undoMove(state);
    expect(state.deviation).toEqual([]);
    expect(state.done).toBe(1);
    expect(state.perm).toEqual(doMoves(alg, 'R').perm);
  });

  it.each(F2L_CASES.map((c) => [c.number, c.alg]))('case %i is solved by its algorithm', (_, alg) => {
    const state = doMoves(alg, alg);
    expect(state.done).toBe(state.alg.length);
    expect(state.deviation).toEqual([]);
    expect(isSolved(state)).toBe(true);
  });
});
