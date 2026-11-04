import { describe, expect, it } from 'vitest';
import { SIDE_FACES } from './colors';
import { FACES, applyAlgorithmTo, solvedCube } from './cube';

describe('SIDE_FACES', () => {
  it('lists each side face followed by the one on its right', () => {
    // y turns the whole cube like U, so the face on the right moves to the front.
    const afterY = applyAlgorithmTo(solvedCube(), 'y');
    const center = (face: string) => FACES.indexOf(face as (typeof FACES)[number]) * 9 + 4;
    SIDE_FACES.forEach((face, i) => {
      expect(afterY[center(face)]).toBe(SIDE_FACES[(i + 1) % SIDE_FACES.length]);
    });
  });
});
