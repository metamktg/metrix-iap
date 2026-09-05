// ─── GenerationProgressBar — stage label threading end-to-end ─────────────
//
// Task 620: Confirms that StrategyCommandCenter correctly threads the
// `progressStage` value from `useGenerationRun` through to the rendered
// `GenerationProgressBar` label — covering both the server-label path
// (progress_pct > 0 → server string appears) and the fallback path
// (progress_pct = 0 → caller's fallback string appears).
//
// The real hook (useGenerationRun) and the real component (StrategyCommandCenter
// + GenerationProgressBar) are rendered. Only the underlying API hooks are
// mocked at module boundaries so tests are deterministic and fast.
//
// End-to-end data flow confirmed:
//   useGetLatestGenerationRun (mock) → useGenerationRun (real hook)
//     → StrategyCommandCenter (real component) → GenerationProgressBar (real)
//       → rendered label in the DOM

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Slice 3 (2026-09-05) ─────────────────────────────────────────────────
// The command centre moved onto the Execution Layer shell: a run in flight
// renders ONCE, in the status hub's Running row (sweep spec §4), and the
// execution card carries no second progress bar. The same threading is
// asserted there: the server's stage string reaches the row, the server's
// percent is the progressbar's value, and the fallback string appears only
// when the server has reported nothing.

// ── Seed fixture ──────────────────────────────────────────────────────────

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
//
// Controls what useGetLatestGenerationRun returns across each test.
// Reset to idle (no run) in beforeEach.

let mockGenRunData: {
  id: string;
  status: string;
  progress_pct: number | null;
  progress_stage: string | null;
  started_at: string;
  error_message: string | null;
} | null = null;

// ── Mocks ─────────────────────────────────────────────────────────────────
//
// All mocks declared before any import of the mocked module.

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // The hook that useGenerationRun polls for run status — return a running
    // run with configurable progress_pct / progress_stage to drive the test.
    useGetLatestGenerationRun: () => ({
      data: mockGenRunData ? { run: mockGenRunData } : null,
    }),
    // Strategy / briefs mutation hooks — idle so they don't interfere.
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs:   () => ({ mutate: vi.fn(), isPending: false }),
    // Stage-status hook — analysis validated so PrerequisiteGate opens and
    // the GenerationProgressBar section is actually rendered.
    useGetAccountStageStatus: () => ({
      data: {
        analysis: { status: "success", validated: true, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
        strategy: { status: "none", last_run_at: null },
        briefs:   { status: "none", last_run_at: null, count: 0 },
        mst:      { unlocked: false },
      },
    }),
    // List hooks used by shared components
    useListManualImports: () => ({ data: { imports: [] } }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    // Stable query keys
    getGetLatestGenerationRunQueryKey: () => ["latest-gen-run"],
    getGetMetrixSeedQueryKey:          () => ["metrix-seed"],
    getGetAccountStageStatusQueryKey:  () => ["stage-status"],
    ApiError: class ApiError extends Error {},
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed:         () => baseSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider:    ({ children }: { children: React.ReactNode }) => children,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider }    from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { StrategyCommandCenter } from "@/pages/metrix/strategy/StrategyCommandCenter";

// ── Helpers ───────────────────────────────────────────────────────────────

// Select the "bookster" configured account so ModuleScopeGate passes.
const SESSION_KEY = "metrix_active_account_v1";
function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function renderStrategy() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <StrategyCommandCenter />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// A run that is actively in-flight with real server-side progress.
function runningRun(overrides: {
  progress_pct?: number | null;
  progress_stage?: string | null;
}) {
  return {
    id: "run-1",
    status: "running",
    started_at: new Date(Date.now() - 5_000).toISOString(),
    error_message: null,
    progress_pct: overrides.progress_pct ?? 60,
    progress_stage: overrides.progress_stage ?? null,
  };
}

// The fallback stageLabel wired in StrategyCommandCenter when progressStage is null.
const FALLBACK = "Generating strategy from validated analysis…";

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  mockGenRunData = null;
  selectBookster();
});

afterEach(() => {
  cleanup();
});

// ── A. Server stage label (progress_pct > 0 → real progressStage) ─────────
//
// useGetLatestGenerationRun returns progress_pct=60 and a server stage string.
// The real useGenerationRun computes hasRealProgress=true → progressStage=serverStage.
// StrategyCommandCenter passes progressStage as stageLabel (no fallback needed).
// GenerationProgressBar renders the server string in the DOM.

describe("StrategyCommandCenter · GenerationProgressBar shows server stage label when progress_pct > 0", () => {
  it("renders the server stage string in the bar", async () => {
    mockGenRunData = runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" });
    await act(async () => { renderStrategy(); });

    expect(screen.getByTestId("status-hub-in-flight")).toBeTruthy();
    expect(screen.getByText("Persisting pillars…")).toBeTruthy();
  });

  it("does NOT show the fallback string when the server has reported a stage", async () => {
    mockGenRunData = runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" });
    await act(async () => { renderStrategy(); });

    expect(screen.queryByText(FALLBACK)).toBeNull();
  });

  it("renders the server percentage alongside the stage label", async () => {
    mockGenRunData = runningRun({ progress_pct: 72, progress_stage: "Scoring hypotheses…" });
    await act(async () => { renderStrategy(); });

    expect(screen.getByText("Scoring hypotheses…")).toBeTruthy();
    expect(within(screen.getByTestId("status-hub-in-flight")).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("72");
  });

  it("shows a different stage string mid-run without the fallback", async () => {
    mockGenRunData = runningRun({ progress_pct: 85, progress_stage: "Finalizing strategy…" });
    await act(async () => { renderStrategy(); });

    expect(screen.getByText("Finalizing strategy…")).toBeTruthy();
    expect(screen.queryByText(FALLBACK)).toBeNull();
  });
});

// ── B. Fallback string (progress_pct = 0 → progressStage = null) ──────────
//
// useGetLatestGenerationRun returns progress_pct=0 (no real progress yet).
// The real useGenerationRun sets hasRealProgress=false → progressStage=null.
// StrategyCommandCenter applies the ?? fallback: "Generating strategy…"
// GenerationProgressBar renders the fallback string in the DOM.

describe("StrategyCommandCenter · GenerationProgressBar shows fallback when progress_pct is 0", () => {
  it("renders the fallback string when the server has no progress yet", async () => {
    mockGenRunData = runningRun({ progress_pct: 0, progress_stage: null });
    await act(async () => { renderStrategy(); });

    expect(screen.getByTestId("status-hub-in-flight")).toBeTruthy();
    expect(screen.getByText(FALLBACK)).toBeTruthy();
  });

  // Note: progress_pct=null (legacy run) is NOT tested here as a separate
  // consumer case. In useGenerationRun, null is coerced to 0 via `?? 0` so
  // the code path is identical to progress_pct=0 above. The null→0 coercion
  // is already confirmed at the hook level in useGenerationRun-progress-stage.test.tsx.

  it("renders nothing (no progress bar) when there is no active run", async () => {
    mockGenRunData = null;           // no run at all → isRunning=false
    await act(async () => { renderStrategy(); });

    expect(screen.queryByTestId("status-hub-in-flight")).toBeNull();
  });

  it("transitions: server label appears on pct=60, reverts to fallback when pct drops to 0", async () => {
    // Phase 1 — server stage set
    mockGenRunData = runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" });
    let rerender!: ReturnType<typeof render>["rerender"];
    await act(async () => {
      ({ rerender } = renderStrategy());
    });
    expect(screen.getByText("Persisting pillars…")).toBeTruthy();
    expect(screen.queryByText(FALLBACK)).toBeNull();

    // Phase 2 — server resets pct to 0 between pipeline phases
    mockGenRunData = runningRun({ progress_pct: 0, progress_stage: null });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, enabled: false } },
    });
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AccountProvider>
              <DateRangeProvider>
                <StrategyCommandCenter />
              </DateRangeProvider>
            </AccountProvider>
          </AuthProvider>
        </QueryClientProvider>
      );
    });

    // The hub's label crossfades (AnimatePresence mode="wait": the outgoing
    // stage clears before the incoming one arrives), so the progressbar's
    // accessible name, which switches at once, is the synchronous witness,
    // and the visible text is awaited.
    const bar = within(screen.getByTestId("status-hub-in-flight")).getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe(FALLBACK);
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(await screen.findByText(FALLBACK)).toBeTruthy();
    expect(screen.queryByText("Persisting pillars…")).toBeNull();
  });
});
