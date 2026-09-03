// ─── MST Sprints — canvas matrix composition ───────────────────────────
// The Nocturne mst screen: status strip (Active tag · window · cells
// mapped), column heads carrying the matrix book's real rollup CPA,
// cell cards tagged with the scaling-playbook tier, and the top-
// performing-concepts table. Honesty rules under test: the matrix book
// is chosen only when one rollup book strictly dominates the column
// ids, performance overlays come from concept_rollup only (no per-cell
// invention), and zero-conversion columns read "no conv.".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, within, screen, fireEvent } from "@testing-library/react";
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
import { MstSprintsView, matrixBookFor } from "../mst/MstSprintsView";
import type { ConceptRollupRow } from "@/lib/data/seedTypes";

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
            <MstSprintsView />
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

const rollupRow = (book: string, concept: string): ConceptRollupRow => ({
  book, concept, date_start: "2026-05-01", date_end: "2026-06-30",
  spend: 100, link_clicks: 10, results: 5, cpa: 20, cvr_link_pct: 5, confidence: "medium",
  mapped_in_library: true,
});

describe("matrixBookFor", () => {
  const cols = ["C1", "C2", "C3", "C4"];

  it("picks the book that strictly dominates the column ids", () => {
    const rollup = [
      rollupRow("BOOK0", "C1"), rollupRow("BOOK0", "C2"), rollupRow("BOOK0", "C3"),
      rollupRow("BOOK2", "C2"),
    ];
    expect(matrixBookFor(rollup, cols)).toBe("BOOK0");
  });

  it("returns null on a tie or no match. Never guesses", () => {
    expect(matrixBookFor([rollupRow("BOOK0", "C1"), rollupRow("BOOK2", "C2")], cols)).toBeNull();
    expect(matrixBookFor([rollupRow("BOOK0", "C9")], cols)).toBeNull();
    expect(matrixBookFor([], cols)).toBeNull();
  });
});

describe("MST sprints canvas composition (Bookster)", () => {
  it("renders the status strip with the matrix book, window, and cells mapped", () => {
    renderFor("bookster");
    const strip = screen.getByTestId("mst-status-strip");
    expect(within(strip).getByText("Active")).toBeTruthy();
    expect(within(strip).getByText(/Historical matrix · BOOK0/)).toBeTruthy();
    expect(within(strip).getByText("Cells mapped")).toBeTruthy();
    expect(within(strip).getByText("16 / 16")).toBeTruthy();
  });

  it("overlays real rollup CPA on column heads, with 'no conv.' for zero-result concepts", () => {
    renderFor("bookster");
    // BOOK0 C1 converts (CPA $12.26) — C3 spent real money with zero
    // conversions and must read "no conv.", never a fabricated CPA.
    expect(screen.getByTestId("matrix-col-perf-C1").textContent).toMatch(/\$12\.26/);
    expect(screen.getByTestId("matrix-col-perf-C3").textContent).toBe("no conv.");
  });

  it("tags cells with the scaling-playbook tier at concept level", () => {
    renderFor("bookster");
    // Column C2 is BOOK0's scale_now concept — its cells carry "Scale";
    // C3 is in avoid_combinations — its cells carry "Avoid".
    expect(within(screen.getByTestId("matrix-cell-C2A")).getByText("Scale")).toBeTruthy();
    expect(within(screen.getByTestId("matrix-cell-C3A")).getByText("Avoid")).toBeTruthy();
  });

  it("renders the top-performing-concepts table ranked cheapest-first", () => {
    renderFor("bookster");
    const table = screen.getByTestId("mst-top-concepts");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    // First row is BOOK0's cheapest measured concept: C2 at $7.09.
    expect(rows[0]!.textContent).toContain("BOOK0 · C2");
    expect(rows[0]!.textContent).toContain("$7.09");
  });

  it("selecting a scaling tier dims non-matching cells without removing them from the DOM", () => {
    renderFor("bookster");
    // BOOK0: C2 is scale_now, C1/C4 are optimize, C3 is avoid_combinations.
    fireEvent.click(screen.getByRole("button", { name: "Scale" }));

    const scaleCell = screen.getByTestId("matrix-cell-C2A");
    const optimizeCell = screen.getByTestId("matrix-cell-C1A");
    const avoidCell = screen.getByTestId("matrix-cell-C3A");

    // The matching tier's cells stay fully visible...
    expect(scaleCell.className).not.toMatch(/opacity-30/);
    // ...while non-matching tiers dim (visual only)...
    expect(optimizeCell.className).toMatch(/opacity-30/);
    expect(avoidCell.className).toMatch(/opacity-30/);
    // ...but every cell — dimmed or not — stays in the DOM with its real
    // tier tag and cell id intact. Dimming is a visual filter, never a
    // real one: all 16 cells remain queryable regardless of tier.
    expect(within(optimizeCell).getByText("Optimize")).toBeTruthy();
    expect(within(avoidCell).getByText("Avoid")).toBeTruthy();
    expect(within(scaleCell).getByText("Scale")).toBeTruthy();
    expect(screen.getAllByTestId(/^matrix-cell-C\d[A-D]$/)).toHaveLength(16);

    // Switching tiers changes which column is undimmed.
    fireEvent.click(screen.getByRole("button", { name: "Avoid" }));
    expect(screen.getByTestId("matrix-cell-C3A").className).not.toMatch(/opacity-30/);
    expect(screen.getByTestId("matrix-cell-C2A").className).toMatch(/opacity-30/);

    // "All" clears dimming entirely.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByTestId("matrix-cell-C1A").className).not.toMatch(/opacity-30/);
    expect(screen.getByTestId("matrix-cell-C3A").className).not.toMatch(/opacity-30/);
  });
});

// ─── Result scope is visible, and rows land where their data is ───────────

describe("MstSprintsView · result scope", () => {
  it("renders the scope bar (the page scoped its rollup silently before)", () => {
    renderFor("bookster");
    expect(screen.getByTestId("result-scope-bar")).toBeTruthy();
    expect(screen.queryByTestId("result-scope-landed")).toBeNull();
  });

  it("lands on the event the rollup carries when the account default would empty it, and says so", () => {
    // Bookster's default scope is the terminal-conversion blend; a rollup
    // stamped with an intermediate event (checkout initiated) has nothing
    // under that blend. Before landRows the matrix rendered with no CPA
    // overlay and no explanation; now it lands on the event and names it.
    const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
    const rollup = bookster.iap.analysis.concept_rollup as Array<{ result_type?: string | null }>;
    const saved = rollup.map((r) => r.result_type);
    for (const r of rollup) r.result_type = "onb_initiate_checkout";
    try {
      renderFor("bookster");
      const note = screen.getByTestId("result-scope-landed");
      expect(note.getAttribute("title")).toContain("Sprints landed on");
      expect(note.textContent).toContain("Landed on");
      expect(within(note).getByTestId("result-scope-tag").textContent).toContain("Checkout");
    } finally {
      rollup.forEach((r, i) => { r.result_type = saved[i]; });
    }
  });
});
