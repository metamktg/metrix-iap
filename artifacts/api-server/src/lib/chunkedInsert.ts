// Chunked inserts that survive a lost connection.
//
// An analysis run writes its output tables in batches of a few hundred rows
// through PostgREST. On 2026-09-04 the Pure Path run wrote 139 batches of
// ad_breakdown_performance in six minutes, then PostgREST's timeout manager
// killed the 140th ("Warp server error: Thread killed by timeout manager"),
// the socket sat until it closed, undici threw "TypeError: fetch failed",
// the run failed at 88% and every row it had written was cleaned up.
// Thirteen minutes of work lost to one request, with nothing wrong in the
// data.
//
// A batch is ONE SQL statement, so it either landed or it did not; there is
// no partial batch. That is what makes a retry safe: after a network-level
// failure the run counts the rows this run holds in the table and compares
// them with what it has confirmed so far. Equal → the batch was lost before
// it applied, send it again (in halves, since a too-slow request is the
// usual cause). Equal plus the batch → the response was lost after the
// batch applied, carry on. Anything else is reported, never guessed at.
// Tables without a run id column (the signal tables) carry a unique key on
// every row instead: a retry that meets a duplicate-key error after a
// network failure means the lost batch had landed.
//
// A database error is never retried: it is a real answer about the rows.
// Pure over a two-method client so the recovery is unit-tested without a
// database.

export interface ChunkedInsertClient {
  /** Inserts the batch as one statement; resolves with the database's error, throws on a network failure. */
  insert(table: string, rows: readonly Record<string, unknown>[]): Promise<{ error: { message: string; code?: string | null; status?: number | null } | null }>;
  /** Rows the run holds in the table right now. */
  countForRun(table: string, runId: string): Promise<number>;
}

export interface ChunkedInsertOptions {
  runId: string;
  /** Rows per statement. */
  chunk?: number;
  /** The table carries manual_analysis_run_id (recovery counts rows); false for tables keyed uniquely per row instead. */
  runScoped?: boolean;
  /** Attempts per batch, including the first. */
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, meta: Record<string, unknown>) => void;
}

export interface ChunkedInsertResult {
  inserted: number;
  /** Batches sent again after a network-level failure. */
  retried: number;
  /** Batches found already landed when their response was lost. */
  recovered: number;
}

const RETRYABLE_CODES: ReadonlySet<string> = new Set(["57014", "40P01", "55P03", "08006", "08003", "08000"]);
// Transport phrases only. The bare words "network" and "timeout" used to be
// here and matched genuine database errors whose text happened to carry
// them (three sleeps before the real message surfaced); "timed out" is the
// edge's own phrasing (a Cloudflare 522 page), which carries no SQLSTATE.
const RETRYABLE_MESSAGE = /fetch failed|ECONNRESET|EPIPE|ETIMEDOUT|socket hang up|timed out|terminating connection|server closed the connection/i;
const UNIQUE_VIOLATION = "23505";

/** A network-level failure or a statement the server gave up on, as opposed to an answer about the rows. */
export function isRetryableInsertFailure(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string") {
    if (RETRYABLE_CODES.has((err as { code: string }).code)) return true;
  }
  // No answer at all (status 0) or the server's own failure (5xx) is a
  // transport failure whatever the body says.
  if (err && typeof err === "object" && "status" in err && typeof (err as { status?: unknown }).status === "number") {
    const status = (err as { status: number }).status;
    if (status === 0 || status >= 500) return true;
  }
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  return RETRYABLE_MESSAGE.test(message);
}

export const defaultBackoffMs = (attempt: number): number => Math.min(2_000 * 2 ** (attempt - 1), 15_000);

const sleepFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function insertChunkedWithRecovery(
  client: ChunkedInsertClient,
  table: string,
  rows: readonly Record<string, unknown>[],
  opts: ChunkedInsertOptions,
): Promise<ChunkedInsertResult> {
  const chunk = Math.max(1, opts.chunk ?? 500);
  const runScoped = opts.runScoped ?? true;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 4);
  const backoff = opts.backoffMs ?? defaultBackoffMs;
  const sleep = opts.sleep ?? sleepFor;
  const log = opts.log ?? (() => {});
  const result: ChunkedInsertResult = { inserted: 0, retried: 0, recovered: 0 };
  if (rows.length === 0) return result;
  // Rows the run held in the table BEFORE this call (another call may have
  // written the same table earlier in the run). Read up front: a count
  // taken only after a failure cannot tell whether the failed batch is in
  // it, which is the one question the recovery has to answer.
  const baseline = runScoped ? await client.countForRun(table, opts.runId) : 0;

  const sendBatch = async (batch: readonly Record<string, unknown>[], attempt: number): Promise<void> => {
    let failure: unknown = null;
    try {
      const { error } = await client.insert(table, batch);
      if (!error) {
        result.inserted += batch.length;
        return;
      }
      if (!runScoped && attempt > 1 && error.code === UNIQUE_VIOLATION) {
        // The lost batch had landed: every row now conflicts.
        result.inserted += batch.length;
        result.recovered += 1;
        log("Chunked insert: the batch whose response was lost had landed", { table, rows: batch.length, attempt });
        return;
      }
      if (!isRetryableInsertFailure(error)) throw new Error(error.message);
      failure = error;
    } catch (err) {
      if (failure === null) {
        if (!isRetryableInsertFailure(err)) throw err;
        failure = err;
      }
    }
    const message = failure instanceof Error ? failure.message : String((failure as { message?: unknown })?.message ?? failure);
    if (attempt >= maxAttempts) {
      throw new Error(`Insert into ${table} failed after ${attempt} attempt(s): ${message}`);
    }
    await sleep(backoff(attempt));
    if (runScoped) {
      const confirmed = baseline + result.inserted;
      const expectedIfLanded = confirmed + batch.length;
      const now = await client.countForRun(table, opts.runId);
      if (now === expectedIfLanded) {
        result.inserted += batch.length;
        result.recovered += 1;
        log("Chunked insert: the batch whose response was lost had landed", { table, rows: batch.length, attempt, message });
        return;
      }
      if (now !== confirmed) {
        throw new Error(
          `Insert into ${table} failed (${message}) and the table holds ${now} row(s) for this run where ${confirmed} or ${expectedIfLanded} were expected; not retrying blind.`,
        );
      }
    }
    result.retried += 1;
    log("Chunked insert: retrying a batch after a network-level failure", { table, rows: batch.length, attempt: attempt + 1, message });
    if (batch.length > 1) {
      // A request that was too slow for the server is the usual cause; two
      // smaller statements finish where one did not.
      const half = Math.ceil(batch.length / 2);
      await sendBatch(batch.slice(0, half), attempt + 1);
      await sendBatch(batch.slice(half), attempt + 1);
    } else {
      await sendBatch(batch, attempt + 1);
    }
  };

  for (let i = 0; i < rows.length; i += chunk) {
    await sendBatch(rows.slice(i, i + chunk), 1);
  }
  return result;
}
