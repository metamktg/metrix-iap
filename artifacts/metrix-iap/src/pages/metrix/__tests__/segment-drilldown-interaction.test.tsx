// ─── Segment drill-down interaction tests ─────────────────────────────
// Rendered coverage for the interactive drill-down flow that the pure
// segment-analytics tests can't see:
//   - Audience signal (DemographicTable) row click → SegmentDrilldownModal
//   - SegmentGridModal avatar row click → nested SegmentDrilldownModal
//   - Segment metric picker enforces the hard cap (refuses a 9th metric)
//   - Structurally-unsupported metrics (ROAS, …) render disabled with an
//     honest reason, never with a fabricated value
// Uses the real seed fixture so assertions track production data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AvatarsView } from "../strategy/AvatarsView";
import { SegmentGridModal } from "@/components/creative/SegmentGridModal";
import { getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { MAX_VISIBLE_SEGMENT_METRICS } from "@/lib/data/segmentMetricsCatalog";

const SESSION_KEY = "metrix_active_account_v1";

const bookster = getAnalysisData(seed, "bookster");
if (!bookster) throw new Error("Fixture drift: bookster analysis data missing from seed fixture");

function selectBookster() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>{ui}</DateRangeProvider>
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
  selectBookster();
});

describe("Audience signal table → segment drill-down", () => {
  it("clicking a DemographicTable row opens SegmentDrilldownModal for that segment", () => {
    renderWithProviders(<AvatarsView />);

    // No drill-down open initially.
    expect(screen.queryByTestId("title-segment-drilldown")).toBeNull();

    const rows = screen.getAllByTestId(/^row-demographic-/);
    expect(rows.length).toBeGreaterThan(0);

    // First fixture row is 45-54 / female (real seed data).
    fireEvent.click(rows[0]!);

    const title = screen.getByTestId("title-segment-drilldown");
    expect(title.textContent).toContain("Women 45-54");
    expect(title.textContent).toContain("what's driving results");

    // Real segment metric tiles render (default set includes spend).
    expect(screen.getByTestId("tile-segment-metric-spend")).toBeTruthy();
  });

  it("closing the drill-down returns to the audience table", () => {
    renderWithProviders(<AvatarsView />);
    fireEvent.click(screen.getAllByTestId(/^row-demographic-/)[0]!);
    expect(screen.getByTestId("title-segment-drilldown")).toBeTruthy();

    // Radix Dialog closes on Escape.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByTestId("title-segment-drilldown")).toBeNull();
    expect(screen.getAllByTestId(/^row-demographic-/).length).toBeGreaterThan(0);
  });
});

describe("SegmentGridModal → nested segment drill-down", () => {
  it("clicking an avatar row in the grid opens the nested drill-down", () => {
    renderWithProviders(
      <SegmentGridModal
        open
        onClose={() => {}}
        kicker="Test kicker"
        title="Test drill"
        analysis={bookster}
        cellIds={null}
      />
    );

    const avatarButtons = screen.getAllByTestId(/^button-segment-drilldown-/);
    expect(avatarButtons.length).toBeGreaterThan(0);
    expect(screen.queryByTestId("title-segment-drilldown")).toBeNull();

    fireEvent.click(avatarButtons[0]!);

    const title = screen.getByTestId("title-segment-drilldown");
    expect(title.textContent).toContain("what's driving results");
    // The nested drill-down inherits the grid's kicker.
    const dialogs = screen.getAllByRole("dialog");
    const drilldown = dialogs[dialogs.length - 1]!;
    expect(drilldown.textContent).toContain("Test kicker");
  });

  it("scopes the nested drill-down to the grid's cellIds", () => {
    renderWithProviders(
      <SegmentGridModal
        open
        onClose={() => {}}
        kicker="Scoped"
        title="Scoped drill"
        analysis={bookster}
        cellIds={["C2B"]}
      />
    );
    fireEvent.click(screen.getAllByTestId(/^button-segment-drilldown-/)[0]!);
    const dialogs = screen.getAllByRole("dialog");
    const drilldown = dialogs[dialogs.length - 1]!;
    expect(drilldown.textContent).toContain("scoped to C2B");
  });
});

describe("Segment metric picker", () => {
  function openDrilldownAndPicker() {
    renderWithProviders(<AvatarsView />);
    fireEvent.click(screen.getAllByTestId(/^row-demographic-/)[0]!);
    fireEvent.click(screen.getByTestId("button-segment-metric-picker"));
  }

  it("refuses a 9th metric once the cap is reached", () => {
    openDrilldownAndPicker();

    // Default selection is 6; add available metrics until the cap of 8.
    fireEvent.click(screen.getByTestId("picker-segment-metric-reach"));
    fireEvent.click(screen.getByTestId("picker-segment-metric-clicks_all"));

    expect(screen.getByTestId("tile-segment-metric-reach")).toBeTruthy();
    expect(screen.getByTestId("tile-segment-metric-clicks_all")).toBeTruthy();
    expect(screen.getAllByTestId(/^tile-segment-metric-/).length).toBe(MAX_VISIBLE_SEGMENT_METRICS);

    // Cap message is shown and further available metrics are disabled.
    expect(
      screen.getByText(`Maximum of ${MAX_VISIBLE_SEGMENT_METRICS} metrics — remove one to add another.`)
    ).toBeTruthy();
    const ninth = screen.getByTestId("picker-segment-metric-cpm") as HTMLButtonElement;
    expect(ninth.disabled).toBe(true);

    // Clicking anyway must not add a 9th tile.
    fireEvent.click(ninth);
    expect(screen.queryByTestId("tile-segment-metric-cpm")).toBeNull();
    expect(screen.getAllByTestId(/^tile-segment-metric-/).length).toBe(MAX_VISIBLE_SEGMENT_METRICS);
  });

  it("frees a slot again after removing a metric at the cap", () => {
    openDrilldownAndPicker();
    fireEvent.click(screen.getByTestId("picker-segment-metric-reach"));
    fireEvent.click(screen.getByTestId("picker-segment-metric-clicks_all"));
    expect((screen.getByTestId("picker-segment-metric-cpm") as HTMLButtonElement).disabled).toBe(true);

    // Remove one → cap clears → the previously blocked metric becomes addable.
    fireEvent.click(screen.getByTestId("picker-segment-metric-reach"));
    const cpm = screen.getByTestId("picker-segment-metric-cpm") as HTMLButtonElement;
    expect(cpm.disabled).toBe(false);
    fireEvent.click(cpm);
    expect(screen.getByTestId("tile-segment-metric-cpm")).toBeTruthy();
  });

  it("shows structurally-unsupported metrics (ROAS, purchase value) disabled with an honest reason", () => {
    openDrilldownAndPicker();

    for (const id of ["roas", "purchase_value", "atc"]) {
      const btn = screen.getByTestId(`picker-segment-metric-${id}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain("Not available in current data");
    }

    // Clicking a disabled metric never renders a fabricated tile.
    fireEvent.click(screen.getByTestId("picker-segment-metric-roas"));
    expect(screen.queryByTestId("tile-segment-metric-roas")).toBeNull();
  });
});

describe("Variable chips (raw codes in tooltip, descriptors on chip)", () => {
  it("renders the human-readable descriptor on the chip, with the raw code only in the tooltip", async () => {
    renderWithProviders(<AvatarsView />);
    fireEvent.click(screen.getAllByTestId(/^row-demographic-/)[0]!);

    const chips = screen.getAllByTestId(/^chip-segment-variable-/);
    expect(chips.length).toBeGreaterThan(0);

    // Chip text is the resolved descriptor, not the raw code.
    const chip = chips.find((c) => c.getAttribute("data-testid") === "chip-segment-variable-HK_Benefit");
    expect(chip).toBeTruthy();
    expect(chip!.textContent).not.toBe("HK_Benefit");
    expect(chip!.textContent!.length).toBeGreaterThan(0);

    // Focusing the trigger opens the Radix tooltip carrying the raw code.
    fireEvent.focus(chip!);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("HK_Benefit")).toBeTruthy();
  });
});
