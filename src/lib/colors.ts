import type { Face } from './cube';

/**
 * Sticker colors for a cube held yellow up, green front: the usual view for
 * last-layer and F2L pictures. The simulation's U face is the top, whatever
 * color the scramble net uses.
 */
export const CUBE_COLORS: Record<Face, string> = {
  U: '#facc15', // yellow
  D: '#f1f5f9', // white
  F: '#22c55e', // green
  B: '#3b82f6', // blue
  R: '#f97316', // orange
  L: '#ef4444', // red
};

/** Stickers that don't matter for the case being shown. */
export const DIM_COLOR = '#404040';
