// ─── Intelligence Map winner-highlight regression test ────────────────
// The top-ranked bubble on the Audience Intelligence Map is driven by
// ranked[0] (AudienceView → topSeg prop → IntelligenceMapTab → BubbleShape
// isTop). When the user switches the active rank metric, the highlight must
// move to the new leader. A regression that stops the ranked array update
// from propagating to topSeg would leave the wrong bubble emphasized.
//
// Covers the two metric switches the task calls out:
//   Results → CPA, then CPA → Spend.
// Expected leaders are computed from the same seed fixture through the real
// segment-analytics + sortByRankMetric pipeline, so the assertions track the
// production ranking math instead of hard-coded segment names.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// jsdom has no layout, so ResponsiveContainer measures 0×0 and recharts
// renders nothing. Give the chart a fixed size so bubbles actually mount.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(
        children as React.ReactElement<{ width?: number; height?: number }>,
        { width: 800, height: 460 }
      ),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AudienceView } from "../AudienceView";
import { sortByRankMetric, type RankMetric } from "../rankSort";
import {
  scopeDemographicRows,
  listSegments, rowsForSegment,
  computeSegmentTotals, deriveSegmentMetrics,
  segmentLabel,
} from "@/lib/segment-analytics";

const SESSION_KEY = "metrix_active_account_v1";
const VIEW_KEY = "metrix.audience.view.v1";
const RANK_KEY = "metrix.audience.rank.v1";

// ── Expected leaders, derived through the real analytics pipeline ─────

type Entry = {
  seg: { age: string; gender: string };
  totals: ReturnType<typeof computeSegmentTotals>;
  derived: ReturnType<typeof deriveSegmentMetrics>;
};

function buildEntries(): Entry[] {
  const acct = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
  const rows = scopeDemographicRows(
    acct.iap.analysis.demographic_registration_signal,
    null
  );
  return listSegments(rows).map((seg) => {
    const totals = computeSegmentTotals(rowsForSegment(rows, seg));
    return { seg, totals, derived: deriveSegmentMetrics(totals) };
  });
}

// Mirrors the corresponding entries of buildRankMetrics in AudienceView.
const METRICS: Record<string, RankMetric<Entry>> = {
  results: { id: "results", label: "Results", direction: "desc", value: (e) => e.totals.results, format: String },
  cpa:     { id: "cpa",     label: "CPA",     direction: "asc",  value: (e) => e.derived.cpa,    format: String },
  spend:   { id: "spend",   label: "Spend",   direction: "desc", value: (e) => e.totals.spend,   format: String },
};

function expectedLeaderLabel(metricId: keyof typeof METRICS): string {
  return segmentLabel(sortByRankMetric(buildEntries(), METRICS[metricId])[0].seg as never);
}

// ── DOM helpers ───────────────────────────────────────────────────────

/** The highlighted (isTop) bubble draws its main circle with strokeWidth 2
 *  and fillOpacity 0.9; every other bubble uses 1.5 / 0.7. */
function highlightedBubbleLabels(container: HTMLElement): string[] {
  // recharts wraps each symbol in its own role="img" layer; the bubble
  // itself is the inner g that carries the aria-label.
  const bubbles = Array.from(
    container.querySelectorAll('g[role="img"][aria-label]')
  );
  return bubbles
    .filter((g) =>
      Array.from(g.querySelectorAll("circle")).some(
        (c) => c.getAttribute("stroke-width") === "2"
      )
    )
    .map((g) => g.getAttribute("aria-label") ?? "");
}

function renderAudience() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AudienceView />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Open the RankSortBar popover (Pocket Grid tab) and pick a metric, then
 *  return to the Intelligence Map — the same path a user takes, since the
 *  sort control lives on the grid/ranked tabs while the highlight lives on
 *  the map. */
function switchMetricViaGrid(metricId: string) {
  fireEvent.click(screen.getByRole("button", { name: /Pocket Grid/i }));
  fireEvent.click(screen.getByRole("button", { name: /Sort by/i }));
  fireEvent.click(screen.getByTestId(`rank-metric-${metricId}`));
  fireEvent.click(screen.getByRole("button", { name: /Intelligence Map/i }));
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
  localStorage.setItem(VIEW_KEY, "map");
  localStorage.setItem(RANK_KEY, "results");
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("Intelligence Map winner highlight follows the active rank metric", () => {
  it("fixture produces distinct leaders across the three metrics (test precondition)", () => {
    const leaders = new Set(
      (["results", "cpa", "spend"] as const).map(expectedLeaderLabel)
    );
    // If leaders coincide, the switch assertions below could pass vacuously.
    expect(leaders.size).toBeGreaterThan(1);
    expect(expectedLeaderLabel("results")).not.toBe(expectedLeaderLabel("cpa"));
    expect(expectedLeaderLabel("cpa")).not.toBe(expectedLeaderLabel("spend"));
  });

  it("highlights the Results leader initially, exactly once", () => {
    const { container } = renderAudience();
    const labels = highlightedBubbleLabels(container);
    expect(labels).toEqual([expectedLeaderLabel("results")]);
  });

  it("moves the highlight to the CPA leader when the metric switches Results → CPA", () => {
    const { container } = renderAudience();
    switchMetricViaGrid("cpa");
    const labels = highlightedBubbleLabels(container);
    expect(labels).toEqual([expectedLeaderLabel("cpa")]);
    expect(labels[0]).not.toBe(expectedLeaderLabel("results"));
  });

  it("moves the highlight again on a second switch, CPA → Spend", () => {
    const { container } = renderAudience();
    switchMetricViaGrid("cpa");
    expect(highlightedBubbleLabels(container)).toEqual([expectedLeaderLabel("cpa")]);
    switchMetricViaGrid("spend");
    const labels = highlightedBubbleLabels(container);
    expect(labels).toEqual([expectedLeaderLabel("spend")]);
    expect(labels[0]).not.toBe(expectedLeaderLabel("cpa"));
  });

  it("keeps the Prime tile in sync with the highlighted bubble", () => {
    renderAudience();
    switchMetricViaGrid("spend");
    const prime = screen.getByText(/Prime · Spend/i).closest("div")!.parentElement!;
    expect(within(prime as HTMLElement).getByText(expectedLeaderLabel("spend"))).toBeTruthy();
  });
});
