// ─── Analysis Command Center — canvas fidelity fixes ───────────────────
// Nocturne canvas parity: the header carries the same real date-range /
// Export control cluster as AdAccountOverview (OverviewHeaderControls),
// the execution card's tiles are honest pre-run readiness stats (staged
// imports, ads in scope, run window, objectives) instead of stale
// analysis-derived numbers, and staged manual imports get their own card
// separate from the run trigger.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
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

type MockRun = {
  id: string;
  status: string;
  date_range?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  rows_ingested?: number | null;
  started_at: string;
};

let mockRuns: MockRun[] = [];
let mockImports: { id: string; filename: string; kind: string; status: string; created_at?: string }[] = [];
let navigateSpy: ReturnType<typeof vi.fn>;

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ["/app/analysis", navigateSpy],
  };
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

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => baseSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { resolveObjectivesMeta } from "@/lib/data/cohortMeta";
import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisCommandCenter } from "@/pages/metrix/analysis/AnalysisCommandCenter";

const SESSION_KEY = "metrix_active_account_v1";
function selectBookster() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
}

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

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  mockRuns = [];
  mockImports = [];
  navigateSpy = vi.fn();
  selectBookster();
});

afterEach(() => {
  cleanup();
});

describe("AnalysisCommandCenter · header control cluster", () => {
  it("renders the real date-range pills and an Export button that navigates to /app/exports/analysis", async () => {
    await act(async () => { renderCC(); });
    expect(screen.getByRole("group", { name: "Date range" })).toBeTruthy();
    const exportBtn = screen.getByRole("button", { name: "Export" });
    fireEvent.click(exportBtn);
    expect(navigateSpy).toHaveBeenCalledWith("/app/exports/analysis");
  });

  it("titles the page with the real account name, not a bare 'Analysis'", async () => {
    await act(async () => { renderCC(); });
    expect(screen.getByRole("heading", { name: "Bookster · Analysis" })).toBeTruthy();
  });

  it("carries a Summary/Detailed toggle wired to the execution card's disclosure state", async () => {
    await act(async () => { renderCC(); });
    // Starts collapsed ("Summary") — real backing, not decorative.
    const toggle = screen.getByRole("button", { name: /Summary/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { fireEvent.click(toggle); });
    expect(screen.getByRole("button", { name: /Detailed/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("AnalysisCommandCenter · execution card is honest pre-run readiness", () => {
  // Objectives moved OFF the tile row deliberately (owner decision,
  // 2026-08-29): they belong to this run, so they stay on the card, but as a
  // long text value at stat size they outranked the three real run
  // parameters and read as a standing classification of the account. The
  // claim under test is unchanged — the card states this account's real
  // objectives — only where it states them moved.
  it("shows real staged-imports, ads-in-scope and window tiles, and states the run's objectives", async () => {
    mockImports = [
      { id: "imp-1", filename: "demo.csv", kind: "performance_demo_csv", status: "staged" },
      { id: "imp-2", filename: "placement.csv", kind: "performance_placement_csv", status: "staged" },
    ];
    await act(async () => { renderCC(); });
    expect(screen.getByText("Staged imports")).toBeTruthy();
    expect(screen.getByText("Ads in scope")).toBeTruthy();
    expect(screen.getByTestId("run-objectives-line")).toBeTruthy();
    // DERIVED from the fixture, not hardcoded. This assertion once read
    // `expect(getByText("61"))` — Bookster's ad count on the day it was
    // written — and the next data refresh (62 ads, a second objective)
    // failed it with nothing broken. The claim under test is "the tiles
    // show THIS account's real values", so compute them the way the view
    // does and assert the match.
    const bookster = baseSeed.ad_accounts.find((a: { id: string }) => a.id === "bookster")!;
    expect(screen.getByText(String((bookster.ads ?? []).length))).toBeTruthy();
    expect(screen.getByTestId("run-objectives-line").textContent).toContain(
      resolveObjectivesMeta(bookster.objectives).label,
    );
    // Default run window mirrors AnalysisControls' own default ("30d").
    expect(screen.getByText("30 days")).toBeTruthy();
  });

  it("never shows a leftover analysis-derived tile. Tile count reflects staged imports, not stale prior-run rows", async () => {
    mockImports = [];
    await act(async () => { renderCC(); });
    // Zero staged imports is an honest "0", not blank or a stale number.
    const tileWrapper = screen.getByText("Staged imports").parentElement;
    expect(tileWrapper?.textContent).toContain("0");
  });

  it("stays compact by default: the Run analysis button is visible but the date-range chooser and pre-run warnings are collapsed", async () => {
    // Nothing staged — in the old always-expanded layout this would render
    // the blocking warning box. (The run gate now follows the server's
    // adaptive contract — one delivery report is enough — so the amber
    // "Spend will be underreported" alert no longer exists; the block copy
    // names a delivery report, not "both reports".)
    mockImports = [];
    await act(async () => { renderCC(); });
    expect(screen.getByRole("button", { name: "Run analysis" })).toBeTruthy();
    expect(screen.getByText("Date range to analyze")).toBeTruthy();
    expect(screen.queryByText("Last 7 days")).toBeNull();
    expect(screen.queryByTestId("optional-exports-note")).toBeNull();
    expect(screen.queryByText("A delivery report is required before running analysis")).toBeNull();
  });

  it("reveals the date-range chooser and warnings when the disclosure is opened", async () => {
    mockImports = [];
    await act(async () => { renderCC(); });
    const reveal = screen.getByText("Date range to analyze");
    await act(async () => { fireEvent.click(reveal); });
    expect(screen.getByText("Last 7 days")).toBeTruthy();
    // With nothing staged the hard block shows and the optional-exports note
    // does not (there is no run for it to annotate).
    expect(screen.getByText("A delivery report is required before running analysis")).toBeTruthy();
    expect(screen.queryByTestId("optional-exports-note")).toBeNull();
  });

  it("lets a run go on one delivery report and names the absent exports as resolution, not a warning", async () => {
    // Only an Ad Summary staged: the server accepts this (analysisEngine's
    // adaptive contract), so the client must not block it. The two pivots
    // are named as what they would ADD, in neutral caveat copy.
    mockImports = [{ id: "s", filename: "summary.csv", kind: "performance_ad_summary_csv", status: "staged" }];
    await act(async () => { renderCC(); });
    await act(async () => { fireEvent.click(screen.getByText("Date range to analyze")); });
    expect(screen.queryByText("A delivery report is required before running analysis")).toBeNull();
    // The note is a CaveatNote collapsed to a preview by default (the
    // previous disclosure pattern); the full text is one click away.
    const noteEl = screen.getByTestId("optional-exports-note");
    const toggle = noteEl.querySelector("button");
    if (toggle && toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
    const note = noteEl.textContent ?? "";
    expect(note).toContain("Demographics export");
    expect(note).toContain("Placements export");
    expect(note).not.toContain("Ad Summary export");
    expect(note).toContain("adds resolution");
    expect((screen.getByRole("button", { name: "Run analysis" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("expands the execution card's disclosure when the header Summary/Detailed toggle is switched to Detailed", async () => {
    mockImports = [];
    await act(async () => { renderCC(); });
    expect(screen.queryByText("Last 7 days")).toBeNull();
    const toggle = screen.getByRole("button", { name: /Summary/ });
    await act(async () => { fireEvent.click(toggle); });
    expect(screen.getByText("Last 7 days")).toBeTruthy();
  });
});

describe("AnalysisCommandCenter · Manual import card", () => {
  it("shows an honest empty state when nothing is staged", async () => {
    mockImports = [];
    await act(async () => { renderCC(); });
    expect(screen.getByText("Manual import")).toBeTruthy();
    expect(screen.getByText("Add a performance export before running analysis. Settings keeps every staged file.")).toBeTruthy();
  });

  it("stages from the card itself: Add import opens the manual import dialog", async () => {
    // Staging used to be reachable only through Settings (owner, 2026-09-04:
    // "the command center does not surface the functionality to stage").
    mockImports = [];
    await act(async () => { renderCC(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("button-add-import")); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("lists each staged file with a Staged badge, separate from the run trigger card", async () => {
    mockImports = [
      { id: "imp-1", filename: "demographics-export.csv", kind: "performance_demo_csv", status: "staged" },
      { id: "imp-2", filename: "placement-export.csv", kind: "performance_placement_csv", status: "staged" },
      { id: "imp-3", filename: "old-file.csv", kind: "performance_demo_csv", status: "processed" },
    ];
    await act(async () => { renderCC(); });
    expect(screen.getByText("demographics-export.csv")).toBeTruthy();
    expect(screen.getByText("placement-export.csv")).toBeTruthy();
    // A processed (already-consumed) import is not part of the current staging area.
    expect(screen.queryByText("old-file.csv")).toBeNull();
    expect(screen.getAllByText("Staged").length).toBe(2);
  });

  it("shows each staged file's real created_at timestamp next to its kind label", async () => {
    mockImports = [
      { id: "imp-1", filename: "demographics-export.csv", kind: "performance_demo_csv", status: "staged", created_at: "2026-08-19T05:58:00.000Z" },
    ];
    await act(async () => { renderCC(); });
    const filenameEl = screen.getByText("demographics-export.csv");
    const kindLine = filenameEl.parentElement?.querySelector("span:nth-child(2)");
    expect(kindLine?.textContent).toContain("Demographics CSV");
    expect(kindLine?.textContent).toContain("·");
  });
});

describe("AnalysisCommandCenter · Run history card", () => {
  it("shows an honest empty state when no runs exist yet", async () => {
    mockRuns = [];
    await act(async () => { renderCC(); });
    expect(screen.getByText("No analysis runs yet for this account.")).toBeTruthy();
  });

  it("filters recent runs by the header's selected window", async () => {
    const now = Date.now();
    mockRuns = [
      { id: "run-recent", status: "success", started_at: new Date(now - 2 * 86_400_000).toISOString(), date_start: "2026-08-10", date_end: "2026-08-17" },
      { id: "run-old", status: "success", started_at: new Date(now - 60 * 86_400_000).toISOString(), date_start: "2026-06-10", date_end: "2026-06-17" },
    ];
    await act(async () => { renderCC(); });
    // Default "all" shows both real runs.
    expect(screen.getByText("2026-08-10 → 2026-08-17")).toBeTruthy();
    expect(screen.getByText("2026-06-10 → 2026-06-17")).toBeTruthy();

    const sevenDayPill = screen.getByRole("button", { name: "7d" });
    await act(async () => { fireEvent.click(sevenDayPill); });
    expect(screen.getByText("2026-08-10 → 2026-08-17")).toBeTruthy();
    expect(screen.queryByText("2026-06-10 → 2026-06-17")).toBeNull();
  });
});
