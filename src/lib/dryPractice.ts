/**
 * Dry practice ("Sušení"): training the cross inspection without a cube.
 * This module holds what the four modes share: the difficulty levels, the
 * scoring, the adaptive level changes and the per-mode progress that is
 * remembered between sessions. Everything about the cube itself (positions,
 * optimal solutions) is checked with the simulation in `cross.ts`; nothing
 * here knows a position by heart.
 */

export type DryMode = 'hunter' | 'tracker' | 'miniCross' | 'cross';

export const DRY_MODES: readonly DryMode[] = ['hunter', 'tracker', 'miniCross', 'cross'];

/** Edge Hunter: find a named white edge on the scrambled cube. */
export interface HunterLevel {
  /** Only the white edges are in colour; the rest of the cube is grey. */
  edgesOnly: boolean;
  /** Time to find it, or null for no limit. */
  limitMs: number | null;
}

/** Edge Tracker: follow edges through moves on a hidden cube. */
export interface TrackerLevel {
  edges: number;
  moves: number;
  /** Start from a solved cube (easier to picture) instead of a scrambled one. */
  fromSolved: boolean;
  /** Time to memorize the start, or null for no limit. */
  memorizeMs: number | null;
}

/** Mini Cross: solve a few cross edges on a visible cube. */
export interface MiniCrossLevel {
  edges: number;
  /** Optimal length of the position. */
  optimal: number;
}

/** Cross Challenge: plan the whole cross, then enter it blind. */
export interface CrossLevel {
  optimal: number;
  /** Inspection time, or null for unlimited. */
  inspectionMs: number | null;
}

export interface Levels {
  hunter: readonly HunterLevel[];
  tracker: readonly TrackerLevel[];
  miniCross: readonly MiniCrossLevel[];
  cross: readonly CrossLevel[];
}

const s = (seconds: number) => seconds * 1000;

export const LEVELS: Levels = {
  hunter: [
    { edgesOnly: true, limitMs: null },
    { edgesOnly: false, limitMs: null },
    { edgesOnly: false, limitMs: s(8) },
    { edgesOnly: false, limitMs: s(5) },
    { edgesOnly: false, limitMs: s(3) },
  ],
  tracker: [
    { edges: 1, moves: 2, fromSolved: true, memorizeMs: null },
    { edges: 1, moves: 3, fromSolved: true, memorizeMs: null },
    { edges: 1, moves: 3, fromSolved: false, memorizeMs: null },
    { edges: 1, moves: 4, fromSolved: false, memorizeMs: s(15) },
    { edges: 2, moves: 3, fromSolved: false, memorizeMs: s(15) },
    { edges: 2, moves: 4, fromSolved: false, memorizeMs: s(15) },
    { edges: 2, moves: 5, fromSolved: false, memorizeMs: s(10) },
    { edges: 3, moves: 4, fromSolved: false, memorizeMs: s(15) },
    { edges: 3, moves: 5, fromSolved: false, memorizeMs: s(10) },
    { edges: 4, moves: 4, fromSolved: false, memorizeMs: s(15) },
    { edges: 4, moves: 6, fromSolved: false, memorizeMs: s(10) },
  ],
  miniCross: [
    { edges: 1, optimal: 1 },
    { edges: 1, optimal: 2 },
    { edges: 1, optimal: 3 },
    { edges: 2, optimal: 2 },
    { edges: 2, optimal: 3 },
    { edges: 2, optimal: 4 },
    { edges: 3, optimal: 3 },
    { edges: 3, optimal: 4 },
    { edges: 3, optimal: 5 },
  ],
  cross: [
    { optimal: 2, inspectionMs: null },
    { optimal: 3, inspectionMs: null },
    { optimal: 4, inspectionMs: null },
    { optimal: 4, inspectionMs: s(60) },
    { optimal: 5, inspectionMs: s(60) },
    { optimal: 5, inspectionMs: s(30) },
    { optimal: 6, inspectionMs: s(30) },
    { optimal: 6, inspectionMs: s(15) },
    { optimal: 7, inspectionMs: s(15) },
    { optimal: 8, inspectionMs: s(15) },
  ],
};

export function maxLevel(mode: DryMode): number {
  return LEVELS[mode].length;
}

export function clampLevel(mode: DryMode, level: number): number {
  return Math.min(maxLevel(mode), Math.max(1, Math.round(level)));
}

/** The outcome of one task, as the modes report it. */
export interface TaskResult {
  mode: DryMode;
  level: number;
  /** 1 for a fully correct answer, a fraction for a partly correct one, 0 for wrong. */
  accuracy: number;
  /** The time that is scored: finding time, answering time, or the inspection time of a cross. */
  timeMs: number;
  /** For the cross modes: moves used and the optimal count. */
  moves?: number;
  optimal?: number;
  hint: boolean;
  at: number;
}

/** A result as kept in the history, without what the progress already knows. */
export interface TaskRecord {
  at: number;
  level: number;
  accuracy: number;
  timeMs: number;
  score: number;
  moves?: number;
  optimal?: number;
}

export interface ModeProgress {
  level: number;
  points: number;
  attempts: number;
  correct: number;
  /** Consecutive fully correct answers right now. */
  streak: number;
  bestStreak: number;
  /** Results (correct or not) since the level last changed, newest last; drives the adaptive difficulty. */
  recent: boolean[];
  /** Personal bests. */
  bestScore: number | null;
  /** Fastest fully correct answer. */
  bestTimeMs: number | null;
  /** Cross modes: how often the solution had the optimal length. */
  optimalCount: number;
  history: TaskRecord[];
}

export function emptyProgress(): ModeProgress {
  return {
    level: 1,
    points: 0,
    attempts: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    recent: [],
    bestScore: null,
    bestTimeMs: null,
    optimalCount: 0,
    history: [],
  };
}

/** A time setting: 'auto' follows the level, null is unlimited, a number is milliseconds. */
export type TimeSetting = 'auto' | null | number;

export interface DrySettings {
  /** Memorizing time in Edge Tracker. */
  memorize: TimeSetting;
  /** Inspection time in Cross Challenge. */
  inspection: TimeSetting;
}

export interface DryPracticeData {
  modes: Record<DryMode, ModeProgress>;
  settings: DrySettings;
}

export function emptyDryPractice(): DryPracticeData {
  return {
    modes: { hunter: emptyProgress(), tracker: emptyProgress(), miniCross: emptyProgress(), cross: emptyProgress() },
    settings: { memorize: 'auto', inspection: 'auto' },
  };
}

/** The effective time limit: the user's setting, or the level's when set to 'auto'. */
export function effectiveTime(setting: TimeSetting, levelMs: number | null): number | null {
  return setting === 'auto' ? levelMs : setting;
}

/** Below this time (or the level's limit) the speed bonus is at its highest. */
const SPEED_REFERENCE_MS: Record<DryMode, number> = { hunter: 6000, tracker: 20000, miniCross: 30000, cross: 30000 };

export const CORRECT_FOR_LEVEL_UP = 3;
export const WRONG_FOR_LEVEL_DOWN = 3;
export const STREAK_BONUS_CAP = 5;
export const HISTORY_LENGTH = 100;

export function isCorrect(result: Pick<TaskResult, 'accuracy'>): boolean {
  return result.accuracy >= 1;
}

export interface ScoreParts {
  base: number;
  speed: number;
  efficiency: number;
  /** Multiplier for the streak before this result, e.g. 1.3. */
  streakFactor: number;
  levelFactor: number;
  hintFactor: number;
  total: number;
}

/**
 * Points for one result. The base is 100 for a correct answer (less for a
 * partly correct one); a fast answer adds up to 50, an optimal cross adds 50
 * (15 less for every extra move); a hint halves it; the streak before this
 * result and the level each add a percentage.
 */
export function scoreResult(result: TaskResult, streak: number, limitMs: number | null = null): ScoreParts {
  const base = Math.round(100 * Math.max(0, Math.min(1, result.accuracy)));
  const reference = limitMs ?? SPEED_REFERENCE_MS[result.mode];
  const speed = base > 0 ? Math.round(50 * Math.max(0, Math.min(1, 1 - result.timeMs / reference))) : 0;
  const efficiency =
    isCorrect(result) && result.moves !== undefined && result.optimal !== undefined
      ? Math.max(0, 50 - 15 * Math.max(0, result.moves - result.optimal))
      : 0;
  const streakFactor = 1 + Math.min(STREAK_BONUS_CAP, Math.max(0, streak)) * 0.1;
  const levelFactor = 1 + 0.2 * (result.level - 1);
  const hintFactor = result.hint ? 0.5 : 1;
  const total = Math.round((base + speed + efficiency) * streakFactor * levelFactor * hintFactor);
  return { base, speed, efficiency, streakFactor, levelFactor, hintFactor, total };
}

export interface Outcome {
  progress: ModeProgress;
  score: ScoreParts;
  /** +1 when the level went up, -1 when it went down. */
  levelChange: -1 | 0 | 1;
  /** Which personal bests this result set. */
  newBest: { score: boolean; time: boolean };
  correct: boolean;
}

function tail<T>(items: readonly T[], n: number): T[] {
  return items.slice(Math.max(0, items.length - n));
}

/**
 * The progress after one more scored record: points, streak, bests, history
 * and the adaptive level. `recordResult` uses it for a fresh result and
 * `replay` for every stored one, so both always agree.
 */
function advance(progress: ModeProgress, mode: DryMode, record: TaskRecord): Omit<Outcome, 'score'> {
  const correct = isCorrect(record);
  const streak = correct ? progress.streak + 1 : 0;
  const recent = [...progress.recent, correct];
  let level = progress.level;
  let levelChange: -1 | 0 | 1 = 0;
  const maximum = maxLevel(mode);
  if (recent.length >= CORRECT_FOR_LEVEL_UP && tail(recent, CORRECT_FOR_LEVEL_UP).every(Boolean) && level < maximum) {
    level++;
    levelChange = 1;
  } else if (recent.length >= WRONG_FOR_LEVEL_DOWN && tail(recent, WRONG_FOR_LEVEL_DOWN).every((r) => !r) && level > 1) {
    level--;
    levelChange = -1;
  }
  const newBest = {
    score: record.score > 0 && (progress.bestScore === null || record.score > progress.bestScore),
    time: correct && (progress.bestTimeMs === null || record.timeMs < progress.bestTimeMs),
  };
  return {
    progress: {
      level,
      points: progress.points + record.score,
      attempts: progress.attempts + 1,
      correct: progress.correct + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(progress.bestStreak, streak),
      recent: levelChange === 0 ? tail(recent, Math.max(CORRECT_FOR_LEVEL_UP, WRONG_FOR_LEVEL_DOWN)) : [],
      bestScore: newBest.score ? record.score : progress.bestScore,
      bestTimeMs: newBest.time ? record.timeMs : progress.bestTimeMs,
      optimalCount: progress.optimalCount + (correct && record.moves !== undefined && record.moves === record.optimal ? 1 : 0),
      history: tail([...progress.history, record], HISTORY_LENGTH),
    },
    levelChange,
    newBest,
    correct,
  };
}

/** A result as it is kept: scored with the streak before it, without what the progress already knows. */
export function toRecord(result: TaskResult, score: number): TaskRecord {
  const record: TaskRecord = { at: result.at, level: result.level, accuracy: result.accuracy, timeMs: result.timeMs, score };
  if (result.moves !== undefined) record.moves = result.moves;
  if (result.optimal !== undefined) record.optimal = result.optimal;
  return record;
}

/** The progress after a result: points, streak, bests, history and the adaptive level. */
export function recordResult(progress: ModeProgress, result: TaskResult, limitMs: number | null = null): Outcome {
  const score = scoreResult(result, progress.streak, limitMs);
  return { ...advance(progress, result.mode, toRecord(result, score.total)), score };
}

/**
 * What happened in a mode, as it is stored: an answered task with the points
 * it earned, or a level picked by hand. Events are never changed once made;
 * the progress is what replaying them gives.
 */
export type DryEvent =
  | { kind: 'attempt'; id: string; mode: DryMode; record: TaskRecord }
  | { kind: 'level'; id: string; mode: DryMode; at: number; level: number };

export function eventTime(event: DryEvent): number {
  return event.kind === 'attempt' ? event.record.at : event.at;
}

/**
 * The progress of every mode after all `events`, taken in the order they
 * happened. Two devices that trained apart get the same progress once they
 * have each other's events: points add up, and streaks and levels follow from
 * the combined order.
 */
export function replay(events: readonly DryEvent[]): Record<DryMode, ModeProgress> {
  const modes = emptyDryPractice().modes;
  const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const event of ordered) {
    modes[event.mode] =
      event.kind === 'attempt' ? advance(modes[event.mode], event.mode, event.record).progress : withLevel(modes[event.mode], event.mode, event.level);
  }
  return modes;
}

/**
 * Events that replay to (about) a progress kept the old way, as totals: its
 * remembered results, then its level. Totals from before the remembered
 * results (the history holds the last hundred) are not carried over.
 */
export function eventsFromProgress(modes: Record<DryMode, ModeProgress>, makeId: () => string): DryEvent[] {
  const events: DryEvent[] = [];
  for (const mode of DRY_MODES) {
    const progress = modes[mode];
    for (const record of progress.history) events.push({ kind: 'attempt', id: makeId(), mode, record });
    if (progress.level > 1 || progress.history.length > 0) {
      const after = progress.history.reduce((latest, record) => Math.max(latest, record.at), 0) + 1;
      events.push({ kind: 'level', id: makeId(), mode, at: after, level: progress.level });
    }
  }
  return events;
}

/** The progress with the level picked by hand; the adaptive counter starts over. */
export function withLevel(progress: ModeProgress, mode: DryMode, level: number): ModeProgress {
  return { ...progress, level: clampLevel(mode, level), recent: [] };
}

/** How many correct answers in a row at this level are still needed to move up. */
export function toNextLevel(progress: ModeProgress): number {
  let run = 0;
  for (let i = progress.recent.length - 1; i >= 0 && progress.recent[i]; i--) run++;
  return Math.max(0, CORRECT_FOR_LEVEL_UP - run);
}

export interface ModeStats {
  attempts: number;
  /** 0..1, or null without attempts. */
  accuracy: number | null;
  /** Mean scored time of the last ten correct answers. */
  recentTimeMs: number | null;
  /** Mean of extra moves over the optimum in the last ten solved crosses. */
  recentExtraMoves: number | null;
}

export function modeStats(progress: ModeProgress): ModeStats {
  const correct = progress.history.filter((r) => r.accuracy >= 1);
  const recentCorrect = tail(correct, 10);
  const crosses = recentCorrect.filter((r) => r.moves !== undefined && r.optimal !== undefined);
  const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
  return {
    attempts: progress.attempts,
    accuracy: progress.attempts === 0 ? null : progress.correct / progress.attempts,
    recentTimeMs: mean(recentCorrect.map((r) => r.timeMs)),
    recentExtraMoves: mean(crosses.map((r) => r.moves! - r.optimal!)),
  };
}

/** Points over every mode. */
export function totalPoints(data: DryPracticeData): number {
  return DRY_MODES.reduce((sum, mode) => sum + data.modes[mode].points, 0);
}
