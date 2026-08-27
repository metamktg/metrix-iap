// ─── One cache miss must cost one rebuild ─────────────────────────────
//
// This is the cache in front of assembleMetrixSeed — ~29 unfiltered table
// scans that build every account in the deployment. It had no coalescing,
// so a miss was a stampede: every concurrent caller started its own
// rebuild, multiplying the Supabase load and the peak memory by however
// many people happened to be looking at the app.
//
// The miss window is not rare. invalidateMetrixSeedCache is called from
// twenty mutation paths, and the clients that triggered the mutation
// refetch immediately, so several requests arriving together against an
// empty cache is the common case rather than the edge case.

import { describe, it, expect } from "vitest";
import { createCoalescedCache } from "../coalescedCache";

/** A build that blocks until released, so concurrency is deterministic. */
function gatedBuild<T>(value: () => T) {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return {
    get calls() { return calls; },
    release: () => release(),
    build: async () => { calls += 1; await gate; return value(); },
  };
}

describe("createCoalescedCache — the stampede property", () => {
  it("collapses concurrent misses into a single rebuild", async () => {
    const g = gatedBuild(() => ({ seed: true }));
    const cache = createCoalescedCache(g.build, 1000, () => 0);

    const all = Promise.all([cache.get(), cache.get(), cache.get(), cache.get(), cache.get()]);
    g.release();
    const results = await all;

    expect(g.calls).toBe(1);
    // Every waiter gets the same object, not five independently built
    // bundles that merely look alike.
    expect(new Set(results).size).toBe(1);
  });

  it("serves a later caller from the entry without rebuilding", async () => {
    let calls = 0;
    const cache = createCoalescedCache(async () => { calls += 1; return calls; }, 1000, () => 0);
    await cache.get();
    await cache.get();
    expect(calls).toBe(1);
  });

  it("does not wedge the endpoint when a rebuild fails", async () => {
    let attempt = 0;
    const cache = createCoalescedCache(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("supabase down");
      return "ok";
    }, 1000, () => 0);

    await expect(cache.get()).rejects.toThrow("supabase down");
    // A rejected rebuild must clear the in-flight slot, or every future
    // caller awaits a promise that already settled badly.
    await expect(cache.get()).resolves.toBe("ok");
    expect(attempt).toBe(2);
  });

  it("gives concurrent waiters the same failure, then recovers", async () => {
    let attempt = 0;
    const g = gatedBuild(() => { throw new Error("boom"); });
    const cache = createCoalescedCache(async () => { attempt += 1; return g.build(); }, 1000, () => 0);

    const settled = Promise.allSettled([cache.get(), cache.get(), cache.get()]);
    g.release();
    const results = await settled;

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    // One failed build, not three.
    expect(attempt).toBe(1);
  });
});

describe("createCoalescedCache — freshness", () => {
  it("rebuilds after an explicit invalidation", async () => {
    let calls = 0;
    const cache = createCoalescedCache(async () => { calls += 1; return calls; }, 1000, () => 0);
    await cache.get();
    cache.invalidate();
    await cache.get();
    expect(calls).toBe(2);
  });

  it("rebuilds once the entry has aged past its TTL", async () => {
    let calls = 0;
    let clock = 0;
    const cache = createCoalescedCache(async () => { calls += 1; return calls; }, 1000, () => clock);
    await cache.get();
    clock = 1500;
    await cache.get();
    expect(calls).toBe(2);
  });

  it("keeps serving an in-flight rebuild that was invalidated mid-build", async () => {
    // A mutation landing while a rebuild is in flight must not turn the
    // waiters' request into an error — they get the slightly-stale answer,
    // and the next request rebuilds against the new data.
    const g = gatedBuild(() => "first");
    const cache = createCoalescedCache(g.build, 1000, () => 0);
    const pending = cache.get();
    cache.invalidate();
    g.release();
    await expect(pending).resolves.toBe("first");
  });

  it("reset clears the entry and any in-flight rebuild", async () => {
    let calls = 0;
    const cache = createCoalescedCache(async () => { calls += 1; return calls; }, 1000, () => 0);
    await cache.get();
    cache.reset();
    await cache.get();
    expect(calls).toBe(2);
  });
});
