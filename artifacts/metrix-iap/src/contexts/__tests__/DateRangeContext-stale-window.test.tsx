// Regression: a stale persisted date-window selection must never blank an
// analysis. If sessionStorage carries a custom range saved before a fresh
// manual import replaced the dataset (fully outside the new data bounds),
// the provider must fall back to the full data window and reset the
// persisted preset to "all".
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DateRangeProvider, useDateRange } from "../DateRangeContext";

const BOUNDS = { start: "2026-06-01", end: "2026-07-31" };

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => ({}),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({
    selectedAccountType: "ad_account",
    activeAdAccountId: "acct_test",
    adAccounts: [{ id: "acct_test" }],
  }),
}));
vi.mock("@/lib/data/metrixSeedAdapter", () => ({
  getCampaignSummary: () => ({ window_start: BOUNDS.start, window_end: BOUNDS.end }),
}));

function Probe() {
  const { range, preset, bounds } = useDateRange();
  return (
    <div>
      <span data-testid="preset">{preset}</span>
      <span data-testid="range">{range ? `${range.start}..${range.end}` : "null"}</span>
      <span data-testid="bounds">{bounds ? `${bounds.start}..${bounds.end}` : "null"}</span>
    </div>
  );
}

describe("DateRangeContext — stale persisted window fallback", () => {
  beforeEach(() => {
    cleanup();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("falls back to full bounds when the persisted custom range is fully outside the data window", async () => {
    sessionStorage.setItem(
      "metrix_date_range_v1",
      JSON.stringify({
        "acct:acct_test": {
          preset: "custom",
          customStart: "2024-01-01",
          customEnd: "2024-01-31",
          compare: false,
        },
      }),
    );

    render(
      <DateRangeProvider>
        <Probe />
      </DateRangeProvider>,
    );

    // Range must NEVER be empty/null — even before the reset effect runs it
    // must already equal the full bounds.
    expect(screen.getByTestId("range").textContent).toBe(`${BOUNDS.start}..${BOUNDS.end}`);
    // And the persisted stale selection resets to "all".
    await waitFor(() => expect(screen.getByTestId("preset").textContent).toBe("all"));
    const persisted = JSON.parse(sessionStorage.getItem("metrix_date_range_v1")!);
    expect(persisted["acct:acct_test"].preset).toBe("all");
  });

  it("keeps a valid overlapping custom range clamped to bounds", () => {
    sessionStorage.setItem(
      "metrix_date_range_v1",
      JSON.stringify({
        "acct:acct_test": {
          preset: "custom",
          customStart: "2026-05-15",
          customEnd: "2026-06-10",
          compare: false,
        },
      }),
    );

    render(
      <DateRangeProvider>
        <Probe />
      </DateRangeProvider>,
    );

    expect(screen.getByTestId("preset").textContent).toBe("custom");
    expect(screen.getByTestId("range").textContent).toBe(`${BOUNDS.start}..2026-06-10`);
  });
});
