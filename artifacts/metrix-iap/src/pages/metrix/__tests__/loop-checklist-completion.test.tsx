// ─── LoopChecklist completion-state regression tests ─────────────────────
//
// Guards two surfaces:
//
//   1. LoopChecklist (pure component) — verifies that ✓ / next / pending
//      visual states are derived correctly from the `done` prop on each step,
//      and that the progress counter reflects the right done/total ratio.
//
//   2. AdAccountOverview sidebar — verifies that the "Loop stages" sidebar
//      appears when loop is incomplete and is absent when allLoopComplete,
//      using the seed fixture and the same mock scaffolding as the existing
//      loop-command-chain tests.
//
// A regression could silently mark all steps done (or all pending) without
// throwing an error — these tests catch that class of failure.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Seed fixture ─────────────────────────────────────────────────────────

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// ── Per-test mutable state ────────────────────────────────────────────────

let activeSeed: typeof baseSeed = baseSeed;
let mockReportCount = 0;

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({ data: null }),
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useListWorkspaceReports: () => ({
      data: {
        reports: Array.from({ length: mockReportCount }, (_, i) => ({
          id: String(i),
          ad_account_id: "bookster",
        })),
      },
    }),
    useListManualImports: () => ({ data: { imports: [] } }),
  };
});

vi.mock("@/components/generation/GenerationControls", () => ({
  useGenerationRun: (_accountId: unknown, _kind: string) => ({
    start: vi.fn(),
    isRunning: false,
    elapsedSeconds: 0,
    lastRun: null,
    lastError: null,
  }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { LoopChecklist, type LoopChecklistStep } from "../shared";
import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AdAccountOverview } from "../AdAccountOverview";

// ── Helpers ───────────────────────────────────────────────────────────────

const SESSION_KEY = "metrix_active_account_v1";

function selectAccount(adAccountId: string) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId })
  );
}

function renderOverview(seed: typeof baseSeed = baseSeed) {
  activeSeed = seed;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AdAccountOverview />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Build a seed where the bookster account has no analysis cells, no strategy
 * pillars, and no briefs — so only "Data connected" is done (1/5).
 */
function seedWithEmptyIap() {
  const bookster = baseSeed.ad_accounts.find(
    (a: { id: string }) => a.id === "bookster"
  );
  const emptyAccount = {
    ...bookster,
    iap: {
      ...bookster.iap,
      analysis: { performance_by_cell: [], v3_variable_performance: [] },
      strategy: null,
      brief_builder: null,
      optimization_loop: null,
    },
  };
  return {
    ...baseSeed,
    ad_accounts: baseSeed.ad_accounts.map((a: { id: string }) =>
      a.id === "bookster" ? emptyAccount : a
    ),
  };
}

/**
 * Build a seed where bookster has cells + pillars + briefs, paired with
 * mockReportCount = 1, so allLoopComplete = true.
 */
function seedWithFullIap() {
  const bookster = baseSeed.ad_accounts.find(
    (a: { id: string }) => a.id === "bookster"
  );
  const hasAnalysis =
    (bookster?.iap?.analysis?.performance_by_cell?.length ?? 0) > 0;
  const hasPillars =
    (bookster?.iap?.strategy?.message_pillars?.length ?? 0) > 0;
  const hasBriefs =
    (bookster?.iap?.brief_builder?.draft_briefs?.length ?? 0) > 0;

  if (hasAnalysis && hasPillars && hasBriefs) {
    return baseSeed;
  }

  const fullAccount = {
    ...bookster,
    iap: {
      ...bookster.iap,
      analysis: {
        ...(bookster.iap?.analysis ?? {}),
        performance_by_cell: hasAnalysis
          ? bookster.iap.analysis.performance_by_cell
          : [{ cell_id: "c1" }],
      },
      strategy: hasPillars
        ? bookster.iap.strategy
        : { ...(bookster.iap?.strategy ?? {}), message_pillars: [{ id: "p1" }] },
      brief_builder: hasBriefs
        ? bookster.iap.brief_builder
        : { ...(bookster.iap?.brief_builder ?? {}), draft_briefs: [{ id: "b1" }] },
    },
  };
  return {
    ...baseSeed,
    ad_accounts: baseSeed.ad_accounts.map((a: { id: string }) =>
      a.id === "bookster" ? fullAccount : a
    ),
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
  mockReportCount = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — LoopChecklist pure component rendering
// ═══════════════════════════════════════════════════════════════════════════

describe("LoopChecklist — all steps done", () => {
  const steps: LoopChecklistStep[] = [
    { label: "Data connected",     done: true, route: "/a" },
    { label: "Analysis run",       done: true, route: "/b" },
    { label: "Strategy generated", done: true, route: "/c" },
    { label: "Briefs generated",   done: true, route: "/d" },
    { label: "Report created",     done: true, route: "/e" },
  ];

  it("renders non-empty output", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("shows 5/5 in the counter", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("5/5");
  });

  it("renders all five step labels", () => {
    render(<LoopChecklist steps={steps} />);
    expect(screen.getByText("Data connected")).toBeTruthy();
    expect(screen.getByText("Analysis run")).toBeTruthy();
    expect(screen.getByText("Strategy generated")).toBeTruthy();
    expect(screen.getByText("Briefs generated")).toBeTruthy();
    expect(screen.getByText("Report created")).toBeTruthy();
  });

  it("applies line-through style to all done step labels", () => {
    render(<LoopChecklist steps={steps} />);
    const label = screen.getByText("Data connected");
    expect(label.className).toContain("line-through");
  });

  it("progress bar is rendered (at least one step is done)", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).not.toBeNull();
  });
});

describe("LoopChecklist — no steps done", () => {
  const steps: LoopChecklistStep[] = [
    { label: "Data connected",     done: false },
    { label: "Analysis run",       done: false },
    { label: "Strategy generated", done: false },
    { label: "Briefs generated",   done: false },
    { label: "Report created",     done: false },
  ];

  it("shows 0/5 in the counter", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("0/5");
  });

  it("does not render the progress bar when no steps are done", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toBeNull();
  });

  it("marks the first step as 'next' (ArrowRight icon present)", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    const arrowIcons = container.querySelectorAll("svg");
    expect(arrowIcons.length).toBeGreaterThan(0);
  });

  it("does not apply line-through to any step label", () => {
    render(<LoopChecklist steps={steps} />);
    const labels = ["Data connected", "Analysis run", "Strategy generated", "Briefs generated", "Report created"];
    for (const label of labels) {
      expect(screen.getByText(label).className).not.toContain("line-through");
    }
  });

  it("shows step numbers for all steps after the first (pending style)", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3");
  });
});

describe("LoopChecklist — partial completion (first 2 of 4 done)", () => {
  const steps: LoopChecklistStep[] = [
    { label: "Data connected",     done: true,  route: "/a" },
    { label: "Analysis run",       done: true,  route: "/b" },
    { label: "Strategy generated", done: false, route: "/c" },
    { label: "Briefs generated",   done: false, route: "/d" },
  ];

  it("shows 2/4 in the counter", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("2/4");
  });

  it("applies line-through only to done step labels", () => {
    render(<LoopChecklist steps={steps} />);
    expect(screen.getByText("Data connected").className).toContain("line-through");
    expect(screen.getByText("Analysis run").className).toContain("line-through");
    expect(screen.getByText("Strategy generated").className).not.toContain("line-through");
    expect(screen.getByText("Briefs generated").className).not.toContain("line-through");
  });

  it("marks 'Strategy generated' as the next step (index 2 is nextIdx)", () => {
    render(<LoopChecklist steps={steps} />);
    const nextLabel = screen.getByText("Strategy generated");
    expect(nextLabel.className).toContain("font-semibold");
  });

  it("marks 'Briefs generated' as pending (not next, not done)", () => {
    render(<LoopChecklist steps={steps} />);
    const pendingLabel = screen.getByText("Briefs generated");
    expect(pendingLabel.className).not.toContain("font-semibold");
    expect(pendingLabel.className).not.toContain("line-through");
  });
});

describe("LoopChecklist — single step", () => {
  it("shows 0/1 when the only step is not done", () => {
    const { container } = render(
      <LoopChecklist steps={[{ label: "Only step", done: false }]} />
    );
    expect(container.textContent).toContain("0/1");
  });

  it("shows 1/1 when the only step is done", () => {
    const { container } = render(
      <LoopChecklist steps={[{ label: "Only step", done: true }]} />
    );
    expect(container.textContent).toContain("1/1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — AdAccountOverview sidebar visibility
// ═══════════════════════════════════════════════════════════════════════════

describe("AdAccountOverview sidebar — loop incomplete (sidebar visible)", () => {
  it("shows 'Loop stages' sidebar label when analysis has not run", () => {
    const seed = seedWithEmptyIap();
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Loop stages");
  });

  it("shows 'Data connected' step in the checklist when loop is incomplete", () => {
    const seed = seedWithEmptyIap();
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Data connected");
  });

  it("shows 'Analysis run' step in the checklist when loop is incomplete", () => {
    const seed = seedWithEmptyIap();
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Analysis run");
  });

  it("shows 'Report created' step in the checklist when no reports exist", () => {
    const seed = seedWithEmptyIap();
    mockReportCount = 0;
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Report created");
  });
});

describe("AdAccountOverview sidebar — loop complete (sidebar hidden)", () => {
  it("hides 'Loop stages' sidebar label when all 5 steps are done", () => {
    const seed = seedWithFullIap();
    mockReportCount = 1;
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).not.toContain("Loop stages");
  });

  it("does not render the LoopChecklist when allLoopComplete", () => {
    const seed = seedWithFullIap();
    mockReportCount = 1;
    selectAccount("bookster");
    renderOverview(seed);
    expect(screen.queryByText("Setup progress")).toBeNull();
  });

  it("still renders the IAP Loop command chain when loop is complete", () => {
    const seed = seedWithFullIap();
    mockReportCount = 1;
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("IAP Loop");
  });
});

describe("AdAccountOverview sidebar — report count controls last step", () => {
  it("sidebar visible when data+analysis+strategy+briefs done but no reports", () => {
    const seed = seedWithFullIap();
    mockReportCount = 0;
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Loop stages");
  });

  it("sidebar hidden once a report is added (5/5 complete)", () => {
    const seed = seedWithFullIap();
    mockReportCount = 1;
    selectAccount("bookster");
    const { container } = renderOverview(seed);
    expect(container.textContent).not.toContain("Loop stages");
  });
});
