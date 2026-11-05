import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type Turn, useCubeTurns } from '../../hooks/useCubeTurns';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useLanguage } from '../../i18n/LanguageContext';
import { CUBE_COLORS } from '../../lib/colors';
import type { Face } from '../../lib/cube';
import { EDGE_FACELETS, crossEdgeSide, locateEdge, type CrossEdge } from '../../lib/cross';
import type { DrySettings, Outcome, TaskResult } from '../../lib/dryPractice';
import type { Perm } from '../../lib/f2l';
import { formatMove, inverseMove, parseFaceMove, type Move } from '../../lib/f2lTrainer';
import { formatMs } from '../../lib/format';
import { BOTTOM_VIEW, Cube3D, DEFAULT_VIEW } from '../Cube3D';

/** What every mode gets from the shell. */
export interface ModeProps {
  level: number;
  settings: DrySettings;
  /** Reports a finished task and gets back what it scored. */
  onResult: (result: TaskResult, limitMs?: number | null) => Outcome;
}

export const PRIMARY_BUTTON =
  'rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-30 disabled:hover:bg-neutral-100';
export const SECONDARY_BUTTON =
  'rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent';
export const SMALL_BUTTON =
  'rounded-md border border-neutral-800 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent';

/** Outline colours on the cube. */
export const MARK = {
  track: '#60a5fa',
  right: '#4ade80',
  wrong: '#f87171',
  half: '#fbbf24',
} as const;

const MOVE_FACES: readonly Face[] = ['R', 'U', 'F', 'L', 'B', 'D'];
const TIMES = [1, 3, 2] as const;

export function formatSeconds(ms: number): string {
  return formatMs(Math.max(0, ms));
}

/** The time a task is scored with, for the result lines: "3.42 s". */
export function useSeconds(): (ms: number) => string {
  const { t } = useLanguage();
  return useCallback((ms: number) => t.dry.seconds(formatSeconds(ms)), [t]);
}

/** Re-renders every `intervalMs` while active and returns the current time. */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/**
 * Elapsed time since `startedAt` while `active`, and `onExpire` once when
 * it passes `limitMs` (null for no limit).
 */
export function useClock(active: boolean, startedAt: number, limitMs: number | null, onExpire?: () => void) {
  const now = useNow(active);
  const elapsed = active ? Math.max(0, now - startedAt) : 0;
  const expired = active && limitMs !== null && elapsed >= limitMs;
  const fired = useRef(false);
  useEffect(() => {
    if (!active) fired.current = false;
  }, [active, startedAt]);
  useEffect(() => {
    if (expired && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);
  return { elapsed, remaining: limitMs === null ? null : Math.max(0, limitMs - elapsed) };
}

/** A clock line: elapsed time, or the time left under a limit (red when short). */
export function ClockLine({ elapsed, remaining, label }: { elapsed: number; remaining: number | null; label?: string }) {
  const { t } = useLanguage();
  const short = remaining !== null && remaining < 3000;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-neutral-500">{label ?? (remaining === null ? t.dry.time : t.dry.timeLeft)}</span>
      <span className={`font-mono text-xl tabular-nums ${short ? 'text-red-400' : 'text-neutral-100'}`}>
        {remaining === null ? formatSeconds(elapsed) : Math.ceil(remaining / 1000)}
      </span>
      {remaining !== null && <span className="text-xs text-neutral-500">s</span>}
    </div>
  );
}

/**
 * Keyboard handling for a mode: `handler` returns true for a key it used.
 * Registered in the capture phase, before the shell's Escape handler.
 */
export function useKeys(handler: (e: KeyboardEvent) => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (ref.current(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

/** The face move a key means: R U F L B D, with Shift for the prime turn; null for other keys. */
export function moveForKey(e: KeyboardEvent): Move | null {
  if (!/^[rufldbRUFLDB]$/.test(e.key)) return null;
  return { face: e.key.toUpperCase() as Face, times: e.shiftKey ? 3 : 1 };
}

/** The cube with its view presets, in the layout the modes share (cube left, panel right). */
export function PracticeCube({
  perm,
  turn,
  size,
  hidden,
  dim,
  marks,
  pieceMarks,
  clickable,
  onStickerClick,
  quarterTurns = 0,
}: {
  perm: Perm;
  turn: Turn | null;
  size: number;
  /** How many y rotations the cube is shown turned by: 1 puts the orange (R) face where the front is drawn. */
  quarterTurns?: number;
  hidden?: boolean;
  dim?: ReadonlySet<number>;
  marks?: ReadonlyMap<number, string>;
  pieceMarks?: ReadonlyMap<number, string>;
  clickable?: ReadonlySet<number>;
  onStickerClick?: (index: number) => void;
}) {
  const { t } = useLanguage();
  // The view as it would be with green in front; the cube is drawn turned on from there.
  const [view, setView] = useState(DEFAULT_VIEW);
  const turned = 90 * quarterTurns;
  const preset = (v: { rx: number; ry: number }) => view.rx === v.rx && view.ry === v.ry;
  const chip = (selected: boolean) =>
    `rounded-md border px-2 py-1 text-xs ${selected ? 'border-neutral-600 bg-neutral-800 text-neutral-100' : 'border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'}`;
  return (
    <div className="relative flex shrink-0 items-center justify-center overflow-hidden sm:flex-1">
      <Cube3D
        perm={perm}
        turn={turn}
        size={size}
        view={{ rx: view.rx, ry: view.ry - turned }}
        onViewChange={(v) => setView({ rx: v.rx, ry: v.ry + turned })}
        hidden={hidden}
        dim={dim}
        marks={marks}
        pieceMarks={pieceMarks}
        clickable={clickable}
        onStickerClick={onStickerClick}
        label={t.f2l.cubeLabel}
      />
      {hidden && (
        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-neutral-400">
          {t.dry.cubeHidden}
        </div>
      )}
      <div className="absolute right-2 bottom-2 flex gap-1">
        <button type="button" onClick={() => setView(DEFAULT_VIEW)} aria-pressed={preset(DEFAULT_VIEW)} className={chip(preset(DEFAULT_VIEW))}>
          {t.dry.viewTop}
        </button>
        <button type="button" onClick={() => setView(BOTTOM_VIEW)} aria-pressed={preset(BOTTOM_VIEW)} className={chip(preset(BOTTOM_VIEW))}>
          {t.dry.viewBottom}
        </button>
      </div>
    </div>
  );
}

/** Cubie size for the 3D cube, smaller on phones. */
export function useCubieSize(): number {
  return useMediaQuery('(min-width: 640px)') ? 54 : 40;
}

/** The side panel next to the cube. */
export function Panel({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 border-t border-neutral-800 p-4 sm:w-80 sm:shrink-0 sm:border-t-0 sm:border-l">{children}</div>;
}

export function TaskLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:flex-row">{children}</div>;
}

/** The 18 face turns as buttons, with undo. */
export function MovePad({
  onMove,
  onUndo,
  canUndo,
  disabled = false,
}: {
  onMove: (move: Move) => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{t.dry.moves}</div>
      <div className="grid grid-cols-6 gap-1">
        {TIMES.map((times) =>
          MOVE_FACES.map((face) => {
            const move: Move = { face, times };
            return (
              <button
                key={formatMove(move)}
                type="button"
                disabled={disabled}
                onClick={() => onMove(move)}
                className="rounded-md border border-neutral-800 bg-neutral-900 py-2 font-mono text-base text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-900"
              >
                {formatMove(move)}
              </button>
            );
          }),
        )}
      </div>
      <button type="button" onClick={onUndo} disabled={disabled || !canUndo} className={`${SECONDARY_BUTTON} mt-2 w-full`}>
        ↶ {t.dry.undo}
      </button>
    </div>
  );
}

/** The moves made so far, as tokens. */
export function MoveList({ moves, optimal, muted = false }: { moves: readonly string[]; optimal?: number; muted?: boolean }) {
  const { t } = useLanguage();
  return (
    <div>
      <div className="flex items-baseline gap-2 text-xs text-neutral-500">
        <span>{t.dry.movesCount(moves.length)}</span>
        {optimal !== undefined && <span>· {t.dry.optimum(optimal)}</span>}
      </div>
      <p className={`mt-1 min-h-7 font-mono text-lg leading-relaxed ${muted ? 'text-neutral-500' : 'text-neutral-100'}`} aria-live="polite">
        {moves.length === 0 ? <span className="text-neutral-600">—</span> : moves.join(' ')}
      </p>
    </div>
  );
}

/** A white edge named by its colours, with two colour squares. */
export function EdgeChip({ edge, className = '' }: { edge: CrossEdge; className?: string }) {
  const { t } = useLanguage();
  const side = crossEdgeSide(edge);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="inline-flex overflow-hidden rounded-sm border border-neutral-700">
        <span className="h-3.5 w-3.5" style={{ background: CUBE_COLORS.D }} />
        <span className="h-3.5 w-3.5" style={{ background: CUBE_COLORS[side] }} />
      </span>
      <span>{t.dry.edgeName[side as 'F' | 'R' | 'B' | 'L']}</span>
    </span>
  );
}

/** The name of a cross edge as a phrase: "the white-green edge". */
export function useEdgeName(): (edge: CrossEdge) => string {
  const { t } = useLanguage();
  return useCallback((edge: CrossEdge) => t.dry.edge(t.dry.edgeName[crossEdgeSide(edge) as 'F' | 'R' | 'B' | 'L']), [t]);
}

/** "in UF, white up" for where an edge is on a position. */
export function usePositionName(): (perm: readonly number[], edge: CrossEdge) => string {
  const { t } = useLanguage();
  return useCallback(
    (perm: readonly number[], edge: CrossEdge) => {
      const location = locateEdge(perm, edge);
      return t.dry.position(location.slot, t.f2l.toward[location.whiteFace]);
    },
    [t],
  );
}

/** Both stickers of the given edges, outlined in `color`, keyed by solved position. */
export function pieceMarksFor(edges: readonly CrossEdge[], color: string): Map<number, string> {
  return new Map(edges.flatMap((e) => EDGE_FACELETS[e].map((facelet) => [facelet, color] as const)));
}

/** A random subset of the cross edges, in the cross order. */
export function pickEdges(all: readonly CrossEdge[], count: number): CrossEdge[] {
  const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, count);
  return all.filter((e) => shuffled.includes(e));
}

export function parseMoves(alg: string): Move[] {
  return alg.split(' ').filter(Boolean).map((token) => parseFaceMove(token)!);
}

/**
 * Plays a sequence on the cube at a steady pace from a start position, for
 * the replays. `stop` cancels what is still to come.
 */
export function useReplay(cube: ReturnType<typeof useCubeTurns>) {
  const timers = useRef<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const stop = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
    setPlaying(false);
  }, []);
  const replay = useCallback(
    (start: Perm, moves: readonly string[], onDone?: () => void) => {
      stop();
      cube.reset(start);
      setPlaying(true);
      moves.forEach((move, i) => {
        timers.current.push(window.setTimeout(() => cube.play(move), 400 + i * 600));
      });
      timers.current.push(
        window.setTimeout(() => {
          setPlaying(false);
          onDone?.();
        }, 400 + moves.length * 600 + 200),
      );
    },
    [cube, stop],
  );
  useEffect(() => stop, [stop]);
  return { replay, stop, playing };
}

/** A cube that follows a list of moves the user makes, with undo. */
export function useMoveEntry(start: Perm, animate: boolean) {
  const cube = useCubeTurns(start);
  const [moves, setMoves] = useState<Move[]>([]);
  const tokens = useMemo(() => moves.map(formatMove), [moves]);
  const add = useCallback(
    (move: Move) => {
      setMoves((current) => [...current, move]);
      if (animate) cube.play(formatMove(move));
    },
    [cube, animate],
  );
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const undo = useCallback(() => {
    const last = movesRef.current.at(-1);
    if (last === undefined) return;
    setMoves(movesRef.current.slice(0, -1));
    if (animate) cube.play(formatMove(inverseMove(last)));
  }, [cube, animate]);
  const reset = useCallback(
    (perm: Perm) => {
      setMoves([]);
      cube.reset(perm);
    },
    [cube],
  );
  return { cube, moves, tokens, add, undo, reset };
}

/** The score and what came with it: level change, bests, streak. */
export function ResultBanner({
  outcome,
  title,
  lines,
  children,
}: {
  outcome: Outcome;
  title: string;
  lines: readonly string[];
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const { score, correct } = outcome;
  const parts: Array<[string, string]> = [];
  parts.push([t.dry.result.parts.base, String(score.base)]);
  if (score.speed > 0) parts.push([t.dry.result.parts.speed, `+${score.speed}`]);
  if (score.efficiency > 0) parts.push([t.dry.result.parts.efficiency, `+${score.efficiency}`]);
  if (score.streakFactor > 1) parts.push([t.dry.result.parts.streak, `×${score.streakFactor.toFixed(1)}`]);
  if (score.levelFactor > 1) parts.push([t.dry.result.parts.level, `×${score.levelFactor.toFixed(1)}`]);
  if (score.hintFactor < 1) parts.push([t.dry.result.parts.hint, `×${score.hintFactor}`]);
  const badges: string[] = [];
  if (outcome.levelChange === 1) badges.push(t.dry.result.levelUp(outcome.progress.level));
  if (outcome.levelChange === -1) badges.push(t.dry.result.levelDown(outcome.progress.level));
  if (outcome.newBest.score) badges.push(t.dry.result.newBestScore);
  if (outcome.newBest.time) badges.push(t.dry.result.newBestTime);
  if (correct && outcome.progress.streak >= 2) badges.push(t.dry.result.streak(outcome.progress.streak));
  const tone = correct
    ? 'border-green-800 bg-green-950 text-green-100'
    : score.base > 0
      ? 'border-yellow-800 bg-yellow-950 text-yellow-100'
      : 'border-red-900 bg-red-950 text-red-100';
  return (
    <div role="status" className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{title}</div>
        <div className="shrink-0 font-mono text-lg tabular-nums whitespace-nowrap">{t.dry.result.score(score.total)}</div>
      </div>
      {lines.map((line, i) => (
        <p key={i} className="mt-1 text-sm opacity-90">
          {line}
        </p>
      ))}
      {score.total > 0 && (
        <p className="mt-1.5 text-xs opacity-70">
          {parts.map(([name, value]) => `${name} ${value}`).join(' · ')}
        </p>
      )}
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span key={badge} className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-medium">
              {badge}
            </span>
          ))}
        </div>
      )}
      {children !== undefined && <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

/** Next / retry buttons under a result. */
export function NextButtons({ onNext, onRetry }: { onNext: () => void; onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onNext} className={PRIMARY_BUTTON}>
        {t.dry.next} ↵
      </button>
      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
        {t.dry.retry}
      </button>
    </div>
  );
}

export function HintButton({ label, onClick, used, disabled = false }: { label: string; onClick: () => void; used: boolean; disabled?: boolean }) {
  const { t } = useLanguage();
  return (
    <button type="button" onClick={onClick} disabled={disabled || used} title={t.dry.hintCost} className={`${SMALL_BUTTON} ${used ? 'line-through' : ''}`}>
      💡 {label} <span className="text-xs text-neutral-500">(H)</span>
    </button>
  );
}

export function KeysHint() {
  const { t } = useLanguage();
  return <p className="hidden text-xs text-neutral-600 sm:block">{t.dry.keysHint}</p>;
}
