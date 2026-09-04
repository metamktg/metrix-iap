// ─── GenerationProgressBar — briefs stage label threading end-to-end ─────────
//
// Task 621: Confirms that CreativeCommandCenter correctly threads the
// `progressStage` value from `useGenerationRun` through to the rendered
// `GenerationProgressBar` label — covering both the server-label path
// (progress_pct > 0 → server string appears) and the fallback path
// (progress_pct = 0 → caller's fallback string appears).
//
// The real hook (useGenerationRun) and the real component (CreativeCommandCenter
// + GenerationProgressBar) are rendered. Only the underlying API hooks are
// mocked at module boundaries so tests are deterministic and fast.
//
// End-to-end data flow confirmed:
//   useGetLatestGenerationRun (mock) → useGenerationRun (real hook, kind="briefs")
//     → CreativeCommandCenter (real component) → GenerationProgressBar (real)
//       → rendered label in the DOM
//
// ── Sibling creative views excluded (Task 623) ────────────────────────────
// CreativeScanView and CreativeImportExportView are intentionally NOT covered
// here: as of 2026-08-08 neither renders a GenerationProgressBar nor calls
// useGenerationRun — they have no generation runs of their own (Creative Scan
// is a locked/coming-soon stage; import/export is manual-upload driven).
// When either view gains its own generation run, wire a GenerationProgressBar
// and add a threading test following the pattern in this file (mock
// useGetLatestGenerationRun, render the real view, assert the server stage
// label and the fallback string both reach the DOM).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    // Stage-status hook — strategy validated so PrerequisiteGate opens and
    // the GenerationProgressBar section is actually rendered.
    useGetAccountStageStatus: () => ({
      data: {
        analysis: { status: "success", validated: true, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
        strategy: { status: "success", last_run_at: null },
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
import { CreativeCommandCenter } from "@/pages/metrix/creative/CreativeCommandCenter";

// ── Helpers ───────────────────────────────────────────────────────────────

// Select the "bookster" configured account so ModuleScopeGate passes.
const SESSION_KEY = "metrix_active_account_v1";
function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function renderCreative() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <CreativeCommandCenter />
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

// The fallback stageLabel wired in CreativeCommandCenter when progressStage is null.
const FALLBACK = "Generating briefs from strategy…";

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
// CreativeCommandCenter passes progressStage as stageLabel (no fallback needed).
// GenerationProgressBar renders the server string in the DOM.

describe("CreativeCommandCenter · GenerationProgressBar shows server stage label when progress_pct > 0", () => {
  it("renders the server stage string in the bar", async () => {
    mockGenRunData = runningRun({ progress_pct: 60, progress_stage: "Persisting briefs…" });
    await act(async () => { renderCreative(); });

    expect(screen.getByTestId("generation-progress-bar")).toBeTruthy();
    expect(screen.getByText("Persisting briefs…")).toBeTruthy();
  });

  it("does NOT show the fallback string when the server has reported a stage", async () => {
    mockGenRunData = runningRun({ progress_pct: 60, progress_stage: "Persisting briefs…" });
    await act(async () => { renderCreative(); });

    expect(screen.queryByText(FALLBACK)).toBeNull();
  });

  it("renders the server percentage alongside the stage label", async () => {
    mockGenRunData = runningRun({ progress_pct: 72, progress_stage: "Scoring brief hypotheses…" });
    await act(async () => { renderCreative(); });

    expect(screen.getByText("Scoring brief hypotheses…")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
  });

  it("shows a different stage string mid-run without the fallback", async () => {
    mockGenRunData = runningRun({ progress_pct: 85, progress_stage: "Finalizing briefs…" });
    await act(async () => { renderCreative(); });

    expect(screen.getByText("Finalizing briefs…")).toBeTruthy();
    expect(screen.queryByText(FALLBACK)).toBeNull();
  });
});

// ── B. Fallback string (progress_pct = 0 → progressStage = null) ──────────
//
// useGetLatestGenerationRun returns progress_pct=0 (no real progress yet).
// The real useGenerationRun sets hasRealProgress=false → progressStage=null.
// CreativeCommandCenter applies the ?? fallback: "Generating briefs from strategy…"
// GenerationProgressBar renders the fallback string in the DOM.

describe("CreativeCommandCenter · GenerationProgressBar shows fallback when progress_pct is 0", () => {
  it("renders the fallback string when the server has no progress yet", async () => {
    mockGenRunData = runningRun({ progress_pct: 0, progress_stage: null });
    await act(async () => { renderCreative(); });

    expect(screen.getByTestId("generation-progress-bar")).toBeTruthy();
    expect(screen.getByText(FALLBACK)).toBeTruthy();
  });

  // Note: progress_pct=null (legacy run) is NOT tested here as a separate
  // consumer case. In useGenerationRun, null is coerced to 0 via `?? 0` so
  // the code path is identical to progress_pct=0 above. The null→0 coercion
  // is already confirmed at the hook level in useGenerationRun-progress-stage.test.tsx.

  it("renders nothing (no progress bar) when there is no active run", async () => {
    mockGenRunData = null;           // no run at all → isRunning=false
    await act(async () => { renderCreative(); });

    expect(screen.queryByTestId("generation-progress-bar")).toBeNull();
  });

  it("transitions: server label appears on pct=60, reverts to fallback when pct drops to 0", async () => {
    // Phase 1 — server stage set
    mockGenRunData = runningRun({ progress_pct: 60, progress_stage: "Persisting briefs…" });
    let rerender!: ReturnType<typeof render>["rerender"];
    await act(async () => {
      ({ rerender } = renderCreative());
    });
    expect(screen.getByText("Persisting briefs…")).toBeTruthy();
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
                <CreativeCommandCenter />
              </DateRangeProvider>
            </AccountProvider>
          </AuthProvider>
        </QueryClientProvider>
      );
    });

    expect(screen.getByText(FALLBACK)).toBeTruthy();
    expect(screen.queryByText("Persisting briefs…")).toBeNull();
  });
});
