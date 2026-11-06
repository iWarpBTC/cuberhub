import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTimer } from '../hooks/useTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { useLanguage } from '../i18n/LanguageContext';
import { createScramble } from '../lib/scramble';
import { newId } from '../lib/id';
import { loadInspection, loadListOpen, saveInspection, saveListOpen } from '../lib/storage';
import { addSetAction, useActiveSet, useDispatch, useSetOf, useStore } from '../store/StoreContext';
import { ScrambleList } from './ScrambleList';
import { ScramblePanel } from './ScramblePanel';
import { SetPanel } from './SetPanel';

/** Matches Tailwind's `md` breakpoint: the scramble list is a sidebar from here up, a drawer below. */
const WIDE_QUERY = '(min-width: 768px)';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

const TOOLBAR_BUTTON =
  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100';

/**
 * The timer: the scramble list beside the active scramble (or set) with its
 * timer. `onSolvingChange` tells the shell while a solve is being timed;
 * `onOpenCheatsheet` is the `?` shortcut.
 */
export function TimerPage({
  onSolvingChange,
  onOpenCheatsheet,
}: {
  onSolvingChange: (solving: boolean) => void;
  onOpenCheatsheet: () => void;
}) {
  const { t } = useLanguage();
  const { activeScrambleId, selectedSolveId } = useStore();
  const activeSet = useActiveSet();
  const setOfActive = useSetOf(activeScrambleId);
  const dispatch = useDispatch();
  const searchRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const onOpenCheatsheetRef = useRef(onOpenCheatsheet);
  onOpenCheatsheetRef.current = onOpenCheatsheet;

  // The list is a collapsible sidebar on wide screens (remembered) and a drawer on phones (closed by default).
  const wide = useMediaQuery(WIDE_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(loadListOpen);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const listOpen = wide ? sidebarOpen : drawerOpen;
  const setListOpen = useCallback((open: boolean) => (wide ? setSidebarOpen : setDrawerOpen)(open), [wide]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => saveListOpen(sidebarOpen), [sidebarOpen]);

  // WCA inspection before each solve; off unless the user turned it on.
  const [inspection, setInspection] = useState(loadInspection);
  useEffect(() => saveInspection(inspection), [inspection]);

  const activeScrambleIdRef = useRef(activeScrambleId);
  activeScrambleIdRef.current = activeScrambleId;
  const selectedSolveIdRef = useRef(selectedSolveId);
  selectedSolveIdRef.current = selectedSolveId;
  // The neighbours of the active scramble inside its set, for the arrow keys.
  const neighbours = useMemo(() => {
    if (setOfActive === null || activeScrambleId === null) return null;
    const index = setOfActive.scrambleIds.indexOf(activeScrambleId);
    return { prev: setOfActive.scrambleIds[index - 1] ?? null, next: setOfActive.scrambleIds[index + 1] ?? null };
  }, [setOfActive, activeScrambleId]);
  const neighboursRef = useRef(neighbours);
  neighboursRef.current = neighbours;
  const dialogOpenRef = useRef(dialogOpen);
  dialogOpenRef.current = dialogOpen;

  const timer = useTimer(!dialogOpen && activeScrambleId !== null, inspection, ({ elapsedMs, inspectionPenalty }) => {
    const scrambleId = activeScrambleIdRef.current;
    if (scrambleId === null) return;
    dispatch({
      type: 'ADD_SOLVE',
      solve: {
        id: newId(),
        scrambleId,
        timeMs: elapsedMs,
        penalty: 'none',
        ...(inspectionPenalty === null ? {} : { inspectionPenalty }),
        createdAt: Date.now(),
      },
    });
  });

  // A running solve turns the timer area green, fades the header and keeps the screen from sleeping.
  const running = timer.phase === 'running';
  useWakeLock(running);
  useEffect(() => {
    onSolvingChange(running);
    return () => onSolvingChange(false);
  }, [running, onSolvingChange]);
  const timerIdleRef = useRef(timer.phase === 'idle');
  timerIdleRef.current = timer.phase === 'idle';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogOpenRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        dispatch({ type: 'ADD_SCRAMBLE', scramble: createScramble() });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        dispatch(addSetAction(5));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setListOpen(true);
        // The list may only now be rendering visibly; focus once it is.
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        onOpenCheatsheetRef.current();
        return;
      }
      if (e.key === 'Escape' && !wide) {
        setDrawerOpen(false);
        return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const target = e.key === 'ArrowLeft' ? neighboursRef.current?.prev : neighboursRef.current?.next;
        if (target != null && timerIdleRef.current) {
          e.preventDefault();
          dispatch({ type: 'SELECT_SCRAMBLE', id: target });
        }
        return;
      }
      if (e.key === 'Delete') {
        const solveId = selectedSolveIdRef.current;
        if (solveId !== null) {
          e.preventDefault();
          dispatch({ type: 'DELETE_SOLVE', id: solveId });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, setListOpen, wide]);

  return (
    <div className="flex min-h-0 flex-1">
      {/* The drawer and its backdrop start below the header, so the logo stays in sight. */}
      {!wide && drawerOpen && (
        <div className="fixed inset-x-0 top-(--header-h) bottom-0 z-30 bg-black/60" onClick={closeDrawer} aria-hidden="true" />
      )}
      <aside
        aria-label={t.toolbar.scrambles}
        inert={!listOpen}
        className={`fixed top-(--header-h) bottom-0 left-0 z-40 w-80 max-w-[85vw] border-r border-neutral-800 bg-neutral-950 transition-transform duration-200 md:static md:z-auto md:max-w-none md:shrink-0 md:translate-none md:transition-none ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarOpen ? '' : 'md:hidden'}`}
      >
        <ScrambleList searchRef={searchRef} onDialogOpenChange={setDialogOpen} onScrambleChosen={closeDrawer} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-neutral-800 px-2 py-1">
          <button
            type="button"
            onClick={() => setListOpen(!listOpen)}
            aria-expanded={listOpen}
            aria-label={listOpen ? t.toolbar.hideList : t.toolbar.showList}
            title={listOpen ? t.toolbar.hideList : t.toolbar.showList}
            className={TOOLBAR_BUTTON}
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2" />
              <path d="M7.75 3.75v12.5" />
            </svg>
            <span className="md:hidden">{t.toolbar.scrambles}</span>
          </button>
          {!listOpen && (
            <>
              <button
                type="button"
                onClick={() => dispatch({ type: 'ADD_SCRAMBLE', scramble: createScramble() })}
                className={TOOLBAR_BUTTON}
              >
                <span aria-hidden="true" className="text-base leading-none">+</span> {t.toolbar.new}
              </button>
              <button
                type="button"
                onClick={() => dispatch(addSetAction(5))}
                title={t.list.newSetTitle(5, 'Ao5')}
                className={TOOLBAR_BUTTON}
              >
                <span aria-hidden="true" className="text-base leading-none">+</span> {t.toolbar.newSet}
              </button>
            </>
          )}
        </div>
        <main
          className={`min-h-0 flex-1 overflow-y-auto transition-colors duration-150 ${running ? 'bg-green-800' : ''}`}
        >
          {activeSet !== null ? (
            <SetPanel set={activeSet} onDialogOpenChange={setDialogOpen} />
          ) : (
            <ScramblePanel timer={timer} inspection={inspection} onInspectionChange={setInspection} />
          )}
        </main>
      </div>
    </div>
  );
}
