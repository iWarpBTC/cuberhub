import { describe, expect, it } from 'vitest';
import { CROSS_EDGES, FACE_MOVES, applyMoves, countSolved, crossSolver, locateEdge, permOf, type CrossEdge } from './cross';
import {
  COST,
  HOLDS,
  HOLD_ROTATION,
  MAX_EXTRA,
  analyzeCross,
  evaluateAttempt,
  explainSolution,
  holdFront,
  holdMove,
  holdSpot,
  parseSolution,
  scrambleWhiteDown,
  type MoveNote,
  type TrainerSolution,
} from './crossTrainer';
import { applyAlgorithm, applyAlgorithmTo, applyScramble, invertAlgorithm, type Face } from './cube';
import { faceOf } from './geometry';
import { generateScramble } from './scramble';

const SCRAMBLES = [
  "F' R D L2 F' D' R B' U' R U F2 R B U2 R2 D L2 D2 F",
  "F U2 D2 B' D' R2 F' B2 D2 U' R B' F2 R2 L B U' R L2 U2",
  "L' R' F' L' U2 R B' D' F' L F' R' F D R2 L U2 D B' F2",
  ...Array.from({ length: 25 }, () => generateScramble()),
];

/** The position the trainer works on: the scramble done white up, the cube then turned white down. */
function startOf(scramble: string): number[] {
  return permOf(scrambleWhiteDown(scramble));
}

function solves(start: readonly number[], moves: readonly string[]): boolean {
  return countSolved(applyMoves(start, moves), CROSS_EDGES) === 4;
}

/** In the bottom layer with white down, wherever round the ring. */
function isPlaced(perm: readonly number[], edge: CrossEdge): boolean {
  const { slot, flipped } = locateEdge(perm, edge);
  return slot[0] === 'D' && !flipped;
}

function notes(solution: TrainerSolution): Array<{ index: number; note: MoveNote }> {
  return solution.steps.flatMap((step) => step.moves.flatMap(({ index, notes }) => notes.map((note) => ({ index, note }))));
}

describe('CrossSolver.solutions', () => {
  it('lists every solution up to the given length once, shortest first', () => {
    const solver = crossSolver(CROSS_EDGES);
    for (const scramble of SCRAMBLES.slice(0, 8)) {
      const perm = permOf(scramble);
      const optimal = solver.distance(perm);
      const all = solver.solutions(perm, 1);
      expect(all.length).toBeGreaterThan(0);
      expect(all[0]!.length).toBe(optimal);
      expect(new Set(all.map((moves) => moves.join(' '))).size).toBe(all.length);
      let previous = 0;
      for (const moves of all) {
        expect(moves.length).toBeGreaterThanOrEqual(previous);
        expect(moves.length).toBeLessThanOrEqual(optimal + 1);
        expect(solves(perm, moves)).toBe(true);
        previous = moves.length;
      }
      // Every listed shortest solution starts with a move the solver calls optimal.
      const firstMoves = new Set(solver.firstMoves(perm));
      for (const moves of all) if (moves.length === optimal) expect(firstMoves.has(moves[0]!)).toBe(true);
    }
  });

  it('gives the empty solution for a solved cross and respects the limit', () => {
    const solver = crossSolver(CROSS_EDGES);
    expect(solver.solutions(permOf('U'), 2)).toEqual([[]]);
    expect(solver.solutions(permOf(SCRAMBLES[0]!), 2, 5)).toHaveLength(5);
  });
});

describe('analyzeCross', () => {
  it('finds a shortest and a recommended solution that both solve the cross', () => {
    const solver = crossSolver(CROSS_EDGES);
    for (const scramble of SCRAMBLES) {
      const analysis = analyzeCross(scramble);
      const optimal = solver.distance(startOf(scramble));
      expect(analysis.perm).toEqual(startOf(scramble));
      expect(analysis.optimalLength).toBe(optimal);
      expect(analysis.shortest.moves).toHaveLength(optimal);
      expect(analysis.shortest.extra).toBe(0);
      expect(analysis.recommended.moves.length).toBeLessThanOrEqual(optimal + MAX_EXTRA);
      expect(analysis.recommended.metrics.cost).toBeLessThanOrEqual(analysis.shortest.metrics.cost);
      for (const solution of [analysis.shortest, analysis.recommended, ...analysis.alternatives]) {
        expect(solves(analysis.perm, solution.moves)).toBe(true);
        expect(solution.metrics.cost).toBeGreaterThanOrEqual(analysis.recommended.metrics.cost);
      }
      // A longer recommendation has to say what it wins.
      if (analysis.recommended === analysis.shortest) expect(analysis.reasons).toEqual([]);
      else expect(analysis.recommended.moves.length).toBeGreaterThan(optimal);
    }
  });

  it('cuts every solution into steps that cover its moves in order', () => {
    for (const scramble of SCRAMBLES) {
      const analysis = analyzeCross(scramble);
      for (const solution of [analysis.shortest, analysis.recommended]) {
        expect(solution.steps.flatMap((step) => step.moves.map((move) => move.move))).toEqual(solution.moves);
        let at = 0;
        for (const step of solution.steps) {
          expect(step.start).toBe(at);
          expect(step.end).toBeGreaterThan(step.start);
          at = step.end;
          if (step.kind === 'insert') expect(step.settles.length).toBeGreaterThan(0);
          else expect(step.moves.at(-1)!.move[0]).toBe('D');
        }
        expect(at).toBe(solution.moves.length);
        // Every edge is settled by exactly one step, or was right from the start.
        const settled = solution.steps.flatMap((step) => step.settles);
        const kept = CROSS_EDGES.filter((_, e) => solution.settledAt[e] === 0);
        expect([...settled, ...kept].sort()).toEqual([...CROSS_EDGES].sort());
      }
    }
  });

  it('only says what the position shows', () => {
    for (const scramble of SCRAMBLES) {
      const analysis = analyzeCross(scramble);
      const start = startOf(scramble);
      for (const read of analysis.read.edges) {
        const location = locateEdge(start, read.edge);
        expect(read.spot).toEqual({ slot: location.slot, whiteFace: location.whiteFace });
        expect(read.cls === 'placed').toBe(isPlaced(start, read.edge));
        // A good edge's drop move really puts it into the bottom layer white down.
        if (read.drop !== null) expect(isPlaced(applyMoves(start, [read.drop]), read.edge)).toBe(true);
        else if (read.cls !== 'placed') {
          for (const move of ['R', "R'", 'R2', 'L', "L'", 'L2', 'F', "F'", 'F2', 'B', "B'", 'B2', 'U', "U'", 'U2']) {
            expect(isPlaced(applyMoves(start, [move]), read.edge)).toBe(false);
          }
        }
      }
      for (const solution of [analysis.shortest, analysis.recommended]) {
        for (const { index, note } of notes(solution)) {
          const before = applyMoves(start, solution.moves.slice(0, index));
          const after = applyMoves(start, solution.moves.slice(0, index + 1));
          switch (note.kind) {
            case 'insert':
              for (const edge of note.edges) {
                expect(isPlaced(before, edge)).toBe(false);
                // From here on the edge never leaves the bottom layer.
                for (let k = index + 1; k <= solution.moves.length; k++) {
                  expect(isPlaced(applyMoves(start, solution.moves.slice(0, k)), edge)).toBe(true);
                }
              }
              for (const edge of note.relativeTo) expect(isPlaced(before, edge)).toBe(true);
              break;
            case 'ready': {
              // The named turn would put the edge in for good: the rest of the cross then needs only D turns for it.
              const dropped = applyMoves(after, [note.drop]);
              expect(isPlaced(after, note.edge)).toBe(false);
              expect(isPlaced(dropped, note.edge)).toBe(true);
              expect(locateEdge(dropped, note.edge).slot).toBe(`D${note.side}`);
              break;
            }
            case 'orient':
            case 'move':
            case 'takeOut':
            case 'park': {
              const location = locateEdge(after, note.edge);
              expect(note.spot).toEqual({ slot: location.slot, whiteFace: location.whiteFace });
              if (note.kind === 'takeOut') expect(isPlaced(before, note.edge)).toBe(true);
              if (note.kind === 'park') expect(isPlaced(after, note.edge)).toBe(true);
              break;
            }
            case 'lift':
              expect(isPlaced(before, note.edge)).toBe(true);
              expect(isPlaced(after, note.edge)).toBe(false);
              expect(solution.moves[note.returns]).toBe(note.returnMove);
              break;
            case 'carry':
              for (const edge of note.edges) expect(isPlaced(after, edge)).toBe(true);
              break;
            case 'align':
              expect(countSolved(after, CROSS_EDGES)).toBe(4);
              break;
          }
        }
      }
    }
  });

  it('reads a relative cross: the first edge goes anywhere, D matches the centres', () => {
    // Held white down this is D F': undone by F (white-red drops in next to white-green) and then D' (the centres).
    const analysis = analyzeCross("U F'");
    expect(analysis.optimalLength).toBe(2);
    expect(analysis.shortest.moves).toEqual(['F', "D'"]);
    const [insert, align] = analysis.shortest.steps;
    expect(insert!.kind).toBe('insert');
    expect(insert!.moves[0]!.notes[0]).toMatchObject({ kind: 'insert', home: false });
    expect(align!.kind).toBe('align');
    expect(analysis.shortest.patterns.some((pattern) => pattern.kind === 'relative')).toBe(true);
    expect(analysis.read.groups[0]).toHaveLength(3);
  });

  it('prefers an easier turn over a shorter solution only when it pays', () => {
    // One turn solves it: nothing friendlier is worth two more moves.
    const single = analyzeCross('B');
    expect(single.recommended).toBe(single.shortest);
    expect(single.shortest.moves).toEqual(["B'"]);
  });

  it('explains a solution typed by hand', () => {
    const scramble = SCRAMBLES[0]!;
    const analysis = analyzeCross(scramble);
    const again = explainSolution(analysis.perm, analysis.recommended.moves, analysis.optimalLength);
    expect(again).toEqual(analysis.recommended);
    expect(() => explainSolution(analysis.perm, ['R'])).toThrow();
  });
});

describe('the scramble', () => {
  // The colours of the timer's net (white up, green in front) and of the 3D cube (white down, green in front).
  const NET: Record<Face, string> = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
  const CUBE: Record<Face, string> = { U: 'yellow', D: 'white', F: 'green', B: 'blue', R: 'orange', L: 'red' };

  it('is done white up and green in front, then the cube is turned white down', () => {
    expect(scrambleWhiteDown("R U' F2 D L B'")).toBe("L D' F2 U R B'");
    for (const scramble of SCRAMBLES) {
      // What the timer's net shows for the scramble, with the real cube then turned over (z2).
      const turnedOver = applyAlgorithmTo(applyScramble(scramble), 'z2');
      const { perm } = analyzeCross(scramble);
      for (let i = 0; i < 54; i++) expect(CUBE[faceOf(perm[i]!)]).toBe(NET[turnedOver[i]!]);
    }
  });

  it('puts the white centre down and keeps green in front', () => {
    const { perm } = analyzeCross(SCRAMBLES[0]!);
    expect(CUBE[faceOf(perm[31]!)]).toBe('white');
    expect(CUBE[faceOf(perm[22]!)]).toBe('green');
  });
});

describe('holds', () => {
  it('rewrites a move the way a rotated cube turns it', () => {
    for (const hold of HOLDS) {
      const rotation = HOLD_ROTATION[hold];
      for (const move of FACE_MOVES) {
        const inHand = rotation === '' ? holdMove(move, hold) : `${rotation} ${holdMove(move, hold)} ${invertAlgorithm(rotation)}`;
        expect(applyAlgorithm(inHand)).toEqual(applyAlgorithm(move));
      }
    }
    // Orange in front: the cube's R is the hands' F.
    expect(holdFront(1)).toBe('R');
    expect(holdMove("R'", 1)).toBe("F'");
    expect(holdMove('U2', 1)).toBe('U2');
    expect(holdSpot({ slot: 'FR', whiteFace: 'R' }, 1)).toEqual({ slot: 'FL', whiteFace: 'F' });
  });

  it('names a spot as it is on the rotated cube', () => {
    const perm = permOf(SCRAMBLES[0]!);
    for (const hold of HOLDS) {
      const rotated = applyAlgorithmTo([...perm], HOLD_ROTATION[hold]);
      for (const edge of CROSS_EDGES) {
        const here = locateEdge(perm, edge);
        const there = locateEdge(rotated, edge);
        expect(holdSpot({ slot: here.slot, whiteFace: here.whiteFace }, hold)).toEqual({ slot: there.slot, whiteFace: there.whiteFace });
      }
    }
  });

  it('turns the cube instead of turning the back face', () => {
    // B' with green in front; with orange in front the same turn is R'.
    const { shortest } = analyzeCross('B');
    expect(shortest.hold).toBe(1);
    expect(shortest.handMoves).toEqual(["R'"]);
    expect(shortest.metrics).toMatchObject({ back: 0, front: 0 });
    expect(shortest.greenFront).toEqual({ back: 1, front: 0 });
    // R' is as good as it gets: the cube stays as the scramble left it. (The scramble's L is the R of the cube turned over.)
    expect(analyzeCross('L').shortest).toMatchObject({ hold: 0, handMoves: ["R'"] });
  });

  it('gives every solution the hold its turns are easiest in', () => {
    const faceCost = (moves: readonly string[]) => moves.reduce((sum, move) => sum + COST.face[move[0] as keyof typeof COST.face], 0);
    for (const scramble of SCRAMBLES) {
      const analysis = analyzeCross(scramble);
      for (const solution of [analysis.shortest, analysis.recommended, ...analysis.alternatives]) {
        const { hold, moves, handMoves, metrics } = solution;
        expect(metrics.hold).toBe(hold);
        expect(handMoves).toEqual(moves.map((move) => holdMove(move, hold)));
        expect(metrics.back).toBe(handMoves.filter((move) => move[0] === 'B').length);
        expect(metrics.front).toBe(handMoves.filter((move) => move[0] === 'F').length);
        // Turned in the hands of a cube rotated into the hold, the moves solve the cross.
        const rotation = HOLD_ROTATION[hold];
        const done = applyAlgorithmTo([...analysis.perm], `${rotation} ${handMoves.join(' ')} ${rotation === '' ? '' : invertAlgorithm(rotation)}`);
        expect(countSolved(done, CROSS_EDGES)).toBe(4);
        // No other hold is cheaper: turning the cube in inspection is free.
        const own = faceCost(handMoves);
        for (const other of HOLDS) expect(own).toBeLessThanOrEqual(faceCost(moves.map((move) => holdMove(move, other))) + 1e-9);
      }
    }
  });

});

describe("a solution of one's own", () => {
  it('reads typed face turns and refuses anything else', () => {
    expect(parseSolution("R' F  D2")).toEqual({ ok: true, moves: ["R'", 'F', 'D2'] });
    expect(parseSolution("RUR'U'")).toEqual({ ok: true, moves: ['R', 'U', "R'", "U'"] });
    expect(parseSolution('R R F')).toEqual({ ok: true, moves: ['R2', 'F'] });
    expect(parseSolution('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseSolution("R R'")).toEqual({ ok: false, reason: 'empty' });
    // Lowercase would be a wide move or a rotation, not a face turn.
    expect(parseSolution('R u F')).toEqual({ ok: false, reason: 'invalid', token: 'u' });
    expect(parseSolution("y R U")).toEqual({ ok: false, reason: 'invalid', token: 'y' });
    expect(parseSolution('R M2 U')).toEqual({ ok: false, reason: 'invalid', token: 'M2' });
  });

  it('recognizes the recommended solution and ranks it first', () => {
    for (const scramble of SCRAMBLES.slice(0, 10)) {
      const analysis = analyzeCross(scramble);
      const { recommended } = analysis;
      const attempt = evaluateAttempt(analysis, recommended.handMoves, recommended.hold);
      expect(attempt).toMatchObject({ solved: true, own: recommended.moves.length, finish: [], inPlace: 4, same: 'recommended', rank: 1, easierHold: null, reasons: [] });
      expect(attempt.solution).toEqual(recommended);
    }
  });

  it('takes the moves as turned in the hold they were given in', () => {
    const analysis = analyzeCross(SCRAMBLES[1]!);
    const { shortest } = analysis;
    for (const hold of HOLDS) {
      const attempt = evaluateAttempt(analysis, shortest.moves.map((move) => holdMove(move, hold)), hold);
      expect(attempt.solved).toBe(true);
      expect(attempt.solution.moves).toEqual(shortest.moves);
      expect(attempt.solution.hold).toBe(hold);
      expect(attempt.solution.handMoves).toEqual(shortest.moves.map((move) => holdMove(move, hold)));
      // Held any other way than its best, the same solution costs at least as much, and the trainer says which hold is easier.
      expect(attempt.solution.metrics.cost).toBeGreaterThanOrEqual(shortest.metrics.cost);
      if (attempt.solution.metrics.cost > shortest.metrics.cost) expect(attempt.easierHold).toBe(shortest.hold);
      else expect(attempt.easierHold).toBeNull();
    }
  });

  it('measures a longer solution against the recommended one', () => {
    for (const scramble of SCRAMBLES.slice(0, 10)) {
      const analysis = analyzeCross(scramble);
      const { recommended } = analysis;
      // The recommended moves with a wasted turn of the top layer after the cross is done.
      const attempt = evaluateAttempt(analysis, [...recommended.handMoves, 'U'], recommended.hold);
      expect(attempt.solved).toBe(true);
      expect(attempt.same).toBeNull();
      expect(attempt.solution.metrics.moves).toBe(recommended.moves.length + 1);
      expect(attempt.solution.extra).toBe(recommended.extra + 1);
      expect(attempt.solution.metrics.cost).toBeGreaterThan(recommended.metrics.cost);
      expect(attempt.rank).toBeGreaterThan(1);
      // The wasted turn is its own step with nothing to say about the cross edges.
      expect(attempt.solution.steps.at(-1)!.moves.at(-1)).toMatchObject({ move: 'U', notes: [] });
    }
  });

  it('finishes a solution that stops short and says what was missing', () => {
    for (const scramble of SCRAMBLES.slice(0, 10)) {
      const analysis = analyzeCross(scramble);
      const { shortest } = analysis;
      const attempt = evaluateAttempt(analysis, shortest.handMoves.slice(0, -1), shortest.hold);
      expect(attempt.solved).toBe(false);
      expect(attempt.own).toBe(shortest.moves.length - 1);
      // The edges counted as in are the ones the trainer's own reading had settled by then:
      // all four when only the closing D turn is missing.
      expect(attempt.inPlace).toBe(shortest.settledAt.filter((t) => t <= attempt.own).length);
      if (shortest.moves.at(-1)![0] === 'D') expect(attempt.inPlace).toBe(4);
      else expect(attempt.inPlace).toBeLessThan(4);
      // One move from solved, there is only one way to finish.
      expect(attempt.finish).toEqual(shortest.moves.slice(-1));
      expect(attempt.solution.moves).toEqual(shortest.moves);
      expect(countSolved(applyMoves(analysis.perm, attempt.solution.moves), CROSS_EDGES)).toBe(4);
    }
    // Moves that have nothing to do with the cross are finished with a whole solution.
    const analysis = analyzeCross(SCRAMBLES[0]!);
    const lost = evaluateAttempt(analysis, ['U'], 0);
    expect(lost.solved).toBe(false);
    expect(countSolved(applyMoves(analysis.perm, lost.solution.moves), CROSS_EDGES)).toBe(4);
  });
});
