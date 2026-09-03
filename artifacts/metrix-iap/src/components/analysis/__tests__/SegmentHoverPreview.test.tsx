// ─── SegmentHoverPreview — unit tests ─────────────────────────────────
// Radix HoverCard is stubbed to render inline (same convention as
// MetricHoverPopover-empty.test.tsx) so assertions can read the preview
// content without a real portal. Covers: kicker/title/value rows, the
// derived cost-per-result honesty rule, the n/a path, the note line, and
// the deep-dive footer cue gating.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("@workspace/command-deck/components/ui/hover-card", () => {
  const React = require("react");
  return {
    HoverCard: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    HoverCardTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    HoverCardContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "hover-card-content" }, children),
  };
});

import { SegmentHoverPreview } from "../SegmentHoverPreview";
import type { BreakdownRow } from "@/lib/data/kpiBreakdown";

afterEach(cleanup);

const row = (o: Partial<BreakdownRow>): BreakdownRow => ({
  key: "seg", label: "Concept One", value: 100, formatted: "$100",
  spend: 100, results: 4,
  ...o,
});

function renderPreview(r: BreakdownRow, drillable = true) {
  return render(
    <SegmentHoverPreview kicker="Concept" metricLabel="Total spend" row={r} drillable={drillable}>
      <span>trigger</span>
    </SegmentHoverPreview>,
  );
}

describe("SegmentHoverPreview", () => {
  it("renders kicker, segment title, metric/spend/results rows and derived cost per result", () => {
    renderPreview(row({}));
    expect(screen.getByTestId("segment-preview-kicker").textContent).toBe("Concept");
    expect(screen.getByTestId("segment-preview-title").textContent).toBe("Concept One");
    const values = screen.getByTestId("segment-preview-values").textContent!;
    expect(values).toContain("Total spend");
    expect(values).toContain("$100");
    expect(values).toContain("Results");
    // Derived: 100 / 4 = $25.00
    expect(values).toContain("Cost / result");
    expect(values).toContain("25");
  });

  it("shows n/a and omits cost per result when the row carries no results", () => {
    renderPreview(row({ results: null, value: null, formatted: "n/a" }));
    const values = screen.getByTestId("segment-preview-values").textContent!;
    expect(values).toContain("n/a");
    expect(values).not.toContain("Cost / result");
  });

  it("omits cost per result at zero results. Never divides into a fabricated number", () => {
    renderPreview(row({ results: 0 }));
    expect(screen.getByTestId("segment-preview-values").textContent).not.toContain("Cost / result");
  });

  it("renders the honest note line when the row carries one", () => {
    renderPreview(row({ note: "Not available for this tracking basis." }));
    expect(screen.getByTestId("segment-preview-note").textContent).toMatch(/tracking basis/);
  });

  it("shows the deep-dive footer cue only when the row is drillable", () => {
    renderPreview(row({}), true);
    expect(screen.getByTestId("segment-preview-cue").textContent).toMatch(/deep dive/i);
    cleanup();
    renderPreview(row({}), false);
    expect(screen.queryByTestId("segment-preview-cue")).toBeNull();
  });
});
