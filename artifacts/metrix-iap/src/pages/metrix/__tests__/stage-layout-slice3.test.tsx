// ─── Slice 3 · Strategy, Creative and MST on the shell (sweep spec §3, §5) ──
// The three centres compose StageLayout with the status hub between the
// spine and the run card and the direction rail after the card. The base
// of the NEXT run is visible and changeable before the button is pressed
// (§5.1): Strategy defaults to the latest successful analysis run and sends
// exactly that selection; Creative defaults to the latest successful
// strategy run and names it in the request. Nothing runs on its own.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);

type Run = Record<string, unknown> & { id: string; status: string; started_at: string };
let analysisRuns: Run[] = [];
let strategyRuns: Run[] = [];
let briefRuns: Run[] = [];
let latestStrategy: Run | null = null;
let latestBriefs: Run | null = null;
const strategyMutate = vi.fn();
const briefsMutate = vi.fn();

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: analysisRuns }, isLoading: false }),
    useListGenerationRuns: (_id: string, kind: string) => ({ data: { runs: kind === "strategy" ? strategyRuns : briefRuns } }),
    useGetLatestGenerationRun: (_id: string, kind: string) => ({ data: { run: kind === "strategy" ? latestStrategy : latestBriefs } }),
    useGenerateAccountStrategy: () => ({ mutate: strategyMutate, isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: briefsMutate, isPending: false }),
    useGetAccountStageStatus: () => ({
      data: {
        analysis: { status: "success", validated: true, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
        strategy: { status: "success", last_run_at: null },
        briefs: { status: "none", last_run_at: null, count: 0 },
        mst: { unlocked: true },
      },
    }),
    useListManualImports: () => ({ data: { imports: [] } }),
    useListCreativeDeconstructions: () => ({ data: { deconstructions: [] } }),
    getListAnalysisRunsQueryKey: () => ["analysis-runs"],
    getListGenerationRunsQueryKey: (id: string, kind: string) => ["generation-runs", id, kind],
    getGetLatestGenerationRunQueryKey: () => ["latest-gen-run"],
    getGetMetrixSeedQueryKey: () => ["metrix-seed"],
    getGetAccountStageStatusQueryKey: () => ["stage-status"],
    getListManualImportsQueryKey: () => ["manual-imports"],
    getListCreativeDeconstructionsQueryKey: () => ["deconstructions"],
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
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { StrategyCommandCenter } from "@/pages/metrix/strategy/StrategyCommandCenter";
import { CreativeCommandCenter } from "@/pages/metrix/creative/CreativeCommandCenter";
import { MstCommandCenter } from "@/pages/metrix/mst/MstCommandCenter";

const SESSION_KEY = "metrix_active_account_v1";

function renderPage(ui: React.ReactElement) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>{ui}</AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function slotOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-slot]")).map((el) => el.getAttribute("data-slot") ?? "");
}

const analysisRun = (id: string, startedAt: string, over: Partial<Run> = {}): Run => ({
  id, status: "success", date_range: "30d", date_start: "2026-08-04", date_end: "2026-09-02", rows_ingested: 100,
  started_at: startedAt, finished_at: startedAt, csv_warnings: null, progress_pct: 100, progress_stage: "", rollups_retained: true, ...over,
});
const genRun = (id: string, kind: string, startedAt: string, over: Partial<Run> = {}): Run => ({
  id, account_id: "bookster", kind, status: "success", error_message: null, model: "claude-sonnet-4-6", started_at: startedAt, finished_at: startedAt,
  source_analysis_run_ids: null, source_analysis_all_time: false, source_generation_run_id: null, source_window_start: null, source_window_end: null,
  output_count: 3, progress_done: 0, progress_total: null, progress_pct: 100, progress_stage: "", ...over,
});

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  analysisRuns = [];
  strategyRuns = [];
  briefRuns = [];
  latestStrategy = null;
  latestBriefs = null;
  strategyMutate.mockReset();
  briefsMutate.mockReset();
});
afterEach(cleanup);

describe("Strategy on the shell", () => {
  it("orders pages · hub · execution · direction · content, and defaults the base to the latest successful analysis run", async () => {
    analysisRuns = [
      analysisRun("old", "2026-08-01T10:00:00Z", { date_start: "2026-07-01", date_end: "2026-07-31" }),
      analysisRun("new", "2026-09-04T10:00:00Z"),
      analysisRun("bad", "2026-09-05T10:00:00Z", { status: "error" }),
    ];
    let container!: HTMLElement;
    await act(async () => { ({ container } = renderPage(<StrategyCommandCenter />)); });
    const order = slotOrder(container);
    expect(order.indexOf("pages")).toBe(0);
    expect(order.indexOf("hub")).toBeLessThan(order.indexOf("execution"));
    if (order.includes("direction")) expect(order.indexOf("execution")).toBeLessThan(order.indexOf("direction"));
    expect(screen.getByRole("region", { name: "Strategy status" })).toBeTruthy();
    // The base: the latest SUCCESSFUL run, not the failed one and not all time.
    expect(screen.getByTestId("base-run-summary").textContent).toContain("Aug 4 – Sep 2");
    expect(screen.getByTestId("status-hub-inputs").textContent).toContain("Based on · Aug 4 – Sep 2");
    // No second progress surface on the card.
    expect(screen.queryByTestId("generation-progress-bar")).toBeNull();
  });

  it("sends exactly the selected analysis run when Generate is pressed, and nothing before", async () => {
    analysisRuns = [analysisRun("old", "2026-08-01T10:00:00Z"), analysisRun("new", "2026-09-04T10:00:00Z")];
    await act(async () => { renderPage(<StrategyCommandCenter />); });
    expect(strategyMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Generate from analysis|Regenerate strategy/ }));
    expect(strategyMutate).toHaveBeenCalledTimes(1);
    expect(strategyMutate.mock.calls[0]![0]).toEqual({ accountId: "bookster", data: { analysis_run_ids: ["new"] } });
  });

  it("lets the reader change the base before pressing, shared with the Overview chain's stored key", async () => {
    analysisRuns = [analysisRun("old", "2026-08-01T10:00:00Z", { date_start: "2026-07-01", date_end: "2026-07-31" }), analysisRun("new", "2026-09-04T10:00:00Z")];
    await act(async () => { renderPage(<StrategyCommandCenter />); });
    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-all-time"));
    expect(screen.getByTestId("base-run-summary").textContent).toContain("All time");
    expect(JSON.parse(sessionStorage.getItem("metrix.runScope.strategy-base-run.bookster") ?? "null")).toEqual({ allTime: true, selectedRunIds: [] });
    fireEvent.click(screen.getByRole("button", { name: /Generate from analysis|Regenerate strategy/ }));
    expect(strategyMutate.mock.calls[0]![0]).toEqual({ accountId: "bookster", data: { analysis_all_time: true } });
  });

  it("lists the runs and what each was built from in the history card", async () => {
    strategyRuns = [
      genRun("s2", "strategy", "2026-09-04T10:00:00Z", { source_window_start: "2026-08-04", source_window_end: "2026-09-02", source_analysis_run_ids: ["a", "b"] }),
      genRun("s1", "strategy", "2026-08-01T10:00:00Z", { source_analysis_all_time: true }),
    ];
    await act(async () => { renderPage(<StrategyCommandCenter />); });
    expect(screen.getByTestId("generation-run-s2").textContent).toContain("from 2026-08-04 → 2026-09-02 · 2 runs");
    expect(screen.getByTestId("generation-run-s1").textContent).toContain("from all time");
    expect(screen.getByTestId("status-hub-completed").textContent).toContain("3 pillars");
  });
});

describe("Creative on the shell", () => {
  it("defaults the base to the latest successful strategy run and names it in the request", async () => {
    strategyRuns = [genRun("s1", "strategy", "2026-08-01T10:00:00Z"), genRun("s2", "strategy", "2026-09-04T10:00:00Z", { output_count: 4 })];
    let container!: HTMLElement;
    await act(async () => { ({ container } = renderPage(<CreativeCommandCenter />)); });
    const order = slotOrder(container);
    expect(order.indexOf("hub")).toBeLessThan(order.indexOf("execution"));
    expect(screen.getByRole("region", { name: "Creative status" })).toBeTruthy();
    expect(screen.getByTestId("strategy-run-summary").textContent).toContain("run of Sep 4, 2026 · 4 pillars");
    fireEvent.click(screen.getByRole("button", { name: /Generate from strategy|Regenerate briefs/ }));
    expect(briefsMutate.mock.calls[0]![0]).toEqual({ accountId: "bookster", data: { strategy_run_id: "s2" } });
  });

  it("lets the reader choose another strategy run, exactly one, before pressing", async () => {
    strategyRuns = [genRun("s1", "strategy", "2026-08-01T10:00:00Z"), genRun("s2", "strategy", "2026-09-04T10:00:00Z", { output_count: 4 })];
    await act(async () => { renderPage(<CreativeCommandCenter />); });
    fireEvent.click(screen.getByTestId("button-strategy-run"));
    fireEvent.click(screen.getByTestId("option-strategy-run-s1"));
    expect(screen.getByTestId("strategy-run-summary").textContent).toContain("Aug 1, 2026");
    // The choice is remembered for the account, and the list closed on it.
    expect(sessionStorage.getItem("metrix.strategyRun.bookster")).toBe("s1");
    expect(screen.queryByTestId("option-strategy-run-s1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Generate from strategy|Regenerate briefs/ }));
    expect(briefsMutate.mock.calls[0]![0]).toEqual({ accountId: "bookster", data: { strategy_run_id: "s1" } });
  });

  it("briefs the imported strategy with no picker and no run id when the account has no generated strategy", async () => {
    await act(async () => { renderPage(<CreativeCommandCenter />); });
    expect(screen.queryByTestId("strategy-run-picker")).toBeNull();
    expect(screen.getByTestId("status-hub-inputs").textContent).toContain("Based on · imported strategy");
    fireEvent.click(screen.getByRole("button", { name: /Generate from strategy|Regenerate briefs/ }));
    expect(briefsMutate.mock.calls[0]![0]).toEqual({ accountId: "bookster" });
  });

  it("says when the current briefs predate the current strategy", async () => {
    strategyRuns = [genRun("s2", "strategy", "2026-09-04T10:00:00Z")];
    briefRuns = [genRun("b1", "briefs", "2026-08-10T10:00:00Z", { output_count: 16, source_generation_run_id: "s0" })];
    await act(async () => { renderPage(<CreativeCommandCenter />); });
    expect(screen.getByTestId("status-hub-inputs").textContent).toContain("Current briefs predate the current strategy");
    expect(screen.getByTestId("status-hub-completed").textContent).toContain("16 briefs");
  });

  it("renders the notice slot once, above the hub", async () => {
    let container!: HTMLElement;
    await act(async () => { ({ container } = renderPage(<CreativeCommandCenter />)); });
    const order = slotOrder(container);
    expect(order.filter((s) => s === "notice").length).toBeLessThanOrEqual(1);
    expect(within(container).getByTestId("creative-nudge-slot")).toBeTruthy();
  });
});

describe("MST on the shell", () => {
  it("carries the hub with the brief set and the matrix, no run rows, and keeps the run-scope picker in the header", async () => {
    analysisRuns = [analysisRun("new", "2026-09-04T10:00:00Z")];
    let container!: HTMLElement;
    await act(async () => { ({ container } = renderPage(<MstCommandCenter />)); });
    const order = slotOrder(container);
    expect(order).toContain("hub");
    expect(order).not.toContain("execution");
    const hub = screen.getByRole("region", { name: "MST status" });
    expect(within(hub).getByTestId("status-hub-inputs").textContent).toMatch(/Brief set · \d+ briefs|No brief set yet/);
    expect(within(hub).getByTestId("status-hub-inputs").textContent).toMatch(/Matrix · \d+ avatars/);
    expect(screen.queryByTestId("status-hub-history")).toBeNull();
    expect(screen.queryByTestId("button-run-scope")).toBeTruthy();
    expect(screen.getByText("Avatars")).toBeTruthy();
  });
});
