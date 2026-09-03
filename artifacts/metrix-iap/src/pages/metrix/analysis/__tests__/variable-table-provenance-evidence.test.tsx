// ─── VariableTable · provenance (G1), evidence (G2/G3), scale (rule) ──
// Library rows used to show no provenance; the evidence layer's
// confidence / observed coverage / adjusted rate reached the client and
// rendered nowhere; and an awareness row's CPA sat in the same column as a
// purchase row's. Each is a column that exists only when the rows carry
// what it shows — never a column of dashes.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { VariableTable } from "../tables";
import type { VariablePerformanceRow, VariableSegmentRow } from "@/lib/data/seedTypes";

afterEach(cleanup);

function row(over: Partial<VariablePerformanceRow>): VariablePerformanceRow {
  return {
    variable_id: "HK_Benefit",
    variable_family: "hook",
    "Result type": "Website purchases",
    "Amount spent (USD)": 900,
    Reach: 0, Impressions: 0, "Clicks (all)": 0, "Link clicks": 100,
    unique_ads: 3,
    Results: 10,
    CPA_result: 90,
    CTR_link_pct: 1.2,
    Result_per_link_click_pct: 10,
    ...over,
  };
}

function segment(over: Partial<VariableSegmentRow>): VariableSegmentRow {
  return {
    variable_family: "hook",
    variable_id: "HK_Benefit",
    breakdown: "all",
    segment: {},
    segment_key: "",
    result_type: "Website purchases",
    contributing_ad_ids: ["1", "2"],
    contributing_asset_keys: [],
    direct_totals: {},
    contextual_totals: {},
    observed_coverage_pct: 92.4,
    modelled_share: 0,
    result_volume: 10,
    cost_per_result: 90,
    raw_rate: null,
    adjusted_rate: null,
    interaction_index: null,
    contributing_ads: 2,
    evidence_state: "observed_reconciled",
    confidence: "medium",
    ...over,
  } as VariableSegmentRow;
}

describe("VariableTable · Run column (provenance)", () => {
  it("shows no Run column when every row is from one run", () => {
    render(<VariableTable rows={[row({ manual_analysis_run_id: "aaaa-1", date_start: "2026-06-01", date_end: "2026-06-30" }), row({ variable_id: "TN_Warm", manual_analysis_run_id: "aaaa-1" })]} />);
    expect(screen.queryByText("Run")).toBeNull();
    expect(screen.queryAllByTestId("variable-run-cell")).toHaveLength(0);
  });

  it("adds a Run column when rows span more than one run, labelled by the picker's label and carrying run id + window in its title", () => {
    const runLabel = (id: string) => (id === "aaaa-1" ? "Jun 1 – Jun 30" : undefined);
    render(
      <VariableTable
        runLabel={runLabel}
        rows={[
          row({ manual_analysis_run_id: "aaaa-1", date_start: "2026-06-01", date_end: "2026-06-30" }),
          row({ manual_analysis_run_id: "bbbb-2", date_start: "2026-07-01", date_end: "2026-07-31", "Amount spent (USD)": 400 }),
          row({ variable_id: "TN_Warm", manual_analysis_run_id: null }),
        ]}
      />,
    );
    expect(screen.getByText("Run")).toBeTruthy();
    const cells = screen.getAllByTestId("variable-run-cell");
    expect(cells).toHaveLength(3);
    expect(cells[0]!.textContent).toBe("Jun 1 – Jun 30");
    expect(cells[0]!.getAttribute("title")).toContain("aaaa-1");
    expect(cells[0]!.getAttribute("title")).toContain("2026-06-01 – 2026-06-30");
    // No picker label for the second run: the row's own window stands in.
    expect(cells[1]!.textContent).toContain("Jul");
    // A pre-migration row says so rather than borrowing a run.
    expect(cells[2]!.textContent).toBe("untagged");
  });
});

describe("VariableTable · Evidence column", () => {
  it("renders nothing evidence-related when no segments are supplied", () => {
    render(<VariableTable rows={[row({})]} />);
    expect(screen.queryByText("Evidence")).toBeNull();
    expect(screen.queryByText("Adjusted rate")).toBeNull();
  });

  it("shows confidence + observed coverage for a row with an `all` evidence entry under the SAME result type, with state and ad count in the title", () => {
    render(
      <VariableTable
        rows={[row({}), row({ variable_id: "TN_Warm", "Result type": "Leads (form)" })]}
        segments={[segment({}), segment({ variable_id: "HK_Benefit", result_type: "Leads (form)", confidence: "high", observed_coverage_pct: 50 })]}
      />,
    );
    expect(screen.getByText("Evidence")).toBeTruthy();
    const cells = screen.getAllByTestId("variable-evidence-cell");
    // HK_Benefit is joined on purchases only — the lead evidence for the same
    // token never describes its purchase row; TN_Warm has no evidence row.
    expect(cells).toHaveLength(1);
    expect(within(cells[0]!).getByText(/^medium$/i)).toBeTruthy();
    expect(within(cells[0]!).getByText("92%")).toBeTruthy();
    expect(cells[0]!.getAttribute("title")).toContain("observed · reconciled");
    expect(cells[0]!.getAttribute("title")).toContain("2 contributing ads");
  });

  it("ignores segment (non-`all`) rows for the join", () => {
    render(<VariableTable rows={[row({})]} segments={[segment({ breakdown: "demographic", segment_key: "25-34|female" })]} />);
    expect(screen.queryByText("Evidence")).toBeNull();
  });

  it("adds an Adjusted rate column beside CPA only when the layer computed one, with the raw rate in the title", () => {
    render(<VariableTable rows={[row({})]} segments={[segment({ raw_rate: 4.2, adjusted_rate: 4.9 })]} />);
    expect(screen.getByText("Adjusted rate")).toBeTruthy();
    const cell = screen.getByText("4.90%");
    expect(cell.getAttribute("title")).toContain("Raw rate 4.20%");
  });
});

describe("VariableTable · awareness rows are never scored on cost", () => {
  it("renders — with the reason in its title for a row on the communication scale, and keeps CPA for a purchase row", () => {
    render(
      <VariableTable
        rows={[
          row({ variable_id: "HK_Loud", "Result type": "ThruPlays", CPA_result: 0.02, intent_class: "awareness" }),
          row({ variable_id: "HK_Quiet", "Result type": "Video views", CPA_result: 0.03 }), // no stored class: classified from the raw type
          row({}),
        ]}
      />,
    );
    const dashes = screen.getAllByTitle(/communication signals/);
    expect(dashes).toHaveLength(2);
    expect(dashes.every((d) => d.textContent === "—")).toBe(true);
    expect(screen.getByText("$90.00")).toBeTruthy();
    expect(screen.queryByText("$0.02")).toBeNull();
  });
});
