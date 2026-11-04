import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { CUBE_COLORS, DIM_COLOR } from '../lib/colors';
import type { Perm } from '../lib/f2l';
import { NORMALS, faceOf, stickerAt, turnsCubie, type Vec3 } from '../lib/geometry';
import type { Turn } from '../hooks/useCubeTurns';
import type { Face } from '../lib/cube';

const COORDS = [-1, 0, 1] as const;

const CUBIES: Vec3[] = COORDS.flatMap((x) =>
  COORDS.flatMap((y) => COORDS.filter((z) => x !== 0 || y !== 0 || z !== 0).map((z): Vec3 => [x, y, z])),
);

/** Turns a face div so it faces along the cube-space normal (CSS y points down). */
const FACE_ROTATION: Record<Face, string> = {
  F: '',
  B: 'rotateY(180deg)',
  R: 'rotateY(90deg)',
  L: 'rotateY(-90deg)',
  U: 'rotateX(90deg)',
  D: 'rotateX(-90deg)',
};

const FACES = Object.keys(NORMALS) as Face[];

/** Where the cube is seen from: shows the top, front and right faces. */
export const DEFAULT_VIEW = { rx: -28, ry: -36 };

/**
 * A 3×3×3 cube drawn with CSS 3D transforms. Drag to look at it from
 * another side. `dim` lists the stickers (by solved position) to draw grey.
 */
export function Cube3D({
  perm,
  dim,
  turn,
  size,
  view,
  onViewChange,
  label,
}: {
  perm: Perm;
  dim?: ReadonlySet<number>;
  turn: Turn | null;
  /** Edge length of one cubie in px. */
  size: number;
  view: { rx: number; ry: number };
  onViewChange: (view: { rx: number; ry: number }) => void;
  label: string;
}) {
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [view],
  );
  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const start = drag.current;
      if (start === null) return;
      const rx = Math.max(-90, Math.min(90, start.rx - (e.clientY - start.y) * 0.4));
      const ry = start.ry + (e.clientX - start.x) * 0.4;
      onViewChange({ rx, ry });
    },
    [onViewChange],
  );
  const onPointerUp = useCallback(() => {
    drag.current = null;
    setDragging(false);
  }, []);

  const box = size * 3;
  const stickerColor = (index: number) => {
    const original = perm[index]!;
    return dim?.has(original) ? DIM_COLOR : CUBE_COLORS[faceOf(original)];
  };

  return (
    <div
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`relative select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ width: box * 1.9, height: box * 1.9, perspective: box * 6, touchAction: 'none' }}
    >
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: 0,
          height: 0,
          transformStyle: 'preserve-3d',
          transform: `rotateX(${view.rx}deg) rotateY(${view.ry}deg)`,
        }}
      >
        {CUBIES.map((cubie) => {
          const [x, y, z] = cubie;
          const turning = turn !== null && turnsCubie(turn.shape, cubie);
          const spin = turning ? `rotate${turn.shape.axis.toUpperCase()}(${turn.angle}deg) ` : '';
          const cubieStyle: CSSProperties = {
            width: size,
            height: size,
            left: -size / 2,
            top: -size / 2,
            transformStyle: 'preserve-3d',
            transform: `${spin}translate3d(${x * size}px, ${-y * size}px, ${z * size}px)`,
          };
          return (
            <div key={cubie.join()} className="absolute" style={cubieStyle}>
              {FACES.map((face) => {
                const index = stickerAt(cubie, NORMALS[face]);
                // Inner (black) faces only matter while a layer turns; at rest Safari
                // sometimes paints them over the stickers in front of them.
                if (index < 0 && turn === null) return null;
                const faceStyle: CSSProperties = {
                  backfaceVisibility: 'hidden',
                  transform: `${FACE_ROTATION[face]} translateZ(${size / 2}px)`,
                  background: '#0a0a0a',
                };
                return (
                  <div key={face} className="absolute inset-0" style={faceStyle}>
                    {index >= 0 && (
                      <div
                        className="absolute rounded-[12%]"
                        style={{ inset: '6%', background: stickerColor(index) }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
