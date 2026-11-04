import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCubeTurns } from '../../hooks/useCubeTurns';
import { useLanguage } from '../../i18n/LanguageContext';
import { CROSS_EDGES, EDGE_STICKERS, applyMoves, locateEdge, permOf, type CrossEdge } from '../../lib/cross';
import { LEVELS, effectiveTime, type Outcome } from '../../lib/dryPractice';
import { identityPerm, type Perm } from '../../lib/f2l';
import { generateScramble } from '../../lib/scramble';
import {
  ClockLine,
  EdgeChip,
  HintButton,
  KeysHint,
  MARK,
  NextButtons,
  PRIMARY_BUTTON,
  Panel,
  PracticeCube,
  ResultBanner,
  SECONDARY_BUTTON,
  TaskLayout,
  pickEdges,
  pieceMarksFor,
  useClock,
  useCubieSize,
  useEdgeName,
  useKeys,
  usePositionName,
  useReplay,
  type ModeProps,
} from './shared';

interface Task {
  level: number;
  start: Perm;
  edges: CrossEdge[];
  moves: string[];
  end: Perm;
}

type Phase = 'memorize' | 'answer' | 'result';

function newTask(level: number): Task {
  const spec = LEVELS.tracker[level - 1]!;
  const start = spec.fromSolved ? identityPerm() : permOf(generateScramble());
  const moves = generateScramble(spec.moves).split(' ');
  return { level, start, edges: pickEdges(CROSS_EDGES, spec.edges), moves, end: applyMoves(start, moves) };
}

const PEEK_MS = 3000;

/** Edge Tracker: memorize marked edges, then say where they are after moves made on a hidden cube. */
export function EdgeTracker({ level, settings, onResult }: ModeProps) {
  const { t } = useLanguage();
  const edgeName = useEdgeName();
  const positionName = usePositionName();
  const size = useCubieSize();
  const [task, setTask] = useState(() => newTask(level));
  const [phase, setPhase] = useState<Phase>('memorize');
  const [phaseStartedAt, setPhaseStartedAt] = useState(() => Date.now());
  const [answers, setAnswers] = useState<number[]>([]);
  const [hint, setHint] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const spec = LEVELS.tracker[task.level - 1]!;
  const memorizeMs = effectiveTime(settings.memorize, spec.memorizeMs);

  const cube = useCubeTurns(task.start);
  const { replay, stop, playing } = useReplay(cube);

  const beginAnswering = useCallback(() => {
    setPhase('answer');
    setPhaseStartedAt(Date.now());
    cube.reset(task.end);
  }, [cube, task.end]);
  const clock = useClock(phase === 'memorize', phaseStartedAt, memorizeMs, beginAnswering);

  const start = (next: Task) => {
    stop();
    setTask(next);
    setPhase('memorize');
    setPhaseStartedAt(Date.now());
    setAnswers([]);
    setHint(false);
    setPeeking(false);
    setOutcome(null);
    cube.reset(next.start);
  };
  const next = () => start(newTask(level));
  const retry = () => start(task);

  const locations = useMemo(() => task.edges.map((edge) => locateEdge(task.end, edge)), [task]);

  const answer = useCallback(
    (index: number) => {
      if (phase !== 'answer' || peeking) return;
      const all = [...answers, index];
      setAnswers(all);
      if (all.length < task.edges.length) return;
      const right = all.filter((a, i) => a === locations[i]!.whiteAt).length;
      setOutcome(
        onResult({
          mode: 'tracker',
          level: task.level,
          accuracy: right / task.edges.length,
          timeMs: Date.now() - phaseStartedAt,
          hint,
          at: Date.now(),
        }),
      );
      setPhase('result');
    },
    [phase, peeking, answers, task, locations, onResult, phaseStartedAt, hint],
  );

  const peekTimer = useRef(0);
  const peek = () => {
    setHint(true);
    setPeeking(true);
    cube.reset(task.start);
    clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => {
      setPeeking(false);
      cube.reset(task.end);
    }, PEEK_MS);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);

  useKeys((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (phase === 'memorize') beginAnswering();
      else if (phase === 'result') next();
      else return false;
      return true;
    }
    if (e.key.toLowerCase() === 'h' && phase === 'answer' && !hint) {
      peek();
      return true;
    }
    return false;
  });

  const trackMarks = useMemo(() => pieceMarksFor(task.edges, MARK.track), [task.edges]);
  const resultMarks = useMemo(() => {
    if (phase !== 'result' || playing) return undefined;
    const m = new Map<number, string>();
    locations.forEach((location, i) => {
      const mine = answers[i]!;
      if (mine !== location.whiteAt) m.set(mine, MARK.wrong);
      m.set(location.whiteAt, MARK.right);
    });
    return m;
  }, [phase, playing, locations, answers]);

  const showStart = phase === 'memorize' || peeking;
  const hidden = phase === 'answer' && !peeking;
  const right = phase === 'result' ? answers.filter((a, i) => a === locations[i]!.whiteAt).length : 0;
  const current = task.edges[answers.length];

  return (
    <TaskLayout>
      <PracticeCube
        perm={cube.perm}
        turn={cube.turn}
        size={size}
        hidden={hidden}
        pieceMarks={showStart || playing ? trackMarks : undefined}
        marks={resultMarks}
        clickable={EDGE_STICKERS}
        onStickerClick={phase === 'answer' && !peeking ? answer : undefined}
      />
      <Panel>
        {phase === 'memorize' && (
          <>
            <p className="text-sm text-neutral-300">{t.dry.tracker.memorize}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {task.edges.map((edge) => (
                <EdgeChip key={edge} edge={edge} className="text-base font-medium text-neutral-100" />
              ))}
            </div>
            <ClockLine elapsed={clock.elapsed} remaining={clock.remaining} />
            <button type="button" onClick={beginAnswering} className={PRIMARY_BUTTON}>
              {t.dry.tracker.ready} ↵
            </button>
          </>
        )}
        {phase === 'answer' && (
          <>
            <div>
              <div className="text-xs text-neutral-500">{t.dry.tracker.moved}</div>
              <p className="mt-1 font-mono text-2xl leading-relaxed text-neutral-100">{task.moves.join(' ')}</p>
            </div>
            {current !== undefined && (
              <div>
                {task.edges.length > 1 && (
                  <div className="text-xs text-neutral-500">{t.dry.tracker.progress(answers.length + 1, task.edges.length)}</div>
                )}
                <p className="mt-1 text-sm text-neutral-300">{t.dry.tracker.question(edgeName(current))}</p>
                <EdgeChip edge={current} className="mt-2 text-lg font-medium text-neutral-100" />
              </div>
            )}
            <HintButton label={t.dry.tracker.hint} onClick={peek} used={hint} />
          </>
        )}
        {phase === 'result' && outcome !== null && (
          <>
            <ResultBanner
              outcome={outcome}
              title={
                right === task.edges.length
                  ? t.dry.tracker.allCorrect
                  : right === 0
                    ? t.dry.tracker.noneCorrect
                    : t.dry.tracker.someCorrect(right, task.edges.length)
              }
              lines={[]}
            >
              <ul className="w-full space-y-1 text-sm">
                {task.edges.map((edge, i) => {
                  const ok = answers[i] === locations[i]!.whiteAt;
                  return (
                    <li key={edge} className="flex flex-wrap items-center gap-x-2">
                      <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
                      <EdgeChip edge={edge} />
                      <span className="opacity-80">{positionName(task.end, edge)}</span>
                    </li>
                  );
                })}
              </ul>
            </ResultBanner>
            <div className="text-xs text-neutral-500">
              <span style={{ color: MARK.right }}>■</span> {t.dry.tracker.legendActual} · <span style={{ color: MARK.wrong }}>■</span>{' '}
              {t.dry.tracker.legendWrong}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={playing}
                onClick={() => replay(task.start, task.moves)}
                className={SECONDARY_BUTTON}
              >
                ▶ {t.dry.tracker.replay}
              </button>
            </div>
            <NextButtons onNext={next} onRetry={retry} />
          </>
        )}
        <p className="text-xs text-neutral-600">{t.dry.modes.tracker.help}</p>
        <KeysHint />
      </Panel>
    </TaskLayout>
  );
}
