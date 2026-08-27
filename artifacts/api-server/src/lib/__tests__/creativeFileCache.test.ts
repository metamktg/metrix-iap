// ─── Staged-file cache must not cross tenants ─────────────────────────
//
// getCreativeFile returns from its TTL cache, and from its in-flight
// coalescing map, WITHOUT calling the loader — so its key is an
// access-control decision, not just a performance one. Both maps were
// keyed by importId alone, which made the cache the one path to a staged
// file that never checked who owns it:
//
//   1. A member of account A legitimately fetches import X. It is cached.
//   2. A member of account B requests /accounts/B/manual-imports/X/file.
//      The route guard passes — they really do have access to B.
//      The cache hits on X and returns A's bytes.
//
// Uncached, step 2 404s, because the loader's query carries
// .eq("account_id", B). Import ids are uuids, so this was never
// brute-forceable, but uuids are not secrets: they travel in URLs,
// screenshots, support tickets, HAR captures and server logs, and revoking
// a grant does not un-see the ids someone already had.
//
// These cases pin both halves: the tenancy rule, and the coalescing the
// cache exists for in the first place (a fix that serialised every
// thumbnail would trade one production incident for another).

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCreativeFile,
  __resetCreativeFileCacheForTests,
  type CreativeFile,
} from "../creativeFileCache";

const ACCOUNT_A = "acct_alpha";
const ACCOUNT_B = "acct_beta";
const IMPORT_ID = "11111111-2222-3333-4444-555555555555";

const FILE_A: CreativeFile = { buf: Buffer.from("account A bytes"), contentType: "image/png" };

/** Stands in for the account-scoped Supabase read: only A owns the import. */
function makeLoader() {
  const calls: Array<string> = [];
  const load = (accountId: string) => async (): Promise<CreativeFile> => {
    calls.push(accountId);
    if (accountId !== ACCOUNT_A) throw Object.assign(new Error("not_found"), { code: "not_found" });
    return FILE_A;
  };
  return { load, calls };
}

beforeEach(() => {
  __resetCreativeFileCacheForTests();
});

describe("getCreativeFile — tenancy", () => {
  it("serves the owning account its file", async () => {
    const { load } = makeLoader();
    const file = await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
    expect(file.contentType).toBe("image/png");
    expect(file.buf.toString()).toBe("account A bytes");
  });

  it("does NOT serve a warm cache entry to a different account", async () => {
    const { load, calls } = makeLoader();
    await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
    expect(calls).toEqual([ACCOUNT_A]);

    // Same import id, different account: must miss the cache and fall
    // through to that account's own loader, which finds nothing.
    await expect(getCreativeFile(ACCOUNT_B, IMPORT_ID, load(ACCOUNT_B))).rejects.toMatchObject({
      code: "not_found",
    });
    expect(calls).toEqual([ACCOUNT_A, ACCOUNT_B]);
  });

  it("does not let in-flight coalescing hand one account another's promise", async () => {
    const { load, calls } = makeLoader();
    // Both start before either settles — the coalescing map is the other
    // branch that returns without consulting the loader.
    const [owner, other] = await Promise.allSettled([
      getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A)),
      getCreativeFile(ACCOUNT_B, IMPORT_ID, load(ACCOUNT_B)),
    ]);
    expect(owner.status).toBe("fulfilled");
    expect(other.status).toBe("rejected");
    // Two loads, one per account — not one shared answer.
    expect(calls.sort()).toEqual([ACCOUNT_A, ACCOUNT_B]);
  });
});

describe("getCreativeFile — the caching it exists for", () => {
  it("loads once for repeat requests from the same account", async () => {
    const { load, calls } = makeLoader();
    await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
    await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
    await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
    expect(calls).toEqual([ACCOUNT_A]);
  });

  it("coalesces concurrent requests from the same account into one load", async () => {
    const { calls } = makeLoader();
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slowLoad = async (): Promise<CreativeFile> => {
      calls.push(ACCOUNT_A);
      await gate;
      return FILE_A;
    };

    const all = Promise.all([
      getCreativeFile(ACCOUNT_A, IMPORT_ID, slowLoad),
      getCreativeFile(ACCOUNT_A, IMPORT_ID, slowLoad),
      getCreativeFile(ACCOUNT_A, IMPORT_ID, slowLoad),
    ]);
    release!();
    const files = await all;

    // Twenty thumbnails mounting at once must still be one query — the
    // original reason this cache exists.
    expect(calls).toEqual([ACCOUNT_A]);
    expect(files.every((f) => f.buf.toString() === "account A bytes")).toBe(true);
  });

  it("does not cache a failed load", async () => {
    const { calls } = makeLoader();
    let attempt = 0;
    const flaky = async (): Promise<CreativeFile> => {
      calls.push(ACCOUNT_A);
      attempt += 1;
      if (attempt === 1) throw new Error("transient");
      return FILE_A;
    };
    await expect(getCreativeFile(ACCOUNT_A, IMPORT_ID, flaky)).rejects.toThrow("transient");
    // A rejected fetch must not poison the entry, and must not leave the
    // in-flight promise behind for the next caller to await forever.
    const file = await getCreativeFile(ACCOUNT_A, IMPORT_ID, flaky);
    expect(file.buf.toString()).toBe("account A bytes");
    expect(calls).toHaveLength(2);
  });

  it("re-loads once an entry has expired", async () => {
    vi.useFakeTimers();
    try {
      const { load, calls } = makeLoader();
      await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
      vi.advanceTimersByTime(11 * 60 * 1000);
      await getCreativeFile(ACCOUNT_A, IMPORT_ID, load(ACCOUNT_A));
      expect(calls).toEqual([ACCOUNT_A, ACCOUNT_A]);
    } finally {
      vi.useRealTimers();
    }
  });
});
