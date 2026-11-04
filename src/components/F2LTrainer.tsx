import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCubeTurns } from '../hooks/useCubeTurns';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useLanguage } from '../i18n/LanguageContext';
import type { Face } from '../lib/cube';
import { F2L_GROUPS, LAST_LAYER_STICKERS, pairState, type F2LCase } from '../lib/f2l';
import { applyMove, formatMove, inverseMove, isSolved, startTrainer, undoMove, type Move } from '../lib/f2lTrainer';
import { Cube3D, DEFAULT_VIEW } from './Cube3D';

const MOVE_FACES: readonly Face[] = ['R', 'U', 'F', 'L', 'B', 'D'];
const TIMES = [1, 3, 2] as const;

const ICON_BUTTON =
  'rounded-md px-2.5 py-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400';

/** One line describing where the pair's pieces are, e.g. "Corner UFR, white to the front · Edge UB, green up". */
export function useCaseDescription(alg: string): string {
  const { t } = useLanguage();
  return useMemo(() => {
    const s = pairState(startTrainer(alg).perm);
    return `${t.f2l.corner} ${s.corner}, ${t.f2l.white} ${t.f2l.toward[s.white]} · ${t.f2l.edge} ${s.edge}, ${t.f2l.green} ${t.f2l.toward[s.green]}`;
  }, [alg, t]);
}

/**
 * The algorithm with the user's progress: moves done in green, moves made
 * off the algorithm in red (to be undone) and the rest grey.
 */
function Notation({ done, deviation, alg }: { done: number; deviation: readonly Move[]; alg: readonly Move[] }) {
  const { t } = useLanguage();
  const token = 'rounded px-1.5 py-0.5';
  return (
    <p className="flex flex-wrap items-center gap-1 font-mono text-xl leading-relaxed" aria-live="polite">
      {alg.slice(0, done).map((m, i) => (
        <span key={`d${i}`} className={`${token} text-green-400`}>
          {formatMove(m)}
        </span>
      ))}
      {deviation.map((m, i) => (
        <span key={`w${i}`} className={`${token} bg-red-950 text-red-400`} title={t.f2l.legend.wrong}>
          {formatMove(m)}
        </span>
      ))}
      {alg.slice(done).map((m, i) => (
        <span
          key={`r${i}`}
          className={`${token} ${i === 0 && deviation.length === 0 ? 'text-neutral-100 underline decoration-neutral-500 underline-offset-4' : 'text-neutral-500'}`}
        >
          {formatMove(m)}
        </span>
      ))}
    </p>
  );
}

export function F2LTrainer({
  f2lCase,
  favorite,
  onToggleFavorite,
  onPrev,
  onNext,
  onClose,
}: {
  f2lCase: F2LCase;
  favorite: boolean;
  onToggleFavorite: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
}) {
  const { t, l } = useLanguage();
  const wide = useMediaQuery('(min-width: 640px)');
  const [state, setState] = useState(() => startTrainer(f2lCase.alg));
  const stateRef = useRef(state);
  stateRef.current = state;
  const cube = useCubeTurns(state.perm);
  const [view, setView] = useState(DEFAULT_VIEW);
  const description = useCaseDescription(f2lCase.alg);
  const group = F2L_GROUPS.find((g) => g.id === f2lCase.group)!;
  const solved = isSolved(state);

  const doMove = useCallback(
    (move: Move) => {
      setState((current) => applyMove(current, move));
      cube.play(formatMove(move));
    },
    [cube],
  );
  const undo = useCallback(() => {
    const last = stateRef.current.history.at(-1);
    if (last === undefined) return;
    cube.play(formatMove(inverseMove(last)));
    setState(undoMove(stateRef.current));
  }, [cube]);
  const restart = useCallback(() => {
    const fresh = startTrainer(f2lCase.alg);
    setState(fresh);
    cube.reset(fresh.perm);
  }, [cube, f2lCase.alg]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key;
      if (key === 'Escape') {
        onClose();
      } else if (key === 'Backspace' || key.toLowerCase() === 'z') {
        undo();
      } else if (key === 'ArrowLeft') {
        onPrev?.();
      } else if (key === 'ArrowRight') {
        onNext?.();
      } else if (/^[rufldbRUFLDB]$/.test(key)) {
        doMove({ face: key.toUpperCase() as Face, times: e.shiftKey ? 3 : 1 });
      } else {
        return;
      }
      e.preventDefault();
      // The cheatsheet behind also listens for Escape; this overlay handles it first.
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [doMove, undo, onClose, onPrev, onNext]);

  const cubieSize = wide ? 54 : 40;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex justify-center bg-black/70 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.f2l.trainer}
        className="flex h-full w-full flex-col bg-neutral-950 sm:max-h-full sm:max-w-5xl sm:rounded-lg sm:border sm:border-neutral-800 sm:shadow-xl"
      >
        <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-2">
          <button type="button" onClick={onClose} aria-label={t.f2l.back} title={t.f2l.back} className={ICON_BUTTON}>
            ←
          </button>
          <button type="button" onClick={onPrev ?? undefined} disabled={onPrev === null} aria-label={t.f2l.prev} title={t.f2l.prev} className={ICON_BUTTON}>
            ◀
          </button>
          <div className="min-w-0 flex-1 px-1">
            <div className="flex items-baseline gap-2">
              <h2 className="shrink-0 text-base font-semibold whitespace-nowrap text-neutral-100">{t.f2l.caseName(f2lCase.number)}</h2>
              <span className="truncate text-xs text-neutral-500">{l(group.title)}</span>
            </div>
            <p className="truncate text-xs text-neutral-400">{description}</p>
          </div>
          <button type="button" onClick={onNext ?? undefined} disabled={onNext === null} aria-label={t.f2l.next} title={t.f2l.next} className={ICON_BUTTON}>
            ▶
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? t.cheatsheet.removeFavorite : t.cheatsheet.markFavorite}
            title={favorite ? t.cheatsheet.removeFavorite : t.cheatsheet.markFavorite}
            className={`rounded-md px-2 py-1 text-lg leading-none ${favorite ? 'text-yellow-400' : 'text-neutral-600 hover:text-neutral-300'}`}
          >
            {favorite ? '★' : '☆'}
          </button>
          <button type="button" onClick={onClose} aria-label={t.cheatsheet.close} className={ICON_BUTTON}>
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:flex-row">
          <div className="relative flex shrink-0 items-center justify-center overflow-hidden sm:flex-1">
            <Cube3D
              perm={cube.perm}
              dim={LAST_LAYER_STICKERS}
              turn={cube.turn}
              size={cubieSize}
              view={view}
              onViewChange={setView}
              label={t.f2l.cubeLabel}
            />
            {(view.rx !== DEFAULT_VIEW.rx || view.ry !== DEFAULT_VIEW.ry) && (
              <button
                type="button"
                onClick={() => setView(DEFAULT_VIEW)}
                className="absolute right-2 bottom-2 rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              >
                {t.f2l.resetView}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-neutral-800 p-4 sm:w-80 sm:shrink-0 sm:border-t-0 sm:border-l">
            <div>
              <Notation done={state.done} deviation={state.deviation} alg={state.alg} />
              <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                <span>{t.f2l.progress(state.done, state.alg.length)}</span>
                <span className="text-green-400">■ {t.f2l.legend.done}</span>
                <span className="text-red-400">■ {t.f2l.legend.wrong}</span>
              </div>
            </div>
            {solved && (
              <div role="status" className="rounded-lg border border-green-800 bg-green-950 p-3">
                <div className="font-semibold text-green-300">{t.f2l.solved}</div>
                <p className="mt-1 text-xs text-green-200/80">{t.f2l.solvedHint}</p>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{t.f2l.moves}</div>
              <div className="grid grid-cols-6 gap-1">
                {TIMES.map((times) =>
                  MOVE_FACES.map((face) => {
                    const move: Move = { face, times };
                    return (
                      <button
                        key={formatMove(move)}
                        type="button"
                        onClick={() => doMove(move)}
                        className="rounded-md border border-neutral-800 bg-neutral-900 py-2 font-mono text-base text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700"
                      >
                        {formatMove(move)}
                      </button>
                    );
                  }),
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={undo}
                  disabled={state.history.length === 0}
                  className="rounded-md border border-neutral-800 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  ↶ {t.f2l.undo}
                </button>
                <button
                  type="button"
                  onClick={restart}
                  className="rounded-md border border-neutral-800 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  ↻ {t.f2l.restart}
                </button>
              </div>
            </div>
            <p className="hidden text-xs text-neutral-600 sm:block">{t.f2l.keysHint}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
