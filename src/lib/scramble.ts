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

export type ScrambleParse =
  | { ok: true; scramble: string }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'invalid'; token: string };

const CUSTOM_MOVE_RE = /^([URFDLB])(2'?|')?/i;

/**
 * Reads a scramble typed by the user and tidies it into the notation the app
 * stores: WCA face turns (U D R L F B, with ' or 2), one space between moves.
 * Lowercase letters, typographic apostrophes, "2'" and parentheses are
 * accepted and rewritten; moves may be written without spaces ("RUR'U'").
 * Reports the first chunk it can't read.
 */
export function parseCustomScramble(input: string): ScrambleParse {
  const chunks = input
    .replace(/[\u2019\u2018\u00b4`]/g, "'")
    .replace(/[()[\],]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (chunks.length === 0) return { ok: false, reason: 'empty' };
  const moves: string[] = [];
  for (const chunk of chunks) {
    let rest = chunk;
    while (rest.length > 0) {
      const match = CUSTOM_MOVE_RE.exec(rest);
      if (!match) return { ok: false, reason: 'invalid', token: chunk };
      const suffix = match[2] === undefined ? '' : match[2].startsWith('2') ? '2' : "'";
      moves.push(match[1]!.toUpperCase() + suffix);
      rest = rest.slice(match[0].length);
    }
  }
  return { ok: true, scramble: moves.join(' ') };
}

/** A new scramble entity with a sequence the user typed (already tidied by `parseCustomScramble`). */
export function createCustomScramble(scramble: string, title?: string): NewScramble {
  const result: NewScramble = { id: newId(), scramble, createdAt: Date.now(), favorite: false };
  if (title !== undefined && title.trim().length > 0) result.title = title.trim();
  return result;
}
