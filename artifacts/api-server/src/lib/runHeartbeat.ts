// ─── Run liveness heartbeat ───────────────────────────────────────────
//
// Both long-running engines (analysisEngine, generationEngine) reclaim a
// dead 'running' row lazily on read: flip it to 'error' and delete the
// partial outputs it wrote before the process died. That reclaim is
// correct — a half-written strategy must never read as a real one — but
// it was keyed on `started_at`, a timestamp that never advances. The
// rule therefore fired on any run older than the threshold, whether or
// not it was still working, and the delete would race a live writer.
//
// Neither engine can signal liveness through its existing phase writes:
// a generation run spends most of its wall clock inside ONE model call
// (10% → 60% with nothing in between), and an analysis run can spend
// just as long inside a single large parse.
//
// So: an interval that writes `heartbeat_at` while the run is alive.
// It lives in the same process that executes the run, so it stops the
// moment that process dies — which is exactly the condition the reclaim
// is trying to detect. Staleness then means "no sign of life for N
// minutes" instead of "started more than N minutes ago".

import { getSupabase } from "./supabase";
import { logger } from "./logger";

/** How often a live run touches `heartbeat_at`. */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * The longest a run may keep attesting to its own liveness (BUG-41).
 *
 * A heartbeat must attest LIVENESS, not immortality. Without a ceiling, a
 * run wedged inside an un-timed network call keeps beating from its
 * interval — which runs independently of the awaited call — so it never
 * looks stale, is never reclaimed, and holds the account's
 * one-running-run unique index for as long as the process lives. That is
 * strictly worse than the bug the heartbeat was added to fix: before it,
 * such a run was at least reclaimed (wrongly killing slow-but-alive runs,
 * but leaving the account usable).
 *
 * Past this point the beating stops and the ordinary staleness rule takes
 * over, so a wedged run is reclaimed and the account is unblocked.
 *
 * 30 minutes sits above any legitimate run and below "nobody can work".
 * The realistic worst case is ~24 minutes: three model calls (an initial,
 * one budget escalation, one validation repair) at the 8-minute per-call
 * ceiling in generationEngine. The longest run that ever succeeded took
 * 5.44 minutes.
 */
export const MAX_HEARTBEAT_MS = 30 * 60 * 1000;

/** Tables carrying a `heartbeat_at` column (see schema.sql, BUG-39). */
export type HeartbeatTable = "generation_runs" | "manual_analysis_runs";

/**
 * The timestamp a staleness check should measure from: the last sign of
 * life if the run ever emitted one, else when it started.
 *
 * Rows written before `heartbeat_at` existed return `started_at`, which
 * reproduces the old behaviour exactly — correct for those rows, since
 * they are all long finished.
 */
export function lastSignOfLife(row: Record<string, unknown>): number {
  const hb = row["heartbeat_at"];
  const started = row["started_at"];
  const hbMs = hb ? new Date(String(hb)).getTime() : NaN;
  if (Number.isFinite(hbMs)) return hbMs;
  const startedMs = started ? new Date(String(started)).getTime() : NaN;
  // A row with neither a usable heartbeat nor a usable start timestamp
  // must not read as infinitely fresh (that would make a genuinely dead
  // run unreclaimable). Treat it as maximally stale instead.
  return Number.isFinite(startedMs) ? startedMs : 0;
}

/**
 * Start heartbeating for `runId`. Returns a stop function that is safe to
 * call more than once — callers put it in a `finally`, and the success
 * and error paths can both reach it.
 *
 * Every write is guarded on `status = 'running'`, so a heartbeat that
 * loses a race with `finishRun` updates nothing rather than touching a
 * row that has already been resolved. Failures are logged and swallowed:
 * a heartbeat must never abort the work it is monitoring, and missing a
 * beat only risks an early reclaim, never a wrong result.
 */
/** The live heartbeats, so a stage boundary can re-arm one (see touchRunHeartbeat). */
const live = new Map<string, { touch: () => void }>();

/**
 * Re-arm the ceiling of the heartbeat for `runId`: the run just reached a
 * new stage, which is the strongest sign of life there is. Without this a
 * legitimate run longer than MAX_HEARTBEAT_MS (the Pure Path run takes
 * over 30 minutes: 22k ad rows, 150k ledger rows through PostgREST) stopped
 * attesting mid-way and was reclaimed by the next read, its outputs
 * deleted, while it was still writing (2026-09-04, run 8148628c). The
 * ceiling now measures from the LAST PROGRESS WRITE, not from the start:
 * a run that keeps reaching stages is working, one that stops is wedged.
 * A no-op when no heartbeat is running for the id (a reclaimed run's late
 * write, a test without one).
 */
export function touchRunHeartbeat(table: HeartbeatTable, runId: string): void {
  live.get(`${table}:${runId}`)?.touch();
}

export function startRunHeartbeat(table: HeartbeatTable, runId: string): () => void {
  let stopped = false;
  let openedAt = Date.now();
  const key = `${table}:${runId}`;
  live.set(key, { touch: () => { openedAt = Date.now(); } });

  const beat = async (): Promise<void> => {
    if (stopped) return;
    try {
      const { error } = await getSupabase()
        .from(table)
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "running");
      if (error) throw new Error(error.message);
    } catch (err) {
      logger.warn({ table, runId, err }, "Run heartbeat write failed");
    }
  };

  // Beat once immediately so a run is protected from the first second,
  // not from the first interval — a page load 5s in must not be able to
  // reclaim a run whose `started_at` is already old (a retried run in a
  // process that restarted mid-request).
  void beat();

  const timer = setInterval(() => {
    // Stop attesting past the ceiling: a run that has been "alive" this
    // long is wedged, not working, and must become reclaimable again.
    if (Date.now() - openedAt >= MAX_HEARTBEAT_MS) {
      logger.warn(
        { table, runId, ms: Date.now() - openedAt },
        "Run exceeded the heartbeat ceiling since its last progress write — no longer attesting liveness; it is now reclaimable",
      );
      stopped = true;
      clearInterval(timer);
      live.delete(key);
      return;
    }
    void beat();
  }, HEARTBEAT_INTERVAL_MS);
  // Never hold the process open on the heartbeat alone.
  timer.unref?.();

  return () => {
    live.delete(key);
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * The message a reclaimed run should carry (BUG-41).
 *
 * The old text — "did not finish (server restarted or timed out)" — named
 * two causes, covered a third it did not name (a live run wrongly judged
 * stale), and said nothing about WHERE the run stopped. Reading it told
 * you only that something went wrong, so every occurrence started a fresh
 * investigation from zero.
 *
 * The row already knows how long the run was silent and which phase it was
 * in. Saying both turns the failure into its own first diagnostic: a run
 * silent for 31 minutes in "Calling strategy model…" is a wedged model
 * call, while one silent for 12 minutes in "Persisting pillars…" is not
 * the same problem at all.
 */
export function reclaimedRunMessage(row: Record<string, unknown>, kind: "generation" | "analysis"): string {
  const silentMs = Date.now() - lastSignOfLife(row);
  const silentMin = Math.max(1, Math.round(silentMs / 60000));
  const stage = String(row["progress_stage"] ?? "").trim();
  const where = stage ? ` Last reported stage: "${stage}".` : "";
  const pct = row["progress_pct"];
  const pctNote = typeof pct === "number" && pct > 0 ? ` (${pct}% complete)` : "";
  return (
    `The ${kind} run stopped reporting progress for ${silentMin} minute(s) and was marked failed.${where}${pctNote} ` +
    `This means the process running it died (a restart or deploy), or the step it was on hung. ` +
    `Any partial output it wrote has been removed, so nothing half-finished is shown as real. Try again.`
  );
}
