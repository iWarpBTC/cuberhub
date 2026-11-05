/**
 * Edge-level model of the white cross for the dry-practice trainers: where
 * each white edge is on a position (its slot and which way the white sticker
 * faces), and an exact optimal solver for any subset of the four cross
 * edges. The solver is a breadth-first search over the positions and
 * orientations of the tracked edges only (190 080 states for the whole
 * cross), so every distance it reports is the true optimum in face turns.
 *
 * The cube is held white down, as the 3D cube draws it: the cross edges live
 * in the D layer and their white sticker is their D facelet.
 */

import { applyAlgorithmTo, type Face } from './cube';
import { identityPerm, type Perm } from './f2l';
import { faceOf } from './geometry';
import { joinMoves } from './rotations';
import { generateScramble } from './scramble';

export const EDGE_SLOTS = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const;
export type EdgeSlot = (typeof EDGE_SLOTS)[number];

/** The two facelets of each slot: the U/D one first (F/B for the middle layer), then the other. */
export const EDGE_FACELETS: Record<EdgeSlot, readonly [number, number]> = {
  UR: [5, 10],
  UF: [7, 19],
  UL: [3, 37],
  UB: [1, 46],
  DR: [32, 16],
  DF: [28, 25],
  DL: [30, 43],
  DB: [34, 52],
  FR: [23, 12],
  FL: [21, 41],
  BL: [50, 39],
  BR: [48, 14],
};

export type CrossEdge = 'DF' | 'DR' | 'DB' | 'DL';

/** The white cross edges by their home slot, going round: green, orange, blue, red side. */
export const CROSS_EDGES: readonly CrossEdge[] = ['DF', 'DR', 'DB', 'DL'];

/** The side colour of a cross edge: the face its non-white sticker belongs to. */
export function crossEdgeSide(edge: CrossEdge): Face {
  return faceOf(EDGE_FACELETS[edge][1]);
}

export interface EdgePlace {
  slot: EdgeSlot;
  slotIndex: number;
  /** True for the slot's second facelet (the side sticker of a U/D edge, the R/L one of a middle edge). */
  secondary: boolean;
}

const PLACE_OF_FACELET = new Map<number, EdgePlace>();
EDGE_SLOTS.forEach((slot, slotIndex) => {
  const [primary, secondary] = EDGE_FACELETS[slot];
  PLACE_OF_FACELET.set(primary, { slot, slotIndex, secondary: false });
  PLACE_OF_FACELET.set(secondary, { slot, slotIndex, secondary: true });
});

/** The 24 edge facelets. */
export const EDGE_STICKERS: ReadonlySet<number> = new Set(PLACE_OF_FACELET.keys());

/** Which slot a facelet belongs to, or null for a corner or centre facelet. */
export function edgePlaceOf(facelet: number): EdgePlace | null {
  return PLACE_OF_FACELET.get(facelet) ?? null;
}

/** Both solved stickers of each of the given edges. */
export function edgeStickers(edges: readonly EdgeSlot[]): number[] {
  return edges.flatMap((e) => [...EDGE_FACELETS[e]]);
}

export interface EdgeLocation {
  /** The slot the edge sits in now. */
  slot: EdgeSlot;
  /** True when the white sticker is on the slot's second facelet: white to the side in the U/D layers, on R/L in the middle layer. */
  flipped: boolean;
  /** Where the white sticker is now. */
  whiteAt: number;
  /** The face the white sticker shows on. */
  whiteFace: Face;
  /** Where the edge's other sticker is now. */
  otherAt: number;
}

/** Where the edge that belongs in `edge` is on `perm` (perm[i] = solved position of the sticker now at i). */
export function locateEdge(perm: readonly number[], edge: EdgeSlot): EdgeLocation {
  const [white, other] = EDGE_FACELETS[edge];
  const whiteAt = perm.indexOf(white);
  const place = PLACE_OF_FACELET.get(whiteAt);
  if (place === undefined) throw new Error(`Sticker ${white} is not on an edge`);
  return { slot: place.slot, flipped: place.secondary, whiteAt, whiteFace: faceOf(whiteAt), otherAt: perm.indexOf(other) };
}

export function isEdgeSolved(perm: readonly number[], edge: EdgeSlot): boolean {
  const [white, other] = EDGE_FACELETS[edge];
  return perm[white] === white && perm[other] === other;
}

/** How many of the edges are in their slot the right way round. */
export function countSolved(perm: readonly number[], edges: readonly EdgeSlot[]): number {
  return edges.filter((e) => isEdgeSolved(perm, e)).length;
}

export function applyMoves(perm: readonly number[], moves: readonly string[]): Perm {
  return applyAlgorithmTo([...perm], moves.join(' '));
}

export function permOf(scramble: string): Perm {
  return applyAlgorithmTo(identityPerm(), scramble);
}

/** The 18 face turns, grouped by face. */
export const FACE_MOVES = [
  'U', "U'", 'U2',
  'D', "D'", 'D2',
  'R', "R'", 'R2',
  'L', "L'", 'L2',
  'F', "F'", 'F2',
  'B', "B'", 'B2',
] as const;

/**
 * Where each move takes a white sticker: EDGE_MOVE[m][slot * 2 + flipped]
 * is the code of the place it ends up in. Derived from the facelet
 * simulation so the two models can't drift apart.
 */
const EDGE_MOVE: readonly Uint8Array[] = FACE_MOVES.map((move) => {
  const tracked = applyAlgorithmTo(identityPerm(), move);
  const table = new Uint8Array(24);
  EDGE_SLOTS.forEach((slot, slotIndex) => {
    EDGE_FACELETS[slot].forEach((from, flipped) => {
      const to = tracked.indexOf(from);
      const place = PLACE_OF_FACELET.get(to)!;
      table[slotIndex * 2 + flipped] = place.slotIndex * 2 + (place.secondary ? 1 : 0);
    });
  });
  return table;
});

/**
 * A white edge's place as one number: its slot (index into EDGE_SLOTS) times
 * two, plus one when the white sticker is on the slot's second facelet.
 */
export function edgePlaceCode(perm: readonly number[], edge: EdgeSlot): number {
  const { slot, flipped } = locateEdge(perm, edge);
  return EDGE_SLOTS.indexOf(slot) * 2 + (flipped ? 1 : 0);
}

/** The place code after a face turn (`move` is an index into FACE_MOVES). */
export function movePlaceCode(place: number, move: number): number {
  return EDGE_MOVE[move]![place]!;
}

const BITS = 5;
const MASK = (1 << BITS) - 1;

/** Optimal solver for a fixed set of white edges (any subset of the cross). */
export class CrossSolver {
  readonly edges: readonly EdgeSlot[];
  private readonly dist: Uint8Array;

  constructor(edges: readonly EdgeSlot[]) {
    if (edges.length === 0 || edges.length > 4) throw new Error('Track 1 to 4 edges');
    this.edges = [...edges];
    const k = edges.length;
    this.dist = new Uint8Array(1 << (BITS * k)).fill(255);
    let reachable = 1 << k;
    for (let i = 0; i < k; i++) reachable *= 12 - i;
    const queue = new Int32Array(reachable);
    const start = this.encode(identityPerm());
    this.dist[start] = 0;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const code = queue[head++]!;
      const next = this.dist[code]! + 1;
      for (let m = 0; m < FACE_MOVES.length; m++) {
        const moved = this.step(code, m);
        if (this.dist[moved] === 255) {
          this.dist[moved] = next;
          queue[tail++] = moved;
        }
      }
    }
  }

  private encode(perm: readonly number[]): number {
    let code = 0;
    this.edges.forEach((edge, i) => {
      const { slot, flipped } = locateEdge(perm, edge);
      code |= (EDGE_SLOTS.indexOf(slot) * 2 + (flipped ? 1 : 0)) << (BITS * i);
    });
    return code;
  }

  private step(code: number, move: number): number {
    const table = EDGE_MOVE[move]!;
    let out = 0;
    for (let i = 0; i < this.edges.length; i++) {
      out |= table[(code >> (BITS * i)) & MASK]! << (BITS * i);
    }
    return out;
  }

  /** The least number of face turns that solve the tracked edges from `perm`. */
  distance(perm: readonly number[]): number {
    return this.dist[this.encode(perm)]!;
  }

  /** Every first move that is the start of an optimal solution (none when solved). */
  firstMoves(perm: readonly number[]): string[] {
    const code = this.encode(perm);
    return this.optimalMovesFrom(code).map((m) => FACE_MOVES[m]!);
  }

  private optimalMovesFrom(code: number): number[] {
    const d = this.dist[code]!;
    if (d === 0) return [];
    const moves: number[] = [];
    for (let m = 0; m < FACE_MOVES.length; m++) if (this.dist[this.step(code, m)] === d - 1) moves.push(m);
    return moves;
  }

  /**
   * One optimal solution. `pick(n)` chooses among the n optimal moves at
   * each step (index 0..n-1); the default takes the first, so the result is
   * deterministic.
   */
  solve(perm: readonly number[], pick: (n: number) => number = () => 0): string[] {
    let code = this.encode(perm);
    const solution: string[] = [];
    for (;;) {
      const options = this.optimalMovesFrom(code);
      if (options.length === 0) return solution;
      const m = options[Math.min(options.length - 1, Math.max(0, Math.floor(pick(options.length))))]!;
      solution.push(FACE_MOVES[m]!);
      code = this.step(code, m);
    }
  }

  /**
   * Every solution of the tracked edges that is at most `extra` moves longer
   * than the optimum, shortest first (at most `limit` of them). Left out are
   * the ones nobody would turn: a face turned twice in a row, two opposite
   * faces in the other order (U D is listed, D U is not), a turn that moves
   * none of the tracked edges, and anything that passes through the solved
   * state before its last move.
   */
  solutions(perm: readonly number[], extra = 0, limit = Infinity): string[][] {
    const start = this.encode(perm);
    const found: string[][] = [];
    const path: number[] = [];
    const search = (code: number, left: number): void => {
      if (found.length >= limit) return;
      if (this.dist[code] === 0) {
        if (left === 0) found.push(path.map((m) => FACE_MOVES[m]!));
        return;
      }
      const last = path.length === 0 ? -1 : Math.floor(path[path.length - 1]! / 3);
      for (let m = 0; m < FACE_MOVES.length; m++) {
        const face = Math.floor(m / 3);
        // Faces come in opposite pairs in FACE_MOVES: U D, R L, F B.
        if (face === last || (last >= 0 && face >> 1 === last >> 1 && face < last)) continue;
        const moved = this.step(code, m);
        if (moved === code || this.dist[moved]! > left - 1) continue;
        path.push(m);
        search(moved, left - 1);
        path.pop();
      }
    };
    const optimal = this.dist[start]!;
    for (let length = optimal; length <= optimal + extra; length++) search(start, length);
    return found;
  }
}

const SOLVERS = new Map<string, CrossSolver>();

/** The (cached) solver for a set of edges; the order of the edges doesn't matter. */
export function crossSolver(edges: readonly EdgeSlot[]): CrossSolver {
  const key = [...edges].sort().join(',');
  let solver = SOLVERS.get(key);
  if (solver === undefined) {
    solver = new CrossSolver(edges);
    SOLVERS.set(key, solver);
  }
  return solver;
}

export interface CrossTask {
  /** The moves that produce the position (a scramble, possibly with a few solving moves appended). */
  scramble: string;
  perm: Perm;
  /** One optimal solution of the tracked edges. */
  optimal: string[];
}

/**
 * A random position whose tracked edges need exactly `target` face turns
 * (when a scramble that hard turns up within a few tries; otherwise the
 * hardest found). A random scramble is reduced to the target by applying
 * the first moves of its optimal solution, so the rest of the cube stays
 * scrambled.
 */
export function scrambleForCross(edges: readonly EdgeSlot[], target: number, random: () => number = Math.random): CrossTask {
  const solver = crossSolver(edges);
  const pick = (n: number) => Math.floor(random() * n);
  let best: { scramble: string; perm: Perm; solution: string[] } | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const scramble = generateScramble();
    const perm = permOf(scramble);
    const solution = solver.solve(perm, pick);
    if (best === null || solution.length > best.solution.length) best = { scramble, perm, solution };
    if (solution.length >= target) break;
  }
  const { scramble, solution } = best!;
  const applied = solution.slice(0, Math.max(0, solution.length - target));
  const tidy = joinMoves([...scramble.split(' '), ...applied]);
  const perm = permOf(tidy);
  return { scramble: tidy, perm, optimal: solver.solve(perm, pick) };
}
