import { useMemo, type ReactNode } from 'react';
import type { TimerState } from '../hooks/useTimer';
import { useLanguage } from '../i18n/LanguageContext';
import { scrambleName, setName } from '../i18n/names';
import { formatAverage, formatResult } from '../lib/format';
import { createScramble } from '../lib/scramble';
import { averageLabel, computeSetStats } from '../lib/stats';
import {
  addSetAction,
  useActiveScramble,
  useDispatch,
  useSetOf,
  useSolvesFor,
  useSolvesPerScramble,
} from '../store/StoreContext';
import { CubeNet } from './CubeNet';
import { SolveHistory } from './SolveHistory';
import { StatsPanel } from './StatsPanel';
import { TimerDisplay } from './TimerDisplay';

const NAV_BUTTON =
  'rounded-md border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

/** Where the active scramble sits in its set, with the round in progress. */
function SetBar({ scrambleId }: { scrambleId: string }) {
  const { t } = useLanguage();
  const dispatch = useDispatch();
  const set = useSetOf(scrambleId);
  const solvesPerScramble = useSolvesPerScramble(set);
  const stats = useMemo(() => computeSetStats(solvesPerScramble), [solvesPerScramble]);
  if (set === null) return null;

  const index = set.scrambleIds.indexOf(scrambleId);
  const prev = set.scrambleIds[index - 1];
  const next = set.scrambleIds[index + 1];
  const label = averageLabel(set.scrambleIds.length);
  const select = (id: string) => dispatch({ type: 'SELECT_SCRAMBLE', id });

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SELECT_SET', id: set.id })}
          title={t.panel.showSet}
          className="truncate font-medium text-blue-400 hover:underline"
        >
          {setName(set, t)}
        </button>
        <span className="truncate">· {t.panel.inSet(index + 1, set.scrambleIds.length)}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          <button
            type="button"
            disabled={prev === undefined}
            onClick={() => prev !== undefined && select(prev)}
            aria-label={t.panel.previousScramble}
            title={`${t.panel.previousScramble} (←)`}
            className={NAV_BUTTON}
          >
            ←
          </button>
          <button
            type="button"
            disabled={next === undefined}
            onClick={() => next !== undefined && select(next)}
            aria-label={t.panel.nextScramble}
            title={`${t.panel.nextScramble} (→)`}
            className={NAV_BUTTON}
          >
            →
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-neutral-500">{t.panel.round(stats.currentRound)}</span>
        {set.scrambleIds.map((id, i) => {
          const attempt = solvesPerScramble[i]?.[stats.currentRound - 1];
          return (
            <button
              key={id}
              type="button"
              onClick={() => select(id)}
              aria-current={id === scrambleId ? 'true' : undefined}
              className={`rounded border px-2 py-0.5 font-mono text-xs ${
                id === scrambleId
                  ? 'border-blue-500 bg-neutral-800 text-neutral-100'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
              }`}
            >
              <span className="mr-1 text-neutral-500">{i + 1}</span>
              {attempt === undefined ? '—' : formatResult(attempt)}
            </button>
          );
        })}
        {stats.lastAverage !== null && (
          <span className="ml-auto text-xs text-neutral-500">
            {label} {t.panel.lastRound}:{' '}
            <span className="font-mono text-neutral-300">{formatAverage(stats.lastAverage)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The main panel for a scramble: the scramble, its timer and its solves.
 * `lead`, when given, is the panel's first line and stands in for the
 * scramble's name (on a phone it holds the list controls, named after the scramble).
 */
export function ScramblePanel({
  timer,
  inspection,
  onInspectionChange,
  lead,
}: {
  timer: TimerState;
  inspection: boolean;
  onInspectionChange: (on: boolean) => void;
  lead?: ReactNode;
}) {
  const { t } = useLanguage();
  const scramble = useActiveScramble();
  const solves = useSolvesFor(scramble?.id ?? null);
  const dispatch = useDispatch();

  if (scramble === null) {
    return (
      <div className="flex h-full flex-col p-4">
        {lead}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-neutral-500">{t.panel.noneSelected}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'ADD_SCRAMBLE', scramble: createScramble() })}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              {t.list.newScramble}
            </button>
            <button
              type="button"
              onClick={() => dispatch(addSetAction(5))}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              {t.list.newSetTitle(5, averageLabel(5))}
            </button>
          </div>
          <p className="hidden text-xs text-neutral-600 md:block">
            {t.panel.shortcut} <kbd className="rounded border border-neutral-700 px-1">Ctrl+N</kbd> {t.panel.newScrambleShortcut},{' '}
            <kbd className="rounded border border-neutral-700 px-1">Ctrl+G</kbd> {t.panel.newSetShortcut}
          </p>
        </div>
      </div>
    );
  }

  const hideDetails = timer.phase === 'running' || timer.phase === 'ready';

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:space-y-6 sm:p-6">
      <header>
        {lead !== undefined && <div className="mb-2">{lead}</div>}
        <SetBar scrambleId={scramble.id} />
        {lead === undefined && <div className="text-xs uppercase tracking-wide text-neutral-500">{scrambleName(scramble, t)}</div>}
        <p className="mt-2 font-mono text-lg leading-relaxed tracking-wide text-neutral-100 sm:text-2xl">
          {scramble.scramble}
        </p>
      </header>

      <TimerDisplay
        phase={timer.phase}
        displayMs={timer.displayMs}
        inspectionMs={timer.inspectionMs}
        inspection={inspection}
        padHandlers={timer.padHandlers}
        onCancelInspection={timer.cancelInspection}
      />

      <div className={hideDetails ? 'invisible' : undefined}>
        <label className="mb-4 flex cursor-pointer select-none flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={inspection}
            onChange={(e) => onInspectionChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-blue-500"
          />
          <span>{t.inspection.label}</span>
          <span className="text-neutral-600">{t.inspection.hint}</span>
        </label>
        <div className="flex justify-center">
          <CubeNet scramble={scramble.scramble} />
        </div>

        <div className="mt-6 space-y-6">
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{t.panel.statistics}</h2>
            <StatsPanel solves={solves} />
          </section>

          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{t.panel.notes}</h2>
            <textarea
              value={scramble.notes ?? ''}
              onChange={(e) =>
                dispatch({ type: 'UPDATE_SCRAMBLE', id: scramble.id, patch: { notes: e.target.value } })
              }
              placeholder={t.panel.notesPlaceholder}
              rows={2}
              className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-base text-neutral-300 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none sm:text-sm"
            />
          </section>

          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{t.panel.history}</h2>
            <SolveHistory solves={solves} />
          </section>
        </div>
      </div>
    </div>
  );
}
