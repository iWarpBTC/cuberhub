import { describe, expect, it } from 'vitest';
import { applyAlgorithmTo } from './cube';
import { F2L_CASES, f2lCasePerm, isF2LSolved } from './f2l';
import { checkSolution } from './f2lSolutions';

const byNumber = (n: number) => F2L_CASES.find((c) => c.number === n)!;

describe('checkSolution', () => {
  it('accepts a solution written with rotations and keeps both notations', () => {
    const result = checkSolution(byNumber(9), "y' (R' U' R)", []);
    expect(result).toEqual({ ok: true, alg: "F' U' F", source: "y' (R' U' R)" });
  });

  it('keeps the source when parentheses group the moves, drops it when it is the same text', () => {
    const grouped = checkSolution(byNumber(35), "U' (R' F R F') (R U' R')", [byNumber(35).alg]);
    expect(grouped).toEqual({ ok: true, alg: "U' R' F R F' R U' R'", source: "U' (R' F R F') (R U' R')" });
    expect(checkSolution(byNumber(35), "  U' R'  F R F' R U' R' ", [])).toEqual({ ok: true, alg: "U' R' F R F' R U' R'" });
  });

  it('adds the top-layer turn the case needs first', () => {
    const c = byNumber(10); // R U R'
    const result = checkSolution(c, "U2 R U R'", []);
    expect(result).toEqual({ ok: true, alg: "R U R'", source: "U2 R U R'", auf: 'U2' });
    if (result.ok) expect(isF2LSolved(applyAlgorithmTo(f2lCasePerm(c.alg), result.alg))).toBe(true);
  });

  it('points to the case a solution really solves', () => {
    const result = checkSolution(byNumber(36), "U' (R' F R F') (R U' R')", []);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'other-case') {
      expect(result.f2lCase.number).toBe(35);
      expect(result.solution.alg).toBe("U' R' F R F' R U' R'");
    } else {
      throw new Error(`unexpected ${JSON.stringify(result)}`);
    }
  });

  it('rejects unknown moves, empty input, broken slots, no-ops and duplicates', () => {
    expect(checkSolution(byNumber(1), "R U Q", [])).toEqual({ ok: false, reason: 'unknown-move', token: 'Q' });
    expect(checkSolution(byNumber(1), ' ( ) ', [])).toEqual({ ok: false, reason: 'empty' });
    expect(checkSolution(byNumber(1), 'L U L', [])).toEqual({ ok: false, reason: 'breaks' });
    expect(checkSolution(byNumber(1), "U U'", [])).toEqual({ ok: false, reason: 'unsolved' });
    expect(checkSolution(byNumber(1), 'U2', [])).toEqual({ ok: false, reason: 'unsolved' });
    expect(checkSolution(byNumber(1), "(U R U' R')", [byNumber(1).alg])).toEqual({ ok: false, reason: 'duplicate' });
  });
});
