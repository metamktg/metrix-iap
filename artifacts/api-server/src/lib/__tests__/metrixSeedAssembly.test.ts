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
