// ─── Account-aware seed assembly tests ─────────────────────────────────
// Locks in the multi-account behavior: buildAccountObject must build a
// full IAP object for any account with ad_performance rows, and an honest
// pending shape (iap: null) for accounts without — no hardcoded account
// ids anywhere.

import { describe, it, expect } from "vitest";
import {
  buildAccountObject,
  groupByAccount,
  type AccountTables,
} from "../metrixSeedAssembly";

type Row = Record<string, any>;

const emptyTables = (): AccountTables => ({
  adPerformance: new Map(),
  conceptPerformance: new Map(),
  campaignWindows: new Map(),
  dataQualityFlags: new Map(),
  libraryCells: new Map(),
  libraryCellPerformance: new Map(),
  variablePerformance: new Map(),
  demographicSignal: new Map(),
  placementSignal: new Map(),
  devicePerformance: new Map(),
  platformPerformance: new Map(),
  placementPerformance: new Map(),
  messagePillars: new Map(),
  testingHypotheses: new Map(),
  icpProfiles: new Map(),
  variableCombinations: new Map(),
  creativeBriefs: new Map(),
  iapRuns: new Map(),
  conceptIntelligence: new Map(),
  failurePatterns: new Map(),
  adsRegistry: new Map(),
  accountModules: [],
  signalCards: [],
});

const perfRow = (accountId: string, over: Row = {}): Row => ({
  account_id: accountId,
  book: "BOOK0",
  ad_name: "ad_1",
  result_type: "onb_complete_registration",
  date_start: "2026-06-01",
  date_end: "2026-06-30",
  spend: 100,
  impressions: 10_000,
  reach: 8_000,
  clicks_all: 200,
  link_clicks: 150,
  results: 10,
  ...over,
});

describe("groupByAccount", () => {
  it("groups rows by account_id preserving fetch order within each group", () => {
    const grouped = groupByAccount([
      { account_id: "a", n: 1 },
      { account_id: "b", n: 2 },
      { account_id: "a", n: 3 },
    ]);
    expect([...grouped.keys()]).toEqual(["a", "b"]);
    expect(grouped.get("a")!.map((r) => r["n"])).toEqual([1, 3]);
    expect(grouped.get("b")!.map((r) => r["n"])).toEqual([2]);
  });
});

describe("buildAccountObject", () => {
  it("builds the honest pending shape for an account with no performance data", () => {
    const account = {
      id: "act_999",
      name: "New Live Account",
      status: "unconfigured",
      platform: "Meta Ads",
      meta_ad_account_id: "999",
      overview_state: { title: "Analysis not run yet" },
    };
    const obj = buildAccountObject(account, emptyTables());
    expect(obj["iap"]).toBeNull();
    expect(obj["status"]).toBe("unconfigured");
    expect(obj["mst"]).toEqual({ status: "not_available" });
    expect(obj["overview_state"]).toEqual({ title: "Analysis not run yet" });
    expect(obj["meta_ad_account_id"]).toBe("999");
    // Pending accounts must not fabricate performance surfaces.
    expect(obj["listen"]).toBeUndefined();
    expect(obj["ads"]).toBeUndefined();
  });

  it("builds a full IAP object for ANY account id that has performance rows", () => {
    const accountId = "some_new_account";
    const t = emptyTables();
    t.adPerformance = groupByAccount([
      perfRow(accountId, { book: "BOOK0", spend: 60, date_start: "2026-06-01" }),
      perfRow(accountId, { book: "BOOK1", spend: 40, date_start: "2026-05-15", date_end: "2026-06-10" }),
    ]);
    const obj = buildAccountObject(
      { id: accountId, name: "Any Account", status: "configured", platform: "Meta Ads" },
      t,
    );
    expect(obj["iap"]).not.toBeNull();
    const summary = obj["iap"]["campaign_summary"];
    expect(summary["total_spend_usd"]).toBe(100);
    expect(summary["window_start"]).toBe("2026-05-15");
    expect(summary["window_end"]).toBe("2026-06-30");
    expect(summary["data_caveat"]).toContain("across BOOK0 and BOOK1");
    // Honest states for stages that never ran.
    expect(obj["iap"]["optimization_loop"]).toBeNull();
    expect(obj["iap"]["loop_status"]).toEqual([]);
  });

  it("surfaces conversion-based device/platform/placement rows and never mixes in delivery-based rows", () => {
    const accountId = "littledata_like";
    const t = emptyTables();
    t.adPerformance = groupByAccount([perfRow(accountId)]);
    t.devicePerformance = groupByAccount([
      {
        account_id: accountId,
        device: "iphone",
        date_start: "2026-01-01",
        date_end: "2026-07-09",
        spend: null,
        impressions: null,
        link_clicks: 932,
        adds_to_cart: 55,
        checkouts_initiated: 0,
        purchases: 0,
        confidence: "validation_required",
        tracking_basis: "conversion",
      },
      // Delivery-based row (legacy semantics) must NOT leak into the surface.
      {
        account_id: accountId,
        device: "android",
        link_clicks: 999,
        tracking_basis: null,
      },
    ]);
    t.platformPerformance = groupByAccount([
      {
        account_id: accountId,
        platform: "facebook",
        date_start: "2026-01-01",
        date_end: "2026-07-09",
        link_clicks: 787,
        adds_to_cart: 40,
        checkouts_initiated: 1,
        purchases: 2,
        confidence: "validation_required",
        tracking_basis: "conversion",
      },
    ]);
    const obj = buildAccountObject({ id: accountId, name: "LD", status: "configured" }, t);
    const signal = obj["iap"]["analysis"]["conversion_tracking_signal"];
    expect(signal).toBeDefined();
    expect(signal["tracking_basis"]).toBe("conversion");
    expect(signal["window_start"]).toBe("2026-01-01");
    expect(signal["window_end"]).toBe("2026-07-09");
    // Only the conversion-tracked device row; the delivery row is excluded.
    expect(signal["devices"].map((d: Row) => d["device"])).toEqual(["iphone"]);
    expect(signal["devices"][0]["link_clicks"]).toBe(932);
    expect(signal["devices"][0]["purchases"]).toBe(0);
    expect(signal["platforms"]).toHaveLength(1);
    expect(signal["platforms"][0]["purchases"]).toBe(2);
    expect(signal["placements"]).toEqual([]);
  });

  it("omits conversion_tracking_signal entirely when no conversion-tracked rows exist", () => {
    const accountId = "bookster_like";
    const t = emptyTables();
    t.adPerformance = groupByAccount([perfRow(accountId)]);
    t.devicePerformance = groupByAccount([
      { account_id: accountId, device: "android", link_clicks: 10, tracking_basis: null },
    ]);
    const obj = buildAccountObject({ id: accountId, name: "B", status: "configured" }, t);
    expect(obj["iap"]["analysis"]["conversion_tracking_signal"]).toBeUndefined();
  });

  it("builds a single-book second account (book NULL, funnel columns NULL) alongside the first without leakage", () => {
    const t = emptyTables();
    t.adPerformance = groupByAccount([
      perfRow("bookster_like", { book: "BOOK0", spend: 100 }),
      // LittleData-style rows: no book taxonomy, no funnel columns.
      perfRow("littledata_like", {
        book: null,
        ad_name: "1 Print Static",
        result_type: "Website purchases",
        date_start: "2026-05-03",
        date_end: "2026-06-27",
        spend: 107.24,
        impressions: 3160,
        reach: null,
        clicks_all: null,
        link_clicks: null,
        results: 1,
      }),
      perfRow("littledata_like", {
        book: null,
        ad_name: "9 Image + Discount",
        result_type: "Website purchases",
        date_start: "2026-05-03",
        date_end: "2026-06-27",
        spend: 364.86,
        impressions: 11797,
        reach: null,
        clicks_all: null,
        link_clicks: null,
        results: 0,
      }),
    ]);
    t.libraryCellPerformance = groupByAccount([
      { account_id: "bookster_like", payload: { cell_id: "C2B" } },
      { account_id: "littledata_like", payload: { cell_id: "1 Print Static" } },
    ]);
    t.iapRuns = groupByAccount([
      { account_id: "littledata_like", stage: "bundle_prep", status: "complete" },
      { account_id: "littledata_like", stage: "analysis_core", status: "complete" },
      { account_id: "littledata_like", stage: "strategy_map", status: "pending", note: "Not yet run" },
      { account_id: "littledata_like", stage: "optimization_loop", status: "pending", note: "Not yet run" },
    ]);
    t.accountModules = [
      {
        account_id: "littledata_like",
        module: "mst",
        payload: { status: "not_available", render_policy: "strategy_map has not run", historical_matrix_4x4: null, source_artifacts: [] },
      },
      {
        account_id: "littledata_like",
        module: "core_reanalysis_read",
        payload: { primary_control: "No control established — pre-signal account", primary_control_read: "Pre-signal.", data_caveat: "Mixed attribution; no funnel columns." },
      },
    ];

    const ld = buildAccountObject(
      { id: "littledata_like", name: "City Street Print Brand", status: "configured", meta_ad_account_id: "1202182091204847" },
      t,
    );
    expect(ld["iap"]).not.toBeNull();
    const summary = ld["iap"]["campaign_summary"];
    expect(summary["total_spend_usd"]).toBeCloseTo(472.1, 2);
    expect(summary["window_start"]).toBe("2026-05-03");
    expect(summary["window_end"]).toBe("2026-06-27");
    // No book taxonomy → no "across BOOK…" clause; importer caveat appended.
    expect(summary["data_caveat"]).not.toContain("across");
    expect(summary["data_caveat"]).toContain("Mixed attribution; no funnel columns.");
    // NULL funnel columns coerce to 0 in totals, never fabricated numbers.
    expect(summary["total_link_clicks"]).toBe(0);
    expect(summary["overall_link_ctr_pct"]).toBe(0);
    // Honest stage states: mst not_available, later stages pending, no loop.
    expect(ld["mst"]["status"]).toBe("not_available");
    expect(ld["mst"]["historical_matrix_4x4"]).toBeNull();
    expect(ld["iap"]["optimization_loop"]).toBeNull();
    const stages = Object.fromEntries(
      ld["iap"]["loop_status"].map((s: Row) => [s["stage"], s["status"]]),
    );
    expect(stages).toEqual({
      bundle_prep: "complete",
      analysis_core: "complete",
      strategy_map: "pending",
      optimization_loop: "pending",
    });
    expect(ld["iap"]["core_reanalysis_read"]["primary_control_read"]).toBe("Pre-signal.");
    // No cross-account leakage in either direction.
    const ldCells = ld["iap"]["analysis"]["performance_by_cell"].map((c: Row) => c["cell_id"]);
    expect(ldCells).toEqual(["1 Print Static"]);
    const first = buildAccountObject(
      { id: "bookster_like", name: "Bookster", status: "configured" },
      t,
    );
    const firstCells = first["iap"]["analysis"]["performance_by_cell"].map((c: Row) => c["cell_id"]);
    expect(firstCells).toEqual(["C2B"]);
    expect(first["iap"]["campaign_summary"]["total_spend_usd"]).toBe(100);
    expect(first["mst"]["status"]).toBe("active"); // no mst module row → default
  });

  it("prefers authoritative account-level totals from iap_metadata.account_totals and spells out ad-level coverage", () => {
    const t = emptyTables();
    t.adPerformance = groupByAccount([
      perfRow("ld", {
        book: null,
        ad_name: "1 Print Static",
        result_type: "Website purchases",
        date_start: "2026-05-03",
        date_end: "2026-06-27",
        spend: 1000,
        impressions: 50_000,
        reach: null,
        clicks_all: null,
        link_clicks: null,
        results: 1,
      }),
    ]);
    t.accountModules = [
      {
        account_id: "ld",
        module: "iap_metadata",
        payload: {
          account_totals: {
            spend: 1651.69,
            impressions: 59_308,
            purchases: 2,
            blended_cpa: 825.85,
            link_clicks: null,
            result_type: "Website purchases",
          },
        },
      },
    ];
    const obj = buildAccountObject({ id: "ld", name: "LD", status: "configured" }, t);
    const summary = obj["iap"]["campaign_summary"];
    // Account totals win over the (partial) ad-level sums…
    expect(summary["total_spend_usd"]).toBe(1651.69);
    expect(summary["total_impressions"]).toBe(59_308);
    const event = summary["bottom_line_totals"]["Website purchases"];
    expect(event["spend"]).toBe(1651.69);
    expect(event["impressions"]).toBe(59_308);
    expect(event["results"]).toBe(2);
    // …and the coverage gap is stated, never silent.
    expect(summary["data_caveat"]).toContain("the ad-level table covers $1000 of the $1651.69 account spend");
    // Null link_clicks in the override never clobbers row-derived values.
    expect(summary["total_link_clicks"]).toBe(0);
  });

  it("keeps row sums untouched when the account spans multiple result types (override would double-count)", () => {
    const t = emptyTables();
    t.adPerformance = groupByAccount([
      perfRow("multi", { result_type: "onb_complete_registration", spend: 60, results: 3 }),
      perfRow("multi", { result_type: "onb_initiate_checkout", spend: 40, results: 1 }),
    ]);
    t.accountModules = [
      {
        account_id: "multi",
        module: "iap_metadata",
        payload: {
          account_totals: { spend: 500, impressions: 90_000, purchases: 9, result_type: "onb_complete_registration" },
        },
      },
    ];
    const obj = buildAccountObject({ id: "multi", name: "M", status: "configured" }, t);
    const summary = obj["iap"]["campaign_summary"];
    // Headline totals still honor the account-level export…
    expect(summary["total_spend_usd"]).toBe(500);
    // …but per-event rows are NOT rewritten (ambiguous attribution).
    expect(summary["bottom_line_totals"]["onb_complete_registration"]["spend"]).toBe(60);
    expect(summary["bottom_line_totals"]["onb_complete_registration"]["results"]).toBe(3);
  });

  it("scopes listen signal cards to the account", () => {
    const t = emptyTables();
    t.adPerformance = groupByAccount([perfRow("acct_a")]);
    t.signalCards = [
      { card_id: "c1", account_id: "acct_a", surface: "listen" },
      { card_id: "c2", account_id: "acct_b", surface: "listen" },
      { card_id: "c3", account_id: "acct_a", surface: "manager_overview" },
    ];
    const obj = buildAccountObject(
      { id: "acct_a", name: "A", status: "configured" },
      t,
    );
    expect(obj["listen"]["signal_cards"].map((c: Row) => c["id"])).toEqual(["c1"]);
  });
});
