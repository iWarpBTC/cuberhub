/**
 * Where each sticker of the facelet model (see `cube.ts`) sits in space, for
 * drawing the cube: cubie coordinates are -1, 0 or 1 along x (left→right),
 * y (down→up) and z (back→front); a sticker's normal points out of its face.
 */

import { FACES, type Face } from './cube';
import { NOTATION, type Axis, type MoveShape } from './notation';

export type Vec3 = readonly [number, number, number];

export interface StickerPlace {
  index: number;
  face: Face;
  cubie: Vec3;
  normal: Vec3;
}

export const NORMALS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

/** The cubie holding sticker (row, col) of a face, rows and columns as on the unfolded net. */
function cubieOf(face: Face, row: number, col: number): Vec3 {
  switch (face) {
    case 'U':
      return [col - 1, 1, row - 1];
    case 'D':
      return [col - 1, -1, 1 - row];
    case 'F':
      return [col - 1, 1 - row, 1];
    case 'B':
      return [1 - col, 1 - row, -1];
    case 'R':
      return [1, 1 - row, 1 - col];
    case 'L':
      return [-1, 1 - row, col - 1];
  }
}

export const STICKERS: readonly StickerPlace[] = FACES.flatMap((face, f) =>
  Array.from({ length: 9 }, (_, i) => ({
    index: f * 9 + i,
    face,
    cubie: cubieOf(face, Math.floor(i / 3), i % 3),
    normal: NORMALS[face],
  })),
);

const key = (cubie: Vec3, normal: Vec3) => `${cubie.join(',')}|${normal.join(',')}`;
const BY_PLACE = new Map(STICKERS.map((s) => [key(s.cubie, s.normal), s.index]));

/** The sticker index at a cubie's outer face, or -1 for an inner face. */
export function stickerAt(cubie: Vec3, normal: Vec3): number {
  return BY_PLACE.get(key(cubie, normal)) ?? -1;
}

/** The face a sticker index belongs to (its color on a solved cube). */
export function faceOf(index: number): Face {
  return FACES[Math.floor(index / 9)]!;
}

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * A vector after `quarterTurns` clockwise quarter turns about an axis, where
 * clockwise is the direction of R (x), U (y) or F (z).
 */
export function rotate(v: Vec3, axis: Axis, quarterTurns: number): Vec3 {
  let [x, y, z] = v;
  for (let t = 0; t < ((quarterTurns % 4) + 4) % 4; t++) {
    switch (axis) {
      case 'x':
        [y, z] = [z, -y];
        break;
      case 'y':
        [x, z] = [-z, x];
        break;
      case 'z':
        [x, y] = [y, -x];
        break;
    }
  }
  return [x, y, z];
}

const SHAPES = new Map<string, MoveShape>(NOTATION.flatMap((g) => g.moves.map((m) => [m.move, m.shape])));
const TOKEN_RE = /^([URFDLBMESxyz]|[urfdlb]|[URFDLB]w)(2'?|')?$/;

export interface ParsedMove {
  shape: MoveShape;
  /** Clockwise quarter turns, -1 for a counterclockwise one: the turn to animate. */
  quarterTurns: 1 | 2 | -1;
}

/** The layers a move token turns and how far; null for an unknown token. */
export function parseMove(token: string): ParsedMove | null {
  const match = TOKEN_RE.exec(token);
  if (!match) return null;
  const base = match[1]!.endsWith('w') ? match[1]![0]!.toLowerCase() : match[1]!;
  const shape = SHAPES.get(base);
  if (!shape) return null;
  const suffix = match[2];
  return { shape, quarterTurns: suffix === undefined ? 1 : suffix.startsWith('2') ? 2 : -1 };
}

/** Cubies (coordinates) that a move turns. */
export function turnsCubie(shape: MoveShape, cubie: Vec3): boolean {
  return shape.layers.includes(cubie[AXIS_INDEX[shape.axis]]);
}
