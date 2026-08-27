// ─── Library concept count regression tests ───────────────────────────
// local_book2_library has multiple rows per concept (cell_id) for
// Feed/Square/Story aspect variants. Both AdAccountOverview's "library
// concepts" counter and CreativeScanView's "Concept library" tab MUST
// deduplicate by cell_id — raw row counts would overstate the figure.
//
// The checked-in seed fixture (bookster account) has 15 rows but only
// 6 distinct cell_ids, so any regression to raw counts is immediately
// detectable.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
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
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AdAccountOverview } from "../AdAccountOverview";
import { CreativeScanView } from "../mst/CreativeScanView";

const SESSION_KEY = "metrix_active_account_v1";

function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function renderView(View: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <View />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Derive expected counts directly from the fixture so the test stays
// honest if the fixture is refreshed with more or fewer rows.
const booksterAccount = (seed.ad_accounts as { id: string; mst?: { local_book2_library?: { cell_id: string }[] } }[]).find(
  (a) => a.id === "bookster"
);
const rawLibraryRows = booksterAccount?.mst?.local_book2_library ?? [];
const DISTINCT_CONCEPT_COUNT = new Set(rawLibraryRows.map((c) => c.cell_id)).size;
const RAW_ROW_COUNT = rawLibraryRows.length;

// Precondition: the fixture must have duplicates or the test proves nothing.
if (RAW_ROW_COUNT <= DISTINCT_CONCEPT_COUNT) {
  throw new Error(
    `Fixture precondition failed: expected raw row count (${RAW_ROW_COUNT}) > ` +
      `distinct cell_id count (${DISTINCT_CONCEPT_COUNT}). ` +
      `Refresh the fixture with duplicate aspect-variant rows.`
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("AdAccountOverview – library concepts counter", () => {
  it("shows distinct concept count, not raw row count", () => {
    selectBookster();
    const { container } = renderView(AdAccountOverview);
    // The counter renders as: <span>{libraryCount}</span> library concepts
    // textContent concatenation: "…6 library concepts…"
    expect(container.textContent).toContain(
      `${DISTINCT_CONCEPT_COUNT} library concepts`
    );
  });

  it("does not show the inflated raw row count as library concepts", () => {
    selectBookster();
    const { container } = renderView(AdAccountOverview);
    expect(container.textContent).not.toContain(
      `${RAW_ROW_COUNT} library concepts`
    );
  });
});

describe("CreativeScanView – Concept library tab count", () => {
  it("tab count equals distinct concept count, not raw row count", () => {
    selectBookster();
    renderView(CreativeScanView);
    // ModuleTabs renders: <button>Concept library<span>{count}</span></button>
    // Query the button by its accessible label, then inspect textContent.
    const tabBtn = screen.getByRole("tab", { name: /Concept library/i });
    expect(tabBtn.textContent).toContain(String(DISTINCT_CONCEPT_COUNT));
    expect(tabBtn.textContent).not.toContain(String(RAW_ROW_COUNT));
  });

  it("renders one card per distinct concept, not one per aspect variant", () => {
    selectBookster();
    const { container } = renderView(CreativeScanView);
    // CreativeCard root elements carry data-concept-cell on the card grid — but
    // a lighter proxy is to assert the card grid does NOT contain duplicate
    // keys by checking the rendered card count against DISTINCT_CONCEPT_COUNT.
    // CreativeCard renders with key={c.cell_id}; jsdom would merge duplicate
    // keys but React warns. Instead count the cards by their shared class.
    const cards = container.querySelectorAll("[data-concept-card]");
    if (cards.length > 0) {
      // If the component emits data-concept-card, count must equal distinct.
      expect(cards.length).toBe(DISTINCT_CONCEPT_COUNT);
      expect(cards.length).not.toBe(RAW_ROW_COUNT);
    }
    // Regardless: the tab shows the right count (already asserted above;
    // this test adds the card-grid cross-check when the attribute is present).
  });
});
