import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  DRY_MODES,
  maxLevel,
  modeStats,
  recordResult,
  toNextLevel,
  totalPoints,
  withLevel,
  type DryMode,
  type DryPracticeData,
  type DrySettings,
  type ModeProgress,
  type Outcome,
  type TaskResult,
  type TimeSetting,
} from '../../lib/dryPractice';
import { loadDryPractice, saveDryPractice } from '../../lib/storage';
import { CrossChallenge } from './CrossChallenge';
import { CrossTrainer } from './CrossTrainer';
import { EdgeHunter } from './EdgeHunter';
import { EdgeTracker } from './EdgeTracker';
import { MiniCross } from './MiniCross';
import { PRIMARY_BUTTON, formatSeconds, type ModeProps } from './shared';

const ICON_BUTTON =
  'rounded-md px-2.5 py-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400';

const MODE_COMPONENTS: Record<DryMode, (props: ModeProps) => JSX.Element> = {
  hunter: EdgeHunter,
  tracker: EdgeTracker,
  miniCross: MiniCross,
  cross: CrossChallenge,
};

const TIME_OPTIONS: Record<'memorize' | 'inspection', readonly number[]> = {
  memorize: [5000, 10000, 20000],
  inspection: [15000, 30000, 60000],
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="truncate font-mono text-sm tabular-nums text-neutral-100">{value}</div>
    </div>
  );
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)} %`;
}

/** What is open: one of the scored modes, or the Cross Trainer (a guide, with no levels or points). */
type Screen = DryMode | 'trainer';

/** The Cross Trainer on the menu. */
function TrainerCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useLanguage();
  const tt = t.dry.trainer;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600 hover:bg-neutral-800/60"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-neutral-100">{tt.name}</span>
          <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">{tt.badge}</span>
        </div>
        <p className="text-sm text-neutral-400">{tt.tagline}</p>
        <span className={`${PRIMARY_BUTTON} mt-auto self-start`}>{tt.open} →</span>
      </button>
    </li>
  );
}

/** One mode on the menu: name, what it trains and where the user stands. */
function ModeCard({ mode, progress, onOpen }: { mode: DryMode; progress: ModeProgress; onOpen: () => void }) {
  const { t } = useLanguage();
  const stats = modeStats(progress);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600 hover:bg-neutral-800/60"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-neutral-100">{t.dry.modes[mode].name}</span>
          <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-neutral-300">
            {t.dry.level(progress.level, maxLevel(mode))}
          </span>
        </div>
        <p className="text-sm text-neutral-400">{t.dry.modes[mode].tagline}</p>
        {progress.attempts === 0 ? (
          <p className="mt-auto text-xs text-neutral-600">{t.dry.noAttempts}</p>
        ) : (
          <div className="mt-auto grid grid-cols-3 gap-2 pt-1">
            <Stat label={t.dry.points} value={String(progress.points)} />
            <Stat label={t.dry.accuracy} value={percent(stats.accuracy)} />
            <Stat label={t.dry.bestStreak} value={String(progress.bestStreak)} />
          </div>
        )}
        <span className={`${PRIMARY_BUTTON} mt-1 self-start`}>{t.dry.train} →</span>
      </button>
    </li>
  );
}

function TimeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TimeSetting;
  options: readonly number[];
  onChange: (value: TimeSetting) => void;
}) {
  const { t } = useLanguage();
  const encoded = value === 'auto' ? 'auto' : value === null ? 'unlimited' : String(value);
  return (
    <label className="flex items-center gap-1.5 text-xs text-neutral-400">
      <span className="hidden sm:inline">{label}</span>
      <select
        aria-label={label}
        value={encoded}
        onChange={(e) => onChange(e.target.value === 'auto' ? 'auto' : e.target.value === 'unlimited' ? null : Number(e.target.value))}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-500"
      >
        <option value="auto">{t.dry.settings.auto}</option>
        <option value="unlimited">{t.dry.settings.unlimited}</option>
        {options.map((ms) => (
          <option key={ms} value={ms}>
            {t.dry.seconds(String(ms / 1000))}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The bar above a mode: level with manual adjustment, progress to the next level, stats and the mode's time setting. */
function ModeBar({
  mode,
  progress,
  settings,
  onLevel,
  onSettings,
}: {
  mode: DryMode;
  progress: ModeProgress;
  settings: DrySettings;
  onLevel: (level: number) => void;
  onSettings: (patch: Partial<DrySettings>) => void;
}) {
  const { t } = useLanguage();
  const stats = modeStats(progress);
  const max = maxLevel(mode);
  const remaining = toNextLevel(progress);
  const crossMode = mode === 'miniCross' || mode === 'cross';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-3 py-2 text-sm">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onLevel(progress.level - 1)} disabled={progress.level <= 1} aria-label={t.dry.easier} title={t.dry.easier} className={ICON_BUTTON}>
          ◀
        </button>
        <div className="text-center">
          <div className="font-medium text-neutral-100">{t.dry.level(progress.level, max)}</div>
          <div className="text-[11px] text-neutral-500" title={progress.level >= max ? t.dry.maxLevel : t.dry.toNext(remaining)}>
            {progress.level >= max
              ? t.dry.maxLevel
              : Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className={i < 3 - remaining ? 'text-green-400' : 'text-neutral-700'}>
                    ●
                  </span>
                ))}
          </div>
        </div>
        <button type="button" onClick={() => onLevel(progress.level + 1)} disabled={progress.level >= max} aria-label={t.dry.harder} title={t.dry.harder} className={ICON_BUTTON}>
          ▶
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Stat label={t.dry.points} value={String(progress.points)} />
        <Stat label={t.dry.streak} value={`${progress.streak} (${progress.bestStreak})`} />
        <Stat label={t.dry.accuracy} value={percent(stats.accuracy)} />
        <Stat label={t.dry.bestScore} value={progress.bestScore === null ? '—' : String(progress.bestScore)} />
        {crossMode ? (
          <Stat label={t.dry.optimalCount} value={String(progress.optimalCount)} />
        ) : (
          <Stat label={t.dry.bestTime} value={progress.bestTimeMs === null ? '—' : t.dry.seconds(formatSeconds(progress.bestTimeMs))} />
        )}
        {crossMode && stats.recentExtraMoves !== null && <Stat label={t.dry.extraMoves} value={stats.recentExtraMoves.toFixed(1)} />}
        {!crossMode && stats.recentTimeMs !== null && <Stat label={t.dry.recentTime} value={t.dry.seconds(formatSeconds(stats.recentTimeMs))} />}
      </div>
      <div className="ml-auto">
        {mode === 'tracker' && (
          <TimeSelect label={t.dry.settings.memorize} value={settings.memorize} options={TIME_OPTIONS.memorize} onChange={(memorize) => onSettings({ memorize })} />
        )}
        {mode === 'cross' && (
          <TimeSelect label={t.dry.settings.inspection} value={settings.inspection} options={TIME_OPTIONS.inspection} onChange={(inspection) => onSettings({ inspection })} />
        )}
      </div>
    </div>
  );
}

/** Dry practice: the cross-inspection trainers, as a full-screen dialog like the cheatsheet. */
export function DryPractice({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [data, setData] = useState<DryPracticeData>(loadDryPractice);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [screen, setScreen] = useState<Screen | null>(null);
  const mode = screen === 'trainer' ? null : screen;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => saveDryPractice(data), [data]);

  const update = useCallback((next: DryPracticeData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  // Scores the result right away so the mode can show it, and remembers the new progress.
  const onResult = useCallback(
    (result: TaskResult, limitMs: number | null = null): Outcome => {
      const current = dataRef.current;
      const outcome = recordResult(current.modes[result.mode], result, limitMs);
      update({ ...current, modes: { ...current.modes, [result.mode]: outcome.progress } });
      return outcome;
    },
    [update],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (screen !== null) setScreen(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, onClose]);

  const Mode = mode === null ? null : MODE_COMPONENTS[mode];

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
        aria-label={t.dry.title}
        className="flex h-full w-full flex-col bg-neutral-950 sm:max-h-full sm:max-w-5xl sm:rounded-lg sm:border sm:border-neutral-800 sm:shadow-xl"
      >
        <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-2">
          {screen !== null && (
            <button type="button" onClick={() => setScreen(null)} aria-label={t.dry.back} title={t.dry.back} className={ICON_BUTTON}>
              ←
            </button>
          )}
          <h2 className="px-1 text-sm font-semibold text-neutral-100">
            {t.dry.title}
            {screen !== null && <span className="text-neutral-500"> · {mode === null ? t.dry.trainer.name : t.dry.modes[mode].name}</span>}
          </h2>
          {screen === null && (
            <span className="ml-auto mr-2 text-xs text-neutral-500">
              {t.dry.totalPoints}: <span className="font-mono text-neutral-300">{totalPoints(data)}</span>
            </span>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t.dry.close} className={`${ICON_BUTTON} ${screen === null ? '' : 'ml-auto'}`}>
            ✕
          </button>
        </div>
        {screen === 'trainer' ? (
          <CrossTrainer />
        ) : mode === null || Mode === null ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <p className="mb-4 max-w-3xl text-sm text-neutral-400">{t.dry.intro}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              <TrainerCard onOpen={() => setScreen('trainer')} />
              {DRY_MODES.map((m) => (
                <ModeCard key={m} mode={m} progress={data.modes[m]} onOpen={() => setScreen(m)} />
              ))}
            </ul>
          </div>
        ) : (
          <>
            <ModeBar
              mode={mode}
              progress={data.modes[mode]}
              settings={data.settings}
              onLevel={(level) => update({ ...data, modes: { ...data.modes, [mode]: withLevel(data.modes[mode], mode, level) } })}
              onSettings={(patch) => update({ ...data, settings: { ...data.settings, ...patch } })}
            />
            <Mode key={mode} level={data.modes[mode].level} settings={data.settings} onResult={onResult} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
