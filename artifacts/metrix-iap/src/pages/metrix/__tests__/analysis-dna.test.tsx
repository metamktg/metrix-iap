// ─── Analysis · Creative DNA page tests ────────────────────────────────
// Guards the new /app/analysis/dna page against the real seed fixture:
//
//  1. Bookster (real v3_variable_performance + variable_combinations):
//     "Gene loci" renders real variable codes ranked by spend, folds
//     beyond the first 8 behind "Show all", and clicking a row opens the
//     real VariableDrilldownModal. "Formula sequences" renders the real
//     combinations. The "Golden formula" note quotes the seed's own
//     loop_status pending reason — never a fabricated formula.
//
//  2. ECAS (variable_combinations but no v3_variable_performance): only
//     "Formula sequences" renders — no fabricated "Gene loci" card.
//
//  3. BELT manual account (v3_variable_performance with a raw_token
//     family, no variable_combinations): only "Gene loci" renders, and
//     the family falls back to a readable label instead of crashing.
//
//  4. Gabri manual account (neither field populated): the honest empty
//     state renders — no cards, no fabricated content.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Fixture ──────────────────────────────────────────────────────────────

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// ── Mocks (hoisted before component imports) ──────────────────────────────

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

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ["/app/analysis/dna", vi.fn()],
  };
});

// ── Component imports (after vi.mock hoisting) ────────────────────────────

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AnalysisDnaView } from "../analysis/AnalysisDnaView";

// ── Helpers ───────────────────────────────────────────────────────────────

const ACCOUNT_KEY = "metrix_active_account_v1";

function selectAccount(id: string) {
  sessionStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: id })
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AnalysisDnaView />
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

// ─────────────────────────────────────────────────────────────────────────
// 1. Bookster — full real data, both cards + honest golden-formula note
// ─────────────────────────────────────────────────────────────────────────

describe("Bookster — Gene loci", () => {
  it("renders real variable codes ranked by spend, with a locus row per variable", () => {
    selectAccount("bookster");
    const { container } = renderPage();

    expect(screen.getByText("Gene loci")).toBeTruthy();
    // Top-spend variable from the fixture must appear as the first locus row.
    expect(container.querySelector('[data-testid="locus-row-HK_Benefit"]')).toBeTruthy();
  });

  it("folds beyond the first 8 rows behind a 'Show all' toggle", async () => {
    const user = userEvent.setup();
    selectAccount("bookster");
    const { container } = renderPage();

    const list = container.querySelector('[data-testid="gene-loci-list"]')!;
    const initialRows = list.querySelectorAll('[data-testid^="locus-row-"]');
    expect(initialRows.length).toBe(8);

    const showAll = screen.getByRole("button", { name: /show all 31 variables/i });
    await user.click(showAll);

    const expandedRows = list.querySelectorAll('[data-testid^="locus-row-"]');
    expect(expandedRows.length).toBe(31);
  });

  it("clicking a locus row opens the real variable drill-down modal", async () => {
    const user = userEvent.setup();
    selectAccount("bookster");
    const { container } = renderPage();

    const row = container.querySelector<HTMLElement>('[data-testid="locus-row-HK_Benefit"]')!;
    await act(async () => { row.focus(); });
    await user.click(row);

    await screen.findByTestId("title-variable-drilldown");
  });
});

describe("Bookster — Formula sequences", () => {
  it("renders the account's real tested combinations", () => {
    selectAccount("bookster");
    const { container } = renderPage();

    expect(screen.getByText("Formula sequences")).toBeTruthy();
    // A real chip from strategy.variable_combinations[0].combination.
    expect(container.textContent).toContain("FW_BAB");
    expect(container.textContent).toContain("scale");
  });
});

describe("Bookster — Golden formula honesty", () => {
  it("quotes the seed's own pending reason instead of fabricating a formula", () => {
    selectAccount("bookster");
    const { container } = renderPage();

    expect(container.textContent).toContain("Golden formula");
    expect(container.textContent).toContain(
      "golden-formula output requires the Creative Scan / Test Engine stage"
    );
    // Never invent stat tiles or a plain-English formula sentence.
    expect(container.textContent).not.toContain("Cost / result");
    expect(container.textContent).not.toContain("UGC video");
  });

  it("links to the real honest 'not yet automated' page (MST · Direction)", () => {
    selectAccount("bookster");
    renderPage();
    expect(screen.getByRole("button", { name: /open mst · direction/i })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. ECAS — combinations only, no fabricated Gene loci
// ─────────────────────────────────────────────────────────────────────────

describe("ECAS — combinations without variable performance", () => {
  it("renders Formula sequences but not Gene loci", () => {
    selectAccount("ecas");
    const { container } = renderPage();

    expect(screen.getByText("Formula sequences")).toBeTruthy();
    expect(screen.queryByText("Gene loci")).toBeNull();
    expect(container.querySelector('[data-testid="gene-loci-list"]')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. BELT manual account — raw_token family, no combinations
// ─────────────────────────────────────────────────────────────────────────

describe("BELT manual account — raw-token variables, no combinations", () => {
  it("renders Gene loci with a readable family fallback label, no Formula sequences card", () => {
    selectAccount("manual_gXU2GXOGunDq");
    const { container } = renderPage();

    expect(screen.getByText("Gene loci")).toBeTruthy();
    expect(screen.queryByText("Formula sequences")).toBeNull();
    // raw_token has no entry in FAMILY_LABEL — must fall back to a readable
    // label ("Raw Token"), never crash or show the raw snake_case string.
    expect(container.textContent).toContain("Raw Token");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Gabri manual account — neither field populated
// ─────────────────────────────────────────────────────────────────────────

describe("Gabri manual account — no creative DNA signal", () => {
  it("renders the honest empty state, no fabricated cards", () => {
    selectAccount("manual_BwsYjC5ZRk0i");
    const { container } = renderPage();

    expect(screen.getByText("No creative DNA signal")).toBeTruthy();
    expect(screen.queryByText("Gene loci")).toBeNull();
    expect(screen.queryByText("Formula sequences")).toBeNull();
    expect(container.textContent).not.toContain("Golden formula");
  });
});
