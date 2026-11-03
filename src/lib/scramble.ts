import type { NewScramble } from '../types';
import type { Face } from './cube';
import { newId } from './id';

const SCRAMBLE_LENGTH = 20;

const FACES: readonly Face[] = ['U', 'D', 'R', 'L', 'F', 'B'];
const AXIS: Record<Face, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const SUFFIXES = ['', "'", '2'] as const;

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * Generates a random-move WCA-notation 3x3x3 scramble: 20 moves, never the
 * same face twice in a row, and no face repeated with only its opposite
 * face in between (e.g. "R L R" is rejected).
 */
export function generateScramble(): string {
  const moves: string[] = [];
  let prev: Face | null = null;
  let prevPrev: Face | null = null;

  while (moves.length < SCRAMBLE_LENGTH) {
    const face = FACES[randomInt(FACES.length)]!;
    if (face === prev) continue;
    if (prev !== null && prevPrev !== null && AXIS[face] === AXIS[prev] && face === prevPrev) continue;
    moves.push(face + SUFFIXES[randomInt(SUFFIXES.length)]);
    prevPrev = prev;
    prev = face;
  }

  return moves.join(' ');
}

/** A new, not yet practiced scramble entity with a freshly generated sequence. */
export function createScramble(): NewScramble {
  return { id: newId(), scramble: generateScramble(), createdAt: Date.now(), favorite: false };
}

/** `count` new scramble entities, in creation order. */
export function createScrambles(count: number): NewScramble[] {
  return Array.from({ length: count }, createScramble);
}
