// ─── Listen tab — connection banner + seed content tests ─────────────────────
//
// Confirms that AlertsView, SignalView, and RecommendationsView:
//   • render seed content (metric tiles, signal cards) unconditionally when
//     useGetMetaConnection returns { data: { connected: false } }
//   • show ConnectionNudgeBanner when Meta is disconnected
//   • hide ConnectionNudgeBanner when Meta is connected
//   • never render the old "Live insights require Meta connection" PendingState
//     in either connection state
//
// The bookster fixture account (status: "configured") has 4 signal cards and is
// the canonical test subject. The seed is loaded from the checked-in fixture so
// any future refresh automatically flows through to these assertions.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";

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

// The bookster account has 4 signal_cards with at least one high-impact signal.
// Verify the precondition so a stale fixture doesn't silently make these tests vacuous.
const booksterAccount = (seed.ad_accounts as { id: string; listen?: { signal_cards?: unknown[] } }[])
  .find((a) => a.id === "bookster");
if (!booksterAccount?.listen?.signal_cards?.length) {
  throw new Error(
    "Fixture precondition failed: bookster account must have at least one signal_card in listen.signal_cards. " +
      "Refresh the fixture."
  );
}

// ── Mutable state for per-test control ───────────────────────────────────
const mockMeta = { connected: false };

// Mutable seed reference — swapped per-test to supply synthetic data.
// Initialised to the fixture; individual describe blocks may override it.
// eslint-disable-next-line prefer-const
let activeSeed: unknown = seed;

// ── Mocks ─────────────────────────────────────────────────────────────────
// Must be declared before any imports that transitively use these modules.

vi.mock("@workspace/api-client-react", () => ({
  useGetMetaConnection:  () => ({ data: { connected: mockMeta.connected } }),
  useListManualImports:  () => ({ data: { imports: [] } }),
  authMe:                async () => ({ user: null }),
  getAuthMeQueryKey:     () => ["auth", "me"],
  authLogin:             async () => {},
  authLogout:            async () => {},
  authChangePassword:    async () => {},
  ApiError:              class ApiError extends Error { status: number; constructor(msg: string, s: number) { super(msg); this.status = s; } },
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed:         () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider:    ({ children }: { children: ReactNode }) => children,
}));

// Stub out the concept chip so tests don't need a ConceptRegistryContext.
vi.mock("@/components/concept/ConceptChip", () => ({
  TokenizedConceptText: ({ text }: { text: string }) => <span>{text}</span>,
  ConceptChip:          ({ code }: { code: string }) => <span>{code}</span>,
}));

// ── Imports (must follow vi.mock calls) ───────────────────────────────────
import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AlertsView } from "../AlertsView";
import { SignalView } from "../SignalView";
import { RecommendationsView } from "../RecommendationsView";

// ── Helpers ───────────────────────────────────────────────────────────────

const SESSION_KEY = "metrix_active_account_v1";

/** Persist the bookster ad account selection so AccountProvider picks it up. */
function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function makeWrapper(path = "/app/listen/alerts") {
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

// ── Synthetic seed: bookster account with one recommendation card ─────────
// Deep-clone the fixture and inject a populated optimization_loop so the
// RecommendationDeck render path (not the empty-state PendingState) is exercised.
const syntheticSeedWithCards = JSON.parse(JSON.stringify(seed)) as {
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
const _syntheticBookster = syntheticSeedWithCards.ad_accounts.find((a) => a.id === "bookster");
if (_syntheticBookster) {
  if (!_syntheticBookster.iap) (_syntheticBookster as Record<string, unknown>).iap = {};
  _syntheticBookster.iap!.optimization_loop = {
    recommendation_cards: [
      {
        id: "rec-test-1",
        account_id: "bookster",
        scope: "creative",
        title: "Pause underperforming creatives to cut wasted spend",
        rationale: "Bottom 3 creatives by CPA exceed the target by 2×.",
        impact: "high",
        confidence: "high",
        recommended_action: "Pause the bottom 3 creatives and reallocate their budget.",
        manager_card_descriptor: "Creative",
      },
    ],
    action_policy: "All changes require manual approval before implementation.",
  };
}

beforeEach(() => {
  selectBookster();
  mockMeta.connected = false;
  activeSeed = seed;
});

afterEach(cleanup);

/** The text anchored in ConnectionNudgeBanner. */
const BANNER_TEXT = /connect meta in settings to enable live data refresh/i;

/** The legacy gate text that must never appear. */
const LEGACY_GATE_TEXT = /live insights require meta connection/i;

// ── AlertsView ────────────────────────────────────────────────────────────

describe("AlertsView — disconnected", () => {
  it("renders the Active alerts metric tile", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    expect(screen.getByText(/active alerts/i)).toBeTruthy();
  });

  it("renders the High-impact signals metric tile", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    // The label appears in both the MetricTile header and the section heading.
    expect(screen.getAllByText(/high-impact signals/i).length).toBeGreaterThan(0);
  });

  it("renders the Data caveats metric tile", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    // The label appears in both the MetricTile header and the section heading.
    expect(screen.getAllByText(/data caveats/i).length).toBeGreaterThan(0);
  });

  it("renders seed signal cards as buttons", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    // The bookster fixture has at least one high-impact signal; it should
    // appear as an interactive button regardless of connection state.
    const cards = screen.getAllByRole("button").filter(
      (b) => b.closest(".space-y-3") !== null
    );
    expect(cards.length).toBeGreaterThan(0);
  });

  it("shows ConnectionNudgeBanner when Meta is disconnected", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
  });

  it("does NOT render the legacy PendingState gate", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    expect(screen.queryByText(LEGACY_GATE_TEXT)).toBeNull();
  });
});

describe("AlertsView — connected", () => {
  beforeEach(() => { mockMeta.connected = true; });

  it("hides ConnectionNudgeBanner when Meta is connected", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it("still renders metric tiles when connected", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    expect(screen.getByText(/active alerts/i)).toBeTruthy();
  });

  it("does NOT render the legacy PendingState gate when connected", () => {
    render(<AlertsView />, { wrapper: makeWrapper() });
    expect(screen.queryByText(LEGACY_GATE_TEXT)).toBeNull();
  });
});

// ── SignalView ────────────────────────────────────────────────────────────

describe("SignalView — disconnected", () => {
  it("renders the Active signals metric tile", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.getByText(/^active$/i)).toBeTruthy();
  });

  it("renders the High impact metric tile", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    // Label appears in both MetricTile and ImpactBadge elements.
    expect(screen.getAllByText(/^high impact$/i).length).toBeGreaterThan(0);
  });

  it("renders the Scopes metric tile", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.getByText(/^scopes$/i)).toBeTruthy();
  });

  it("renders seed signal cards, each openable", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    // Asserted on the SEMANTICS, not on a container class. The previous
    // version looked for buttons inside `.space-y-3`, so it broke the moment
    // the list became a grid of <article> cards — while the behaviour it
    // cared about (signals render, and each one opens) was unchanged.
    const cards = screen.getAllByRole("article");
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Detail:/ }).length).toBe(cards.length);
  });

  it("shows ConnectionNudgeBanner when Meta is disconnected", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
  });

  it("does NOT render the legacy PendingState gate", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.queryByText(LEGACY_GATE_TEXT)).toBeNull();
  });
});

describe("SignalView — connected", () => {
  beforeEach(() => { mockMeta.connected = true; });

  it("hides ConnectionNudgeBanner when Meta is connected", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it("still renders metric tiles when connected", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.getByText(/^active$/i)).toBeTruthy();
  });

  it("does NOT render the legacy PendingState gate when connected", () => {
    render(<SignalView />, { wrapper: makeWrapper("/app/listen/signal") });
    expect(screen.queryByText(LEGACY_GATE_TEXT)).toBeNull();
  });
});

// ── RecommendationsView ───────────────────────────────────────────────────

describe("RecommendationsView — disconnected", () => {
  it("renders the Recommendations metric tile", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    // "Recommendations" appears in both the page title and the MetricTile label.
    expect(screen.getAllByText(/^recommendations$/i).length).toBeGreaterThan(0);
  });

  it("renders the High impact metric tile", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    // Multiple "High impact" labels may exist — at least one must be present.
    expect(screen.getAllByText(/^high impact$/i).length).toBeGreaterThan(0);
  });

  it("renders the Auto-applied metric tile", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getByText(/auto-applied/i)).toBeTruthy();
  });

  it("shows ConnectionNudgeBanner when Meta is disconnected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
  });

  it("does NOT render the legacy PendingState gate", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.queryByText(LEGACY_GATE_TEXT)).toBeNull();
  });
});

describe("RecommendationsView — connected", () => {
  beforeEach(() => { mockMeta.connected = true; });

  it("hides ConnectionNudgeBanner when Meta is connected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it("still renders metric tiles when connected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getAllByText(/^recommendations$/i).length).toBeGreaterThan(0);
  });

  it("does NOT render the legacy PendingState gate when connected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.queryByText(LEGACY_GATE_TEXT)).toBeNull();
  });
});

// ── RecommendationsView — populated deck ──────────────────────────────────
//
// These suites use syntheticSeedWithCards, which injects one recommendation_card
// into the bookster account's iap.optimization_loop. They confirm:
//   • The RecommendationDeck render path fires (card title + action text visible)
//   • The "No recommendations" PendingState is absent
//   • ConnectionNudgeBanner still tracks the Meta connection state correctly

describe("RecommendationsView — with recommendation cards (disconnected)", () => {
  beforeEach(() => {
    activeSeed = syntheticSeedWithCards;
    mockMeta.connected = false;
  });

  it("renders the card title in the deck", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getByText(/pause underperforming creatives to cut wasted spend/i)).toBeTruthy();
  });

  it("renders the recommended action text in the deck", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getByText(/pause the bottom 3 creatives and reallocate/i)).toBeTruthy();
  });

  it("does NOT render the 'No recommendations' PendingState", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.queryByText(/no recommendations/i)).toBeNull();
  });

  it("shows ConnectionNudgeBanner when Meta is disconnected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
  });
});

describe("RecommendationsView — with recommendation cards (connected)", () => {
  beforeEach(() => {
    activeSeed = syntheticSeedWithCards;
    mockMeta.connected = true;
  });

  it("renders the card title in the deck when Meta is connected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.getByText(/pause underperforming creatives to cut wasted spend/i)).toBeTruthy();
  });

  it("does NOT render the 'No recommendations' PendingState when connected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.queryByText(/no recommendations/i)).toBeNull();
  });

  it("hides ConnectionNudgeBanner when Meta is connected", () => {
    render(<RecommendationsView />, { wrapper: makeWrapper("/app/listen/recommendations") });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });
});
