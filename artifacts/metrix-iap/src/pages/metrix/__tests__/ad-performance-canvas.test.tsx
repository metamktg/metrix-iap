// ─── Ad Performance — canvas signal cards + concept tier table ────────
// The Nocturne analysis.performance composition: real data_quality flags
// render as tier-graded signal cards (Act now / Watch / Investigate,
// filterable, fold at 4) with an evidence disclosure and real actions
// (cross-link + Add to Tray), and the concept rollup renders as a
// sortable/filterable/expandable nc-table with the strategy map's
// scaling-playbook bucket as the tier tag, capped at 4 rows with a
// show-more fold. Honesty rules under test: anomalies grade as "Act now"
// (the only real tiering field a flag carries is `kind`), rows the
// playbook doesn't name stay unclassified (C2 never borrows a C2B entry),
// accounts with no flags show no strip, and a concept's deep-dive/
// variable-stack lookup never borrows another book's mapped cell.

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
  it("renders Bookster's real flags with tier grading and a fold at 4", () => {
    renderFor("bookster");
    const strip = screen.getByTestId("signal-cards");
    // Bookster's bundle carries 11 flags — 4 visible, the rest folded.
    expect(within(strip).getAllByText(/^(Act now|Watch|Investigate)$/).length).toBe(4);
    // Anomalies grade as Act now.
    expect(within(strip).getAllByText("Act now").length).toBeGreaterThan(0);

    const more = screen.getByRole("button", { name: /show all 11 signals/i });
    fireEvent.click(more);
    expect(within(strip).getAllByText(/^(Act now|Watch|Investigate)$/).length).toBe(11);
  });

  it("filters signals by tier via the chip row, with real counts", () => {
    renderFor("bookster");
    const strip = screen.getByTestId("signal-cards");
    // Bookster: 5 anomaly (Act now), 4 quality_flag (Watch), 2 other (Investigate).
    fireEvent.click(screen.getByRole("button", { name: /^Act now/ }));
    expect(screen.getByRole("button", { name: /show all 5 signals/i })).toBeTruthy();
    expect(within(strip).getAllByText("Act now").length).toBe(4); // fold still caps at 4

    fireEvent.click(screen.getByRole("button", { name: /^Watch/ }));
    expect(within(strip).getAllByText("Watch").length).toBe(4);
    expect(screen.queryByRole("button", { name: /show all \d+ signals/i })).toBeNull();
  });

  it("renders nothing for an account with no flags", () => {
    renderFor("manual_BwsYjC5ZRk0i"); // Gabri: rollup but zero data_quality flags
    expect(screen.queryByTestId("signal-cards")).toBeNull();
  });

  it("shows an evidence disclosure and a real cross-link action per card, never a decorative no-op button", () => {
    renderFor("bookster");
    const strip = screen.getByTestId("signal-cards");
    const evidenceButtons = within(strip).getAllByRole("button", { name: "Show evidence" });
    expect(evidenceButtons.length).toBeGreaterThan(0);
    fireEvent.click(evidenceButtons[0]!);
    // The evidence popover always carries at least a "Kind" row.
    expect(screen.getAllByText("Kind").length).toBeGreaterThan(0);

    // Every card gets a real, working navigation action — not a fabricated
    // "Verify tracking" button with no handler.
    const reviewButtons = within(strip).getAllByRole("button", { name: "Review in Listen" });
    expect(reviewButtons.length).toBe(4);
  });
});

describe("concept tier table (rollup × scaling playbook)", () => {
  it("caps at 4 rows and folds the rest behind a show-more control", () => {
    renderFor("bookster");
    const table = screen.getByTestId("concept-tier-table");
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /show all 9 concepts/i }));
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(9);
  });

  it("classifies rows from the playbook and leaves unnamed concepts unclassified", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("button", { name: /show all 9 concepts/i }));
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

  it("filters by tier via the chip row, with real counts", () => {
    renderFor("bookster");
    const table = screen.getByTestId("concept-tier-table");
    fireEvent.click(screen.getByRole("button", { name: /^Avoid/ }));
    const rows = within(table).getAllByRole("row").slice(1);
    // Only BOOK0 C3 matches the "avoid" bucket in Bookster's playbook.
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("BOOK0 · C3")).toBeTruthy();
  });

  it("sorts by the selected metric via the sort control", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("button", { name: /show all 9 concepts/i }));
    const table = screen.getByTestId("concept-tier-table");
    // Default sort is Spend desc — BOOK2 · C2 (highest spend) leads.
    let rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("BOOK2 · C2")).toBeTruthy();

    // Switch to CPA (cheapest first) via the sort popover.
    fireEvent.click(screen.getByRole("button", { name: /sort by/i }));
    fireEvent.click(screen.getByTestId("rank-metric-cpa"));
    rows = within(table).getAllByRole("row").slice(1);
    // BOOK0 · C2 has the lowest CPA ($7.09) among rows with a real CPA.
    expect(within(rows[0]!).getByText("BOOK0 · C2")).toBeTruthy();
  });

  it("expands a row to reveal the real matched playbook entry as Recommended next", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("button", { name: /show all 9 concepts/i }));
    const table = screen.getByTestId("concept-tier-table");
    const rows = within(table).getAllByRole("row").slice(1);
    // BOOK0 · C2 matches the playbook's "BOOK0 Concept C2 (esp. Row B)" —
    // the literal matched entry is shown, never paraphrased.
    const book0C2 = rows.find((r) => within(r).queryByText("BOOK0 · C2") != null)!;
    fireEvent.click(book0C2);
    expect(screen.getByText("Recommended next")).toBeTruthy();
    expect(screen.getByText(/BOOK0 Concept C2 \(esp\. Row B\)/)).toBeTruthy();
  });

  it("shows a scoped creative deep-dive link and variable stack only for the book that actually maps the concept", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("button", { name: /show all 9 concepts/i }));
    const table = screen.getByTestId("concept-tier-table");
    const rows = within(table).getAllByRole("row").slice(1);

    // BOOK2 · C2 owns real mapped cells (C2B/C2E/C2F/C2G) in the local
    // library — deep-dive link and variable stack both render.
    const book2C2 = rows.find((r) => within(r).queryByText("BOOK2 · C2") != null)!;
    fireEvent.click(book2C2);
    expect(screen.getByRole("button", { name: "Open creative deep dive" })).toBeTruthy();
    expect(screen.getByText(/Variable stack/)).toBeTruthy();
    fireEvent.click(book2C2); // collapse before inspecting the next row

    // BOOK0 · C2 shares the same bare concept code, but the library's
    // cells are Book 2's — BOOK0 must not borrow them.
    const book0C2 = rows.find((r) => within(r).queryByText("BOOK0 · C2") != null)!;
    fireEvent.click(book0C2);
    expect(screen.queryByRole("button", { name: "Open creative deep dive" })).toBeNull();
    expect(screen.getByText(/No mapped creative cell for this concept yet/)).toBeTruthy();
  });
});

describe("buyer-intent funnel (cohort-aware)", () => {
  it("shows real ecommerce lower-funnel stages for an ecommerce-cohort account", () => {
    renderFor("ecas"); // objectives: ["ecommerce"], real atc=122 / checkout=2 / purchases=4
    const funnel = screen.getByTestId("buyer-intent-funnel");
    expect(within(funnel).getByText("Add to cart")).toBeTruthy();
    expect(within(funnel).getByText("Checkout")).toBeTruthy();
    expect(within(funnel).getByText("Purchase")).toBeTruthy();
  });

  it("drops ecommerce-only stages for a non-ecommerce cohort instead of showing fake zero bars", () => {
    renderFor("bookster"); // objectives: ["app"]
    const funnel = screen.getByTestId("buyer-intent-funnel");
    expect(within(funnel).queryByText("Add to cart")).toBeNull();
    expect(within(funnel).queryByText("Checkout")).toBeNull();
    expect(within(funnel).queryByText("Purchase")).toBeNull();
    // Upstream stages with real data still render.
    expect(within(funnel).getByText("Impressions")).toBeTruthy();
    expect(within(funnel).getByText("Link clicks")).toBeTruthy();
    // The cohort-mismatch caveat names the account's real terminal metric.
    expect(screen.getByText(/cost per activation/i)).toBeTruthy();
  });
});

describe("what moved cost per result", () => {
  it("shows a real prior/current comparison or an honest empty state, never a fabricated per-factor waterfall", () => {
    renderFor("bookster");
    expect(screen.getByText("What moved cost per result")).toBeTruthy();
    // No live analysis-summary fetch is mocked in this test — the card must
    // fall back to an honest empty state rather than crash or show fake bars.
    expect(
      screen.getByText(/Not enough prior-period data|Loading prior-period comparison/i)
    ).toBeTruthy();
    expect(screen.getByText(/Full per-factor attribution isn't available yet/i)).toBeTruthy();
    expect(screen.queryByText(/audience mix|creative refresh|placement shift|bid strategy/i)).toBeNull();
  });
});
