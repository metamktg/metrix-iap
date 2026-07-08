// ─── Report export tests ──────────────────────────────────────────────
// Validates that the report model is composed from seed data and that the
// HTML rendering contains the expected, escaped content.

import { describe, it, expect } from "vitest";
import { buildReportModel, renderReportHtml } from "./reportExport";
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
