import { describe, expect, it } from 'vitest';
import {
  CORRECT_FOR_LEVEL_UP,
  LEVELS,
  WRONG_FOR_LEVEL_DOWN,
  effectiveTime,
  emptyProgress,
  eventsFromProgress,
  maxLevel,
  modeStats,
  recordResult,
  replay,
  scoreResult,
  toNextLevel,
  toRecord,
  withLevel,
  type DryEvent,
  type ModeProgress,
  type TaskResult,
} from './dryPractice';

const result = (patch: Partial<TaskResult> = {}): TaskResult => ({
  mode: 'hunter',
  level: 1,
  accuracy: 1,
  timeMs: 3000,
  hint: false,
  at: 1,
  ...patch,
});

describe('levels', () => {
  it('get harder', () => {
    expect(LEVELS.tracker.at(-1)!.edges).toBe(4);
    expect(LEVELS.tracker[0]!.edges).toBe(1);
    expect(LEVELS.cross.map((l) => l.optimal)).toEqual([...LEVELS.cross.map((l) => l.optimal)].sort((a, b) => a - b));
    expect(maxLevel('miniCross')).toBe(LEVELS.miniCross.length);
  });

  it('time settings override the level', () => {
    expect(effectiveTime('auto', 15000)).toBe(15000);
    expect(effectiveTime(null, 15000)).toBeNull();
    expect(effectiveTime(60000, 15000)).toBe(60000);
  });
});

describe('scoring', () => {
  it('rewards correct, fast, optimal answers and halves for a hint', () => {
    const slow = scoreResult(result({ timeMs: 60000 }), 0);
    const fast = scoreResult(result({ timeMs: 500 }), 0);
    expect(slow.base).toBe(100);
    expect(slow.speed).toBe(0);
    expect(fast.speed).toBeGreaterThan(40);
    expect(fast.total).toBeGreaterThan(slow.total);
    expect(scoreResult(result({ accuracy: 0 }), 0).total).toBe(0);
    expect(scoreResult(result({ accuracy: 0.5, timeMs: 60000 }), 0).total).toBe(50);
    expect(scoreResult(result({ hint: true, timeMs: 60000 }), 0).total).toBe(50);
    const optimal = scoreResult(result({ mode: 'cross', moves: 6, optimal: 6, timeMs: 60000 }), 0);
    const extra = scoreResult(result({ mode: 'cross', moves: 8, optimal: 6, timeMs: 60000 }), 0);
    expect(optimal.efficiency).toBe(50);
    expect(extra.efficiency).toBe(20);
  });

  it('adds streak and level bonuses', () => {
    const plain = scoreResult(result({ timeMs: 60000 }), 0);
    expect(scoreResult(result({ timeMs: 60000 }), 3).total).toBe(Math.round(plain.total * 1.3));
    expect(scoreResult(result({ timeMs: 60000 }), 50).streakFactor).toBe(1.5);
    expect(scoreResult(result({ timeMs: 60000, level: 3 }), 0).total).toBe(Math.round(plain.total * 1.4));
  });

  it('measures speed against the level limit when there is one', () => {
    expect(scoreResult(result({ timeMs: 2500 }), 0, 5000).speed).toBe(25);
  });
});

describe('progress', () => {
  const run = (results: boolean[], start: ModeProgress = emptyProgress()) =>
    results.reduce((p, correct) => recordResult(p, result({ accuracy: correct ? 1 : 0, level: p.level })).progress, start);

  it('moves up after three correct answers in a row and down after three wrong ones', () => {
    const up = run(Array(CORRECT_FOR_LEVEL_UP).fill(true));
    expect(up.level).toBe(2);
    expect(up.recent).toEqual([]);
    expect(toNextLevel(up)).toBe(CORRECT_FOR_LEVEL_UP);
    const mixed = run([true, false, true, true]);
    expect(mixed.level).toBe(1);
    expect(toNextLevel(mixed)).toBe(1);
    const down = run(Array(WRONG_FOR_LEVEL_DOWN).fill(false), withLevel(emptyProgress(), 'hunter', 3));
    expect(down.level).toBe(2);
    expect(run(Array(WRONG_FOR_LEVEL_DOWN).fill(false)).level).toBe(1);
    expect(run(Array(100).fill(true)).level).toBe(maxLevel('hunter'));
  });

  it('keeps points, streaks, bests and history', () => {
    const first = recordResult(emptyProgress(), result({ timeMs: 4000 }));
    expect(first.correct).toBe(true);
    expect(first.newBest).toEqual({ score: true, time: true });
    expect(first.progress.points).toBe(first.score.total);
    expect(first.progress.streak).toBe(1);
    const second = recordResult(first.progress, result({ timeMs: 2000 }));
    expect(second.progress.streak).toBe(2);
    expect(second.progress.bestTimeMs).toBe(2000);
    expect(second.newBest.time).toBe(true);
    const wrong = recordResult(second.progress, result({ accuracy: 0, timeMs: 1000 }));
    expect(wrong.progress.streak).toBe(0);
    expect(wrong.progress.bestStreak).toBe(2);
    expect(wrong.progress.bestTimeMs).toBe(2000);
    expect(wrong.progress.attempts).toBe(3);
    expect(wrong.progress.correct).toBe(2);
    expect(wrong.progress.history).toHaveLength(3);
    expect(modeStats(wrong.progress)).toEqual({ attempts: 3, accuracy: 2 / 3, recentTimeMs: 3000, recentExtraMoves: null });
  });

  it('counts optimal crosses', () => {
    const p = recordResult(emptyProgress(), result({ mode: 'cross', moves: 5, optimal: 5 })).progress;
    expect(p.optimalCount).toBe(1);
    const q = recordResult(p, result({ mode: 'cross', moves: 7, optimal: 5 })).progress;
    expect(q.optimalCount).toBe(1);
    expect(modeStats(q).recentExtraMoves).toBe(1);
  });
});

describe('replay', () => {
  /** Plays results one after another the way a device does, and returns the events it stores with the progress it shows. */
  const play = (results: TaskResult[], prefix: string) => {
    let progress = emptyProgress();
    const events: DryEvent[] = results.map((r, i) => {
      const outcome = recordResult(progress, r);
      progress = outcome.progress;
      return { kind: 'attempt', id: `${prefix}${i}`, mode: r.mode, record: toRecord(r, outcome.score.total) };
    });
    return { events, progress };
  };

  it('gives the progress the device showed while the results came in', () => {
    const results = [1, 1, 0, 1, 1, 1, 0.5, 1].map((accuracy, i) => result({ accuracy, at: i + 1, timeMs: 2000 + i }));
    const { events, progress } = play(results, 'a');
    expect(replay(events).hunter).toEqual(progress);
    expect(replay([...events].reverse()).hunter).toEqual(progress);
  });

  it('adds up what two devices did apart, the same on both', () => {
    const here = play([result({ at: 10 }), result({ at: 30 }), result({ at: 50 })], 'a').events;
    const there = play([result({ at: 20 }), result({ at: 40, accuracy: 0 })], 'b').events;
    const merged = replay([...here, ...there]).hunter;
    expect(replay([...there, ...here]).hunter).toEqual(merged);
    expect(merged.attempts).toBe(5);
    expect(merged.correct).toBe(4);
    // Points are what each answer earned when it was given.
    expect(merged.points).toBe([...here, ...there].reduce((sum, e) => sum + (e.kind === 'attempt' ? e.record.score : 0), 0));
    // In the combined order the wrong answer at 40 broke the streak.
    expect(merged.streak).toBe(1);
  });

  it('follows a level picked by hand from the moment it was picked', () => {
    const { events } = play([result({ at: 1 }), result({ at: 2 })], 'a');
    const picked: DryEvent = { kind: 'level', id: 'l', mode: 'hunter', at: 3, level: 4 };
    const progress = replay([...events, picked]).hunter;
    expect(progress.level).toBe(4);
    expect(progress.recent).toEqual([]);
    expect(progress.attempts).toBe(2);
  });

  it('carries a progress kept as totals over as its remembered results and its level', () => {
    let progress = withLevel(emptyProgress(), 'tracker', 5);
    for (let i = 0; i < 4; i++) progress = recordResult(progress, result({ mode: 'tracker', level: progress.level, at: 100 + i, accuracy: i === 2 ? 0 : 1 })).progress;
    let n = 0;
    const events = eventsFromProgress({ hunter: emptyProgress(), tracker: progress, miniCross: emptyProgress(), cross: emptyProgress() }, () => `e${n++}`);
    const carried = replay(events);
    expect(carried.tracker.level).toBe(progress.level);
    expect(carried.tracker.points).toBe(progress.points);
    expect(carried.tracker.history).toEqual(progress.history);
    expect(carried.hunter).toEqual(emptyProgress());
  });
});
