import type { Penalty } from '../types';

/** WCA inspection lasts 15 seconds (regulation A3). */
export const INSPECTION_MS = 15000;
/** A solve started within 2 seconds after inspection ends gets +2; later than that it is a DNF (A4d). */
export const INSPECTION_PLUS2_MS = 17000;

/** The penalty a solve gets for starting `elapsedMs` into its inspection. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs > INSPECTION_PLUS2_MS) return 'dnf';
  if (elapsedMs > INSPECTION_MS) return 'plus2';
  return 'none';
}

/**
 * The stage of an inspection for colouring: the judge calls "8 seconds" and
 * "12 seconds" (A3d1), then the penalty windows.
 */
export type InspectionStage = 'early' | 'eight' | 'twelve' | 'plus2' | 'dnf';

export function inspectionStage(elapsedMs: number): InspectionStage {
  const penalty = inspectionPenalty(elapsedMs);
  if (penalty !== 'none') return penalty;
  if (elapsedMs >= 12000) return 'twelve';
  if (elapsedMs >= 8000) return 'eight';
  return 'early';
}

/** What the timer shows during inspection: whole seconds left, then "+2", then "DNF". */
export function formatInspection(elapsedMs: number): string {
  const penalty = inspectionPenalty(elapsedMs);
  if (penalty === 'dnf') return 'DNF';
  if (penalty === 'plus2') return '+2';
  return String(Math.max(1, Math.ceil((INSPECTION_MS - elapsedMs) / 1000)));
}
