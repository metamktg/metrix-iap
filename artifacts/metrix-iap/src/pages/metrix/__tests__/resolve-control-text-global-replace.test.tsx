// ─── resolveControlText — global replacement regression ──────────────
// Both AdAccountOverview and AdPerformanceView keep a local
// `resolveControlText(text, id)` helper that swaps a raw MST cell id for
// its human-readable concept name inside generated "control read" prose.
// A plain `text.replace(id, name)` only swaps the FIRST occurrence — if
// the same cell id is mentioned twice in one generated sentence, the
// rendered prose would show the human name once and then the raw code
// again later in the same sentence. This fixture forces that exact
// scenario (the id appears twice in `primary_control_read`) and asserts
// every occurrence gets substituted in both call sites.
//
// The synthetic id also embeds a literal "." (a regex-special character)
// to prove the fix never builds an unescaped regex from the id — it must
// keep working via a literal (split/join) replacement regardless of what
// characters a real cell id could contain.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Deep-clone so these mutations never leak into other test files reading
// the same on-disk fixture (each test file gets its own module instance
// of the JSON, but cloning is cheap insurance against import-order coupling).
const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");

const TEST_ID = "ID.1";
const TEST_NAME = "Test Concept";
const READ_WITH_ID = `${TEST_ID} drove growth and ${TEST_ID} keeps leading this quarter.`;
const READ_FULLY_RESOLVED = `${TEST_NAME} drove growth and ${TEST_NAME} keeps leading this quarter.`;

bookster.iap.core_reanalysis_read.primary_control = TEST_ID;
bookster.iap.core_reanalysis_read.primary_control_read = READ_WITH_ID;
bookster.mst.local_book2_library.push({ cell_id: TEST_ID, book2_concept_name: TEST_NAME });

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AdPerformanceView } from "../analysis/AdPerformanceView";
import { AdAccountOverview } from "../AdAccountOverview";

const SESSION_KEY = "metrix_active_account_v1";

function renderFor(View: React.ComponentType) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <View />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("resolveControlText replaces every occurrence of a repeated cell id", () => {
  it("AdPerformanceView: substitutes both mentions in the primary control read", () => {
    renderFor(AdPerformanceView);
    // The raw code still appears exactly once — the standalone "Code"
    // footer line — never inside the prose.
    expect(screen.getByText(READ_FULLY_RESOLVED)).toBeTruthy();
    expect(screen.queryByText(READ_WITH_ID)).toBeNull();
    expect(screen.queryByText((_, node) => node?.textContent === TEST_ID)).toBeTruthy();
  });

  it("AdAccountOverview: substitutes both mentions in the primary control read", () => {
    renderFor(AdAccountOverview);
    // AdAccountOverview surfaces the read via DetailReveal's always-visible
    // label (deriveLabel keeps the whole single-sentence clause here, minus
    // the trailing period it mechanically strips).
    const label = READ_FULLY_RESOLVED.replace(/\.$/, "");
    const staleLabel = READ_WITH_ID.replace(/\.$/, "");
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(staleLabel)).toBeNull();
  });
});
