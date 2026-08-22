// ─── Deep-dive: MST cell + message-pillar modules ──────────────────────
// Covers the two new module builders that replace the old
// TilePerformanceModal pop-up and the always-inline Communications pillar
// prose: pure module building (honest "never ran" / omitted-funnel-step
// notes, ROAS always n/a, actions honor trayScopeId/onOpenSegments) and
// panel rendering of the new block kinds (variables, funnel, actions,
// pillar_details, hypotheses, titled notes).

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import React from "react";

import { buildCellDeepDiveModule, buildPillarDeepDiveModule } from "@/lib/data/deepDive";
import { DeepDiveProvider, useDeepDive } from "@/contexts/DeepDiveContext";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { DeepDivePanel } from "../DeepDivePanel";
import { _resetForTest as resetTray, getTrayItem } from "@/lib/data/trayStore";
import { resolveVariableLabel } from "@/lib/variable-registry";
import type { AnalysisData, CellPerformanceRow, ICPProfile, MessagePillar, MST, MSTMatrixCell } from "@/lib/data/seedTypes";

const mockNavigate = vi.fn();
vi.mock("wouter", () => ({
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/", mockNavigate] as [string, typeof mockNavigate],
}));

afterEach(cleanup);
beforeEach(() => {
  resetTray();
  mockNavigate.mockClear();
});

// ─── Fixtures ───────────────────────────────────────────────────────────

const perfRow = (o: Partial<CellPerformanceRow>): CellPerformanceRow => ({
  cell_id: "C2B", "Result type": "Website registrations completed",
  "Amount spent (USD)": 0, Reach: 0, Impressions: 0, Results: 0,
  "Clicks (all)": 0, "Link clicks": 0, CPA_result: null,
  CTR_link_pct: 0, Result_per_link_click_pct: 0, book2_concept_name: "Concept One",
  ...o,
});

const MATRIX_CELL: MSTMatrixCell = {
  cell_id: "C2B",
  column_id: "C2",
  row_id: "B",
  column_label: "Efficiency\nAchiever",
  row_shared_variable: "TN_Rational",
  diagonal_role: "diag_down",
  concept_code: "CN_Comparison",
  variable_stack: { cn: "CN_Comparison", hk: "HK_Benefit", tn: "TN_Rational" },
  plain_text: { headline: "Read smarter, not longer.", primary: "Full body copy for C2B." },
};

const MST_FIXTURE: MST = {
  status: "active",
  render_policy: "",
  local_book2_library: [],
};

function analysisWith(rows: CellPerformanceRow[]): AnalysisData {
  return {
    performance_by_cell: rows,
    v3_variable_performance: [],
    demographic_registration_signal: [],
    v3_placement_signal: [],
    c4e_placement_signal: [],
    top_checkout_cells: [],
    top_checkout_variables: [],
  };
}

// ─── buildCellDeepDiveModule (pure) ─────────────────────────────────────

describe("buildCellDeepDiveModule", () => {
  it("cells that never ran get an honest note, never fabricated numbers", () => {
    const mod = buildCellDeepDiveModule({
      cellId: "C2B",
      matrixCell: MATRIX_CELL,
      analysis: analysisWith([]),
      mst: MST_FIXTURE,
    });
    expect(mod.blocks.some((b) => b.kind === "note" && b.text.includes("never ran"))).toBe(true);
    expect(mod.blocks.some((b) => b.kind === "stats")).toBe(false);
    expect(mod.blocks.some((b) => b.kind === "funnel")).toBe(false);
  });

  it("ran cells get real stats, ROAS always n/a with a reason, and a funnel that stops where the data stops", () => {
    const rows = [
      perfRow({ "Amount spent (USD)": 675.81, Impressions: 30803, "Link clicks": 463, Results: 74, Reach: 26808 }),
    ];
    const mod = buildCellDeepDiveModule({
      cellId: "C2B",
      matrixCell: MATRIX_CELL,
      analysis: analysisWith(rows),
      mst: MST_FIXTURE,
    });

    const stats = mod.blocks.find((b) => b.kind === "stats");
    expect(stats).toBeTruthy();
    const statList = (stats as any).stats;
    const spendStat = statList.find((s: any) => s.metricId === "spend");
    expect(spendStat.value).toContain("676");
    const roasStat = statList.find((s: any) => s.metricId === "roas");
    expect(roasStat.value).toBe("n/a");
    expect(roasStat.note).toMatch(/never fabricated/i);

    const funnel = mod.blocks.find((b) => b.kind === "funnel") as any;
    expect(funnel.steps.map((s: any) => s.label)).toEqual(["Impressions", "Link clicks"]);
    // Downstream ecommerce steps aren't in this row → honest omission note, never a fabricated zero step.
    expect(mod.blocks.some((b) => b.kind === "note" && b.text.includes("Downstream funnel steps"))).toBe(true);
  });

  it("appends real downstream funnel steps only as far as the data actually goes", () => {
    const rows = [
      perfRow({ "Amount spent (USD)": 100, Impressions: 1000, "Link clicks": 100, Results: 10, adds_to_cart: 40, checkouts_initiated: null }),
    ];
    const mod = buildCellDeepDiveModule({
      cellId: "C2B", matrixCell: MATRIX_CELL, analysis: analysisWith(rows), mst: MST_FIXTURE,
    });
    const funnel = mod.blocks.find((b) => b.kind === "funnel") as any;
    expect(funnel.steps.map((s: any) => s.label)).toEqual(["Impressions", "Link clicks", "Adds to cart"]);
    const atc = funnel.steps.find((s: any) => s.label === "Adds to cart");
    expect(atc.pctOfPrior).toBeCloseTo(40, 0);
    // Checkout/purchase never backed by this row → honest note, no fabricated zero step.
    expect(mod.blocks.some((b) => b.kind === "note" && b.text.includes("Downstream funnel steps"))).toBe(true);
  });

  it("variable stack codes come from the matrix cell / library fields, not hand-rolled parsing", () => {
    const mod = buildCellDeepDiveModule({
      cellId: "C2B", matrixCell: MATRIX_CELL, analysis: analysisWith([perfRow({ Results: 1, "Amount spent (USD)": 10 })]), mst: MST_FIXTURE,
    });
    const vars = mod.blocks.find((b) => b.kind === "variables") as any;
    expect(vars.codes).toEqual(expect.arrayContaining(["CN_Comparison", "HK_Benefit", "TN_Rational"]));
  });

  it("actions include Ads Manager + Open in IAP Library always, tray only when scoped, segments only when ran + wired", () => {
    const notRan = buildCellDeepDiveModule({
      cellId: "C2B", matrixCell: MATRIX_CELL, analysis: analysisWith([]), mst: MST_FIXTURE,
      trayScopeId: "acct-1", onOpenSegments: vi.fn(),
    });
    const notRanActions = (notRan.blocks.find((b) => b.kind === "actions") as any).actions;
    expect(notRanActions.map((a: any) => a.kind)).toEqual(["ads_manager", "tray", "link"]);

    const ran = buildCellDeepDiveModule({
      cellId: "C2B", matrixCell: MATRIX_CELL, analysis: analysisWith([perfRow({ Results: 1, "Amount spent (USD)": 10 })]), mst: MST_FIXTURE,
      trayScopeId: "acct-1", onOpenSegments: vi.fn(),
    });
    const ranActions = (ran.blocks.find((b) => b.kind === "actions") as any).actions;
    expect(ranActions.map((a: any) => a.kind)).toEqual(["ads_manager", "tray", "callback", "link"]);

    const noTray = buildCellDeepDiveModule({
      cellId: "C2B", matrixCell: MATRIX_CELL, analysis: analysisWith([]), mst: MST_FIXTURE,
    });
    const noTrayActions = (noTray.blocks.find((b) => b.kind === "actions") as any).actions;
    expect(noTrayActions.map((a: any) => a.kind)).toEqual(["ads_manager", "link"]);
  });
});

// ─── buildPillarDeepDiveModule (pure) ────────────────────────────────────

const PILLAR: MessagePillar = {
  id: "pillar-1",
  label: "Time-poor efficiency",
  source_cells: ["C2B", "C2E", "C2F"],
  plain_descriptor: "Rational, benefit-led copy for time-poor achievers.",
  why_it_matters: "This pillar unlocks registrations without dragging checkout depth down.",
  variable_stack: { hk: "HK_Benefit", tn: "TN_Rational", cta: "" },
  funnel_application: "Mid-funnel retargeting.",
  target_icps: ["ICP_Achiever"],
};

const PROFILES: ICPProfile[] = [
  { profile_id: "ICP_Achiever", profile_name: "Achiever (busy professional)", message_resonance: "Responds to rational, benefit-forward copy.", confidence_level: "high" },
];

describe("buildPillarDeepDiveModule", () => {
  it("carries evidence stats, variable codes, why-it-matters / resonance notes, pillar details, and hypotheses", () => {
    const mod = buildPillarDeepDiveModule({
      pillar: PILLAR,
      hypotheses: [{ id: "h1", label: "HK_Benefit outperforms HK_Problem for Achievers", source: "x", status: "validation_required", pillar_id: "pillar-1" }],
      profiles: PROFILES,
    });
    expect(mod.title).toBe("Time-poor efficiency");
    expect(mod.kicker).toBe("Message pillar");

    const stats = (mod.blocks.find((b) => b.kind === "stats") as any).stats;
    expect(stats.find((s: any) => s.metricId === "confidence").value).toBe("High evidence");
    expect(stats.find((s: any) => s.metricId === "hypotheses").value).toBe("1");
    expect(stats.find((s: any) => s.metricId === "targets").value).toBe("1");

    const vars = mod.blocks.find((b) => b.kind === "variables") as any;
    expect(vars.codes).toEqual(["HK_Benefit", "TN_Rational"]);

    expect(mod.blocks.some((b) => b.kind === "note" && b.title === "Why it matters")).toBe(true);
    expect(mod.blocks.some((b) => b.kind === "note" && b.title === "Message resonance")).toBe(true);
    expect(mod.blocks.some((b) => b.kind === "pillar_details")).toBe(true);

    const hyp = mod.blocks.find((b) => b.kind === "hypotheses") as any;
    expect(hyp.items).toHaveLength(1);
    expect(hyp.title).toContain("1 testing hypothesis");
  });

  it("omits the hypotheses block honestly when none test this pillar", () => {
    const mod = buildPillarDeepDiveModule({ pillar: PILLAR, hypotheses: [], profiles: PROFILES });
    expect(mod.blocks.some((b) => b.kind === "hypotheses")).toBe(false);
  });
});

// ─── Panel rendering of the new block kinds ─────────────────────────────

function PanelHarness({ buildModule }: { buildModule: () => ReturnType<typeof buildCellDeepDiveModule> }) {
  const { push } = useDeepDive();
  return (
    <TooltipProvider>
      <button onClick={() => push(buildModule())}>open</button>
      <DeepDivePanel />
    </TooltipProvider>
  );
}

describe("DeepDivePanel — new block kinds", () => {
  it("renders variable chips, the funnel step list, and the action row for a ran MST cell", () => {
    const onOpenSegments = vi.fn();
    const build = () =>
      buildCellDeepDiveModule({
        cellId: "C2B",
        matrixCell: MATRIX_CELL,
        analysis: analysisWith([perfRow({ "Amount spent (USD)": 100, Impressions: 1000, "Link clicks": 100, Results: 10 })]),
        mst: MST_FIXTURE,
        trayScopeId: "acct-1",
        onOpenSegments,
      });
    render(<DeepDiveProvider><PanelHarness buildModule={build} /></DeepDiveProvider>);
    fireEvent.click(screen.getByText("open"));

    const panel = screen.getByTestId("deep-dive-panel");
    expect(within(panel).getByTestId("deep-dive-variables").textContent).toContain(resolveVariableLabel("HK_Benefit"));
    expect(within(panel).getByTestId("deep-dive-funnel").textContent).toContain("Impressions");
    expect(within(panel).getByTestId("deep-dive-funnel").textContent).toContain("Link clicks");

    // Actions: Ads Manager (disabled — no ad ids in this fixture), Add to Tray, Avatar × placement, Open in IAP Library.
    const actions = within(panel).getByTestId("deep-dive-actions");
    expect(within(actions).getByText(/Add to Tray/i)).toBeTruthy();
    expect(within(actions).getByText("Avatar × placement")).toBeTruthy();
    expect(within(actions).getByText("Open in IAP Library")).toBeTruthy();

    fireEvent.click(within(actions).getByText("Avatar × placement"));
    expect(onOpenSegments).toHaveBeenCalledTimes(1);

    // Add to Tray actually writes through to the real tray store.
    fireEvent.click(within(actions).getByText(/Add to Tray/i));
    expect(getTrayItem("acct-1", "mst-cell:C2B")?.status).toBe("open");
  });

  it("renders the honest 'never ran' note instead of fabricated stats", () => {
    const build = () =>
      buildCellDeepDiveModule({ cellId: "C2B", matrixCell: MATRIX_CELL, analysis: analysisWith([]), mst: MST_FIXTURE });
    render(<DeepDiveProvider><PanelHarness buildModule={build} /></DeepDiveProvider>);
    fireEvent.click(screen.getByText("open"));
    const notes = screen.getAllByTestId("deep-dive-note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => /never ran/i.test(t))).toBe(true);
    expect(screen.queryByTestId("deep-dive-funnel")).toBeNull();
  });

  it("renders pillar details and hypotheses blocks for a message pillar", () => {
    const build = () =>
      buildPillarDeepDiveModule({
        pillar: PILLAR,
        hypotheses: [{ id: "h1", label: "HK_Benefit outperforms HK_Problem", source: "x", status: "high", pillar_id: "pillar-1" }],
        profiles: PROFILES,
      });
    render(<DeepDiveProvider><PanelHarness buildModule={build as any} /></DeepDiveProvider>);
    fireEvent.click(screen.getByText("open"));

    const panel = screen.getByTestId("deep-dive-panel");
    expect(within(panel).getByText("Why it matters")).toBeTruthy();
    expect(within(panel).getByText("Message resonance")).toBeTruthy();
    expect(within(panel).getByTestId("deep-dive-hypotheses")).toBeTruthy();
  });
});
