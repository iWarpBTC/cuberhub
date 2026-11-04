import { useId, useMemo } from 'react';
import type { Face } from '../lib/cube';
import { CUBE_COLORS as LL_COLORS, DIM_COLOR as OLL_OTHER } from '../lib/colors';
import { lastLayerCase } from '../lib/lastLayer';

const STICKER = 18;
const GAP = 2;
const SIDE = 6; // thickness of the side-sticker strips
const PAD = 3; // space between the top face and the strips
const TOP0 = SIDE + PAD;
const FACE = 3 * STICKER + 2 * GAP;
const SIZE = 2 * TOP0 + FACE;

const cellOrigin = (i: number) => TOP0 + i * (STICKER + GAP);

function center(index: number): [number, number] {
  return [cellOrigin(index % 3) + STICKER / 2, cellOrigin(Math.floor(index / 3)) + STICKER / 2];
}

/** Arrow from piece `from` to `to`, shortened so the heads sit inside the stickers. */
function arrowPath(from: number, to: number): string {
  const [x1, y1] = center(from);
  const [x2, y2] = center(to);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const trim = 5 / len;
  const ax = x1 + (x2 - x1) * trim;
  const ay = y1 + (y2 - y1) * trim;
  const bx = x2 - (x2 - x1) * trim;
  const by = y2 - (y2 - y1) * trim;
  return `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
}

/**
 * Top view of the case an algorithm solves: the top face plus the side
 * stickers of the top layer. OLL shows only yellow; PLL shows all colors
 * and arrows for where the algorithm moves each piece.
 */
export function LastLayerDiagram({
  alg,
  kind,
  label,
  className,
}: {
  alg: string;
  kind: 'OLL' | 'PLL';
  label: string;
  className?: string;
}) {
  const view = useMemo(() => lastLayerCase(alg), [alg]);
  const markerId = `arrow${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const color = (face: Face) => (kind === 'PLL' ? LL_COLORS[face] : face === 'U' ? LL_COLORS.U : OLL_OTHER);

  // A swap appears as two moves; draw it once with a head on both ends.
  const arrows =
    kind === 'PLL'
      ? view.moves
          .filter(({ from, to }) => !view.moves.some((m) => m.from === to && m.to === from && from > to))
          .map(({ from, to }) => ({ from, to, swap: view.moves.some((m) => m.from === to && m.to === from) }))
      : [];

  const strip = (faces: Face[], horizontal: boolean, fixed: number) =>
    faces.map((face, i) => (
      <rect
        key={i}
        x={horizontal ? cellOrigin(i) : fixed}
        y={horizontal ? fixed : cellOrigin(i)}
        width={horizontal ? STICKER : SIDE}
        height={horizontal ? SIDE : STICKER}
        rx={1.5}
        fill={color(face)}
      />
    ));

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} role="img" aria-label={label}>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="#0a0a0a" />
        </marker>
      </defs>
      <rect x={TOP0 - 2} y={TOP0 - 2} width={FACE + 4} height={FACE + 4} rx={3} fill="#0a0a0a" />
      {view.top.map((face, i) => (
        <rect
          key={i}
          x={cellOrigin(i % 3)}
          y={cellOrigin(Math.floor(i / 3))}
          width={STICKER}
          height={STICKER}
          rx={2}
          fill={color(face)}
        />
      ))}
      {strip(view.back, true, 0)}
      {strip(view.front, true, SIZE - SIDE)}
      {strip(view.left, false, 0)}
      {strip(view.right, false, SIZE - SIDE)}
      {arrows.map(({ from, to, swap }) => (
        <path
          key={`${from}-${to}`}
          d={arrowPath(from, to)}
          stroke="#0a0a0a"
          strokeWidth={1.6}
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
          markerStart={swap ? `url(#${markerId})` : undefined}
        />
      ))}
    </svg>
  );
}
