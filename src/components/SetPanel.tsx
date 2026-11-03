import { useMemo, useState } from 'react';
import type { ScrambleSet } from '../types';
import { useDispatch, useSolvesPerScramble, useStore } from '../store/StoreContext';
import { averageLabel, computeSetStats, isDnf } from '../lib/stats';
import { formatAverage, formatResult, formatStat } from '../lib/format';
import { createScramble } from '../lib/scramble';
import { useLanguage } from '../i18n/LanguageContext';
import { scrambleName, setName } from '../i18n/names';
import { ConfirmDialog } from './ConfirmDialog';

const ACTION_BUTTON = 'rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800';

/** The main panel for a set: its rounds with their averages, its scrambles and notes. */
export function SetPanel({
  set,
  onDialogOpenChange,
}: {
  set: ScrambleSet;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const { scrambles } = useStore();
  const dispatch = useDispatch();
  const [dissolving, setDissolving] = useState(false);
  const solvesPerScramble = useSolvesPerScramble(set);
  const stats = useMemo(() => computeSetStats(solvesPerScramble), [solvesPerScramble]);
  const members = useMemo(
    () => set.scrambleIds.map((id) => scrambles.find((s) => s.id === id)).filter((s) => s !== undefined),
    [set, scrambles],
  );
  const label = averageLabel(set.scrambleIds.length);
  const bestRoundIndex =
    typeof stats.bestAverage === 'number' ? (stats.rounds.find((r) => r.average === stats.bestAverage)?.index ?? null) : null;

  const setDissolvingBoth = (open: boolean) => {
    setDissolving(open);
    onDialogOpenChange(open);
  };

  const tiles: Array<[string, string]> = [
    [t.set.scrambles, String(set.scrambleIds.length)],
    [t.set.completedRounds, String(stats.completedRounds)],
    [t.set.bestAverage(label), formatAverage(stats.bestAverage)],
    [t.set.lastAverage(label), formatAverage(stats.lastAverage)],
    [t.set.bestSingle, formatStat(stats.bestSingle)],
    [t.set.solves, String(stats.solveCount)],
  ];

  const openScramble = (id: string) => dispatch({ type: 'SELECT_SCRAMBLE', id });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-neutral-500">{t.setName(set.number)}</div>
        <h1 className="mt-1 text-xl font-semibold text-neutral-100">{setName(set, t)}</h1>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tiles.map(([heading, value]) => (
          <div key={heading} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{heading}</div>
            <div className="mt-0.5 font-mono text-sm text-neutral-100">{value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{t.set.rounds}</h2>
        <p className="mb-2 text-xs text-neutral-500">{t.set.roundsNote}</p>
        {stats.rounds.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">{t.set.noRounds}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-800">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-2 py-2 font-medium sm:px-3">{t.set.round}</th>
                  {members.map((scramble, i) => (
                    <th key={scramble.id} className="px-2 py-2 font-medium sm:px-3" title={scrambleName(scramble, t)}>
                      {i + 1}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium sm:px-3">{label}</th>
                </tr>
              </thead>
              <tbody>
                {stats.rounds.map((round) => {
                  const best = round.index === bestRoundIndex;
                  return (
                    <tr key={round.index} className="border-t border-neutral-800">
                      <td className="px-2 py-1.5 text-xs text-neutral-500 sm:px-3">
                        {round.index}
                        {best && (
                          <span className="ml-1 text-yellow-400" title={t.set.bestRound} aria-label={t.set.bestRound}>
                            ★
                          </span>
                        )}
                      </td>
                      {round.attempts.map((attempt, i) => (
                        <td key={members[i]?.id ?? i} className="px-2 py-1.5 sm:px-3">
                          <button
                            type="button"
                            onClick={() => {
                              const id = members[i]?.id;
                              if (id !== undefined) openScramble(id);
                            }}
                            className={`rounded px-1 font-mono text-sm hover:bg-neutral-800 ${
                              attempt === null
                                ? 'text-neutral-600'
                                : isDnf(attempt)
                                  ? 'text-red-400'
                                  : 'text-neutral-100'
                            }`}
                          >
                            {attempt === null ? '—' : formatResult(attempt)}
                          </button>
                        </td>
                      ))}
                      <td
                        className={`px-2 py-1.5 font-mono text-sm sm:px-3 ${
                          best ? 'text-green-400' : round.average === 'dnf' ? 'text-red-400' : 'text-neutral-100'
                        }`}
                      >
                        {formatAverage(round.average)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{t.set.scrambles}</h2>
        <ol className="divide-y divide-neutral-800 rounded-md border border-neutral-800">
          {members.map((scramble, i) => (
            <li
              key={scramble.id}
              onClick={() => openScramble(scramble.id)}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-900"
            >
              <span className="w-4 shrink-0 text-right font-mono text-xs text-neutral-500">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-neutral-200">{scrambleName(scramble, t)}</div>
                <div className="truncate font-mono text-xs text-neutral-500">{scramble.scramble}</div>
              </div>
              <span className="shrink-0 font-mono text-xs text-neutral-500">
                {t.solveCount(solvesPerScramble[i]?.length ?? 0)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openScramble(scramble.id);
                }}
                className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                {t.set.open}
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SCRAMBLE', scramble: createScramble(), setId: set.id })}
            className={ACTION_BUTTON}
          >
            <span aria-hidden="true">+</span> {t.set.addScramble}
          </button>
          <button type="button" onClick={() => setDissolvingBoth(true)} className={ACTION_BUTTON}>
            {t.set.dissolve}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{t.panel.notes}</h2>
        <textarea
          value={set.notes ?? ''}
          onChange={(e) => dispatch({ type: 'UPDATE_SET', id: set.id, patch: { notes: e.target.value } })}
          placeholder={t.set.notesPlaceholder}
          rows={2}
          className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-base text-neutral-300 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none sm:text-sm"
        />
      </section>

      {dissolving && (
        <ConfirmDialog
          title={t.set.dissolveTitle}
          message={t.set.dissolveMessage(setName(set, t))}
          confirmLabel={t.set.dissolveConfirm}
          onConfirm={() => {
            dispatch({ type: 'DELETE_SET', id: set.id, deleteScrambles: false });
            setDissolvingBoth(false);
          }}
          onCancel={() => setDissolvingBoth(false)}
        />
      )}
    </div>
  );
}
