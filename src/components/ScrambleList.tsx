import { useMemo, useState, type RefObject } from 'react';
import type { Scramble, ScrambleSet, Solve } from '../types';
import { addSetAction, useDispatch, useStore } from '../store/StoreContext';
import { averageLabel, computeSetStats, computeStats, type SetStats } from '../lib/stats';
import { formatAverage, formatStat } from '../lib/format';
import { createScramble } from '../lib/scramble';
import { newId } from '../lib/id';
import { useLanguage } from '../i18n/LanguageContext';
import { scrambleName, setName } from '../i18n/names';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportExport } from './ImportExport';

export type SortOrder = 'newest' | 'oldest' | 'best-average' | 'most-solves' | 'favorites-first';

const SORT_ORDERS: readonly SortOrder[] = ['newest', 'oldest', 'best-average', 'most-solves', 'favorites-first'];

/** Set sizes offered by the "new set" buttons: an Ao5 and an Ao12. */
export const SET_SIZES = [5, 12] as const;

interface ScrambleSummary {
  scramble: Scramble;
  count: number;
  best: number | null;
  mean: number | null;
}

interface ScrambleEntry {
  kind: 'scramble';
  summary: ScrambleSummary;
}

interface SetEntry {
  kind: 'set';
  set: ScrambleSet;
  /** The set's scrambles in set order (only the matching ones while searching). */
  scrambles: ScrambleSummary[];
  stats: SetStats;
}

/** A top-level row of the list: a set with its scrambles, or a scramble in no set. */
type ListEntry = ScrambleEntry | SetEntry;

function buildEntries(scrambles: Scramble[], solves: Solve[], sets: ScrambleSet[]): ListEntry[] {
  const byScramble = new Map<string, Solve[]>();
  for (const solve of solves) {
    const list = byScramble.get(solve.scrambleId);
    if (list) list.push(solve);
    else byScramble.set(solve.scrambleId, [solve]);
  }
  const summaries = new Map<string, ScrambleSummary>(
    scrambles.map((scramble) => {
      const stats = computeStats(byScramble.get(scramble.id) ?? []);
      return [scramble.id, { scramble, count: stats.count, best: stats.best, mean: stats.mean }];
    }),
  );
  const grouped = new Set<string>();
  const entries: ListEntry[] = [];
  for (const set of sets) {
    const members = set.scrambleIds
      .map((id) => summaries.get(id))
      .filter((s): s is ScrambleSummary => s !== undefined);
    for (const member of members) grouped.add(member.scramble.id);
    const stats = computeSetStats(members.map((m) => byScramble.get(m.scramble.id) ?? []));
    entries.push({ kind: 'set', set, scrambles: members, stats });
  }
  for (const scramble of scrambles) {
    if (!grouped.has(scramble.id)) entries.push({ kind: 'scramble', summary: summaries.get(scramble.id)! });
  }
  return entries;
}

function createdAt(entry: ListEntry): number {
  return entry.kind === 'set' ? entry.set.createdAt : entry.summary.scramble.createdAt;
}

function solveCount(entry: ListEntry): number {
  return entry.kind === 'set' ? entry.stats.solveCount : entry.summary.count;
}

/** The sort key for "best average": a set's best round average, a scramble's mean. */
function averageKey(entry: ListEntry): number {
  if (entry.kind === 'scramble') return entry.summary.mean ?? Infinity;
  return typeof entry.stats.bestAverage === 'number' ? entry.stats.bestAverage : Infinity;
}

function isFavorite(entry: ListEntry): boolean {
  return entry.kind === 'set' ? entry.scrambles.some((s) => s.scramble.favorite) : entry.summary.scramble.favorite;
}

function sortEntries(entries: ListEntry[], order: SortOrder): ListEntry[] {
  const sorted = [...entries];
  switch (order) {
    case 'newest':
      sorted.sort((a, b) => createdAt(b) - createdAt(a));
      break;
    case 'oldest':
      sorted.sort((a, b) => createdAt(a) - createdAt(b));
      break;
    case 'best-average':
      sorted.sort((a, b) => averageKey(a) - averageKey(b));
      break;
    case 'most-solves':
      sorted.sort((a, b) => solveCount(b) - solveCount(a));
      break;
    case 'favorites-first':
      sorted.sort((a, b) => Number(isFavorite(b)) - Number(isFavorite(a)) || createdAt(b) - createdAt(a));
      break;
  }
  return sorted;
}

const ITEM_ACTION =
  'invisible rounded px-1 text-xs text-neutral-500 group-focus-within:visible group-hover:visible pointer-coarse:visible pointer-coarse:px-2 pointer-coarse:py-1';

/** An inline rename field; commits on Enter or blur, cancels on Escape. */
function RenameInput({
  value,
  placeholder,
  onCommit,
  onCancel,
}: {
  value: string;
  placeholder: string;
  onCommit: (title: string | undefined) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const title = draft.trim();
    onCommit(title.length > 0 ? title : undefined);
  };
  return (
    <input
      type="text"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-950 px-1 py-0.5 text-base text-neutral-100 focus:outline-none sm:text-sm"
    />
  );
}

function ScrambleListItem({
  summary,
  active,
  position,
  selectable,
  selected,
  onToggleSelect,
  onDeleteRequest,
  onChosen,
}: {
  summary: ScrambleSummary;
  active: boolean;
  /** 1-based position inside its set; undefined for a scramble in no set. */
  position?: number;
  /** Grouping mode: the row toggles its checkbox instead of opening the scramble. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDeleteRequest: (scramble: Scramble) => void;
  onChosen: () => void;
}) {
  const { t } = useLanguage();
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const { scramble } = summary;
  const inSet = position !== undefined;

  return (
    <li>
      <div
        onClick={() => {
          if (selectable) {
            onToggleSelect(scramble.id);
            return;
          }
          dispatch({ type: 'SELECT_SCRAMBLE', id: scramble.id });
          onChosen();
        }}
        className={`group cursor-pointer border-l-2 py-2 pr-3 ${inSet ? 'pl-6' : 'pl-3'} ${
          active ? 'border-blue-500 bg-neutral-800/70' : 'border-transparent hover:bg-neutral-900'
        }`}
      >
        <div className="flex items-center gap-2">
          {selectable ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(scramble.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t.list.selectForGroup}
              className="h-4 w-4 accent-blue-500"
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'UPDATE_SCRAMBLE', id: scramble.id, patch: { favorite: !scramble.favorite } });
              }}
              aria-label={scramble.favorite ? t.list.removeFavorite : t.list.markFavorite}
              className={scramble.favorite ? 'text-yellow-400' : 'text-neutral-600 hover:text-neutral-400'}
            >
              {scramble.favorite ? '★' : '☆'}
            </button>
          )}
          {inSet && <span className="w-4 shrink-0 text-right font-mono text-xs text-neutral-500">{position}.</span>}

          {editing ? (
            <RenameInput
              value={scramble.title ?? ''}
              placeholder={t.scrambleName(scramble.number)}
              onCommit={(title) => {
                dispatch({ type: 'UPDATE_SCRAMBLE', id: scramble.id, patch: { title } });
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{scrambleName(scramble, t)}</span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            aria-label={t.list.rename}
            className={`${ITEM_ACTION} hover:text-neutral-200`}
          >
            ✎
          </button>
          {inSet && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'REMOVE_FROM_SET', scrambleId: scramble.id });
              }}
              aria-label={t.list.removeFromSet}
              title={t.list.removeFromSet}
              className={`${ITEM_ACTION} hover:text-neutral-200`}
            >
              ⤴
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(scramble);
            }}
            aria-label={t.list.delete}
            className={`${ITEM_ACTION} hover:text-red-400`}
          >
            ✕
          </button>
        </div>
        <div
          className={`mt-1 flex flex-wrap gap-x-3 whitespace-nowrap font-mono text-xs text-neutral-500 ${inSet ? 'pl-10' : 'pl-6'}`}
        >
          <span>{t.solveCount(summary.count)}</span>
          <span>
            {t.list.best} {formatStat(summary.best)}
          </span>
          <span>
            {t.list.avg} {formatStat(summary.mean)}
          </span>
        </div>
      </div>
    </li>
  );
}

function SetListItem({
  entry,
  active,
  activeScrambleId,
  collapsed,
  onToggleCollapsed,
  onDeleteRequest,
  onDeleteScrambleRequest,
  onChosen,
}: {
  entry: SetEntry;
  active: boolean;
  activeScrambleId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onDeleteRequest: (set: ScrambleSet) => void;
  onDeleteScrambleRequest: (scramble: Scramble) => void;
  onChosen: () => void;
}) {
  const { t } = useLanguage();
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const { set, stats } = entry;
  const label = averageLabel(set.scrambleIds.length);

  return (
    <li>
      <div
        onClick={() => {
          dispatch({ type: 'SELECT_SET', id: set.id });
          onChosen();
        }}
        className={`group cursor-pointer border-l-2 px-3 py-2 ${
          active ? 'border-blue-500 bg-neutral-800/70' : 'border-transparent hover:bg-neutral-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
            aria-label={collapsed ? t.list.expandSet : t.list.collapseSet}
            aria-expanded={!collapsed}
            className="w-4 text-xs text-neutral-500 hover:text-neutral-300"
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {editing ? (
            <RenameInput
              value={set.title ?? ''}
              placeholder={t.setName(set.number)}
              onCommit={(title) => {
                dispatch({ type: 'UPDATE_SET', id: set.id, patch: { title } });
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">{setName(set, t)}</span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            aria-label={t.list.renameSet}
            className={`${ITEM_ACTION} hover:text-neutral-200`}
          >
            ✎
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(set);
            }}
            aria-label={t.list.deleteSet}
            className={`${ITEM_ACTION} hover:text-red-400`}
          >
            ✕
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 whitespace-nowrap pl-6 font-mono text-xs text-neutral-500">
          <span>{t.scrambleCount(set.scrambleIds.length)}</span>
          <span>{t.roundCount(stats.completedRounds)}</span>
          <span>
            {label} {formatAverage(stats.bestAverage)}
          </span>
        </div>
      </div>
      {!collapsed && (
        <ul>
          {entry.scrambles.map((summary) => (
            <ScrambleListItem
              key={summary.scramble.id}
              summary={summary}
              active={summary.scramble.id === activeScrambleId}
              position={set.scrambleIds.indexOf(summary.scramble.id) + 1}
              selectable={false}
              selected={false}
              onToggleSelect={() => undefined}
              onDeleteRequest={onDeleteScrambleRequest}
              onChosen={onChosen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

type DeleteTarget = { kind: 'scramble'; scramble: Scramble } | { kind: 'set'; set: ScrambleSet };

export function ScrambleList({
  searchRef,
  onDialogOpenChange,
  onScrambleChosen,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  onDialogOpenChange: (open: boolean) => void;
  /** Called after the user picks or creates a scramble or set (closes the list on phones). */
  onScrambleChosen: () => void;
}) {
  const { t } = useLanguage();
  const { scrambles, solves, sets, activeScrambleId, activeSetId } = useStore();
  const dispatch = useDispatch();
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [grouping, setGrouping] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [groupTarget, setGroupTarget] = useState<string>('new');

  const setDeleteTargetBoth = (target: DeleteTarget | null) => {
    setDeleteTarget(target);
    onDialogOpenChange(target !== null);
  };

  const visible = useMemo(() => {
    const entries = buildEntries(scrambles, solves, sets);
    const query = search.trim().toLowerCase();
    const matches = (s: ScrambleSummary) =>
      s.scramble.scramble.toLowerCase().includes(query) || scrambleName(s.scramble, t).toLowerCase().includes(query);
    const filtered =
      query.length === 0
        ? entries
        : entries.flatMap((entry): ListEntry[] => {
            if (entry.kind === 'scramble') return matches(entry.summary) ? [entry] : [];
            if (setName(entry.set, t).toLowerCase().includes(query)) return [entry];
            const members = entry.scrambles.filter(matches);
            return members.length > 0 ? [{ ...entry, scrambles: members }] : [];
          });
    return sortEntries(filtered, sortOrder);
  }, [scrambles, solves, sets, search, sortOrder, t]);

  const selectedCount = useMemo(
    () => scrambles.filter((s) => selectedIds.has(s.id)).length,
    [scrambles, selectedIds],
  );

  const handleNewScramble = () => {
    dispatch({ type: 'ADD_SCRAMBLE', scramble: createScramble() });
    onScrambleChosen();
  };

  const handleNewSet = (size: number) => {
    dispatch(addSetAction(size));
    onScrambleChosen();
  };

  const toggleGrouping = (on: boolean) => {
    setGrouping(on);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGroup = () => {
    // Oldest first, so the set reads in the order the scrambles were made.
    const scrambleIds = scrambles.filter((s) => selectedIds.has(s.id)).map((s) => s.id);
    if (scrambleIds.length === 0) return;
    if (groupTarget === 'new' || !sets.some((s) => s.id === groupTarget)) {
      dispatch({
        type: 'ADD_SET',
        set: { id: newId(), createdAt: Date.now(), scrambleIds: [] },
        scrambleIds,
        newScrambles: [],
      });
    } else {
      dispatch({ type: 'ADD_TO_SET', id: groupTarget, scrambleIds });
      dispatch({ type: 'SELECT_SET', id: groupTarget });
    }
    toggleGrouping(false);
    onScrambleChosen();
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const SMALL_BUTTON =
    'flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800';

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-neutral-800 p-3">
        <button
          type="button"
          onClick={handleNewScramble}
          className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          {t.list.newScramble}
        </button>
        <div className="flex gap-2">
          {SET_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => handleNewSet(size)}
              title={t.list.newSetTitle(size, averageLabel(size))}
              className={SMALL_BUTTON}
            >
              <span aria-hidden="true">+</span> {t.list.newSet(size)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toggleGrouping(!grouping)}
            aria-pressed={grouping}
            title={t.list.groupTitle}
            className={`${SMALL_BUTTON} ${grouping ? 'border-blue-500 text-blue-300' : ''}`}
          >
            {t.list.group}
          </button>
        </div>
        {grouping && (
          <div className="space-y-2 rounded-md border border-blue-900 bg-blue-950/30 p-2">
            <p className="text-xs text-neutral-400">{t.list.groupHint}</p>
            <div className="flex gap-2">
              <select
                value={groupTarget}
                onChange={(e) => setGroupTarget(e.target.value)}
                aria-label={t.list.groupTarget}
                className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-base text-neutral-300 focus:border-neutral-500 focus:outline-none sm:text-sm"
              >
                <option value="new">{t.list.groupNew}</option>
                {sets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {setName(set, t)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleGroup}
                disabled={selectedCount === 0}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.list.groupConfirm(selectedCount)}
              </button>
              <button type="button" onClick={() => toggleGrouping(false)} className={`${SMALL_BUTTON} flex-none`}>
                {t.list.groupCancel}
              </button>
            </div>
          </div>
        )}
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          placeholder={t.list.search}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-base text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none sm:text-sm"
        />
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          aria-label={t.list.sortLabel}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-base text-neutral-300 focus:border-neutral-500 focus:outline-none sm:text-sm"
        >
          {SORT_ORDERS.map((key) => (
            <option key={key} value={key}>
              {t.list.sort[key]}
            </option>
          ))}
        </select>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-sm text-neutral-500">
            {scrambles.length === 0 ? t.list.empty : t.list.noMatch}
          </li>
        ) : (
          visible.map((entry) =>
            entry.kind === 'set' ? (
              <SetListItem
                key={entry.set.id}
                entry={entry}
                active={activeScrambleId === null && entry.set.id === activeSetId}
                activeScrambleId={activeScrambleId}
                collapsed={collapsed.has(entry.set.id)}
                onToggleCollapsed={() => toggleCollapsed(entry.set.id)}
                onDeleteRequest={(set) => setDeleteTargetBoth({ kind: 'set', set })}
                onDeleteScrambleRequest={(scramble) => setDeleteTargetBoth({ kind: 'scramble', scramble })}
                onChosen={onScrambleChosen}
              />
            ) : (
              <ScrambleListItem
                key={entry.summary.scramble.id}
                summary={entry.summary}
                active={entry.summary.scramble.id === activeScrambleId}
                selectable={grouping}
                selected={selectedIds.has(entry.summary.scramble.id)}
                onToggleSelect={toggleSelected}
                onDeleteRequest={(scramble) => setDeleteTargetBoth({ kind: 'scramble', scramble })}
                onChosen={onScrambleChosen}
              />
            ),
          )
        )}
      </ul>

      <ImportExport onDialogOpenChange={onDialogOpenChange} />

      {deleteTarget?.kind === 'scramble' && (
        <ConfirmDialog
          title={t.list.deleteTitle}
          message={t.list.deleteMessage(
            scrambleName(deleteTarget.scramble, t),
            solves.filter((s) => s.scrambleId === deleteTarget.scramble.id).length,
          )}
          confirmLabel={t.list.deleteConfirm}
          destructive
          onConfirm={() => {
            dispatch({ type: 'DELETE_SCRAMBLE', id: deleteTarget.scramble.id });
            setDeleteTargetBoth(null);
          }}
          onCancel={() => setDeleteTargetBoth(null)}
        />
      )}
      {deleteTarget?.kind === 'set' && (
        <ConfirmDialog
          title={t.list.deleteSetTitle}
          message={t.list.deleteSetMessage(
            setName(deleteTarget.set, t),
            deleteTarget.set.scrambleIds.length,
            solves.filter((s) => deleteTarget.set.scrambleIds.includes(s.scrambleId)).length,
          )}
          confirmLabel={t.list.deleteSetConfirm}
          destructive
          onConfirm={() => {
            dispatch({ type: 'DELETE_SET', id: deleteTarget.set.id, deleteScrambles: true });
            setDeleteTargetBoth(null);
          }}
          onCancel={() => setDeleteTargetBoth(null)}
        />
      )}
    </div>
  );
}
