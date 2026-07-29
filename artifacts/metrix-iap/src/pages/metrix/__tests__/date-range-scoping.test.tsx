// ─── Date-range scoping regression tests ──────────────────────────────
// Renders range-scoped views with the global date filter set to "all"
// vs a narrow custom window and asserts the module data actually changes:
//   - cells whose concept flight misses the range disappear
//   - aggregate tiles shrink
//   - MST views show the MST-specific no-data state when the range
//     misses the MST window entirely
// Uses the real seed bundle fixture so assertions track production data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { getConceptWindows } from "@/lib/date-scope";
import { IapLibraryView } from "../analysis/IapLibraryView";
import { AdPerformanceView } from "../analysis/AdPerformanceView";
import { ConceptMapView } from "../mst/ConceptMapView";
import { CrossmapResultsView } from "../mst/CrossmapResultsView";
import { MstSprintsView } from "../mst/MstSprintsView";
import { CreativeLibraryView } from "../creative/CreativeLibraryView";

const ACCOUNT_KEY = "metrix_active_account_v1";
const RANGE_KEY = "metrix_date_range_v1";

const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const analysis = bookster.iap.analysis;

// Sanity-check the fixture shape these tests depend on: C4's flight ends
// before C2's, so a range in the final week only overlaps C2.
const windows = getConceptWindows(analysis);
const c2 = windows.get("C2")!;
const c4 = windows.get("C4")!;
const LATE_RANGE = { start: "2026-07-01", end: "2026-07-07" };

function selectBookster() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
}

function setRange(state: null | { customStart: string; customEnd: string }) {
  if (!state) {
    sessionStorage.removeItem(RANGE_KEY);
    return;
  }
  sessionStorage.setItem(
    RANGE_KEY,
    JSON.stringify({
      "acct:bookster": {
        preset: "custom",
        customStart: state.customStart,
        customEnd: state.customEnd,
        compare: false,
      },
    })
  );
}

function renderView(View: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <DateRangeProvider>
          <View />
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("fixture sanity", () => {
  it("C4's flight ends before the late range; C2 overlaps it", () => {
    expect(c4.end < LATE_RANGE.start).toBe(true);
    expect(c2.end >= LATE_RANGE.start).toBe(true);
  });
});

describe("IAP Library respects the date range", () => {
  it("shows C4E on 'all' but drops it in the late range", () => {
    selectBookster();
    setRange(null);
    const all = renderView(IapLibraryView);
    expect(all.container.textContent).toContain("C4E");
    expect(all.container.textContent).toContain("C2B");
    cleanup();

    selectBookster();
    setRange({ customStart: LATE_RANGE.start, customEnd: LATE_RANGE.end });
    const narrowed = renderView(IapLibraryView);
    expect(narrowed.container.textContent).not.toContain("C4E");
    expect(narrowed.container.textContent).toContain("C2B");
  });
});

describe("Ad Performance tiles respect the date range", () => {
  const spendOf = (text: string | null) => {
    // Extract the first $ amount following the spend tile label.
    const m = /(?:Total spend|Spend \(in range\))\$([\d,]+)/.exec(text ?? "");
    return m ? Number(m[1].replaceAll(",", "")) : null;
  };

  it("in-range spend is lower than all-time spend", () => {
    selectBookster();
    setRange(null);
    const all = renderView(AdPerformanceView);
    const allSpend = spendOf(all.container.textContent);
    expect(allSpend).not.toBeNull();
    cleanup();

    selectBookster();
    setRange({ customStart: LATE_RANGE.start, customEnd: LATE_RANGE.end });
    const narrowed = renderView(AdPerformanceView);
    expect(narrowed.container.textContent).toContain("Spend (in range)");
    const narrowedSpend = spendOf(narrowed.container.textContent);
    expect(narrowedSpend).not.toBeNull();
    expect(narrowedSpend!).toBeLessThan(allSpend!);
  });
});

describe("Concept Map respects the date range", () => {
  it("drops concepts whose flights miss the range", () => {
    selectBookster();
    setRange(null);
    const all = renderView(ConceptMapView);
    const allText = all.container.textContent ?? "";
    expect(allText).toContain("C4E");
    cleanup();

    selectBookster();
    setRange({ customStart: LATE_RANGE.start, customEnd: LATE_RANGE.end });
    const narrowed = renderView(ConceptMapView);
    expect(narrowed.container.textContent).not.toContain("C4E");
  });
});

describe("Crossmap Results respects the date range", () => {
  // In this fixture only C2B joins matrix ↔ performance rows, and C2's
  // flight spans the whole window — so a late range keeps the join
  // intact while the MST gate handles ranges that miss the window
  // entirely (covered below).
  it("keeps in-range cell joins when the range overlaps the MST window", () => {
    selectBookster();
    setRange({ customStart: LATE_RANGE.start, customEnd: LATE_RANGE.end });
    const { container } = renderView(CrossmapResultsView);
    const text = container.textContent ?? "";
    expect(text).toContain("Planned cells");
    expect(text).toContain("C2B");
    // Joined spend matches the all-time render because the only joined
    // cell (C2B) is still in range — no data is fabricated or dropped.
    const spendNarrow = /Crossmapped spend\$([\d,]+)/.exec(text)?.[1];
    cleanup();
    selectBookster();
    setRange(null);
    const allText = renderView(CrossmapResultsView).container.textContent ?? "";
    const spendAll = /Crossmapped spend\$([\d,]+)/.exec(allText)?.[1];
    expect(spendNarrow).toBeDefined();
    expect(spendNarrow).toBe(spendAll);
  });
});

describe("MST-specific no-data-in-range state", () => {
  // A range strictly before every concept flight: outside the MST window
  // but chosen inside the account bounds so rangeHasData stays true only
  // if account bounds start earlier; either way the MST gate must fire.
  const BEFORE_MST = { start: "2026-04-01", end: "2026-04-05" };

  for (const [name, View] of [
    ["Matrix Builder", MstSprintsView],
    ["Creative Library", CreativeLibraryView],
    ["Crossmap Results", CrossmapResultsView],
  ] as [string, React.ComponentType][]) {
    it(`${name} explains the MST window when the range misses it`, () => {
      selectBookster();
      setRange({ customStart: BEFORE_MST.start, customEnd: BEFORE_MST.end });
      const { container } = renderView(View);
      const text = container.textContent ?? "";
      // Never fabricate: no metric tiles or matrix content…
      expect(text).not.toContain("C4E");
      // …and the empty state names the MST window or no-data state.
      expect(/MST data window|No .* in this date range|no data in range/i.test(text)).toBe(true);
    });
  }
});
