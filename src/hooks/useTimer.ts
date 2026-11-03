import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Penalty } from '../types';
import { inspectionPenalty } from '../lib/inspection';

export type TimerPhase = 'idle' | 'inspecting' | 'holding' | 'ready' | 'running';

/** Spread onto the element that works as the click/touch timer pad. */
export interface TimerPadHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
}

/** A finished solve: its time and the penalty earned during inspection. */
export interface SolveResult {
  elapsedMs: number;
  penalty: Penalty;
}

export interface TimerState {
  phase: TimerPhase;
  /** Live elapsed ms while running; final time after a stop; last shown value when idle. */
  displayMs: number;
  /** Live ms since the inspection began; null outside an inspection (also while holding during one). */
  inspectionMs: number | null;
  padHandlers: TimerPadHandlers;
  /** Abandons the current inspection without recording anything. */
  cancelInspection: () => void;
}

const HOLD_TO_READY_MS = 300;

/** What started the current hold: the space bar, or a pointer by its pointerId. */
type HoldSource = 'key' | number;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Swallows the click that follows the press which stopped the timer, so the
 * tap doesn't also hit whatever is under the finger. The next press ends the
 * suppression in case that click never comes.
 */
function suppressNextClick(): void {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  };
  const cleanup = () => {
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', cleanup, true);
  };
  window.addEventListener('click', swallow, true);
  window.addEventListener('pointerdown', cleanup, true);
}

/**
 * csTimer-style timer: hold Space — or press and hold the timer pad — until
 * ready (green), release to start; press Space or tap/click anywhere to stop.
 * With `inspection` on, a tap of Space or of the pad first starts the WCA
 * 15-second inspection; the hold-and-release then starts the solve, which
 * gets +2 or DNF when started late (Escape abandons the inspection).
 * `onStop` receives the solve. Disabled entirely while `enabled` is false
 * (e.g. a dialog is open).
 */
export function useTimer(enabled: boolean, inspection: boolean, onStop: (result: SolveResult) => void): TimerState {
  const [phase, setPhase] = useState<TimerPhase>('idle');
  const [displayMs, setDisplayMs] = useState(0);
  const [inspectionMs, setInspectionMs] = useState<number | null>(null);

  const phaseRef = useRef<TimerPhase>('idle');
  const holdSourceRef = useRef<HoldSource | null>(null);
  const startedAtRef = useRef(0);
  const inspectionStartedAtRef = useRef<number | null>(null);
  /** The penalty earned in the inspection of the solve now running. */
  const penaltyRef = useRef<Penalty>('none');
  /** A Space press / pad press that began in idle and will start the inspection when released. */
  const pendingInspectionRef = useRef<HoldSource | null>(null);
  const holdTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const inspectionRef = useRef(inspection);
  inspectionRef.current = inspection;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const setPhaseBoth = useCallback((next: TimerPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  const stopRafLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Drives the live display of whichever is going on: the inspection countdown or the running solve. */
  const startRafLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      const now = performance.now();
      if (phaseRef.current === 'running') setDisplayMs(now - startedAtRef.current);
      else if (inspectionStartedAtRef.current !== null) setInspectionMs(now - inspectionStartedAtRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const beginHold = useCallback(
    (source: HoldSource) => {
      holdSourceRef.current = source;
      setPhaseBoth('holding');
      holdTimeoutRef.current = window.setTimeout(() => {
        holdTimeoutRef.current = null;
        if (phaseRef.current === 'holding') setPhaseBoth('ready');
      }, HOLD_TO_READY_MS);
    },
    [setPhaseBoth],
  );

  /** Ends a hold that did not start the solve: back to the inspection, or to idle. */
  const cancelHold = useCallback(() => {
    holdSourceRef.current = null;
    clearHoldTimeout();
    if (phaseRef.current === 'holding' || phaseRef.current === 'ready') {
      setPhaseBoth(inspectionStartedAtRef.current !== null ? 'inspecting' : 'idle');
    }
  }, [clearHoldTimeout, setPhaseBoth]);

  const startInspection = useCallback(() => {
    inspectionStartedAtRef.current = performance.now();
    setInspectionMs(0);
    setPhaseBoth('inspecting');
    startRafLoop();
  }, [setPhaseBoth, startRafLoop]);

  const cancelInspection = useCallback(() => {
    pendingInspectionRef.current = null;
    if (inspectionStartedAtRef.current === null) return;
    inspectionStartedAtRef.current = null;
    holdSourceRef.current = null;
    clearHoldTimeout();
    stopRafLoop();
    setInspectionMs(null);
    setPhaseBoth('idle');
  }, [clearHoldTimeout, stopRafLoop, setPhaseBoth]);

  /** Ends a hold: starts the timer when it was held long enough, otherwise cancels it. */
  const releaseHold = useCallback(() => {
    if (phaseRef.current !== 'ready') {
      cancelHold();
      return;
    }
    holdSourceRef.current = null;
    const now = performance.now();
    const inspectedMs = inspectionStartedAtRef.current === null ? null : now - inspectionStartedAtRef.current;
    penaltyRef.current = inspectedMs === null ? 'none' : inspectionPenalty(inspectedMs);
    inspectionStartedAtRef.current = null;
    setInspectionMs(null);
    startedAtRef.current = now;
    setDisplayMs(0);
    setPhaseBoth('running');
    startRafLoop();
  }, [cancelHold, setPhaseBoth, startRafLoop]);

  const stop = useCallback(() => {
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    stopRafLoop();
    setDisplayMs(elapsed);
    setPhaseBoth('idle');
    const penalty = penaltyRef.current;
    penaltyRef.current = 'none';
    onStopRef.current({ elapsedMs: elapsed, penalty });
  }, [stopRafLoop, setPhaseBoth]);

  useEffect(() => {
    if (!enabled) {
      // Cancel a pending hold or inspection, but let a running solve keep running.
      cancelHold();
      cancelInspection();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectionStartedAtRef.current !== null) {
        e.preventDefault();
        cancelInspection();
        return;
      }
      if (e.code !== 'Space' || e.repeat) return;
      if (phaseRef.current !== 'running' && isTypingTarget(e.target)) return;
      e.preventDefault();

      if (phaseRef.current === 'running') stop();
      else if (phaseRef.current === 'idle' && inspectionRef.current) pendingInspectionRef.current = 'key';
      else if (phaseRef.current === 'idle' || phaseRef.current === 'inspecting') beginHold('key');
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (pendingInspectionRef.current === 'key') {
        e.preventDefault();
        pendingInspectionRef.current = null;
        if (phaseRef.current === 'idle') startInspection();
        return;
      }
      if (holdSourceRef.current !== 'key') return;
      e.preventDefault();
      releaseHold();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, cancelHold, cancelInspection, beginHold, releaseHold, startInspection, stop]);

  // Turning inspection off mid-inspection abandons it.
  useEffect(() => {
    if (!inspection) cancelInspection();
  }, [inspection, cancelInspection]);

  // While running, any press anywhere stops the timer — the whole screen is the stop button.
  useEffect(() => {
    if (!enabled || phase !== 'running') return;
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      stop();
      suppressNextClick();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [enabled, phase, stop]);

  useEffect(() => () => {
    clearHoldTimeout();
    stopRafLoop();
  }, [clearHoldTimeout, stopRafLoop]);

  const padHandlers = useMemo<TimerPadHandlers>(
    () => ({
      onPointerDown: (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        if (!enabledRef.current) return;
        if (phaseRef.current !== 'idle' && phaseRef.current !== 'inspecting') return;
        // Leave any text field, so its on-screen keyboard closes and Space works afterwards.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (phaseRef.current === 'idle' && inspectionRef.current) pendingInspectionRef.current = e.pointerId;
        else beginHold(e.pointerId);
      },
      onPointerUp: (e) => {
        if (pendingInspectionRef.current === e.pointerId) {
          pendingInspectionRef.current = null;
          if (phaseRef.current === 'idle') startInspection();
          return;
        }
        if (holdSourceRef.current === e.pointerId) releaseHold();
      },
      onPointerCancel: (e) => {
        if (pendingInspectionRef.current === e.pointerId) pendingInspectionRef.current = null;
        if (holdSourceRef.current === e.pointerId) cancelHold();
      },
      // A long press would otherwise open the context menu on touch screens.
      onContextMenu: (e) => e.preventDefault(),
    }),
    [beginHold, releaseHold, cancelHold, startInspection],
  );

  return { phase, displayMs, inspectionMs, padHandlers, cancelInspection };
}
