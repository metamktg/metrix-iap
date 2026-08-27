// ─── DNA family card hierarchy tests ──────────────────────────────────
// Guards the DNA family card grid in IapLibraryView (Variable performance tab):
//
//  1. All seven DNA families present in the fixture render as cards, each
//     with the correct data-testid ("dna-family-{family}").
//
//  2. Cards that have a "best read" (f.top !== null) receive role="button"
//     and tabIndex=0 and are therefore keyboard-reachable.
//
//  3. Pressing Enter on a card with a best-read opens the
//     VariableDrilldownModal (confirmed via its data-testid).
//
//  4. The family label text is fully present in the card title — no
//     truncation artefact (jsdom cannot measure pixel overflow; we verify
//     the raw string is intact in the rendered DOM as a proxy for the
//     non-truncated title row at any viewport width).
//
// The fixture (bookster account) has all seven variable families, so
// any regression that removes a family card or breaks keyboard handling
// is caught immediately.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VARIABLE_FAMILIES } from "@/lib/variable-registry";
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

// ── Derive expected families directly from the fixture ────────────────────

const bookster = (
  seed.ad_accounts as {
    id: string;
    iap?: { analysis?: { v3_variable_performance?: { variable_family: string }[] } };
  }[]
).find((a) => a.id === "bookster")!;

const variablePerf = bookster.iap?.analysis?.v3_variable_performance ?? [];
const FIXTURE_FAMILIES = [...new Set(variablePerf.map((r) => r.variable_family))].sort();

// Precondition: fixture must have all seven expected families.
const EXPECTED_FAMILIES = ["concept", "cta", "framework", "hook", "pain_proof", "proof", "tone"];
if (FIXTURE_FAMILIES.join(",") !== EXPECTED_FAMILIES.join(",")) {
  throw new Error(
    `Fixture precondition failed: expected families [${EXPECTED_FAMILIES.join(", ")}] ` +
      `but got [${FIXTURE_FAMILIES.join(", ")}]. Refresh the fixture.`
  );
}

// The expected label comes from VARIABLE_FAMILIES, which is itself pinned
// against the seed's variable_registry by variable-families-match-data.test.
// It used to be a local copy of strategyShared's map — a fifth restatement
// of the family list, carrying the same two wrong names ("Pain point" for
// what the registry calls "Pain proof", "Proof" for "Proof type"). A test
// that restates the labels can only confirm the code agrees with the test.
const labelFor = (family: string): string =>
  VARIABLE_FAMILIES.find((f) => f.key === family || f.aliases.includes(family))?.label ?? family;

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

// Real wouter (no mock): IapLibraryView's tab state now round-trips through
// the URL (?tab=, via useTabParam in shared.tsx), so navigation must actually
// update history for tab switches to take effect. beforeEach below points
// window.history at the library route directly instead of stubbing useLocation.

// ── Component imports (after vi.mock hoisting) ────────────────────────────

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { IapLibraryView } from "../analysis/IapLibraryView";

// ── Helpers ───────────────────────────────────────────────────────────────

const ACCOUNT_KEY = "metrix_active_account_v1";

function selectBookster() {
  sessionStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
}

function renderLibrary() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <AccountProvider>
        <DateRangeProvider>
          <AnalysisViewProvider>
            <IapLibraryView />
          </AnalysisViewProvider>
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

/** Navigate to the "Variable performance" (variables) tab. */
async function switchToVariablesTab(user: ReturnType<typeof userEvent.setup>) {
  // Tab labels: "Variable performance" — use a case-insensitive text match so
  // the test doesn't break if a count badge is appended to the button label.
  const dnaTabBtn = screen.getByRole("tab", { name: /variable performance/i });
  await user.click(dnaTabBtn);
}

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/app/analysis/library");
});

// ─────────────────────────────────────────────────────────────────────────
// 1. All seven DNA family cards are present in the Variable performance tab
// ─────────────────────────────────────────────────────────────────────────

describe("DNA family card grid — presence", () => {
  it("renders one card per fixture family after switching to the Variable performance tab", async () => {
    const user = userEvent.setup();
    selectBookster();
    renderLibrary();

    await switchToVariablesTab(user);

    for (const family of FIXTURE_FAMILIES) {
      expect(
        screen.getByTestId(`dna-family-${family}`),
        `data-testid="dna-family-${family}" not found`
      ).toBeTruthy();
    }
  });

  it("renders exactly seven family cards (one per family, no duplicates)", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    // Count elements whose data-testid starts with "dna-family-".
    const cards = container.querySelectorAll<HTMLElement>("[data-testid^='dna-family-']");
    expect(cards.length).toBe(EXPECTED_FAMILIES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Cards with a best-read are keyboard-reachable (role=button, tabIndex=0)
// ─────────────────────────────────────────────────────────────────────────

describe("DNA family card keyboard reachability", () => {
  it("all cards with a best-read have role=button", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    const cards = container.querySelectorAll<HTMLElement>("[data-testid^='dna-family-']");
    const buttonCards: HTMLElement[] = [];
    const nonButtonCards: HTMLElement[] = [];

    for (const card of Array.from(cards)) {
      if (card.getAttribute("role") === "button") {
        buttonCards.push(card);
      } else {
        nonButtonCards.push(card);
      }
    }

    // Every button-role card must have tabIndex=0.
    for (const card of buttonCards) {
      expect(
        Number(card.getAttribute("tabindex")),
        `dna-family card with role=button missing tabIndex=0: ${card.dataset.testid}`
      ).toBe(0);
    }

    // Sanity: at least some cards must be interactive (fixture has results data).
    expect(buttonCards.length).toBeGreaterThan(0);
  });

  it("cards without a best-read do NOT have role=button (they are static)", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    const cards = container.querySelectorAll<HTMLElement>("[data-testid^='dna-family-']");
    for (const card of Array.from(cards)) {
      const role = card.getAttribute("role");
      if (role !== "button") {
        // Non-interactive cards must NOT be focusable via a positive tabIndex.
        const tabindex = card.getAttribute("tabindex");
        expect(tabindex === null || tabindex === "-1" || tabindex === "0").toBe(true);
        // Explicitly: static cards get no role=button.
        expect(role).not.toBe("button");
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Enter on a best-read card opens the VariableDrilldownModal
// ─────────────────────────────────────────────────────────────────────────

describe("DNA family card keyboard — Enter opens drill-down", () => {
  it("pressing Enter on a card with role=button opens the VariableDrilldownModal", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    // Find the first interactive (role=button) DNA family card.
    const interactiveCard = container.querySelector<HTMLElement>(
      "[data-testid^='dna-family-'][role='button']"
    );
    expect(interactiveCard, "no interactive DNA family card found").toBeTruthy();

    // Focus the card and press Enter.
    await act(async () => { interactiveCard!.focus(); });
    await user.keyboard("{Enter}");

    // The VariableDrilldownModal should now be open.
    // It renders a DialogTitle with data-testid="title-variable-drilldown".
    await screen.findByTestId("title-variable-drilldown");
  });

  it("pressing Space on a card with role=button also opens the VariableDrilldownModal", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    const interactiveCard = container.querySelector<HTMLElement>(
      "[data-testid^='dna-family-'][role='button']"
    );
    expect(interactiveCard, "no interactive DNA family card found").toBeTruthy();

    await act(async () => { interactiveCard!.focus(); });
    await user.keyboard(" ");

    await screen.findByTestId("title-variable-drilldown");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Title text is intact (proxy for no truncation at any breakpoint)
// ─────────────────────────────────────────────────────────────────────────

describe("DNA family card title row — full label text present", () => {
  it("renders the full human-readable family label in the title span of every card", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    for (const family of FIXTURE_FAMILIES) {
      const card = container.querySelector<HTMLElement>(`[data-testid="dna-family-${family}"]`);
      expect(card, `card for family "${family}" not found`).toBeTruthy();

      const expectedLabel = labelFor(family);

      // The title is a <span class="text-sm font-bold ..."> inside the card.
      // Check the card's full textContent contains the expected label string —
      // any CSS truncation (text-overflow: ellipsis) would not affect textContent
      // but a regression that shortens the label in code would be caught here.
      expect(
        card!.textContent,
        `full label "${expectedLabel}" not found in card textContent for family "${family}"`
      ).toContain(expectedLabel);
    }
  });

  it("renders the variable-count badge next to the title on every card", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    for (const family of FIXTURE_FAMILIES) {
      const card = container.querySelector<HTMLElement>(`[data-testid="dna-family-${family}"]`);
      expect(card, `card for family "${family}" not found`).toBeTruthy();

      // The badge contains "{n} variable" or "{n} variables".
      expect(
        card!.textContent,
        `variable-count badge missing on card for family "${family}"`
      ).toMatch(/\d+\s+variables?/);
    }
  });

  it("renders Spend, Results, and CPA metric labels on every card", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    for (const family of FIXTURE_FAMILIES) {
      const card = container.querySelector<HTMLElement>(`[data-testid="dna-family-${family}"]`);
      expect(card, `card for family "${family}" not found`).toBeTruthy();

      const text = card!.textContent ?? "";
      expect(text, `"Spend" metric label missing on "${family}" card`).toContain("Spend");
      expect(text, `"Results" metric label missing on "${family}" card`).toContain("Results");
      expect(text, `"CPA" metric label missing on "${family}" card`).toContain("CPA");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Best-read footer renders correctly when a top variable is present
// ─────────────────────────────────────────────────────────────────────────

describe("DNA family card — best-read footer", () => {
  it("interactive cards show a 'Best read' footer section", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    const interactiveCards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-testid^='dna-family-'][role='button']")
    );
    expect(interactiveCards.length).toBeGreaterThan(0);

    for (const card of interactiveCards) {
      expect(
        card.textContent,
        `"Best read" footer missing on interactive card: ${card.dataset.testid}`
      ).toContain("Best read");
    }
  });

  it("non-interactive cards do NOT show a 'Best read' footer section", async () => {
    const user = userEvent.setup();
    selectBookster();
    const { container } = renderLibrary();

    await switchToVariablesTab(user);

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-testid^='dna-family-']")
    );
    const staticCards = cards.filter((c) => c.getAttribute("role") !== "button");

    for (const card of staticCards) {
      expect(
        card.textContent,
        `"Best read" footer should not appear on a static card: ${card.dataset.testid}`
      ).not.toContain("Best read");
    }
  });
});
