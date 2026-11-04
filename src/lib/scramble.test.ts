import { describe, expect, it } from 'vitest';
import { createCustomScramble, generateScramble, parseCustomScramble } from './scramble';
import { isValidScramble } from './cube';

const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

describe('generateScramble', () => {
  it('generates 20 valid WCA moves', () => {
    for (let i = 0; i < 200; i++) {
      const scramble = generateScramble();
      const moves = scramble.split(' ');
      expect(moves).toHaveLength(20);
      expect(isValidScramble(scramble)).toBe(true);
    }
  });

  it('never repeats a face consecutively or across its opposite', () => {
    for (let i = 0; i < 200; i++) {
      const faces = generateScramble()
        .split(' ')
        .map((m) => m[0]!);
      for (let j = 1; j < faces.length; j++) {
        expect(faces[j]).not.toBe(faces[j - 1]);
        if (j >= 2 && AXIS[faces[j]!] === AXIS[faces[j - 1]!]) {
          expect(faces[j]).not.toBe(faces[j - 2]);
        }
      }
    }
  });
});

describe('parseCustomScramble', () => {
  it('keeps a tidy WCA scramble as it is', () => {
    expect(parseCustomScramble("R U2 F' D L2 B")).toEqual({ ok: true, scramble: "R U2 F' D L2 B" });
  });

  it('tidies spacing, case, apostrophes, parentheses and glued moves', () => {
    expect(parseCustomScramble("  r  u\tR\u2019 (u') ")).toEqual({ ok: true, scramble: "R U R' U'" });
    expect(parseCustomScramble("RUR'U'")).toEqual({ ok: true, scramble: "R U R' U'" });
    expect(parseCustomScramble("R2' U2")).toEqual({ ok: true, scramble: 'R2 U2' });
    expect(parseCustomScramble("(R U R' U') (R' F R2 U' R' U' R U R' F')").ok).toBe(true);
  });

  it('always produces a valid stored scramble', () => {
    for (const input of ["r u r' u'", 'RUR', "F2'B2D'", '(L) [R] D,U']) {
      const parsed = parseCustomScramble(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(isValidScramble(parsed.scramble)).toBe(true);
    }
  });

  it('rejects empty input and names the chunk it cannot read', () => {
    expect(parseCustomScramble('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseCustomScramble('()')).toEqual({ ok: false, reason: 'empty' });
    expect(parseCustomScramble("R U M' F")).toEqual({ ok: false, reason: 'invalid', token: "M'" });
    expect(parseCustomScramble('R x2 U')).toEqual({ ok: false, reason: 'invalid', token: 'x2' });
    expect(parseCustomScramble("RUR3")).toEqual({ ok: false, reason: 'invalid', token: 'RUR3' });
    expect(parseCustomScramble('Rw U')).toEqual({ ok: false, reason: 'invalid', token: 'Rw' });
  });
});

describe('createCustomScramble', () => {
  it('stores the sequence and a trimmed optional title', () => {
    const plain = createCustomScramble("R U R'");
    expect(plain.scramble).toBe("R U R'");
    expect(plain.favorite).toBe(false);
    expect(plain.title).toBeUndefined();
    expect(createCustomScramble("R U R'", '  ').title).toBeUndefined();
    expect(createCustomScramble("R U R'", ' Sexy move ').title).toBe('Sexy move');
  });
});
