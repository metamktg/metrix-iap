// Asset instances (configured vs delivered, instance vs content identity)
// and variable evidence without spend duplication — spec §10, §11, §17
// acceptance 7 and 8.
import { describe, expect, it } from "vitest";
import { parseIapCsv } from "../iapCsvParser";
import { detectReportGrain } from "../reportGrain";
import { type ReportInput, buildLedger, buildObservations, buildTruth, identityKey } from "../reconciliation";
import { assetKey, extractConfiguredAssets, extractDeliveredAssets, groupByContent } from "../creativeAssets";
import { type AdTotals, buildVariableEvidence, buildVariableSegmentPerformance } from "../variableEvidence";
import { ACCOUNT_TRUTH, HEADLINE_POOL, TEXT_POOL, buildAdSummaryCsv, buildAssetCsv, buildDemographicCsv, fixtureAds, fixtureTruth } from "./fixtures/reconciliationFixtures";

type Cls = Parameters<typeof parseIapCsv>[1];
const report = (id: string, text: string, cls: Cls): ReportInput => {
  const parsed = parseIapCsv(text, cls);
  return { import_id: id, grain: detectReportGrain(parsed, cls), rows: parsed.rows, totals_row: parsed.totalsRow };
};
const registry = (): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const ad of fixtureAds()) (m.get(ad.adName) ?? m.set(ad.adName, []).get(ad.adName)!).push(ad.adId);
  return m;
};

describe("creative assets", () => {
  const summary = report("summary", buildAdSummaryCsv({ withAdId: true }), "ad_summary");
  const configured = extractConfiguredAssets([summary]);

  it("records one configured instance per ad per asset type, never a metric", () => {
    const perAd = configured.filter((a) => a.ad_identity === fixtureAds()[0]!.adId);
    expect(perAd.map((a) => a.asset_type).sort()).toEqual(["cta_type", "destination", "headline", "image", "primary_text"]);
    expect(configured.every((a) => a.provenance === "configured")).toBe(true);
    expect(configured.filter((a) => a.asset_type === "primary_text")).toHaveLength(44);
  });

  it("recognises the same copy reused across ads by content hash while keeping each instance", () => {
    const groups = groupByContent(configured.filter((a) => a.asset_type === "headline"));
    expect(groups.size).toBe(HEADLINE_POOL.length);
    const first = configured.find((a) => a.asset_type === "primary_text" && a.raw_value === TEXT_POOL[0])!;
    const twin = configured.find((a) => a.asset_type === "primary_text" && a.raw_value === TEXT_POOL[0] && a.ad_identity !== first.ad_identity)!;
    expect(twin.content_hash).toBe(first.content_hash);
    expect(assetKey(twin)).not.toBe(assetKey(first));
  });

  it("delivered Text rows become primary_text instances and are never assigned to the headline", () => {
    const asset = report("asset", buildAssetCsv(), "asset");
    const delivered = extractDeliveredAssets([asset]);
    expect(delivered.every((a) => a.provenance === "delivered" && a.asset_type === "primary_text")).toBe(true);
    expect(delivered).toHaveLength(88);
    // An identical string as configured and delivered stays two instances with one content identity.
    const sample = delivered[0]!;
    const conf = configured.find((c) => c.ad_identity === sample.ad_identity && c.asset_type === "primary_text");
    expect(conf).toBeDefined();
    expect(assetKey(conf!)).not.toBe(assetKey(sample));
    const { observations } = buildObservations([asset]);
    expect(observations.every((o) => o.segment.asset_type === "primary_text")).toBe(true);
    expect(observations.some((o) => o.segment.asset_type === "headline")).toBe(false);
  });

  it("a headline present with no delivery data has no delivered instance and no observation", () => {
    const demo = report("demo", buildDemographicCsv({ grain: "partial" }), "demographic");
    const delivered = extractDeliveredAssets([demo]);
    expect(delivered.every((a) => a.asset_type === "primary_text")).toBe(true);
    const { observations } = buildObservations([demo]);
    expect(observations.filter((o) => o.breakdown === "asset").every((o) => o.segment.asset_type === "primary_text")).toBe(true);
  });
});

describe("variable evidence", () => {
  const ads = fixtureAds();
  const truth = fixtureTruth();
  const deconstructions = [
    {
      id: "dec-1",
      manual_import_id: "imp-1",
      filename: "C8A_HK_Question_FW_AIDA_TN_Warm_image.png",
      status: "auto_filed",
      ad_names: ["C8A_HK_Question_FW_AIDA_TN_Warm"],
      variables: [
        { family: "hook", code: "HK_Question", confidence: 0.9 },
        { family: "framework", code: "FW_AIDA", confidence: 0.85 },
      ],
    },
    {
      id: "dec-2",
      manual_import_id: "imp-2",
      filename: "C1A_video.mp4",
      status: "auto_filed",
      ad_names: ["C1A_HK_Question_FW_PAS_TN_Warm"],
      variables: [{ family: "hook", code: "HK_Question", confidence: 0.8 }],
    },
    { id: "dec-3", manual_import_id: "imp-3", filename: "x.png", status: "needs_review", ad_names: ["C2A_HK_Question_FW_AIDA_TN_Direct"], variables: [{ family: "hook", code: "HK_Question" }] },
  ];

  it("reaches every instance of a mapped name as ad_context, skips unfiled deconstructions, dedupes", () => {
    const evidence = buildVariableEvidence({ deconstructions, instancesByName: registry() });
    const hk = evidence.filter((e) => e.variable_id === "HK_Question");
    const c8a = ads.filter((a) => a.adName === "C8A_HK_Question_FW_AIDA_TN_Warm").map((a) => a.adId);
    const c1a = ads.filter((a) => a.adName === "C1A_HK_Question_FW_PAS_TN_Warm").map((a) => a.adId);
    expect(hk.map((e) => e.ad_identity).sort()).toEqual([...c8a, ...c1a].sort());
    expect(hk.every((e) => e.relationship === "ad_context" && e.ad_identity_kind === "ad_id")).toBe(true);
    expect(evidence.some((e) => e.source_ref === "dec-3")).toBe(false);
    expect(evidence.filter((e) => e.variable_id === "FW_AIDA")).toHaveLength(c8a.length);
  });

  it("becomes direct_asset when a delivered media breakdown names the same file", () => {
    const delivered = [
      {
        ad_identity_kind: "ad_id" as const,
        ad_identity: ads[14]!.adId,
        meta_ad_id: ads[14]!.adId,
        ad_name: ads[14]!.adName,
        asset_type: "image" as const,
        raw_value: "C8A_HK_Question_FW_AIDA_TN_Warm_image.PNG",
        normalized_value: "c8a_hk_question_fw_aida_tn_warm_image.png",
        content_hash: "abc",
        provenance: "delivered" as const,
        source_column: "Image name",
        source_import_id: "imp-x",
        date_start: null,
        date_end: null,
      },
    ];
    const evidence = buildVariableEvidence({ deconstructions, instancesByName: registry(), deliveredAssets: delivered });
    const direct = evidence.filter((e) => e.relationship === "direct_asset");
    expect(direct.map((e) => e.ad_identity)).toEqual([ads[14]!.adId, ads[14]!.adId]);
    expect(direct[0]!.asset_key).toBe(assetKey(delivered[0]!));
  });

  it("falls to NAME grain for a name the registry does not know", () => {
    const evidence = buildVariableEvidence({ deconstructions: [{ ...deconstructions[0]!, ad_names: ["Unknown_Ad"] }], instancesByName: registry() });
    expect(evidence.every((e) => e.ad_identity_kind === "ad_name" && e.ad_identity === "Unknown_Ad")).toBe(true);
  });

  it("acceptance 8 — one creative mapped to several variables does not duplicate metrics", () => {
    const demo = report("demo", buildDemographicCsv({ grain: "reconciled" }), "demographic");
    const summary = report("summary", buildAdSummaryCsv({ withAdId: true }), "ad_summary");
    const obs = buildObservations([demo, summary]);
    const ledger = buildLedger({ observations: obs.observations, truth: buildTruth([demo, summary]), reports: [demo, summary] });
    const adTotals = new Map<string, AdTotals>();
    for (const ad of ads) {
      const t = truth.get(ad.adId)!;
      const identity = { kind: "ad_id" as const, key: ad.adId, ad_name: ad.adName, meta_ad_id: ad.adId };
      adTotals.set(identityKey(identity), { identity, metrics: { amount_spent: t.spendCents / 100, impressions: t.impressions, results: t.purchases, purchases: t.purchases }, result_type: "Purchases", coverage_pct: 100 });
    }
    // Two deconstructions of DIFFERENT creatives both map to C8A and both carry HK_Question.
    const evidence = buildVariableEvidence({
      deconstructions: [deconstructions[0]!, { ...deconstructions[0]!, id: "dec-1b", manual_import_id: "imp-1b", filename: "C8A_alt.png" }],
      instancesByName: registry(),
    });
    const rows = buildVariableSegmentPerformance({ evidence, observations: ledger.observations, adTotals });
    const all = rows.find((r) => r.variable_id === "HK_Question" && r.breakdown === "all")!;
    const c8aIds = ads.filter((a) => a.adName === "C8A_HK_Question_FW_AIDA_TN_Warm").map((a) => a.adId);
    const expectedSpend = c8aIds.reduce((s, id) => s + truth.get(id)!.spendCents, 0);
    expect(Math.round((all.contextual_totals["amount_spent"] ?? 0) * 100)).toBe(expectedSpend);
    expect(all.contributing_ads).toBe(c8aIds.length);
    expect(all.direct_totals).toEqual({});
    expect(all.evidence_state).toBe("ad_context");
    expect(all.observed_coverage_pct).toBe(100);
    // Segment rows sum to the same money once — not once per deconstruction.
    const segRows = rows.filter((r) => r.variable_id === "HK_Question" && r.breakdown === "demographic");
    const segSpend = segRows.reduce((s, r) => s + (r.contextual_totals["amount_spent"] ?? 0), 0);
    expect(Math.round(segSpend * 100)).toBe(expectedSpend);
    expect(segRows.every((r) => r.evidence_state === "observed_reconciled")).toBe(true);
    expect(segRows.every((r) => r.cost_per_result === null || r.cost_per_result > 0)).toBe(true);
    // The variable's total is a slice of account spend, never the account.
    expect(expectedSpend).toBeLessThan(ACCOUNT_TRUTH.spendCents);
  });
});
