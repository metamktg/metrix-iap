// Acceptance for the amendment (spec §17a): the $100 copy scenario,
// asset-column roles and copy signatures, joint evidence, compatibility on
// attribution and result definition, truth precedence, and creative
// versions under one Ad ID.
import { describe, expect, it } from "vitest";
import { parseIapCsv } from "../iapCsvParser";
import { detectReportGrain } from "../reportGrain";
import { type ReportInput, buildLedger, buildObservations, buildTruth } from "../reconciliation";
import { extractConfiguredAssets, extractDeliveredAssets } from "../creativeAssets";
import { buildVariableEvidence, buildVariableSegmentPerformance } from "../variableEvidence";
import {
  COPY_AD,
  COPY_HEADLINE_X,
  COPY_TEXT_A,
  COPY_TEXT_B,
  buildAdSummaryCsv,
  buildCopyAdSummaryCsv,
  buildCopyDemographicCsv,
  buildCopyPivotCsv,
  buildCopyVersionedSummaryCsv,
  buildDemographicCsv,
} from "./fixtures/reconciliationFixtures";

type Cls = Parameters<typeof parseIapCsv>[1];
const report = (id: string, text: string, cls: Cls): ReportInput => {
  const parsed = parseIapCsv(text, cls);
  return { import_id: id, grain: detectReportGrain(parsed, cls), rows: parsed.rows, totals_row: parsed.totalsRow };
};
const cents = (n: number | null): number | null => (n === null ? null : Math.round(n * 100));

describe("the $100 copy scenario", () => {
  const summary = report("summary", buildCopyAdSummaryCsv(), "ad_summary");
  const text = report("text", buildCopyPivotCsv(), "asset");
  const { observations } = buildObservations([summary, text]);
  const truth = buildTruth([summary, text]);
  const { rows, summary: recon } = buildLedger({ observations, truth, reports: [summary, text] });
  const ad = (metric: string) => rows.find((r) => r.scope === "ad" && r.report_class === "asset" && r.metric === metric)!;

  it("states $40 against Text A, $50 against Text B, $10 unattributed, 90% coverage — and nothing else", () => {
    const assetObs = observations.filter((o) => o.breakdown === "asset");
    expect(assetObs).toHaveLength(2);
    const a = assetObs.find((o) => o.segment.asset_value === COPY_TEXT_A)!;
    const b = assetObs.find((o) => o.segment.asset_value === COPY_TEXT_B)!;
    expect(cents(a.metrics["amount_spent"]!)).toBe(4000);
    expect(cents(b.metrics["amount_spent"]!)).toBe(5000);
    expect(a.attribution).toBe("direct_asset");
    expect(a.segment.asset_type).toBe("primary_text");
    const spend = ad("amount_spent");
    expect(cents(spend.truth_value)).toBe(10_000);
    expect(cents(spend.observed_value)).toBe(9_000);
    expect(spend.coverage_pct).toBe(90);
    expect(cents(spend.residual)).toBe(1_000);
    expect(spend.overcoverage).toBe(0);
    expect(spend.evidence_state).toBe("observed_partial");
    // No scaling to $44.44 / $55.56, no Unknown bucket.
    expect(assetObs.every((o) => o.segment.asset_value !== "unknown" && o.segment.asset_value !== undefined)).toBe(true);
    expect(cents(assetObs.reduce((s, o) => s + (o.metrics["amount_spent"] ?? 0), 0))).toBe(9_000);
  });

  it("reconciles every metric independently — spend 90%, impressions 80%, clicks 96%, purchases 60%", () => {
    expect(ad("amount_spent").coverage_pct).toBe(90);
    expect(ad("impressions").coverage_pct).toBe(80);
    expect(ad("clicks_all").coverage_pct).toBe(96);
    expect(ad("link_clicks").coverage_pct).toBe(100);
    expect(ad("purchases").coverage_pct).toBe(60);
    expect(ad("purchases").residual).toBe(8);
    expect(recon.truth_precedence).toContain("whole-period Ad Summary keyed by Ad ID");
  });

  it("does not attribute performance to the constant headline and description columns", () => {
    expect(text.grain.report_class).toBe("asset");
    const roles = Object.fromEntries(text.grain.asset_columns.map((c) => [c.column, c.role]));
    expect(roles).toEqual({ Text: "breakdown", Headline: "context", Description: "context" });
    expect(observations.some((o) => o.segment.asset_type === "headline" || o.segment.asset_type === "description")).toBe(false);
    const configured = extractConfiguredAssets([summary, text]);
    const headline = configured.filter((a) => a.asset_type === "headline");
    expect(headline.map((a) => a.raw_value)).toEqual([COPY_HEADLINE_X]);
    expect(headline[0]!.provenance).toBe("configured");
    const delivered = extractDeliveredAssets([summary, text]);
    expect(delivered.map((a) => a.asset_type)).toEqual(["primary_text", "primary_text"]);
  });

  it("does not multiply the $40 across the variables the creative maps to", () => {
    const registry = new Map<string, string[]>([[COPY_AD.adName, [COPY_AD.adId]]]);
    const evidence = buildVariableEvidence({
      deconstructions: [
        { id: "d1", manual_import_id: "i1", filename: "c1a.png", status: "auto_filed", ad_names: [COPY_AD.adName], variables: [{ family: "hook", code: "HK_Question" }, { family: "framework", code: "FW_PAS" }, { family: "tonality", code: "TN_Warm" }] },
      ],
      instancesByName: registry,
    });
    const adTotals = new Map([[`ad_id:${COPY_AD.adId}`, { identity: { kind: "ad_id" as const, key: COPY_AD.adId, ad_name: COPY_AD.adName, meta_ad_id: COPY_AD.adId }, metrics: { amount_spent: 100, impressions: 10000, results: 20 }, result_type: "Purchases", coverage_pct: 90 }]]);
    const rowsOut = buildVariableSegmentPerformance({ evidence, observations, adTotals, breakdowns: ["asset"] });
    const all = rowsOut.filter((r) => r.breakdown === "all");
    expect(all).toHaveLength(3);
    for (const r of all) {
      expect(r.contextual_totals["amount_spent"]).toBe(100);
      expect(r.direct_totals).toEqual({});
      expect(r.evidence_state).toBe("ad_context");
      expect(r.contributing_ads).toBe(1);
    }
    // Three variables, one fact: the account did not spend $300.
    expect(all.reduce((s, r) => s + (r.contextual_totals["amount_spent"] ?? 0), 0)).toBe(300);
    expect(all.every((r) => r.contributing_ad_ids.length === 1)).toBe(true);
  });
});

describe("copy signatures and joints", () => {
  it("attributes direct performance to the delivered combination when fields vary together", () => {
    const summary = report("summary", buildCopyAdSummaryCsv(), "ad_summary");
    const text = report("text", buildCopyPivotCsv({ headlineVaries: true }), "asset");
    const roles = Object.fromEntries(text.grain.asset_columns.map((c) => [c.column, c.role]));
    expect(roles).toEqual({ Text: "breakdown", Headline: "breakdown", Description: "breakdown" });
    const { observations } = buildObservations([summary, text]);
    const asset = observations.filter((o) => o.breakdown === "asset");
    expect(asset).toHaveLength(2);
    expect(asset.every((o) => o.segment.asset_type === "copy_signature")).toBe(true);
    expect(asset[0]!.segment.asset_fields).toEqual({ Text: COPY_TEXT_A, Headline: COPY_HEADLINE_X, Description: "Description P" });
    expect(observations.some((o) => o.segment.asset_type === "primary_text" || o.segment.asset_type === "headline")).toBe(false);
    expect(cents(asset.reduce((s, o) => s + (o.metrics["amount_spent"] ?? 0), 0))).toBe(9_000);
  });

  it("separate demographic and copy margins never produce a joint; a demographic × copy file does, as direct_joint", () => {
    const summary = report("summary", buildCopyAdSummaryCsv(), "ad_summary");
    const separate = buildObservations([summary, report("text", buildCopyPivotCsv(), "asset"), report("demo", buildCopyDemographicCsv(), "demographic")]);
    expect(separate.observations.some((o) => o.breakdown === "demographic_asset")).toBe(false);
    expect(separate.observations.filter((o) => o.breakdown === "demographic").every((o) => o.attribution === "direct_segment")).toBe(true);

    const joint = report("joint", buildCopyPivotCsv({ withDemographics: true }), "demographic");
    expect(joint.grain.report_class).toBe("demographic_asset");
    const withJoint = buildObservations([summary, joint]);
    const cells = withJoint.observations.filter((o) => o.breakdown === "demographic_asset");
    expect(cells).toHaveLength(4);
    expect(cells.every((o) => o.attribution === "direct_joint")).toBe(true);
    // Its margins are separate sets that reconcile on their own.
    const demoMargin = withJoint.observations.filter((o) => o.breakdown === "demographic");
    expect(cents(demoMargin.reduce((s, o) => s + (o.metrics["amount_spent"] ?? 0), 0))).toBe(9_000);
    const { rows } = buildLedger({ observations: withJoint.observations, truth: buildTruth([summary, joint]), reports: [summary, joint] });
    expect(rows.find((r) => r.scope === "ad" && r.report_class === "demographic_asset" && r.metric === "amount_spent")!.coverage_pct).toBe(90);
  });
});

describe("compatibility and precedence", () => {
  it("rejects a different attribution setting from the ledger", () => {
    const summary = report("summary", buildCopyAdSummaryCsv(), "ad_summary");
    const text = report("text", buildCopyPivotCsv({ attribution: "1-day click" }), "asset");
    const { observations } = buildObservations([summary, text]);
    const { rows } = buildLedger({ observations, truth: buildTruth([summary, text]), reports: [summary, text] });
    expect(rows.every((r) => r.evidence_state === "incompatible")).toBe(true);
    expect(rows[0]!.compatibility_failures[0]!.kind).toBe("attribution");
  });

  it("rejects a different result definition for the results metric only", () => {
    const summary = report("summary", buildCopyAdSummaryCsv(), "ad_summary");
    const text = report("text", buildCopyPivotCsv({ resultType: "Leads" }), "asset");
    const { observations } = buildObservations([summary, text]);
    const { rows } = buildLedger({ observations, truth: buildTruth([summary, text]), reports: [summary, text] });
    const results = rows.find((r) => r.scope === "ad" && r.metric === "results")!;
    expect(results.evidence_state).toBe("incompatible");
    expect(results.compatibility_failures.at(-1)!.kind).toBe("result_definition");
    expect(rows.find((r) => r.scope === "ad" && r.metric === "amount_spent")!.evidence_state).toBe("observed_partial");
  });

  it("keeps native currencies apart", () => {
    const summary = report("summary", buildCopyAdSummaryCsv({ currency: "USD" }), "ad_summary");
    const text = report("text", buildCopyPivotCsv(), "asset");
    const { rows } = buildLedger({ observations: buildObservations([summary, text]).observations, truth: buildTruth([summary, text]), reports: [summary, text] });
    expect(rows[0]!.compatibility_failures[0]!.kind).toBe("currency");
  });

  it("flags overcoverage with the over-count kept, never normalised", () => {
    const summary = report("summary", buildCopyAdSummaryCsv(), "ad_summary");
    const text = report("text", buildCopyPivotCsv({ scale: 1.5 }), "asset");
    const { rows } = buildLedger({ observations: buildObservations([summary, text]).observations, truth: buildTruth([summary, text]), reports: [summary, text] });
    const spend = rows.find((r) => r.scope === "ad" && r.metric === "amount_spent")!;
    expect(spend.evidence_state).toBe("overcounted");
    expect(cents(spend.observed_value)).toBe(13_500);
    expect(cents(spend.overcoverage)).toBe(3_500);
    expect(cents(spend.residual)).toBe(-3_500);
  });

  it("selects truth by precedence, records the alternative and surfaces a disagreement without averaging", () => {
    const whole = report("whole", buildAdSummaryCsv({ withAdId: true }), "ad_summary");
    const daily = report("daily", buildAdSummaryCsv({ withAdId: true, daily: true }), "ad_summary");
    const demo = report("demo", buildDemographicCsv({ grain: "reconciled" }), "demographic");
    const truth = buildTruth([demo, daily, whole]);
    expect(truth.source).toBe("ad_summary");
    expect(truth.precedence).toContain("whole-period");
    expect(truth.import_ids).toEqual(["whole"]);
    expect(truth.alternatives.map((a) => a.label)).toEqual(["the daily Ad Summary (per Ad ID)", "Meta's totals row"]);
    expect(truth.conflicts).toEqual([]);
    // Halve the daily file: the selected source stays, the conflict is recorded.
    for (const row of daily.rows) row.base["amount_spent"] = (row.base["amount_spent"] as number) / 2;
    const conflicted = buildTruth([demo, daily, whole]);
    expect(conflicted.account!["amount_spent"]).toBe(truth.account!["amount_spent"]);
    expect(conflicted.conflicts.some((c) => c.startsWith("[Truth] amount_spent"))).toBe(true);
  });
});

describe("creative versions under one Ad ID", () => {
  it("keeps a headline changed mid-period as two instances with two periods", () => {
    const daily = report("daily", buildCopyVersionedSummaryCsv(), "ad_summary");
    expect(daily.grain.report_class).toBe("time_series");
    const configured = extractConfiguredAssets([daily]);
    const headlines = configured.filter((a) => a.asset_type === "headline").sort((a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""));
    expect(headlines).toHaveLength(2);
    expect(headlines[0]).toMatchObject({ raw_value: COPY_HEADLINE_X, date_start: "2026-08-01", date_end: "2026-08-15" });
    expect(headlines[1]).toMatchObject({ raw_value: "Headline Y", date_start: "2026-08-16", date_end: "2026-08-30" });
    expect(headlines[0]!.content_hash).not.toBe(headlines[1]!.content_hash);
    const body = configured.filter((a) => a.asset_type === "primary_text");
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ date_start: "2026-08-01", date_end: "2026-08-30" });
  });
});

describe("period compatibility of the control (live finding 2026-09-03)", () => {
  // The tester's run: a 30-day demographic pivot whose totals row covers the
  // FILE's period, and a run window that is not that period. The ledger had
  // used the totals row anyway and reported 28.54% where the same-window
  // read was 59.3%.
  const demo = report("demo", buildDemographicCsv({ grain: "reconciled", totalsRow: true }), "demographic");
  const filePeriod = demo.grain.period!;

  it("accepts the totals row when the window is the file's period", () => {
    const truth = buildTruth([demo], { window: { start: filePeriod.start, end: filePeriod.end } });
    expect(truth.source).toBe("totals_row");
    expect(truth.rejected ?? []).toHaveLength(0);
  });

  it("rejects the totals row for a window inside the file's period, says why, and names the export that fixes it", () => {
    const window = { start: filePeriod.start, end: filePeriod.start };
    const truth = buildTruth([demo], { window });
    expect(truth.source).toBe("none");
    expect(truth.precedence).toContain("no compatible control source");
    expect(truth.rejected).toHaveLength(1);
    expect(truth.rejected![0]!.reason).toContain(`the run window is ${window.start} → ${window.end}`);
    expect(truth.conflicts.join(" ")).toContain("[Truth] Rejected Meta's totals row");
    const { observations } = buildObservations([demo]);
    const { rows } = buildLedger({ observations, truth, reports: [demo] });
    const account = rows.find((r) => r.scope === "account" && r.metric === "amount_spent")!;
    expect(account.truth_value).toBeNull();
    expect(account.evidence_state).toBe("unreconciled");
    expect(account.compatibility_failures[0]!.kind).toBe("no_control_source");
    expect(account.compatibility_failures[0]!.detail).toContain("for exactly this window, or with a Day breakdown");
  });

  it("rejects a whole-period Ad Summary whose period is not the window, but keeps a daily one", () => {
    const whole = report("whole", buildAdSummaryCsv({ withAdId: true, daily: false }), "ad_summary");
    const daily = report("daily", buildAdSummaryCsv({ withAdId: true, daily: true }), "ad_summary");
    const window = { start: "2020-01-01", end: "2020-01-31" };
    expect(buildTruth([whole], { window }).source).toBe("none");
    expect(buildTruth([daily], { window }).source).toBe("ad_summary");
    // Without a window (older callers) nothing is rejected.
    expect(buildTruth([whole]).source).toBe("ad_summary");
  });
});
