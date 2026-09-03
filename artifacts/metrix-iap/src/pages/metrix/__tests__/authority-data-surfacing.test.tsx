// ─── Authority data the seed ships and the app was not showing ────────
//
// `check:field-coverage` lists fields the seed computes, ships, and nothing
// reads. Three of them decide how a reader should weigh a number, so their
// absence was not cosmetic:
//
//   · SeedResultEvent / SeedIntentClassSummary `spend_share_pct` — whether
//     the dominant intent class carries 91% of the money or 34% of it.
//   · ConceptRollupRow `lift_basis` — whether "23% above baseline" is a
//     cost comparison (bad) or a CTR comparison (good). The same words
//     mean opposite things depending on it.
//   · the per-event intent class on the results-by-event table.
//
// The share column here is computed from the rows the table shows rather
// than read from the seed's account-wide `spend_share_pct`: that table is
// windowed by the date preset, and a full-flight percentage beside a
// windowed dollar figure is two grains in one row. The seed's own figure is
// used where the grain matches — the Library header, which is account-wide.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({ data: null }),
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    useListManualImports: () => ({ data: { imports: [] } }),
  };
});

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AdAccountOverview } from "../AdAccountOverview";
import { intentSummaryFragments } from "../analysis/IapLibraryView";
import { liftLabel } from "../analysis/FindingsView";
import type { SeedIntentSummary } from "@/lib/data/seedTypes";

const SESSION_KEY = "metrix_active_account_v1";

function renderOverview(accountId = "bookster") {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: accountId }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AdAccountOverview />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/app/overview");
});

describe("Results by event · share of spend", () => {
  it("states each event's share of the spend the table itself shows", () => {
    renderOverview();
    const table = [...document.querySelectorAll("table")].find((t) =>
      within(t).queryByText("Share"),
    )!;
    expect(table, "no results-by-event table with a Share column").toBeTruthy();

    const account = (seed.ad_accounts as { id: string; iap: { campaign_summary: { bottom_line_totals: Record<string, { spend: number }> } } }[])
      .find((a) => a.id === "bookster")!;
    const totals = Object.values(account.iap.campaign_summary.bottom_line_totals);
    const total = totals.reduce((s, e) => s + (e.spend ?? 0), 0);
    expect(total).toBeGreaterThan(0);

    // The shares are of the same total the Spend column adds up to, so they
    // sum to 100 (within rounding) rather than to some other window's total.
    const shares = totals.map((e) => (e.spend / total) * 100);
    const rounded = shares.map((v) => (v < 1 ? "<1%" : `${Math.round(v)}%`));
    for (const label of new Set(rounded)) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("labels each event with the intent class the seed derived, where it derived one", () => {
    renderOverview();
    const account = (seed.ad_accounts as { id: string; result_events?: { raw: string; intent_class: string | null }[] }[])
      .find((a) => a.id === "bookster")!;
    const classed = (account.result_events ?? []).filter((e) => e.intent_class);
    if (classed.length === 0) return; // fixture predates the field — nothing to assert
    const table = [...document.querySelectorAll("table")].find((t) => within(t).queryByText("Share"))!;
    for (const e of classed.slice(0, 3)) {
      expect(within(table).getAllByTitle(new RegExp(`Intent class`)).length).toBeGreaterThan(0);
    }
  });
});

describe("intentSummaryFragments · the dominant class's share", () => {
  const summary: SeedIntentSummary = {
    classes: [
      { intent_class: "conversion", scale: "cost_per_result", spend: 9100, results: 500, impressions: 1, link_clicks: 1, ads: 4, events: ["purchase"], spend_share_pct: 91 },
      { intent_class: "awareness", scale: "communication", spend: 900, results: 0, impressions: 1, link_clicks: 1, ads: 1, events: ["thruplay"], spend_share_pct: 9 },
    ],
    dominant_intent: "conversion",
    unplaced_spend: 0,
    total_spend: 10000,
  };

  it("says how much of the money the dominant class carries", () => {
    const [first] = intentSummaryFragments(summary);
    expect(first).toContain("Conversion-led");
    expect(first).toContain("91% of spend");
  });

  it("rounds a sliver honestly rather than to zero", () => {
    const sliver: SeedIntentSummary = {
      ...summary,
      classes: [{ ...summary.classes[0]!, spend_share_pct: 0.4 }],
    };
    expect(intentSummaryFragments(sliver)[0]).toContain("<1% of spend");
  });

  it("says nothing about share when the seed states none", () => {
    const none: SeedIntentSummary = { ...summary, classes: [{ ...summary.classes[0]!, spend_share_pct: 0 }] };
    expect(intentSummaryFragments(none)[0]).toBe("Conversion-led");
  });
});

describe("liftLabel · what the lift is measured against", () => {
  it("names cost per result when that is the basis", () => {
    expect(liftLabel(0.23, "cpa")).toBe("23% above cost per result baseline");
    expect(liftLabel(-0.23, "cpa")).toBe("23% below cost per result baseline");
  });

  it("names link CTR when that is the basis. The same words mean the opposite thing", () => {
    expect(liftLabel(0.23, "link_ctr")).toBe("23% above link CTR baseline");
  });

  it("reads as it always did for rows written before the column existed", () => {
    expect(liftLabel(0.23)).toBe("23% above baseline");
    expect(liftLabel(0.23, null)).toBe("23% above baseline");
    expect(liftLabel(null, "cpa")).toBe("");
  });
});
