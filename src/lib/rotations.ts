/**
 * Rewrites an algorithm so it uses face turns only: cube rotations (x y z),
 * wide moves (r u f …, Rw) and slice moves (M E S) become the equivalent
 * turns of the outer faces, named as the faces were before the algorithm
 * started. The cube ends in the same position, just not rotated in the
 * hands. "y' R' U R" becomes "F' U F", "d R' U R" becomes "U F' U F".
 */

import type { Face } from './cube';

type Labels = Record<Face, Face>;

/** How a rotation renames the faces: after `y`, what was on the right is in front. */
const ROTATIONS: Record<'x' | 'y' | 'z', (c: Labels) => Labels> = {
  x: (c) => ({ ...c, U: c.F, F: c.D, D: c.B, B: c.U }),
  y: (c) => ({ ...c, F: c.R, R: c.B, B: c.L, L: c.F }),
  z: (c) => ({ ...c, U: c.L, L: c.D, D: c.R, R: c.U }),
};

/** Non-face moves as face turns and rotations, each done once clockwise. */
const COMPOSITE: Record<string, string[]> = {
  x: ['x'],
  y: ['y'],
  z: ['z'],
  r: ['x', 'L'],
  l: ["x'", 'R'],
  u: ['y', 'D'],
  d: ["y'", 'U'],
  f: ['z', 'B'],
  b: ["z'", 'F'],
  M: ["L'", "x'", 'R'],
  E: ["D'", "y'", 'U'],
  S: ["F'", 'z', 'B'],
};

const TOKEN_RE = /^([URFDLBMESxyz]|[urfdlb]|[URFDLB]w)(2'?|')?$/;
const SUFFIX = ['', '', '2', "'"];

export interface Rewritten {
  /** Face turns only. */
  alg: string;
  /** The rotations the original algorithm made, in order, so `alg` equals the original followed by their inverse. */
  rotations: string;
}

/** Splits an algorithm into tokens, ignoring parentheses and brackets. Throws on an unknown token. */
export function tokenizeAlgorithm(alg: string): string[] {
  const tokens = alg.replace(/[()[\]]/g, ' ').trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) if (!TOKEN_RE.test(token)) throw new Error(token);
  return tokens;
}

export function withoutRotations(alg: string): Rewritten {
  let labels: Labels = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' };
  const out: string[] = [];
  const rotations: string[] = [];
  const emit = (token: string) => {
    const match = TOKEN_RE.exec(token)!;
    const base = match[1]!.endsWith('w') ? match[1]![0]!.toLowerCase() : match[1]!;
    const times = match[2] === undefined ? 1 : match[2].startsWith('2') ? 2 : 3;
    const parts = COMPOSITE[base];
    if (parts === undefined) {
      out.push(labels[base as Face] + SUFFIX[times]);
      return;
    }
    for (let t = 0; t < times; t++) {
      for (const part of parts) {
        const axis = part[0]!;
        if (axis === 'x' || axis === 'y' || axis === 'z') {
          const turns = part.length === 1 ? 1 : 3;
          for (let k = 0; k < turns; k++) labels = ROTATIONS[axis](labels);
          rotations.push(part);
        } else {
          emit(part);
        }
      }
    }
  };
  for (const token of tokenizeAlgorithm(alg)) emit(token);
  return { alg: joinMoves(out), rotations: rotations.join(' ') };
}

/** Joins moves, merging consecutive turns of the same face (R R → R2, R R' → nothing). */
export function joinMoves(tokens: readonly string[]): string {
  const merged: Array<{ face: string; times: number }> = [];
  for (const token of tokens) {
    const face = token[0]!;
    const times = token.length === 1 ? 1 : token[1] === '2' ? 2 : 3;
    const last = merged.at(-1);
    if (last !== undefined && last.face === face) {
      last.times = (last.times + times) % 4;
      if (last.times === 0) merged.pop();
    } else {
      merged.push({ face, times });
    }
  }
  return merged.map(({ face, times }) => face + SUFFIX[times]).join(' ');
}
