// ─── Single-entry cache with request coalescing ───────────────────────
//
// A TTL cache whose defining property is that a MISS costs exactly one
// rebuild, no matter how many callers arrive during it.
//
// This exists because the Metrix seed cache did not have that property.
// assembleMetrixSeed is ~29 unfiltered table scans that build every account
// in the deployment, and nothing stopped concurrent callers from each
// starting their own. The miss window is not rare either:
// invalidateMetrixSeedCache is called from twenty mutation paths, and the
// clients that triggered the mutation refetch immediately — so several
// requests arriving together against an empty cache is the common case,
// not the edge case. Each one paid the full rebuild, multiplying both the
// Supabase load and the peak memory by however many people happened to be
// looking at the app at that moment.
//
// Kept generic and separate from the seed so it can be tested directly.
// A cache whose whole point is concurrency behaviour needs tests that
// actually drive the concurrency, and that means the real unit — not a
// re-implementation of it sitting in a test file.

export interface CoalescedCache<T> {
  /**
   * Cached value if fresh. Past the TTL, the stale value is returned at
   * once and ONE rebuild runs in the background (stale-while-revalidate);
   * with nothing cached, one shared rebuild.
   */
  get(): Promise<T>;
  /** True while a rebuild is running. */
  rebuilding(): boolean;
  /** Drop the entry. Does NOT cancel a rebuild already in flight. */
  invalidate(): void;
  /** Test seam: drop the entry AND any in-flight rebuild. */
  reset(): void;
}

export function createCoalescedCache<T>(
  build: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): CoalescedCache<T> {
  let cached: { at: number; data: T } | null = null;
  let inFlight: Promise<T> | null = null;

  const rebuild = (): Promise<T> => {
    if (inFlight) return inFlight;
    inFlight = build()
      .then((data) => {
        cached = { at: now(), data };
        return data;
      })
      .finally(() => {
        // Cleared on rejection too. A failed rebuild must not be handed
        // to every future caller, and must not wedge the endpoint
        // permanently behind a promise that already settled badly.
        inFlight = null;
      });
    return inFlight;
  };

  return {
    async get(): Promise<T> {
      if (cached && now() - cached.at < ttlMs) return cached.data;
      if (cached) {
        // Stale-while-revalidate (2026-09-04): a TTL expiry used to make
        // the next reader wait for the whole rebuild, which on a seed of
        // production size is minutes on the boot splash. The stale bundle
        // is seconds old in practice and every in-app mutation still
        // invalidates explicitly (a cold rebuild, below), so a reader that
        // just changed something never sees stale data; only the TTL
        // refresh happens off the request path. A failed background
        // rebuild keeps serving the stale value and is retried on the next
        // read past the TTL.
        rebuild().catch(() => {});
        return cached.data;
      }
      return rebuild();
    },

    rebuilding(): boolean {
      return inFlight !== null;
    },

    invalidate(): void {
      // Deliberately does not cancel an in-flight rebuild. That rebuild may
      // have read its rows before the mutation that triggered this call
      // committed, so its result can be stale by a few hundred
      // milliseconds — but the callers awaiting it get an answer rather
      // than an error, and the next request after it settles rebuilds
      // against the new data.
      cached = null;
    },

    reset(): void {
      cached = null;
      inFlight = null;
    },
  };
}
