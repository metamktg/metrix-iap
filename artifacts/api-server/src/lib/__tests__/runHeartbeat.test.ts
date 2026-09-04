// ─── Run liveness (BUG-39) ────────────────────────────────────────────
//
// Both engines reclaim a dead 'running' row by flipping it to error and
// DELETING the partial outputs it wrote. That reclaim was keyed on
// `started_at`, a timestamp that never advances — so the rule really
// said "any run older than the threshold is dead", and a run that was
// merely slow could have its outputs deleted while it was still writing
// them. Neither engine can signal liveness through its phase writes: a
// generation run spends most of its clock inside ONE model call, and an
// analysis run can spend as long inside one parse.
//
// `lastSignOfLife` is the whole behavioural change, so it is where the
// guarantees are pinned.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lastSignOfLife, HEARTBEAT_INTERVAL_MS } from "../runHeartbeat";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60 * 1000;

describe("lastSignOfLife", () => {
  it("prefers the heartbeat over started_at, so a slow run reads as alive", () => {
    // The exact bug: started 40 minutes ago, still working 10s ago.
    const row = { started_at: iso(40 * MIN), heartbeat_at: iso(10 * 1000) };
    const silentFor = Date.now() - lastSignOfLife(row);
    expect(silentFor).toBeLessThan(MIN);
  });

  it("reads a dead run as stale — the heartbeat stops with the process", () => {
    // Started 40 min ago, last beat 30 min ago: the process died.
    const row = { started_at: iso(40 * MIN), heartbeat_at: iso(30 * MIN) };
    const silentFor = Date.now() - lastSignOfLife(row);
    expect(silentFor).toBeGreaterThan(10 * MIN);
  });

  it("falls back to started_at for rows written before the column existed", () => {
    // Pre-migration rows carry no heartbeat. Falling back reproduces the
    // old behaviour exactly, which is correct: they are all long finished.
    const started = iso(40 * MIN);
    expect(lastSignOfLife({ started_at: started, heartbeat_at: null })).toBe(
      new Date(started).getTime(),
    );
    expect(lastSignOfLife({ started_at: started })).toBe(new Date(started).getTime());
  });

  it("treats an unusable timestamp as maximally stale, never as fresh", () => {
    // Failing open here would make a genuinely dead run unreclaimable and
    // permanently block the account's next run (one-running-row index).
    expect(lastSignOfLife({})).toBe(0);
    expect(lastSignOfLife({ started_at: "not-a-date" })).toBe(0);
    expect(lastSignOfLife({ started_at: null, heartbeat_at: "garbage" })).toBe(0);
  });

  it("ignores an unparseable heartbeat rather than discarding a good start time", () => {
    const started = iso(5 * MIN);
    expect(lastSignOfLife({ started_at: started, heartbeat_at: "garbage" })).toBe(
      new Date(started).getTime(),
    );
  });

  it("beats often enough that a live run is never near either stale window", () => {
    // Both engines use a 10-minute window; 30s gives ~20x headroom, so a
    // handful of consecutive failed heartbeat writes still cannot cause a
    // false reclaim.
    expect(HEARTBEAT_INTERVAL_MS).toBeLessThanOrEqual((10 * MIN) / 10);
  });
});

// ─── The heartbeat must attest liveness, not immortality (BUG-41) ──────
//
// The ceiling exists because the interval runs INDEPENDENTLY of the awaited
// work. A run wedged inside a network call with no timeout keeps beating,
// so it never looks stale, is never reclaimed, and holds the account's
// one-running-run unique index for as long as the process lives — strictly
// worse than the bug the heartbeat was added to fix.

describe("MAX_HEARTBEAT_MS ceiling", () => {
  it("sits above the worst legitimate run, so it never kills real work", async () => {
    const { MAX_HEARTBEAT_MS } = await import("../runHeartbeat");
    // Worst realistic case: three model calls (initial, budget escalation,
    // validation repair) at the 8-minute per-call ceiling = ~24 min.
    expect(MAX_HEARTBEAT_MS).toBeGreaterThan(24 * MIN);
  });

  it("still bounds the block, so a wedged run cannot hold the slot forever", async () => {
    const { MAX_HEARTBEAT_MS } = await import("../runHeartbeat");
    expect(MAX_HEARTBEAT_MS).toBeLessThanOrEqual(45 * MIN);
  });
});

describe("reclaimedRunMessage", () => {
  it("names the phase the run stopped in, so the failure is its own first clue", async () => {
    const { reclaimedRunMessage } = await import("../runHeartbeat");
    const msg = reclaimedRunMessage(
      { started_at: iso(40 * MIN), heartbeat_at: iso(31 * MIN), progress_stage: "Calling strategy model…", progress_pct: 10 },
      "generation",
    );
    expect(msg).toContain("Calling strategy model…");
    expect(msg).toContain("31 minute(s)");
    expect(msg).toContain("10% complete");
  });

  it("distinguishes a wedged model call from a wedged persist by the stage alone", async () => {
    const { reclaimedRunMessage } = await import("../runHeartbeat");
    const a = reclaimedRunMessage(
      { started_at: iso(40 * MIN), heartbeat_at: iso(31 * MIN), progress_stage: "Calling strategy model…" },
      "generation",
    );
    const b = reclaimedRunMessage(
      { started_at: iso(20 * MIN), heartbeat_at: iso(12 * MIN), progress_stage: "Persisting pillars…" },
      "generation",
    );
    expect(a).not.toBe(b);
    expect(b).toContain("Persisting pillars…");
  });

  it("stays honest when the row never recorded a stage", async () => {
    const { reclaimedRunMessage } = await import("../runHeartbeat");
    const msg = reclaimedRunMessage({ started_at: iso(30 * MIN) }, "analysis");
    expect(msg).toContain("analysis run");
    expect(msg).not.toContain("Last reported stage");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("NaN");
  });

  it("promises that partial output was removed — the reclaim does delete it", async () => {
    const { reclaimedRunMessage } = await import("../runHeartbeat");
    expect(reclaimedRunMessage({ started_at: iso(30 * MIN) }, "generation")).toContain(
      "partial output",
    );
  });
});

// ─── The two bounds only mean anything relative to each other ──────────
//
// A run that is genuinely working keeps beating; a run that is wedged must
// eventually stop. That only holds if the longest a run can LEGITIMATELY
// spend in the model is shorter than the heartbeat ceiling. Raise the model
// timeout past the ceiling and the reclaim starts killing live work again —
// which is BUG-39 all over. Lower the ceiling under the model budget and the
// same thing happens. This pins the ordering so neither edit passes silently.

describe("model-call bounds vs the heartbeat ceiling", () => {
  it("lets the slowest legitimate run finish before the ceiling stops attesting", async () => {
    const { worstCaseModelMs } = await import("../generationLimits");
    const { MAX_HEARTBEAT_MS } = await import("../runHeartbeat");
    expect(worstCaseModelMs()).toBeLessThan(MAX_HEARTBEAT_MS);
  });

  it("keeps a single call well under the stale window, so one call is never mistaken for death", async () => {
    const { MODEL_CALL_TIMEOUT_MS, MODEL_CALL_MAX_RETRIES } = await import("../generationLimits");
    // 10 min is STALE_RUN_MS in generationEngine. A single call's worst case
    // must stay under it, or a first call alone could look dead.
    expect(MODEL_CALL_TIMEOUT_MS * (MODEL_CALL_MAX_RETRIES + 1)).toBeLessThanOrEqual(10 * MIN);
  });

  it("bounds retries — timeouts are retried, so wall clock is timeout x (retries+1)", async () => {
    const { MODEL_CALL_MAX_RETRIES } = await import("../generationLimits");
    // The SDK default is 2. Left at the default, a 4-minute timeout becomes
    // 12 minutes of wall clock per call.
    expect(MODEL_CALL_MAX_RETRIES).toBeLessThan(2);
  });
});

// ─── A stage boundary re-arms the ceiling ───────────────────────────────
//
// The ceiling measured from the run's START, so a legitimate run longer
// than MAX_HEARTBEAT_MS (Pure Path: 22k ad rows, 150k ledger rows through
// PostgREST, over 30 minutes) stopped attesting mid-way and was reclaimed
// by the next read while it was still writing (2026-09-04, run 8148628c).
// Progress writes now touch the heartbeat, so the ceiling measures from
// the last stage the run reached: working runs run, wedged runs are still
// reclaimed MAX_HEARTBEAT_MS after their last progress.

const beats: string[] = [];
vi.mock("../supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      update: () => ({
        eq: () => ({
          eq: async () => {
            beats.push(table);
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

describe("touchRunHeartbeat", () => {
  beforeEach(() => {
    beats.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a run that reaches new stages beating past the ceiling, and stops a run that does not", async () => {
    const { startRunHeartbeat, touchRunHeartbeat, MAX_HEARTBEAT_MS, HEARTBEAT_INTERVAL_MS } = await import("../runHeartbeat");
    const stop = startRunHeartbeat("manual_analysis_runs", "run-long");
    await vi.advanceTimersByTimeAsync(0);
    const initial = beats.length;

    // Two thirds of the ceiling in, the run reaches a stage.
    await vi.advanceTimersByTimeAsync((MAX_HEARTBEAT_MS * 2) / 3);
    expect(beats.length).toBeGreaterThan(initial);
    touchRunHeartbeat("manual_analysis_runs", "run-long");

    // Past the ORIGINAL ceiling: still beating, because the ceiling now
    // measures from the touch.
    await vi.advanceTimersByTimeAsync((MAX_HEARTBEAT_MS * 2) / 3);
    const afterTouch = beats.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);
    expect(beats.length).toBeGreaterThan(afterTouch);

    // No further stage: MAX_HEARTBEAT_MS after the touch the beating stops.
    await vi.advanceTimersByTimeAsync(MAX_HEARTBEAT_MS);
    const atCeiling = beats.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(beats.length).toBe(atCeiling);
    stop();
  });

  it("is a no-op for a run with no heartbeat (a reclaimed run's late write)", async () => {
    const { touchRunHeartbeat } = await import("../runHeartbeat");
    expect(() => touchRunHeartbeat("manual_analysis_runs", "nobody")).not.toThrow();
  });

  it("forgets the heartbeat once it is stopped", async () => {
    const { startRunHeartbeat, touchRunHeartbeat, HEARTBEAT_INTERVAL_MS } = await import("../runHeartbeat");
    const stop = startRunHeartbeat("manual_analysis_runs", "run-short");
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const stopped = beats.length;
    touchRunHeartbeat("manual_analysis_runs", "run-short");
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(beats.length).toBe(stopped);
  });
});
