// Regression: loadPersist() must validate the persisted `preset` value
// against the live DateRangePreset enum before trusting it. Before this
// fix, a sessionStorage entry from before the "30d" -> "28d" rename (this
// session's date-range unification) sailed through `JSON.parse(raw) as
// PersistMap` unchecked. PRESET_LABELS["30d"] is undefined and no pill in
// DateRangePicker.tsx matches it as active, so the picker rendered blank/
// unselected even though `PRESET_DAYS[state.preset] ?? 28` silently
// computed a correct 28-day range underneath -- the picker only *looked*
// broken. Any other unrecognized preset string (a corrupt value, or a
// future enum rename made the same way) must be just as safe: it should
// never crash and must never leave the resolved preset outside
// PRESET_LABELS's keys.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DateRangeProvider, useDateRange, PRESET_LABELS } from "../DateRangeContext";

const BOUNDS = { start: "2026-06-01", end: "2026-07-31" };
const STORAGE_KEY = "metrix_date_range_v1";

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
  const { range, preset, rangeLabel } = useDateRange();
  // Mirrors the exact lookups DateRangePicker.tsx performs -- this is the
  // "does the picker render a broken/blank state" assertion without
  // depending on the popover component's own module graph.
  const pillLabel = PRESET_LABELS[preset];
  return (
    <div>
      <span data-testid="preset">{preset}</span>
      <span data-testid="range">{range ? `${range.start}..${range.end}` : "null"}</span>
      <span data-testid="pill-label">{pillLabel ?? "UNDEFINED"}</span>
      <span data-testid="range-label">{rangeLabel}</span>
    </div>
  );
}

describe("DateRangeContext — unrecognized persisted preset values", () => {
  beforeEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("migrates a legacy '30d' preset (pre-unification) to '28d' instead of dropping the user's selection", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "acct:acct_test": {
          preset: "30d",
          customStart: null,
          customEnd: null,
          compare: false,
        },
      }),
    );

    render(
      <DateRangeProvider>
        <Probe />
      </DateRangeProvider>,
    );

    expect(screen.getByTestId("preset").textContent).toBe("28d");
    expect(screen.getByTestId("pill-label").textContent).toBe("Last 28 days");
    // 28 days ending at bounds.end, anchored to the end of the data window.
    expect(screen.getByTestId("range").textContent).toBe("2026-07-04..2026-07-31");

    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(persisted["acct:acct_test"].preset).toBe("28d");
  });

  it("does not crash and does not render a blank/broken state for a wholly unrecognized preset string", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "acct:acct_test": {
          preset: "does-not-exist",
          customStart: null,
          customEnd: null,
          compare: true,
        },
      }),
    );

    expect(() =>
      render(
        <DateRangeProvider>
          <Probe />
        </DateRangeProvider>,
      ),
    ).not.toThrow();

    // Falls back to DEFAULT_STATE for this scope only -- a real, labeled
    // preset and a real computed range, never an undefined pill label or a
    // null range.
    expect(screen.getByTestId("preset").textContent).toBe("all");
    expect(screen.getByTestId("pill-label").textContent).toBe(PRESET_LABELS.all);
    expect(screen.getByTestId("range").textContent).toBe(`${BOUNDS.start}..${BOUNDS.end}`);
    expect(screen.getByTestId("range-label").textContent).not.toBe("No data window");
  });

  it("drops a malformed persisted entry (non-object) for one scope without crashing", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "acct:acct_test": "not-an-object",
      }),
    );

    expect(() =>
      render(
        <DateRangeProvider>
          <Probe />
        </DateRangeProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId("preset").textContent).toBe("all");
    expect(screen.getByTestId("pill-label").textContent).toBe(PRESET_LABELS.all);
  });
});
