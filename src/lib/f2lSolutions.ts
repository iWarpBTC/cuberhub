/**
 * Checking a solution the user adds to an F2L case: it is rewritten to
 * face turns, must leave the cross and the other slots alone, and must
 * solve the case's position (a turn of the top layer first is added when
 * needed). A solution of another case is reported with that case.
 */

import { applyAlgorithmTo } from './cube';
import { F2L_CASES, f2lCaseKey, f2lCasePerm, isF2LSolved, preservesF2LRest, type F2LCase, type Perm } from './f2l';
import { joinMoves, tokenizeAlgorithm, withoutRotations } from './rotations';

export interface AcceptedSolution {
  /** Face turns only, with any top-layer turn the case needs first. */
  alg: string;
  /** The solution as written (whitespace tidied), when it reads differently from `alg`, parentheses included. */
  source?: string;
  /** The top-layer turn added in front of what the user wrote, if any. */
  auf?: string;
}

export type SolutionCheck =
  | ({ ok: true } & AcceptedSolution)
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'unknown-move'; token: string }
  | { ok: false; reason: 'breaks' }
  | { ok: false; reason: 'unsolved' }
  | { ok: false; reason: 'other-case'; f2lCase: F2LCase; solution: AcceptedSolution }
  | { ok: false; reason: 'duplicate' };

const AUFS = ['', 'U', 'U2', "U'"];

/** The top-layer turn after which `alg` solves the position, or null. */
function aufFor(position: Perm, alg: string): string | null {
  return AUFS.find((auf) => isF2LSolved(applyAlgorithmTo([...position], `${auf} ${alg}`))) ?? null;
}

function accepted(input: string, rewritten: string, auf: string): AcceptedSolution {
  const alg = joinMoves(auf === '' ? rewritten.split(' ') : [auf, ...rewritten.split(' ')]);
  const source = input.trim().replace(/\s+/g, ' ');
  const result: AcceptedSolution = { alg };
  // Kept whenever it reads differently, parentheses included: they show how the user groups the moves.
  if (source !== alg) result.source = source;
  if (auf !== '') result.auf = auf;
  return result;
}

/**
 * Checks `input` as a solution of `f2lCase`. `known` are the algorithms the
 * case already has (its own and the user's), to refuse a duplicate.
 */
export function checkSolution(f2lCase: F2LCase, input: string, known: readonly string[]): SolutionCheck {
  let tokens: string[];
  try {
    tokens = tokenizeAlgorithm(input);
  } catch (e) {
    return { ok: false, reason: 'unknown-move', token: e instanceof Error ? e.message : input };
  }
  if (tokens.length === 0) return { ok: false, reason: 'empty' };
  const rewritten = withoutRotations(input).alg;
  if (rewritten === '') return { ok: false, reason: 'unsolved' };
  if (!preservesF2LRest(rewritten)) return { ok: false, reason: 'breaks' };

  const auf = aufFor(f2lCasePerm(f2lCase.alg), rewritten);
  if (auf !== null) {
    const solution = accepted(input, rewritten, auf);
    if (known.includes(solution.alg)) return { ok: false, reason: 'duplicate' };
    return { ok: true, ...solution };
  }

  const key = f2lCaseKey(f2lCasePerm(rewritten));
  const other = F2L_CASES.find((c) => f2lCaseKey(f2lCasePerm(c.alg)) === key);
  if (other === undefined) return { ok: false, reason: 'unsolved' };
  const otherAuf = aufFor(f2lCasePerm(other.alg), rewritten) ?? '';
  return { ok: false, reason: 'other-case', f2lCase: other, solution: accepted(input, rewritten, otherAuf) };
}
