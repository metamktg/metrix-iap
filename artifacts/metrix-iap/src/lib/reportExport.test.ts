// ─── Report export tests ──────────────────────────────────────────────
// Validates that the report model is composed from seed data and that the
// HTML rendering contains the expected, escaped content.

import { describe, it, expect } from "vitest";
import { buildReportModel, renderReportHtml, serializeReportModel, parseReportModel, type SegmentComparisonRequest } from "./reportExport";
import type { MetrixSeed } from "./data/seedTypes";

const SECTIONS = [
  "Executive Read",
  "Data Foundation & Confidence",
  "Core Controls",
  "Creative Cell Performance",
  "Variable Performance",
  "Demographic Registration Signals",
  "Placement Signals",
  "Strategy Recommendations",
  "Next Sprint / Optimization Loop",
];

function makeSeed(): MetrixSeed {
  return {
    app_defaults: { forbidden_ui_terms: [] },
    manager_account: {},
    workspace_settings: undefined,
    ad_accounts: [
      {
        id: "bookster",
        name: "Bookster",
        status: "configured",
        platform: "Meta Ads",
        iap: {
          metadata: {},
          core_reanalysis_read: {
            primary_control: "Checkout initiations",
            primary_control_read: "Costs are stable <script>alert(1)</script>",
            registration_control: "Registrations",
            registration_control_read: "Registration volume holding",
            data_caveat: "Attribution window is 7-day click.",
          },
          campaign_summary: {
            bottom_line_totals: {
              checkout: { spend: 1200.5, reach: 90000, impressions: 150000, results: 42, clicks_all: 3000, link_clicks: 2100 },
            },
            total_spend_usd: 1200.5,
            total_impressions: 150000,
            total_link_clicks: 2100,
            overall_link_ctr_pct: 1.4,
            data_caveat: "Totals reflect the seeded window only.",
          },
          analysis: {
            performance_by_cell: [
              {
                cell_id: "C1",
                "Result type": "checkout",
                "Amount spent (USD)": 800,
                Reach: 50000,
                Impressions: 90000,
                Results: 30,
                "Clicks (all)": 1800,
                "Link clicks": 1200,
                CPA_result: 26.67,
                CTR_link_pct: 1.33,
                Result_per_link_click_pct: 2.5,
                book2_concept_name: "Proof-led hook",
              },
            ],
            v3_variable_performance: [
              {
                variable_family: "hook",
                variable_id: "hook_urgency",
                "Result type": "checkout",
                "Amount spent (USD)": 600,
                Reach: 40000,
                Impressions: 70000,
                Results: 22,
                "Clicks (all)": 1500,
                "Link clicks": 1000,
                unique_ads: 4,
                CPA_result: 27.27,
                CTR_link_pct: 1.43,
                Result_per_link_click_pct: 2.2,
              },
            ],
            demographic_registration_signal: [
              {
                cell_id: "C1",
                "Ad name": "Ad A",
                Age: "25-34",
                Gender: "female",
                "Amount spent (USD)": 300,
                Reach: 20000,
                Impressions: 35000,
                Results: 12,
                "Clicks (all)": 700,
                "Link clicks": 500,
                CPA_result: 25,
                CTR_link_pct: 1.43,
                Result_per_link_click_pct: 2.4,
              },
            ],
            v3_placement_signal: [
              {
                Placement: "Feed",
                Platform: "Instagram",
                "Amount spent (USD)": 500,
                Impressions: 60000,
                "Link clicks": 900,
                Results: 18,
                CPA: 27.78,
              },
            ],
            c4e_placement_signal: [],
            top_checkout_cells: [],
            top_checkout_variables: [],
          },
          strategy: {
            message_pillars: [
              {
                id: "p1",
                label: "Proof over promise",
                source_cells: ["C1"],
                plain_descriptor: "Lead with customer results.",
                why_it_matters: "Proof-led cells carried the cheapest checkouts.",
                variable_stack: {},
              },
            ],
            active_hypotheses: [{ id: "h1", label: "Urgency hooks scale", source: "cell C1", status: "testing" }],
          },
          brief_builder: { source_policy: "", draft_briefs: [] },
          report_builder: {
            default_branding: "metrix",
            white_label_supported: true,
            logo_policy: "Use Metrix branding on first load.",
            export_formats: ["pdf", "google_doc", "html"],
            report_sections: SECTIONS,
            report_history: [
              {
                id: "rep_1",
                title: "June Creative Signal Report",
                generated_at: "2026-07-01T00:00:00Z",
                branding: "metrix",
                mode: "internal",
                section_count: 9,
                status: "exported",
                export_format: "pdf",
                summary: "Monthly read.",
              },
            ],
          },
          optimization_loop: {
            visibility: "account",
            manager_overview_visibility: true,
            recommendation_cards: [
              {
                id: "rec1",
                account_id: "bookster",
                scope: "account",
                title: "Scale proof-led cells",
                rationale: "Cheapest CPA in the window.",
                impact: "high",
                confidence: "medium",
                recommended_action: "Increase budget 20%",
              },
            ],
            action_policy: "",
            dismiss_policy: "",
          },
        },
      },
    ],
  } as unknown as MetrixSeed;
}

describe("buildReportModel", () => {
  it("builds all sections with data-backed blocks from the seed", () => {
    const model = buildReportModel(makeSeed(), "bookster", "internal");
    expect(model).not.toBeNull();
    expect(model!.sections.map((s) => s.title)).toEqual(SECTIONS);
    // Every section has at least one block.
    for (const s of model!.sections) expect(s.blocks.length).toBeGreaterThan(0);
    // Known sections carry real data, not the fallback text.
    const exec = model!.sections[0];
    expect(exec.blocks.some((b) => b.kind === "stats")).toBe(true);
    const cells = model!.sections.find((s) => s.title === "Creative Cell Performance")!;
    expect(cells.blocks[0].kind).toBe("table");
    const strat = model!.sections.find((s) => s.title === "Strategy Recommendations")!;
    expect(JSON.stringify(strat.blocks)).toContain("Proof over promise");
    const loop = model!.sections.find((s) => s.title === "Next Sprint / Optimization Loop")!;
    expect(JSON.stringify(loop.blocks)).toContain("Scale proof-led cells");
  });

  it("applies branding mode", () => {
    const internal = buildReportModel(makeSeed(), "bookster", "internal")!;
    expect(internal.brandName).toBe("Metrix IAP");
    const client = buildReportModel(makeSeed(), "bookster", "client")!;
    expect(client.brandName).toBe("Bookster");
  });

  it("respects sectionCount and docTitle overrides", () => {
    const model = buildReportModel(makeSeed(), "bookster", "client", {
      docTitle: "June Client Report",
      sectionCount: 5,
    })!;
    expect(model.docTitle).toBe("June Client Report");
    expect(model.sections).toHaveLength(5);
  });

  it("returns null for unknown or unconfigured accounts", () => {
    expect(buildReportModel(makeSeed(), "nope", "internal")).toBeNull();
  });
});

describe("serializeReportModel / parseReportModel", () => {
  it("round-trips a built model exactly, reviving generatedAt as a Date", () => {
    const model = buildReportModel(makeSeed(), "bookster", "internal", {
      windowLabel: "Jun 1 – Jun 30, 2026",
    })!;
    const parsed = parseReportModel(serializeReportModel(model));
    expect(parsed).not.toBeNull();
    expect(parsed!.generatedAt).toBeInstanceOf(Date);
    expect(parsed!.generatedAt.getTime()).toBe(model.generatedAt.getTime());
    expect(parsed!.windowLabel).toBe("Jun 1 – Jun 30, 2026");
    // Everything except the revived Date must be structurally identical.
    expect({ ...parsed!, generatedAt: null }).toEqual({ ...model, generatedAt: null });
  });

  it("preserves a null windowLabel through the round-trip", () => {
    const model = buildReportModel(makeSeed(), "bookster", "client")!;
    expect(model.windowLabel).toBeNull();
    const parsed = parseReportModel(serializeReportModel(model))!;
    expect(parsed.windowLabel).toBeNull();
    expect(parsed.mode).toBe("client");
  });

  it("is stable: re-serializing a parsed snapshot yields the same JSON", () => {
    const model = buildReportModel(makeSeed(), "bookster", "internal", { windowLabel: "June 2026" })!;
    const json = serializeReportModel(model);
    expect(serializeReportModel(parseReportModel(json)!)).toBe(json);
  });

  it("a parsed snapshot renders the same HTML as the original model", () => {
    const model = buildReportModel(makeSeed(), "bookster", "internal", { windowLabel: "June 2026" })!;
    const parsed = parseReportModel(serializeReportModel(model))!;
    expect(renderReportHtml(parsed)).toBe(renderReportHtml(model));
  });

  it("returns null for malformed JSON", () => {
    expect(parseReportModel("{not json at all")).toBeNull();
    expect(parseReportModel("")).toBeNull();
  });

  it("returns null for JSON that is not a report snapshot", () => {
    expect(parseReportModel("null")).toBeNull();
    expect(parseReportModel('"just a string"')).toBeNull();
    expect(parseReportModel("[]")).toBeNull();
    expect(parseReportModel('{"docTitle":"x"}')).toBeNull(); // no sections array
  });

  it("returns null when generatedAt cannot be revived", () => {
    expect(parseReportModel('{"sections":[],"generatedAt":"not-a-date"}')).toBeNull();
    expect(parseReportModel('{"sections":[]}')).toBeNull();
  });
});

describe("renderReportHtml", () => {
  it("renders titles, tables, and escapes HTML in seed content", () => {
    const model = buildReportModel(makeSeed(), "bookster", "internal")!;
    const html = renderReportHtml(model);
    expect(html).toContain("<!DOCTYPE html>");
    for (const s of SECTIONS) {
      expect(html).toContain(s.replace(/&/g, "&amp;"));
    }
    expect(html).toContain("$1,200.50");
    // Script tag from seed content must be escaped.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

// ─── Segment comparison ───────────────────────────────────────────────

/** Seed with two demographic segments so comparison has real data on both sides. */
function makeSeedWithTwoSegments(): MetrixSeed {
  const base = makeSeed() as unknown as Record<string, unknown>;
  const accounts = base.ad_accounts as Array<Record<string, unknown>>;
  const iap = accounts[0].iap as Record<string, unknown>;
  const analysis = iap.analysis as Record<string, unknown>;
  analysis.demographic_registration_signal = [
    {
      cell_id: "C1",
      "Ad name": "Ad A",
      Age: "25-34",
      Gender: "female",
      "Amount spent (USD)": 300,
      Reach: 20000,
      Impressions: 35000,
      Results: 12,
      "Clicks (all)": 700,
      "Link clicks": 500,
      CPA_result: 25,
      CTR_link_pct: 1.43,
      Result_per_link_click_pct: 2.4,
      book2_concept_name: "Proof-led hook",
    },
    {
      cell_id: "C1",
      "Ad name": "Ad B",
      Age: "35-44",
      Gender: "male",
      "Amount spent (USD)": 200,
      Reach: 15000,
      Impressions: 28000,
      Results: 8,
      "Clicks (all)": 500,
      "Link clicks": 360,
      CPA_result: 25,
      CTR_link_pct: 1.29,
      Result_per_link_click_pct: 2.2,
      book2_concept_name: "Proof-led hook",
    },
  ];
  return base as unknown as MetrixSeed;
}

const SEG_A = { age: "25-34", gender: "female" };
const SEG_B = { age: "35-44", gender: "male" };

describe("buildReportModel — segment comparison", () => {
  it("does NOT include a segment comparison section when the option is absent", () => {
    const model = buildReportModel(makeSeed(), "bookster", "internal")!;
    expect(model.sections.every((s) => !s.title.startsWith("Segment Comparison"))).toBe(true);
    expect(model.sections).toHaveLength(SECTIONS.length);
  });

  it("appends the segment comparison section when explicitly requested", () => {
    const req: SegmentComparisonRequest = { segmentA: SEG_A, segmentB: SEG_B };
    const model = buildReportModel(makeSeedWithTwoSegments(), "bookster", "internal", {
      segmentComparison: req,
    })!;
    expect(model.sections).toHaveLength(SECTIONS.length + 1);
    const compSection = model.sections[model.sections.length - 1];
    expect(compSection.title).toContain("Segment Comparison");
    expect(compSection.title).toContain("Women 25-34");
    expect(compSection.title).toContain("Men 35-44");
  });

  it("the comparison section includes a side-by-side metrics table with both segment labels as headers", () => {
    const req: SegmentComparisonRequest = { segmentA: SEG_A, segmentB: SEG_B };
    const model = buildReportModel(makeSeedWithTwoSegments(), "bookster", "internal", {
      segmentComparison: req,
    })!;
    const compSection = model.sections[model.sections.length - 1];
    const metricsTable = compSection.blocks.find(
      (b) => b.kind === "table" && "headers" in b && b.headers.includes("Women 25-34"),
    );
    expect(metricsTable).toBeDefined();
    expect(metricsTable!.kind).toBe("table");
    if (metricsTable!.kind === "table") {
      expect(metricsTable.headers).toContain("Men 35-44");
      expect(metricsTable.rows.some((r) => r[0] === "Spend")).toBe(true);
      expect(metricsTable.rows.some((r) => r[0] === "CPA")).toBe(true);
      expect(metricsTable.rows.some((r) => r[0] === "Link CTR")).toBe(true);
    }
  });

  it("includes top-concept tables when attribution is available", () => {
    const req: SegmentComparisonRequest = { segmentA: SEG_A, segmentB: SEG_B };
    const model = buildReportModel(makeSeedWithTwoSegments(), "bookster", "internal", {
      segmentComparison: req,
    })!;
    const compSection = model.sections[model.sections.length - 1];
    const conceptTables = compSection.blocks.filter(
      (b) => b.kind === "table" && "caption" in b && b.caption?.includes("top concepts"),
    );
    expect(conceptTables.length).toBeGreaterThanOrEqual(1);
    const allText = JSON.stringify(compSection.blocks);
    expect(allText).toContain("Proof-led hook");
  });

  it("reports attribution unavailability honestly when a segment has no demographic rows", () => {
    // SEG_B doesn't exist in the base seed (only 25-34 female rows).
    const req: SegmentComparisonRequest = {
      segmentA: SEG_A,
      segmentB: { age: "55-64", gender: "female" },
    };
    const model = buildReportModel(makeSeed(), "bookster", "internal", {
      segmentComparison: req,
    })!;
    const compSection = model.sections[model.sections.length - 1];
    const textBlocks = compSection.blocks.filter((b) => b.kind === "text");
    // Must contain an unavailability notice, not silently skip or fabricate.
    expect(textBlocks.some((b) => b.kind === "text" && "text" in b && b.text.includes("unavailable"))).toBe(true);
  });

  it("segment comparison section survives a serialization round-trip", () => {
    const req: SegmentComparisonRequest = { segmentA: SEG_A, segmentB: SEG_B };
    const model = buildReportModel(makeSeedWithTwoSegments(), "bookster", "internal", {
      segmentComparison: req,
    })!;
    const parsed = parseReportModel(serializeReportModel(model))!;
    expect(parsed).not.toBeNull();
    const compSection = parsed.sections[parsed.sections.length - 1];
    expect(compSection.title).toContain("Segment Comparison");
    expect(renderReportHtml(parsed)).toContain("Women 25-34");
    expect(renderReportHtml(parsed)).toContain("Men 35-44");
  });

  it("comparison section is included in the rendered HTML", () => {
    const req: SegmentComparisonRequest = { segmentA: SEG_A, segmentB: SEG_B };
    const model = buildReportModel(makeSeedWithTwoSegments(), "bookster", "internal", {
      segmentComparison: req,
    })!;
    const html = renderReportHtml(model);
    expect(html).toContain("Segment Comparison");
    expect(html).toContain("Women 25-34");
    expect(html).toContain("Men 35-44");
  });
});
