/**
 * Cross Trainer: for a scramble, the shortest white cross and the one a
 * person would rather plan and turn, with the reasoning behind every move.
 *
 * Nothing here is written by hand per position. The solver in `cross.ts`
 * lists every solution up to two moves over the optimum; each one is then
 * played through on the edge model and read the way the cross guides teach
 * it (cubefreak.net, speedcubelab.com):
 *
 *  - an edge is *good* when one turn drops it into the bottom layer white
 *    down (it is in the middle layer, or in the top layer white up) and
 *    *bad* when its white sticker faces the side in the top or bottom layer;
 *  - the cross is built *relative*: edges only have to be right against
 *    each other, a D turn matches them to the centres. So every moment of a
 *    solution has a "frame", the D offset an edge must have now to end up
 *    solved, and an edge in the bottom layer is *aligned* when it has it;
 *  - an edge is *settled* from the move after which it stays aligned to the
 *    end. Those moves cut the solution into steps: a few setup turns, then
 *    the turn that puts one edge (or two) into the cross.
 *
 * The notes on a move are the differences between the position before and
 * after it, and the score that picks the recommended solution counts things
 * found the same way: awkward turns, edges that have to be followed through
 * other edges' moves, solved slots that are broken again.
 *
 * How awkward a turn is depends on how the cube is held, and that is free
 * to choose in inspection: white stays down, any of the four side colours
 * can be in front. So every solution is scored in all four *holds* and
 * comes with its best one. The simulation never rotates: moves, slots and
 * notes here are in the cube's own frame (green in front), and `holdMove`,
 * `holdSpot` rewrite them the way the hands see them.
 */

import type { Face } from './cube';
import {
  CROSS_EDGES,
  EDGE_FACELETS,
  EDGE_SLOTS,
  FACE_MOVES,
  applyMoves,
  crossEdgeSide,
  crossSolver,
  edgePlaceCode,
  movePlaceCode,
  permOf,
  type CrossEdge,
  type EdgeSlot,
} from './cross';
import type { Perm } from './f2l';
import { faceOf } from './geometry';
import { joinMoves, withoutRotations } from './rotations';
import { parseCustomScramble } from './scramble';

/** How an edge lies, as far as getting it into the cross goes. */
export type EdgeClass = 'placed' | 'topUp' | 'middle' | 'topSide' | 'bottomSide';

export function isGoodClass(cls: EdgeClass): boolean {
  return cls === 'topUp' || cls === 'middle';
}

const PLACES = EDGE_SLOTS.length * 2;
const MOVE_INDEX = new Map<string, number>(FACE_MOVES.map((move, i) => [move, i]));
const MOVE_FACE: readonly Face[] = FACE_MOVES.map((move) => move[0] as Face);
/** Quarter turns of FACE_MOVES[m], by m % 3: X, X', X2. */
const QUARTERS = [1, 3, 2] as const;

const CLASS: readonly EdgeClass[] = Array.from({ length: PLACES }, (_, place) => {
  const layer = EDGE_SLOTS[place >> 1]![0];
  const flipped = (place & 1) === 1;
  if (layer === 'U') return flipped ? 'topSide' : 'topUp';
  if (layer === 'D') return flipped ? 'bottomSide' : 'placed';
  return 'middle';
});

/** For a place in the bottom layer, white down: which cross slot it is, going round like CROSS_EDGES; -1 elsewhere. */
const RING = new Int8Array(PLACES).fill(-1);
CROSS_EDGES.forEach((edge, i) => {
  RING[EDGE_SLOTS.indexOf(edge) * 2] = i;
});

/** The side face above each cross slot: green, orange, blue, red. */
const RING_SIDE: readonly Face[] = CROSS_EDGES.map(crossEdgeSide);

/** How far each move turns the bottom layer round the ring (0 for anything but D). */
const FRAME_SHIFT: readonly number[] = (() => {
  const one = RING[movePlaceCode(EDGE_SLOTS.indexOf(CROSS_EDGES[0]!) * 2, MOVE_INDEX.get('D')!)]!;
  return FACE_MOVES.map((move, m) => (move[0] === 'D' ? (one * QUARTERS[m % 3]!) % 4 : 0));
})();

/** The one turn that drops a good edge into the bottom layer white down, and the slot it lands in; -1 for other places. */
const DROP_MOVE = new Int8Array(PLACES).fill(-1);
const DROP_RING = new Int8Array(PLACES).fill(-1);
for (let place = 0; place < PLACES; place++) {
  if (CLASS[place] === 'placed') continue;
  for (let m = 0; m < FACE_MOVES.length; m++) {
    const after = movePlaceCode(place, m);
    if (MOVE_FACE[m] !== 'D' && CLASS[after] === 'placed') {
      DROP_MOVE[place] = m;
      DROP_RING[place] = RING[after]!;
    }
  }
}

const mod4 = (n: number) => ((n % 4) + 4) % 4;

/** Where an edge is: its slot and the face its white sticker shows on. */
export interface EdgeSpot {
  slot: EdgeSlot;
  whiteFace: Face;
}

function spotOf(place: number): EdgeSpot {
  const slot = EDGE_SLOTS[place >> 1]!;
  return { slot, whiteFace: faceOf(EDGE_FACELETS[slot][place & 1]!) };
}

/** A solution played through on the edge model. */
interface Trace {
  moves: readonly number[];
  n: number;
  /** places[t * 4 + e]: where cross edge e is after t moves. */
  places: Uint8Array;
  /** frame[t]: the D offset an edge in the bottom layer must have after t moves to end up solved. */
  frame: Uint8Array;
  /** settledAt[e]: the number of moves after which edge e stays in the cross for good. */
  settledAt: number[];
}

function traceOf(start: readonly number[], moves: readonly number[]): Trace {
  const n = moves.length;
  const places = new Uint8Array((n + 1) * 4);
  for (let e = 0; e < 4; e++) places[e] = start[e]!;
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 4; e++) places[(t + 1) * 4 + e] = movePlaceCode(places[t * 4 + e]!, moves[t]!);
  }
  const frame = new Uint8Array(n + 1);
  for (let t = n - 1; t >= 0; t--) frame[t] = mod4(frame[t + 1]! - FRAME_SHIFT[moves[t]!]!);
  const trace: Trace = { moves, n, places, frame, settledAt: [0, 0, 0, 0] };
  for (let e = 0; e < 4; e++) {
    let t = n;
    while (t > 0 && isAligned(trace, t - 1, e)) t--;
    trace.settledAt[e] = t;
  }
  return trace;
}

/** In the bottom layer, white down, in the slot that ends up as its own. */
function isAligned(trace: Trace, t: number, e: number): boolean {
  const ring = RING[trace.places[t * 4 + e]!]!;
  return ring >= 0 && mod4(ring - e) === trace.frame[t];
}

/** One turn away from its own slot. */
function isReady(trace: Trace, t: number, e: number): boolean {
  const ring = DROP_RING[trace.places[t * 4 + e]!]!;
  return ring >= 0 && mod4(ring - e) === trace.frame[t];
}

/** The move counts after which an edge settles, in order: the ends of the steps. */
function boundariesOf(trace: Trace): number[] {
  return [...new Set(trace.settledAt.filter((t) => t > 0))].sort((a, b) => a - b);
}

/**
 * How the cube is held, white down: the number of y rotations from green in
 * front. 0 green, 1 orange (y), 2 blue (y2), 3 red (y') in front.
 */
export type Hold = 0 | 1 | 2 | 3;

/** The holds in the order they win a tie: green in front, then a quarter turn either way, then the half turn. */
export const HOLDS: readonly Hold[] = [0, 1, 3, 2];

/** The cube rotation that gets to each hold from green in front. */
export const HOLD_ROTATION: Record<Hold, string> = { 0: '', 1: 'y', 2: 'y2', 3: "y'" };

/** The side face (of the cube's own frame) that is in front in a hold. */
export function holdFront(hold: Hold): Face {
  return RING_SIDE[hold]!;
}

/** Where a face of the cube is for the hands: with orange in front (hold 1), the cube's R is the hands' F. */
export function holdFace(face: Face, hold: Hold): Face {
  const side = RING_SIDE.indexOf(face);
  return side < 0 ? face : RING_SIDE[mod4(side - hold)]!;
}

/** A move of the cube's own frame as the hands turn it in a hold. */
export function holdMove(move: string, hold: Hold): string {
  return holdFace(move[0] as Face, hold) + move.slice(1);
}

/** An edge's spot as the hands see it in a hold. */
export function holdSpot(spot: EdgeSpot, hold: Hold): EdgeSpot {
  const [a, b] = [holdFace(spot.slot[0] as Face, hold), holdFace(spot.slot[1] as Face, hold)];
  const slot = EDGE_SLOTS.find((name) => name === a + b || name === b + a)!;
  return { slot, whiteFace: holdFace(spot.whiteFace, hold) };
}

/** What the score of a solution is made of. */
export interface SolutionMetrics {
  moves: number;
  /** The hold the solution turns best in; `back` and `front` are counted in it. */
  hold: Hold;
  /** B turns: a regrip or an awkward push. */
  back: number;
  /** F turns. */
  front: number;
  /** Half turns. */
  half: number;
  /** Times an edge is moved by turns that belong to an earlier step: what has to be followed in the head. */
  tracking: number;
  /** Times an edge leaves a slot it was right in, or is put down where it can't stay. */
  detours: number;
  /** Turns that put two edges into the cross at once. */
  doubles: number;
  /** Setup turns beyond two in one step. */
  longSetup: number;
  /** The score: lower is friendlier. One unit is one plain turn. */
  cost: number;
}

/** The weights of the score, in moves. */
export const COST = {
  face: { U: 0.05, D: 0.15, R: 0, L: 0.1, F: 0.4, B: 0.9 } satisfies Record<Face, number>,
  half: 0.25,
  tracking: 0.7,
  detour: 0.6,
  longSetup: 0.3,
  double: -0.25,
} as const;

/** HOLD_FACE_COST[hold][m]: the face penalty of move m as the hands turn it in that hold. */
const HOLD_FACE_COST: readonly number[][] = ([0, 1, 2, 3] as const).map((hold) => MOVE_FACE.map((face) => COST.face[holdFace(face, hold)]));

/** How many of the moves are B and F turns for the hands in a hold. */
function turnsIn(moves: readonly number[], hold: Hold): { back: number; front: number } {
  let back = 0;
  let front = 0;
  for (const m of moves) {
    const face = holdFace(MOVE_FACE[m]!, hold);
    if (face === 'B') back++;
    if (face === 'F') front++;
  }
  return { back, front };
}

/** The score of a solution, in the hold it turns best in or in the one it is said to be turned in. */
function metricsOf(trace: Trace, heldIn?: Hold): SolutionMetrics {
  const { n, moves, places, settledAt } = trace;
  const metrics: SolutionMetrics = { moves: n, hold: 0, back: 0, front: 0, half: 0, tracking: 0, detours: 0, doubles: 0, longSetup: 0, cost: n };
  // The turns are as awkward as the hold makes them: take the hold they are easiest in.
  let easiest = Infinity;
  for (const hold of heldIn === undefined ? HOLDS : [heldIn]) {
    // Turning the cube in inspection costs nothing; green in front only wins a tie.
    let effort = 0;
    for (let t = 0; t < n; t++) effort += HOLD_FACE_COST[hold]![moves[t]!]!;
    if (effort < easiest - 1e-9) {
      easiest = effort;
      metrics.hold = hold;
    }
  }
  metrics.cost += easiest;
  ({ back: metrics.back, front: metrics.front } = turnsIn(moves, metrics.hold));
  for (let t = 0; t < n; t++) {
    if (moves[t]! % 3 === 2) {
      metrics.half++;
      metrics.cost += COST.half;
    }
  }
  const boundaries = boundariesOf(trace);
  let stepStart = 0;
  for (const end of boundaries) {
    let settling = 0;
    for (let e = 0; e < 4; e++) {
      if (settledAt[e] !== end) continue;
      settling++;
      for (let t = 0; t < stepStart; t++) if (places[t * 4 + e] !== places[(t + 1) * 4 + e]) metrics.tracking++;
    }
    if (settling >= 2) metrics.doubles++;
    metrics.longSetup += Math.max(0, end - stepStart - 3);
    stepStart = end;
  }
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 4; e++) {
      const before = isAligned(trace, t, e);
      const after = isAligned(trace, t + 1, e);
      const placedBefore = RING[places[t * 4 + e]!]! >= 0;
      const placedAfter = RING[places[(t + 1) * 4 + e]!]! >= 0;
      // Lifted out of a right slot, or put down (not for good) where it has to leave again.
      if (before && !after) metrics.detours++;
      else if (!placedBefore && placedAfter && settledAt[e] !== t + 1) metrics.detours++;
    }
  }
  metrics.cost +=
    COST.tracking * metrics.tracking + COST.detour * metrics.detours + COST.longSetup * metrics.longSetup + COST.double * metrics.doubles;
  metrics.cost = Math.round(metrics.cost * 1000) / 1000;
  return metrics;
}

/** What one move does to the cross edges, found by comparing the position before and after it. */
export type MoveNote =
  /** The edges go into the cross for good. `relativeTo`: the edges that were there already; `home`: the slots are under their own centres. */
  | { kind: 'insert'; edges: CrossEdge[]; sides: Face[]; relativeTo: CrossEdge[]; home: boolean }
  /** The edge is now one turn (`drop`) from its slot on `side`: because it moved ('turn') or because the bottom layer did ('bottom'). */
  | { kind: 'ready'; edge: CrossEdge; by: 'turn' | 'bottom'; oriented: boolean; drop: string; side: Face }
  /** A bad edge became a good one, not yet lined up with its slot. */
  | { kind: 'orient'; edge: CrossEdge; spot: EdgeSpot }
  /** The edge leaves the bottom layer, where it was white down but in the wrong slot against the others. */
  | { kind: 'takeOut'; edge: CrossEdge; spot: EdgeSpot }
  /** The edge leaves a slot it was right in; move number `returns` (0-based) brings it back. */
  | { kind: 'lift'; edge: CrossEdge; returns: number; returnMove: string }
  /** The edge is put down in the bottom layer where it can't stay. */
  | { kind: 'park'; edge: CrossEdge; spot: EdgeSpot }
  /** The edge is moved without getting closer in a way that has a name; `next` is the move (0-based) that picks it up from there. */
  | { kind: 'move'; edge: CrossEdge; spot: EdgeSpot; next: { index: number; move: string } | null }
  /** Edges of the cross ride along on a D turn. */
  | { kind: 'carry'; edges: CrossEdge[] }
  /** The last D turn: the finished cross meets the centres. */
  | { kind: 'align' };

export interface StepMove {
  /** 0-based position in the solution. */
  index: number;
  move: string;
  notes: MoveNote[];
}

/** A run of moves that ends with an edge (or two) going into the cross, or the closing D turn. */
export interface TrainerStep {
  start: number;
  end: number;
  kind: 'insert' | 'align';
  settles: CrossEdge[];
  /** The edges this step is about: the ones to watch. */
  focus: CrossEdge[];
  moves: StepMove[];
}

/** A technique the solution uses, with the move that shows it. */
export type Pattern =
  /** Edges that are right from the start and never leave. */
  | { kind: 'kept'; edges: CrossEdge[] }
  /** One turn puts two edges into the cross. */
  | { kind: 'double'; index: number; move: string; edges: CrossEdge[] }
  /** One turn places `placed` (possibly none) and also sets up `helped`. */
  | { kind: 'twoBirds'; index: number; move: string; placed: CrossEdge[]; helped: CrossEdge[] }
  /** A turn whose only job is to make an edge good or line it up. */
  | { kind: 'setup'; index: number; move: string; edge: CrossEdge }
  /** Edges are placed against each other, off their centres; the D turns match them. */
  | { kind: 'relative'; turns: string[] }
  /** An edge leaves a right slot and comes back. */
  | { kind: 'lift'; index: number; move: string; edge: CrossEdge };

export interface TrainerSolution {
  /** The moves in the cube's own frame (green in front): what the simulation turns. */
  moves: string[];
  /** How to hold the cube for this solution: `metrics.hold`. */
  hold: Hold;
  /** The moves as the hands turn them in that hold: what to read and do. */
  handMoves: string[];
  /** The B and F turns it would take with green in front, to show what the hold wins. */
  greenFront: { back: number; front: number };
  /** Moves over the optimum. */
  extra: number;
  metrics: SolutionMetrics;
  steps: TrainerStep[];
  patterns: Pattern[];
  /** For each of CROSS_EDGES: the number of moves after which it is in the cross for good (0: from the start). */
  settledAt: number[];
}

function notesOf(trace: Trace, t: number): MoveNote[] {
  const { places, moves, settledAt, n } = trace;
  const m = moves[t]!;
  const bottomTurn = MOVE_FACE[m] === 'D';
  const notes: MoveNote[] = [];
  if (bottomTurn && settledAt.every((s) => s <= t)) return [{ kind: 'align' }];

  const inserted: number[] = [];
  const carried: CrossEdge[] = [];
  const rest: MoveNote[] = [];
  for (let e = 0; e < 4; e++) {
    const edge = CROSS_EDGES[e]!;
    const before = places[t * 4 + e]!;
    const after = places[(t + 1) * 4 + e]!;
    const moved = before !== after;
    if (settledAt[e] === t + 1) {
      inserted.push(e);
      continue;
    }
    const alignedBefore = isAligned(trace, t, e);
    const alignedAfter = isAligned(trace, t + 1, e);
    if (alignedBefore && alignedAfter) {
      if (moved) carried.push(edge);
      continue;
    }
    if (alignedBefore) {
      const returns = settledAt[e]! - 1;
      rest.push({ kind: 'lift', edge, returns, returnMove: FACE_MOVES[moves[returns]!]! });
      continue;
    }
    const spot = spotOf(after);
    const wasPlaced = CLASS[before] === 'placed';
    if (!wasPlaced && CLASS[after] === 'placed') {
      rest.push({ kind: 'park', edge, spot });
      continue;
    }
    // Out of a wrong slot; when it lands where one turn drops it into the right one, the 'ready' note below says so too.
    const takenOut = wasPlaced && CLASS[after] !== 'placed';
    if (takenOut) rest.push({ kind: 'takeOut', edge, spot });
    const oriented = !wasPlaced && !isGoodClass(CLASS[before]!) && isGoodClass(CLASS[after]!);
    if (!isReady(trace, t, e) && isReady(trace, t + 1, e)) {
      rest.push({
        kind: 'ready',
        edge,
        by: moved ? 'turn' : 'bottom',
        oriented,
        drop: FACE_MOVES[DROP_MOVE[after]!]!,
        side: RING_SIDE[DROP_RING[after]!]!,
      });
    } else if (oriented) {
      rest.push({ kind: 'orient', edge, spot });
    } else if (moved && !takenOut) {
      let next = t + 1;
      while (next < n && places[next * 4 + e] === places[(next + 1) * 4 + e]) next++;
      rest.push({ kind: 'move', edge, spot, next: next < n ? { index: next, move: FACE_MOVES[moves[next]!]! } : null });
    }
  }
  if (inserted.length > 0) {
    const relativeTo = CROSS_EDGES.filter((_, e) => settledAt[e]! <= t);
    notes.push({
      kind: 'insert',
      edges: inserted.map((e) => CROSS_EDGES[e]!),
      sides: inserted.map((e) => RING_SIDE[RING[places[(t + 1) * 4 + e]!]!]!),
      relativeTo,
      home: trace.frame[t + 1] === 0,
    });
  }
  const order: Record<MoveNote['kind'], number> = { insert: 0, ready: 1, orient: 2, lift: 3, takeOut: 4, park: 5, carry: 6, move: 7, align: 8 };
  notes.push(...rest.sort((a, b) => order[a.kind] - order[b.kind]));
  if (carried.length > 0) notes.push({ kind: 'carry', edges: carried });
  return notes;
}

function noteEdges(note: MoveNote): CrossEdge[] {
  switch (note.kind) {
    case 'insert':
      return note.edges;
    case 'carry':
    case 'align':
      return [];
    default:
      return [note.edge];
  }
}

function stepsOf(trace: Trace): TrainerStep[] {
  const steps: TrainerStep[] = [];
  const boundaries = boundariesOf(trace);
  if (boundaries.at(-1) !== trace.n && trace.n > 0) boundaries.push(trace.n);
  let start = 0;
  for (const end of boundaries) {
    const moves: StepMove[] = [];
    for (let t = start; t < end; t++) moves.push({ index: t, move: FACE_MOVES[trace.moves[t]!]!, notes: notesOf(trace, t) });
    const settles = CROSS_EDGES.filter((_, e) => trace.settledAt[e] === end);
    const touched = new Set<CrossEdge>([...settles, ...moves.flatMap((move) => move.notes.flatMap(noteEdges))]);
    steps.push({
      start,
      end,
      kind: settles.length > 0 ? 'insert' : 'align',
      settles,
      focus: CROSS_EDGES.filter((edge) => touched.has(edge)),
      moves,
    });
    start = end;
  }
  return steps;
}

function patternsOf(trace: Trace, steps: readonly TrainerStep[]): Pattern[] {
  const patterns: Pattern[] = [];
  const kept = CROSS_EDGES.filter((_, e) => trace.settledAt[e] === 0);
  if (kept.length > 0 && trace.n > 0) patterns.push({ kind: 'kept', edges: kept });
  for (const { index, move, notes } of steps.flatMap((step) => step.moves)) {
    const insert = notes.find((note) => note.kind === 'insert');
    const lined = notes.flatMap((note) => (note.kind === 'ready' && note.by === 'bottom' ? [note.edge] : []));
    // A D turn lines edges up without touching them; it does two jobs only when it lines up two.
    const helped = [
      ...notes.flatMap((note) => ((note.kind === 'ready' && note.by === 'turn') || note.kind === 'orient' ? [note.edge] : [])),
      ...(lined.length >= 2 ? lined : []),
    ];
    if (insert !== undefined && insert.edges.length >= 2) patterns.push({ kind: 'double', index, move, edges: insert.edges });
    if (insert !== undefined && helped.length > 0) patterns.push({ kind: 'twoBirds', index, move, placed: insert.edges, helped });
    else if (insert === undefined && helped.length >= 2) patterns.push({ kind: 'twoBirds', index, move, placed: [], helped });
    else if (insert === undefined && helped.length === 1) patterns.push({ kind: 'setup', index, move, edge: helped[0]! });
    for (const note of notes) if (note.kind === 'lift') patterns.push({ kind: 'lift', index, move, edge: note.edge });
  }
  const offCentre = trace.settledAt.some((t) => trace.frame[t] !== 0);
  if (offCentre) {
    patterns.push({ kind: 'relative', turns: trace.moves.filter((m) => MOVE_FACE[m] === 'D').map((m) => FACE_MOVES[m]!) });
  }
  return patterns;
}

function solutionOf(trace: Trace, metrics: SolutionMetrics, optimal: number): TrainerSolution {
  const steps = stepsOf(trace);
  const moves = trace.moves.map((m) => FACE_MOVES[m]!);
  return {
    moves,
    hold: metrics.hold,
    handMoves: moves.map((move) => holdMove(move, metrics.hold)),
    greenFront: turnsIn(trace.moves, 0),
    extra: trace.n - optimal,
    metrics,
    steps,
    patterns: patternsOf(trace, steps),
    settledAt: [...trace.settledAt],
  };
}

/** One white edge as it lies on the scrambled cube. */
export interface EdgeRead {
  edge: CrossEdge;
  spot: EdgeSpot;
  cls: EdgeClass;
  /** For a good edge: the turn that drops it into the bottom layer white down. */
  drop: string | null;
}

/** What inspection finds before any move is planned. */
export interface InspectionRead {
  edges: EdgeRead[];
  good: number;
  bad: number;
  /**
   * The edges that are in the bottom layer white down, grouped: edges in one
   * group are right against each other. Two groups can't both stay.
   */
  groups: CrossEdge[][];
}

function readOf(start: readonly number[]): InspectionRead {
  const edges = CROSS_EDGES.map((edge, e): EdgeRead => {
    const place = start[e]!;
    const drop = DROP_MOVE[place]!;
    return { edge, spot: spotOf(place), cls: CLASS[place]!, drop: drop < 0 ? null : FACE_MOVES[drop]! };
  });
  const byOffset = new Map<number, CrossEdge[]>();
  CROSS_EDGES.forEach((edge, e) => {
    const ring = RING[start[e]!]!;
    if (ring < 0) return;
    const offset = mod4(ring - e);
    byOffset.set(offset, [...(byOffset.get(offset) ?? []), edge]);
  });
  return {
    edges,
    good: edges.filter((read) => isGoodClass(read.cls)).length,
    bad: edges.filter((read) => read.cls === 'topSide' || read.cls === 'bottomSide').length,
    groups: [...byOffset.values()].sort((a, b) => b.length - a.length),
  };
}

/** Something one solution does better than another, with the count of the other (`before`) and its own (`after`). */
export interface Reason {
  kind: 'back' | 'front' | 'half' | 'tracking' | 'detours' | 'doubles' | 'longSetup';
  before: number;
  after: number;
}

const REASON_KINDS: ReadonlyArray<Reason['kind']> = ['back', 'front', 'tracking', 'detours', 'doubles', 'longSetup', 'half'];

/** What the solution with the metrics `better` wins over the one with `other`. */
function reasonsFor(other: SolutionMetrics, better: SolutionMetrics): Reason[] {
  return REASON_KINDS.flatMap((kind) => {
    const before = other[kind];
    const after = better[kind];
    return (kind === 'doubles' ? after > before : after < before) ? [{ kind, before, after }] : [];
  });
}

export interface CrossAnalysis {
  scramble: string;
  perm: Perm;
  read: InspectionRead;
  optimalLength: number;
  /** How many shortest solutions there are. */
  optimalCount: number;
  /** How many solutions were compared. */
  compared: number;
  /** Their scores, lowest (friendliest) first: what a solution of one's own is ranked against. */
  costs: number[];
  /** The friendliest of the shortest solutions. */
  shortest: TrainerSolution;
  /** The friendliest solution of all that were compared; the same object as `shortest` when that one wins. */
  recommended: TrainerSolution;
  /** Other friendly solutions that go about it differently, best first. */
  alternatives: TrainerSolution[];
  /** Why `recommended` beats `shortest` (empty when they are the same). */
  reasons: Reason[];
}

/** Moves over the optimum that a friendlier solution may cost. */
export const MAX_EXTRA = 2;
const MAX_CANDIDATES = 200_000;
const MAX_ALTERNATIVES = 3;

/** How a solution goes about it: the order the edges go in and the first face turned. */
function approachOf(trace: Trace): string {
  const order = boundariesOf(trace).map((end) => trace.settledAt.flatMap((t, e) => (t === end ? [e] : [])).join(''));
  return `${trace.n === 0 ? '' : MOVE_FACE[trace.moves[0]!]}:${order.join('-')}`;
}

/** The place codes of the four cross edges on a position, in the order of CROSS_EDGES. */
function startOf(perm: readonly number[]): number[] {
  return CROSS_EDGES.map((edge) => edgePlaceCode(perm, edge));
}

/** The trace of moves given in the cube's own frame; throws unless they are face turns that solve the cross. */
function traceMoves(perm: readonly number[], moves: readonly string[]): Trace {
  const trace = traceOf(
    startOf(perm),
    moves.map((move) => {
      const m = MOVE_INDEX.get(move);
      if (m === undefined) throw new Error(`Not a face move: ${move}`);
      return m;
    }),
  );
  if (!trace.settledAt.every((_, e) => isAligned(trace, trace.n, e))) throw new Error('The moves do not solve the cross');
  return trace;
}

/**
 * A solution (any sequence of face turns that solves the cross from `perm`)
 * read step by step. The moves are in the cube's own frame; with `hold` the
 * solution is scored as turned in that hold instead of its best one.
 */
export function explainSolution(perm: readonly number[], moves: readonly string[], optimal = moves.length, hold?: Hold): TrainerSolution {
  const trace = traceMoves(perm, moves);
  return solutionOf(trace, metricsOf(trace, hold), optimal);
}

/**
 * A scramble is turned the way the timer shows it (WCA): white up, green in
 * front. For the cross the cube is then turned over, white down with green
 * still in front (z2), which is how the 3D cube is drawn. These are the same
 * turns named on the cube as it is held then: U and D swap, so do R and L.
 */
export function scrambleWhiteDown(scramble: string): string {
  return withoutRotations(`z2 ${scramble}`).alg;
}

/**
 * The shortest and the friendliest white cross for a scramble, with every
 * move explained. The scramble is done white up, green in front, like every
 * scramble in the app; `perm` is the cube turned over afterwards.
 */
export function analyzeCross(scramble: string): CrossAnalysis {
  const perm = permOf(scrambleWhiteDown(scramble));
  const start = startOf(perm);
  const solver = crossSolver(CROSS_EDGES);
  const optimalLength = solver.distance(perm);
  const candidates = solver.solutions(perm, MAX_EXTRA, MAX_CANDIDATES).map((moves) => {
    const trace = traceOf(
      start,
      moves.map((move) => MOVE_INDEX.get(move)!),
    );
    return { trace, metrics: metricsOf(trace), key: moves.join(' ') };
  });
  candidates.sort((a, b) => a.metrics.cost - b.metrics.cost || a.trace.n - b.trace.n || (a.key < b.key ? -1 : 1));

  const best = candidates[0]!;
  const bestShortest = candidates.find((c) => c.trace.n === optimalLength)!;
  const shortest = solutionOf(bestShortest.trace, bestShortest.metrics, optimalLength);
  const recommended = best === bestShortest ? shortest : solutionOf(best.trace, best.metrics, optimalLength);

  const seen = new Set([approachOf(best.trace), approachOf(bestShortest.trace)]);
  const alternatives: TrainerSolution[] = [];
  for (const candidate of candidates) {
    if (alternatives.length >= MAX_ALTERNATIVES) break;
    const approach = approachOf(candidate.trace);
    if (seen.has(approach)) continue;
    seen.add(approach);
    alternatives.push(solutionOf(candidate.trace, candidate.metrics, optimalLength));
  }

  return {
    scramble,
    perm,
    read: readOf(start),
    optimalLength,
    optimalCount: candidates.filter((c) => c.trace.n === optimalLength).length,
    compared: candidates.length,
    costs: candidates.map((c) => c.metrics.cost),
    shortest,
    recommended,
    alternatives,
    reasons: recommended === shortest ? [] : reasonsFor(shortest.metrics, recommended.metrics),
  };
}

export type SolutionParse = { ok: true; moves: string[] } | { ok: false; reason: 'empty' } | { ok: false; reason: 'invalid'; token: string };

/**
 * Reads a solution typed by the user: face turns only (U D R L F B with '
 * or 2), spaces optional, repeated turns of a face merged. Lowercase letters
 * are refused rather than read as face turns: in a solution they would mean
 * wide moves or rotations, and how the cube is held is said with the hold.
 */
export function parseSolution(input: string): SolutionParse {
  const lowercase = input.split(/\s+/).find((chunk) => /[a-z]/.test(chunk));
  if (lowercase !== undefined) return { ok: false, reason: 'invalid', token: lowercase };
  const parsed = parseCustomScramble(input);
  if (!parsed.ok) return parsed;
  const moves = joinMoves(parsed.scramble.split(' ')).split(' ').filter(Boolean);
  return moves.length === 0 ? { ok: false, reason: 'empty' } : { ok: true, moves };
}

/** A solution of the user's own, read and measured like the trainer's. */
export interface Attempt {
  /**
   * The user's moves explained step by step. When they don't solve the
   * cross, the solver's shortest way to finish is appended, so that the
   * moves made can still be read against where they were going.
   */
  solution: TrainerSolution;
  /** How many of `solution.moves` are the user's own; the rest is the finish. */
  own: number;
  solved: boolean;
  /** Cross edges that are in the cross for good after the user's moves: right against each other, whatever the centres. */
  inPlace: number;
  /** The moves appended to finish the cross, in the cube's own frame (empty when solved). */
  finish: string[];
  /** A hold in which the same moves turn easier than in the one they were given in. */
  easierHold: Hold | null;
  /** Where the solution would stand among the compared ones by score: 1 is as friendly as the recommended one. */
  rank: number;
  /** The very moves of one of the trainer's solutions. */
  same: 'recommended' | 'shortest' | null;
  /** What the recommended solution does better. */
  reasons: Reason[];
}

/**
 * Measures a solution of the user's own against the analysis. `handMoves`
 * are face turns as the user makes them holding the cube in `hold`.
 */
export function evaluateAttempt(analysis: CrossAnalysis, handMoves: readonly string[], hold: Hold): Attempt {
  // From the hands back to the cube's own frame: the hold undone.
  const own = handMoves.map((move) => holdMove(move, mod4(-hold) as Hold));
  const end = applyMoves(analysis.perm, own);
  const finish = crossSolver(CROSS_EDGES).solve(end);
  const trace = traceMoves(analysis.perm, [...own, ...finish]);
  const metrics = metricsOf(trace, hold);
  const free = metricsOf(trace);
  const key = own.join(' ');
  return {
    solution: solutionOf(trace, metrics, analysis.optimalLength),
    own: own.length,
    solved: finish.length === 0,
    inPlace: trace.settledAt.filter((t) => t <= own.length).length,
    finish,
    easierHold: free.hold !== hold && free.cost < metrics.cost - 1e-9 ? free.hold : null,
    rank: 1 + analysis.costs.filter((cost) => cost < metrics.cost - 1e-9).length,
    same: key === analysis.recommended.moves.join(' ') ? 'recommended' : key === analysis.shortest.moves.join(' ') ? 'shortest' : null,
    reasons: reasonsFor(metrics, analysis.recommended.metrics),
  };
}
