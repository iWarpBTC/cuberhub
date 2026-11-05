import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useCubeTurns } from '../../hooks/useCubeTurns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { Messages } from '../../i18n/messages';
import { CUBE_COLORS } from '../../lib/colors';
import { CROSS_EDGES, applyMoves, crossEdgeSide, edgeStickers, type CrossEdge } from '../../lib/cross';
import {
  HOLD_ROTATION,
  analyzeCross,
  holdFront,
  holdMove,
  holdSpot,
  isGoodClass,
  type CrossAnalysis,
  type EdgeSpot,
  type Hold,
  type MoveNote,
  type Pattern,
  type Reason,
  type SolutionMetrics,
  type TrainerSolution,
} from '../../lib/crossTrainer';
import type { Perm } from '../../lib/f2l';
import { formatMove, inverseMove, parseFaceMove } from '../../lib/f2lTrainer';
import { generateScramble, parseCustomScramble } from '../../lib/scramble';
import { EdgeChip, MARK, PRIMARY_BUTTON, PracticeCube, SECONDARY_BUTTON, SMALL_BUTTON, useCubieSize, useKeys } from './shared';

type Stage = 'plan' | 'read' | 'solutions';
type SideFace = 'F' | 'R' | 'B' | 'L';

/** Which of the analysed solutions is on the cube. */
type Choice = 'recommended' | 'shortest' | number;

const STEP_MS = 750;

/** Everything but the white edges and the centres, for the "cross edges only" view. */
const NOT_CROSS: ReadonlySet<number> = (() => {
  const keep = new Set([...edgeStickers(CROSS_EDGES), 4, 13, 22, 31, 40, 49]);
  return new Set(Array.from({ length: 54 }, (_, i) => i).filter((i) => !keep.has(i)));
})();

const METRIC_ROWS: ReadonlyArray<Exclude<keyof SolutionMetrics, 'hold' | 'doubles' | 'longSetup'>> = [
  'moves',
  'back',
  'front',
  'half',
  'tracking',
  'detours',
  'cost',
];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function inverseOf(move: string): string {
  return formatMove(inverseMove(parseFaceMove(move)!));
}

/**
 * The pieces of text the notes are put together from, in the current
 * language and for the way the cube is held: the analysis speaks of moves
 * and slots with green in front, `move` and `where` say them as the hands
 * see them.
 */
function useWording(hold: Hold) {
  const { t } = useLanguage();
  return useMemo(() => {
    const tt = t.dry.trainer;
    const name = (edge: CrossEdge) => t.dry.edgeName[crossEdgeSide(edge) as SideFace];
    const names = (edges: readonly CrossEdge[]) => tt.list(edges.map(name));
    const move = (token: string) => holdMove(token, hold);
    const where = (spot: EdgeSpot) => {
      const seen = holdSpot(spot, hold);
      return t.dry.position(seen.slot, t.f2l.toward[seen.whiteFace]);
    };
    return { t, tt, name, names, move, where };
  }, [t, hold]);
}

type Wording = ReturnType<typeof useWording>;

function describeNote(note: MoveNote, w: Wording): string {
  const n = w.tt.note;
  switch (note.kind) {
    case 'insert': {
      const relative = w.names(note.relativeTo);
      if (note.edges.length > 1) return n.insertMany(w.names(note.edges), note.edges.length, relative);
      const edge = w.name(note.edges[0]!);
      const side = w.tt.onSide[note.sides[0] as SideFace];
      if (note.relativeTo.length > 0) return n.insert(edge, side, relative);
      return note.home ? n.insertFirstHome(edge) : n.insertFirst(edge, side);
    }
    case 'ready':
      if (note.by === 'bottom') return n.readyBottom(w.name(note.edge), w.tt.toSide[note.side as SideFace], w.move(note.drop));
      return note.oriented ? n.readyOriented(w.name(note.edge), w.move(note.drop)) : n.readyTurn(w.name(note.edge), w.move(note.drop));
    case 'orient':
      return n.orient(w.name(note.edge), w.where(note.spot));
    case 'takeOut':
      return n.takeOut(w.name(note.edge), w.where(note.spot));
    case 'lift':
      return n.lift(w.name(note.edge), note.returns + 1, w.move(note.returnMove));
    case 'park':
      return n.park(w.name(note.edge), w.where(note.spot));
    case 'move':
      return note.next === null
        ? n.move(w.name(note.edge), w.where(note.spot))
        : n.moveFor(w.name(note.edge), w.where(note.spot), note.next.index + 1, w.move(note.next.move));
    case 'carry':
      return n.carry(w.names(note.edges), note.edges.length);
    case 'align':
      return n.align;
  }
}

function describePattern(pattern: Pattern, w: Wording): string {
  const p = w.tt.pattern;
  switch (pattern.kind) {
    case 'kept':
      return p.kept(w.names(pattern.edges), pattern.edges.length);
    case 'double':
      return p.double(w.move(pattern.move), pattern.index + 1, w.names(pattern.edges));
    case 'twoBirds':
      return pattern.placed.length > 0
        ? p.twoBirdsPlaced(w.move(pattern.move), pattern.index + 1, w.names(pattern.placed), w.names(pattern.helped), pattern.placed.length)
        : p.twoBirdsSetup(w.move(pattern.move), pattern.index + 1, w.names(pattern.helped));
    case 'setup':
      return p.setup(w.move(pattern.move), pattern.index + 1, w.name(pattern.edge));
    case 'relative':
      return p.relative(w.tt.list(pattern.turns.map(w.move)), pattern.turns.length);
    case 'lift':
      return p.lift(w.move(pattern.move), pattern.index + 1, w.name(pattern.edge));
  }
}

function describeReason(reason: Reason, tt: Messages['dry']['trainer']): string {
  return tt.reason[reason.kind](reason.shortest, reason.recommended);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Legend({ items }: { items: ReadonlyArray<[color: string, label: string]> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2" style={{ borderColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** What inspection shows: each white edge, good or bad, and which already belong together. */
function ReadList({ analysis, hold }: { analysis: CrossAnalysis; hold: Hold }) {
  const w = useWording(hold);
  const { read } = analysis;
  const placed = read.groups.flat();
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">{w.tt.readSummary(read.good, read.bad, placed.length)}</p>
      <ul className="space-y-1.5">
        {read.edges.map(({ edge, spot, cls, drop }) => {
          const where = capitalize(w.where(spot));
          const text =
            cls === 'placed'
              ? w.tt.read.placed(where)
              : isGoodClass(cls)
                ? w.tt.read.good(where, w.move(drop!))
                : cls === 'topSide'
                  ? w.tt.read.topSide(where)
                  : w.tt.read.bottomSide(where);
          return (
            <li key={edge} className="text-sm text-neutral-300">
              <EdgeChip edge={edge} className="font-medium text-neutral-100" />
              <div className="text-neutral-400">{text}</div>
            </li>
          );
        })}
      </ul>
      {read.groups
        .filter((group) => group.length >= 2)
        .map((group) => (
          <p key={group.join()} className="text-sm text-green-300">
            {capitalize(w.tt.together(w.names(group)))}
          </p>
        ))}
      {read.groups.length >= 2 && <p className="text-sm text-yellow-200">{capitalize(w.tt.clash(w.names(placed)))}</p>}
      <Legend
        items={[
          [MARK.right, w.tt.legend.placed],
          [MARK.track, w.tt.legend.good],
          [MARK.wrong, w.tt.legend.bad],
        ]}
      />
    </div>
  );
}

/** A square in the colour that is in front in a hold. */
function FrontColour({ hold, className = 'h-2.5 w-2.5' }: { hold: Hold; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-sm ${className}`} style={{ background: CUBE_COLORS[holdFront(hold)] }} />;
}

/** How to hold the cube for a solution, and what turning it away from green wins. */
function HoldNote({ solution }: { solution: TrainerSolution }) {
  const { t } = useLanguage();
  const tt = t.dry.trainer.hold;
  const { hold, greenFront, metrics } = solution;
  const sameCounts = greenFront.back === metrics.back && greenFront.front === metrics.front;
  return (
    <div className="mt-2 flex gap-2.5 rounded-lg border border-neutral-800 p-2.5 text-sm">
      <FrontColour hold={hold} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium text-neutral-100">
          {hold === 0 ? tt.keep : tt.turn(tt.front[holdFront(hold) as SideFace], HOLD_ROTATION[hold])}
        </div>
        {hold !== 0 && (
          <div className="text-neutral-400">{sameCounts ? tt.whySides : tt.why(greenFront.back, greenFront.front, metrics.back, metrics.front)}</div>
        )}
        <div className="text-xs text-neutral-600">{tt.notation}</div>
      </div>
    </div>
  );
}

/** The shortest and the recommended solution side by side, measure by measure. */
function Comparison({ analysis }: { analysis: CrossAnalysis }) {
  const { t } = useLanguage();
  const tt = t.dry.trainer;
  const { shortest, recommended, reasons } = analysis;
  if (recommended === shortest) return <p className="text-sm text-neutral-300">{tt.sameVerdict}</p>;
  return (
    <div className="space-y-2">
      <div className="text-sm text-neutral-300">
        <p>{tt.longerVerdict(recommended.extra)}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-neutral-200">
          {reasons.length === 0 ? <li>{tt.noReasons}</li> : reasons.map((reason) => <li key={reason.kind}>{describeReason(reason, tt)}</li>)}
        </ul>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-neutral-500">
            <th className="py-1 font-normal">{tt.compare.measure}</th>
            <th className="py-1 text-right font-normal">{tt.shortest}</th>
            <th className="py-1 text-right font-normal">{tt.recommended}</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          <tr className="border-t border-neutral-800">
            <td className="py-1 font-sans text-neutral-400">{tt.compare.hold}</td>
            {[shortest, recommended].map((solution, i) => (
              <td key={i} className="py-1 text-right font-sans text-neutral-200">
                <FrontColour hold={solution.hold} /> {tt.colour[holdFront(solution.hold) as SideFace]}
              </td>
            ))}
          </tr>
          {METRIC_ROWS.map((row) => {
            const a = shortest.metrics[row];
            const b = recommended.metrics[row];
            const format = (value: number) => (row === 'cost' ? value.toFixed(1) : String(value));
            return (
              <tr key={row} className="border-t border-neutral-800">
                <td className="py-1 font-sans text-neutral-400">{tt.compare[row]}</td>
                <td className={`py-1 text-right ${a < b ? 'text-green-300' : 'text-neutral-200'}`}>{format(a)}</td>
                <td className={`py-1 text-right ${b < a ? 'text-green-300' : 'text-neutral-200'}`}>{format(b)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-neutral-600">{tt.compare.note}</p>
    </div>
  );
}

/** The solution cut into steps, every move with what it does; a click jumps the cube to just after that move. */
function StepList({ solution, pos, onJump }: { solution: TrainerSolution; pos: number; onJump: (pos: number) => void }) {
  const w = useWording(solution.hold);
  // Keeps the move just made in view while stepping with the keys or the buttons under the cube.
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pos > 0) activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pos, solution]);
  return (
    <ol className="space-y-2">
      {solution.steps.map((step, i) => {
        const current = pos > step.start && pos <= step.end;
        const done = pos >= step.end;
        return (
          <li key={step.start} className={`rounded-lg border p-2 ${current ? 'border-blue-500/60 bg-blue-500/5' : 'border-neutral-800'}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm">
              <span className={`font-mono text-xs ${done ? 'text-green-400' : 'text-neutral-500'}`}>{done ? '✓' : i + 1}</span>
              {step.kind === 'align' ? (
                <span className="font-medium text-neutral-100">{w.tt.stepAlign}</span>
              ) : (
                <>
                  {step.settles.map((edge) => (
                    <EdgeChip key={edge} edge={edge} className="font-medium text-neutral-100" />
                  ))}
                  <span className="text-neutral-500">→ {w.tt.stepInsert}</span>
                </>
              )}
            </div>
            <ul className="mt-1">
              {step.moves.map(({ index, move, notes }) => {
                const active = index === pos - 1;
                return (
                  <li key={index}>
                    <button
                      ref={active ? activeRef : undefined}
                      type="button"
                      onClick={() => onJump(index + 1)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex w-full scroll-mt-[24rem] scroll-mb-2 gap-2 rounded-md px-1 py-1 text-left hover:bg-neutral-800 sm:scroll-mt-2 ${active ? 'bg-neutral-800' : ''}`}
                    >
                      <span className={`w-8 shrink-0 font-mono text-base ${index < pos ? 'text-neutral-100' : 'text-neutral-500'}`}>{w.move(move)}</span>
                      <span className="min-w-0 space-y-1 text-sm text-neutral-300">
                        {notes.length === 0 ? (
                          <span className="block text-neutral-500">{w.tt.note.nothing}</span>
                        ) : (
                          notes.map((note, k) => (
                            <span key={k} className="block">
                              {capitalize(describeNote(note, w))}
                            </span>
                          ))
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/** The moves as a strip under the cube (grouped by step) with the playback buttons. */
function Transport({
  solution,
  pos,
  playing,
  onJump,
  onPlay,
}: {
  solution: TrainerSolution;
  pos: number;
  playing: boolean;
  onJump: (pos: number) => void;
  onPlay: () => void;
}) {
  const { t } = useLanguage();
  const tt = t.dry.trainer;
  const n = solution.moves.length;
  const button = `${SMALL_BUTTON} min-w-9 font-mono`;
  return (
    <div className="flex flex-col items-center gap-2 px-3 pb-3">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {solution.steps.map((step) => (
          <span key={step.start} className="inline-flex gap-0.5">
            {step.moves.map(({ index }) => (
              <button
                key={index}
                type="button"
                onClick={() => onJump(index + 1)}
                className={`rounded px-1 font-mono text-lg hover:bg-neutral-800 ${
                  index === pos - 1 ? 'bg-neutral-800 text-white' : index < pos ? 'text-neutral-200' : 'text-neutral-500'
                }`}
              >
                {solution.handMoves[index]}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onJump(0)} disabled={pos === 0} aria-label={tt.restart} title={tt.restart} className={button}>
          ⏮
        </button>
        <button type="button" onClick={() => onJump(pos - 1)} disabled={pos === 0} aria-label={tt.previous} title={tt.previous} className={button}>
          ◀
        </button>
        <button type="button" onClick={onPlay} className={`${PRIMARY_BUTTON} min-w-24`}>
          {playing ? `⏸ ${tt.pause}` : `▶ ${tt.play}`}
        </button>
        <button type="button" onClick={() => onJump(pos + 1)} disabled={pos === n} aria-label={tt.nextMove} title={tt.nextMove} className={button}>
          ▶
        </button>
      </div>
    </div>
  );
}

/** One scramble: inspect, read the edges, then step through the solutions. */
function Session({ scramble, onNew }: { scramble: string; onNew: () => void }) {
  const size = useCubieSize();
  const analysis = useMemo(() => analyzeCross(scramble), [scramble]);
  const [stage, setStage] = useState<Stage>('plan');
  const [choice, setChoice] = useState<Choice>('recommended');
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [crossOnly, setCrossOnly] = useState(false);
  const cube = useCubeTurns(analysis.perm);

  const solved = analysis.optimalLength === 0;
  const solution = choice === 'recommended' ? analysis.recommended : choice === 'shortest' ? analysis.shortest : analysis.alternatives[choice]!;
  const n = solution.moves.length;
  // The cube is turned to a solution's hold only once the solutions are on: before that it lies as scrambled.
  const hold: Hold = stage === 'solutions' && !solved ? solution.hold : 0;
  const w = useWording(hold);
  const { tt } = w;

  /** The position after each number of moves of the solution on the cube. */
  const positions = useMemo(() => {
    const list: Perm[] = [analysis.perm];
    for (const move of solution.moves) list.push(applyMoves(list.at(-1)!, [move]));
    return list;
  }, [analysis.perm, solution]);

  const jump = useCallback(
    (to: number) => {
      const target = Math.max(0, Math.min(n, to));
      if (target === pos) return;
      // One move either way is turned on the cube; anything further just shows the position.
      if (target === pos + 1) cube.play(solution.moves[pos]!);
      else if (target === pos - 1) cube.play(inverseOf(solution.moves[pos - 1]!));
      else cube.reset(positions[target]!);
      setPos(target);
    },
    [n, pos, cube, solution, positions],
  );

  const step = (to: number) => {
    setPlaying(false);
    jump(to);
  };

  const choose = (next: Choice) => {
    setChoice(next);
    setPlaying(false);
    setPos(0);
    cube.reset(analysis.perm);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (pos === n) {
      setPos(0);
      cube.reset(analysis.perm);
    }
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    if (pos >= n) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => jump(pos + 1), pos === 0 ? 300 : STEP_MS);
    return () => clearTimeout(id);
  }, [playing, pos, n, jump]);

  const reveal = () => setStage(stage === 'plan' ? 'read' : 'solutions');

  useKeys((e) => {
    if (e.key.toLowerCase() === 'n') {
      onNew();
      return true;
    }
    if (e.key === 'Enter' && stage !== 'solutions' && !solved) {
      reveal();
      return true;
    }
    if (stage !== 'solutions' || solved) return false;
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      step(pos + 1);
      return true;
    }
    if (e.key === 'ArrowLeft') {
      step(pos - 1);
      return true;
    }
    if (e.key === ' ') {
      togglePlay();
      return true;
    }
    return false;
  });

  // The step the move just made belongs to (the first one before any move): its edges are the ones to watch.
  const currentStep = solution.steps.find((s) => Math.max(1, pos) <= s.end);

  const pieceMarks = useMemo(() => {
    const marks = new Map<number, string>();
    const mark = (edge: CrossEdge, color: string) => {
      for (const sticker of edgeStickers([edge])) marks.set(sticker, color);
    };
    if (stage === 'read') {
      for (const { edge, cls } of analysis.read.edges) mark(edge, cls === 'placed' ? MARK.right : isGoodClass(cls) ? MARK.track : MARK.wrong);
    } else if (stage === 'solutions') {
      for (const edge of currentStep?.focus ?? []) mark(edge, MARK.track);
      CROSS_EDGES.forEach((edge, e) => {
        if (solution.settledAt[e]! <= pos) mark(edge, MARK.right);
      });
    }
    return marks;
  }, [stage, analysis, solution, currentStep, pos]);

  const chips: Array<[Choice, string, TrainerSolution]> =
    analysis.recommended === analysis.shortest
      ? [['recommended', tt.recommendedIsShortest, analysis.recommended]]
      : [
          ['recommended', tt.recommended, analysis.recommended],
          ['shortest', tt.shortest, analysis.shortest],
        ];
  analysis.alternatives.forEach((alternative, i) => chips.push([i, tt.option(i + 1), alternative]));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:flex-row sm:overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 sm:static sm:min-w-0 sm:flex-1 sm:justify-center sm:border-b-0">
        <PracticeCube
          perm={cube.perm}
          turn={cube.turn}
          size={size}
          quarterTurns={hold}
          pieceMarks={pieceMarks}
          dim={crossOnly ? NOT_CROSS : undefined}
        />
        {stage === 'solutions' && !solved && <Transport solution={solution} pos={pos} playing={playing} onJump={step} onPlay={togglePlay} />}
      </div>
      <div className="flex flex-col gap-4 p-4 sm:w-[27rem] sm:shrink-0 sm:overflow-y-auto sm:overscroll-contain sm:border-l sm:border-neutral-800">
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          <input type="checkbox" checked={crossOnly} onChange={(e) => setCrossOnly(e.target.checked)} className="accent-neutral-200" />
          {tt.focus}
        </label>

        {solved ? (
          <p className="text-sm text-neutral-300">{tt.solved}</p>
        ) : (
          <>
            {stage === 'plan' && (
              <>
                <p className="text-sm text-neutral-300">{tt.plan}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={reveal} className={PRIMARY_BUTTON}>
                    {tt.showRead} ↵
                  </button>
                  <button type="button" onClick={() => setStage('solutions')} className={SECONDARY_BUTTON}>
                    {tt.showSolutions}
                  </button>
                </div>
              </>
            )}

            {stage === 'read' && (
              <>
                <Section title={tt.readTitle}>
                  <ReadList analysis={analysis} hold={hold} />
                </Section>
                <button type="button" onClick={reveal} className={`${PRIMARY_BUTTON} self-start`}>
                  {tt.showSolutions} ↵
                </button>
              </>
            )}

            {stage === 'solutions' && (
              <>
                <details className="rounded-lg border border-neutral-800 px-3 py-2">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-neutral-500">{tt.readTitle}</summary>
                  <div className="mt-2">
                    <ReadList analysis={analysis} hold={hold} />
                  </div>
                </details>

                <Section title={tt.solutionsLabel}>
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map(([key, label, option]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => choose(key)}
                        aria-pressed={choice === key}
                        className={`rounded-md border px-2.5 py-1 text-sm ${
                          choice === key
                            ? 'border-neutral-500 bg-neutral-800 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                        }`}
                      >
                        <FrontColour hold={option.hold} /> {label} <span className="font-mono text-xs text-neutral-500">· {option.moves.length}</span>
                      </button>
                    ))}
                  </div>
                  <HoldNote solution={solution} />
                  <p className="mt-2 font-mono text-lg text-neutral-100">{solution.handMoves.join(' ')}</p>
                  <p className="mt-1 text-xs text-neutral-600">{tt.counts(analysis.optimalCount, analysis.compared)}</p>
                </Section>

                <Section title={`${tt.shortest} / ${tt.recommended}`}>
                  <Comparison analysis={analysis} />
                </Section>

                {solution.patterns.length > 0 && (
                  <Section title={tt.patternsTitle}>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-300">
                      {solution.patterns.map((pattern, i) => (
                        <li key={i}>{capitalize(describePattern(pattern, w))}</li>
                      ))}
                    </ul>
                  </Section>
                )}

                <Section title={tt.stepsTitle}>
                  <StepList solution={solution} pos={pos} onJump={step} />
                  <div className="mt-2">
                    <Legend
                      items={[
                        [MARK.track, tt.legend.focus],
                        [MARK.right, tt.legend.done],
                      ]}
                    />
                  </div>
                </Section>
              </>
            )}
          </>
        )}

        <p className="text-xs text-neutral-600">{tt.help}</p>
        <p className="hidden text-xs text-neutral-600 sm:block">{tt.keys}</p>
      </div>
    </div>
  );
}

/** Cross Trainer: a scramble, its shortest and its friendliest white cross, and the reasoning behind every move. */
export function CrossTrainer() {
  const { t } = useLanguage();
  const tt = t.dry.trainer;
  const [scramble, setScramble] = useState(() => generateScramble());
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const next = useCallback(() => {
    setTyping(false);
    setScramble(generateScramble());
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseCustomScramble(draft);
    if (!parsed.ok) {
      setError(parsed.reason === 'empty' ? t.customScramble.empty : t.customScramble.invalid(parsed.token));
      return;
    }
    setScramble(parsed.scramble);
    setTyping(false);
    setDraft('');
    setError(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800 px-3 py-2">
        {typing ? (
          <form onSubmit={submit} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder={tt.ownPlaceholder}
              aria-label={tt.ownScramble}
              aria-invalid={error !== null}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
            <button type="submit" className={PRIMARY_BUTTON}>
              {tt.use}
            </button>
            <button type="button" onClick={() => setTyping(false)} className={SECONDARY_BUTTON}>
              {tt.cancel}
            </button>
            {error !== null && (
              <p role="alert" className="w-full text-xs text-red-400">
                {error}
              </p>
            )}
          </form>
        ) : (
          <>
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">{tt.scramble}</div>
              <div className="font-mono text-sm text-neutral-100">{scramble}</div>
              <div className="mt-0.5 text-xs text-neutral-500">{tt.scrambleHint}</div>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={next} className={SMALL_BUTTON}>
                {tt.newScramble} <span className="hidden text-xs text-neutral-500 sm:inline">(N)</span>
              </button>
              <button type="button" onClick={() => setTyping(true)} className={SMALL_BUTTON}>
                {tt.ownScramble}
              </button>
            </div>
          </>
        )}
      </div>
      <Session key={scramble} scramble={scramble} onNew={next} />
    </>
  );
}
