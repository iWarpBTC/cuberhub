import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAlgorithmTo } from '../lib/cube';
import { parseMove } from '../lib/geometry';
import type { Perm } from '../lib/f2l';
import type { Axis, MoveShape } from '../lib/notation';

/** A layer turn in progress: the layers and how far (CSS degrees) they have turned so far. */
export interface Turn {
  shape: MoveShape;
  angle: number;
}

/** CSS rotateX/Y/Z direction of a clockwise turn (R, U, F) on each axis; CSS has y pointing down. */
export const CSS_TURN_SIGN: Record<Axis, 1 | -1> = { x: 1, y: -1, z: 1 };

const QUARTER_MS = 170;

/**
 * The cube to draw: the last committed position and the turn currently
 * animating. Moves are queued and played one after another, faster when
 * several are waiting.
 */
export function useCubeTurns(initial: Perm) {
  const [perm, setPerm] = useState(initial);
  const [turn, setTurn] = useState<Turn | null>(null);
  const committed = useRef(initial);
  const queue = useRef<string[]>([]);
  const animating = useRef(false);
  const raf = useRef(0);

  const playNext = useCallback(() => {
    const token = queue.current.shift();
    if (token === undefined) {
      animating.current = false;
      return;
    }
    animating.current = true;
    const parsed = parseMove(token);
    if (parsed === null) {
      playNext();
      return;
    }
    const { shape, quarterTurns } = parsed;
    const total = CSS_TURN_SIGN[shape.axis] * shape.dir * quarterTurns * 90;
    const duration = (QUARTER_MS * (Math.abs(quarterTurns) === 2 ? 1.5 : 1)) / (1 + queue.current.length);
    const started = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      if (progress < 1) {
        setTurn({ shape, angle: total * eased });
        raf.current = requestAnimationFrame(frame);
        return;
      }
      committed.current = applyAlgorithmTo([...committed.current], token);
      setPerm(committed.current);
      setTurn(null);
      playNext();
    };
    raf.current = requestAnimationFrame(frame);
  }, []);

  const play = useCallback(
    (token: string) => {
      queue.current.push(token);
      if (!animating.current) playNext();
    },
    [playNext],
  );

  const reset = useCallback((next: Perm) => {
    cancelAnimationFrame(raf.current);
    animating.current = false;
    queue.current = [];
    committed.current = next;
    setPerm(next);
    setTurn(null);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { perm, turn, play, reset };
}
