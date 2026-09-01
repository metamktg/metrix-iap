// ─── Placements chart data guard ─────────────────────────────────────────────
// Verifies that the Placements view actually receives and renders placement data
// from the seed fixture. The nav-routes suite only checks the page doesn't 404;
// this suite catches the subtler regression where the page mounts empty (no
// rows, no placement labels) because the chart component stopped reading its
// data source.
//
// Failure modes caught:
//   - seed fixture missing v3_placement_signal / c4e_placement_signal rows
//   - rollupPlacements() or getAnalysisData() stops returning data
//   - PlacementsView stops rendering placement row buttons

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";

vi.mock("@/contexts/MetrixDataContext", async () => {
  const { seed } = await import("./seed");
  return {
    useMetrixSeed: () => seed,
    useMetrixIsRefetching: () => false,
    // AppShell mounts SeedRefreshFailedBanner, which reads this.
    useMetrixFreshness: () => ({ isRefetching: false, refreshFailed: false, retry: () => {} }),
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

import { renderAt, seedAccountSession } from "./harness";

const PLACEMENTS_PATH = "/app/analysis/placements";

beforeEach(() => {
  cleanup();
  seedAccountSession();
});

describe("Placements view renders real placement data from the seed fixture", () => {
  it("renders at least one placement row button", async () => {
    const { container } = await renderAt(PLACEMENTS_PATH);
    // Each placement in the ranked list gets a button with this testid.
    // If rollupPlacements() returns nothing, no buttons are rendered and
    // the assertion fails loudly — catching the "empty chart" regression.
    const placementButtons = container.querySelectorAll(
      "[data-testid^='row-placement-']"
    );
    expect(placementButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the 'Feed' placement label — present in both v3 and c4e signals", async () => {
    await renderAt(PLACEMENTS_PATH);
    // "Feed" appears in both v3_placement_signal and c4e_placement_signal in
    // the seed fixture. If either signal stops being read, the rollup may
    // drop it — this assertion fails before the user ever sees a blank chart.
    expect(screen.getAllByText("Feed").length).toBeGreaterThanOrEqual(1);
  });

  it("renders at least three distinct placement labels", async () => {
    const { container } = await renderAt(PLACEMENTS_PATH);
    const buttons = container.querySelectorAll("[data-testid^='row-placement-']");
    // The seed fixture has 18+ distinct placements. Requiring at least 3
    // means a near-empty rollup (e.g. only one row survived a bad filter)
    // fails here without being overly fragile about the exact count.
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("seed fixture contains placement rows (fixture self-check)", () => {
    // Guards the fixture itself: if someone zeros out v3/c4e placement
    // arrays the above tests would spuriously pass on the PendingState
    // branch (which renders text but no placement buttons). This check
    // fails before the view is even rendered, giving a clear error message.
    // Import inline so vi.mock above doesn't affect this direct JSON read.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seed = JSON.parse(
      require("node:fs").readFileSync(
        require("node:path").resolve(
          require("node:path").dirname(
            require("url").fileURLToPath(import.meta.url)
          ),
          "../../test-fixtures/metrix_seed_bundle.json"
        ),
        "utf-8"
      )
    );
    const account = seed?.ad_accounts?.[0]?.iap?.analysis;
    const v3: unknown[] = account?.v3_placement_signal ?? [];
    const c4e: unknown[] = account?.c4e_placement_signal ?? [];
    expect(v3.length + c4e.length).toBeGreaterThan(0);
  });
});
