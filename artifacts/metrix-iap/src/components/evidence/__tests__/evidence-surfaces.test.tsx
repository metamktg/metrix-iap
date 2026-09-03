// The evidence surfaces render their state, coverage and drill from rows —
// and the Creative dialog reaches them through mapped Ad IDs with no cell
// assignment (acceptance 10, 11).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AdBreakdownRow, LedgerRow, ReconciliationData } from "@/lib/data/seedTypes";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { DemographicHeatGrid } from "../DemographicHeatGrid";
import { PlacementDrill } from "../PlacementDrill";
import { ReconciliationPanel } from "../ReconciliationPanel";

const row = (over: Partial<AdBreakdownRow>): AdBreakdownRow => ({
  breakdown: "demographic",
  attribution: "direct_segment",
  ad_identity_kind: "ad_id",
  ad_identity: "111",
  meta_ad_id: "111",
  ad_name: "C8A_HK_Question",
  segment: { gender: "female", age: "25-34" },
  segment_key: "a",
  result_type: "Purchases",
  date_start: "2026-08-01",
  date_end: "2026-08-30",
  spend: 30,
  impressions: 3000,
  reach: null,
  reach_basis: null,
  clicks_all: 70,
  link_clicks: 60,
  results: 2,
  metrics: { amount_spent: 30 },
  evidence_state: "observed_partial",
  coverage_pct: 60,
  ...over,
});

const demoRows = [
  row({}),
  row({ ad_identity: "112", meta_ad_id: "112", segment: { gender: "male", age: "35-44" }, segment_key: "b", spend: 20, results: 1, evidence_state: "observed_reconciled", coverage_pct: 100 }),
];
const placementRows = [
  row({ breakdown: "placement", segment: { platform: "instagram", placement: "instagram_reels", device: "iphone" }, segment_key: "p1", spend: 25 }),
  row({ breakdown: "placement", segment: { platform: "facebook", placement: "feed", device: "android_smartphone" }, segment_key: "p2", spend: 15, evidence_state: "observed_reconciled", coverage_pct: 100 }),
];

const ledger: LedgerRow[] = [
  { scope: "account", ad_identity_kind: null, ad_identity: "", ad_name: null, meta_ad_id: null, report_class: "demographic", metric: "amount_spent", grain: "ad × age × gender × period", truth_source: "ad_summary", truth_value: 4405.61, observed_value: 2645.74, coverage_pct: 60.05, residual: 1759.87, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
  { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "111", ad_name: "C8A_HK_Question", meta_ad_id: "111", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: 100, observed_value: 60, coverage_pct: 60, residual: 40, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
  { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "999", ad_name: "C1A_absent", meta_ad_id: "999", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: 48.31, observed_value: 0, coverage_pct: 0, residual: 48.31, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
  { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "555", ad_name: "C2A_noid", meta_ad_id: "555", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: null, observed_value: 12, coverage_pct: null, residual: null, direct_share: 1, modelled_share: 0, evidence_state: "unreconciled", compatibility_failures: [{ kind: "truth_missing_ad_id", detail: 'Add "Ad ID" to the Ad Summary export to reconcile per ad.' }] },
];
const reconciliation: ReconciliationData = {
  summary: {
    truth_source: "ad_summary",
    truth_identity_kind: "ad_id",
    breakdowns: [{ report_class: "demographic", by_metric: [{ metric: "amount_spent", truth_value: 4405.61, observed_value: 2645.74, coverage_pct: 60.05, residual: 1759.87, evidence_state: "observed_partial" }], ads_total: 44, ads_reconciled: 0, ads_partial: 34, ads_overcounted: 0, ads_unreconciled: 0, ads_incompatible: 0, ads_missing_from_breakdown: 10 }],
    notes: [],
  },
  ledger,
};

beforeEach(() => cleanup());

describe("DemographicHeatGrid", () => {
  it("shows the evidence chip, coverage strip, unattributed row and an in-place drill", () => {
    render(<TooltipProvider><DemographicHeatGrid rows={demoRows} /></TooltipProvider>);
    const grid = screen.getByTestId("demographic-heat-grid");
    expect(within(grid).getAllByTestId("evidence-chip")[0].getAttribute("data-state")).toBe("observed_partial");
    expect(within(grid).getByTestId("coverage-strip").textContent ?? "").toContain("71%");
    // truth 30/0.6 + 20 = 70 → 20 unattributed
    expect(within(grid).getByTestId("unattributed-row").textContent ?? "").toContain("$20");
    const rows = within(within(grid).getByTestId("segment-drill")).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(rows[0]!);
    expect(rows[0].getAttribute("aria-expanded")).toBe("true");
    expect(within(grid).getByTestId("segment-evidence-chip")).toBeTruthy();
    expect(within(grid).getByText("not additive")).toBeTruthy();
  });
});

describe("PlacementDrill", () => {
  it("renders platform rows with per-level evidence chips and the unattributed residual", () => {
    render(<TooltipProvider><PlacementDrill rows={placementRows} unattributedSpend={12.5} /></TooltipProvider>);
    const drill = screen.getByTestId("placement-drill");
    expect(within(drill).getAllByTestId("placement-evidence-0")).toHaveLength(2);
    // fmtMetric("usd_total") is the platform's whole-dollar precision for totals.
    expect(within(drill).getByTestId("unattributed-row").textContent ?? "").toContain("$13");
    expect(within(drill).getByText(/Instagram/)).toBeTruthy();
  });
});

describe("ReconciliationPanel", () => {
  it("opens to the account row, per-ad coverage meters and the missing-field note", () => {
    render(<TooltipProvider><ReconciliationPanel reconciliation={reconciliation} /></TooltipProvider>);
    const panel = screen.getByTestId("reconciliation-panel");
    expect(within(panel).getByTestId("reconciliation-state").getAttribute("data-state")).toBe("observed_partial");
    expect(panel.textContent ?? "").toContain("60.05% of spend");
    fireEvent.click(within(panel).getByRole("button", { expanded: false }));
    expect(within(panel).getByTestId("reconciliation-account-row").textContent ?? "").toContain("$2,646");
    expect(within(panel).getByTestId("reconciliation-ad-counts").textContent ?? "").toContain("10 absent from this breakdown");
    const adRows = within(panel).getAllByTestId("reconciliation-ad-row");
    expect(adRows).toHaveLength(3);
    // sorted by residual: the absent ad (48.31) after the partial one (40)? No — 48.31 > 40 sorts first.
    expect(adRows[0].textContent ?? "").toContain("C1A_absent");
    expect(adRows[2].textContent ?? "").toContain('Add "Ad ID" to the Ad Summary export');
    expect(within(adRows[2]!).getByTestId("reconciliation-ad-state").getAttribute("data-state")).toBe("unreconciled");
  });

  it("renders nothing without a summary", () => {
    const { container } = render(<TooltipProvider><ReconciliationPanel reconciliation={null} /></TooltipProvider>);
    expect(container.querySelector('[data-testid="reconciliation-panel"]')).toBeNull();
  });

  it("with a summary but no breakdown class reconciled, still names the control instead of vanishing", () => {
    // An Ad Summary staged alone yields a summary (truth source found) with
    // an empty breakdowns list. The panel used to return null here, which
    // read as "reconciliation does not exist for this account" — the truth
    // is that a control exists and nothing was reconciled against it.
    const summaryOnly: ReconciliationData = { summary: { ...reconciliation.summary!, breakdowns: [] }, ledger: [] };
    render(<TooltipProvider><ReconciliationPanel reconciliation={summaryOnly} /></TooltipProvider>);
    const panel = screen.getByTestId("reconciliation-panel");
    const line = within(panel).getByTestId("reconciliation-summary-line").textContent ?? "";
    expect(line).toContain("no breakdown class reconciled");
    expect(line).toContain("control: Ad Summary per Ad ID");
    fireEvent.click(within(panel).getByRole("button", { expanded: false }));
    expect(panel.textContent ?? "").toContain("nothing to reconcile against the control");
    expect(within(panel).queryByTestId("reconciliation-account-row")).toBeNull();
  });
});
