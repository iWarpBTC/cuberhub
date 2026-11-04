import { describe, expect, it } from 'vitest';
import {
  CROSS_EDGES,
  EDGE_FACELETS,
  EDGE_SLOTS,
  FACE_MOVES,
  applyMoves,
  countSolved,
  crossEdgeSide,
  crossSolver,
  edgePlaceOf,
  isEdgeSolved,
  locateEdge,
  permOf,
  scrambleForCross,
} from './cross';
import { identityPerm } from './f2l';
import { generateScramble } from './scramble';

describe('edge model', () => {
  it('finds every edge in its own slot on a solved cube', () => {
    for (const slot of EDGE_SLOTS) {
      const location = locateEdge(identityPerm(), slot);
      expect(location.slot).toBe(slot);
      expect(location.flipped).toBe(false);
    }
    expect(locateEdge(identityPerm(), 'DF').whiteFace).toBe('D');
    expect(CROSS_EDGES.map(crossEdgeSide)).toEqual(['F', 'R', 'B', 'L']);
  });

  it('every move keeps the two stickers of an edge together', () => {
    for (const move of FACE_MOVES) {
      const perm = permOf(move);
      for (const slot of EDGE_SLOTS) {
        const location = locateEdge(perm, slot);
        const other = edgePlaceOf(location.otherAt);
        expect(other?.slot).toBe(location.slot);
        expect(other?.secondary).toBe(!location.flipped);
      }
    }
  });

  it('F takes the white-green edge to FL with white on the left face', () => {
    const location = locateEdge(permOf('F'), 'DF');
    expect(location.slot).toBe('FL');
    expect(location.flipped).toBe(true);
    expect(location.whiteFace).toBe('L');
    expect(location.whiteAt).toBe(EDGE_FACELETS.FL[1]);
    expect(isEdgeSolved(permOf('F'), 'DF')).toBe(false);
    expect(isEdgeSolved(permOf('F'), 'DB')).toBe(true);
    expect(countSolved(permOf('F'), CROSS_EDGES)).toBe(3);
  });

  it('U moves never disturb the cross', () => {
    expect(countSolved(permOf("U R U' R' U2"), CROSS_EDGES)).toBe(4);
    expect(countSolved(permOf('R F'), CROSS_EDGES)).toBe(2);
    expect(countSolved(permOf('U U2 U\''), CROSS_EDGES)).toBe(4);
  });
});

describe('cross solver', () => {
  const solver = crossSolver(CROSS_EDGES);

  it('reports zero for a solved cross and one for a single turn', () => {
    expect(solver.distance(identityPerm())).toBe(0);
    expect(solver.solve(identityPerm())).toEqual([]);
    expect(solver.distance(permOf('F'))).toBe(1);
    expect(solver.solve(permOf('F'))).toEqual(["F'"]);
    expect(solver.firstMoves(permOf('F'))).toEqual(["F'"]);
    expect(solver.distance(permOf('U'))).toBe(0);
  });

  it('solves random scrambles within eight moves and the solution really solves the cross', () => {
    for (let i = 0; i < 30; i++) {
      const perm = permOf(generateScramble());
      const solution = solver.solve(perm, (n) => Math.floor(Math.random() * n));
      expect(solution.length).toBe(solver.distance(perm));
      expect(solution.length).toBeLessThanOrEqual(8);
      expect(countSolved(applyMoves(perm, solution), CROSS_EDGES)).toBe(4);
    }
  });

  it('is optimal: no shorter sequence solves short cases (brute force)', () => {
    const shorter = (perm: readonly number[], depth: number): boolean => {
      if (countSolved(perm, CROSS_EDGES) === 4) return true;
      if (depth === 0) return false;
      return FACE_MOVES.some((m) => shorter(applyMoves(perm, [m]), depth - 1));
    };
    for (const scramble of ["R F' D L2", "F U R D' B", "L2 D R' F2 U'", 'R U F D L']) {
      const perm = permOf(scramble);
      const d = solver.distance(perm);
      expect(d).toBeGreaterThan(0);
      expect(shorter(perm, d)).toBe(true);
      expect(shorter(perm, d - 1)).toBe(false);
    }
  });

  it('solves subsets of the cross on their own', () => {
    const one = crossSolver(['DF']);
    expect(one.distance(permOf("R U R'"))).toBe(0);
    expect(one.distance(permOf('F R'))).toBeGreaterThanOrEqual(1);
    const perm = permOf(generateScramble());
    const two = crossSolver(['DF', 'DB']);
    const solution = two.solve(perm);
    expect(countSolved(applyMoves(perm, solution), ['DF', 'DB'])).toBe(2);
    expect(two.distance(perm)).toBeLessThanOrEqual(solver.distance(perm));
    expect(crossSolver(['DB', 'DF'])).toBe(two);
  });

  it('builds positions of a wanted difficulty', () => {
    for (const target of [1, 2, 3, 4, 5]) {
      const task = scrambleForCross(CROSS_EDGES, target);
      expect(task.optimal.length).toBe(target);
      expect(solver.distance(task.perm)).toBe(target);
      expect(permOf(task.scramble)).toEqual(task.perm);
    }
    const mini = scrambleForCross(['DL'], 2);
    expect(mini.optimal.length).toBe(2);
  });
});
