// ─── kpiBreakdown selector layer — unit tests ─────────────────────────
// Blended ratio math (summed numerators/denominators, never averaged),
// tracking-basis separation, overlap-window computation, and null guards.

import { describe, it, expect } from "vitest";
import {
  metricValueFromTotals, formatBreakdownValue, sortBreakdownRows,
  buildManagerBreakdown, buildAccountBreakdown, computeOverlapWindow,
  listBreakdownDimensions, dimensionMetricRestriction, EMPTY_TOTALS,
  lowerIsBetter,
} from "../kpiBreakdown";
import type { AdAccount, AnalysisData, CellPerformanceRow } from "../seedTypes";

const T = (o: Partial<typeof EMPTY_TOTALS>) => ({ ...EMPTY_TOTALS, ...o });

describe("metricValueFromTotals — ratio math + null guards", () => {
  it("computes CTR from summed numerator/denominator", () => {
    expect(metricValueFromTotals("link_ctr", T({ linkClicks: 50, impressions: 1000 }))).toBeCloseTo(5);
  });
  it("CTR null guard: clicks > impressions ⇒ null, never a percentage", () => {
    expect(metricValueFromTotals("link_ctr", T({ linkClicks: 200, impressions: 100 }))).toBeNull();
    expect(metricValueFromTotals("ctr_all", T({ clicksAll: 200, impressions: 100 }))).toBeNull();
  });
  it("divide-by-zero guards return null, not NaN/Infinity", () => {
    expect(metricValueFromTotals("link_ctr", T({ linkClicks: 5, impressions: 0 }))).toBeNull();
    expect(metricValueFromTotals("cpa_blended", T({ spend: 100, results: 0 }))).toBeNull();
    expect(metricValueFromTotals("cpc", T({ spend: 100, linkClicks: 0 }))).toBeNull();
    expect(metricValueFromTotals("cpm", T({ spend: 100, impressions: 0 }))).toBeNull();
    expect(metricValueFromTotals("cvr", T({ results: 3, linkClicks: 0 }))).toBeNull();
  });
  it("missing inputs ⇒ null (n/a), never zero", () => {
    expect(metricValueFromTotals("spend", EMPTY_TOTALS)).toBeNull();
    expect(metricValueFromTotals("cpa_blended", T({ spend: 100 }))).toBeNull();
    expect(formatBreakdownValue("cpa_blended", null)).toBe("n/a");
  });
  it("cost metrics default to ascending sort", () => {
    expect(lowerIsBetter("cpa_blended")).toBe(true);
    expect(lowerIsBetter("spend")).toBe(false);
  });
});

// ─── Manager scope ────────────────────────────────────────────────────

function acct(id: string, opts: {
  window?: [string, string];
  events: Record<string, { spend: number; impressions: number; link_clicks: number; results: number; reach?: number; clicks_all?: number }>;
}): AdAccount {
  const blt: Record<string, any> = {};
  let spend = 0, imp = 0, lc = 0;
  for (const [k, e] of Object.entries(opts.events)) {
    blt[k] = { spend: e.spend, impressions: e.impressions, link_clicks: e.link_clicks, results: e.results, reach: e.reach ?? 0, clicks_all: e.clicks_all ?? e.link_clicks };
    spend += e.spend; imp += e.impressions; lc += e.link_clicks;
  }
  return {
    id, name: id.toUpperCase(), status: "configured", platform: "meta",
    iap: {
      campaign_summary: {
        bottom_line_totals: blt,
        total_spend_usd: spend, total_impressions: imp, total_link_clicks: lc,
        overall_link_ctr_pct: null, data_caveat: "",
        window_start: opts.window?.[0], window_end: opts.window?.[1],
      },
    } as any,
  } as AdAccount;
}

describe("buildManagerBreakdown", () => {
  const a = acct("alpha", { window: ["2026-01-01", "2026-03-31"], events: { registrations: { spend: 100, impressions: 10000, link_clicks: 500, results: 50 } } });
  const b = acct("beta", { window: ["2026-02-01", "2026-05-31"], events: { purchases: { spend: 300, impressions: 5000, link_clicks: 50, results: 10 } } });

  it("values each account over its own window with a per-row label", () => {
    const rows = buildManagerBreakdown([a, b], "spend");
    expect(rows.map((r) => [r.key, r.value])).toEqual([["alpha", 100], ["beta", 300]]);
    expect(rows[0].windowLabel).toBe("2026-01-01 → 2026-03-31");
    expect(rows[1].windowLabel).toBe("2026-02-01 → 2026-05-31");
  });

  it("per-account CTR is that account's own numerator/denominator — not an average", () => {
    const rows = buildManagerBreakdown([a, b], "link_ctr");
    expect(rows[0].value).toBeCloseTo(5); // 500/10000
    expect(rows[1].value).toBeCloseTo(1); // 50/5000
  });

  it("result-event metric an account doesn't track ⇒ n/a with a note, never zero", () => {
    const rows = buildManagerBreakdown([a, b], "result:purchases");
    const alpha = rows.find((r) => r.key === "alpha")!;
    const beta = rows.find((r) => r.key === "beta")!;
    expect(alpha.value).toBeNull();
    expect(alpha.formatted).toBe("n/a");
    expect(alpha.note).toMatch(/doesn't track/);
    expect(beta.value).toBe(10);
  });

  it("skips unconfigured accounts", () => {
    const un = { ...a, id: "raw", status: "unconfigured" } as AdAccount;
    expect(buildManagerBreakdown([a, un], "spend")).toHaveLength(1);
  });
});

describe("computeOverlapWindow", () => {
  it("intersects windows (max start, min end)", () => {
    expect(computeOverlapWindow([
      { start: "2026-01-01", end: "2026-03-31" },
      { start: "2026-02-01", end: "2026-05-31" },
    ])).toEqual({ start: "2026-02-01", end: "2026-03-31" });
  });
  it("null when windows don't intersect", () => {
    expect(computeOverlapWindow([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-03-01", end: "2026-03-31" },
    ])).toBeNull();
  });
  it("null when no account has a dated window", () => {
    expect(computeOverlapWindow([null, null])).toBeNull();
    expect(computeOverlapWindow([])).toBeNull();
  });
});

// ─── Account scope ────────────────────────────────────────────────────

const cell = (o: Partial<CellPerformanceRow>): CellPerformanceRow => ({
  cell_id: "C1H1", "Ad name": "ad", "Result type": "registrations",
  "Amount spent (USD)": 0, Reach: 0, Impressions: 0, Results: 0,
  "Clicks (all)": 0, "Link clicks": 0, CPA_result: null,
  CTR_link_pct: 0, Result_per_link_click_pct: 0,
  book2_concept_name: "Concept One",
  ...o,
} as CellPerformanceRow);

const analysis: AnalysisData = {
  performance_by_cell: [
    cell({ cell_id: "C1H1", book2_concept_name: "Concept One", "Amount spent (USD)": 100, Impressions: 1000, "Link clicks": 40, Results: 4 }),
    cell({ cell_id: "C1H2", book2_concept_name: "Concept One", "Amount spent (USD)": 50, Impressions: 500, "Link clicks": 10, Results: 1 }),
    cell({ cell_id: "C2H1", book2_concept_name: "Concept Two", "Amount spent (USD)": 200, Impressions: 4000, "Link clicks": 20, Results: 2, "Result type": "purchases" }),
  ],
  v3_variable_performance: [
    { variable_family: "hook", variable_id: "H1", "Result type": "registrations", "Amount spent (USD)": 300, Reach: 0, Impressions: 5000, Results: 6, "Clicks (all)": 60, "Link clicks": 60, unique_ads: 2, CPA_result: 50, CTR_link_pct: 1.2, Result_per_link_click_pct: 10 },
  ],
  demographic_registration_signal: [
    { cell_id: "C1H1", "Ad name": "ad", Age: "25-34", Gender: "female", "Amount spent (USD)": 80, Reach: 0, Impressions: 800, Results: 3, "Clicks (all)": 30, "Link clicks": 30, CPA_result: null, CTR_link_pct: 0, Result_per_link_click_pct: 0 },
  ],
  v3_placement_signal: [
    { Placement: "Facebook Feed", Platform: "facebook", "Amount spent (USD)": 120, Impressions: 2000, "Link clicks": 25, Results: 3, CPA: null },
    { Placement: "Instagram Stories", Platform: "instagram", "Amount spent (USD)": 60, Impressions: 900, "Link clicks": 5, Results: 1, CPA: null },
  ],
  c4e_placement_signal: [],
  top_checkout_cells: [],
  top_checkout_variables: [],
  conversion_tracking_signal: {
    tracking_basis: "conversion", window_start: null, window_end: null, note: "",
    devices: [{ device: "mobile", date_start: "", date_end: "", link_clicks: 90, adds_to_cart: 9, checkouts_initiated: 5, purchases: 2 } as any],
    platforms: [],
    placements: [],
  },
};

describe("listBreakdownDimensions", () => {
  it("lists only dimensions backed by data, tagged with tracking basis", () => {
    const dims = listBreakdownDimensions(analysis);
    const ids = dims.map((d) => d.id);
    expect(ids).toContain("concept");
    expect(ids).toContain("cell");
    expect(ids).toContain("var:hook");
    expect(ids).toContain("avatar");
    expect(ids).toContain("placement");
    expect(ids).toContain("conv:device");
    expect(ids).not.toContain("conv:platform"); // no rows
    expect(dims.find((d) => d.id === "conv:device")!.basis).toBe("conversion");
  });
  it("empty for null analysis", () => {
    expect(listBreakdownDimensions(null)).toEqual([]);
  });
});

describe("tracking-basis separation", () => {
  it("conversion dimensions reject every delivery metric except link clicks", () => {
    expect(dimensionMetricRestriction("conv:device", "spend")).toMatch(/never mix/);
    expect(dimensionMetricRestriction("conv:device", "cpa_blended")).toBeTruthy();
    expect(dimensionMetricRestriction("conv:device", "link_clicks")).toBeNull();
  });
  it("restricted pairs produce no rows", () => {
    expect(buildAccountBreakdown(analysis, "conv:device", "spend")).toEqual([]);
  });
  it("conversion rows expose link clicks only", () => {
    const rows = buildAccountBreakdown(analysis, "conv:device", "link_clicks");
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(90);
    expect(rows[0].spend).toBeNull(); // no delivery data on this basis
  });
  it("per-event results can't scope to demographic/placement dimensions", () => {
    expect(dimensionMetricRestriction("avatar", "result:registrations")).toBeTruthy();
    expect(dimensionMetricRestriction("cell", "result:registrations")).toBeNull();
  });
});

describe("buildAccountBreakdown", () => {
  it("groups cells by concept with summed totals and recomputed CTR", () => {
    const rows = buildAccountBreakdown(analysis, "concept", "link_ctr");
    const one = rows.find((r) => r.key === "Concept One")!;
    // (40+10)/(1000+500) = 3.333% — never (4% + 2%)/2
    expect(one.value).toBeCloseTo((50 / 1500) * 100);
  });
  it("scopes result:* metrics by Result type", () => {
    const rows = buildAccountBreakdown(analysis, "concept", "result:purchases");
    expect(rows.map((r) => [r.key, r.value])).toEqual([["Concept Two", 2]]);
  });
  it("respects pre-scoped cell rows (window/run scope)", () => {
    const rows = buildAccountBreakdown(analysis, "cell", "spend", analysis.performance_by_cell.slice(0, 1));
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("C1H1");
  });
  it("avatar and placement dimensions aggregate their signal rows", () => {
    expect(buildAccountBreakdown(analysis, "avatar", "spend")[0].value).toBe(80);
    const plat = buildAccountBreakdown(analysis, "platform", "spend");
    expect(plat.map((r) => [r.key, r.value]).sort()).toEqual([["facebook", 120], ["instagram", 60]]);
  });
});

describe("sortBreakdownRows", () => {
  const rows = buildAccountBreakdown(analysis, "concept", "spend");
  it("sorts by value in either direction, n/a rows always trailing", () => {
    const withNa = [...rows, { key: "x", label: "x", value: null, formatted: "n/a", spend: null, results: null }];
    const desc = sortBreakdownRows(withNa, "desc");
    expect(desc.map((r) => r.key)).toEqual(["Concept Two", "Concept One", "x"]);
    const asc = sortBreakdownRows(withNa, "asc");
    expect(asc.map((r) => r.key)).toEqual(["Concept One", "Concept Two", "x"]);
  });
});
