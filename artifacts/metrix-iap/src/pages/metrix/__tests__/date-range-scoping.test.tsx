// ─── Date-range / run-scoping regression tests ────────────────────────
// Analysis-derived modules (IAP Library, Concept Map, Crossmap, MST views)
// must NEVER be filtered by the global live-performance date range — that
// filter exists for raw performance data (Analysis Overview, Ad
// Performance, Budget, Placements, Audience) only. Analysis-derived
// content is scoped by analysis run selection instead (RunSelector),
// which defaults to "All time" and is asserted separately at the
// run-scope.ts unit level. These tests assert the negative: changing the
// global date range must leave analysis-derived content identical.
// Uses the real seed bundle fixture so assertions track production data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { IapLibraryView } from "../analysis/IapLibraryView";
import { AnalysisOverview } from "../analysis/AnalysisOverview";
import { ConceptMapView } from "../mst/ConceptMapView";
import { CrossmapResultsView } from "../mst/CrossmapResultsView";
import { MatrixBuilderView } from "../mst/MatrixBuilderView";
import { CreativeScanView } from "../mst/CreativeScanView";

const ACCOUNT_KEY = "metrix_active_account_v1";
const RANGE_KEY = "metrix_date_range_v1";

// A range strictly after every concept's flight window in the fixture —
// under the old (removed) date-scoping behavior this used to exclude
// every concept cell. It must now have no effect at all.
const POST_DATA_RANGE = { start: "2026-08-01", end: "2026-08-07" };
const LATE_RANGE = POST_DATA_RANGE;

function selectBookster() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
}

function setRange(state: null | { customStart: string; customEnd: string }) {
  if (!state) {
    sessionStorage.removeItem(RANGE_KEY);
    return;
  }
  sessionStorage.setItem(
    RANGE_KEY,
    JSON.stringify({
      "acct:bookster": {
        preset: "custom",
        customStart: state.customStart,
        customEnd: state.customEnd,
        compare: false,
      },
    })
  );
}

function renderView(View: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <DateRangeProvider>
          <AnalysisViewProvider>
            <View />
          </AnalysisViewProvider>
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Analysis Overview always shows all-time data", () => {
  // Analysis views show results from a specific analysis run (CSV import →
  // "Run Analysis"). The run's data is already aggregated over a flight
  // window — no daily grain exists so date range filtering makes no sense.
  // The topbar date picker does not appear on analysis views; tiles always
  // show the full-window totals regardless of any date range state.

  const spendOf = (text: string | null) => {
    const m = /Total spend\$([\d,]+)/.exec(text ?? "");
    return m ? Number(m[1].replaceAll(",", "")) : null;
  };

  it("always shows Total spend regardless of the selected date range", () => {
    selectBookster();
    setRange(null);
    const all = renderView(AnalysisOverview);
    const allText = all.container.textContent ?? "";
    expect(allText).toContain("Total spend");
    expect(allText).not.toContain("Spend (in range)");
    const allSpend = spendOf(allText);
    expect(allSpend).not.toBeNull();
    cleanup();

    selectBookster();
    setRange({ customStart: LATE_RANGE.start, customEnd: LATE_RANGE.end });
    const narrowed = renderView(AnalysisOverview);
    const narrowedText = narrowed.container.textContent ?? "";
    // Date range must not affect analysis views — always full-window data
    expect(narrowedText).not.toContain("Spend (in range)");
    expect(narrowedText).toContain("Total spend");
    const narrowedSpend = spendOf(narrowedText);
    expect(narrowedSpend).not.toBeNull();
    // Spend is identical because date range has no effect here
    expect(narrowedSpend).toBe(allSpend);
  });
});

// The remaining views are analysis-derived (creative cells, concepts, MST
// matrix) and must show identical content regardless of the global date
// range — that filter is reserved for live-performance surfaces. Each
// view defaults its RunSelector to "All time," which is the only scope
// state these tests exercise; run-scope.ts's unit tests cover the actual
// narrowing behavior when a specific run is selected.
const RANGE_INDEPENDENT_VIEWS: [string, React.ComponentType][] = [
  ["IAP Library", IapLibraryView],
  ["Concept Map", ConceptMapView],
  ["Crossmap Results", CrossmapResultsView],
  ["Matrix Builder", MatrixBuilderView],
  ["Creative Scan", CreativeScanView],
];

describe("analysis-derived views ignore the global date range", () => {
  for (const [name, View] of RANGE_INDEPENDENT_VIEWS) {
    it(`${name} renders identical content for 'all' and a post-data-window range`, () => {
      selectBookster();
      setRange(null);
      const all = renderView(View);
      const allText = all.container.textContent ?? "";
      cleanup();

      selectBookster();
      setRange({ customStart: POST_DATA_RANGE.start, customEnd: POST_DATA_RANGE.end });
      const narrowed = renderView(View);
      const narrowedText = narrowed.container.textContent ?? "";

      // A date range entirely after every flight window used to exclude
      // everything under the old date-scoping logic — it must now be a
      // complete no-op for analysis-derived content.
      expect(narrowedText).toBe(allText);
    });
  }
});
