/**
 * The 41 F2L cases: the corner and edge of one pair are somewhere in the
 * top layer or in their slot, the cross and the other three slots are done.
 * Every case is solved into the front-right slot, holding the cube yellow
 * up and green front (white cross on the bottom), so the pair is the
 * white-green-orange corner and the green-orange edge.
 *
 * A case is described by its algorithm alone: the position shown is a
 * solved cube with the algorithm undone, where only the pair matters (the
 * other top-layer pieces are drawn grey). `f2l.test.ts` checks that every
 * algorithm uses face turns only, leaves the cross and the other slots
 * alone, and that the 41 cases are the 41 distinct ones.
 */

import type { Localized } from '../i18n/lang';
import { FACES, applyAlgorithmTo, invertAlgorithm, type Face } from './cube';
import { STICKERS, faceOf } from './geometry';

export type F2LGroupId =
  | 'top-side-match'
  | 'top-side-opposite'
  | 'top-up'
  | 'corner-slot'
  | 'edge-slot'
  | 'both-slot';

export interface F2LGroup {
  id: F2LGroupId;
  title: Localized;
  note: Localized;
}

export interface F2LCase {
  id: string;
  /** 1–41, numbered as on rubiksplace.com. */
  number: number;
  group: F2LGroupId;
  /** Face turns only, so the trainer needs no rotations. */
  alg: string;
}

export const F2L_GROUPS: readonly F2LGroup[] = [
  {
    id: 'top-side-match',
    title: { en: 'Corner on top, white to the side, colors match', cs: 'Roh nahoře bílou do strany, barvy souhlasí' },
    note: {
      en: 'Both pieces are in the top layer; the edge color next to the corner is the same as the corner’s side color.',
      cs: 'Obě kostičky jsou v horní vrstvě; barva hrany u rohu je stejná jako boční barva rohu.',
    },
  },
  {
    id: 'top-side-opposite',
    title: { en: 'Corner on top, white to the side, colors opposite', cs: 'Roh nahoře bílou do strany, barvy opačné' },
    note: {
      en: 'Both pieces are in the top layer; the edge color next to the corner differs from the corner’s side color.',
      cs: 'Obě kostičky jsou v horní vrstvě; barva hrany u rohu se liší od boční barvy rohu.',
    },
  },
  {
    id: 'top-up',
    title: { en: 'Corner on top, white facing up', cs: 'Roh nahoře bílou nahoru' },
    note: {
      en: 'Both pieces are in the top layer and the corner’s white sticker points up.',
      cs: 'Obě kostičky jsou v horní vrstvě a bílá nálepka rohu míří nahoru.',
    },
  },
  {
    id: 'corner-slot',
    title: { en: 'Corner in the slot, edge on top', cs: 'Roh ve slotu, hrana nahoře' },
    note: { en: 'The corner is already in its slot, possibly twisted.', cs: 'Roh už je ve svém slotu, případně pootočený.' },
  },
  {
    id: 'edge-slot',
    title: { en: 'Edge in the slot, corner on top', cs: 'Hrana ve slotu, roh nahoře' },
    note: { en: 'The edge is already in its slot, possibly flipped.', cs: 'Hrana už je ve svém slotu, případně překlopená.' },
  },
  {
    id: 'both-slot',
    title: { en: 'Corner and edge in the slot', cs: 'Roh i hrana ve slotu' },
    note: { en: 'Both pieces are in the slot but not solved.', cs: 'Obě kostičky jsou ve slotu, ale špatně.' },
  },
];

function f2l(number: number, group: F2LGroupId, alg: string): F2LCase {
  return { id: `f2l-${number}`, number, group, alg };
}

export const F2L_CASES: readonly F2LCase[] = [
  f2l(1, 'top-side-match', "U R U' R'"),
  f2l(2, 'top-side-match', "U' F' U F"),
  f2l(3, 'top-side-match', "U' R U R' U2 R U' R'"),
  f2l(4, 'top-side-match', "U F' U' F U2 F' U F"),
  f2l(5, 'top-side-match', "U' R U2 R' U2 R U' R'"),
  f2l(6, 'top-side-match', "U F' U2 F U2 F' U F"),
  f2l(7, 'top-side-match', "F' U F U2 R U R'"),
  f2l(8, 'top-side-match', "R U' R' U2 F' U' F"),
  f2l(9, 'top-side-opposite', "F' U' F"),
  f2l(10, 'top-side-opposite', "R U R'"),
  f2l(11, 'top-side-opposite', "U F' U' F U' F' U' F"),
  f2l(12, 'top-side-opposite', "U' R U R' U R U R'"),
  f2l(13, 'top-side-opposite', "U' R U2 R' U F' U' F"),
  f2l(14, 'top-side-opposite', "R' U2 R2 U R2 U R"),
  f2l(15, 'top-side-opposite', "U F' U F U' F' U' F"),
  f2l(16, 'top-side-opposite', "U' R U' R' U R U R'"),
  f2l(17, 'top-up', "R U2 R' U' R U R'"),
  f2l(18, 'top-up', "F' U2 F U F' U' F"),
  f2l(19, 'top-up', "U R U2 R' U R U' R'"),
  f2l(20, 'top-up', "U' F' U2 F U' F' U F"),
  f2l(21, 'top-up', "U2 R U R' U R U' R'"),
  f2l(22, 'top-up', "U2 F' U' F U' F' U F"),
  f2l(23, 'top-up', "U2 R2 U2 R' U' R U' R2"),
  f2l(24, 'top-up', "R U R' U F' U F U' F' U F"),
  f2l(25, 'corner-slot', "U R U' R' U' F' U F"),
  f2l(26, 'corner-slot', "U' F' U F U R U' R'"),
  f2l(27, 'corner-slot', "F' U' F U F' U' F"),
  f2l(28, 'corner-slot', "R U R' U' R U R'"),
  f2l(29, 'corner-slot', "R U' R' U R U' R'"),
  f2l(30, 'corner-slot', "F' U F U' F' U F"),
  f2l(31, 'edge-slot', "U' R U' R' U2 R U' R'"),
  f2l(32, 'edge-slot', "U F' U F U2 F' U F"),
  f2l(33, 'edge-slot', "U' R U R' U F' U' F"),
  f2l(34, 'edge-slot', "U F' U' F U' R U R'"),
  f2l(35, 'edge-slot', "R U' R' U F' U F"),
  f2l(36, 'edge-slot', "R U R' U' R U R' U' R U R'"),
  f2l(37, 'both-slot', "R U' R' U' R U R' U2 R U' R'"),
  f2l(38, 'both-slot', "R U R' U2 R U' R' U R U R'"),
  f2l(39, 'both-slot', "R U' R' U F' U' F U' F' U' F"),
  f2l(40, 'both-slot', "R U R' U' R U' R' U2 F' U' F"),
  f2l(41, 'both-slot', "R U' R' U F' U2 F U2 F' U F"),
];

/**
 * A cube position as a permutation of sticker ids: `perm[i]` is the solved
 * position (and so the color) of the sticker now at position i.
 */
export type Perm = number[];

export function identityPerm(): Perm {
  return Array.from({ length: 54 }, (_, i) => i);
}

/** Solved positions of the pair's stickers: the corner's F, R and D, the edge's F and R. */
export const PAIR_STICKERS: readonly number[] = [26, 15, 29, 23, 12];
const CORNER_WHITE = 29;
const EDGE_GREEN = 23;

/** Solved positions of the eight top-layer pieces' stickers: they don't matter during F2L. */
export const LAST_LAYER_STICKERS: ReadonlySet<number> = new Set([
  0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47,
]);

const PAIR = new Set(PAIR_STICKERS);

/** The position a case starts from: a solved cube with the algorithm undone. */
export function f2lCasePerm(alg: string): Perm {
  return applyAlgorithmTo(identityPerm(), invertAlgorithm(alg));
}

/** True when the first two layers are solved; the top layer may be anything. */
export function isF2LSolved(perm: readonly number[]): boolean {
  return perm.every((sticker, i) => sticker === i || LAST_LAYER_STICKERS.has(i));
}

/** True when the algorithm leaves the cross, the other three slots and the centers where they were. */
export function preservesF2LRest(alg: string): boolean {
  const tracked = applyAlgorithmTo(identityPerm(), alg);
  return tracked.every((sticker, i) => sticker === i || LAST_LAYER_STICKERS.has(i) || PAIR.has(i));
}

export type CornerPosition = 'UFR' | 'UFL' | 'UBL' | 'UBR' | 'DFR';
export type EdgePosition = 'UF' | 'UR' | 'UB' | 'UL' | 'FR';

/** Where the pair's pieces are and which way their key stickers face. */
export interface PairState {
  corner: CornerPosition;
  /** The face the corner's white sticker is on. */
  white: Face;
  edge: EdgePosition;
  /** The face the edge's green sticker is on. */
  green: Face;
}

function faceName(normal: readonly number[]): Face {
  return FACES.find((f) => STICKERS.find((s) => s.face === f)!.normal.every((n, i) => n === normal[i]))!;
}

export function pairState(perm: readonly number[]): PairState {
  const corner = STICKERS[perm.indexOf(CORNER_WHITE)]!;
  const edge = STICKERS[perm.indexOf(EDGE_GREEN)]!;
  const [cx, cy, cz] = corner.cubie;
  const [ex, ey, ez] = edge.cubie;
  const cornerPosition = (cy === 1 ? 'U' : 'D') + (cz === 1 ? 'F' : 'B') + (cx === 1 ? 'R' : 'L');
  const edgePosition = ey === 1 ? 'U' + (ez === 1 ? 'F' : ez === -1 ? 'B' : ex === 1 ? 'R' : 'L') : 'FR';
  return {
    corner: cornerPosition as CornerPosition,
    white: faceName(corner.normal),
    edge: edgePosition as EdgePosition,
    green: faceName(edge.normal),
  };
}

/**
 * The case up to turns of the top layer, as a string: two positions that
 * differ only by a U move give the same key.
 */
export function f2lCaseKey(perm: readonly number[]): string {
  const keys: string[] = [];
  let current = [...perm];
  for (let i = 0; i < 4; i++) {
    const s = pairState(current);
    keys.push(`${s.corner}${s.white}-${s.edge}${s.green}`);
    current = applyAlgorithmTo(current, 'U');
  }
  return keys.sort()[0]!;
}

/** The sticker color to draw at a position, by solved position of the sticker there. */
export function colorFace(sticker: number): Face {
  return faceOf(sticker);
}
