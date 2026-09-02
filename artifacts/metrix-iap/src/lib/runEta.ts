// ─── Honest run timing ─────────────────────────────────────────────────
// A progress surface may say how long something has taken (measured) and,
// once at least one unit has finished, how long the rest will take at the
// measured rate. It never invents a percentage or a countdown before there
// is a measurement to base it on.

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

/**
 * Remaining time from the measured rate, or null before the first unit is
 * done. `done` and `total` are units (files, rows); `elapsedSeconds` is
 * measured from the run's start.
 */
function estimateRemainingSeconds(done: number, total: number, elapsedSeconds: number): number | null {
  if (done <= 0 || total <= 0 || elapsedSeconds <= 0) return null;
  const perUnit = elapsedSeconds / done;
  return Math.max(0, Math.round(perUnit * Math.max(0, total - done)));
}

/** "about 2m 10s left" / "wrapping up" / null before a rate exists. */
export function remainingLabel(done: number, total: number, elapsedSeconds: number): string | null {
  const rem = estimateRemainingSeconds(done, total, elapsedSeconds);
  if (rem === null) return null;
  if (rem <= 5) return "wrapping up";
  return `about ${fmtDuration(rem)} left`;
}
