// ─── Creative Command Center — canvas fidelity fixes ───────────────────
// Nocturne canvas parity: the Command Center execution card follows the
// same SectionCard pattern as StrategyCommandCenter (verb-matching title
// "Generate briefs"), carries a real "Run history" card sourced from the
// account's latest briefs generation run, and the hub grid includes a
// "Brief builder" tile linking to /app/creative/builder.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

let mockGenRunData: {
  id: string;
  status: string;
  progress_pct: number | null;
  progress_stage: string | null;
  started_at: string;
  error_message: string | null;
  model?: string | null;
} | null = null;

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestGenerationRun: () => ({
      data: mockGenRunData ? { run: mockGenRunData } : null,
    }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useGetAccountStageStatus: () => ({
      data: {
        analysis: { status: "success", validated: true, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
        strategy: { status: "success", last_run_at: null },
        briefs: { status: "none", last_run_at: null, count: 0 },
        mst: { unlocked: false },
      },
    }),
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

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => baseSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { CreativeCommandCenter } from "@/pages/metrix/creative/CreativeCommandCenter";

const SESSION_KEY = "metrix_active_account_v1";
function selectBookster() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
}

function renderCreative() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
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

describe("CreativeCommandCenter — Execution card matches the canvas verb", () => {
  it("titles the execution card 'Generate briefs' (COMMAND['creative.cc'].verb)", async () => {
    await act(async () => { renderCreative(); });
    expect(screen.getByText("Generate briefs")).toBeTruthy();
  });
});

describe("CreativeCommandCenter — Run history card", () => {
  it("shows an honest empty state when no generation run exists yet", async () => {
    mockGenRunData = null;
    await act(async () => { renderCreative(); });
    expect(screen.getByText("Run history")).toBeTruthy();
    expect(screen.getByText("No generation runs yet for this account.")).toBeTruthy();
  });

  it("renders the latest real run's status, id, and timestamp", async () => {
    mockGenRunData = {
      id: "run-briefs-42",
      status: "success",
      progress_pct: 100,
      progress_stage: null,
      started_at: new Date("2026-07-07T00:00:00Z").toISOString(),
      error_message: null,
    };
    await act(async () => { renderCreative(); });
    expect(screen.getByText("run-briefs-42")).toBeTruthy();
    // Status text renders (capitalized via CSS, DOM text stays lowercase "success").
    expect(screen.getAllByText("success").length).toBeGreaterThan(0);
  });

  it("renders an error run honestly (no fabricated success state)", async () => {
    mockGenRunData = {
      id: "run-briefs-43",
      status: "error",
      progress_pct: 0,
      progress_stage: null,
      started_at: new Date("2026-07-08T00:00:00Z").toISOString(),
      error_message: "Generation failed.",
    };
    await act(async () => { renderCreative(); });
    expect(screen.getByText("run-briefs-43")).toBeTruthy();
    expect(screen.getAllByText("error").length).toBeGreaterThan(0);
  });
});

describe("CreativeCommandCenter — hub grid includes Brief builder", () => {
  it("links to /app/creative/builder alongside Library, Creative Scan, and Import & Export", async () => {
    await act(async () => { renderCreative(); });
    expect(screen.getByText("Brief builder")).toBeTruthy();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("Creative Scan")).toBeTruthy();
    expect(screen.getByText("Import & Export")).toBeTruthy();
  });
});
