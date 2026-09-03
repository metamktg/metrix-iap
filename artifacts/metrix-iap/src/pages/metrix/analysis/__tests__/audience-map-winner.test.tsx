// ─── Audience view regression tests ────────────────────────────────────
// AudienceView has three real "segment by" grains (Cluster / Age / Ranked)
// over the same demographic pocket signal — see audience-clusters.ts for
// the clustering unit tests. This file covers the page-level behavior:
//   - the Prime tile (Ranked mode) tracks the active rank metric, and is
//     suppressed when every segment lacks that metric's data
//   - switching segment-by mode actually swaps the rendered card set
//   - the zero-segment account renders the honest empty state, never a
//     fabricated cluster set

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  useMetrixSeed: vi.fn(() => seed),
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useMetrixSeed } from "@/contexts/MetrixDataContext";

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
import { buildAudienceClusters } from "@/lib/audience-clusters";

const SESSION_KEY = "metrix_active_account_v1";
const SEGMENT_BY_KEY = "metrix.audience.segmentBy.v2";
const RANK_KEY = "metrix.audience.rank.v1";

// ── Expected leaders, derived through the real analytics pipeline ─────

type Entry = {
  seg: { age: string; gender: string };
  totals: ReturnType<typeof computeSegmentTotals>;
  derived: ReturnType<typeof deriveSegmentMetrics>;
};

function buildEntries(accountId: string): Entry[] {
  const acct = seed.ad_accounts.find((a: { id: string }) => a.id === accountId);
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
  return segmentLabel(sortByRankMetric(buildEntries("bookster"), METRICS[metricId])[0].seg as never);
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

/** Switch the active rank metric from the Ranked tab's RankSortBar. */
function switchMetricViaRanked(metricId: string) {
  fireEvent.click(screen.getByRole("button", { name: /Ranked/i }));
  fireEvent.click(screen.getByRole("button", { name: /Sort by/i }));
  fireEvent.click(screen.getByTestId(`rank-metric-${metricId}`));
}

// ── Synthetic seed with all-null CPA ─────────────────────────────────

function buildNullCpaSeed() {
  const copy = JSON.parse(JSON.stringify(seed));
  for (const acct of copy.ad_accounts) {
    const rows: Array<Record<string, unknown>> =
      acct?.iap?.analysis?.demographic_registration_signal ?? [];
    for (const row of rows) {
      row["Results"] = 0;
      row["CPA_result"] = null;
    }
  }
  return copy;
}

function setupNullCpaSeed() {
  vi.mocked(useMetrixSeed).mockReturnValue(buildNullCpaSeed());
}

function restoreRealSeed() {
  vi.mocked(useMetrixSeed).mockReturnValue(seed);
}

function resetStorage() {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

beforeEach(() => {
  resetStorage();
  restoreRealSeed();
});

// ── Prime tile follows the active rank metric (Ranked mode) ───────────

describe("Prime tile tracks the active rank metric", () => {
  beforeEach(() => {
    localStorage.setItem(SEGMENT_BY_KEY, "ranked");
    localStorage.setItem(RANK_KEY, "results");
  });

  it("fixture produces distinct leaders across the three metrics (test precondition)", () => {
    const leaders = new Set(
      (["results", "cpa", "spend"] as const).map(expectedLeaderLabel)
    );
    expect(leaders.size).toBeGreaterThan(1);
  });

  it("shows the Results leader initially", () => {
    renderAudience();
    const prime = screen.getByText(/Prime · Registrations/i).closest("div")!.parentElement!;
    expect(within(prime as HTMLElement).getByText(expectedLeaderLabel("results"))).toBeTruthy();
  });

  it("moves to the CPA leader when the metric switches Results → CPA", () => {
    renderAudience();
    switchMetricViaRanked("cpa");
    const prime = screen.getByText(/Prime · CPA/i).closest("div")!.parentElement!;
    expect(within(prime as HTMLElement).getByText(expectedLeaderLabel("cpa"))).toBeTruthy();
  });

  it("moves again on a second switch, CPA → Spend", () => {
    renderAudience();
    switchMetricViaRanked("cpa");
    switchMetricViaRanked("spend");
    const prime = screen.getByText(/Prime · Spend/i).closest("div")!.parentElement!;
    expect(within(prime as HTMLElement).getByText(expectedLeaderLabel("spend"))).toBeTruthy();
  });
});

describe("Prime tile suppressed when every segment lacks the active metric", () => {
  beforeEach(() => {
    localStorage.setItem(SEGMENT_BY_KEY, "ranked");
    localStorage.setItem(RANK_KEY, "cpa");
    setupNullCpaSeed();
  });

  afterEach(() => {
    restoreRealSeed();
  });

  it("Prime tile shows ', ' when all segments have null CPA", () => {
    renderAudience();
    const primeTileLabel = screen.getByText(/Prime · CPA/i);
    const tileRoot = primeTileLabel.closest("div")!.parentElement!;
    expect(within(tileRoot as HTMLElement).getByText("–")).toBeTruthy();
  });

  it("Prime tile resolves again once at least one segment has CPA data", () => {
    restoreRealSeed();
    renderAudience();
    const prime = screen.getByText(/Prime · CPA/i).closest("div")!.parentElement!;
    expect(within(prime as HTMLElement).getByText(expectedLeaderLabel("cpa"))).toBeTruthy();
  });
});

// ── Segment-by mode switches the rendered card set ─────────────────────

describe("Segment-by mode", () => {
  it("defaults to Cluster mode: shows the Positioning map and Share of spend cards", () => {
    renderAudience();
    expect(screen.getByText("Positioning map")).toBeTruthy();
    expect(screen.getByText("Share of spend vs. share of result")).toBeTruthy();
    expect(screen.getByText("Cluster detail")).toBeTruthy();
  });

  it("real cluster count for Bookster is between 1 and 6, never a fabricated fixed count", () => {
    const entries = buildEntries("bookster");
    const clusters = buildAudienceClusters(entries);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.length).toBeLessThanOrEqual(6);
  });

  it("switches to Age mode: still real positioning/share cards, relabeled detail card", () => {
    renderAudience();
    fireEvent.click(screen.getByRole("button", { name: /^Age$/i }));
    expect(screen.getByText("Positioning map")).toBeTruthy();
    expect(screen.getByText("Age detail")).toBeTruthy();
  });

  it("switches to Ranked mode: shows the full per-segment list with Explore rows", () => {
    renderAudience();
    fireEvent.click(screen.getByRole("button", { name: /Ranked/i }));
    expect(screen.getByText("Segment performance")).toBeTruthy();
    expect(screen.queryByText("Positioning map")).toBeFalsy();
  });

  it("never offers a Placement segment-by option (not real data)", () => {
    renderAudience();
    expect(screen.queryByRole("button", { name: /Placement/i })).toBeFalsy();
  });
});

// ── Zero-segment account: honest empty state, never fabricated clusters ─

describe("Zero-segment account", () => {
  it("renders the honest empty state instead of any cluster UI", () => {
    resetStorage();
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ type: "ad_account", adAccountId: "manual_BwsYjC5ZRk0i" })
    );
    renderAudience();
    expect(screen.getByText("No demographic signal")).toBeTruthy();
    expect(screen.queryByText("Positioning map")).toBeFalsy();
    expect(screen.queryByText("Cluster detail")).toBeFalsy();
  });
});
