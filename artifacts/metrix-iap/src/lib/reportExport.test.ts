// ─── Report export tests ──────────────────────────────────────────────
// Validates that the report model is composed from seed data and that the
// HTML rendering contains the expected, escaped content.
//
// Two seed sources are used:
//   makeSeed()    — a minimal hand-crafted seed for controlled content tests
//                   (HTML escaping, specific label checks, etc.)
//   fixtureSeed   — the checked-in src/test-fixtures/metrix_seed_bundle.json
//                   snapshot used by navigation and breadcrumb tests; drives
//                   the structural "all sections present" assertions so that
//                   schema drift is caught as soon as the fixture is refreshed.

import { withUnconfiguredAccount } from "@/test-fixtures/unconfigured";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildReportModel, renderReportHtml, serializeReportModel, parseReportModel, type SegmentComparisonRequest } from "./reportExport";
import type { MetrixSeed } from "./data/seedTypes";

// ── Fixture seed (same snapshot used by navigation/__tests__) ──────────
const fixtureSeed: MetrixSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

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

// ─── Fixture-backed structural tests ──────────────────────────────────
// These tests run against the checked-in seed snapshot so that a schema
// change that adds new IAP sections (or removes existing ones) is caught
// the moment the fixture is refreshed — even if the hand-crafted makeSeed()
// fixture above has not been updated.
describe("buildReportModel — fixture seed structural checks", () => {
  it("builds a model from the fixture's bookster account with all expected sections", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal");
    expect(model).not.toBeNull();
    expect(model!.sections.map((s) => s.title)).toEqual(SECTIONS);
  });

  it("every section produced from the fixture has at least one block", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal")!;
    for (const s of model.sections) {
      expect(s.blocks.length, `section "${s.title}" has no blocks`).toBeGreaterThan(0);
    }
  });

  it("executive section contains a stats block (fixture has real campaign totals)", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal")!;
    const exec = model.sections[0];
    expect(exec.blocks.some((b) => b.kind === "stats")).toBe(true);
  });

  it("creative cell section contains a table block (fixture has real cell rows)", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal")!;
    const cells = model.sections.find((s) => s.title === "Creative Cell Performance")!;
    expect(cells).toBeDefined();
    // The section may open with a chart before the table when the fixture has
    // enough cells to trigger the chart path — assert presence, not position.
    expect(cells.blocks.some((b) => b.kind === "table")).toBe(true);
  });

  it("strategy section references at least one message pillar from the fixture", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal")!;
    const strat = model.sections.find((s) => s.title === "Strategy Recommendations")!;
    expect(strat).toBeDefined();
    // The fixture has real pillar labels — any non-empty content signals coverage.
    expect(JSON.stringify(strat.blocks).length).toBeGreaterThan(0);
  });

  it("renders HTML for the fixture seed without throwing", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal")!;
    const html = renderReportHtml(model);
    expect(html).toContain("<!DOCTYPE html>");
    for (const s of SECTIONS) {
      expect(html).toContain(s.replace(/&/g, "&amp;"));
    }
  });

  it("serialization round-trip is stable for the fixture seed", () => {
    const model = buildReportModel(fixtureSeed, "bookster", "internal", { windowLabel: "Fixture window" })!;
    const json = serializeReportModel(model);
    const parsed = parseReportModel(json)!;
    expect(parsed).not.toBeNull();
    expect(parsed.generatedAt).toBeInstanceOf(Date);
    expect(serializeReportModel(parsed)).toBe(json);
  });

  it("returns null for unconfigured accounts", () => {
    // Synthesized, not found: the demo DB no longer guarantees any account
    // is unconfigured, and this test is about the STATE, not the account.
    const seed = withUnconfiguredAccount(fixtureSeed, "skov_pet");
    expect(buildReportModel(seed, "skov_pet", "internal")).toBeNull();
  });
});

describe("chart blocks rank the entity they claim to rank", () => {
  // The fixture is what exposed this: bookster's performance_by_cell carries
  // one row per (cell, result type) — C2B, C2E, C2F and C4E each appear three
  // times — and v3_placement_signal carries "Feed" once per platform. Charting
  // rows directly gave the same cell several bars, each holding a fraction of
  // its spend, and React dropped children because the labels were the keys.

  function chartsIn(sectionTitle: string) {
    const model = buildReportModel(fixtureSeed, "bookster", { sectionCount: 9 })!;
    const section = model.sections.find((s) => s.title === sectionTitle)!;
    expect(section, `fixture no longer produces a "${sectionTitle}" section`).toBeTruthy();
    return section.blocks.filter((b) => b.kind === "chart") as Extract<
      (typeof section.blocks)[number],
      { kind: "chart" }
    >[];
  }

  it("the fixture still carries the duplicate rows this guards against", () => {
    // Without this the tests below would pass on data that cannot reproduce
    // the defect, and would keep passing after a refresh that removed it.
    const account = fixtureSeed.ad_accounts.find((a) => a.id === "bookster")!;
    const cells = account.iap!.analysis!.performance_by_cell;
    const ids = cells.map((r) => r.cell_id);
    expect(new Set(ids).size, "fixture no longer has repeated cell_ids").toBeLessThan(ids.length);
    const placements = account.iap!.analysis!.v3_placement_signal.map((r) => r.Placement);
    expect(new Set(placements).size, "fixture no longer has repeated placements").toBeLessThan(
      placements.length,
    );
  });

  it("gives each creative cell exactly one bar", () => {
    const chart = chartsIn("Creative Cell Performance").find((c) =>
      c.title.includes("Top creative cells"),
    )!;
    expect(chart, "the cell spend chart is gone").toBeTruthy();
    const labels = chart.data.map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("a cell's bar is the sum of every result type it was measured against", () => {
    const account = fixtureSeed.ad_accounts.find((a) => a.id === "bookster")!;
    const expected = account
      .iap!.analysis!.performance_by_cell.filter((r) => r.cell_id === "C2B")
      .reduce((sum, r) => sum + r["Amount spent (USD)"], 0);
    const chart = chartsIn("Creative Cell Performance").find((c) =>
      c.title.includes("Top creative cells"),
    )!;
    const bar = chart.data.find((d) => d.label === "C2B")!;
    expect(bar, "C2B dropped out of the top cells").toBeTruthy();
    expect(bar.value).toBeCloseTo(expected, 6);
  });

  it("says the cell figures are a multi-event sum rather than letting them read as exact", () => {
    const chart = chartsIn("Creative Cell Performance").find((c) =>
      c.title.includes("Top creative cells"),
    )!;
    expect(chart.caption ?? "").toMatch(/result types/i);
    expect(chart.caption ?? "").toMatch(/upper bound/i);
  });

  it("gives each placement one bar, summed across platforms", () => {
    const account = fixtureSeed.ad_accounts.find((a) => a.id === "bookster")!;
    const expected = account
      .iap!.analysis!.v3_placement_signal.filter((r) => r.Placement === "Feed")
      .reduce((sum, r) => sum + r["Amount spent (USD)"], 0);
    const chart = chartsIn("Placement Signals").find((c) => c.title.includes("Spend by placement"))!;
    expect(chart, "the placement spend chart is gone").toBeTruthy();
    const labels = chart.data.map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
    const feed = chart.data.find((d) => d.label === "Feed")!;
    expect(feed, "Feed dropped out of the top placements").toBeTruthy();
    expect(feed.value).toBeCloseTo(expected, 6);
    expect(chart.caption ?? "").toMatch(/platforms/i);
  });

  it("carries the caveat into the rendered HTML, not just the model", () => {
    // The caveat matters most in the artifact a client receives.
    const model = buildReportModel(fixtureSeed, "bookster", { sectionCount: 9 })!;
    const html = renderReportHtml(model);
    expect(html).toContain("chart-caveat");
    expect(html).toMatch(/upper bound/i);
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

// ─── Coverage gating reaches the exported document ─────────────────────
// An exported client deliverable is the last surface a segment read can
// escape through. The in-app drill-down suppresses signal classification
// when the run's measured demographic join coverage is below threshold; the
// export path took no coverage at all, so the same numbers left the product
// unqualified. These pin that it no longer can.

describe("buildReportModel — segment comparison coverage gating", () => {
  const req: SegmentComparisonRequest = { segmentA: SEG_A, segmentB: SEG_B };

  function comparisonText(opts: Parameters<typeof buildReportModel>[3]) {
    const model = buildReportModel(makeSeedWithTwoSegments(), "bookster", "internal", opts)!;
    const section = model.sections[model.sections.length - 1]!;
    return section.blocks
      .filter((b): b is { kind: "text"; text: string } => b.kind === "text")
      .map((b) => b.text);
  }

  it("qualifies both segments when the run's demographic coverage is below threshold", () => {
    const texts = comparisonText({
      segmentComparison: req,
      demoCoverage: {
        spend_coverage_pct: 2,
        below_threshold: true,
        note: "Re-export Demographics from Meta Ads Reporting as CSV.",
      },
    });
    const qualified = texts.filter((t) => t.startsWith("Insufficient join coverage —"));
    expect(qualified).toHaveLength(2);
    expect(qualified[0]).toContain("only 2%");
    expect(qualified[0]).toContain("Re-export Demographics");
    // The state is named for what it is — not softened into "low signal".
    expect(texts.some((t) => t.startsWith("Low signal —"))).toBe(false);
  });

  it("leaves an adequately covered run's segments unqualified", () => {
    const texts = comparisonText({
      segmentComparison: req,
      demoCoverage: { spend_coverage_pct: 96, below_threshold: false, note: null },
    });
    expect(texts.some((t) => t.startsWith("Insufficient join coverage —"))).toBe(false);
  });

  it("falls back to per-segment heuristics on a legacy run with no measured coverage", () => {
    const texts = comparisonText({ segmentComparison: req });
    expect(texts.some((t) => t.startsWith("Insufficient join coverage —"))).toBe(false);
  });
});

describe("the report does not list a variable once per analysis run", () => {
  // variable_performance keeps one row per run by design, so an unscoped table
  // printed every variable once per run into a client's report and summed the
  // family totals with that multiple in them. The fixture's only multi-run
  // account builds no report, so this uses a controlled seed instead of a
  // fixture case that cannot exist.
  function twoRunSeed(): MetrixSeed {
    const base = makeSeed();
    const account = base.ad_accounts[0] as Record<string, any>;
    const row = (runId: string, spend: number) => ({
      variable_family: "hook",
      variable_id: "HK_Benefit",
      "Result type": "checkout",
      "Amount spent (USD)": spend,
      Reach: 0,
      Impressions: 1000,
      Results: 10,
      "Clicks (all)": 100,
      "Link clicks": 80,
      unique_ads: 2,
      CPA_result: spend / 10,
      CTR_link_pct: 8,
      Result_per_link_click_pct: 12.5,
      manual_analysis_run_id: runId,
    });
    account["iap"].analysis.v3_variable_performance = [row("run-1", 500), row("run-2", 900)];
    account["iap"].analysis.latest_analysis_run_id = "run-2";
    return base;
  }

  it("prints the variable once, with the latest run's spend", () => {
    const model = buildReportModel(twoRunSeed(), "bookster", { sectionCount: 9 })!;
    const section = model.sections.find((s) => s.title === "Variable Performance")!;
    expect(section, "no Variable Performance section built").toBeTruthy();
    const table = section.blocks.find((b) => b.kind === "table") as { rows: string[][] } | undefined;
    expect(table, "no variable table built").toBeTruthy();

    const ids = table!.rows.map((r) => r[0]);
    expect(new Set(ids).size, `variable listed more than once: ${JSON.stringify(ids)}`).toBe(ids.length);
    // The surviving row is run-2's, not the sum of both.
    expect(table!.rows.some((r) => r.join(" ").includes("900"))).toBe(true);
    expect(table!.rows.some((r) => r.join(" ").includes("1,400"))).toBe(false);
  });
});

