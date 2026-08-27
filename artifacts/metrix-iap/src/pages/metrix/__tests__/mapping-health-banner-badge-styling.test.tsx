// ─── MappingHealthBanner severity styling tests ───────────────────────────
//
// Guards the banner's three-way severity split:
//  - required-missing  → red section, strong red "missing" badge
//  - inferred          → amber section, status-warning "low confidence" badge
//  - optional-missing  → NEUTRAL collapsed notice ("not included in this
//    export"), muted "not in export" chip — never amber, never red, and
//    never the old "Consider fixing your CSV first" framing. Absence of
//    optional columns is a property of Meta's export type, not a user error
//    (the live trigger was an Ad Summary export rendering "29 columns
//    missing … Consider fixing your CSV first" when only Day + Ad name are
//    actually required).
//
// The column list stays available behind the disclosure — demoted
// presentation, never hidden data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Per-test mutable state ─────────────────────────────────────────────────

type MockMappingEntry = {
  canonical: string;
  tier: string;
  is_required: boolean;
  found_as?: string | null;
};
type MockImport = {
  id: string;
  kind: string;
  filename: string;
  ad_names: string[];
  mapping_summary: MockMappingEntry[];
  status: string;
};
let mockImports: MockImport[] = [];

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({ data: null, refetch: vi.fn() }),
    useStartManualAnalysisRun: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useListManualImports: () => ({
      data: { imports: mockImports },
      refetch: vi.fn(),
    }),
    useGetManualPerformanceCsvFormat: () => ({ data: null }),
    useSyncCreativeLinks: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useUpdateManualImportAdNames: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getListManualImportsQueryKey: () => ["metrix", "imports"],
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { AnalysisControls } from "../ManualAnalysisControls";

// ── Helpers ────────────────────────────────────────────────────────────────

function renderControls(trigger: RegExp = /show details/i) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AnalysisControls accountId="test-account-1" />
    </QueryClientProvider>,
  );
  // The red/amber sections share one `expanded` boolean; the neutral
  // optional-column notice has its own ("Show list"). Click whichever
  // trigger the scenario under test renders.
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  return utils;
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockImports = [];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MappingHealthBanner — severity styling", () => {
  it("renders an optional-missing column as a neutral notice, never a warning", () => {
    mockImports = [
      {
        id: "imp-1",
        kind: "performance_ad_summary_csv",
        filename: "ad_summary.csv",
        ad_names: [],
        mapping_summary: [
          { canonical: "Placement", tier: "missing", is_required: false, found_as: null },
          { canonical: "Frequency", tier: "missing", is_required: false, found_as: null },
        ],
        status: "staged",
      },
    ];

    renderControls(/show list/i);

    // Neutral header framing — counts absence, does not alarm.
    expect(
      screen.getByText(/2 optional columns not included in this export/i),
    ).toBeTruthy();
    expect(screen.getByText(/no action needed/i)).toBeTruthy();

    // The old alarm framing must be gone entirely.
    expect(screen.queryByText(/consider fixing your csv/i)).toBeNull();
    expect(screen.queryByText(/may reduce analysis accuracy/i)).toBeNull();
    expect(screen.queryByText(/columns? missing,/i)).toBeNull();

    // Expanded rows carry a muted "not in export" chip — no warning classes.
    const chips = screen.getAllByText("not in export");
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.className).toContain("text-muted-foreground/75");
      expect(chip.className).not.toContain("status-warning");
      expect(chip.className).not.toContain("red");
    }
    // The columns themselves stay listed — demoted, not hidden.
    expect(screen.getByText("Placement")).toBeTruthy();
    expect(screen.getByText("Frequency")).toBeTruthy();
  });

  it("still renders a required-missing column's badge with strong red classes", () => {
    mockImports = [
      {
        id: "imp-1",
        kind: "performance_demo_csv",
        filename: "demographics.csv",
        ad_names: [],
        mapping_summary: [
          { canonical: "Age", tier: "missing", is_required: true, found_as: null },
        ],
        status: "staged",
      },
    ];

    renderControls();

    const badge = screen.getByText("missing");
    expect(badge.className).toContain("bg-status-danger/15");
    expect(badge.className).toContain("border-status-danger/40");
    expect(badge.className).toContain("text-status-danger");
    expect(badge.className).not.toContain("status-warning");
  });

  it("renders an inferred (low-confidence) column's badge with status-warning classes", () => {
    mockImports = [
      {
        id: "imp-1",
        kind: "performance_placement_csv",
        filename: "placements.csv",
        ad_names: [],
        mapping_summary: [
          { canonical: "Device", tier: "inferred", is_required: true, found_as: "device_type" },
        ],
        status: "staged",
      },
    ];

    renderControls();

    const badge = screen.getByText("low confidence");
    expect(badge.className).toContain("bg-status-warning/10");
    expect(badge.className).toContain("border-status-warning/30");
    expect(badge.className).toContain("text-status-warning");
    expect(badge.className).not.toContain("red");
  });

  it("keeps inferred amber and optional-missing neutral when both are present", () => {
    mockImports = [
      {
        id: "imp-1",
        kind: "performance_ad_summary_csv",
        filename: "ad_summary.csv",
        ad_names: [],
        mapping_summary: [
          { canonical: "Reach", tier: "missing", is_required: false, found_as: null },
          { canonical: "Device", tier: "inferred", is_required: false, found_as: "device_type" },
        ],
        status: "staged",
      },
    ];

    renderControls();

    // Amber section counts ONLY the low-confidence match…
    expect(screen.getByText(/1 column matched with low confidence/i)).toBeTruthy();
    // …and the optional absence lives in its own neutral notice.
    expect(
      screen.getByText(/1 optional column not included in this export/i),
    ).toBeTruthy();
    // The combined "N columns missing, M low-confidence" alarm header is gone.
    expect(screen.queryByText(/missing, 1 low-confidence/i)).toBeNull();
  });
});
