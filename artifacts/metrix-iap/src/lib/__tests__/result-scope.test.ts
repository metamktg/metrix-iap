// The result scope is what stops a ThruPlay row from ranking beside a
// purchase: rows are filtered to one event (or the allowed blend) before
// any surface sums or sorts them.
import { describe, expect, it } from "vitest";
import { buildResultScopes, collapseCellRows, defaultScopeId, inScope, resolveScope, scopeRank, scopeRows, scopeSubtitle } from "@/lib/result-scope";

const events = [
  { raw: "Website purchases", spend: 1000, results: 40, ads: 12 },
  { raw: "Leads (form)", spend: 600, results: 90, ads: 8 },
  { raw: "Website checkouts initiated", spend: 200, results: 30, ads: 3 },
  { raw: "ThruPlays", spend: 300, results: 60000, ads: 4 },
  { raw: "Link clicks", spend: 150, results: 900, ads: 2 },
  { raw: "unknown", spend: 90, results: 0, ads: 5 },
];

describe("buildResultScopes", () => {
  const { scopes, groups } = buildResultScopes(events);

  it("groups by intent class in display order and keeps unplaced events visible", () => {
    expect(groups.map((g) => g.label)).toEqual(["Conversion", "Consideration", "Awareness", "Unplaced"]);
    expect(groups[3]!.scopes.map((s) => s.label)).toEqual(["Unclassified result type"]);
  });

  it("offers one blended conversion scope over terminal events only", () => {
    const blend = resolveScope(scopes, "blend:conversion")!;
    expect(blend.kind).toBe("blended");
    expect(blend.resultTypes).toEqual(["Website purchases", "Leads (form)"]); // checkouts are a step, not an outcome
    expect(blend.spend).toBe(1600);
    expect(blend.results).toBe(130);
    expect(groups[0]!.scopes[0]!.id).toBe("blend:conversion");
    expect(groups[0]!.scopes.map((s) => s.label)).toEqual(["All conversions", "Purchases", "Leads", "Checkouts initiated"]);
  });

  it("never blends awareness or consideration events", () => {
    expect(groups[1]!.scopes.every((s) => s.kind === "event")).toBe(true);
    expect(groups[2]!.scopes.every((s) => s.kind === "event")).toBe(true);
    expect(groups[2]!.scopes[0]!.scale).toBe("communication");
  });

  it("with one terminal conversion event there is no blend", () => {
    const one = buildResultScopes([{ raw: "Website purchases", spend: 10, results: 1 }, { raw: "Website adds to cart", spend: 5, results: 3 }]);
    expect(one.scopes.map((s) => s.id)).toEqual(["event:Website purchases", "event:Website adds to cart"]);
  });
});

describe("defaultScopeId", () => {
  it("lands on the dominant class by spend, blended when a blend exists", () => {
    expect(defaultScopeId(buildResultScopes(events).groups)).toBe("blend:conversion");
  });
  it("lands on the largest event when the dominant class is awareness", () => {
    const g = buildResultScopes([{ raw: "ThruPlays", spend: 900, results: 1 }, { raw: "Reach", spend: 100, results: 1 }, { raw: "Website purchases", spend: 50, results: 1 }]).groups;
    expect(defaultScopeId(g)).toBe("event:ThruPlays");
  });
  it("lands a surface on the scope its own rows carry when the reader has not chosen", () => {
    const g = buildResultScopes(events).groups;
    // Rows written under one event only: land there, not on an empty blend.
    expect(defaultScopeId(g, ["Website checkouts initiated"])).toBe("event:Website checkouts initiated");
    // Rows under a blended event: the blend still wins.
    expect(defaultScopeId(g, ["Leads (form)", "Website purchases"])).toBe("blend:conversion");
    expect(defaultScopeId(g, ["Leads (form)"])).toBe("blend:conversion");
    // Rows under an awareness event only: the awareness event.
    expect(defaultScopeId(g, ["ThruPlays"])).toBe("event:ThruPlays");
    // Rows under types the account does not offer: the account default.
    expect(defaultScopeId(g, ["Something else"])).toBe("blend:conversion");
  });
  it("falls back to the unplaced group only when nothing can be placed", () => {
    expect(defaultScopeId(buildResultScopes([{ raw: "unknown", spend: 1, results: 0 }]).groups)).toBe("event:unknown");
    expect(defaultScopeId([])).toBeNull();
  });
});

describe("scope filters and reads", () => {
  const { scopes } = buildResultScopes(events);
  const rows = [
    { t: "Website purchases", v: 1 }, { t: "Leads (form)", v: 2 }, { t: "ThruPlays", v: 3 }, { t: "", v: 4 }, { t: "unknown", v: 5 },
  ];
  it("filters rows to the scope before anything is summed", () => {
    const blend = resolveScope(scopes, "blend:conversion");
    expect(scopeRows(rows, blend, (r) => r.t).map((r) => r.v)).toEqual([1, 2]);
    const thru = resolveScope(scopes, "event:ThruPlays");
    expect(scopeRows(rows, thru, (r) => r.t).map((r) => r.v)).toEqual([3]);
    const unknown = resolveScope(scopes, "event:unknown");
    expect(scopeRows(rows, unknown, (r) => r.t).map((r) => r.v)).toEqual([4, 5]); // an empty type is the same gap
    expect(inScope(null, "anything")).toBe(true);
    // A row with no type field at all predates the split and is kept under every scope.
    expect(inScope(blend, undefined)).toBe(true);
    expect(inScope(thru, null)).toBe(true);
  });
  it("names the scope and the scale it is judged on", () => {
    expect(scopeSubtitle(resolveScope(scopes, "blend:conversion"))).toBe("All conversions · Purchases + Leads");
    expect(scopeSubtitle(resolveScope(scopes, "event:ThruPlays"))).toBe("ThruPlays · communication scale");
    expect(scopeSubtitle(resolveScope(scopes, "event:Website purchases"))).toBe("Purchases");
    expect(scopeRank(resolveScope(scopes, "event:ThruPlays"))).toEqual({ metric: "link_ctr", direction: "desc" });
    expect(scopeRank(resolveScope(scopes, "event:Website purchases"))).toEqual({ metric: "cpa", direction: "asc" });
    expect(scopeRank(resolveScope(scopes, "event:Link clicks"))).toEqual({ metric: "cpc", direction: "asc" });
  });
});

describe("collapseCellRows", () => {
  const cell = (id: string, t: string, spend: number, results: number, imp: number, clicks: number) => ({
    cell_id: id, "Result type": t, "Amount spent (USD)": spend, Results: results, Impressions: imp, Reach: imp / 2, "Clicks (all)": clicks + 5, "Link clicks": clicks,
    CPA_result: results > 0 ? spend / results : null, CTR_link_pct: imp > 0 ? (clicks / imp) * 100 : 0,
  });
  it("sums a blended scope's rows per cell and recomputes the rates from the sums", () => {
    const { scopes } = buildResultScopes(events);
    const blend = resolveScope(scopes, "blend:conversion");
    const rows = scopeRows([cell("C1A", "Website purchases", 100, 4, 1000, 50), cell("C1A", "Leads (form)", 50, 6, 500, 10), cell("C1B", "Website purchases", 10, 1, 100, 1)], blend, (r) => r["Result type"]);
    const out = collapseCellRows(rows, blend);
    expect(out).toHaveLength(2);
    const c1a = out.find((r) => r.cell_id === "C1A")!;
    expect(c1a["Amount spent (USD)"]).toBe(150);
    expect(c1a.Results).toBe(10);
    expect(c1a.CPA_result).toBe(15);
    expect(c1a.CTR_link_pct).toBe(4); // 60 / 1500, not the mean of 5% and 2%
    expect(c1a["Result type"]).toBe("All conversions");
    expect(out.find((r) => r.cell_id === "C1B")!.CPA_result).toBe(10);
  });
  it("leaves a single-event scope's rows untouched", () => {
    const one = collapseCellRows([cell("C2A", "ThruPlays", 30, 3000, 3000, 30)], null);
    expect(one[0]!["Result type"]).toBe("ThruPlays");
    expect(one[0]!.CPA_result).toBeCloseTo(0.01, 6);
  });
});
