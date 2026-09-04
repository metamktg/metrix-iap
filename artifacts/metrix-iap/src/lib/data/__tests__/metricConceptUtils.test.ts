// ─── metricConceptUtils — unit tests ───────────────────────────────────
// This module backs both MetricHoverPopover's quick "Top concepts" preview
// and (via the same ranking logic) must stay in agreement with
// kpiBreakdown.ts's full drill-down math. Covers two audit-confirmed bugs:
//
//   BUG 1 — cvr/ctr_all/cpc/cpm fell through conceptMetricValue's `default`
//   (raw spend) and were summed per-row instead of recomputed as a ratio
//   from each concept's summed numerator/denominator. A per-row average or
//   a raw spend-sum would both silently disagree with kpiBreakdown.ts's
//   metricValueFromTotals for the same rows.
//
//   BUG 2 — a zero-results cell for cpa_blended/cost:<event> computed to 0
//   instead of null, so it rendered "$0.00" and sorted first (cheapest)
//   ahead of every cell with a real positive CPA.

import { describe, it, expect } from "vitest";
import {
  conceptMetricValue, formatConceptMetricValue, topConceptsForMetric, RATE_METRIC_IDS,
} from "../metricConceptUtils";
import type { CellPerformanceRow } from "../seedTypes";
import type { MetricDef } from "../metricsCatalog";

// ── Fixture helpers ────────────────────────────────────────────────────

function row(overrides: Partial<CellPerformanceRow> & { cell_id: string; book2_concept_name: string }): CellPerformanceRow {
  return {
    "Result type": "Website purchases",
    "Amount spent (USD)": 0,
    Reach: 0,
    Impressions: 0,
    Results: 0,
    "Clicks (all)": 0,
    "Link clicks": 0,
    CPA_result: null,
    CTR_link_pct: 0,
    Result_per_link_click_pct: 0,
    ...overrides,
  };
}

function metric(id: string, overrides: Partial<MetricDef> = {}): MetricDef {
  return { id, label: id, value: null, formatted: "", isResultEvent: false, ...overrides };
}

// ── Ratio metrics — summed numerator/denominator, never per-row averaged ──

describe("topConceptsForMetric · ratio metric aggregation (cvr, ctr_all, cpc, cpm)", () => {
  // topConceptsForMetric groups rows by cell_id (a concept's single creative
  // cell can carry multiple rows — e.g. one per result-event type on a
  // multi-event account — matching how performance_by_cell is really
  // shaped). Same cell_id, two very different rows, so a naive per-row
  // average AND a naive "sum the per-row ratio" would both land on a
  // different number than the correct summed-numerator/denominator ratio.
  const alphaRows: CellPerformanceRow[] = [
    row({
      cell_id: "cell-alpha", book2_concept_name: "Alpha",
      "Amount spent (USD)": 100, Impressions: 1000, "Clicks (all)": 200, "Link clicks": 100, Results: 20,
    }),
    row({
      cell_id: "cell-alpha", book2_concept_name: "Alpha",
      "Amount spent (USD)": 600, Impressions: 3000, "Clicks (all)": 300, "Link clicks": 300, Results: 10,
    }),
  ];
  // Second concept (a different cell_id) so the fixture is genuinely
  // multi-row/multi-concept.
  const betaRow: CellPerformanceRow = row({
    cell_id: "cell-beta", book2_concept_name: "Beta",
    "Amount spent (USD)": 50, Impressions: 500, "Clicks (all)": 50, "Link clicks": 25, Results: 1,
  });
  const rows = [...alphaRows, betaRow];

  it("cvr = summed results ÷ summed link clicks × 100, not a per-row average", () => {
    const concepts = topConceptsForMetric(rows, metric("cvr"), 5);
    const alpha = concepts.find((c) => c.name === "Alpha")!;
    // Correct: (20 + 10) / (100 + 300) * 100 = 7.5
    expect(alpha.value).toBeCloseTo(7.5, 6);
    // Wrong hypothesis (naive per-row average): (20% + 3.33%) / 2 ≈ 11.67
    expect(alpha.value).not.toBeCloseTo(11.6667, 2);
    expect(alpha.metricDisplay).toBe("7.50%");
  });

  it("ctr_all = summed clicks (all) ÷ summed impressions × 100, not a per-row average", () => {
    const concepts = topConceptsForMetric(rows, metric("ctr_all"), 5);
    const alpha = concepts.find((c) => c.name === "Alpha")!;
    // Correct: (200 + 300) / (1000 + 3000) * 100 = 12.5
    expect(alpha.value).toBeCloseTo(12.5, 6);
    // Wrong hypothesis (naive per-row average): (20% + 10%) / 2 = 15
    expect(alpha.value).not.toBeCloseTo(15, 2);
    expect(alpha.metricDisplay).toBe("12.50%");
  });

  it("cpc = summed spend ÷ summed link clicks, not a per-row average or raw spend sum", () => {
    const concepts = topConceptsForMetric(rows, metric("cpc"), 5);
    const alpha = concepts.find((c) => c.name === "Alpha")!;
    // Correct: (100 + 600) / (100 + 300) = 1.75
    expect(alpha.value).toBeCloseTo(1.75, 6);
    // Wrong hypothesis (naive per-row average): (1.00 + 2.00) / 2 = 1.50
    expect(alpha.value).not.toBeCloseTo(1.5, 2);
    // Old bug's fallback (raw spend summed, mislabeled as the ratio metric)
    expect(alpha.value).not.toBeCloseTo(700, 2);
    expect(alpha.metricDisplay).toBe("$1.75");
  });

  it("cpm = summed spend ÷ summed impressions × 1000, not a per-row average or raw spend sum", () => {
    const concepts = topConceptsForMetric(rows, metric("cpm"), 5);
    const alpha = concepts.find((c) => c.name === "Alpha")!;
    // Correct: (100 + 600) / (1000 + 3000) * 1000 = 175
    expect(alpha.value).toBeCloseTo(175, 6);
    // Wrong hypothesis (naive per-row average): (100 + 200) / 2 = 150
    expect(alpha.value).not.toBeCloseTo(150, 2);
    // Old bug's fallback (raw spend summed, mislabeled as the ratio metric)
    expect(alpha.value).not.toBeCloseTo(700, 2);
    expect(alpha.metricDisplay).toBe("$175.00");
  });

  it("all four ratio ids are registered as rate metrics (aggregated, never per-row summed)", () => {
    expect(RATE_METRIC_IDS.has("cvr")).toBe(true);
    expect(RATE_METRIC_IDS.has("ctr_all")).toBe(true);
    expect(RATE_METRIC_IDS.has("cpc")).toBe(true);
    expect(RATE_METRIC_IDS.has("cpm")).toBe(true);
  });

  it("conceptMetricValue no longer falls through to the spend default for these ids", () => {
    const r = alphaRows[0];
    expect(conceptMetricValue(r, metric("ctr_all"))).toBeCloseTo(20, 6); // 200/1000*100
    expect(conceptMetricValue(r, metric("cpc"))).toBeCloseTo(1, 6); // 100/100
    expect(conceptMetricValue(r, metric("cpm"))).toBeCloseTo(100, 6); // 100/1000*1000
    expect(conceptMetricValue(r, metric("cvr"))).toBe(r.Result_per_link_click_pct);
  });
});

// ── Bug 2 — zero-results cost cells must be null, not a fabricated $0 ──

describe("topConceptsForMetric · cpa_blended / cost:<event> zero-results honesty", () => {
  const rows: CellPerformanceRow[] = [
    row({
      cell_id: "cell-real", book2_concept_name: "RealConversion",
      "Amount spent (USD)": 200, Results: 10, CPA_result: 20,
    }),
    row({
      cell_id: "cell-zero", book2_concept_name: "ZeroConversion",
      "Amount spent (USD)": 500, Results: 0, CPA_result: null,
    }),
  ];

  it("cpa_blended: a zero-results cell with real spend is null, not 0", () => {
    const concepts = topConceptsForMetric(rows, metric("cpa_blended"), 5);
    const zero = concepts.find((c) => c.name === "ZeroConversion")!;
    expect(zero.value).toBeNull();
    expect(zero.metricDisplay).toBe("n/a");
  });

  it("cpa_blended: the null cell never outranks a real positive-CPA cell in the ascending (cheapest-first) sort", () => {
    const concepts = topConceptsForMetric(rows, metric("cpa_blended"), 5);
    expect(concepts.map((c) => c.name)).toEqual(["RealConversion", "ZeroConversion"]);
    expect(concepts[0].value).toBeCloseTo(20, 6);
  });

  it("cost:<event> dynamic ids get the same null guard as cpa_blended", () => {
    const costMetric = metric("cost:Website purchases");
    const concepts = topConceptsForMetric(rows, costMetric, 5);
    const zero = concepts.find((c) => c.name === "ZeroConversion")!;
    const real = concepts.find((c) => c.name === "RealConversion")!;
    expect(zero.value).toBeNull();
    expect(zero.metricDisplay).toBe("n/a");
    expect(real.value).toBeCloseTo(20, 6);
    expect(concepts.map((c) => c.name)).toEqual(["RealConversion", "ZeroConversion"]);
  });

  it("formatConceptMetricValue renders a null value as n/a directly", () => {
    expect(formatConceptMetricValue(null, metric("cpa_blended"))).toBe("n/a");
    expect(formatConceptMetricValue(null, metric("cost:Website purchases"))).toBe("n/a");
  });
});

// ── Regression: pre-existing metric ids still behave as before ─────────

describe("topConceptsForMetric · regression coverage for already-correct metrics", () => {
  // Same cell_id for both rows — one concept's cell with two rows (see note
  // in the describe block above on why grouping is by cell_id).
  const rows: CellPerformanceRow[] = [
    row({ cell_id: "c1", book2_concept_name: "Alpha", "Amount spent (USD)": 100, Impressions: 1000, "Link clicks": 50, CTR_link_pct: 5 }),
    row({ cell_id: "c1", book2_concept_name: "Alpha", "Amount spent (USD)": 200, Impressions: 3000, "Link clicks": 150, CTR_link_pct: 5 }),
  ];

  it("spend sums naturally across a concept's rows", () => {
    const concepts = topConceptsForMetric(rows, metric("spend"), 5);
    expect(concepts[0].value).toBe(300);
    expect(concepts[0].metricDisplay).toBe("$300");
  });

  it("link_ctr is recomputed from summed link clicks ÷ summed impressions, not per-row summed", () => {
    const concepts = topConceptsForMetric(rows, metric("link_ctr"), 5);
    // (50 + 150) / (1000 + 3000) * 100 = 5
    expect(concepts[0].value).toBeCloseTo(5, 6);
    expect(concepts[0].metricDisplay).toBe("5.00%");
  });
});
