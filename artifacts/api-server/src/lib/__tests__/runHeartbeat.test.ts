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

import { describe, it, expect } from "vitest";
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
