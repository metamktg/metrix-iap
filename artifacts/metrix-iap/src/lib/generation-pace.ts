// ─── Telling a working run from a dead one (BUG-42) ───────────────────
//
// A generation run spends the bulk of its wall clock inside ONE model
// call, and the engine writes no progress during it: strategy goes 10%
// "Calling strategy model…" straight to 60% "Persisting pillars…". So a
// perfectly healthy four-minute run and a run whose process died look
// IDENTICAL — a bar frozen at 10% with a spinner.
//
// Both bug reports on 2026-08-25 were exactly this. In one the run was
// genuinely wedged; in the other it was working and finished normally.
// The operator read the same screen both times and could not have
// distinguished them, because the screen carries no information that
// separates the two.
//
// Elapsed time separates them. It always moves when the client is alive,
// and stated against a typical duration it answers the only question
// being asked: is this stuck, or is it just slow?

/** "45s", "3m 12s" — compact, stable width, no false precision. */
export function fmtElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/**
 * A sentence that stays true in both directions.
 *
 * Under the typical duration it explains the frozen bar, because that is
 * the moment the screen misleads. Past it, it says so plainly rather than
 * keeping up a reassurance that has stopped being accurate — a run that
 * is genuinely overrunning should read as overrunning.
 */
export function pacePhrase(elapsedSeconds: number, typicalSeconds: number): string {
  const typicalMin = Math.max(1, Math.round(typicalSeconds / 60));
  const typical = `about ${typicalMin}–${typicalMin + 1} min`;
  return elapsedSeconds > typicalSeconds
    ? `Longer than the usual ${typical} — still running.`
    : `The bar holds while the model runs. Usually ${typical}.`;
}
