import { useCallback, useMemo, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { CROSS_EDGES, EDGE_STICKERS, edgeStickers, locateEdge, permOf, type CrossEdge } from '../../lib/cross';
import { LEVELS, type Outcome } from '../../lib/dryPractice';
import type { Perm } from '../../lib/f2l';
import { generateScramble } from '../../lib/scramble';
import {
  ClockLine,
  EdgeChip,
  HintButton,
  KeysHint,
  MARK,
  NextButtons,
  Panel,
  PracticeCube,
  ResultBanner,
  TaskLayout,
  pieceMarksFor,
  useClock,
  useCubieSize,
  useEdgeName,
  useKeys,
  usePositionName,
  type ModeProps,
} from './shared';

interface Task {
  level: number;
  perm: Perm;
  target: CrossEdge;
}

interface Answer {
  clicked: number | null;
  outcome: Outcome;
}

function newTask(level: number): Task {
  return { level, perm: permOf(generateScramble()), target: CROSS_EDGES[Math.floor(Math.random() * CROSS_EDGES.length)]! };
}

/** Everything but the white edges and the centres, by solved position: grey at the first level. */
const NOT_EDGES: ReadonlySet<number> = new Set(
  Array.from({ length: 54 }, (_, i) => i).filter((i) => !edgeStickers(CROSS_EDGES).includes(i) && i % 9 !== 4),
);

/** Edge Hunter: find the named white edge on a scrambled cube and tap its white sticker. */
export function EdgeHunter({ level, onResult }: ModeProps) {
  const { t } = useLanguage();
  const edgeName = useEdgeName();
  const positionName = usePositionName();
  const size = useCubieSize();
  const [task, setTask] = useState(() => newTask(level));
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [hint, setHint] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const spec = LEVELS.hunter[task.level - 1]!;
  const location = useMemo(() => locateEdge(task.perm, task.target), [task]);

  const finish = useCallback(
    (clicked: number | null) => {
      const accuracy = clicked === location.whiteAt ? 1 : clicked === location.otherAt ? 0.5 : 0;
      const outcome = onResult(
        { mode: 'hunter', level: task.level, accuracy, timeMs: Date.now() - startedAt, hint, at: Date.now() },
        spec.limitMs,
      );
      setAnswer({ clicked, outcome });
    },
    [location, onResult, task.level, startedAt, hint, spec.limitMs],
  );
  const onExpire = useCallback(() => finish(null), [finish]);
  const clock = useClock(answer === null, startedAt, spec.limitMs, onExpire);

  const start = (next: Task) => {
    setTask(next);
    setStartedAt(Date.now());
    setHint(false);
    setAnswer(null);
  };
  const next = () => start(newTask(level));
  const retry = () => start(task);

  useKeys((e) => {
    if (e.key === 'Enter' && answer !== null) {
      next();
      return true;
    }
    if (e.key.toLowerCase() === 'h' && answer === null && !spec.edgesOnly) {
      setHint(true);
      return true;
    }
    return false;
  });

  const marks = useMemo(() => {
    if (answer === null) return undefined;
    const m = new Map<number, string>([[location.whiteAt, MARK.right]]);
    if (answer.clicked !== null && answer.clicked !== location.whiteAt) {
      m.set(answer.clicked, answer.clicked === location.otherAt ? MARK.half : MARK.wrong);
    }
    return m;
  }, [answer, location]);
  const pieceMarks = useMemo(() => (hint && answer === null ? pieceMarksFor(CROSS_EDGES, MARK.track) : undefined), [hint, answer]);

  const title =
    answer === null
      ? ''
      : answer.clicked === null
        ? t.dry.hunter.timeout
        : answer.outcome.correct
          ? t.dry.hunter.correct
          : answer.clicked === location.otherAt
            ? t.dry.hunter.wrongSticker
            : t.dry.hunter.wrong;

  return (
    <TaskLayout>
      <PracticeCube
        perm={task.perm}
        turn={null}
        size={size}
        dim={spec.edgesOnly ? NOT_EDGES : undefined}
        marks={marks}
        pieceMarks={pieceMarks}
        clickable={EDGE_STICKERS}
        onStickerClick={answer === null ? finish : undefined}
      />
      <Panel>
        <div>
          <p className="text-sm text-neutral-300">{t.dry.hunter.task(edgeName(task.target))}</p>
          <EdgeChip edge={task.target} className="mt-2 text-lg font-medium text-neutral-100" />
        </div>
        {answer === null ? (
          <>
            <ClockLine elapsed={clock.elapsed} remaining={clock.remaining} />
            {!spec.edgesOnly && <HintButton label={t.dry.hunter.hint} onClick={() => setHint(true)} used={hint} />}
          </>
        ) : (
          <>
            <ResultBanner outcome={answer.outcome} title={title} lines={[t.dry.hunter.itIs(positionName(task.perm, task.target))]} />
            <NextButtons onNext={next} onRetry={retry} />
          </>
        )}
        <p className="text-xs text-neutral-600">{t.dry.modes.hunter.help}</p>
        <KeysHint />
      </Panel>
    </TaskLayout>
  );
}
