// ─── Ad Performance — canvas signal cards + concept tier table ────────
// The Nocturne analysis.performance composition: real data_quality flags
// render as severity-graded signal cards (fold at 4), and the concept
// rollup renders as an nc-table with the strategy map's scaling-playbook
// bucket as the tier tag. Honesty rules under test: anomalies read as
// "Investigate", rows the playbook doesn't name stay unclassified (C2
// never borrows a C2B entry), and accounts with no flags show no strip.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
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
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AdPerformanceView } from "../analysis/AdPerformanceView";

const SESSION_KEY = "metrix_active_account_v1";

function renderFor(adAccountId: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AdPerformanceView />
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
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("signal cards (data_quality flags)", () => {
  it("renders Bookster's real flags with severity grading and a fold at 4", () => {
    renderFor("bookster");
    const strip = screen.getByTestId("signal-cards");
    // Bookster's bundle carries 11 flags — 4 visible, the rest folded.
    expect(within(strip).getAllByText(/^(Investigate|Watch|Note)$/).length).toBe(4);
    // Anomalies grade as Investigate.
    expect(within(strip).getAllByText("Investigate").length).toBeGreaterThan(0);

    const more = screen.getByRole("button", { name: /show all 11 signals/i });
    fireEvent.click(more);
    expect(within(strip).getAllByText(/^(Investigate|Watch|Note)$/).length).toBe(11);
  });

  it("renders nothing for an account with no flags", () => {
    renderFor("manual_BwsYjC5ZRk0i"); // Gabri: rollup but zero data_quality flags
    expect(screen.queryByTestId("signal-cards")).toBeNull();
  });
});

describe("concept tier table (rollup × scaling playbook)", () => {
  it("classifies rows from the playbook and leaves unnamed concepts unclassified", () => {
    renderFor("bookster");
    const table = screen.getByTestId("concept-tier-table");
    const rows = within(table).getAllByRole("row").slice(1); // drop thead
    expect(rows).toHaveLength(9);

    const rowFor = (label: string) =>
      rows.find((r) => within(r).queryByText(label) != null)!;

    // BOOK0 C2 → scale_now; BOOK0 C1 → optimize; BOOK0 C3 → avoid.
    expect(within(rowFor("BOOK0 · C2")).getByText("Scale")).toBeTruthy();
    expect(within(rowFor("BOOK0 · C1")).getByText("Optimize")).toBeTruthy();
    expect(within(rowFor("BOOK0 · C3")).getByText("Avoid")).toBeTruthy();

    // BOOK2 C2 is NOT the playbook's "BOOK2 Concept C2B" — must stay
    // unclassified, never borrow the near-miss token.
    expect(within(rowFor("BOOK2 · C2")).getByText("unclassified")).toBeTruthy();

    // Zero-result row (BOOK0 C3) reads "no <results>" in the CPA column
    // rather than a fabricated number.
    expect(within(rowFor("BOOK0 · C3")).getByText(/^no /)).toBeTruthy();
  });

  it("renders every row unclassified when the account has no strategy playbook", () => {
    renderFor("manual_BwsYjC5ZRk0i"); // Gabri: 4 rollup rows, no strategy map
    const table = screen.getByTestId("concept-tier-table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(within(r).getByText("unclassified")).toBeTruthy();
    }
  });
});
