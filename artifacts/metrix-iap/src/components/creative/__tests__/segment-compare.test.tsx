// ─── Segment side-by-side comparison tests ────────────────────────────
// Renders SegmentDrilldownModal against the checked-in seed fixture and
// verifies the compare flow: pick a second segment → both segments'
// metrics and ranked concepts/variables render side by side, computed
// by the same computeSegmentDrilldown math as the single view — then
// exiting compare restores the single-segment drill-down.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";

vi.mock("@/contexts/MetrixDataContext", async () => {
  const { seed } = await import("../../../navigation/__tests__/seed");
  return {
    useMetrixSeed: () => seed,
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@/contexts/AccountContext", async () => {
  const actual = await vi.importActual<object>("@/contexts/AccountContext");
  return {
    ...actual,
    useScopedAdAccountId: () => "bookster",
  };
});

import { seed } from "../../../navigation/__tests__/seed";
import type { AnalysisData, MetrixSeed } from "@/lib/data/seedTypes";
import {
  scopeDemographicRows,
  listSegments,
  segmentKey,
  segmentLabel,
  computeSegmentDrilldown,
} from "@/lib/segment-analytics";
import { getMST } from "@/lib/data/metrixSeedAdapter";
import { SegmentDrilldownModal } from "../SegmentDrilldownModal";

const bundle = seed as unknown as MetrixSeed;

function booksterAnalysis(): AnalysisData {
  const acct = bundle.ad_accounts.find((a) => a.id === "bookster");
  if (!acct?.iap?.analysis) throw new Error("fixture missing bookster analysis");
  return acct.iap.analysis;
}

function segments(analysis: AnalysisData) {
  return listSegments(scopeDemographicRows(analysis.demographic_registration_signal ?? [], null));
}

describe("segment side-by-side comparison", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("fixture has at least two segments to compare", () => {
    expect(segments(booksterAnalysis()).length).toBeGreaterThanOrEqual(2);
  });

  it("offers a compare picker listing the other segments (never the current one)", () => {
    const analysis = booksterAnalysis();
    const segs = segments(analysis);
    const primary = segs[0]!;
    render(
      <SegmentDrilldownModal open onClose={() => {}} segment={primary} analysis={analysis} cellIds={null} />
    );

    fireEvent.click(screen.getByTestId("button-segment-compare"));
    // Current segment must not be offered against itself.
    expect(screen.queryByTestId(`picker-compare-segment-${segmentKey(primary)}`)).toBeNull();
    for (const s of segs.slice(1)) {
      expect(screen.getByTestId(`picker-compare-segment-${segmentKey(s)}`)).toBeTruthy();
    }
  });

  it("picking a second segment renders both segments' metrics side by side with honest values", () => {
    const analysis = booksterAnalysis();
    const segs = segments(analysis);
    const [a, b] = [segs[0]!, segs[1]!];
    render(
      <SegmentDrilldownModal open onClose={() => {}} segment={a} analysis={analysis} cellIds={null} />
    );

    fireEvent.click(screen.getByTestId("button-segment-compare"));
    fireEvent.click(screen.getByTestId(`picker-compare-segment-${segmentKey(b)}`));

    // Title switches to "A vs B".
    expect(screen.getByTestId("title-segment-drilldown").textContent).toBe(
      `${segmentLabel(a)} vs ${segmentLabel(b)}`
    );
    expect(screen.getByTestId("label-compare-a").textContent).toBe(segmentLabel(a));
    expect(screen.getByTestId("label-compare-b").textContent).toBe(segmentLabel(b));

    // Spend cells carry each segment's own computed total — same math as
    // the pure layer, no cross-contamination between columns.
    const mst = getMST(bundle, "bookster");
    const dataA = computeSegmentDrilldown(analysis, mst, a, null);
    const dataB = computeSegmentDrilldown(analysis, mst, b, null);
    expect(dataA.totals.spend).not.toBeNull();
    expect(dataB.totals.spend).not.toBeNull();
    const cellA = screen.getByTestId("cell-compare-metric-spend-a");
    const cellB = screen.getByTestId("cell-compare-metric-spend-b");
    expect(cellA.textContent).toContain(
      dataA.totals.spend!.toLocaleString("en-US", { style: "currency", currency: "USD" })
    );
    expect(cellB.textContent).toContain(
      dataB.totals.spend!.toLocaleString("en-US", { style: "currency", currency: "USD" })
    );
    expect(cellA.textContent).not.toBe(cellB.textContent);

    // Both attribution columns render their own ranked concepts.
    const colA = screen.getByTestId("compare-column-a");
    const colB = screen.getByTestId("compare-column-b");
    expect(dataA.attribution.available).toBe(true);
    expect(dataB.attribution.available).toBe(true);
    const topA = dataA.attribution.cells[0]!;
    const topB = dataB.attribution.cells[0]!;
    expect(within(colA).getByTestId(`row-compare-concept-a-${topA.cellId}`)).toBeTruthy();
    expect(within(colB).getByTestId(`row-compare-concept-b-${topB.cellId}`)).toBeTruthy();
  });

  it("exiting compare restores the single-segment drill-down", () => {
    const analysis = booksterAnalysis();
    const segs = segments(analysis);
    const [a, b] = [segs[0]!, segs[1]!];
    render(
      <SegmentDrilldownModal open onClose={() => {}} segment={a} analysis={analysis} cellIds={null} />
    );

    fireEvent.click(screen.getByTestId("button-segment-compare"));
    fireEvent.click(screen.getByTestId(`picker-compare-segment-${segmentKey(b)}`));
    expect(screen.getByTestId("button-clear-compare")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-clear-compare"));
    expect(screen.getByTestId("title-segment-drilldown").textContent).toBe(
      `${segmentLabel(a)} — what's driving results`
    );
    expect(screen.getByTestId("tile-segment-metric-spend")).toBeTruthy();
    expect(screen.queryByTestId("cell-compare-metric-spend-a")).toBeNull();
  });
});
