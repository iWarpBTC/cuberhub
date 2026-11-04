import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { CROSS_EDGES, applyMoves, countSolved, crossSolver, scrambleForCross, type CrossEdge, type CrossTask } from '../../lib/cross';
import { LEVELS, type Outcome } from '../../lib/dryPractice';
import type { Move } from '../../lib/f2lTrainer';
import {
  EdgeChip,
  HintButton,
  KeysHint,
  MARK,
  MoveList,
  MovePad,
  NextButtons,
  Panel,
  PracticeCube,
  ResultBanner,
  SECONDARY_BUTTON,
  TaskLayout,
  moveForKey,
  pickEdges,
  pieceMarksFor,
  useCubieSize,
  useKeys,
  useMoveEntry,
  useReplay,
  type ModeProps,
} from './shared';

interface Task extends CrossTask {
  level: number;
  edges: CrossEdge[];
}

function newTask(level: number): Task {
  const spec = LEVELS.miniCross[level - 1]!;
  const edges = pickEdges(CROSS_EDGES, spec.edges);
  return { level, edges, ...scrambleForCross(edges, spec.optimal) };
}

/** Mini Cross: solve one to three cross edges on a visible cube in as few moves as possible. */
export function MiniCross({ level, onResult }: ModeProps) {
  const { t } = useLanguage();
  const size = useCubieSize();
  const [task, setTask] = useState(() => newTask(level));
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [hint, setHint] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const entry = useMoveEntry(task.perm, true);
  const { replay, stop, playing } = useReplay(entry.cube);

  const current = useMemo(() => applyMoves(task.perm, entry.tokens), [task.perm, entry.tokens]);
  const solved = countSolved(current, task.edges) === task.edges.length;

  const finish = useCallback(
    (accuracy: number) => {
      setOutcome(
        onResult({
          mode: 'miniCross',
          level: task.level,
          accuracy,
          timeMs: Date.now() - startedAt,
          moves: entry.tokens.length,
          optimal: task.optimal.length,
          hint: hint !== null,
          at: Date.now(),
        }),
      );
    },
    [onResult, task, startedAt, entry.tokens.length, hint],
  );

  // The task ends by itself the moment the edges are in.
  useEffect(() => {
    if (solved && outcome === null && entry.tokens.length > 0) finish(1);
  }, [solved, outcome, entry.tokens.length, finish]);

  const start = (next: Task) => {
    stop();
    setTask(next);
    setStartedAt(Date.now());
    setHint(null);
    setOutcome(null);
    setGaveUp(false);
    entry.reset(next.perm);
  };
  const next = () => start(newTask(level));
  const retry = () => start(task);
  const giveUp = () => {
    setGaveUp(true);
    finish(0);
  };
  const showHint = () => setHint(crossSolver(task.edges).firstMoves(current).join('  '));

  const doMove = (move: Move) => {
    if (outcome !== null || playing) return;
    entry.add(move);
  };

  useKeys((e) => {
    if (e.key === 'Enter') {
      if (outcome !== null) next();
      else return false;
      return true;
    }
    if (outcome !== null) return false;
    if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') {
      entry.undo();
      return true;
    }
    if (e.key.toLowerCase() === 'h') {
      showHint();
      return true;
    }
    const move = moveForKey(e);
    if (move !== null) {
      doMove(move);
      return true;
    }
    return false;
  });

  const marks = useMemo(() => pieceMarksFor(task.edges, MARK.track), [task.edges]);
  const extra = entry.tokens.length - task.optimal.length;

  return (
    <TaskLayout>
      <PracticeCube perm={entry.cube.perm} turn={entry.cube.turn} size={size} pieceMarks={marks} />
      <Panel>
        <div>
          <p className="text-sm text-neutral-300">{t.dry.mini.task(task.edges.length)}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {task.edges.map((edge) => (
              <EdgeChip key={edge} edge={edge} className="text-base font-medium text-neutral-100" />
            ))}
          </div>
        </div>
        <MoveList moves={entry.tokens} optimal={task.optimal.length} />
        {outcome === null ? (
          <>
            <MovePad onMove={doMove} onUndo={entry.undo} canUndo={entry.tokens.length > 0} />
            <div className="flex flex-wrap gap-1.5">
              <HintButton label={t.dry.mini.hint} onClick={showHint} used={hint !== null} />
              <button type="button" onClick={giveUp} className={SECONDARY_BUTTON}>
                {t.dry.giveUp}
              </button>
            </div>
            {hint !== null && (
              <p className="text-sm text-neutral-300">
                {t.dry.mini.hintIs('')}
                <span className="font-mono text-neutral-100">{hint}</span>
              </p>
            )}
          </>
        ) : (
          <>
            <ResultBanner
              outcome={outcome}
              title={gaveUp ? t.dry.mini.gaveUp : t.dry.mini.solved}
              lines={
                gaveUp
                  ? [t.dry.optimum(task.optimal.length)]
                  : [t.dry.mini.summary(entry.tokens.length, task.optimal.length), extra === 0 ? t.dry.mini.optimal : t.dry.mini.extra(extra)]
              }
            />
            <div>
              <div className="text-xs text-neutral-500">{t.dry.mini.optimalSolution}</div>
              <p className="mt-1 font-mono text-lg text-neutral-100">{task.optimal.join(' ')}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={playing} onClick={() => replay(task.perm, task.optimal)} className={SECONDARY_BUTTON}>
                ▶ {t.dry.mini.replayOptimal}
              </button>
              {!gaveUp && entry.tokens.length > 0 && (
                <button type="button" disabled={playing} onClick={() => replay(task.perm, entry.tokens)} className={SECONDARY_BUTTON}>
                  ▶ {t.dry.mini.replayMine}
                </button>
              )}
            </div>
            <NextButtons onNext={next} onRetry={retry} />
          </>
        )}
        <p className="text-xs text-neutral-600">{t.dry.modes.miniCross.help}</p>
        <KeysHint />
      </Panel>
    </TaskLayout>
  );
}
