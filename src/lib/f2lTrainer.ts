/**
 * F2L trainer: compares the moves the user makes against a case's
 * algorithm. Moves that follow the algorithm are "done"; any other move is a
 * deviation that has to be undone before the algorithm continues. The
 * deviation is kept as a normalized sequence (R R → R2, R R' → nothing, and
 * turns of the opposite face in between don't get in the way), so undoing a
 * wrong move makes it disappear again.
 */

import { applyAlgorithmTo, type Face } from './cube';
import { f2lCasePerm, isF2LSolved, type Perm } from './f2l';

export interface Move {
  face: Face;
  /** Clockwise quarter turns: 1, 2 or 3 (for a counterclockwise turn). */
  times: 1 | 2 | 3;
}

const FACE_MOVE_RE = /^([URFDLB])(2'?|')?$/;

export function parseFaceMove(token: string): Move | null {
  const match = FACE_MOVE_RE.exec(token);
  if (!match) return null;
  const suffix = match[2];
  return { face: match[1] as Face, times: suffix === undefined ? 1 : suffix.startsWith('2') ? 2 : 3 };
}

/** The face moves of an algorithm; throws on anything else (slices, rotations). */
export function parseFaceMoves(alg: string): Move[] {
  return alg
    .replace(/[()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const move = parseFaceMove(token);
      if (move === null) throw new Error(`Not a face move: ${token}`);
      return move;
    });
}

export function formatMove({ face, times }: Move): string {
  return face + (times === 2 ? '2' : times === 3 ? "'" : '');
}

export function inverseMove({ face, times }: Move): Move {
  return { face, times: times === 2 ? 2 : times === 1 ? 3 : 1 };
}

export function sameMove(a: Move, b: Move): boolean {
  return a.face === b.face && a.times === b.times;
}

const AXIS: Record<Face, 'x' | 'y' | 'z'> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };

/**
 * `sequence` followed by `move`, normalized: the move merges with the last
 * turn of the same face (looking past turns of the opposite face, which
 * commute with it), cancelling it when they add up to a full turn.
 */
export function pushMove(sequence: readonly Move[], move: Move): Move[] {
  const next = [...sequence];
  for (let i = next.length - 1; i >= 0; i--) {
    const previous = next[i]!;
    if (previous.face === move.face) {
      const times = (previous.times + move.times) % 4;
      if (times === 0) next.splice(i, 1);
      else next[i] = { face: move.face, times: times as 1 | 2 | 3 };
      return next;
    }
    if (AXIS[previous.face] !== AXIS[move.face]) break;
  }
  next.push(move);
  return next;
}

export interface TrainerState {
  readonly alg: readonly Move[];
  /** How many moves of the algorithm are done. */
  readonly done: number;
  /** Moves made off the algorithm, which have to be undone. */
  readonly deviation: readonly Move[];
  readonly perm: Perm;
  /** Every move made, for undo. */
  readonly history: readonly Move[];
}

export function startTrainer(alg: string): TrainerState {
  return { alg: parseFaceMoves(alg), done: 0, deviation: [], perm: f2lCasePerm(alg), history: [] };
}

function step(state: TrainerState, move: Move): Omit<TrainerState, 'history'> {
  const perm = applyAlgorithmTo([...state.perm], formatMove(move));
  const { alg } = state;
  // Taking back the last correct move is not a deviation.
  if (state.deviation.length === 0 && state.done > 0 && sameMove(move, inverseMove(alg[state.done - 1]!))) {
    return { alg, done: state.done - 1, deviation: [], perm };
  }
  let done = state.done;
  const deviation = pushMove(state.deviation, move);
  while (deviation.length > 0 && done < alg.length && sameMove(deviation[0]!, alg[done]!)) {
    deviation.shift();
    done++;
  }
  return { alg, done, deviation, perm };
}

export function applyMove(state: TrainerState, move: Move): TrainerState {
  return { ...step(state, move), history: [...state.history, move] };
}

export function undoMove(state: TrainerState): TrainerState {
  const last = state.history.at(-1);
  if (last === undefined) return state;
  return { ...step(state, inverseMove(last)), history: state.history.slice(0, -1) };
}

/** True once the pair is in and the first two layers are solved, by any route. */
export function isSolved(state: TrainerState): boolean {
  return isF2LSolved(state.perm);
}
