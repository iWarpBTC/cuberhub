import type { Penalty } from '../types';

export interface TimedAttempt {
  timeMs: number;
  penalty: Penalty;
}

/** Result time in ms with penalty applied, or null for a DNF. */
export function effectiveMs(attempt: TimedAttempt): number | null {
  if (attempt.penalty === 'dnf') return null;
  return attempt.penalty === 'plus2' ? attempt.timeMs + 2000 : attempt.timeMs;
}

/** An average result: a time, DNF (too many DNF solves), or null (not enough solves). */
export type AverageResult = number | 'dnf' | null;

export interface ScrambleStats {
  count: number;
  best: number | null;
  worst: number | null;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
}

function validTimes(attempts: readonly TimedAttempt[]): number[] {
  return attempts.map(effectiveMs).filter((t): t is number => t !== null);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Sample standard deviation; null with fewer than 2 values. */
export function stdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * WCA trimmed average of the last n attempts (chronological input order):
 * drop the single best and single worst, average the rest. A DNF counts as
 * the worst attempt; two or more DNFs make the average itself a DNF.
 * Returns null when fewer than n attempts exist.
 */
export function averageOfN(attempts: readonly TimedAttempt[], n: number): AverageResult {
  if (attempts.length < n) return null;
  const window = attempts.slice(-n).map(effectiveMs);
  const dnfCount = window.filter((t) => t === null).length;
  if (dnfCount >= 2) return 'dnf';
  const sorted = [...window].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  const kept = sorted.slice(1, n - 1) as number[];
  return mean(kept);
}

/**
 * WCA mean of the last n attempts: the plain mean, DNF as soon as any
 * attempt is a DNF. Returns null when fewer than n attempts exist.
 */
export function meanOfN(attempts: readonly TimedAttempt[], n: number): AverageResult {
  if (attempts.length < n) return null;
  const window = attempts.slice(-n).map(effectiveMs);
  if (window.some((t) => t === null)) return 'dnf';
  return mean(window as number[]);
}

/**
 * The competition result of a whole round of `attempts`: a trimmed average
 * (Ao5, Ao12, …) from five attempts up, a plain mean (Mo3, …) below that.
 */
export function roundAverage(attempts: readonly TimedAttempt[]): AverageResult {
  const n = attempts.length;
  if (n === 0) return null;
  return n >= 5 ? averageOfN(attempts, n) : meanOfN(attempts, n);
}

/** "Ao5" / "Ao12" for five attempts and more, "Mo3" below that. */
export function averageLabel(size: number): string {
  return size >= 5 ? `Ao${size}` : `Mo${size}`;
}

/** All statistics for one scramble's attempts, in chronological order. */
export function computeStats(attempts: readonly TimedAttempt[]): ScrambleStats {
  const times = validTimes(attempts);
  return {
    count: attempts.length,
    best: times.length > 0 ? Math.min(...times) : null,
    worst: times.length > 0 ? Math.max(...times) : null,
    mean: mean(times),
    median: median(times),
    stdDev: stdDev(times),
  };
}

/** One round of a set: the k-th solve of every scramble, null where it is still missing. */
export interface SetRound {
  /** 1-based round number. */
  index: number;
  attempts: Array<TimedAttempt | null>;
  complete: boolean;
  /** The round's Ao/Mo result; null while the round is incomplete. */
  average: AverageResult;
}

export interface SetStats {
  /** Number of scrambles in the set. */
  size: number;
  /** Every started round, oldest first. */
  rounds: SetRound[];
  completedRounds: number;
  /** The round the next solve belongs to: the first one some scramble has no solve in yet. */
  currentRound: number;
  /** Best result of a complete round; a time beats a DNF. */
  bestAverage: AverageResult;
  /** Result of the most recent complete round. */
  lastAverage: AverageResult;
  bestSingle: number | null;
  solveCount: number;
}

/** Whether `a` is a better average than `b` (a time beats a DNF, nothing beats null). */
function betterAverage(a: AverageResult, b: AverageResult): boolean {
  if (a === null) return false;
  if (b === null) return true;
  if (a === 'dnf') return false;
  return b === 'dnf' || a < b;
}

/**
 * Statistics of a set, from each scramble's attempts in chronological order
 * (in the set's scramble order). Round k pairs the k-th attempt of every
 * scramble, as in a competition where each scramble is solved once per round.
 */
export function computeSetStats(attemptsPerScramble: readonly (readonly TimedAttempt[])[]): SetStats {
  const size = attemptsPerScramble.length;
  const counts = attemptsPerScramble.map((a) => a.length);
  const roundCount = size === 0 ? 0 : Math.max(...counts);
  const rounds: SetRound[] = [];
  for (let k = 0; k < roundCount; k++) {
    const attempts = attemptsPerScramble.map((a) => a[k] ?? null);
    const complete = attempts.every((a) => a !== null);
    rounds.push({
      index: k + 1,
      attempts,
      complete,
      average: complete ? roundAverage(attempts as TimedAttempt[]) : null,
    });
  }
  const completed = rounds.filter((r) => r.complete);
  const all = attemptsPerScramble.flat();
  const times = validTimes(all);
  return {
    size,
    rounds,
    completedRounds: completed.length,
    currentRound: (size === 0 ? 0 : Math.min(...counts)) + 1,
    bestAverage: completed.reduce<AverageResult>((best, r) => (betterAverage(r.average, best) ? r.average : best), null),
    lastAverage: completed.at(-1)?.average ?? null,
    bestSingle: times.length > 0 ? Math.min(...times) : null,
    solveCount: all.length,
  };
}
