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

  it("returns null ATC rate when no row has adds_to_cart data (account carries the event)", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: null })], { events: ["Adds to cart"] });
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

  // SUPERSEDED by the aggregation-null policy (owner decision on BUG-11,
  // carried forward as C5). This case used to assert that a null
  // adds_to_cart row counts as 0 so long as one row carried data — which
  // is precisely the partial sum the policy forbids: 40 measured ATCs were
  // divided by BOTH rows' link clicks, reporting 10% for a figure whose
  // real value is unknown. The rate is now null, and the sub-label says
  // how much of the selection was actually measured.
  it("does not fold a null adds_to_cart row into a measured total", () => {
    const rows = [
      makeRow({ "Link clicks": 200, Results: 10, adds_to_cart: 40 }),
      makeRow({ "Link clicks": 200, Results: 10, adds_to_cart: null }),
    ];
    const catalog = buildLibraryMetricCatalog(rows);
    const atc = catalog.find((m) => m.id === "lib_atc_rate")!;
    expect(atc.value).toBeNull();
    expect(atc.sub).toContain("1 of 2");
  });

  it("has a descriptive sub-label when data is absent", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: null })], { events: ["Adds to cart"] });
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

  it("returns null checkout rate when no data present (account carries the event)", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ checkouts_initiated: null })], { events: ["onb_initiate_checkout"] });
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

  it("returns null cost per ATC when no adds_to_cart data (account carries the event)", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ adds_to_cart: null })], { events: ["Adds to cart"] });
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

  it("returns null cost per checkout when no checkout data (account carries the event)", () => {
    const catalog = buildLibraryMetricCatalog([makeRow({ checkouts_initiated: null })], { events: ["onb_initiate_checkout"] });
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

// G7: the ATC / checkout tiles used to exist for every account — an
// ecommerce funnel assumed for every vertical. They exist only for an
// account that carries the event: as a result type, or as a measured
// funnel column on its rows.
describe("buildLibraryMetricCatalog · lower-funnel IDs are gated on the events present", () => {
  const ATC_IDS = ["lib_atc_rate", "lib_cost_per_atc"];
  const CHK_IDS = ["lib_checkout_rate", "lib_cost_per_checkout"];

  it("includes every lower-funnel ID when the account's result events carry both steps", () => {
    const catalog = buildLibraryMetricCatalog([makeRow()], { events: ["Website purchases", "Adds to cart", "onb_initiate_checkout"] });
    const ids = catalog.map((m) => m.id);
    for (const id of ["lib_cvr", ...ATC_IDS, ...CHK_IDS]) expect(ids).toContain(id);
  });

  it("omits the ATC and checkout tiles entirely for an account with neither event nor column", () => {
    const ids = buildLibraryMetricCatalog([makeRow()], { events: ["Leads (form)"] }).map((m) => m.id);
    expect(ids).toContain("lib_cvr");
    for (const id of [...ATC_IDS, ...CHK_IDS]) expect(ids).not.toContain(id);
  });

  it("omits them with no account context at all when no row carries the column", () => {
    const ids = buildLibraryMetricCatalog([makeRow()]).map((m) => m.id);
    for (const id of [...ATC_IDS, ...CHK_IDS]) expect(ids).not.toContain(id);
  });

  it("a measured funnel column on any row is evidence the account carries that event (a real 0 counts, null does not)", () => {
    const withAtc = buildLibraryMetricCatalog([makeRow({ adds_to_cart: 0 }), makeRow({ cell_id: "C3B", adds_to_cart: null })]).map((m) => m.id);
    for (const id of ATC_IDS) expect(withAtc).toContain(id);
    for (const id of CHK_IDS) expect(withAtc).not.toContain(id);
  });

  it("gates each step independently", () => {
    const ids = buildLibraryMetricCatalog([makeRow()], { events: ["Website purchases", "Checkouts initiated"] }).map((m) => m.id);
    for (const id of CHK_IDS) expect(ids).toContain(id);
    for (const id of ATC_IDS) expect(ids).not.toContain(id);
  });
});

// ─── Aggregation-null policy: partial coverage (C5) ────────────────────
//
// The lower-funnel totals used to aggregate on "ANY row carries the field"
// and fold the rest with `?? 0`. Three measured cells out of eleven summed
// to a figure that rendered exactly like a complete one, then divided by a
// COMPLETE link-click denominator — understating every rate it fed, with
// nothing on screen indicating a partial sum. These pin the one policy
// (lib/strict-sum): null unless every row in the selection carries it.

describe("buildLibraryMetricCatalog · partial coverage is never summed", () => {
  const measured = makeRow({ adds_to_cart: 40, checkouts_initiated: 10 });
  const unmeasured = makeRow({ cell_id: "C3B", adds_to_cart: null, checkouts_initiated: null });

  it("returns null for ATC/checkout totals when only some rows carry the field", () => {
    const cat = buildLibraryMetricCatalog([measured, unmeasured]);
    for (const id of ["lib_atc_rate", "lib_checkout_rate", "lib_cost_per_atc", "lib_cost_per_checkout"]) {
      const m = cat.find((x) => x.id === id);
      expect(m, id).toBeTruthy();
      expect(m!.value, id).toBeNull();
    }
  });

  it("explains the null with real coverage counts rather than a bare dash", () => {
    const cat = buildLibraryMetricCatalog([measured, unmeasured]);
    const atc = cat.find((x) => x.id === "lib_atc_rate")!;
    expect(atc.sub).toContain("1 of 2");
    expect(atc.sub).toContain("adds-to-cart");
    const chk = cat.find((x) => x.id === "lib_checkout_rate")!;
    expect(chk.sub).toContain("1 of 2");
    expect(chk.sub).toContain("checkouts initiated");
  });

  it("still sums when every row in the selection carries the field", () => {
    const other = makeRow({ cell_id: "C3B", adds_to_cart: 20, checkouts_initiated: 5 });
    const cat = buildLibraryMetricCatalog([measured, other]);
    // 60 adds-to-cart over 800 link clicks
    expect(cat.find((x) => x.id === "lib_atc_rate")!.value).toBeCloseTo((60 / 800) * 100, 6);
    // $2000 spend over 60 adds-to-cart
    expect(cat.find((x) => x.id === "lib_cost_per_atc")!.value).toBeCloseTo(2000 / 60, 6);
  });

  it("keeps the multi-event guard ahead of the coverage note", () => {
    const otherEvent = makeRow({ "Result type": "Lead", adds_to_cart: 20, checkouts_initiated: 5 });
    const cat = buildLibraryMetricCatalog([measured, otherEvent]);
    const atc = cat.find((x) => x.id === "lib_atc_rate")!;
    expect(atc.value).toBeNull();
    expect(atc.sub).toBe("select one event to see funnel metrics");
  });
});
