import type { Scramble, ScrambleSet } from '../types';
import type { Messages } from './messages';

/** The scramble's title, or "Scramble #n" when it has none. */
export function scrambleName(scramble: Pick<Scramble, 'title' | 'number'>, t: Messages): string {
  return scramble.title ?? t.scrambleName(scramble.number);
}

/** The set's title, or "Set #n" when it has none. */
export function setName(set: Pick<ScrambleSet, 'title' | 'number'>, t: Messages): string {
  return set.title ?? t.setName(set.number);
}
