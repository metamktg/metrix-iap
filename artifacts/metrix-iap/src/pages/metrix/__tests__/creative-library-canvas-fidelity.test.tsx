// ─── Creative Library — canvas fidelity fixes ──────────────────────────
// Nocturne canvas parity for the Creative Library screen:
//   1. A "Next moves" card at the top, sourced from the account's real
//      optimization-loop recommendation cards scoped to creative actions
//      (the same actionGroupForScope categorization RecommendationDeck and
//      ActionQueueView already use) — never a fabricated queue.
//   2. Variable-library chips are real click targets that open the shared
//      VariableDrilldownModal once real analysis data exists.
//   3. Cross-map cells are real click targets: a tested cell opens its real
//      creative; an untested cell files a real Task Tray item.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _resetForTest as resetTrayForTest, getTrayItem } from "@/lib/data/trayStore";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// A seed clone with a real-shape optimization_loop injected onto Bookster —
// the checked-in fixture's optimization_loop is null for every account, so
// this exercises the populated path with data matching RecommendationCard's
// real schema (seedTypes.ts), referencing a cell that actually exists in
// Bookster's own local library ("C2B").
function seedWithCreativeActions() {
  const seed = JSON.parse(JSON.stringify(baseSeed));
  const acct = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
  acct.iap.optimization_loop = {
    visibility: "visible",
    manager_overview_visibility: true,
    action_policy: "Approving adds a manual implementation task. Nothing is auto-applied.",
    dismiss_policy: "Dismissed cards can be restored.",
    recommendation_cards: [
      {
        id: "rec-creative-1",
        account_id: "bookster",
        scope: "creative",
        title: "C2B is the current checkout-depth control",
        rationale: "C2B carries the strongest checkout signal in the current window.",
        impact: "high",
        confidence: "high",
        source_path: "performance_by_cell.C2B",
        recommended_action: "Scale C2B budget within its current ad set.",
      },
      {
        id: "rec-funnel-1",
        account_id: "bookster",
        scope: "funnel",
        title: "Registration unlocks but weakens at checkout depth",
        rationale: "Funnel-level read, out of creative scope.",
        impact: "medium",
        confidence: "medium",
        recommended_action: "Review funnel messaging.",
      },
    ],
  };
  return seed;
}

let activeSeed = baseSeed;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { CreativeLibraryView } from "../creative/CreativeLibraryView";

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
            <TooltipProvider>
              <CreativeLibraryView />
            </TooltipProvider>
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
  resetTrayForTest();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
});

describe("Creative Library · Next moves card", () => {
  it("shows an honest empty state when the account has no optimization-loop data yet", () => {
    activeSeed = baseSeed; // real fixture: optimization_loop is null for every account
    renderFor("bookster");
    expect(screen.getByText("Next moves")).toBeTruthy();
    expect(
      screen.getByText("No creative-scoped recommendations yet · these appear once the optimization loop has run for this account.")
    ).toBeTruthy();
  });

  it("shows only creative-scoped recommendation cards, not funnel-scoped ones", () => {
    activeSeed = seedWithCreativeActions();
    renderFor("bookster");
    expect(screen.getByText("C2B is the current checkout-depth control")).toBeTruthy();
    expect(screen.queryByText("Registration unlocks but weakens at checkout depth")).toBeNull();
  });

  it("offers a real 'Open asset' button when the card references a known cell, plus a real Add to Tray button", () => {
    activeSeed = seedWithCreativeActions();
    renderFor("bookster");
    expect(screen.getByRole("button", { name: "Open asset" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /to tray/i })).toBeTruthy();
  });

  it("Add to Tray files a real Task Tray item for the recommendation", () => {
    activeSeed = seedWithCreativeActions();
    renderFor("bookster");
    fireEvent.click(screen.getByRole("button", { name: /to tray/i }));
    const item = getTrayItem("bookster", "test-rec-creative-1");
    expect(item?.status).toBe("open");
    expect(item?.title).toBe("C2B is the current checkout-depth control");
  });
});

describe("Creative Library · Variable library chips open the drill-down modal", () => {
  it("opens VariableDrilldownModal with real KPI data when a chip is clicked", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("tab", { name: /Variable library/i }));
    const chip = screen.getByTestId("chip-library-variable-HK_Benefit");
    fireEvent.click(chip);
    expect(screen.getByTestId("title-variable-drilldown")).toBeTruthy();
  });
});

describe("Creative Library · Cross-map cells are real click targets", () => {
  it("opens the real creative when a tested cell is clicked", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("tab", { name: /Cross-map/i }));
    // C2B / MOF and C2F / MOF are real tested combinations in Bookster's data.
    const testedCells = screen.getAllByTitle(/spend · \d+ results. Click to open the creative/i);
    expect(testedCells.length).toBeGreaterThan(0);
    fireEvent.click(testedCells[0]);
    // The creative expand dialog's tab bar renders once open.
    expect(screen.getByRole("tab", { name: /Overview/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Demographics/i })).toBeTruthy();
  });

  it("queues a real Task Tray item when an untested cell is clicked", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("tab", { name: /Cross-map/i }));
    const untestedCell = screen.getAllByTitle(/Untested · click to queue/i)[0];
    expect(untestedCell).toBeTruthy();
    const label = untestedCell.getAttribute("title")!;
    const match = /queue "(.+)"/.exec(label)!;
    fireEvent.click(untestedCell);
    expect(within(untestedCell).getByText("Queued")).toBeTruthy();
    const items = Object.values((JSON.parse(localStorage.getItem("metrix_tray_items_v1") ?? '{"items":{}}') as { items: Record<string, { title: string }> }).items);
    expect(items.some((i) => i.title === match[1])).toBe(true);
  });
});
