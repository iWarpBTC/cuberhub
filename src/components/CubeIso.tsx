import { CUBE_COLORS, DIM_COLOR } from '../lib/colors';
import type { Perm } from '../lib/f2l';
import { NORMALS, faceOf, stickerAt, type Vec3 } from '../lib/geometry';

/**
 * Small isometric picture of a cube position: the top, front and right
 * faces, plus the back and left stickers of the top layer as thin strips
 * beyond the top face, so a top-layer piece is never hidden.
 */

const COS30 = Math.cos(Math.PI / 6);
const SCALE = 10;
const HALF = 0.45;
const STRIP = [0.15, 0.5] as const;

function project([x, y, z]: Vec3): string {
  return `${((x - z) * COS30 * SCALE).toFixed(1)},${((-y + (x + z) / 2) * SCALE).toFixed(1)}`;
}

interface Quad {
  index: number;
  points: string;
}

function quad(index: number, corners: Vec3[]): Quad {
  return { index, points: corners.map(project).join(' ') };
}

const QUADS: Quad[] = [];
for (const a of [-1, 0, 1]) {
  for (const b of [-1, 0, 1]) {
    // Top face (y = 1), front face (z = 1), right face (x = 1).
    QUADS.push(
      quad(stickerAt([a, 1, b], NORMALS.U), [
        [a - HALF, 1.5, b - HALF],
        [a + HALF, 1.5, b - HALF],
        [a + HALF, 1.5, b + HALF],
        [a - HALF, 1.5, b + HALF],
      ]),
      quad(stickerAt([a, b, 1], NORMALS.F), [
        [a - HALF, b - HALF, 1.5],
        [a + HALF, b - HALF, 1.5],
        [a + HALF, b + HALF, 1.5],
        [a - HALF, b + HALF, 1.5],
      ]),
      quad(stickerAt([1, b, a], NORMALS.R), [
        [1.5, b - HALF, a - HALF],
        [1.5, b - HALF, a + HALF],
        [1.5, b + HALF, a + HALF],
        [1.5, b + HALF, a - HALF],
      ]),
    );
  }
  // Back and left stickers of the top layer, laid flat beyond the top face.
  QUADS.push(
    quad(stickerAt([a, 1, -1], NORMALS.B), [
      [a - HALF, 1.5, -1.5 - STRIP[0]],
      [a + HALF, 1.5, -1.5 - STRIP[0]],
      [a + HALF, 1.5, -1.5 - STRIP[1]],
      [a - HALF, 1.5, -1.5 - STRIP[1]],
    ]),
    quad(stickerAt([-1, 1, a], NORMALS.L), [
      [-1.5 - STRIP[0], 1.5, a - HALF],
      [-1.5 - STRIP[0], 1.5, a + HALF],
      [-1.5 - STRIP[1], 1.5, a + HALF],
      [-1.5 - STRIP[1], 1.5, a - HALF],
    ]),
  );
}

const BODY: Vec3[] = [
  [-1.5, 1.5, -1.5],
  [1.5, 1.5, -1.5],
  [1.5, 1.5, 1.5],
  [1.5, -1.5, 1.5],
  [-1.5, -1.5, 1.5],
  [-1.5, 1.5, 1.5],
];
const BODY_POINTS = BODY.map(project).join(' ');

export function CubeIso({
  perm,
  dim,
  label,
  className,
}: {
  perm: Perm;
  dim?: ReadonlySet<number>;
  label: string;
  className?: string;
}) {
  const color = (index: number) => {
    const original = perm[index]!;
    return dim?.has(original) ? DIM_COLOR : CUBE_COLORS[faceOf(original)];
  };
  return (
    <svg viewBox="-32 -38 64 70" className={className} role="img" aria-label={label}>
      <polygon points={BODY_POINTS} fill="#0a0a0a" />
      {QUADS.map(({ index, points }) => (
        <polygon key={index} points={points} fill={color(index)} />
      ))}
    </svg>
  );
}
