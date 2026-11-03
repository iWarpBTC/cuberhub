import { formatMs } from '../lib/format';
import { formatInspection, inspectionStage, type InspectionStage } from '../lib/inspection';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useLanguage } from '../i18n/LanguageContext';
import type { TimerPadHandlers, TimerPhase } from '../hooks/useTimer';

const PHASE_COLOR: Record<TimerPhase, string> = {
  idle: 'text-neutral-100',
  inspecting: 'text-neutral-100',
  holding: 'text-red-500',
  ready: 'text-green-500',
  running: 'text-neutral-100',
};

/** Countdown colours follow the judge's calls: plain, then "8 seconds", "12 seconds", then the penalties. */
const STAGE_COLOR: Record<InspectionStage, string> = {
  early: 'text-neutral-100',
  eight: 'text-yellow-400',
  twelve: 'text-orange-400',
  plus2: 'text-red-400',
  dnf: 'text-red-500',
};

export function TimerDisplay({
  phase,
  displayMs,
  inspectionMs,
  inspection,
  padHandlers,
  onCancelInspection,
}: {
  phase: TimerPhase;
  displayMs: number;
  inspectionMs: number | null;
  /** Whether solves start with a WCA inspection (changes the idle hint). */
  inspection: boolean;
  padHandlers: TimerPadHandlers;
  onCancelInspection: () => void;
}) {
  const { t } = useLanguage();
  const touch = useMediaQuery('(pointer: coarse)');
  const inspecting = inspectionMs !== null;
  const color =
    inspecting && phase === 'inspecting' ? STAGE_COLOR[inspectionStage(inspectionMs)] : PHASE_COLOR[phase];

  return (
    <div
      {...padHandlers}
      className={`flex cursor-pointer touch-none flex-col items-center rounded-xl py-8 select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] sm:py-6 ${
        phase === 'idle' ? 'transition-colors hover:bg-neutral-900/60' : ''
      }`}
    >
      <div className={`font-mono text-6xl font-bold tabular-nums sm:text-7xl ${color}`}>
        {inspecting ? formatInspection(inspectionMs) : formatMs(displayMs)}
      </div>
      <p className={`mt-2 text-center text-xs ${phase === 'running' ? 'text-green-100/80' : 'text-neutral-500'}`}>
        {t.timerHint(phase, touch, inspection)}
      </p>
      {phase === 'inspecting' && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancelInspection}
          className="mt-3 rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {t.inspection.cancel}
          {!touch && ' (Esc)'}
        </button>
      )}
    </div>
  );
}
