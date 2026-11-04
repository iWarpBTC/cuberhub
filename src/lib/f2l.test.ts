import { describe, expect, it } from 'vitest';
import { applyAlgorithmTo } from './cube';
import {
  F2L_CASES,
  F2L_GROUPS,
  f2lCaseKey,
  f2lCasePerm,
  identityPerm,
  isF2LSolved,
  pairState,
  preservesF2LRest,
} from './f2l';
import { parseFaceMoves } from './f2lTrainer';

describe('F2L cases', () => {
  it('are the 41 cases, numbered 1 to 41, in known groups', () => {
    expect(F2L_CASES.map((c) => c.number)).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
    expect(new Set(F2L_CASES.map((c) => c.id)).size).toBe(41);
    const groups = new Set(F2L_GROUPS.map((g) => g.id));
    for (const c of F2L_CASES) expect(groups.has(c.group)).toBe(true);
  });

  it.each(F2L_CASES.map((c) => [c.number, c.alg]))('case %i uses face turns only and only moves the pair', (_, alg) => {
    expect(() => parseFaceMoves(alg)).not.toThrow();
    expect(preservesF2LRest(alg)).toBe(true);
    expect(isF2LSolved(f2lCasePerm(alg))).toBe(false);
    expect(isF2LSolved(applyAlgorithmTo(f2lCasePerm(alg), alg))).toBe(true);
  });

  it('are 41 different cases (up to turns of the top layer)', () => {
    const keys = F2L_CASES.map((c) => f2lCaseKey(f2lCasePerm(c.alg)));
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(duplicates).toEqual([]);
    expect(new Set(keys).size).toBe(41);
  });

  it.each(F2L_CASES.map((c) => [c.number, c.group, c.alg]))('case %i matches its group %s', (_, group, alg) => {
    const s = pairState(f2lCasePerm(alg));
    const cornerUp = s.corner !== 'DFR';
    const edgeUp = s.edge !== 'FR';
    switch (group) {
      case 'top-side-match':
      case 'top-side-opposite':
        expect(cornerUp && edgeUp && s.white !== 'U').toBe(true);
        break;
      case 'top-up':
        expect(cornerUp && edgeUp && s.white === 'U').toBe(true);
        break;
      case 'corner-slot':
        expect(!cornerUp && edgeUp).toBe(true);
        break;
      case 'edge-slot':
        expect(cornerUp && !edgeUp).toBe(true);
        break;
      case 'both-slot':
        expect(!cornerUp && !edgeUp).toBe(true);
        break;
    }
  });

  it('describes the solved pair', () => {
    expect(pairState(identityPerm())).toEqual({ corner: 'DFR', white: 'D', edge: 'FR', green: 'F' });
    expect(isF2LSolved(identityPerm())).toBe(true);
    expect(isF2LSolved(applyAlgorithmTo(identityPerm(), "U R U' R'"))).toBe(false);
    expect(isF2LSolved(applyAlgorithmTo(identityPerm(), 'U2'))).toBe(true);
  });
});
