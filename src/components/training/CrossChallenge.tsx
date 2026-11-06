import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { CROSS_EDGES, applyMoves, countSolved, scrambleForCross, type CrossTask } from '../../lib/cross';
import { LEVELS, effectiveTime, type Outcome } from '../../lib/dryPractice';
import type { Move } from '../../lib/f2lTrainer';
import {
  ClockLine,
  HintButton,
  KeysHint,
  MoveList,
  MovePad,
  NextButtons,
  PRIMARY_BUTTON,
  Panel,
  PracticeCube,
  ResultBanner,
  SECONDARY_BUTTON,
  TaskLayout,
  moveForKey,
  useClock,
  useCubieSize,
  useKeys,
  useMoveEntry,
  useReplay,
  useSeconds,
  type ModeProps,
} from './shared';

interface Task extends CrossTask {
  level: number;
}

type Phase = 'inspect' | 'enter' | 'result';

function newTask(level: number): Task {
  return { level, ...scrambleForCross(CROSS_EDGES, LEVELS.cross[level - 1]!.optimal) };
}

const PEEK_MS = 3000;

/** Cross Challenge: inspect, plan the whole cross, then enter it with the cube hidden. */
export function CrossChallenge({ level, settings, onResult }: ModeProps) {
  const { t } = useLanguage();
  const seconds = useSeconds();
  const size = useCubieSize();
  const [task, setTask] = useState(() => newTask(level));
  const [phase, setPhase] = useState<Phase>('inspect');
  const [inspectStartedAt, setInspectStartedAt] = useState(() => Date.now());
  const [inspectionMs, setInspectionMs] = useState(0);
  const [hint, setHint] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const spec = LEVELS.cross[task.level - 1]!;
  const limitMs = effectiveTime(settings.inspection, spec.inspectionMs);
  const entry = useMoveEntry(task.perm, false);
  const { replay, stop, playing } = useReplay(entry.cube);

  const beginEntering = useCallback(() => {
    setInspectionMs(Date.now() - inspectStartedAt);
    setPhase('enter');
  }, [inspectStartedAt]);
  const clock = useClock(phase === 'inspect', inspectStartedAt, limitMs, beginEntering);

  const end = useMemo(() => applyMoves(task.perm, entry.tokens), [task.perm, entry.tokens]);
  const solvedCount = countSolved(end, CROSS_EDGES);

  const submit = () => {
    if (phase !== 'enter') return;
    setOutcome(
      onResult(
        {
          mode: 'cross',
          level: task.level,
          accuracy: solvedCount / CROSS_EDGES.length,
          timeMs: inspectionMs,
          moves: entry.tokens.length,
          optimal: task.optimal.length,
          hint,
          at: Date.now(),
        },
        limitMs,
      ),
    );
    setPhase('result');
    entry.cube.reset(end);
  };

  const start = (next: Task) => {
    stop();
    setTask(next);
    setPhase('inspect');
    setInspectStartedAt(Date.now());
    setInspectionMs(0);
    setHint(false);
    setPeeking(false);
    setOutcome(null);
    entry.reset(next.perm);
  };
  const next = () => start(newTask(level));
  const retry = () => start(task);

  const peekTimer = useRef(0);
  const peek = () => {
    setHint(true);
    setPeeking(true);
    clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeeking(false), PEEK_MS);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);

  const doMove = (move: Move) => {
    if (phase !== 'enter') return;
    entry.add(move);
  };

  useKeys((e) => {
    if (e.key === 'Enter' || (e.key === ' ' && phase === 'inspect')) {
      if (phase === 'inspect') beginEntering();
      else if (phase === 'enter') submit();
      else next();
      return true;
    }
    if (phase !== 'enter') return false;
    if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') {
      entry.undo();
      return true;
    }
    if (e.key.toLowerCase() === 'h' && !hint) {
      peek();
      return true;
    }
    const move = moveForKey(e);
    if (move !== null) {
      doMove(move);
      return true;
    }
    return false;
  });

  const solved = solvedCount === CROSS_EDGES.length;

  return (
    <TaskLayout>
      <PracticeCube perm={entry.cube.perm} turn={entry.cube.turn} size={size} hidden={phase === 'enter' && !peeking} />
      <Panel>
        {phase === 'inspect' && (
          <>
            <p className="text-sm text-neutral-300">{t.dry.cross.inspect}</p>
            <ClockLine elapsed={clock.elapsed} remaining={clock.remaining} label={t.dry.inspection} />
            <button type="button" onClick={beginEntering} className={PRIMARY_BUTTON}>
              {t.dry.cross.planned} ↵
            </button>
          </>
        )}
        {phase === 'enter' && (
          <>
            <p className="text-sm text-neutral-300">{t.dry.cross.enter}</p>
            <MoveList moves={entry.tokens} />
            <MovePad onMove={doMove} onUndo={entry.undo} canUndo={entry.tokens.length > 0} disabled={peeking} />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={submit} className={PRIMARY_BUTTON}>
                {t.dry.cross.submit} ↵
              </button>
              <HintButton label={t.dry.cross.peek} onClick={peek} used={hint} />
            </div>
          </>
        )}
        {phase === 'result' && outcome !== null && (
          <>
            <ResultBanner
              outcome={outcome}
              title={solved ? t.dry.cross.solved : t.dry.cross.notSolved(solvedCount)}
              lines={[t.dry.cross.summary(entry.tokens.length, task.optimal.length), t.dry.cross.inspectionTook(seconds(inspectionMs))]}
            />
            <div className="space-y-2">
              <div>
                <div className="text-xs text-neutral-500">{t.dry.cross.yourMoves}</div>
                <p className="mt-1 font-mono text-lg text-neutral-100">{entry.tokens.length === 0 ? <span className="text-neutral-600">{t.dry.cross.noMoves}</span> : entry.tokens.join(' ')}</p>
              </div>
              <div>
                <div className="text-xs text-neutral-500">{t.dry.cross.optimalSolution}</div>
                <p className="mt-1 font-mono text-lg text-neutral-100">{task.optimal.join(' ')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {entry.tokens.length > 0 && (
                <button type="button" disabled={playing} onClick={() => replay(task.perm, entry.tokens)} className={SECONDARY_BUTTON}>
                  ▶ {t.dry.cross.replayMine}
                </button>
              )}
              <button type="button" disabled={playing} onClick={() => replay(task.perm, task.optimal)} className={SECONDARY_BUTTON}>
                ▶ {t.dry.cross.replayOptimal}
              </button>
            </div>
            <NextButtons onNext={next} onRetry={retry} />
          </>
        )}
        <p className="text-xs text-neutral-600">{t.dry.modes.cross.help}</p>
        <KeysHint />
      </Panel>
    </TaskLayout>
  );
}
