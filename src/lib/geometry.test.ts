import { describe, expect, it } from 'vitest';
import { applyAlgorithmTo } from './cube';
import { AXIS_INDEX, STICKERS, parseMove, rotate, stickerAt, turnsCubie } from './geometry';

const identity = () => Array.from({ length: 54 }, (_, i) => i);

describe('sticker geometry', () => {
  it('places every sticker on a distinct outer face of a cubie', () => {
    const places = new Set(STICKERS.map((s) => `${s.cubie.join()}|${s.normal.join()}`));
    expect(places.size).toBe(54);
    for (const s of STICKERS) {
      expect(s.cubie[AXIS_INDEX[s.normal[0] !== 0 ? 'x' : s.normal[1] !== 0 ? 'y' : 'z']]).toBe(
        s.normal[0] + s.normal[1] + s.normal[2],
      );
      expect(stickerAt(s.cubie, s.normal)).toBe(s.index);
    }
  });

  it.each(['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'r', 'l', 'u', 'd', 'f', 'b', 'x', 'y', 'z'])(
    '%s turns the same stickers as the facelet simulation',
    (token) => {
      for (const suffix of ['', "'", '2']) {
        const move = parseMove(token + suffix)!;
        const tracked = applyAlgorithmTo(identity(), token + suffix);
        for (const s of STICKERS) {
          const turns = turnsCubie(move.shape, s.cubie) ? move.shape.dir * move.quarterTurns : 0;
          const to = stickerAt(rotate(s.cubie, move.shape.axis, turns), rotate(s.normal, move.shape.axis, turns));
          expect(tracked[to], `${token}${suffix} sticker ${s.index}`).toBe(s.index);
        }
      }
    },
  );
});
