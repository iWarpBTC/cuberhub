import { useMemo } from 'react';
import type { Solve } from '../types';
import { computeStats } from '../lib/stats';
import { formatStat } from '../lib/format';
import { useLanguage } from '../i18n/LanguageContext';

/** Repeat statistics of one scramble; `solves` must be in chronological order (oldest first). */
export function StatsPanel({ solves }: { solves: Solve[] }) {
  const { t } = useLanguage();
  const stats = useMemo(() => computeStats(solves), [solves]);

  const items: Array<[string, string]> = [
    [t.stats.solves, String(stats.count)],
    [t.stats.best, formatStat(stats.best)],
    [t.stats.worst, formatStat(stats.worst)],
    [t.stats.average, formatStat(stats.mean)],
    [t.stats.median, formatStat(stats.median)],
    [t.stats.stdDev, formatStat(stats.stdDev)],
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
          <div className="mt-0.5 font-mono text-sm text-neutral-100">{value}</div>
        </div>
      ))}
    </div>
  );
}
