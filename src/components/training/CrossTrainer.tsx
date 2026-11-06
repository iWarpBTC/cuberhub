import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useCubeTurns } from '../../hooks/useCubeTurns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { Messages } from '../../i18n/messages';
import { CUBE_COLORS } from '../../lib/colors';
import { CROSS_EDGES, applyMoves, crossEdgeSide, edgeStickers, type CrossEdge } from '../../lib/cross';
import {
  HOLD_ROTATION,
  analyzeCross,
  evaluateAttempt,
  holdFace,
  holdFront,
  holdMove,
  holdSpot,
  isGoodClass,
  parseSolution,
  type Attempt,
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
import { formatMove, inverseMove, parseFaceMove, pushMove, type Move } from '../../lib/f2lTrainer';
import { generateScramble, parseCustomScramble } from '../../lib/scramble';
import {
  EdgeChip,
  MARK,
  MoveList,
  MovePad,
  PRIMARY_BUTTON,
  PracticeCube,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  moveForKey,
  useCubieSize,
  useKeys,
} from './shared';

type Stage = 'plan' | 'read' | 'solutions';
type SideFace = 'F' | 'R' | 'B' | 'L';

/** Which solution is on the cube: one of the analysed ones, or the user's own. */
type Choice = 'recommended' | 'shortest' | 'mine' | number;

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

/** A move the hands make in a hold, as a move of the cube's own frame. */
function cubeMove(handMove: Move, hold: Hold): Move {
  return { face: holdFace(handMove.face, ((4 - hold) % 4) as Hold), times: handMove.times };
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
  return tt.reason[reason.kind](reason.before, reason.after);
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

/**
 * How to hold the cube for a solution, and what turning it away from green
 * wins. For the user's own solution (`chosen`) the hold is theirs, not the
 * best one found, so it is only named.
 */
function HoldNote({ solution, chosen = false }: { solution: TrainerSolution; chosen?: boolean }) {
  const { t } = useLanguage();
  const tt = t.dry.trainer.hold;
  const { hold, greenFront, metrics } = solution;
  const sameCounts = greenFront.back === metrics.back && greenFront.front === metrics.front;
  const front = tt.front[holdFront(hold) as SideFace];
  return (
    <div className="mt-2 flex gap-2.5 rounded-lg border border-neutral-800 p-2.5 text-sm">
      <FrontColour hold={hold} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium text-neutral-100">{chosen ? tt.yours(front) : hold === 0 ? tt.keep : tt.turn(front, HOLD_ROTATION[hold])}</div>
        {hold !== 0 && !chosen && (
          <div className="text-neutral-400">{sameCounts ? tt.whySides : tt.why(greenFront.back, greenFront.front, metrics.back, metrics.front)}</div>
        )}
        <div className="text-xs text-neutral-600">{tt.notation}</div>
      </div>
    </div>
  );
}

/** The four holds as colour buttons: which side colour is in front. */
function HoldPicker({ hold, onHold, label }: { hold: Hold; onHold: (hold: Hold) => void; label: string }) {
  const { t } = useLanguage();
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {([0, 1, 2, 3] as const).map((option) => {
        const name = t.dry.trainer.hold.front[holdFront(option) as SideFace];
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={hold === option}
            aria-label={name}
            title={name}
            onClick={() => onHold(option)}
            className={`h-6 w-6 rounded border-2 ${hold === option ? 'border-white' : 'border-transparent opacity-50 hover:opacity-100'}`}
            style={{ background: CUBE_COLORS[holdFront(option)] }}
          />
        );
      })}
    </div>
  );
}

/**
 * Where the user enters a solution of their own: the move buttons (or the
 * keys) turn the cube as they go, like in the F2L trainer. A whole solution
 * can also be typed or pasted, which checks it at once.
 */
function MineEntry({
  hold,
  onHold,
  moves,
  onMove,
  onUndo,
  onClear,
  onSubmit,
  onTyped,
  onCancel,
}: {
  hold: Hold;
  onHold: (hold: Hold) => void;
  /** The moves entered so far, as the hands turn them. */
  moves: readonly string[];
  onMove: (move: Move) => void;
  onUndo: () => void;
  onClear: () => void;
  onSubmit: () => void;
  /** A whole solution given as text, as the hands turn it. */
  onTyped: (moves: string[]) => void;
  onCancel?: () => void;
}) {
  const { t } = useLanguage();
  const tm = t.dry.trainer.mine;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseSolution(draft);
    if (parsed.ok) {
      setDraft('');
      onTyped(parsed.moves);
    } else {
      setError(parsed.reason === 'empty' ? t.customScramble.empty : tm.invalid(parsed.token));
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
        <span>{tm.holdLabel}</span>
        <HoldPicker hold={hold} onHold={onHold} label={tm.holdLabel} />
      </div>
      <MoveList moves={moves} />
      <MovePad onMove={onMove} onUndo={onUndo} canUndo={moves.length > 0} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onSubmit} disabled={moves.length === 0} className={PRIMARY_BUTTON}>
          {tm.evaluate}
        </button>
        <button type="button" onClick={onClear} disabled={moves.length === 0} className={SECONDARY_BUTTON}>
          {tm.clear}
        </button>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            {t.dry.trainer.cancel}
          </button>
        )}
      </div>
      <form onSubmit={submitTyped} className="space-y-1">
        <label className="block text-xs text-neutral-500" htmlFor="cross-trainer-typed">
          {tm.typeLabel}
        </label>
        <div className="flex gap-1.5">
          <input
            id="cross-trainer-typed"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder={tm.placeholder}
            aria-invalid={error !== null}
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
          <button type="submit" className={SMALL_BUTTON}>
            {tm.evaluate}
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

/** How the user's solution did: solved or not, its length, where it stands and what the recommended one does better. */
function AttemptVerdict({ attempt, analysis, onEdit, onRemove }: { attempt: Attempt; analysis: CrossAnalysis; onEdit: () => void; onRemove: () => void }) {
  const { t } = useLanguage();
  const tt = t.dry.trainer;
  const tm = tt.mine;
  const { solution, solved, own } = attempt;
  const { recommended } = analysis;
  const typed = solution.handMoves.slice(0, own);
  const extra = solution.moves.length - analysis.optimalLength;
  const wins = [
    ...(solution.moves.length > recommended.moves.length ? [tm.shorter(solution.moves.length, recommended.moves.length)] : []),
    ...attempt.reasons.map((reason) => describeReason(reason, tt)),
  ];
  return (
    <div className={`space-y-1.5 rounded-lg border p-2.5 text-sm ${solved ? 'border-neutral-800 text-neutral-300' : 'border-red-900 bg-red-950/40 text-red-100'}`}>
      <div className="flex items-start gap-2">
        <FrontColour hold={solution.hold} className="mt-1.5 h-3 w-3" />
        <p className="min-w-0 flex-1 font-mono text-base text-neutral-100">{typed.join(' ')}</p>
      </div>
      {solved ? (
        <>
          <p className="font-medium text-neutral-100">
            {tm.solved(t.dry.movesCount(solution.moves.length), analysis.optimalLength)}{' '}
            {attempt.same === 'recommended'
              ? tm.sameRecommended
              : attempt.same === 'shortest'
                ? tm.sameShortest
                : extra <= 0
                  ? tm.optimalLength
                  : tm.extra(extra)}
          </p>
          <p>{attempt.rank > analysis.compared ? tm.rankLast(analysis.compared) : tm.rank(attempt.rank, analysis.compared)}</p>
          {attempt.same !== 'recommended' &&
            (solution.metrics.cost <= recommended.metrics.cost ? (
              <p>{tm.asGood}</p>
            ) : (
              <div>
                <p>{tm.recommendedWins}</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-neutral-200">
                  {wins.length === 0 ? <li>{tt.noReasons}</li> : wins.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ))}
          {attempt.easierHold !== null && <p className="text-yellow-200">{tm.easierHold(tt.hold.front[holdFront(attempt.easierHold) as SideFace])}</p>}
        </>
      ) : (
        <>
          <p className="font-medium">{attempt.inPlace === 4 ? tm.notAligned : tm.notSolved(attempt.inPlace)}</p>
          <p>
            {tm.finish('')}
            <span className="font-mono text-neutral-100">{solution.handMoves.slice(own).join(' ')}</span>
          </p>
        </>
      )}
      <div className="flex gap-1.5 pt-1">
        <button type="button" onClick={onEdit} className={SMALL_BUTTON}>
          {tm.edit}
        </button>
        <button type="button" onClick={onRemove} className={SMALL_BUTTON}>
          {tm.remove}
        </button>
      </div>
    </div>
  );
}

/** The solutions side by side, measure by measure: the shortest, the recommended and, when it solves the cross, the user's own. */
function Comparison({ analysis, attempt }: { analysis: CrossAnalysis; attempt: Attempt | null }) {
  const { t } = useLanguage();
  const tt = t.dry.trainer;
  const { shortest, recommended, reasons } = analysis;
  const same = recommended === shortest;
  const columns: Array<[string, TrainerSolution]> = [];
  if (attempt !== null && attempt.solved) columns.push([tt.mine.chip, attempt.solution]);
  if (!same) columns.push([tt.shortest, shortest]);
  columns.push([tt.recommended, recommended]);
  return (
    <div className="space-y-2">
      {same ? (
        <p className="text-sm text-neutral-300">{tt.sameVerdict}</p>
      ) : (
        <div className="text-sm text-neutral-300">
          <p>{tt.longerVerdict(recommended.extra)}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-neutral-200">
            {reasons.length === 0 ? <li>{tt.noReasons}</li> : reasons.map((reason) => <li key={reason.kind}>{describeReason(reason, tt)}</li>)}
          </ul>
        </div>
      )}
      {columns.length >= 2 && (
        <>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-neutral-500">
                <th className="py-1 font-normal">{tt.compare.measure}</th>
                {columns.map(([label]) => (
                  <th key={label} className="py-1 text-right font-normal">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <tr className="border-t border-neutral-800">
                <td className="py-1 font-sans text-neutral-400">{tt.compare.hold}</td>
                {columns.map(([label, solution]) => (
                  <td key={label} className="py-1 text-right font-sans text-neutral-200">
                    <FrontColour hold={solution.hold} /> {tt.colour[holdFront(solution.hold) as SideFace]}
                  </td>
                ))}
              </tr>
              {METRIC_ROWS.map((row) => {
                const values = columns.map(([, solution]) => solution.metrics[row]);
                const best = Math.min(...values);
                const differ = values.some((value) => value !== best);
                return (
                  <tr key={row} className="border-t border-neutral-800">
                    <td className="py-1 font-sans text-neutral-400">{tt.compare[row]}</td>
                    {columns.map(([label], i) => (
                      <td key={label} className={`py-1 text-right ${differ && values[i] === best ? 'text-green-300' : 'text-neutral-200'}`}>
                        {row === 'cost' ? values[i]!.toFixed(1) : values[i]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-neutral-600">{tt.compare.note}</p>
        </>
      )}
    </div>
  );
}

/** The solution cut into steps, every move with what it does; a click jumps the cube to just after that move. */
function StepList({
  solution,
  pos,
  onJump,
  own = solution.moves.length,
}: {
  solution: TrainerSolution;
  pos: number;
  onJump: (pos: number) => void;
  /** How many of the moves are the user's own; the ones after are the solver's finish. */
  own?: number;
}) {
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
                      <span className={`w-8 shrink-0 font-mono text-base ${index >= own ? 'text-amber-300' : index < pos ? 'text-neutral-100' : 'text-neutral-500'}`}>
                        {w.move(move)}
                      </span>
                      <span className="min-w-0 space-y-1 text-sm text-neutral-300">
                        {index >= own && <span className="block text-xs text-amber-300">{w.tt.mine.added}</span>}
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
  own = solution.moves.length,
}: {
  solution: TrainerSolution;
  pos: number;
  playing: boolean;
  onJump: (pos: number) => void;
  onPlay: () => void;
  own?: number;
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
                  index === pos - 1 ? 'bg-neutral-800' : ''
                } ${index >= own ? 'text-amber-300' : index === pos - 1 ? 'text-white' : index < pos ? 'text-neutral-200' : 'text-neutral-500'}`}
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
  // The user's own solution. `entry` is what is being entered right now, live on the cube; `mine` is what was
  // last checked. Both are moves of the cube's own frame, so changing the hold leaves them on the cube and only
  // renames them.
  const [myHold, setMyHold] = useState<Hold>(0);
  const [entry, setEntry] = useState<Move[]>([]);
  const [mine, setMine] = useState<{ moves: string[]; hold: Hold } | null>(null);
  const [editing, setEditing] = useState(false);
  const attempt = useMemo(
    () =>
      mine === null
        ? null
        : evaluateAttempt(
            analysis,
            mine.moves.map((move) => holdMove(move, mine.hold)),
            mine.hold,
          ),
    [analysis, mine],
  );
  const cube = useCubeTurns(analysis.perm);

  const solved = analysis.optimalLength === 0;
  /** The cube is the user's to turn: until the solutions are on, and while they change a solution of their own. */
  const entering = !solved && (stage !== 'solutions' || editing);
  const solution =
    choice === 'mine' && attempt !== null
      ? attempt.solution
      : choice === 'shortest'
        ? analysis.shortest
        : typeof choice === 'number'
          ? analysis.alternatives[choice]!
          : analysis.recommended;
  const n = solution.moves.length;
  /** Of the user's solution on the cube: how many moves are their own (the rest finishes a cross left unsolved). */
  const own = choice === 'mine' && attempt !== null ? attempt.own : n;
  // While the user turns the cube it is held the way they say they hold it (green in front to begin with).
  const hold: Hold = solved ? 0 : entering ? myHold : solution.hold;
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

  const enterMove = (handMove: Move) => {
    const move = cubeMove(handMove, myHold);
    // Repeated turns of a face merge (R R is R2, R R' nothing); the cube just makes every turn as it comes.
    setEntry((current) => pushMove(current, move));
    cube.play(formatMove(move));
  };
  const undoEntry = () => {
    const last = entry.at(-1);
    if (last === undefined) return;
    setEntry(entry.slice(0, -1));
    cube.play(formatMove(inverseMove(last)));
  };
  const clearEntry = () => {
    setEntry([]);
    cube.reset(analysis.perm);
  };
  /** Checks the entered moves: they become the user's solution, next to the trainer's. */
  const submitEntry = (moves: readonly Move[] = entry) => {
    if (moves.length === 0) return;
    setMine({ moves: moves.map(formatMove), hold: myHold });
    setEntry([]);
    setEditing(false);
    setStage('solutions');
    choose('mine');
  };
  const submitTyped = (handMoves: string[]) => submitEntry(handMoves.map((token) => cubeMove(parseFaceMove(token)!, myHold)));
  /** Puts the user's solution (or nothing yet) back on the cube to be changed with the move buttons. */
  const startEditing = () => {
    const moves = mine === null ? [] : mine.moves.map((token) => parseFaceMove(token)!);
    if (mine !== null) setMyHold(mine.hold);
    setPlaying(false);
    setPos(0);
    setEntry(moves);
    setEditing(true);
    cube.reset(applyMoves(analysis.perm, moves.map(formatMove)));
  };
  const cancelEditing = () => {
    setEditing(false);
    setEntry([]);
    setPos(0);
    cube.reset(analysis.perm);
  };
  const removeMine = () => {
    setMine(null);
    if (choice === 'mine') choose('recommended');
  };

  // Moves already entered are checked on the way to the solutions.
  const showSolutions = () => {
    if (entry.length > 0) submitEntry();
    else setStage('solutions');
  };
  const reveal = () => {
    if (stage === 'plan') setStage('read');
    else showSolutions();
  };

  const mineEntry = (
    <MineEntry
      hold={myHold}
      onHold={setMyHold}
      moves={entry.map((move) => holdMove(formatMove(move), myHold))}
      onMove={enterMove}
      onUndo={undoEntry}
      onClear={clearEntry}
      onSubmit={() => submitEntry()}
      onTyped={submitTyped}
      onCancel={editing ? cancelEditing : undefined}
    />
  );

  useKeys((e) => {
    if (e.key.toLowerCase() === 'n') {
      onNew();
      return true;
    }
    if (solved) return false;
    if (entering) {
      if (e.key === 'Escape') {
        if (!editing) return false;
        cancelEditing();
        return true;
      }
      if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') {
        undoEntry();
        return true;
      }
      if (e.key === 'Enter') {
        if (editing) submitEntry();
        else reveal();
        return true;
      }
      const move = moveForKey(e);
      if (move === null) return false;
      enterMove(move);
      return true;
    }
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
    } else if (stage === 'solutions' && !entering) {
      for (const edge of currentStep?.focus ?? []) mark(edge, MARK.track);
      CROSS_EDGES.forEach((edge, e) => {
        if (solution.settledAt[e]! <= pos) mark(edge, MARK.right);
      });
    }
    return marks;
  }, [stage, entering, analysis, solution, currentStep, pos]);

  const chips: Array<[Choice, string, TrainerSolution]> =
    analysis.recommended === analysis.shortest
      ? [['recommended', tt.recommendedIsShortest, analysis.recommended]]
      : [
          ['recommended', tt.recommended, analysis.recommended],
          ['shortest', tt.shortest, analysis.shortest],
        ];
  if (attempt !== null) chips.unshift(['mine', tt.mine.chip, attempt.solution]);
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
        {stage === 'solutions' && !solved && !entering && (
          <Transport solution={solution} pos={pos} playing={playing} onJump={step} onPlay={togglePlay} own={own} />
        )}
      </div>
      <div className="flex flex-col gap-4 p-4 sm:w-[27rem] sm:shrink-0 sm:overflow-y-auto sm:overscroll-contain sm:border-l sm:border-neutral-800 xl:w-[34rem] 2xl:w-[40rem]">
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
                  <button type="button" onClick={showSolutions} className={SECONDARY_BUTTON}>
                    {tt.showSolutions}
                  </button>
                </div>
                <Section title={tt.mine.title}>
                  <p className="mb-3 text-sm text-neutral-400">{tt.mine.prompt}</p>
                  {mineEntry}
                </Section>
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
                <Section title={tt.mine.title}>
                  <p className="mb-3 text-sm text-neutral-400">{tt.mine.prompt}</p>
                  {mineEntry}
                </Section>
              </>
            )}

            {stage === 'solutions' && editing && <Section title={tt.mine.title}>{mineEntry}</Section>}

            {stage === 'solutions' && !editing && (
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
                  <HoldNote solution={solution} chosen={choice === 'mine' && attempt !== null} />
                  <p className="mt-2 font-mono text-lg text-neutral-100">{solution.handMoves.join(' ')}</p>
                  <p className="mt-1 text-xs text-neutral-600">{tt.counts(analysis.optimalCount, analysis.compared)}</p>
                </Section>

                <Section title={tt.mine.title}>
                  {attempt === null ? (
                    <>
                      <p className="mb-2 text-sm text-neutral-400">{tt.mine.prompt}</p>
                      <button type="button" onClick={startEditing} className={SECONDARY_BUTTON}>
                        {tt.mine.start}
                      </button>
                    </>
                  ) : (
                    <AttemptVerdict attempt={attempt} analysis={analysis} onEdit={startEditing} onRemove={removeMine} />
                  )}
                </Section>

                <Section title={tt.compare.title}>
                  <Comparison analysis={analysis} attempt={attempt} />
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
                  <StepList solution={solution} pos={pos} onJump={step} own={own} />
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
