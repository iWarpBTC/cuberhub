import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALGORITHM_GROUPS, ALGORITHMS, TRIGGERS, type Algorithm } from '../lib/algorithms';
import { useLanguage } from '../i18n/LanguageContext';
import { F2L_CASES, F2L_GROUPS, LAST_LAYER_STICKERS, f2lCasePerm, type F2LCase } from '../lib/f2l';
import { NOTATION, type NotationMove } from '../lib/notation';
import { loadFavoriteAlgorithms, loadFavoritesOnly, saveFavoriteAlgorithms, saveFavoritesOnly } from '../lib/storage';
import { CubeIso } from './CubeIso';
import { F2LTrainer, useCaseDescription } from './F2LTrainer';
import { LastLayerDiagram } from './LastLayerDiagram';
import { useDispatch, useStore } from '../store/StoreContext';
import type { F2LSolution } from '../types';
import { MoveDiagram } from './MoveDiagram';

export type CheatsheetTab = 'moves' | 'f2l' | 'algorithms';

const TABS: readonly CheatsheetTab[] = ['moves', 'f2l', 'algorithms'];

/** Favorite algorithm ids and the "favorites only" filter, remembered across sessions and shared by the tabs. */
function useFavorites() {
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set(loadFavoriteAlgorithms()));
  const [favoritesOnly, setFavoritesOnly] = useState(loadFavoritesOnly);

  useEffect(() => saveFavoriteAlgorithms([...favorites]), [favorites]);
  useEffect(() => saveFavoritesOnly(favoritesOnly), [favoritesOnly]);

  const toggleFavorite = (id: string) =>
    setFavorites((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return { favorites, favoritesOnly, setFavoritesOnly, toggleFavorite };
}

function FavoritesFilter({
  favoritesOnly,
  count,
  onChange,
}: {
  favoritesOnly: boolean;
  count: number;
  onChange: (only: boolean) => void;
}) {
  const { t } = useLanguage();
  const filters = [
    { only: false, label: t.cheatsheet.showAll },
    { only: true, label: `${t.cheatsheet.showFavorites} (${count})` },
  ];
  return (
    <div role="group" aria-label={t.cheatsheet.filterLabel} className="inline-flex rounded-md border border-neutral-800 p-0.5">
      {filters.map(({ only, label }) => (
        <button
          key={String(only)}
          type="button"
          aria-pressed={favoritesOnly === only}
          onClick={() => onChange(only)}
          className={`rounded px-3 py-1 text-sm ${
            favoritesOnly === only ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FavoriteButton({ favorite, onToggle }: { favorite: boolean; onToggle: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={favorite}
      aria-label={favorite ? t.cheatsheet.removeFavorite : t.cheatsheet.markFavorite}
      title={favorite ? t.cheatsheet.removeFavorite : t.cheatsheet.markFavorite}
      className={`absolute top-1.5 right-1.5 rounded-md px-2 py-1 text-lg leading-none ${
        favorite ? 'text-yellow-400' : 'text-neutral-600 hover:text-neutral-300'
      }`}
    >
      {favorite ? '★' : '☆'}
    </button>
  );
}

function MoveCard({ move, name, description, shape }: NotationMove) {
  const { l } = useLanguage();
  const variants = [
    { label: move, variant: 'cw', caption: '↻ 90°' },
    { label: `${move}'`, variant: 'ccw', caption: '↺ 90°' },
    { label: `${move}2`, variant: 'half', caption: '180°' },
  ] as const;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3 sm:block">
      <div className="w-24 shrink-0 sm:w-auto">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
          <span className="font-mono text-lg font-bold text-neutral-100">{move}</span>
          <span className="text-sm text-neutral-300">{l(name)}</span>
        </div>
        <p className="text-xs text-neutral-500">{l(description)}</p>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-1 sm:mt-2">
        {variants.map(({ label, variant, caption }) => (
          <figure key={variant} className="flex flex-col items-center">
            <MoveDiagram shape={shape} variant={variant} className="h-14 w-14 sm:h-18 sm:w-18" />
            <figcaption className="mt-1 text-center">
              <span className="font-mono text-sm text-neutral-100">{label}</span>
              <span className="block text-[10px] text-neutral-500">{caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </li>
  );
}

function MovesTab() {
  const { t, l } = useLanguage();
  const intro = t.cheatsheet.movesIntro;
  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">
        {intro.before}
        <strong className="font-medium text-neutral-200">{intro.clockwise}</strong>
        {intro.middle}
        <span className="font-mono text-neutral-200">R'</span>
        {intro.prime}
        <span className="font-mono text-neutral-200">2</span>
        {intro.after}
      </p>
      {NOTATION.map((group) => (
        <section key={group.id}>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500">{l(group.title)}</h3>
          <p className="mb-2 text-xs text-neutral-600">{l(group.note)}</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.moves.map((move) => (
              <MoveCard key={move.move} {...move} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AlgorithmCard({
  algorithm,
  kind,
  favorite,
  onToggleFavorite,
}: {
  algorithm: Algorithm;
  kind: 'OLL' | 'PLL';
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const { t, l, lang } = useLanguage();
  return (
    <li className="relative flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <FavoriteButton favorite={favorite} onToggle={onToggleFavorite} />
      <LastLayerDiagram
        alg={algorithm.alg}
        kind={kind}
        label={t.cheatsheet.caseLabel}
        className="h-20 w-20 shrink-0"
      />
      <div className="min-w-0 pr-6">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-neutral-100">{l(algorithm.name)}</span>
          {algorithm.short !== undefined && (
            <span className="rounded bg-neutral-800 px-1.5 font-mono text-[11px] text-neutral-400">
              {algorithm.short}
            </span>
          )}
        </div>
        {lang === 'cs' && algorithm.czech !== undefined && (
          <div className="text-xs italic text-neutral-500">
            {algorithm.czech}
          </div>
        )}
        <p className="mt-1.5 font-mono text-sm leading-relaxed text-neutral-100">{algorithm.alg}</p>
        <p className="mt-1 text-xs text-neutral-400">{l(algorithm.description)}</p>
      </div>
    </li>
  );
}

function F2LCard({
  f2lCase,
  solutions,
  favorite,
  onToggleFavorite,
  onOpen,
}: {
  f2lCase: F2LCase;
  solutions: readonly F2LSolution[];
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const perm = useMemo(() => f2lCasePerm(f2lCase.alg), [f2lCase.alg]);
  const description = useCaseDescription(f2lCase.alg);
  return (
    <li className="relative rounded-lg border border-neutral-800 bg-neutral-900">
      <FavoriteButton favorite={favorite} onToggle={onToggleFavorite} />
      <button
        type="button"
        onClick={onOpen}
        title={t.f2l.open}
        className="flex w-full gap-3 rounded-lg p-3 text-left hover:bg-neutral-800/60"
      >
        <CubeIso perm={perm} dim={LAST_LAYER_STICKERS} label={t.f2l.caseLabel} className="h-20 w-20 shrink-0" />
        <div className="min-w-0 pr-6">
          <div className="font-medium text-neutral-100">{t.f2l.caseName(f2lCase.number)}</div>
          <p className="mt-1.5 font-mono text-sm leading-relaxed text-neutral-100">{f2lCase.alg}</p>
          {solutions.map((s) => (
            <div key={s.id} className="mt-1 border-l-2 border-neutral-700 pl-2">
              <p className="font-mono text-sm leading-relaxed text-neutral-300">{s.alg}</p>
              {s.source !== undefined && (
                <p className="font-mono text-xs text-neutral-500">{s.source}</p>
              )}
              {s.note !== undefined && <p className="text-xs italic text-neutral-500">{s.note}</p>}
            </div>
          ))}
          <p className="mt-1 text-xs text-neutral-400">{description}</p>
        </div>
      </button>
    </li>
  );
}

function F2LTab() {
  const { t, l } = useLanguage();
  const { favorites, favoritesOnly, setFavoritesOnly, toggleFavorite } = useFavorites();
  const { f2lSolutions } = useStore();
  const dispatch = useDispatch();
  const [openId, setOpenId] = useState<string | null>(null);

  const favoriteCases = F2L_CASES.filter((c) => favorites.has(c.id));
  const shown = favoritesOnly ? favoriteCases : F2L_CASES;
  const openIndex = shown.findIndex((c) => c.id === openId);
  const openCase = openIndex >= 0 ? shown[openIndex]! : null;
  const closeTrainer = useCallback(() => setOpenId(null), []);

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">{t.f2l.intro}</p>
      <FavoritesFilter favoritesOnly={favoritesOnly} count={favoriteCases.length} onChange={setFavoritesOnly} />
      {favoritesOnly && shown.length === 0 && <p className="text-sm text-neutral-500">{t.cheatsheet.noFavorites}</p>}
      {F2L_GROUPS.map((group) => {
        const cases = shown.filter((c) => c.group === group.id);
        if (cases.length === 0) return null;
        return (
          <section key={group.id}>
            <h3 className="text-xs uppercase tracking-wide text-neutral-500">{l(group.title)}</h3>
            <p className="mb-2 text-xs text-neutral-600">{l(group.note)}</p>
            <ul className="grid gap-2 md:grid-cols-2">
              {cases.map((c) => (
                <F2LCard
                  key={c.id}
                  f2lCase={c}
                  solutions={f2lSolutions.filter((s) => s.caseId === c.id)}
                  favorite={favorites.has(c.id)}
                  onToggleFavorite={() => toggleFavorite(c.id)}
                  onOpen={() => setOpenId(c.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {openCase !== null && (
        <F2LTrainer
          key={openCase.id}
          f2lCase={openCase}
          solutions={f2lSolutions.filter((s) => s.caseId === openCase.id)}
          favorite={favorites.has(openCase.id)}
          onToggleFavorite={() => toggleFavorite(openCase.id)}
          onAddSolution={(solution) => dispatch({ type: 'ADD_F2L_SOLUTION', solution })}
          onDeleteSolution={(id) => dispatch({ type: 'DELETE_F2L_SOLUTION', id })}
          onPrev={openIndex > 0 ? () => setOpenId(shown[openIndex - 1]!.id) : null}
          onNext={openIndex < shown.length - 1 ? () => setOpenId(shown[openIndex + 1]!.id) : null}
          onClose={closeTrainer}
        />
      )}
    </div>
  );
}

function AlgorithmsTab() {
  const { t, l } = useLanguage();
  const { favorites, favoritesOnly, setFavoritesOnly, toggleFavorite } = useFavorites();

  const favoriteAlgorithms = ALGORITHMS.filter((a) => favorites.has(a.id));
  const shown = favoritesOnly ? favoriteAlgorithms : ALGORITHMS;

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">{t.cheatsheet.algorithmsIntro}</p>
      <FavoritesFilter favoritesOnly={favoritesOnly} count={favoriteAlgorithms.length} onChange={setFavoritesOnly} />
      {favoritesOnly && shown.length === 0 && <p className="text-sm text-neutral-500">{t.cheatsheet.noFavorites}</p>}
      {!favoritesOnly && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500">{t.cheatsheet.triggers}</h3>
          <p className="mb-2 text-xs text-neutral-600">{t.cheatsheet.triggersNote}</p>
          <ul className="grid gap-2 md:grid-cols-3">
            {TRIGGERS.map((trigger) => (
              <li key={trigger.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <div className="font-medium text-neutral-100">{l(trigger.name)}</div>
                <p className="mt-1 font-mono text-sm text-neutral-100">{trigger.alg}</p>
                <p className="mt-1 text-xs text-neutral-400">{l(trigger.description)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ALGORITHM_GROUPS.map((group) => {
        const algorithms = shown.filter((a) => a.group === group.id);
        if (algorithms.length === 0) return null;
        return (
          <section key={group.id}>
            <h3 className="text-xs uppercase tracking-wide text-neutral-500">{l(group.title)}</h3>
            <p className="mb-2 text-xs text-neutral-600">{l(group.note)}</p>
            <ul className="grid gap-2 md:grid-cols-2">
              {algorithms.map((algorithm) => (
                <AlgorithmCard
                  key={algorithm.id}
                  algorithm={algorithm}
                  kind={group.set}
                  favorite={favorites.has(algorithm.id)}
                  onToggleFavorite={() => toggleFavorite(algorithm.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function Cheatsheet({
  tab,
  onTabChange,
  onClose,
}: {
  tab: CheatsheetTab;
  onTabChange: (tab: CheatsheetTab) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/60 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.cheatsheet.title}
        className="flex h-full w-full flex-col bg-neutral-950 sm:max-w-5xl sm:rounded-lg sm:border sm:border-neutral-800 sm:shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <h2 className="mr-2 hidden text-sm font-semibold text-neutral-100 sm:block">{t.cheatsheet.title}</h2>
          <div role="tablist" aria-label={t.cheatsheet.sections} className="flex rounded-md border border-neutral-800 p-0.5">
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => onTabChange(id)}
                className={`rounded px-3 py-1 text-sm ${
                  tab === id ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.cheatsheet[id]}
              </button>
            ))}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.cheatsheet.close}
            className="ml-auto rounded-md px-2.5 py-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>
        <div key={tab} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {tab === 'moves' ? <MovesTab /> : tab === 'f2l' ? <F2LTab /> : <AlgorithmsTab />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
