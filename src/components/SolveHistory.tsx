import type { Penalty, Solve } from '../types';
import { useDispatch, useStore } from '../store/StoreContext';
import { formatDateTime, formatResult } from '../lib/format';
import { isDnf } from '../lib/stats';
import { useLanguage } from '../i18n/LanguageContext';

const PENALTY_OPTIONS: Array<{ value: Penalty; label: string }> = [
  { value: 'none', label: 'OK' },
  { value: 'plus2', label: '+2' },
  { value: 'dnf', label: 'DNF' },
];

function PenaltyToggle({ value, onChange }: { value: Penalty; onChange: (penalty: Penalty) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-neutral-700">
      {PENALTY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-2 py-0.5 text-xs pointer-coarse:py-1.5 ${
            value === option.value
              ? 'bg-neutral-200 font-medium text-neutral-900'
              : 'text-neutral-400 hover:bg-neutral-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Inspection and solve penalties are separate so that they stack the way
 * WCA penalties do: +2 for a late start plus +2 for a one-move misalignment
 * gives +4; a DNF in either row makes the solve a DNF. A solve timed
 * without inspection has no inspection row.
 */
function PenaltyPicker({ solve }: { solve: Solve }) {
  const { t } = useLanguage();
  const dispatch = useDispatch();
  const update = (patch: Partial<Pick<Solve, 'penalty' | 'inspectionPenalty'>>) =>
    dispatch({ type: 'UPDATE_SOLVE', id: solve.id, patch });
  if (solve.inspectionPenalty === undefined) {
    return <PenaltyToggle value={solve.penalty} onChange={(penalty) => update({ penalty })} />;
  }
  return (
    <div
      className="grid w-fit grid-cols-[auto_auto] items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wide text-neutral-500"
      onClick={(e) => e.stopPropagation()}
    >
      <span>{t.history.inspectionPenalty}</span>
      <PenaltyToggle value={solve.inspectionPenalty} onChange={(inspectionPenalty) => update({ inspectionPenalty })} />
      <span>{t.history.solvePenalty}</span>
      <PenaltyToggle value={solve.penalty} onChange={(penalty) => update({ penalty })} />
    </div>
  );
}

function SolveRow({ solve, index, selected }: { solve: Solve; index: number; selected: boolean }) {
  const { t } = useLanguage();
  const dispatch = useDispatch();

  return (
    <tr
      onClick={() => dispatch({ type: 'SELECT_SOLVE', id: solve.id })}
      className={`cursor-pointer border-t border-neutral-800 ${
        selected ? 'bg-neutral-800/70' : 'hover:bg-neutral-900'
      }`}
    >
      <td className="px-2 py-1.5 text-xs text-neutral-500 sm:px-3">{index}</td>
      <td
        className={`px-2 py-1.5 font-mono text-sm sm:px-3 ${
          isDnf(solve) ? 'text-red-400' : 'text-neutral-100'
        }`}
      >
        {formatResult(solve)}
        <div className="whitespace-nowrap font-sans text-[10px] text-neutral-500 sm:hidden">{formatDateTime(solve.createdAt)}</div>
      </td>
      <td className="px-2 py-1.5 sm:px-3">
        <PenaltyPicker solve={solve} />
      </td>
      <td className="px-2 py-1.5 sm:px-3">
        <input
          type="text"
          value={solve.notes ?? ''}
          placeholder={t.history.notesPlaceholder}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_SOLVE', id: solve.id, patch: { notes: e.target.value } })
          }
          className="w-full min-w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-base text-neutral-300 placeholder:text-neutral-600 hover:border-neutral-700 focus:border-neutral-600 focus:outline-none sm:text-xs"
        />
      </td>
      <td className="hidden whitespace-nowrap px-2 py-1.5 text-xs text-neutral-500 sm:table-cell sm:px-3">
        {formatDateTime(solve.createdAt)}
      </td>
      <td className="px-2 py-1.5 text-right sm:px-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'DELETE_SOLVE', id: solve.id });
          }}
          aria-label={t.history.delete}
          className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

/** `solves` in chronological order; rendered newest first. */
export function SolveHistory({ solves }: { solves: Solve[] }) {
  const { t } = useLanguage();
  const { selectedSolveId } = useStore();

  if (solves.length === 0) {
    return <p className="py-4 text-sm text-neutral-500">{t.history.empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-800">
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-2 py-2 font-medium sm:px-3">#</th>
            <th className="px-2 py-2 font-medium sm:px-3">{t.history.time}</th>
            <th className="px-2 py-2 font-medium sm:px-3">{t.history.penalty}</th>
            <th className="px-2 py-2 font-medium sm:px-3">{t.history.notes}</th>
            <th className="hidden px-2 py-2 font-medium sm:table-cell sm:px-3">{t.history.date}</th>
            <th className="px-2 py-2 sm:px-3" />
          </tr>
        </thead>
        <tbody>
          {[...solves].reverse().map((solve, i) => (
            <SolveRow
              key={solve.id}
              solve={solve}
              index={solves.length - i}
              selected={solve.id === selectedSolveId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
