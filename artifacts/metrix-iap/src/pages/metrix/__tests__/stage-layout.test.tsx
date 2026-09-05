// ─── StageLayout · the Execution Layer shell (sweep spec §3) ───────────
// The slot order is the contract: header · spine · notice · status hub ·
// execution · direction · content · explore. One notice per page. The
// Analysis command centre renders through it with its hub between the
// spine and the run card and its rail after the run card.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);

type MockRun = Record<string, unknown> & { id: string; status: string; started_at: string };
let mockRuns: MockRun[] = [];
let mockImports: { id: string; filename: string; kind: string; status: string; created_at?: string }[] = [];
let navigateSpy: ReturnType<typeof vi.fn>;

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => ["/app/analysis", navigateSpy] };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: mockRuns } }),
    useListManualImports: () => ({ data: { imports: mockImports } }),
    useGetAccountStageStatus: () => ({ data: null }),
    getListAnalysisRunsQueryKey: () => ["analysis-runs"],
    getListManualImportsQueryKey: () => ["manual-imports"],
    getGetAccountStageStatusQueryKey: () => ["stage-status"],
    ApiError: class ApiError extends Error {},
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => baseSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisCommandCenter } from "@/pages/metrix/analysis/AnalysisCommandCenter";
import { StageLayout } from "@/pages/metrix/StageLayout";

const SESSION_KEY = "metrix_active_account_v1";
const status = {
  analysis: { status: "success" as const, validated: true },
  strategy: { status: "none" as const },
  briefs: { status: "none" as const, count: 0 },
  mst: { unlocked: false },
};

function renderCC() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisCommandCenter />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function slotOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-slot]")).map((el) => el.getAttribute("data-slot") ?? "");
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  mockRuns = [];
  mockImports = [];
  navigateSpy = vi.fn();
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
});
afterEach(cleanup);

describe("StageLayout · slots", () => {
  it("renders the slots in the contract's order and skips the ones the page did not supply", () => {
    const { container } = render(
      <StageLayout stage="analysis" section="Analysis · 03" title="Analysis" status={status} hub={{ inputs: [{ label: "Nothing staged" }], inFlight: null, lastCompleted: null, failed: null, history: { to: "/x", count: 0 } }} execution={<div>run card</div>} explore={[]}>
        <div>content</div>
      </StageLayout>,
    );
    expect(slotOrder(container)).toEqual(["hub", "execution", "content"]);
    expect(screen.getByTestId("stage-layout").getAttribute("data-stage")).toBe("analysis");
    expect(screen.getByRole("region", { name: "Analysis status" })).toBeTruthy();
  });

  it("renders the stage's pages as a strip under the spine, each page's purpose and lineage behind an info tooltip", () => {
    const Icon = () => <svg aria-hidden />;
    const { container } = render(
      <StageLayout
        stage="analysis"
        section="Analysis · 03"
        title="Analysis"
        status={status}
        hub={{ inputs: [{ label: "Nothing staged" }], inFlight: null, lastCompleted: null, failed: null, history: { to: "/x", count: 0 } }}
        explore={[
          { to: "/app/analysis/performance", label: "Ad Performance", desc: "Campaign totals and the full breakdown.", Icon, lineage: "analysis.concept_rollup[]" },
          { to: "/app/analysis/library", label: "IAP Library", desc: "Cell and variable performance.", Icon },
        ]}
        exploreLabel="Analysis pages"
      />,
    );
    expect(slotOrder(container)).toEqual(["pages", "hub"]);
    const strip = screen.getByRole("navigation", { name: "Analysis pages" });
    expect(within(strip).getByRole("button", { name: "Ad Performance" })).toBeTruthy();
    expect(within(strip).getByRole("button", { name: "IAP Library" })).toBeTruthy();
    // The sentence and the lineage are not on the face.
    expect(within(strip).queryByText("Campaign totals and the full breakdown.")).toBeNull();
    expect(within(strip).queryByText("analysis.concept_rollup[]")).toBeNull();
    // One info control per page, named for its page (a row of identical
    // "More info" names tells a screen reader nothing), a sibling of the
    // page's button, never inside it.
    const infos = within(strip).getAllByRole("button", { name: /^About / });
    expect(infos.map((b) => b.getAttribute("aria-label"))).toEqual(["About Ad Performance", "About IAP Library"]);
    expect(infos[0]!.closest("button:not([aria-label^='About '])")).toBeNull();
    fireEvent.click(within(strip).getByRole("button", { name: "Ad Performance" }));
    expect(navigateSpy).toHaveBeenCalledWith("/app/analysis/performance");
  });

  it("renders at most one notice: the first offered", () => {
    const { container } = render(
      <StageLayout stage="creative" section="Creative · 05" title="Creative" status={status} notice={[null, <p key="a">first notice</p>, <p key="b">second notice</p>]} />,
    );
    expect(slotOrder(container)).toEqual(["notice"]);
    expect(screen.getByText("first notice")).toBeTruthy();
    expect(screen.queryByText("second notice")).toBeNull();
  });
});

describe("AnalysisCommandCenter on the shell", () => {
  it("puts the status hub between the spine and the run card, and the direction rail after the run card", () => {
    mockRuns = [{ id: "ok", status: "success", date_range: "30d", date_start: "2026-08-04", date_end: "2026-09-02", rows_ingested: 21130, started_at: "2026-09-04T10:16:13Z", finished_at: "2026-09-04T11:52:48Z", csv_warnings: null, progress_pct: 100, progress_stage: "" }];
    const { container } = renderCC();
    const order = slotOrder(container);
    expect(order.indexOf("pages")).toBe(0);
    expect(order.indexOf("hub")).toBeGreaterThan(order.indexOf("pages"));
    expect(order.indexOf("hub")).toBeLessThan(order.indexOf("execution"));
    if (order.includes("direction")) expect(order.indexOf("execution")).toBeLessThan(order.indexOf("direction"));
    expect(order.indexOf("execution")).toBeLessThan(order.indexOf("content"));
    // The spine precedes the hub in document order (the current stage's
    // node carries aria-current="step").
    const spine = container.querySelector('[aria-current="step"]') as HTMLElement;
    expect(spine).toBeTruthy();
    const hub = screen.getByTestId("status-hub");
    expect(spine.compareDocumentPosition(hub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const runCard = screen.getByTestId("analysis-run-card");
    expect(hub.compareDocumentPosition(runCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reads the last completed run into the hub and keeps the run card free of a second progress bar", () => {
    mockRuns = [{ id: "ok", status: "success", date_range: "30d", date_start: "2026-08-04", date_end: "2026-09-02", rows_ingested: 21130, started_at: "2026-09-04T10:16:13Z", finished_at: "2026-09-04T11:52:48Z", csv_warnings: ["[Truth] one"], progress_pct: 100, progress_stage: "" }];
    renderCC();
    expect(screen.getByTestId("status-hub-completed").textContent).toContain("2026-08-04 → 2026-09-02 · 21,130 rows");
    expect(screen.getByTestId("status-hub-warnings")).toBeTruthy();
    expect(screen.queryByTestId("analysis-run-progress")).toBeNull();
    expect(screen.queryByTestId("creative-next-step-nudge")).toBeNull();
  });

  it("shows the run in flight in the hub with the engine's stage", () => {
    mockRuns = [{ id: "live", status: "running", date_range: "30d", started_at: new Date(Date.now() - 65_000).toISOString(), finished_at: null, progress_pct: 50, progress_stage: "Building performance aggregates" }];
    renderCC();
    const row = screen.getByTestId("status-hub-in-flight");
    expect(row.textContent).toContain("Building performance aggregates");
    expect(row.textContent).toContain("elapsed");
  });

  it("lists the staged files by class in the hub's inputs row", () => {
    mockImports = [
      { id: "1", filename: "summary.csv", kind: "performance_ad_summary_csv", status: "staged" },
      { id: "2", filename: "demo.csv", kind: "performance_demo_csv", status: "staged" },
    ];
    renderCC();
    expect(screen.getByTestId("status-hub-inputs").textContent).toContain("2 files staged");
    expect(screen.getByTestId("status-hub-inputs").textContent).toContain("Ad Summary, Demographics");
  });
});
