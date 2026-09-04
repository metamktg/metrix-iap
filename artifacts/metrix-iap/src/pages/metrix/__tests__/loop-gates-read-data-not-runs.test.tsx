// ─── The loop gates ask for data, not for a run record ─────────────────
//
// Two command centres asked "did a run happen?" when the question is "is
// the input present?", and an importer account answers no to the first and
// yes to the second — so both pages locked their own stage while displaying
// the data that stage consumes.
//
// CREATIVE. The Creative Command Center gated brief generation on
// `stage-status.strategy.status === "success"`, which reports the latest
// in-app strategy GENERATION RUN. An account whose strategy arrived
// through the importer has never had one, so the page told bookster
// "this account doesn't have a completed strategy run yet" — directly
// under a tile reading "Pillars covered 3 of 3", and directly above a
// list of its sixteen briefs.
//
// The server never agreed with the gate. `storedPillars()` in
// generationEngine.ts takes "the CURRENT generated set if one exists,
// else the imported set", so the generation the gate refused to offer
// would have worked. The prerequisite is the input the generator
// consumes: pillars.
//
// STRATEGY. The same shape one stage earlier. `status.analysis.status`
// reports the latest MANUAL analysis run — getLatestAnalysisRun() reads
// manual_analysis_runs, falls back to report_pulls for live-Meta accounts,
// and returns null for everything imported — so the Strategy Command
// Center said "this account doesn't have a completed analysis run yet"
// beneath tiles reading 3 message pillars, 4 hypotheses and 4 ICP
// profiles. `validated` is the server's own account-wide completeness
// verdict and is the honest predicate; a successful run whose surfaces
// came up short must still hold the gate, so run success is not a second
// ticket through it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

// An importer account: analysis rows and message pillars exist, and no
// generation run has ever been recorded for either stage.
const IMPORTER_STAGE_STATUS = {
  analysis: { status: "none", validated: true, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
  strategy: { status: "none", last_run_at: null },
  briefs: { status: "none", last_run_at: null, count: 0 },
  mst: { unlocked: false },
};

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useGetAccountStageStatus: () => ({ data: IMPORTER_STAGE_STATUS }),
    useListManualImports: () => ({ data: { imports: [] } }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    getGetLatestGenerationRunQueryKey: () => ["latest-gen-run"],
    getGetMetrixSeedQueryKey: () => ["metrix-seed"],
    getGetAccountStageStatusQueryKey: () => ["stage-status"],
    ApiError: class ApiError extends Error {},
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

let seedForTest: unknown = baseSeed;
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seedForTest,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { CreativeCommandCenter } from "@/pages/metrix/creative/CreativeCommandCenter";
import { StrategyCommandCenter } from "@/pages/metrix/strategy/StrategyCommandCenter";

const SESSION_KEY = "metrix_active_account_v1";

function renderPage(ui: React.ReactElement) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>{ui}</DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const renderCreative = () => renderPage(<CreativeCommandCenter />);
const renderStrategy = () => renderPage(<StrategyCommandCenter />);

// The fixture's own pillars, so the test cannot pass against a seed that
// stopped carrying them.
function pillarCount(seed: typeof baseSeed): number {
  const acct = (seed.ad_accounts as { id: string; iap?: { strategy?: { message_pillars?: unknown[] } } }[])
    .find((a) => a.id === "bookster");
  return acct?.iap?.strategy?.message_pillars?.length ?? 0;
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  seedForTest = baseSeed;
});

afterEach(() => cleanup());

describe("Creative Command Center · the brief gate", () => {
  it("the fixture is the case this guards: pillars present, no strategy generation run", () => {
    expect(pillarCount(baseSeed)).toBeGreaterThan(0);
    expect(IMPORTER_STAGE_STATUS.strategy.status).toBe("none");
  });

  it("offers generation when the account has pillars, whatever the run record says", async () => {
    await act(async () => { renderCreative(); });
    expect(screen.queryByText("Generate strategy first")).toBeNull();
    expect(screen.getByRole("button", { name: /Generate from strategy|Regenerate briefs/ })).toBeTruthy();
  });

  it("still locks when there are no pillars to generate from", async () => {
    const stripped = JSON.parse(JSON.stringify(baseSeed));
    for (const acct of stripped.ad_accounts) {
      if (acct.id !== "bookster") continue;
      if (acct.iap?.strategy) acct.iap.strategy.message_pillars = [];
      if (acct.iap?.brief_builder) acct.iap.brief_builder.draft_briefs = [];
    }
    seedForTest = stripped;
    await act(async () => { renderCreative(); });
    expect(screen.getByText("Generate strategy first")).toBeTruthy();
  });
});

describe("Strategy Command Center · the analysis gate", () => {
  it("offers generation when the analysis data is validated, with no manual run on record", async () => {
    expect(IMPORTER_STAGE_STATUS.analysis.status).toBe("none");
    expect(IMPORTER_STAGE_STATUS.analysis.validated).toBe(true);
    await act(async () => { renderStrategy(); });
    expect(screen.queryByText("Run analysis first")).toBeNull();
  });

  it("still holds when the surfaces have not validated, whatever the run says", async () => {
    IMPORTER_STAGE_STATUS.analysis.validated = false;
    IMPORTER_STAGE_STATUS.analysis.status = "success";
    try {
      await act(async () => { renderStrategy(); });
      expect(screen.getByText("Run analysis first")).toBeTruthy();
      // A run that succeeded and still came up short says which of the two
      // it was — the reader's next move is the completeness report, not
      // another run.
      expect(screen.getByText(/not every analysis surface has validated data yet/)).toBeTruthy();
    } finally {
      IMPORTER_STAGE_STATUS.analysis.validated = true;
      IMPORTER_STAGE_STATUS.analysis.status = "none";
    }
  });

  it("holds while a run is in flight and says so", async () => {
    IMPORTER_STAGE_STATUS.analysis.status = "running";
    try {
      await act(async () => { renderStrategy(); });
      expect(screen.getByText("Run analysis first")).toBeTruthy();
      expect(screen.getByText(/An analysis run is in progress/)).toBeTruthy();
    } finally {
      IMPORTER_STAGE_STATUS.analysis.status = "none";
    }
  });
});
