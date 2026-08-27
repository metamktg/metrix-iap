// ─── The two paths must agree ─────────────────────────────────────────
//
// The whole value of moving these group-bys into Postgres is that the answer
// does not change. If the view path and the Node path can disagree, the
// optimisation is a silent data change, and it would land on whichever
// environments happened to have run the migration.
//
// So the test that matters is not "does the view path work" — it is "do the
// two paths produce the same maps from the same data".

import { describe, it, expect, vi } from "vitest";
import {
  aggregateFromRows, aggregateFromViews, loadAdPerformanceAggregates,
} from "../adPerformanceAggregates";

const rows = [
  { account_id: "a1", ad_name: "AAFE_HK_v3", book: "BOOK2", result_type: "purchase",
    date_start: "2026-06-01", date_end: "2026-06-01",
    spend: 100, reach: 900, impressions: 1000, results: 5, clicks_all: 80, link_clicks: 50 },
  { account_id: "a1", ad_name: "AAFE_HK_v3", book: "BOOK2", result_type: "purchase",
    date_start: "2026-06-02", date_end: "2026-06-02",
    spend: 50, reach: 400, impressions: 500, results: 3, clicks_all: 40, link_clicks: 25 },
  { account_id: "a1", ad_name: "AAFE_TN_v1", book: "BOOK0", result_type: "lead",
    date_start: "2026-05-20", date_end: "2026-05-20",
    spend: 25, reach: 100, impressions: 200, results: 1, clicks_all: 10, link_clicks: 8 },
  { account_id: "a2", ad_name: "OTHER_v1", book: null, result_type: "purchase",
    date_start: "2026-07-01", date_end: "2026-07-01",
    spend: 10, reach: 50, impressions: 60, results: 0, clicks_all: 5, link_clicks: 4 },
];

/** What the three views would return for the rows above. */
const eventRows = [
  { account_id: "a1", result_type: "purchase", spend: 150, reach: 1300, impressions: 1500, results: 8, clicks_all: 120, link_clicks: 75 },
  { account_id: "a1", result_type: "lead", spend: 25, reach: 100, impressions: 200, results: 1, clicks_all: 10, link_clicks: 8 },
  { account_id: "a2", result_type: "purchase", spend: 10, reach: 50, impressions: 60, results: 0, clicks_all: 5, link_clicks: 4 },
];
const adRows = [
  { account_id: "a1", ad_name: "AAFE_HK_v3", result_type: "purchase", spend: 150, results: 8, impressions: 1500, link_clicks: 75 },
  { account_id: "a1", ad_name: "AAFE_TN_v1", result_type: "lead", spend: 25, results: 1, impressions: 200, link_clicks: 8 },
  { account_id: "a2", ad_name: "OTHER_v1", result_type: "purchase", spend: 10, results: 0, impressions: 60, link_clicks: 4 },
];
const summaryRows = [
  { account_id: "a1", window_start: "2026-05-20", window_end: "2026-06-02", books: ["BOOK0", "BOOK2"], row_count: 3 },
  { account_id: "a2", window_start: "2026-07-01", window_end: "2026-07-01", books: [], row_count: 1 },
];

describe("the view path and the row path agree", () => {
  const fromRows = aggregateFromRows(rows);
  const fromViews = aggregateFromViews(eventRows, adRows, summaryRows);

  it("on per-event totals", () => {
    for (const acct of ["a1", "a2"]) {
      const r = fromRows.eventTotals.get(acct)!;
      const v = fromViews.eventTotals.get(acct)!;
      expect([...v.keys()].sort()).toEqual([...r.keys()].sort());
      for (const [event, totals] of r) expect(v.get(event)).toEqual(totals);
    }
  });

  it("on per-ad totals", () => {
    for (const acct of ["a1", "a2"]) {
      const r = fromRows.adTotals.get(acct)!;
      const v = fromViews.adTotals.get(acct)!;
      expect([...v.keys()].sort()).toEqual([...r.keys()].sort());
      for (const [ad, totals] of r) expect(v.get(ad)).toEqual(totals);
    }
  });

  it("on the window and the book list", () => {
    for (const acct of ["a1", "a2"]) {
      expect(fromViews.summary.get(acct)).toEqual(fromRows.summary.get(acct));
    }
  });
});

describe("the row path on its own", () => {
  const agg = aggregateFromRows(rows);

  it("sums a metric across days rather than taking the last one", () => {
    expect(agg.eventTotals.get("a1")!.get("purchase")!.spend).toBe(150);
  });

  it("keeps a measured zero", () => {
    expect(agg.eventTotals.get("a2")!.get("purchase")!.results).toBe(0);
  });

  it("takes the earliest start and the latest end, not the first row's", () => {
    const s = agg.summary.get("a1")!;
    expect(s.window_start).toBe("2026-05-20");
    expect(s.window_end).toBe("2026-06-02");
  });

  it("excludes a null book rather than listing it", () => {
    expect(agg.summary.get("a2")!.books).toEqual([]);
    expect(agg.summary.get("a1")!.books).toEqual(["BOOK0", "BOOK2"]);
  });
});

describe("falling back when the views are absent", () => {
  it("uses the rows and says so, rather than failing the seed", async () => {
    // schema.sql is applied by the importer, not the API server, so a deploy
    // can reach production before the migration does. Without this the seed
    // would 500 on that ordering.
    const logs: string[] = [];
    const agg = await loadAdPerformanceAggregates(async () => rows, (m) => logs.push(m));
    expect(agg.source).toBe("rows");
    expect(agg.eventTotals.get("a1")!.get("purchase")!.spend).toBe(150);
    expect(logs.join(" ")).toMatch(/not present|import:metrix/);
  });

  it("only fetches the rows when it has to", async () => {
    const fetchRows = vi.fn(async () => rows);
    await loadAdPerformanceAggregates(fetchRows, () => {});
    // One call: the fallback. Not two.
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });
});

describe("an ad measured against two result types", () => {
  // This is the case that made the two paths disagree. Node took the first
  // row's result_type; the view takes min(). Row order is not stable across
  // a re-ingestion, so "first" was not reproducible even against itself.
  const multi = [
    { account_id: "a1", ad_name: "DUAL_v1", book: "BOOK2", result_type: "purchase",
      date_start: "2026-06-01", date_end: "2026-06-01",
      spend: 60, reach: 0, impressions: 100, results: 2, clicks_all: 10, link_clicks: 9 },
    { account_id: "a1", ad_name: "DUAL_v1", book: "BOOK2", result_type: "lead",
      date_start: "2026-06-02", date_end: "2026-06-02",
      spend: 40, reach: 0, impressions: 80, results: 4, clicks_all: 8, link_clicks: 7 },
  ];

  it("picks the same result_type whichever path ran", () => {
    const fromRows = aggregateFromRows(multi).adTotals.get("a1")!.get("DUAL_v1")!;
    const fromView = aggregateFromViews(
      [], [{ account_id: "a1", ad_name: "DUAL_v1", result_type: "lead", spend: 100, results: 6, impressions: 180, link_clicks: 16 }], [],
    ).adTotals.get("a1")!.get("DUAL_v1")!;
    expect(fromRows.result_type).toBe(fromView.result_type);
    expect(fromRows.result_type).toBe("lead");
  });

  it("does not depend on the order the rows arrive in", () => {
    const a = aggregateFromRows(multi).adTotals.get("a1")!.get("DUAL_v1")!;
    const b = aggregateFromRows([...multi].reverse()).adTotals.get("a1")!.get("DUAL_v1")!;
    expect(a).toEqual(b);
  });

  it("still sums the spend across both", () => {
    expect(aggregateFromRows(multi).adTotals.get("a1")!.get("DUAL_v1")!.spend).toBe(100);
  });
});
