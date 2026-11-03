import { describe, expect, it } from 'vitest';
import type { Penalty } from '../types';
import {
  averageLabel,
  averageOfN,
  computeSetStats,
  computeStats,
  effectiveMs,
  mean,
  meanOfN,
  median,
  roundAverage,
  stdDev,
} from './stats';
import { formatResult } from './format';

function attempt(timeMs: number, penalty: Penalty = 'none', inspectionPenalty?: Penalty) {
  return { timeMs, penalty, inspectionPenalty };
}

describe('effectiveMs', () => {
  it('returns raw time without penalty', () => {
    expect(effectiveMs(attempt(10000))).toBe(10000);
  });
  it('adds 2000ms for +2', () => {
    expect(effectiveMs(attempt(10000, 'plus2'))).toBe(12000);
  });
  it('returns null for DNF', () => {
    expect(effectiveMs(attempt(10000, 'dnf'))).toBeNull();
  });
  it('adds an inspection +2 on its own', () => {
    expect(effectiveMs(attempt(10000, 'none', 'plus2'))).toBe(12000);
  });
  it('stacks an inspection +2 with a solve +2 (A4d1 + 10e2)', () => {
    expect(effectiveMs(attempt(10000, 'plus2', 'plus2'))).toBe(14000);
  });
  it('returns null for an inspection DNF whatever the solve penalty', () => {
    expect(effectiveMs(attempt(10000, 'none', 'dnf'))).toBeNull();
    expect(effectiveMs(attempt(10000, 'plus2', 'dnf'))).toBeNull();
  });
});

describe('formatResult', () => {
  it('marks any +2 with a plus sign and shows DNF', () => {
    expect(formatResult(attempt(10000))).toBe('10.00');
    expect(formatResult(attempt(10000, 'plus2'))).toBe('12.00+');
    expect(formatResult(attempt(10000, 'plus2', 'plus2'))).toBe('14.00+');
    expect(formatResult(attempt(10000, 'none', 'dnf'))).toBe('DNF');
  });
});

describe('mean / median / stdDev', () => {
  it('handles empty input', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(stdDev([])).toBeNull();
    expect(stdDev([5])).toBeNull();
  });
  it('computes mean', () => {
    expect(mean([1000, 2000, 3000])).toBe(2000);
  });
  it('computes median for odd and even counts', () => {
    expect(median([3000, 1000, 2000])).toBe(2000);
    expect(median([1000, 2000, 3000, 4000])).toBe(2500);
  });
  it('computes sample standard deviation', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});

describe('averageOfN (WCA)', () => {
  it('returns null with fewer than n attempts', () => {
    expect(averageOfN([attempt(1000)], 5)).toBeNull();
  });

  it('trims best and worst', () => {
    const attempts = [10000, 11000, 12000, 13000, 50000].map((t) => attempt(t));
    expect(averageOfN(attempts, 5)).toBe(12000); // (11000+12000+13000)/3
  });

  it('counts a single DNF as the worst attempt', () => {
    const attempts = [
      attempt(10000),
      attempt(11000),
      attempt(12000),
      attempt(13000),
      attempt(9000, 'dnf'),
    ];
    expect(averageOfN(attempts, 5)).toBe(12000); // trims 10000 (best) and DNF (worst)
  });

  it('is DNF with two or more DNFs', () => {
    const attempts = [
      attempt(10000),
      attempt(11000),
      attempt(12000),
      attempt(13000, 'dnf'),
      attempt(9000, 'dnf'),
    ];
    expect(averageOfN(attempts, 5)).toBe('dnf');
  });

  it('applies +2 before averaging', () => {
    const attempts = [10000, 11000, 12000, 13000, 14000].map((t) => attempt(t));
    attempts[2] = attempt(12000, 'plus2'); // becomes 14000
    expect(averageOfN(attempts, 5)).toBeCloseTo((11000 + 13000 + 14000) / 3, 6);
  });

  it('uses only the last n attempts', () => {
    const old = [attempt(1000), attempt(1000)];
    const recent = [10000, 11000, 12000, 13000, 14000].map((t) => attempt(t));
    expect(averageOfN([...old, ...recent], 5)).toBe(12000);
  });
});

describe('computeStats', () => {
  it('handles no attempts', () => {
    const stats = computeStats([]);
    expect(stats.count).toBe(0);
    expect(stats.best).toBeNull();
    expect(stats.worst).toBeNull();
    expect(stats.mean).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.stdDev).toBeNull();
  });

  it('ignores DNFs for best/worst/mean but counts them in count', () => {
    const stats = computeStats([attempt(10000), attempt(20000), attempt(5000, 'dnf')]);
    expect(stats.count).toBe(3);
    expect(stats.best).toBe(10000);
    expect(stats.worst).toBe(20000);
    expect(stats.mean).toBe(15000);
  });

  it('includes +2 in best/worst', () => {
    const stats = computeStats([attempt(10000, 'plus2'), attempt(11000)]);
    expect(stats.best).toBe(11000);
    expect(stats.worst).toBe(12000);
  });

  it('all-DNF gives null aggregates', () => {
    const stats = computeStats([attempt(10000, 'dnf'), attempt(11000, 'dnf')]);
    expect(stats.count).toBe(2);
    expect(stats.best).toBeNull();
    expect(stats.mean).toBeNull();
  });
});

describe('meanOfN / roundAverage / averageLabel', () => {
  it('meanOfN is the plain mean and DNF on any DNF', () => {
    expect(meanOfN([attempt(1000), attempt(2000), attempt(3000)], 3)).toBe(2000);
    expect(meanOfN([attempt(1000), attempt(2000), attempt(3000, 'dnf')], 3)).toBe('dnf');
    expect(meanOfN([attempt(1000)], 3)).toBeNull();
  });

  it('roundAverage trims from five attempts up and means below', () => {
    const five = [10000, 11000, 12000, 13000, 50000].map((t) => attempt(t));
    expect(roundAverage(five)).toBe(12000);
    expect(roundAverage([attempt(1000), attempt(2000), attempt(6000)])).toBe(3000);
    expect(roundAverage([attempt(1000), attempt(2000), attempt(6000, 'dnf')])).toBe('dnf');
    expect(roundAverage([])).toBeNull();
  });

  it('labels averages the WCA way', () => {
    expect(averageLabel(5)).toBe('Ao5');
    expect(averageLabel(12)).toBe('Ao12');
    expect(averageLabel(3)).toBe('Mo3');
  });
});

describe('computeSetStats', () => {
  it('handles an empty set and a set without solves', () => {
    const empty = computeSetStats([]);
    expect(empty.size).toBe(0);
    expect(empty.rounds).toEqual([]);
    expect(empty.currentRound).toBe(1);
    expect(empty.bestAverage).toBeNull();

    const fresh = computeSetStats([[], [], [], [], []]);
    expect(fresh.size).toBe(5);
    expect(fresh.rounds).toEqual([]);
    expect(fresh.completedRounds).toBe(0);
    expect(fresh.currentRound).toBe(1);
    expect(fresh.solveCount).toBe(0);
  });

  it('pairs the k-th solve of every scramble into round k', () => {
    const stats = computeSetStats([
      [attempt(10000), attempt(20000)],
      [attempt(11000), attempt(21000)],
      [attempt(12000)],
      [attempt(13000)],
      [attempt(50000)],
    ]);
    expect(stats.rounds).toHaveLength(2);
    expect(stats.rounds[0]!.complete).toBe(true);
    expect(stats.rounds[0]!.average).toBe(12000);
    expect(stats.rounds[1]!.complete).toBe(false);
    expect(stats.rounds[1]!.average).toBeNull();
    expect(stats.rounds[1]!.attempts.map((a) => a?.timeMs ?? null)).toEqual([20000, 21000, null, null, null]);
    expect(stats.completedRounds).toBe(1);
    expect(stats.currentRound).toBe(2);
    expect(stats.lastAverage).toBe(12000);
    expect(stats.bestSingle).toBe(10000);
    expect(stats.solveCount).toBe(7);
  });

  it('moves to the next round once every scramble has a solve in the current one', () => {
    const stats = computeSetStats([[attempt(1000)], [attempt(1000)], [attempt(1000)]]);
    expect(stats.currentRound).toBe(2);
  });

  it('picks the best complete round, a time beating a DNF', () => {
    const round = (t: number, penalty: Penalty = 'none') => [attempt(t, penalty), attempt(t, penalty)];
    const stats = computeSetStats([
      [...round(20000), ...round(10000), ...round(30000, 'dnf')],
      [...round(20000), ...round(10000), ...round(30000, 'dnf')],
      [...round(20000), ...round(10000), ...round(30000)],
      [...round(20000), ...round(10000), ...round(30000)],
      [...round(20000), ...round(10000), ...round(30000)],
    ]);
    expect(stats.rounds.map((r) => r.average)).toEqual([20000, 20000, 10000, 10000, 'dnf', 'dnf']);
    expect(stats.bestAverage).toBe(10000);
    expect(stats.lastAverage).toBe('dnf');
  });

  it('is DNF for the best average when every complete round is a DNF', () => {
    const dnf = attempt(1000, 'dnf');
    const stats = computeSetStats([[dnf], [dnf], [attempt(1000)], [attempt(1000)], [attempt(1000)]]);
    expect(stats.bestAverage).toBe('dnf');
    expect(stats.bestSingle).toBe(1000);
  });
});
