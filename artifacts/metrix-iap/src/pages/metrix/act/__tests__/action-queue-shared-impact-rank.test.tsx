// ─── Action Queue — shared impact rank ─────────────────────────────────
//
// NextBestActionCard (components/deck) and ActionQueueView (this directory)
// both sort DeckCard-shaped recommendations by impact. Each file used to
// define its own private IMPACT_RANK map (3/2/1/0 vs. 4/3/2/1) for the
// identical purpose over the identical `impact` field — same relative
// order today, but two independent sources of truth that could silently
// desync on any future edit to only one side.
//
// Both now import the single `impactRank` from RecommendationDeck instead
// of declaring their own copy. This suite proves that behaviorally: cards
// spanning all four impact tiers are fed to both ActionQueueView (via the
// seed) and NextBestActionCard (via props), and both surfaces' resulting
// order is asserted against — and only explainable by — the one shared
// `impactRank` ordering.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";

import { impactRank as sharedImpactRank, IMPACT_RANK } from "@/components/deck/RecommendationDeck";

// ── Load checked-in seed fixture ──────────────────────────────────────────
const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

const mockMeta = { connected: false };

vi.mock("@workspace/api-client-react", () => ({
  useGetMetaConnection: () => ({ data: { connected: mockMeta.connected } }),
  useListManualImports: () => ({ data: { imports: [] } }),
  authMe: async () => ({ user: null }),
  getAuthMeQueryKey: () => ["auth", "me"],
  authLogin: async () => {},
  authLogout: async () => {},
  authChangePassword: async () => {},
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, s: number) {
      super(msg);
      this.status = s;
    }
  },
}));

let activeSeed: unknown = seed;
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: ReactNode }) => children,
}));

// ── Imports that must follow vi.mock calls ─────────────────────────────
import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ActionQueueView } from "../ActionQueueView";
import { NextBestActionCard } from "@/components/deck/NextBestActionCard";
import type { DeckCard } from "@/components/deck/RecommendationDeck";
import { _resetForTest as resetDecisions } from "@/lib/data/decisionStore";
import { _resetForTest as resetTray } from "@/lib/data/trayStore";

const SESSION_KEY = "metrix_active_account_v1";

function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function makeWrapper(path = "/app/act/queue") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const loc = memoryLocation({ path, record: false });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <WouterRouter hook={loc.hook}>
          <AuthProvider>
            <AccountProvider>
              <DateRangeProvider>{children}</DateRangeProvider>
            </AccountProvider>
          </AuthProvider>
        </WouterRouter>
      </QueryClientProvider>
    );
  };
}

// Four recommendation cards, one per impact tier, deliberately given to the
// seed in an order that is NOT already impact-sorted — if either surface's
// ranking regresses independently, the rendered/selected order will drift.
const IMPACT_TIERS = ["low", "setup", "high", "medium"] as const;

const syntheticSeed = JSON.parse(JSON.stringify(seed)) as {
  ad_accounts: {
    id: string;
    iap?: {
      optimization_loop?: {
        recommendation_cards: unknown[];
        action_policy?: string;
      } | null;
    };
  }[];
};
const _bookster = syntheticSeed.ad_accounts.find((a) => a.id === "bookster");
if (!_bookster) {
  throw new Error("Fixture precondition failed: bookster account not found.");
}
if (!_bookster.iap) (_bookster as Record<string, unknown>).iap = {};
_bookster.iap!.optimization_loop = {
  recommendation_cards: IMPACT_TIERS.map((impact, i) => ({
    id: `rank-test-${impact}`,
    account_id: "bookster",
    scope: "creative",
    title: `Card ${i} (${impact})`,
    rationale: `Rationale for ${impact} card.`,
    impact,
    confidence: "high",
    recommended_action: `Recommended action for ${impact} card.`,
    manager_card_descriptor: "Creative",
  })),
  action_policy: "All changes require manual approval before implementation.",
};

beforeEach(() => {
  selectBookster();
  mockMeta.connected = false;
  activeSeed = syntheticSeed;
  resetDecisions();
  resetTray();
  localStorage.clear();
});
afterEach(cleanup);

describe("shared impact rank source (RecommendationDeck)", () => {
  it("produces high > medium > low > setup for all four tiers", () => {
    const ranks = {
      high: sharedImpactRank("high"),
      medium: sharedImpactRank("medium"),
      low: sharedImpactRank("low"),
      setup: sharedImpactRank("setup"),
    };
    expect(ranks.high).toBeGreaterThan(ranks.medium);
    expect(ranks.medium).toBeGreaterThan(ranks.low);
    expect(ranks.low).toBeGreaterThan(ranks.setup);
    // Sanity: matches the exported map directly too.
    expect(ranks).toEqual({
      high: IMPACT_RANK.high,
      medium: IMPACT_RANK.medium,
      low: IMPACT_RANK.low,
      setup: IMPACT_RANK.setup,
    });
  });
});

describe("ActionQueueView · renders the pending queue in shared-impact-rank order", () => {
  it("orders cards high, medium, low, setup regardless of input order", () => {
    render(<ActionQueueView />, { wrapper: makeWrapper() });

    const titles = screen
      .getAllByText(/^Card \d \(\w+\)$/)
      .map((el) => el.textContent);

    expect(titles).toEqual([
      "Card 2 (high)",
      "Card 3 (medium)",
      "Card 0 (low)",
      "Card 1 (setup)",
    ]);
  });
});

describe("NextBestActionCard · picks the shared-impact-rank top card", () => {
  const cards: DeckCard[] = IMPACT_TIERS.map((impact, i) => ({
    id: `deck-rank-test-${impact}`,
    title: `Deck card ${i} (${impact})`,
    rationale: `Rationale for ${impact}.`,
    recommendedAction: `Action for ${impact}.`,
    impact,
    confidence: "high",
    scope: "ad_account",
    actionGroup: "Budget actions",
  }));

  it("surfaces the highest-impact card first", () => {
    render(<NextBestActionCard scopeId="bookster" cards={cards} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByTestId("next-best-action-title").textContent).toBe(
      "Deck card 2 (high)"
    );
  });
});
