// ─── Account-aware seed assembly tests ─────────────────────────────────
// Locks in the multi-account behavior: buildAccountObject must build a
// full IAP object for any account with ad_performance rows, and an honest
// pending shape (iap: null) for accounts without — no hardcoded account
// ids anywhere.

import { describe, it, expect } from "vitest";
import {
  buildAccountObject,
  detectAccountsNeedingCreativeSync,
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
  cellCreativeOverrides: new Map(),
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

  it("derives avatar column → ICP profile links only from valid matrix-mode briefs", () => {
    const accountId = "linked";
    const t = emptyTables();
    t.adPerformance = groupByAccount([perfRow(accountId)]);
    t.icpProfiles = groupByAccount([
      { account_id: accountId, payload: { profile_id: "ICP_BOOK0_A" } },
      { account_id: accountId, payload: { profile_id: "ICP_BOOK0_B" } },
    ]);
    t.accountModules = [
      {
        account_id: accountId,
        module: "mst",
        payload: {
          status: "active",
          historical_matrix_4x4: {
            columns: [{ id: "C1" }, { id: "C2" }, { id: "C3" }, { id: "C4" }],
          },
        },
      },
    ];
    const brief = (over: Row): Row => ({ account_id: accountId, ...over });
    t.creativeBriefs = groupByAccount([
      // matrix-mode brief: "C1B" → column C1, target ICP_BOOK0_A.
      brief({
        payload: {
          brief_metadata: { mode: "matrix" },
          testing_framework: { matrix_position: "C1B" },
          strategic_foundation: { target_icp: "ICP_BOOK0_A" },
        },
      }),
      // Second matrix brief on the same column with a different profile —
      // links must accumulate and sort, not overwrite.
      brief({
        payload: {
          brief_metadata: { mode: "matrix" },
          testing_framework: { matrix_position: "C1A" },
          strategic_foundation: { target_icp: "ICP_BOOK0_B" },
        },
      }),
      // Parenthetical secondary ICP must be stripped to the leading token.
      brief({
        payload: {
          brief_metadata: { mode: "matrix" },
          testing_framework: { matrix_position: "C2A" },
          strategic_foundation: { target_icp: "ICP_BOOK0_B (secondary: ICP_BOOK0_A)" },
        },
      }),
      // General-mode brief (free-text position) must be ignored entirely.
      brief({
        payload: {
          brief_metadata: { mode: "general" },
          testing_framework: { matrix_position: "C1 hook variations" },
          strategic_foundation: { target_icp: "ICP_BOOK0_A" },
        },
      }),
      // Matrix brief pointing at an ICP that does not exist for this account —
      // dropped so no link is fabricated (C3 stays bare).
      brief({
        payload: {
          brief_metadata: { mode: "matrix" },
          testing_framework: { matrix_position: "C3D" },
          strategic_foundation: { target_icp: "ICP_BOOK0_Z" },
        },
      }),
    ]);

    const obj = buildAccountObject(
      { id: accountId, name: "Linked", status: "configured" },
      t,
    );
    const columns = obj["mst"]["historical_matrix_4x4"]["columns"] as Row[];
    const byId = Object.fromEntries(columns.map((c) => [c["id"], c]));
    // C1 accumulated both profiles, sorted.
    expect(byId["C1"]["matched_profile_ids"]).toEqual(["ICP_BOOK0_A", "ICP_BOOK0_B"]);
    // C2 normalized the parenthetical secondary down to the leading token.
    expect(byId["C2"]["matched_profile_ids"]).toEqual(["ICP_BOOK0_B"]);
    // C3's only brief referenced an unknown profile → no link field at all.
    expect(byId["C3"]["matched_profile_ids"]).toBeUndefined();
    // C4 had no brief → untouched.
    expect(byId["C4"]["matched_profile_ids"]).toBeUndefined();
    // The general-mode brief never leaked ICP_BOOK0_A onto a column via free text.
    expect(
      columns.every((c) => (c["matched_profile_ids"] ?? []).length <= 2),
    ).toBe(true);
  });

  it("links matrix-mode briefs regardless of the account's ICP id scheme (not just ICP_*)", () => {
    // LittleData profiles are LD-ICP-*; a hardcoded ICP_ prefix would have
    // silently dropped every link. The join must trust validProfileIds only.
    const accountId = "ld_scheme";
    const t = emptyTables();
    t.adPerformance = groupByAccount([perfRow(accountId)]);
    t.icpProfiles = groupByAccount([
      { account_id: accountId, payload: { profile_id: "LD-ICP-GIFTBUYER-YOUNG" } },
      { account_id: accountId, payload: { profile_id: "LD-ICP-CITY-LOYALIST" } },
    ]);
    t.accountModules = [
      {
        account_id: accountId,
        module: "mst",
        payload: {
          status: "active",
          historical_matrix_4x4: { columns: [{ id: "C1" }, { id: "C3" }] },
        },
      },
    ];
    t.creativeBriefs = groupByAccount([
      {
        account_id: accountId,
        payload: {
          brief_metadata: { mode: "matrix" },
          testing_framework: { matrix_position: "C1A — gift-moment story" },
          strategic_foundation: { target_icp: "LD-ICP-GIFTBUYER-YOUNG" },
        },
      },
      {
        account_id: accountId,
        payload: {
          brief_metadata: { mode: "matrix" },
          testing_framework: { matrix_position: "C3B — city pride" },
          strategic_foundation: { target_icp: "LD-ICP-CITY-LOYALIST" },
        },
      },
    ]);
    const obj = buildAccountObject(
      { id: accountId, name: "LD Scheme", status: "configured" },
      t,
    );
    const columns = obj["mst"]["historical_matrix_4x4"]["columns"] as Row[];
    const byId = Object.fromEntries(columns.map((c) => [c["id"], c]));
    expect(byId["C1"]["matched_profile_ids"]).toEqual(["LD-ICP-GIFTBUYER-YOUNG"]);
    expect(byId["C3"]["matched_profile_ids"]).toEqual(["LD-ICP-CITY-LOYALIST"]);
  });

  it("drops a matrix link whose target ICP disagrees with the grid column's declared icp", () => {
    // Defense in depth: even if a cell code is mis-numbered, a link must never
    // attach to a grid column that declares a different icp.
    const accountId = "ld_guard";
    const t = emptyTables();
    t.adPerformance = groupByAccount([perfRow(accountId)]);
    t.icpProfiles = groupByAccount([
      { account_id: accountId, payload: { profile_id: "LD-ICP-GIFTBUYER-YOUNG" } },
      { account_id: accountId, payload: { profile_id: "LD-ICP-CITY-LOYALIST" } },
    ]);
    t.accountModules = [
      {
        account_id: accountId,
        module: "mst",
        payload: {
          status: "active",
          historical_matrix_4x4: {
            columns: [
              { id: "C1", icp: "LD-ICP-GIFTBUYER-YOUNG" },
              { id: "C2", icp: "LD-ICP-CITY-LOYALIST" },
            ],
          },
        },
      },
    ];
    t.creativeBriefs = groupByAccount([
      {
        account_id: accountId,
        payload: {
          brief_metadata: { mode: "matrix" },
          // Cell code says C1 but targets C2's ICP — must be rejected.
          testing_framework: { matrix_position: "C1A — mislabeled" },
          strategic_foundation: { target_icp: "LD-ICP-CITY-LOYALIST" },
        },
      },
    ]);
    const obj = buildAccountObject(
      { id: accountId, name: "LD Guard", status: "configured" },
      t,
    );
    const columns = obj["mst"]["historical_matrix_4x4"]["columns"] as Row[];
    const byId = Object.fromEntries(columns.map((c) => [c["id"], c]));
    expect(byId["C1"]["matched_profile_ids"]).toBeUndefined();
    expect(byId["C2"]["matched_profile_ids"]).toBeUndefined();
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

// ─── Creative-link auto-heal detection ────────────────────────────────────────
// Regression guard: detectAccountsNeedingCreativeSync identifies accounts
// where creative_asset manual_imports exist but none of the mapped ad_names
// have a creative_asset_url set — the condition that causes every library card
// to show the "No asset" placeholder after a re-import or analysis wipe.

describe("detectAccountsNeedingCreativeSync", () => {
  it("flags an account where creative imports exist but all mapped ads have null creative_asset_url", () => {
    // Regression vector (b): seed assembler reads null from ads and ships null
    // in every AdRecord without self-healing first.
    const manualImports: Row[] = [
      { account_id: "acct_1", kind: "creative_asset", ad_names: ["Summer Sale v1", "Summer Sale v2"] },
    ];
    const ads: Row[] = [
      { account_id: "acct_1", ad_name: "Summer Sale v1", creative_asset_url: null },
      { account_id: "acct_1", ad_name: "Summer Sale v2", creative_asset_url: null },
    ];
    expect(detectAccountsNeedingCreativeSync(manualImports, ads)).toEqual(["acct_1"]);
  });

  it("does NOT flag an account where at least one mapped ad already has creative_asset_url set", () => {
    // Partial link is sufficient: sync will fill in the rest; no duplicate work.
    const manualImports: Row[] = [
      { account_id: "acct_2", kind: "creative_asset", ad_names: ["Ad A", "Ad B"] },
    ];
    const ads: Row[] = [
      { account_id: "acct_2", ad_name: "Ad A", creative_asset_url: "/api/metrix/accounts/acct_2/manual-imports/abc/file" },
      { account_id: "acct_2", ad_name: "Ad B", creative_asset_url: null },
    ];
    expect(detectAccountsNeedingCreativeSync(manualImports, ads)).toEqual([]);
  });

  it("skips creative imports with empty ad_names arrays (no mapping to heal)", () => {
    const manualImports: Row[] = [
      { account_id: "acct_3", kind: "creative_asset", ad_names: [] },
    ];
    const ads: Row[] = [];
    expect(detectAccountsNeedingCreativeSync(manualImports, ads)).toEqual([]);
  });

  it("flags only the affected account when multiple accounts co-exist", () => {
    const manualImports: Row[] = [
      { account_id: "bookster", kind: "creative_asset", ad_names: ["C2B_T3", "C4E_T1"] },
      { account_id: "healthy",  kind: "creative_asset", ad_names: ["Hero Ad"] },
    ];
    const ads: Row[] = [
      // bookster: both mapped ads have null URL — needs healing
      { account_id: "bookster", ad_name: "C2B_T3", creative_asset_url: null },
      { account_id: "bookster", ad_name: "C4E_T1", creative_asset_url: null },
      // healthy: one mapped ad already linked
      { account_id: "healthy",  ad_name: "Hero Ad", creative_asset_url: "/api/metrix/accounts/healthy/manual-imports/xyz/file" },
    ];
    const result = detectAccountsNeedingCreativeSync(manualImports, ads);
    expect(result).toEqual(["bookster"]);
  });

  it("flags an account when mapped ad names exist but no ads rows exist at all (regression vector a: wipe)", () => {
    // Regression vector (a): re-import deleted and re-inserted ads rows without
    // preserving creative_asset_url — the column reset to null on all rows.
    const manualImports: Row[] = [
      { account_id: "wiped", kind: "creative_asset", ad_names: ["C2B_T3"] },
    ];
    // ads table has the row but creative_asset_url was wiped
    const ads: Row[] = [
      { account_id: "wiped", ad_name: "C2B_T3", creative_asset_url: null },
    ];
    expect(detectAccountsNeedingCreativeSync(manualImports, ads)).toEqual(["wiped"]);
  });

  it("handles null ad_names gracefully and does not flag the account", () => {
    // Rows with null ad_names are excluded upstream by the Supabase query filter;
    // the pure function should still be robust if they sneak through.
    const manualImports: Row[] = [
      { account_id: "acct_4", kind: "creative_asset", ad_names: null },
    ];
    const ads: Row[] = [];
    expect(detectAccountsNeedingCreativeSync(manualImports, ads)).toEqual([]);
  });
});
