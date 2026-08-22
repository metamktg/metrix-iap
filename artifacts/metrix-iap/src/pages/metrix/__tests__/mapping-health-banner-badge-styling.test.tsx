// ─── MappingHealthBanner badge styling tests ──────────────────────────────
//
// Guards the "missing" badge span inside renderProblemRow(): an optional
// column that's missing (tier === "missing", is_required === false) must
// render with status-warning/amber classes, matching the amber-bordered
// section it lives in ("Missing optional columns may reduce analysis
// accuracy") — not the red classes reserved for genuinely required-and-
// missing columns (the red section shown above it).
//
// Regression target: the badge's className ternary previously gated only on
// `p.tier === "missing"` for its second branch (dropping the `p.isRequired`
// check that the row's other three styled elements already used), so an
// optional-missing row rendered a near-red badge
// (bg-red-500/10 border-red-400/30 text-red-300) inside an amber box.

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

function renderControls() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AnalysisControls accountId="test-account-1" />
    </QueryClientProvider>,
  );
  // Both the red (required-missing) and amber (optional/inferred) sections
  // share one `expanded` boolean sourced from MappingHealthBanner's own
  // state — click any "Show details" trigger to reveal the row list.
  const trigger = screen.getByRole("button", { name: /show details/i });
  fireEvent.click(trigger);
  return utils;
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockImports = [];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MappingHealthBanner — problem-row badge styling", () => {
  it("renders an optional-missing column's badge with status-warning classes, not red", () => {
    mockImports = [
      {
        id: "imp-1",
        kind: "performance_ad_summary_csv",
        filename: "ad_summary.csv",
        ad_names: [],
        mapping_summary: [
          { canonical: "Placement", tier: "missing", is_required: false, found_as: null },
        ],
        status: "staged",
      },
    ];

    renderControls();

    const badge = screen.getByText("missing");
    expect(badge.className).toContain("bg-status-warning/10");
    expect(badge.className).toContain("border-status-warning/30");
    expect(badge.className).toContain("text-status-warning");

    // Must NOT carry either red variant — the strong required-missing red,
    // or the previously-buggy "weak" red used for optional-missing rows.
    expect(badge.className).not.toContain("bg-red-500/15");
    expect(badge.className).not.toContain("bg-red-500/10");
    expect(badge.className).not.toContain("text-red-300");
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
    expect(badge.className).toContain("bg-red-500/15");
    expect(badge.className).toContain("border-red-400/40");
    expect(badge.className).toContain("text-red-300");
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
});
