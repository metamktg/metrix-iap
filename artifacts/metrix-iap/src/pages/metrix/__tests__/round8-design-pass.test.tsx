// ─── Audit round 8 · the design conformance pass ─────────────────────────
// The register's §G (METRIX_UI_AUDIT_ROUND4_2026-09.md): what the two
// reviewers found reading the 204-shot crawl against the standard, and what
// this PR changed for it. Layout verdicts stay with the shots (jsdom has no
// layout); what a unit can hold is held here: the funnel's one basis switch
// and its source line, an untyped demographic export named from the
// campaign summary, the positioning map's legend and vocabulary, the
// analysis export's ad-grain fallback and run scope, the four verbs on the
// tier filter and the playbook lanes, the tiles that read a dash before
// their producer has run, and the primitives' phone rules.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFunnelStages } from "../analysis/EngagementFunnelView";
import { summaryEventForRows, FUNNEL_BASIS_NOTE } from "@/lib/funnel-source";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { QUADRANT_LABEL, QUADRANT_HINT } from "@/lib/audience-clusters";
import { analysisExportRows, analysisExportEmpty, analysisExportSummary } from "@/lib/analysisExport";
import { bucketVerbKey, BUCKET_LABEL } from "@/lib/data/scalingBuckets";
import { ScalingPlaybookLanes, playbookHasContent } from "../strategy/strategyShared";
import { SectionCard } from "../shared";
import type { AdAccount, AnalysisData, CampaignSummary, DemographicRow } from "@/lib/data/seedTypes";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => fs.readFileSync(path.join(src, rel), "utf-8");

const FOUR_VERBS = ["Retire", "Scale", "Optimize", "Validate"];

function row(over: Partial<DemographicRow> = {}): DemographicRow {
  return {
    cell_id: "ACCOUNT",
    "Ad name": "All ads",
    Age: "25-34",
    Gender: "female",
    "Amount spent (USD)": 100,
    Reach: 900,
    Impressions: 1000,
    Results: 10,
    "Clicks (all)": 80,
    "Link clicks": 40,
    CPA_result: 10,
    CTR_link_pct: 4,
    Result_per_link_click_pct: 25,
    ...over,
  } as DemographicRow;
}

const totals = (spend: number, impressions: number, results: number) => ({ spend, reach: 0, impressions, results, clicks_all: 0, link_clicks: 0 });

function summary(bottom: CampaignSummary["bottom_line_totals"]): CampaignSummary {
  return { bottom_line_totals: bottom, total_spend_usd: 0, total_impressions: 0, total_link_clicks: 0, overall_link_ctr_pct: null, data_caveat: "" };
}

describe("an untyped demographic export is named from the campaign summary", () => {
  // Bookster's 62 rows: no Result type column, $701.29 and 31,542
  // impressions, exactly the summary's "Website registrations completed".
  const rows = [row({ "Amount spent (USD)": 400, Impressions: 20000, Results: 50 }), row({ "Amount spent (USD)": 301.29, Impressions: 11542, Results: 28 })];
  const bookster = summary({
    "Mobile app installs": totals(4766.02, 2494514, 486),
    "Website registrations completed": totals(701.29, 31542, 78),
    onb_initiate_checkout: totals(1746.44, 29426, 0),
  });

  it("names the one event whose spend and impressions are the rows' own", () => {
    expect(summaryEventForRows(rows, bookster)).toBe("Website registrations completed");
    const stages = buildFunnelStages(rows, bookster);
    const conv = stages.find((s) => s.zone === "conversion");
    expect(conv).toMatchObject({ label: "Registrations", value: 78, basis: "summary" });
    expect(conv!.pctOfPrev).toBeCloseTo((78 / 80) * 100, 3);
    expect(FUNNEL_BASIS_NOTE.summary).toMatch(/campaign summary/);
  });

  it("stays a gap when no event, or more than one, owns the totals", () => {
    expect(summaryEventForRows(rows, summary({ Leads: totals(9999, 1, 1) }))).toBeNull();
    expect(summaryEventForRows(rows, summary({
      Leads: totals(701.29, 31542, 78),
      "Website registrations completed": totals(701.29, 31542, 78),
    }))).toBeNull();
    expect(buildFunnelStages(rows, null).find((s) => s.zone === "conversion" && s.value != null)).toBeUndefined();
  });

  it("never overrides rows that carry their own Result type", () => {
    const typed = rows.map((r) => ({ ...r, "Result type": "Leads (form)" }));
    expect(summaryEventForRows(typed, bookster)).toBeNull();
    expect(buildFunnelStages(typed, bookster).find((s) => s.zone === "conversion")).toMatchObject({ label: "Leads", basis: "result_type" });
  });

  it("ignores the unknown bucket", () => {
    expect(summaryEventForRows(rows, summary({ unknown: totals(701.29, 31542, 78) }))).toBeNull();
  });
});

describe("the funnel carries one basis switch and names its rows", () => {
  const stages = [
    { key: "a", label: "Impressions", value: 1000 },
    { key: "b", label: "Clicks", value: 100 },
  ];

  it("a chart under a controlled basis renders no switch of its own", () => {
    const { unmount } = render(<FunnelChart stages={stages} basis="top" showBasisSwitch={false} />);
    expect(screen.queryByRole("group", { name: "Bar length basis" })).toBeNull();
    unmount();
    render(<FunnelChart stages={stages} />);
    expect(screen.getByRole("group", { name: "Bar length basis" })).toBeTruthy();
  });

  it("the waterfall renders the switch once above its bands, with the source line, and no CTR module", () => {
    const view = read("pages/metrix/analysis/EngagementFunnelView.tsx");
    const waterfall = view.slice(view.indexOf("function FunnelWaterfall"), view.indexOf("function SortableHeader"));
    expect(waterfall).toContain("<FunnelBasisSwitch basis={basis} onChange={setBasis} />");
    expect(waterfall).toContain("showBasisSwitch={false}");
    expect(waterfall).toContain('data-testid="funnel-source"');
    expect(view).not.toContain('title="CTR comparison"');
    // The video caveat is a disclosure line, never a second amber notice.
    expect(view).not.toMatch(/data-testid="video-metrics-note"[\s\S]{0,80}<CaveatNote/);
    const compact = read("pages/metrix/analysis/AdPerformanceView.tsx");
    expect(compact).toContain('data-testid="funnel-source"');
    expect(compact).toContain("buildFunnelStages(a.demographic_registration_signal, summary)");
  });
});

describe("the positioning map's quadrants speak the four verbs, from a legend", () => {
  it("labels and hints", () => {
    for (const label of Object.values(QUADRANT_LABEL)) expect(FOUR_VERBS).toContain(label);
    expect(QUADRANT_LABEL.explore).toBe("Validate");
    expect(QUADRANT_LABEL.avoid).toBe("Retire");
    for (const q of ["scale", "optimize", "explore", "avoid"] as const) expect(QUADRANT_HINT[q]).toMatch(/cost/);
  });

  it("no corner words, no in-plot median labels, a legend and a medians line", () => {
    const view = read("pages/metrix/analysis/AudienceView.tsx");
    expect(view).toContain('data-testid="positioning-legend"');
    expect(view).toContain('data-testid="positioning-medians"');
    expect(view).not.toContain("QUADRANT_LABEL[q].toUpperCase()");
    expect(view).not.toContain('value: "median"');
    // The export's share of the account, on the first layer of the KPI row.
    expect(view).toContain('data-testid="audience-source"');
  });

  it("every donut carries its legend", () => {
    expect(read("pages/metrix/analysis/AnalysisOverview.tsx")).not.toContain("showLegend={");
    expect(read("pages/metrix/strategy/StrategyOverview.tsx")).not.toContain("showLegend={");
  });
});

describe("the analysis export reads the run's grain and the current run", () => {
  const account = {
    id: "a", name: "A",
    ads: [
      { ad_name: "ad 1", performance: { spend: 10, results: 1, impressions: 100, link_clicks: 5, result_type: "Leads" } },
      { ad_name: "ad 2" },
    ],
  } as unknown as AdAccount;
  const analysis = {
    performance_by_cell: [],
    v3_variable_performance: [
      { variable_code: "HK_1", manual_analysis_run_id: "run-2" },
      { variable_code: "HK_1", manual_analysis_run_id: "run-1" },
      { variable_code: "HK_2", manual_analysis_run_id: null },
    ],
    latest_analysis_run_id: "run-2",
  } as unknown as AnalysisData;

  it("falls back to one row per ad with performance, and scopes the variable rows", () => {
    const rows = analysisExportRows(account, analysis);
    expect(rows.grain).toBe("ad");
    expect(rows.performance_by_cell).toHaveLength(1);
    expect(rows.v3_variable_performance).toHaveLength(2);
    expect(analysisExportEmpty(rows)).toBe(false);
    expect(analysisExportSummary(rows)).toEqual(["1 ads with performance", "2 variable performance rows"]);
  });

  it("keeps a cell library when the importer wrote one", () => {
    const rows = analysisExportRows(account, { ...analysis, performance_by_cell: [{ cell_id: "C1A" }] } as unknown as AnalysisData);
    expect(rows.grain).toBe("cell");
    expect(analysisExportSummary(rows)[0]).toBe("1 cell performance rows");
  });

  it("is empty only with no row at all", () => {
    const rows = analysisExportRows({ ...account, ads: [] } as AdAccount, { ...analysis, v3_variable_performance: [] } as unknown as AnalysisData);
    expect(rows.grain).toBeNull();
    expect(analysisExportEmpty(rows)).toBe(true);
  });

  it("the three export surfaces read through it", () => {
    for (const rel of ["pages/metrix/exports/ExportsCards.tsx", "pages/metrix/exports/ExportsAnalysisView.tsx", "pages/metrix/analysis/AnalysisCommandCenter.tsx"]) {
      expect(read(rel), rel).toContain("analysisExportRows(");
      expect(read(rel), rel).not.toContain("performance_by_cell.length === 0");
    }
  });
});

describe("the four verbs on the tier filter and the playbook lanes", () => {
  it("a bucket folds onto the verb it wears", () => {
    expect(bucketVerbKey("scale_now")).toBe("scale");
    expect(bucketVerbKey("explore")).toBe("validate");
    expect(bucketVerbKey("validate")).toBe("validate");
    expect(bucketVerbKey("avoid")).toBe("retire");
    expect(bucketVerbKey(null)).toBe("unclassified");
    for (const b of ["scale_now", "optimize", "validate", "explore", "avoid"] as const) {
      expect(BUCKET_LABEL[b].toLowerCase()).toBe(bucketVerbKey(b));
    }
  });

  it("the tier filter chips are the four verbs plus All and Unclassified", () => {
    const view = read("pages/metrix/analysis/AdPerformanceView.tsx");
    const block = view.slice(view.indexOf("const TIER_FILTERS"), view.indexOf("];", view.indexOf("const TIER_FILTERS")));
    for (const bad of ['"Explore"', '"Avoid"']) expect(block).not.toContain(bad);
    for (const verb of FOUR_VERBS) expect(block).toContain(`"${verb}"`);
  });

  it("the playbook renders Validate once, holding the explore list, and Retire for avoid", () => {
    const playbook = { scale_now: ["BOOK0 C1"], validate: ["BOOK0 C2"], explore: ["BOOK0 C3"], avoid_combinations: ["BOOK0 C4"] } as never;
    expect(playbookHasContent({ explore: ["BOOK0 C3"] } as never)).toBe(true);
    render(<ScalingPlaybookLanes playbook={playbook} />);
    expect(screen.getAllByText("Validate")).toHaveLength(1);
    expect(screen.getByText("Retire")).toBeTruthy();
    expect(screen.queryByText("Explore")).toBeNull();
    expect(screen.queryByText("Avoid")).toBeNull();
    expect(screen.getByText(/C3/)).toBeTruthy();
    expect(read("pages/metrix/mst/MstDirectionView.tsx")).toContain('sub="Validate + retire"');
  });
});

describe("a value a producer has not measured reads a dash, and a count counts its noun", () => {
  it("MST Creative Scan's mapping tiles wait for a scan", () => {
    const view = read("pages/metrix/mst/CreativeScanView.tsx");
    expect(view).toContain("const scanRan = library.some(");
    expect(view).toContain('value={scanRan ? String(mappedCells) : "–"}');
  });
  it("Creative Scan counts staged files as assets and lists its checks inside the empty state", () => {
    const view = read("pages/metrix/creative/CreativeScanView.tsx");
    expect(view).toContain("filter((c) => !!c.asset_filename).length");
    expect(view).toContain('sub={libraryCount > 0 ? "Awaiting first scan" : "No asset staged"}');
    expect(view).not.toContain("min-w-[660px]");
    expect(view).toContain('aria-label="Checks per asset"');
  });
  it("an MST avatar without a performance row has no spend share", () => {
    expect(read("pages/metrix/mst/MstCommandCenter.tsx")).toContain("{hasPerf && maxSpend > 0 && (");
  });
  it("Findings names the missing intelligence package, with a way out", () => {
    const view = read("pages/metrix/analysis/FindingsView.tsx");
    expect(view).toContain("No intelligence package for this account");
    expect(view).not.toContain("Run the full IAP loop to generate");
    expect(view).toContain('<CrossLink to="/app/analysis/performance" label="Ad Performance" />');
  });
  it("the hypotheses ready for a brief say so", () => {
    for (const rel of ["pages/metrix/strategy/StrategyCommandCenter.tsx", "pages/metrix/strategy/HypothesisQueueView.tsx", "pages/metrix/strategy/StrategyOverview.tsx"]) {
      expect(read(rel), rel).toContain('label="Hypotheses ready for brief"');
    }
  });
  it("the date range disclosure carries its value", () => {
    expect(read("pages/metrix/ManualAnalysisControls.tsx")).toContain('data-testid="date-range-current"');
  });
});

describe("phone rules on the primitives", () => {
  it("a section title wraps below lg and stays one line from lg up", () => {
    render(<SectionCard title="Share of spend vs. share of result"><div /></SectionCard>);
    const h2 = screen.getByRole("heading", { level: 2, name: "Share of spend vs. share of result" });
    expect(h2.className).toContain("max-lg:break-words");
    expect(h2.className).toContain("lg:truncate");
    expect(h2.className).not.toMatch(/(^|\s)truncate(\s|$)/);
  });
  it("the Strategy Map's hypotheses pane flows in the page below lg", () => {
    const view = read("pages/metrix/strategy/StrategyMapView.tsx");
    expect(view).toContain('"max-lg:w-full! shrink-0 max-lg:overflow-visible lg:overflow-y-auto"');
  });
  it("formula sequences are one column on a phone", () => {
    const shared = read("pages/metrix/strategy/strategyShared.tsx");
    const grid = shared.slice(shared.indexOf("export function VariableCombinationsGrid"), shared.indexOf("export function VariableCombinationsGrid") + 400);
    expect(grid).toContain("grid-cols-dashboard-3-md");
  });
  it("Ad Performance's module chips keep their Open link inside the card", () => {
    const view = read("pages/metrix/analysis/AdPerformanceView.tsx");
    expect(view).toContain('max-w-full rounded-lg border border-border/30 bg-foreground/[0.015] pl-3 pr-1.5 py-1.5');
    expect(view).toContain('<span className="shrink-0"><CrossLink to={s.to} label="Open" /></span>');
  });
  it("Strategy Overview's donut column holds its title and the family map its labels", () => {
    const view = read("pages/metrix/strategy/StrategyOverview.tsx");
    expect(view).toContain("lg:grid-cols-[260px_minmax(0,1fr)]");
    expect(view).toContain("minmax(112px,150px) repeat(${pillars.length}, minmax(0,1fr))");
  });
  it("a dumbbell row gives its plot a row of its own below sm", () => {
    const rows = read("components/charts/DumbbellRows.tsx");
    expect(rows).toContain('sm:grid-cols-[minmax(110px,190px)_1fr_auto]');
    expect(rows).toContain('className="relative h-4 max-sm:col-span-2 max-sm:order-last"');
  });
  it("a status hub input label is one fragment", () => {
    expect(read("components/loop/StatusHub.tsx")).toContain('<span className="text-foreground/85 whitespace-nowrap">{input.label}</span>');
  });
});
