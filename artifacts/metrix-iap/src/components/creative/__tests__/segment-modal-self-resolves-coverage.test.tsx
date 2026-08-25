// ─── The drill-down modal reads its own coverage (BUG-28) ──────────────
//
// Measured demographic join coverage gates segment signal classification:
// a "signal ✓" derived from 2% of an account's spend is fabricated
// confidence. Phase 1 threaded that coverage through by hand and reached
// 2 of the 5 SegmentDrilldownModal call sites — so the SAME modal
// suppressed the warning when opened from Audience and rendered an
// unqualified read when opened from Analysis Overview, the IAP Library,
// or a variable drill-down.
//
// The fix moved the read INTO the modal (useDemographicCoverage). These
// tests render it with NO demoCoverage prop — exactly how the three
// unfixed call sites render it — and assert the coverage warning still
// appears. The last test pins the deliberate escape hatch: an explicit
// prop still wins, because AudienceView passes a better-scoped summary.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import type { AnalysisData, DemographicRow } from "@/lib/data/seedTypes";

// The scoped account id the modal resolves coverage for.
vi.mock("@/contexts/AccountContext", () => ({
  useScopedAdAccountId: () => "acct-under-test",
  useAccount: () => ({ selectedAccountType: "ad_account", activeAdAccountId: "acct-under-test" }),
}));
// The real fixture: the modal reads the MST out of it for variable labels.
// The account id above is deliberately absent from it, so getMST falls back
// to the manager-level MST and the test's own demographic rows are the only
// segment material in play.
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
}));

// What the run-level analysis summary reports back. Mutated per test.
let SUMMARY: unknown = null;
vi.mock("@workspace/api-client-react", () => ({
  getGetAnalysisSummaryQueryOptions: (accountId: string, preset: string) => ({
    queryKey: ["analysis-summary", accountId, preset],
    queryFn: async () => SUMMARY,
  }),
}));

import { SegmentDrilldownModal } from "../SegmentDrilldownModal";

/**
 * A segment that is unambiguously "ok" on the per-segment heuristics
 * alone: plenty of impressions, and it carries 100% of scoped spend.
 * Any low-signal banner it renders therefore came from coverage, not
 * from the heuristics — which is exactly what these tests must prove.
 */
function healthyRow(overrides: Partial<DemographicRow> = {}): DemographicRow {
  return {
    cell_id: "C1A",
    "Ad name": "Ad One",
    Age: "25-34",
    Gender: "female",
    "Amount spent (USD)": 5000,
    Reach: 90_000,
    Impressions: 250_000,
    Results: 400,
    "Clicks (all)": 6000,
    "Link clicks": 5000,
    CPA_result: 12.5,
    CTR_link_pct: 2,
    Result_per_link_click_pct: 8,
    ...overrides,
  };
}

const analysis = {
  demographic_registration_signal: [healthyRow()],
  performance_by_cell: [],
  placement_performance: [],
} as unknown as AnalysisData;

const SEGMENT = { age: "25-34", gender: "female" } as never;

function open(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SegmentDrilldownModal
          open
          onClose={() => {}}
          segment={SEGMENT}
          analysis={analysis}
          cellIds={null}
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** react-query resolves the summary asynchronously; wait for the banner. */
const banner = () => screen.findByTestId("banner-low-signal");

beforeEach(() => {
  SUMMARY = null;
});
afterEach(() => cleanup());

describe("SegmentDrilldownModal — self-resolved demographic coverage", () => {
  it("warns about thin coverage even though no call site passed it in", async () => {
    SUMMARY = {
      data_coverage: {
        classes: [
          {
            report_class: "demographic",
            spend_coverage_pct: 2.4,
            below_threshold: true,
            note: "Only 3 of 128 ads appear in the demographic export.",
          },
        ],
      },
    };
    open(); // no demoCoverage prop — the three unfixed call sites' shape
    const el = await banner();
    expect(el.textContent).toContain("Demographic data covers only 2.4%");
    expect(el.textContent).toContain("Only 3 of 128 ads appear in the demographic export.");
  });

  it("stays quiet when the run's measured coverage is above threshold", async () => {
    SUMMARY = {
      data_coverage: {
        classes: [
          { report_class: "demographic", spend_coverage_pct: 97.1, below_threshold: false, note: null },
        ],
      },
    };
    open();
    // Let the query settle, then assert the banner never appeared: a
    // healthy segment over healthy coverage must read unqualified.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("banner-low-signal")).toBeNull();
  });

  it("falls back to the heuristics alone when the run never measured coverage", async () => {
    SUMMARY = { data_coverage: null }; // legacy run / importer account
    open();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("banner-low-signal")).toBeNull();
  });

  it("still lets a better-scoped explicit prop win (AudienceView's date-preset summary)", async () => {
    // The run-level summary says coverage is fine...
    SUMMARY = {
      data_coverage: {
        classes: [
          { report_class: "demographic", spend_coverage_pct: 99, below_threshold: false, note: null },
        ],
      },
    };
    // ...but the caller holds a window-scoped summary that says it isn't.
    open({
      demoCoverage: {
        spend_coverage_pct: 5,
        below_threshold: true,
        note: "This date window is barely covered.",
      },
    });
    const el = await banner();
    expect(el.textContent).toContain("Demographic data covers only 5%");
  });
});
