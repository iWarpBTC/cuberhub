import { effectiveMs, penaltyMs, type AverageResult, type TimedAttempt } from './stats';

/** Formats milliseconds as "SS.cc" or "M:SS.cc", truncated to centiseconds. */
export function formatMs(ms: number): string {
  const cs = Math.floor(ms / 10);
  const centis = cs % 100;
  const totalSeconds = Math.floor(cs / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const secCs = `${seconds}.${String(centis).padStart(2, '0')}`;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}` : secCs;
}

/** Formats a solve result including its penalties: "12.34", "14.34+" (any +2) or "DNF". */
export function formatResult(attempt: TimedAttempt): string {
  const ms = effectiveMs(attempt);
  if (ms === null) return 'DNF';
  return penaltyMs(attempt) > 0 ? `${formatMs(ms)}+` : formatMs(ms);
}

export function formatAverage(result: AverageResult): string {
  if (result === null) return '—';
  if (result === 'dnf') return 'DNF';
  return formatMs(result);
}

export function formatStat(value: number | null): string {
  return value === null ? '—' : formatMs(value);
}

export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
