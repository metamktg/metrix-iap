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
export function startRunHeartbeat(table: HeartbeatTable, runId: string): () => void {
  let stopped = false;

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

  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  // Never hold the process open on the heartbeat alone.
  timer.unref?.();

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}
