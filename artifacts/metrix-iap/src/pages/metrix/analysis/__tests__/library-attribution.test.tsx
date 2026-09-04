// ─── IAP Library: attribution and evidence ────────────────────────────
//
// The Library's subject is which SUBJECTIVE variable carries an OBJECTIVE
// number. Three gaps in the carry-forward register said it could not answer
// that, and this file is the guard on each of them:
//
//   L-4  A metric tile drilled into avatar × placement and nothing else, so
//        a tile could say who saw a thing and never which variable carried
//        it. The tile now opens the full breakdown, whose dimensions include
//        one per variable family (`var:<family>`).
//   L-5  The drawer's variable stack rendered bare codes. Each chip now
//        carries what that variable cost under the active scope — read off
//        v3_variable_performance, run-scoped, never recomputed from cells.
//   L-11 The reconciliation ledger was reachable only from the run controls,
//        which are admin-only. The Library states its control and opens the
//        ledger for anyone who can read the numbers.
//
// Plus L-15: the Variables tab can be narrowed to a family, and the family
// cards and the table narrow TOGETHER — a rollup that disagrees with the
// rows beneath it is worse than no filter at all.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json",
    ),
    "utf-8",
  )
);

type VarRow = { variable_family: string; variable_id: string; "Result type": string; Results: number };
const bookster = (seed.ad_accounts as Record<string, unknown>[]).find((a) => a.id === "bookster") as {
  iap: { analysis: { v3_variable_performance: VarRow[]; performance_by_cell: Record<string, unknown>[]; reconciliation?: unknown } };
};
const analysis = bookster.iap.analysis;
const FAMILIES = [...new Set(analysis.v3_variable_performance.map((r) => r.variable_family))].sort();

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSyncCreativeLinks: () => ({ mutateAsync: vi.fn(), isPending: false }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getAuthMeQueryKey: () => ["auth", "me"],
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { IapLibraryView } from "../IapLibraryView";
import { VARIABLE_FAMILIES } from "@/lib/variable-registry";

const ACCOUNT_KEY = "metrix_active_account_v1";
const familyLabelOf = (family: string): string =>
  VARIABLE_FAMILIES.find((f) => f.key === family || f.aliases.includes(family))?.label ?? family;

function renderLibrary(url = "/app/analysis/library") {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  window.history.replaceState({}, "", url);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountProvider>
        <DateRangeProvider>
          <AnalysisViewProvider>
            <IapLibraryView />
          </AnalysisViewProvider>
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

async function toVariablesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /variable performance/i }));
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/app/analysis/library");
});

// ─── L-15: narrow to a family, cards and rows together ─────────────────

describe("Variables tab · variable-family filter", () => {
  it("offers every family the rows in scope carry, and no family they do not", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await toVariablesTab(user);

    await user.click(screen.getByRole("button", { name: /variable family/i }));
    for (const f of FAMILIES) expect(screen.getByTestId(`family-filter-${f}`)).toBeTruthy();
    // A filter can only offer what the data has: no control for a family
    // absent from this account's rows.
    expect(screen.queryByTestId("family-filter-awareness")).toBeNull();
  });

  it("narrows the family cards and the variable table together, and says what it is doing", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await toVariablesTab(user);

    const before = screen.getAllByTestId(/^dna-family-/).length;
    expect(before).toBe(FAMILIES.length);

    await user.click(screen.getByRole("button", { name: /variable family/i }));
    await user.click(screen.getByTestId("family-filter-hook"));

    // One card, and it is the one asked for.
    const cards = screen.getAllByTestId(/^dna-family-/);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.getAttribute("data-testid")).toBe("dna-family-hook");

    // The table under it carries hook rows only — the rollup and the rows
    // can never disagree.
    const hookIds = new Set(
      analysis.v3_variable_performance.filter((r) => r.variable_family === "hook").map((r) => r.variable_id),
    );
    const nonHookIds = analysis.v3_variable_performance
      .filter((r) => r.variable_family !== "hook")
      .map((r) => r.variable_id)
      .filter((id) => !hookIds.has(id));
    const tables = [...document.querySelectorAll("table")];
    const table = tables[tables.length - 1]!;
    for (const id of nonHookIds.slice(0, 8)) {
      expect(within(table).queryByText(id), `${id} is not a hook variable`).toBeNull();
    }

    // A collapsed filter that cannot say what it is doing would be a lie
    // about the data: the active family and the count stay on screen.
    const filter = screen.getByTestId("variable-family-filter");
    expect(within(filter).getAllByText(familyLabelOf("hook")).length).toBeGreaterThan(0);
    expect(within(filter).getByText(/of \d+ variables/)).toBeTruthy();
  });

  it("clears back to every family", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await toVariablesTab(user);

    await user.click(screen.getByRole("button", { name: /variable family/i }));
    await user.click(screen.getByTestId("family-filter-hook"));
    expect(screen.getAllByTestId(/^dna-family-/)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getAllByTestId(/^dna-family-/)).toHaveLength(FAMILIES.length);
  });
});

// ─── L-4: a tile drills into variables, not only into people ───────────

describe("Metric tiles · breakdown by variable family", () => {
  it("opens the full breakdown, whose dimensions include one per variable family", async () => {
    const user = userEvent.setup();
    renderLibrary();

    // Any tile: they all open the same drill-down.
    const tile = screen.getAllByTestId("metric-tile")[0]!;
    // The tile says what it opens — it used to promise only segments.
    expect(tile.textContent).toContain("Full breakdown");
    await user.click(tile);

    expect(screen.getByTestId("kpi-drilldown-modal")).toBeTruthy();
    const breakdown = screen.getByLabelText("Breakdown") as HTMLSelectElement;
    const optionValues = [...breakdown.options].map((o) => o.value);
    // The Library's own subject is offered, not just the audience's.
    for (const f of FAMILIES) expect(optionValues).toContain(`var:${f}`);
    expect(optionValues).toContain("concept");
  });

  it("shows real variable rows once a family dimension is selected", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getAllByTestId("metric-tile")[0]!);

    const breakdown = screen.getByLabelText("Breakdown") as HTMLSelectElement;
    await user.selectOptions(breakdown, "var:hook");
    // Table view carries the rows; the chart view is the default, so switch.
    await user.click(screen.getByRole("button", { name: /table/i }));
    const hookIds = analysis.v3_variable_performance
      .filter((r) => r.variable_family === "hook")
      .map((r) => r.variable_id);
    const modal = screen.getByTestId("kpi-drilldown-modal");
    const found = hookIds.some((id) => within(modal).queryAllByText(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length > 0);
    expect(found, "no hook variable id rendered in the breakdown").toBe(true);
  });
});

// ─── L-5: a chip says what the variable cost ───────────────────────────

describe("Cell drawer · per-variable cost on the stack", () => {
  it("annotates chips with what that variable cost under the active scope", async () => {
    // Deep-link straight to a cell: ?focus= opens its drawer on arrival.
    const cell = analysis.performance_by_cell.find((r) => typeof r.hook_variable === "string" && r.hook_variable) as
      | { cell_id: string; hook_variable: string }
      | undefined;
    expect(cell, "fixture has no cell carrying a hook variable").toBeTruthy();
    renderLibrary(`/app/analysis/library?focus=${cell!.cell_id}`);

    const chip = await screen.findByTestId(`chip-drawer-variable-${cell!.hook_variable}`);
    expect(chip).toBeTruthy();

    // At least one chip in the stack carries its cost, and every annotation
    // sits inside a chip button — never floating on its own.
    const costs = screen.getAllByTestId(/^chip-drawer-cost-/);
    expect(costs.length).toBeGreaterThan(0);
    for (const c of costs) {
      expect(c.closest("button")?.getAttribute("data-testid")).toMatch(/^chip-drawer-variable-/);
      // Either a cost per result or a result count — never a fabricated $0.
      expect(c.textContent).toMatch(/^\$[\d,.]+ per result$|^[\d,]+ results$/);
    }
  });
});

// ─── L-11: the control behind the numbers, on the surface that shows them ─

describe("Library evidence chip", () => {
  it("names the reconciliation control and opens the ledger", async () => {
    const user = userEvent.setup();
    analysis.reconciliation = {
      summary: { truth_source: "ad_summary", truth_identity_kind: "ad_id", breakdowns: [], notes: [] },
      ledger: [],
    };
    try {
      renderLibrary();
      const chip = screen.getByTestId("library-coverage-chip");
      expect(chip.textContent).toContain("Ad Summary control");
      await user.click(chip);
      expect(screen.getByText(/What these numbers are reconciled against/i)).toBeTruthy();
    } finally {
      delete analysis.reconciliation;
    }
  });

  it("renders no chip when the account has no reconciliation. Silence, not a false claim", () => {
    renderLibrary();
    expect(screen.queryByTestId("library-coverage-chip")).toBeNull();
  });
});
