// ─── BUG-08 · restage discoverability ─────────────────────────────────
//
// A run consumes the STAGED batch, so a successful run leaves its files
// `processed` and the next run reports both reports missing. That is by
// design — reading processed files back would double-count — but the copy
// never said the files still exist and can be re-staged from Import History.
// The workaround people found instead was re-uploading a file already in the
// database, byte-identical, which is what forced the Aug 24 AAFE re-upload.
//
// The other half of the fix is the half that is easy to get wrong: the offer
// is made ONLY when there is really something to re-stage. Pointing a user at
// an empty Import History is BUG-29 over again — telling someone to import a
// file they already imported — so both directions are asserted here.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8"
  )
);

let mockImports: { id: string; filename: string; kind: string; status: string }[] = [];

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => ["/app/analysis", vi.fn()] };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: [] } }),
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

const SESSION_KEY = "metrix_active_account_v1";

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
    </QueryClientProvider>
  );
}

/** The warning lives behind the "Date range to analyze" disclosure. */
async function openWarnings() {
  await act(async () => { renderCC(); });
  await act(async () => { fireEvent.click(screen.getByText("Date range to analyze")); });
}

// The run gate is now the server's own contract: ONE delivery report
// (Demographics, Placements or Ad Summary) is enough, the rest add
// resolution. So the copy under test lives in two places — the hard block
// when nothing is staged, and the neutral optional-exports note when a run
// can already go — and the restage offer must appear in whichever one shows.
const warningText = () =>
  screen.queryByText("A delivery report is required before running analysis")?.parentElement?.textContent ??
  expandedNoteText() ??
  "";

// The optional-exports note is a CaveatNote collapsed to a preview by
// default (the previous disclosure pattern); the full text is one click away.
function expandedNoteText(): string | undefined {
  const note = screen.queryByTestId("optional-exports-note");
  if (!note) return undefined;
  const toggle = note.querySelector("button");
  if (toggle && toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  return note.textContent ?? undefined;
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  mockImports = [];
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
});
afterEach(() => cleanup());

describe("BUG-08 · restage discoverability", () => {
  it("points at Import History when the missing files were already processed by a prior run", async () => {
    // Exactly the state a successful run leaves behind.
    mockImports = [
      { id: "1", filename: "demo.csv", kind: "performance_demo_csv", status: "processed" },
      { id: "2", filename: "placements.xlsx", kind: "performance_placement_csv", status: "processed" },
    ];
    await openWarnings();
    const text = warningText();
    expect(text).toContain("Re-stage it from Import History");
    expect(text).toContain("Demographics and Placement");
  });

  it("does NOT offer restage when there is nothing to re-stage", async () => {
    // A first-time account: Import History is empty, so an offer to re-stage
    // from it would send the user to a panel with nothing in it.
    mockImports = [];
    await openWarnings();
    const text = warningText();
    expect(text).not.toContain("Import History");
    expect(text).toContain("from this account's setup screen");
  });

  it("names only the report that is actually re-stageable", async () => {
    // Demographics is staged; only Placement is missing, and only Placement
    // has a processed copy — the copy must not imply both. Since the gate
    // moved to "any one delivery report", a staged Demographics export means
    // the run is NOT blocked: the offer now lives in the optional-exports
    // note rather than a blocking warning, and the block copy is absent.
    mockImports = [
      { id: "1", filename: "demo.csv", kind: "performance_demo_csv", status: "staged" },
      { id: "2", filename: "placements.xlsx", kind: "performance_placement_csv", status: "processed" },
    ];
    await openWarnings();
    expect(screen.queryByText("A delivery report is required before running analysis")).toBeNull();
    const text = warningText();
    expect(text).toContain("Placement");
    expect(text).toContain("Re-stage it from Import History");
    expect(text).not.toContain("Demographics and Placement");
  });

  it("does not offer restage for a kind whose only prior copy is still uploading", async () => {
    // `uploading` rows are half-written sessions, never consumable.
    mockImports = [
      { id: "1", filename: "demo.csv", kind: "performance_demo_csv", status: "uploading" },
      { id: "2", filename: "p.xlsx", kind: "performance_placement_csv", status: "uploading" },
    ];
    await openWarnings();
    expect(warningText()).not.toContain("Import History");
  });
});
