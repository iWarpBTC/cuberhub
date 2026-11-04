import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCubeTurns } from '../hooks/useCubeTurns';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useLanguage } from '../i18n/LanguageContext';
import type { Face } from '../lib/cube';
import { F2L_GROUPS, LAST_LAYER_STICKERS, f2lCasePerm, pairState, type F2LCase } from '../lib/f2l';
import { checkSolution, type AcceptedSolution, type SolutionCheck } from '../lib/f2lSolutions';
import { applyMove, formatMove, inverseMove, isSolved, startTrainer, type Move, type TrainerState } from '../lib/f2lTrainer';
import { newId } from '../lib/id';
import type { F2LSolution } from '../types';
import { Cube3D, DEFAULT_VIEW } from './Cube3D';

const MOVE_FACES: readonly Face[] = ['R', 'U', 'F', 'L', 'B', 'D'];
const TIMES = [1, 3, 2] as const;

const ICON_BUTTON =
  'rounded-md px-2.5 py-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400';
const SMALL_BUTTON = 'rounded-md border border-neutral-800 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800';
const INPUT = 'w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500';

/** One line describing where the pair's pieces are, e.g. "Corner UFR, white to the front · Edge UB, green up". */
export function useCaseDescription(alg: string): string {
  const { t } = useLanguage();
  return useMemo(() => {
    const s = pairState(f2lCasePerm(alg));
    return `${t.f2l.corner} ${s.corner}, ${t.f2l.white} ${t.f2l.toward[s.white]} · ${t.f2l.edge} ${s.edge}, ${t.f2l.green} ${t.f2l.toward[s.green]}`;
  }, [alg, t]);
}

/** A solution the trainer can follow: the case's own or one the user added. */
interface Followed {
  id: string;
  label: string;
  alg: string;
  source?: string;
  note?: string;
  custom: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
}

/**
 * The algorithm with the user's progress: moves done in green, moves made
 * off the algorithm in red (to be undone) and the rest grey.
 */
function Notation({ state }: { state: TrainerState }) {
  const { t } = useLanguage();
  const { done, deviation, alg } = state;
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

/** Form for adding a solution; checks it with the simulation before saving. */
function AddSolutionForm({
  f2lCase,
  known,
  onSave,
  onCancel,
}: {
  f2lCase: F2LCase;
  known: readonly string[];
  onSave: (caseId: string, solution: AcceptedSolution, note: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [alg, setAlg] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<SolutionCheck | null>(null);
  const algRef = useRef<HTMLInputElement>(null);

  useEffect(() => algRef.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const check = checkSolution(f2lCase, alg, known);
    if (check.ok) onSave(f2lCase.id, check, note.trim());
    else setResult(check);
  };

  const message = (check: SolutionCheck): string => {
    if (check.ok) return '';
    switch (check.reason) {
      case 'empty':
        return t.f2l.check.empty;
      case 'unknown-move':
        return t.f2l.check.unknownMove(check.token);
      case 'breaks':
        return t.f2l.check.breaks;
      case 'unsolved':
        return t.f2l.check.unsolved;
      case 'duplicate':
        return t.f2l.check.duplicate;
      case 'other-case':
        return t.f2l.check.otherCase(check.f2lCase.number, check.solution.alg);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-neutral-800 p-3">
      <label className="block text-xs text-neutral-400">
        {t.f2l.algLabel}
        <input
          ref={algRef}
          value={alg}
          onChange={(e) => {
            setAlg(e.target.value);
            setResult(null);
          }}
          placeholder={t.f2l.algPlaceholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={`${INPUT} mt-1 font-mono`}
        />
      </label>
      <label className="block text-xs text-neutral-400">
        {t.f2l.noteLabel}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.f2l.notePlaceholder} className={`${INPUT} mt-1`} />
      </label>
      {result !== null && !result.ok && (
        <p role="alert" className="text-xs text-red-400">
          {message(result)}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <button type="submit" className={`${SMALL_BUTTON} bg-neutral-800 text-neutral-100`}>
          {t.f2l.save}
        </button>
        {result !== null && !result.ok && result.reason === 'other-case' && (
          <button
            type="button"
            onClick={() => onSave(result.f2lCase.id, result.solution, note.trim())}
            className={SMALL_BUTTON}
          >
            {t.f2l.check.saveTo(result.f2lCase.number)}
          </button>
        )}
        <button type="button" onClick={onCancel} className={SMALL_BUTTON}>
          {t.f2l.cancel}
        </button>
      </div>
    </form>
  );
}

export function F2LTrainer({
  f2lCase,
  solutions,
  favorite,
  onToggleFavorite,
  onAddSolution,
  onDeleteSolution,
  onPrev,
  onNext,
  onClose,
}: {
  f2lCase: F2LCase;
  /** The user's solutions of this case. */
  solutions: readonly F2LSolution[];
  favorite: boolean;
  onToggleFavorite: () => void;
  onAddSolution: (solution: F2LSolution) => void;
  onDeleteSolution: (id: string) => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
}) {
  const { t, l } = useLanguage();
  const wide = useMediaQuery('(min-width: 640px)');
  const description = useCaseDescription(f2lCase.alg);
  const group = F2L_GROUPS.find((g) => g.id === f2lCase.group)!;

  const followed = useMemo<Followed[]>(
    () => [
      { id: 'default', label: t.f2l.defaultSolution, alg: f2lCase.alg, custom: false },
      ...solutions.map((s, i) => ({
        id: s.id,
        label: s.note !== undefined && s.note.length > 0 ? s.note : t.f2l.customSolution(i + 1),
        alg: s.alg,
        source: s.source,
        note: s.note,
        custom: true,
      })),
    ],
    [f2lCase.alg, solutions, t],
  );

  // Every move made, in order; each solution's progress is replayed from it.
  const [history, setHistory] = useState<Move[]>([]);
  const states = useMemo(
    () => followed.map((s) => history.reduce(applyMove, startTrainer(s.alg))),
    [followed, history],
  );
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const bestIndex = states.reduce(
    (best, s, i) =>
      s.done > states[best]!.done || (s.done === states[best]!.done && s.deviation.length < states[best]!.deviation.length) ? i : best,
    0,
  );
  const pinnedIndex = followed.findIndex((s) => s.id === pinnedId);
  const activeIndex = pinnedIndex >= 0 ? pinnedIndex : bestIndex;
  const active = followed[activeIndex]!;
  const activeState = states[activeIndex]!;
  const solved = isSolved(activeState);

  const cube = useCubeTurns(activeState.perm);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const doMove = useCallback(
    (move: Move) => {
      setHistory((current) => [...current, move]);
      cube.play(formatMove(move));
    },
    [cube],
  );
  const historyRef = useRef(history);
  historyRef.current = history;
  const undo = useCallback(() => {
    const last = historyRef.current.at(-1);
    if (last === undefined) return;
    cube.play(formatMove(inverseMove(last)));
    setHistory(historyRef.current.slice(0, -1));
  }, [cube]);
  const restart = useCallback(() => {
    setHistory([]);
    cube.reset(f2lCasePerm(f2lCase.alg));
  }, [cube, f2lCase.alg]);

  const saveSolution = (caseId: string, solution: AcceptedSolution, note: string) => {
    const saved: F2LSolution = { id: newId(), caseId, alg: solution.alg, createdAt: Date.now() };
    if (solution.source !== undefined) saved.source = solution.source;
    if (note.length > 0) saved.note = note;
    onAddSolution(saved);
    setAdding(false);
    const notes: string[] = [];
    if (solution.auf !== undefined) notes.push(t.f2l.aufAdded(solution.auf));
    if (solution.source !== undefined && /[xyzMESwurfdlb]/.test(solution.source)) notes.push(t.f2l.rotationsRewritten);
    setNotice(notes.length > 0 ? notes.join(' ') : null);
    if (caseId === f2lCase.id) setPinnedId(saved.id);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key;
      if (isTypingTarget(e.target)) {
        if (key === 'Escape') {
          setAdding(false);
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
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
  const chip = (selected: boolean) =>
    `rounded px-2 py-0.5 text-xs ${selected ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'}`;

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
              {followed.length > 1 && (
                <div role="group" aria-label={t.f2l.solutions} className="mb-2 flex flex-wrap items-center gap-1">
                  <button type="button" aria-pressed={pinnedId === null} onClick={() => setPinnedId(null)} title={t.f2l.autoTitle} className={chip(pinnedId === null)}>
                    {t.f2l.auto}
                  </button>
                  {followed.map((s) => (
                    <span key={s.id} className="inline-flex items-center">
                      <button type="button" aria-pressed={pinnedId === s.id} onClick={() => setPinnedId(s.id)} className={chip(pinnedId === s.id)}>
                        {s.label}
                      </button>
                      {s.custom && (
                        <button
                          type="button"
                          onClick={() => {
                            if (pinnedId === s.id) setPinnedId(null);
                            onDeleteSolution(s.id);
                          }}
                          aria-label={t.f2l.deleteSolution}
                          title={t.f2l.deleteSolution}
                          className="rounded px-1 text-xs text-neutral-600 hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <Notation state={activeState} />
              {active.source !== undefined && (
                <p className="mt-1 text-xs text-neutral-500">
                  {t.f2l.writtenAs} <span className="font-mono text-neutral-400">{active.source}</span>
                </p>
              )}
              {active.custom && active.note !== undefined && followed.length <= 1 && (
                <p className="mt-1 text-xs italic text-neutral-500">{active.note}</p>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                <span>{t.f2l.progress(activeState.done, activeState.alg.length)}</span>
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
                  disabled={history.length === 0}
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
            {adding ? (
              <AddSolutionForm
                f2lCase={f2lCase}
                known={followed.map((s) => s.alg)}
                onSave={saveSolution}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(true);
                    setNotice(null);
                  }}
                  className={SMALL_BUTTON}
                >
                  + {t.f2l.addSolution}
                </button>
                {notice !== null && <p className="mt-2 text-xs text-neutral-400">{notice}</p>}
              </div>
            )}
            <p className="hidden text-xs text-neutral-600 sm:block">{t.f2l.keysHint}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
