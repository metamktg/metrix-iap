// Stress test of the result-event grain: a synthetic mixed-objective account
// (purchases, leads, adds to cart, ThruPlays, link clicks, a custom event,
// rows with no result type) pushed through the pure builders the engine and
// the seed use, with the invariants the owner's rule implies checked over
// every row rather than a hand-picked example.
import { describe, expect, it } from "vitest";
import { buildConceptPerformanceRows, buildVariablePerformanceRows } from "../analysisEngine";
import { buildResultEventSummary } from "../metrixSeedAssembly";
import { blendableEvents, classifyResultEvent, comparableEvents, INTENT_CLASSES, partitionByIntent } from "../resultEvents";

const TYPES = ["Website purchases", "Leads (form)", "Website adds to cart", "ThruPlays", "Link clicks", "onb_special_thing", "", "unknown"];
const CONCEPTS = ["C1", "C2", "C3", "C4", "C5"];
const TOKENS = ["HK1", "HK2", "STC", "QF", "UGC"];

// Deterministic pseudo-random so a failure reproduces.
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;

function syntheticRows(n: number) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const concept = pick(CONCEPTS);
    const type = pick(TYPES);
    const token = pick(TOKENS);
    const impressions = Math.floor(rnd() * 50000);
    const clicks = Math.floor(impressions * rnd() * 0.05);
    const spend = Math.round(rnd() * 500 * 100) / 100;
    const c = classifyResultEvent(type);
    const results = c.intent === "awareness" ? Math.floor(impressions * rnd()) : Math.floor(clicks * rnd() * 0.2);
    rows.push({
      ad_name: `${concept}A_${token}_BOOK1_T${1 + (i % 3)}`,
      meta_ad_id: String(1000 + (i % 200)), // 200 distinct ads across many days
      result_type: type,
      spend, results, link_clicks: clicks, impressions,
      reach: Math.floor(impressions * 0.6), clicks_all: clicks + 3,
    });
  }
  return rows;
}

const extractConcept = (n: string) => n.match(/^([A-Z]\d+)/)?.[1] ?? null;
const extractBook = (n: string) => n.match(/(BOOK\d+)/)?.[1] ?? null;
const base = { accountId: "stress", runId: "run-s", dateStart: "2026-08-01", dateEnd: "2026-08-30" };
const rows = syntheticRows(3000);
const typeOf = (r: Record<string, unknown>) => (typeof r.result_type === "string" && r.result_type.trim() !== "" ? (r.result_type as string) : "unknown");

describe("result grain under a 3,000-row mixed-objective account", () => {
  const concepts = buildConceptPerformanceRows(rows, { ...base, libraryConcepts: new Set(), extractConcept, extractBook, hasCopyForAd: () => false });
  const variables = buildVariablePerformanceRows(rows, base);
  const summary = buildResultEventSummary(rows);

  it("no aggregate row ever holds more than one result type, and every dollar lands in exactly one", () => {
    const total = rows.reduce((n, r) => n + Number(r.spend), 0);
    expect(concepts.reduce((n, r) => n + Number(r.spend ?? 0), 0)).toBeCloseTo(total, 2);
    expect(summary.result_events.reduce((n, e) => n + e.spend, 0)).toBeCloseTo(total, 1);
    expect(summary.intent_summary.total_spend).toBeCloseTo(total, 1);
    // one row per (book, concept, type)
    const keys = concepts.map((r) => `${r.book}|${r.concept}|${r.result_type}`);
    expect(new Set(keys).size).toBe(keys.length);
    // the distinct types present are exactly the distinct types in the input ("" folds to unknown)
    const inputTypes = new Set(rows.map(typeOf));
    expect(new Set(concepts.map((r) => r.result_type))).toEqual(inputTypes);
    expect(new Set(variables.map((r) => r.result_type))).toEqual(inputTypes);
  });

  it("awareness rows never carry an intent score or a cost-scale verdict; unplaced rows carry no verdict at all", () => {
    for (const r of concepts) {
      const c = classifyResultEvent(r.result_type);
      if (c.intent === "awareness") {
        expect(r.buying_intent_score).toBeNull();
        expect(r.lift_basis).toBe("link_ctr");
      } else {
        expect(r.lift_basis).toBe("cpa");
      }
      if (c.intent === null) {
        expect(r.intent_class).toBeNull();
        if (Number(r.results ?? 0) === 0) expect(r.performance_tier).toBeNull();
      }
    }
  });

  it("a lift compares like with like: every baseline is the same book AND the same event", () => {
    // Re-derive the purchase baseline for BOOK1 and check one row's lift against it.
    const purchases = concepts.filter((r) => r.result_type === "Website purchases" && r.book === "BOOK1");
    const bSpend = purchases.reduce((n, r) => n + Number(r.spend ?? 0), 0);
    const bResults = purchases.reduce((n, r) => n + Number(r.results ?? 0), 0);
    const baseCpa = bSpend / bResults;
    for (const r of purchases) {
      if (r.cpa == null || r.performance_lift_vs_baseline == null) continue;
      expect(Number(r.performance_lift_vs_baseline)).toBeCloseTo((baseCpa - Number(r.cpa)) / baseCpa, 3);
    }
  });

  it("variable rows count distinct ads, never ad-days", () => {
    for (const v of variables) expect(v.payload.unique_ads).toBeLessThanOrEqual(200);
    const stcPurchases = variables.find((v) => v.variable_id === "STC" && v.result_type === "Website purchases");
    expect(stcPurchases).toBeTruthy();
    expect(stcPurchases!.payload["Result type"]).toBe("Website purchases");
  });

  it("the seed summary places every event, keeps the unplaced ones visible and names the dominant class", () => {
    const placed = summary.result_events.filter((e) => e.intent_class !== null);
    const unplaced = summary.result_events.filter((e) => e.intent_class === null);
    expect(unplaced.map((e) => e.raw).sort()).toEqual(["onb_special_thing", "unknown"]);
    expect(summary.intent_summary.unplaced_spend).toBeCloseTo(unplaced.reduce((n, e) => n + e.spend, 0), 1);
    expect(["conversion", "consideration", "awareness"]).toContain(summary.intent_summary.dominant_intent);
    for (const e of placed) expect(INTENT_CLASSES[e.intent_class!].scale).toBe(e.scale);
    // cost per result is a fact of every event with results, but the scale says whether it is a verdict
    for (const e of summary.result_events) if (e.results > 0) expect(e.cost_per_result).toBeGreaterThan(0);
  });

  it("only terminal conversion events may blend; nothing else is ever comparable across types", () => {
    expect(blendableEvents(TYPES)).toEqual(["Website purchases", "Leads (form)"]);
    for (const a of TYPES) for (const b of TYPES) {
      if (a === b && classifyResultEvent(a).intent !== null && classifyResultEvent(a).key !== "custom") expect(comparableEvents(a, b)).toBe(true);
      else if (a !== b) expect(comparableEvents(a, b)).toBe(false);
    }
    const p = partitionByIntent(rows, typeOf);
    expect(p.classes.map((c) => c.intent)).toEqual(["conversion", "consideration", "awareness"]);
    expect(p.classes.reduce((n, c) => n + c.rows.length, 0) + p.unplaced.length).toBe(rows.length);
  });
});

describe("edge accounts", () => {
  it("a single-event account is one scope, one baseline, no blend", () => {
    const one = syntheticRows(200).map((r) => ({ ...r, result_type: "Website purchases" }));
    const s = buildResultEventSummary(one);
    expect(s.result_events).toHaveLength(1);
    expect(s.intent_summary.dominant_intent).toBe("conversion");
    expect(blendableEvents(s.result_events.map((e) => e.raw))).toEqual([]);
  });
  it("an awareness-only account is judged on communication and never on cost per result", () => {
    const aw = syntheticRows(200).map((r) => ({ ...r, result_type: "ThruPlays" }));
    const s = buildResultEventSummary(aw);
    expect(s.intent_summary.dominant_intent).toBe("awareness");
    const concepts = buildConceptPerformanceRows(aw, { ...base, libraryConcepts: new Set(), extractConcept, extractBook, hasCopyForAd: () => false });
    for (const r of concepts) { expect(r.lift_basis).toBe("link_ctr"); expect(r.buying_intent_score).toBeNull(); }
  });
  it("an account with nothing but unknown result types is undetermined, not ecommerce", () => {
    const u = syntheticRows(50).map((r) => ({ ...r, result_type: "unknown" }));
    const s = buildResultEventSummary(u);
    expect(s.intent_summary.dominant_intent).toBeNull();
    expect(s.intent_summary.classes).toEqual([]);
    expect(s.intent_summary.unplaced_spend).toBeCloseTo(s.intent_summary.total_spend, 1);
  });
  it("empty input is empty output, never a throw", () => {
    expect(buildConceptPerformanceRows([], { ...base, libraryConcepts: new Set(), extractConcept, extractBook, hasCopyForAd: () => false })).toEqual([]);
    expect(buildVariablePerformanceRows([], base)).toEqual([]);
    expect(buildResultEventSummary([]).result_events).toEqual([]);
  });
});
