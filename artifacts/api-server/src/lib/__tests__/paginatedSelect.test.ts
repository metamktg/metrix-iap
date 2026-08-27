// ─── A truncated read looks exactly like a complete one ───────────────
//
// PostgREST caps an unbounded SELECT at 1000 rows and says nothing about
// it: no error, no flag, nothing in the response distinguishing "these are
// all the rows" from "these are the first thousand". A sum computed over
// the prefix therefore renders identically to a correct one, which is the
// worst possible failure mode for a platform whose stated invariant is
// that it never presents a number it did not measure.
//
// This bit the codebase once already — device_performance truncated to
// 1000 of 1544 rows and broke conversion_tracking_signal for two accounts
// — and the fix landed only in the seed assembly's reader. The analysis
// summary path kept eight unpaginated reads of the same rollup tables.
// Three of them pulled an account's ENTIRE history and then filtered by
// date in JavaScript, so truncation could drop the very rows the requested
// window needed: a 7-day preset under-reporting against data sitting in
// the table, with nothing on screen to suggest it.
//
// The rollups are per (entity x day), so the ceiling arrives early. One
// account's demographic_performance is roughly ads x age/gender buckets x
// days, which passes 1000 inside a single month of ordinary delivery.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase", () => ({ getSupabase: vi.fn() }));

import { getSupabase } from "../supabase";
import { selectAllRows, PAGE_SIZE } from "../paginatedSelect";

/**
 * A Supabase mock that honours .range(from, to) exactly as PostgREST does,
 * and records the filters each page carried so we can prove they survive
 * pagination.
 */
function makeSupabase(rows: Array<Record<string, unknown>>) {
  const ranges: Array<[number, number]> = [];
  const filters: Array<Record<string, unknown>> = [];
  const client: any = {
    from(_table: string) {
      const applied: Record<string, unknown> = {};
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { applied[`eq:${c}`] = v; return chain; },
        gte: (c: string, v: unknown) => { applied[`gte:${c}`] = v; return chain; },
        lte: (c: string, v: unknown) => { applied[`lte:${c}`] = v; return chain; },
        in: (c: string, v: unknown) => { applied[`in:${c}`] = v; return chain; },
        not: () => chain,
        order: () => chain,
        range: (from: number, to: number) => {
          ranges.push([from, to]);
          filters.push({ ...applied });
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
  return { client, ranges, filters };
}

const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, spend: 1 }));

beforeEach(() => {
  vi.mocked(getSupabase).mockReset();
});

describe("selectAllRows — the truncation the ceiling causes", () => {
  it("returns every row of a table larger than one page", async () => {
    const { client } = makeSupabase(makeRows(2_437));
    vi.mocked(getSupabase).mockReturnValue(client);

    const rows = await selectAllRows("demographic_performance");

    // The whole point: an unpaginated read would have returned 1000 and
    // every total downstream would have been silently wrong.
    expect(rows).toHaveLength(2_437);
    expect(rows.reduce((s, r) => s + Number(r["spend"]), 0)).toBe(2_437);
  });

  it("keeps following pages until one comes back short", async () => {
    const { client, ranges } = makeSupabase(makeRows(2_437));
    vi.mocked(getSupabase).mockReturnValue(client);
    await selectAllRows("ad_performance");
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops at exactly one request when the table fits in a page", async () => {
    const { client, ranges } = makeSupabase(makeRows(12));
    vi.mocked(getSupabase).mockReturnValue(client);
    await selectAllRows("placement_performance");
    expect(ranges).toEqual([[0, 999]]);
  });

  it("makes one more request when the row count lands exactly on the boundary", async () => {
    // A table of exactly PAGE_SIZE rows is indistinguishable from a
    // truncated one, so it must be probed rather than assumed complete.
    const { client, ranges } = makeSupabase(makeRows(PAGE_SIZE));
    vi.mocked(getSupabase).mockReturnValue(client);
    const rows = await selectAllRows("ad_performance");
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(ranges).toHaveLength(2);
  });

  it("returns nothing for an empty table without looping", async () => {
    const { client, ranges } = makeSupabase([]);
    vi.mocked(getSupabase).mockReturnValue(client);
    expect(await selectAllRows("ad_performance")).toEqual([]);
    expect(ranges).toHaveLength(1);
  });
});

describe("selectAllRows — filters must survive pagination", () => {
  it("re-applies the account and window filters on every page", async () => {
    const { client, filters } = makeSupabase(makeRows(2_100));
    vi.mocked(getSupabase).mockReturnValue(client);

    await selectAllRows(
      "demographic_performance",
      (q) => q.eq("account_id", "acct_a").gte("date_start", "2026-08-01").lte("date_start", "2026-08-31"),
      "date_start, age, gender, spend",
    );

    expect(filters).toHaveLength(3);
    // A page that lost its account filter would pull another tenant's rows
    // into this account's totals.
    for (const f of filters) {
      expect(f).toEqual({
        "eq:account_id": "acct_a",
        "gte:date_start": "2026-08-01",
        "lte:date_start": "2026-08-31",
      });
    }
  });

  it("surfaces a query error instead of returning a short read as success", async () => {
    const client: any = {
      from: () => ({
        select: () => ({
          range: () => Promise.resolve({ data: null, error: { message: "statement timeout" } }),
        }),
      }),
    };
    vi.mocked(getSupabase).mockReturnValue(client);
    await expect(selectAllRows("ad_performance")).rejects.toThrow(/ad_performance.*statement timeout/);
  });
});
