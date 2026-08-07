// ─── buildLibraryMetricCatalog lower-funnel metric tests ─────────────
// Covers:
//   · CVR, ATC rate, checkout rate, cost/ATC, cost/checkout computation
//   · Attribution-grain guard: all lower-funnel totals are null when
//     multiple result event types are selected (single-event only)
//   · Null sub-labels when data is absent
//   · Presence of all lower-funnel IDs in the catalog

import { describe, it, expect } from "vitest";
import { buildLibraryMetricCatalog } from "../metricsCatalog";
import type { CellPerformanceRow } from "../seedTypes";

// ─── Helper ────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<CellPerformanceRow> = {}): CellPerformanceRow {
  return {
    cell_id: "C2B",
    "Result type": "Purchase",
    stage: "A",
    Reach: 8000,
    Impressions: 30000,
    "Link clicks": 400,
    "Clicks (all)": 450,
    Results: 20,
    "Amount spent (USD)": 1000,
    CPA_result: 50,
    CTR_link_pct: 1.33,
    Result_per_link_click_pct: 5,
    iap_read: false,
    book2_concept_name: "ConceptA",
    adds_to_cart: null,
    checkouts_initiated: null,
    purchases: null,
    ...overrides,
  } as unknown as CellPerformanceRow;
}

// ─── CVR tile ──────────────────────────────────────────────────────────

describe("buildLibraryMetricCatalog · lib_cvr", () => {
  it("computes CVR as results ÷ link_clicks × 100 (single event)", () => {
    // 20 results / 400 link clicks = 5%
    const catalog = buildLibraryMetricCatalog([makeRow()]);
    const cvr = catalog.find((m) => m.id === "lib_cvr");
    expect(cvr).toBeTruthy();
    expect(cvr!.value).toBeCloseTo(5, 2);
  });

  it("returns null CVR when link clicks is zero", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ "Link clicks": 0 })]);
    expect(catalog.find((m) => m.id === "lib_cvr")!.value).toBeNull();
  });

  it("returns null CVR for multi-event selection (linkClicks is null in that case)", () => {
    const rows = [
      makeRow({ "Result type": "Purchase",    "Link clicks": 200, Results: 10 }),
      makeRow({ "Result type": "Add to Cart", "Link clicks": 200, Results: 5 }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    // singleEvent=false → linkClicks=null → cvr=null
    expect(catalog.find((m) => m.id === "lib_cvr")!.value).toBeNull();
  });
});

// ─── ATC rate tile ─────────────────────────────────────────────────────

describe("buildLibraryMetricCatalog · lib_atc_rate · single event", () => {
  it("computes ATC rate as adds_to_cart ÷ link_clicks × 100", () => {
    // 60 ATC / 400 link clicks = 15%
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: 60 })]);
    expect(catalog.find((m) => m.id === "lib_atc_rate")!.value).toBeCloseTo(15, 2);
  });

  it("returns null ATC rate when no row has adds_to_cart data", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: null })]);
    expect(catalog.find((m) => m.id === "lib_atc_rate")!.value).toBeNull();
  });

  it("sums adds_to_cart correctly across multiple single-event rows", () => {
    // Same result type → singleEvent=true; link_clicks sums to 400
    const rows = [
      makeRow({ "Link clicks": 200, Results: 10, adds_to_cart: 30 }),
      makeRow({ "Link clicks": 200, Results: 10, adds_to_cart: 10 }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    // 40 ATC / 400 link clicks * 100 = 10%
    expect(catalog.find((m) => m.id === "lib_atc_rate")!.value).toBeCloseTo(10, 2);
  });

  it("treats null adds_to_cart rows as 0 when at least one row has data", () => {
    const rows = [
      makeRow({ "Link clicks": 200, Results: 10, adds_to_cart: 40 }),
      makeRow({ "Link clicks": 200, Results: 10, adds_to_cart: null }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    // 40 ATC / 400 link clicks * 100 = 10%
    expect(catalog.find((m) => m.id === "lib_atc_rate")!.value).toBeCloseTo(10, 2);
  });

  it("has a descriptive sub-label when data is absent", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: null })]);
    expect(catalog.find((m) => m.id === "lib_atc_rate")!.sub).toContain("no conversion");
  });
});

describe("buildLibraryMetricCatalog · lib_atc_rate · multi-event guard", () => {
  // ATTRIBUTION GRAIN: performance_by_cell has one row per cell×result-event.
  // When multiple event types are selected, the same physical ATC action
  // appears on each event row — summing would double-count. Must be null.

  it("returns null ATC rate when multiple result event types are selected", () => {
    const rows = [
      makeRow({ "Result type": "Purchase",    "Link clicks": 200, adds_to_cart: 30 }),
      makeRow({ "Result type": "Add to Cart", "Link clicks": 200, adds_to_cart: 10 }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    expect(catalog.find((m) => m.id === "lib_atc_rate")!.value).toBeNull();
  });

  it("returns null cost/ATC when multiple event types are selected", () => {
    const rows = [
      makeRow({ "Result type": "Purchase",    adds_to_cart: 30 }),
      makeRow({ "Result type": "Add to Cart", adds_to_cart: 10 }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    expect(catalog.find((m) => m.id === "lib_cost_per_atc")!.value).toBeNull();
  });

  it("multi-event sub-label says to select one event", () => {
    const rows = [
      makeRow({ "Result type": "Purchase",    adds_to_cart: 30 }),
      makeRow({ "Result type": "Add to Cart", adds_to_cart: 10 }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    const sub = catalog.find((m) => m.id === "lib_atc_rate")!.sub ?? "";
    expect(sub).toMatch(/select one event/i);
  });
});

// ─── Checkout rate tile ────────────────────────────────────────────────

describe("buildLibraryMetricCatalog · lib_checkout_rate", () => {
  it("computes checkout rate as checkouts ÷ link_clicks × 100 (single event)", () => {
    // 32 checkouts / 400 link clicks = 8%
    const catalog = buildLibraryMetricCatalog([makeRow({ checkouts_initiated: 32 })]);
    expect(catalog.find((m) => m.id === "lib_checkout_rate")!.value).toBeCloseTo(8, 2);
  });

  it("returns null checkout rate when no data present", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ checkouts_initiated: null })]);
    expect(catalog.find((m) => m.id === "lib_checkout_rate")!.value).toBeNull();
  });

  it("returns null checkout rate when multiple event types are selected (anti-double-count)", () => {
    const rows = [
      makeRow({ "Result type": "Purchase",    checkouts_initiated: 20 }),
      makeRow({ "Result type": "Add to Cart", checkouts_initiated: 5 }),
    ];
    expect(buildLibraryMetricCatalog(rows).find((m) => m.id === "lib_checkout_rate")!.value).toBeNull();
  });
});

// ─── Cost per ATC tile ─────────────────────────────────────────────────

describe("buildLibraryMetricCatalog · lib_cost_per_atc", () => {
  it("computes cost per ATC as spend ÷ total_atc (single event)", () => {
    // spend=1000, atc=60 → 16.67
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: 60 })]);
    expect(catalog.find((m) => m.id === "lib_cost_per_atc")!.value).toBeCloseTo(1000 / 60, 1);
  });

  it("returns null cost per ATC when no adds_to_cart data", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: null })]);
    expect(catalog.find((m) => m.id === "lib_cost_per_atc")!.value).toBeNull();
  });

  it("returns null cost per ATC when multiple event types are selected", () => {
    const rows = [
      makeRow({ "Result type": "Purchase",    adds_to_cart: 60 }),
      makeRow({ "Result type": "Registration", adds_to_cart: 20 }),
    ];
    expect(buildLibraryMetricCatalog(rows).find((m) => m.id === "lib_cost_per_atc")!.value).toBeNull();
  });
});

// ─── Cost per checkout tile ────────────────────────────────────────────

describe("buildLibraryMetricCatalog · lib_cost_per_checkout", () => {
  it("computes cost per checkout as spend ÷ total_checkouts (single event)", () => {
    // spend=1000, checkouts=32 → 31.25
    const catalog = buildLibraryMetricCatalog([makeRow({ checkouts_initiated: 32 })]);
    expect(catalog.find((m) => m.id === "lib_cost_per_checkout")!.value).toBeCloseTo(1000 / 32, 1);
  });

  it("returns null cost per checkout when no checkout data", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ checkouts_initiated: null })]);
    expect(catalog.find((m) => m.id === "lib_cost_per_checkout")!.value).toBeNull();
  });
});

// ─── Fixture-derived expected values (C2B, singleEvent) ───────────────

describe("buildLibraryMetricCatalog · fixture-derived C2B values (single event, registrations)", () => {
  // From the fixture: C2B "Website registrations completed" row
  //   Link clicks: 463, adds_to_cart: 69, checkouts_initiated: 37, purchases: 23, spend: 675.81
  const fixtureRow = makeRow({
    "Result type": "Website registrations completed",
    "Link clicks": 463,
    Impressions: 30803,
    Results: 15,
    "Amount spent (USD)": 675.81,
    adds_to_cart: 69,
    checkouts_initiated: 37,
    purchases: 23,
  });

  it("computes ATC rate ≈ 14.9% for C2B registrations", () => {
    const catalog = buildLibraryMetricCatalog([fixtureRow]);
    const rate = catalog.find((m) => m.id === "lib_atc_rate")!.value;
    expect(rate).toBeCloseTo((69 / 463) * 100, 1); // ~14.9%
  });

  it("computes checkout rate ≈ 8.0% for C2B registrations", () => {
    const catalog = buildLibraryMetricCatalog([fixtureRow]);
    const rate = catalog.find((m) => m.id === "lib_checkout_rate")!.value;
    expect(rate).toBeCloseTo((37 / 463) * 100, 1); // ~7.99%
  });

  it("computes cost per ATC ≈ $9.79 for C2B registrations", () => {
    const catalog = buildLibraryMetricCatalog([fixtureRow]);
    const cost = catalog.find((m) => m.id === "lib_cost_per_atc")!.value;
    expect(cost).toBeCloseTo(675.81 / 69, 1); // ~$9.79
  });

  it("computes cost per checkout ≈ $18.27 for C2B registrations", () => {
    const catalog = buildLibraryMetricCatalog([fixtureRow]);
    const cost = catalog.find((m) => m.id === "lib_cost_per_checkout")!.value;
    expect(cost).toBeCloseTo(675.81 / 37, 1); // ~$18.27
  });
});

// ─── All lower-funnel IDs are present in the catalog ──────────────────

describe("buildLibraryMetricCatalog · lower-funnel IDs present", () => {
  const LOWER_IDS = ["lib_cvr", "lib_atc_rate", "lib_checkout_rate", "lib_cost_per_atc", "lib_cost_per_checkout"];

  it("includes all lower-funnel metric IDs in the returned catalog", () => {
    const catalog = buildLibraryMetricCatalog([makeRow()]);
    const ids = catalog.map((m) => m.id);
    for (const id of LOWER_IDS) {
      expect(ids).toContain(id);
    }
  });
});
