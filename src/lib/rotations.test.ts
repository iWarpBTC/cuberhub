import { describe, expect, it } from 'vitest';
import { applyAlgorithm, invertAlgorithm } from './cube';
import { joinMoves, tokenizeAlgorithm, withoutRotations } from './rotations';

const ALGS = [
  "y' R' U' R",
  "d R' U' R U2' (R' U R)",
  "y' R' U R U' d' (R U R')",
  "U R U' R' d' (L' U L)",
  "y' U' R' U R r' U' R U M'",
  "x y z R U F L B D x' y2 z'",
  "Rw U Rw' Uw2 Fw' M E S M2 E' S2",
  "[R' F R F'] [R U' R' U] (R U' R' U2) (R U' R')",
  "u d f b l r",
];

describe('withoutRotations', () => {
  it.each(ALGS)('"%s" has the same effect, minus the rotation', (alg) => {
    const { alg: rewritten, rotations } = withoutRotations(alg);
    expect(rewritten).toMatch(/^([URFDLB](2|')?( |$))*$/);
    const plain = alg.replace(/[[\]]/g, ' ');
    const expected = applyAlgorithm(rotations === '' ? plain : `${plain} ${invertAlgorithm(rotations)}`);
    expect(applyAlgorithm(rewritten)).toEqual(expected);
  });

  it('rewrites the usual F2L spellings', () => {
    expect(withoutRotations("y' R' U' R").alg).toBe("F' U' F");
    expect(withoutRotations("d R' U' R U2' (R' U R)").alg).toBe("U F' U' F U2 F' U F");
    expect(withoutRotations("U' (R' F R F') (R U' R')").alg).toBe("U' R' F R F' R U' R'");
    expect(withoutRotations("R U R'").rotations).toBe('');
  });

  it('rejects unknown tokens', () => {
    expect(() => tokenizeAlgorithm("R U Q'")).toThrow('Q');
    expect(() => tokenizeAlgorithm('R3')).toThrow('R3');
  });

  it('merges turns of the same face', () => {
    expect(joinMoves(['R', 'R'])).toBe('R2');
    expect(joinMoves(['R', "R'", 'U'])).toBe('U');
    expect(joinMoves(['U', 'U2', 'R'])).toBe("U' R");
  });
});
