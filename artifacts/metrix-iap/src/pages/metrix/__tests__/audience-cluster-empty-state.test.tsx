// ─── An empty state is a claim about the data ─────────────────────────
//
// Cluster mode is built from CPA and CVR, and both need results. An
// account that is spending but has not converted yet therefore has NO
// clusterable segments, and all three cluster cards come back empty.
//
// They used to say "No spend to allocate." That is not merely unhelpful,
// it is the opposite of true: the spend is real, the segments are real,
// and the same account renders them immediately in Age view. A user
// reading it would reasonably conclude their account had no spend.
//
// Same honesty-invariant class as the rest of this sweep — a surface
// asserting something the data does not say.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
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

// An account that spends but has not converted: every demographic row
// carries real spend and zero results. This is the exact shape that
// produced the false empty state.
const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const demoRows: Array<Record<string, unknown>> = bookster.iap.analysis.demographic_registration_signal ?? [];
if (demoRows.length === 0) throw new Error("fixture has no demographic rows to exercise this state");
for (const r of demoRows) {
  r["Amount spent (USD)"] = 250;
  r.Results = 0;
  r.CPA_result = null;
  r.Result_per_link_click_pct = 0;
}

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: [] }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AudienceView } from "../analysis/AudienceView";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderAudience() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AudienceView />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Put the view into Cluster mode.
 *
 * Throws rather than returning false: a test that quietly skips when it
 * cannot reach the state it exists to check is a test that passes forever
 * while the bug comes back.
 */
function selectClusterMode() {
  const control = screen.queryAllByText(/cluster/i).find((el) => el.closest("button"));
  if (!control) throw new Error("Cluster mode control not found — this test can no longer reach the state it covers");
  fireEvent.click(control.closest("button")!);
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("AudienceView — cluster empty state tells the truth", () => {
  it("never claims there is no spend when spend exists", () => {
    renderAudience();
    selectClusterMode();
    // The precise falsehood that was on screen.
    expect(screen.queryByText("No spend to allocate.")).toBeNull();
  });

  it("names results, not spend, as the missing ingredient", () => {
    renderAudience();
    selectClusterMode();
    const body = document.body.textContent ?? "";
    expect(body).toContain("Clusters are built from");
    expect(body).toContain("need results");
  });

  it("says the spend itself is real, since that is what the old copy denied", () => {
    renderAudience();
    selectClusterMode();
    expect(document.body.textContent ?? "").toContain("the spend itself is real");
  });

  it("offers the view that does work, and switching to it renders groups", () => {
    renderAudience();
    selectClusterMode();
    const button = screen.getAllByText("Switch to Age view")[0]!;
    fireEvent.click(button);
    // Age grouping does not depend on a rate metric, so the same segments
    // group fine — which is precisely why the cluster copy was misleading.
    expect(screen.queryAllByText("Switch to Age view")).toHaveLength(0);
  });
});
