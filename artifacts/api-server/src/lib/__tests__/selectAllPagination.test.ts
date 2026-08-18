// ─── selectAll pagination guard ───────────────────────────────────────────────
// Regression guard: selectAll() in metrixSeedAssembly must paginate beyond the
// 1000-row PostgREST default.  The original bug (device_performance silently
// truncated to 1000 of 1544 rows) broke conversion_tracking_signal for two
// accounts.  These tests lock in the pagination contract so the same class of
// failure is caught immediately when it regresses.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectAll } from "../metrixSeedAssembly";

// ─── Supabase mock factory ─────────────────────────────────────────────────────
// makeMockSupabase(allRows) builds a mock Supabase client whose .from().select()
// chain honours .range(from, to) exactly as PostgREST does: it slices the
// provided dataset and returns only the requested window.  This lets us simulate
// any table size without a real DB connection.

function makeMockSupabase(allRows: Record<string, any>[]) {
  // We track the range call so we can assert it was invoked.
  const rangeCalls: Array<[number, number]> = [];

  const chain = {
    _build: undefined as ((q: any) => any) | undefined,
    _from: "",
    rangeCalls,

    from(_table: string) {
      return this;
    },
    select(_cols: string) {
      return this;
    },
    // Allow the optional build fn (e.g. .eq()) to chain without breaking.
    eq(_col: string, _val: unknown) {
      return this;
    },
    order(_col: string, _opts?: unknown) {
      return this;
    },
    range(from: number, to: number) {
      rangeCalls.push([from, to]);
      const slice = allRows.slice(from, to + 1);
      return Promise.resolve({ data: slice, error: null });
    },
  };

  // Make every method return the same chain object so arbitrary chaining works.
  const proxy: any = new Proxy(chain, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop].bind(target);
      return () => proxy;
    },
  });

  return { client: proxy, rangeCalls };
}

vi.mock("../supabase", () => ({
  getSupabase: vi.fn(),
}));

// Pull the mocked getSupabase so we can point it at different datasets per test.
import { getSupabase } from "../supabase";
const mockGetSupabase = vi.mocked(getSupabase);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helper: build N synthetic rows ───────────────────────────────────────────
const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, account_id: "acct_a" }));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("selectAll pagination", () => {
  it("returns all rows when the table has fewer than 1000 rows (single page)", async () => {
    const rows = makeRows(500);
    const { client } = makeMockSupabase(rows);
    mockGetSupabase.mockReturnValue(client);

    const result = await selectAll("some_table");

    expect(result).toHaveLength(500);
    expect(result[0]!["id"]).toBe(1);
    expect(result[499]!["id"]).toBe(500);
  });

  it("fetches a second page when the first page returns exactly 1000 rows", async () => {
    // 1001 rows: first page is full (1000), second page has 1.
    const rows = makeRows(1001);
    const { client, rangeCalls } = makeMockSupabase(rows);
    mockGetSupabase.mockReturnValue(client);

    const result = await selectAll("some_table");

    expect(result).toHaveLength(1001);
    // Two range calls: [0,999] then [1000,1999]
    expect(rangeCalls).toHaveLength(2);
    expect(rangeCalls[0]).toEqual([0, 999]);
    expect(rangeCalls[1]).toEqual([1000, 1999]);
    // Last row is the 1001st row
    expect(result[1000]!["id"]).toBe(1001);
  });

  it("fetches all rows from a table with exactly 1000 rows (one full page → one empty follow-up)", async () => {
    // Exactly 1000 rows: first page is full, second page returns 0 rows → loop stops.
    const rows = makeRows(1000);
    const { client, rangeCalls } = makeMockSupabase(rows);
    mockGetSupabase.mockReturnValue(client);

    const result = await selectAll("some_table");

    expect(result).toHaveLength(1000);
    // Two fetches: the 1000-row page, then an empty follow-up that stops iteration.
    expect(rangeCalls).toHaveLength(2);
    expect(rangeCalls[0]).toEqual([0, 999]);
    expect(rangeCalls[1]).toEqual([1000, 1999]);
  });

  it("fetches all 1544 rows across two pages (real device_performance scenario)", async () => {
    // This matches the exact regression: device_performance had 1544 rows,
    // the last 544 (belonging to bookster + ecas) were silently dropped when
    // only the first page was fetched.
    const rows = makeRows(1544);
    const { client, rangeCalls } = makeMockSupabase(rows);
    mockGetSupabase.mockReturnValue(client);

    const result = await selectAll("device_performance");

    expect(result).toHaveLength(1544);
    expect(rangeCalls).toHaveLength(2);
    expect(rangeCalls[0]).toEqual([0, 999]);
    expect(rangeCalls[1]).toEqual([1000, 1999]);
    // Verify the previously-truncated tail rows are present.
    expect(result[999]!["id"]).toBe(1000);
    expect(result[1000]!["id"]).toBe(1001);
    expect(result[1543]!["id"]).toBe(1544);
  });

  it("spans three pages for a table with 2500 rows", async () => {
    const rows = makeRows(2500);
    const { client, rangeCalls } = makeMockSupabase(rows);
    mockGetSupabase.mockReturnValue(client);

    const result = await selectAll("large_table");

    expect(result).toHaveLength(2500);
    expect(rangeCalls).toHaveLength(3);
    expect(rangeCalls[0]).toEqual([0, 999]);
    expect(rangeCalls[1]).toEqual([1000, 1999]);
    expect(rangeCalls[2]).toEqual([2000, 2999]);
  });

  it("passes an optional build function to every page query", async () => {
    // The build fn (e.g. .eq("account_id", "x")) must be applied on every
    // page fetch — not just the first — so filtered tables are fully paginated.
    const allRows = makeRows(1200);
    // Simulate a filtered table: build fn filters to even-id rows only.
    const filteredRows = allRows.filter((r) => r["id"] % 2 === 0); // 600 rows
    const { client, rangeCalls } = makeMockSupabase(filteredRows);
    mockGetSupabase.mockReturnValue(client);

    let buildCallCount = 0;
    const build = (q: any) => {
      buildCallCount++;
      return q.eq("parity", "even");
    };

    const result = await selectAll("some_table", build);

    expect(result).toHaveLength(600);
    // build must have been called once per page (one page since 600 < 1000)
    expect(buildCallCount).toBe(1);
    expect(rangeCalls).toHaveLength(1);
  });

  it("propagates Supabase errors immediately", async () => {
    const { client } = makeMockSupabase([]);
    // Override range to return an error
    client.range = (_from: number, _to: number) =>
      Promise.resolve({ data: null, error: { message: "connection refused" } });
    mockGetSupabase.mockReturnValue(client);

    await expect(selectAll("broken_table")).rejects.toThrow(
      'Supabase query failed for "broken_table": connection refused',
    );
  });
});
