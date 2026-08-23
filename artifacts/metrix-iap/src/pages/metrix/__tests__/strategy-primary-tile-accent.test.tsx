// ─── MetricTile variant="primary" accent regression tests ─────────────
// The primary tile accent (top 2px rule + higher-contrast label) marks the
// single most important tile in each strategy page's KPI row. These tests
// guard two layers:
//   1. MetricTile itself — variant="primary" renders the accent bar
//      (data-testid="metric-tile-primary-accent"); default does not.
//   2. Every strategy page with a tile row renders at least one primary
//      tile when a configured account is selected:
//        /app/strategy            → StrategyCommandCenter
//        /app/strategy/overview   → StrategyOverview
//        /app/strategy/avatars    → AvatarsView
//        /app/strategy/hypotheses → HypothesisQueueView
// Uses the same harness (checked-in seed fixture + providers) as the other
// view tests.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
import { MetricTile } from "../shared";
import { StrategyCommandCenter } from "../strategy/StrategyCommandCenter";
import { StrategyOverview } from "../strategy/StrategyOverview";
import { AvatarsView } from "../strategy/AvatarsView";
import { HypothesisQueueView } from "../strategy/HypothesisQueueView";

const SESSION_KEY = "metrix_active_account_v1";
const ACCENT = '[data-testid="metric-tile-primary-accent"]';

function select(adAccountId: string) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId })
  );
}

function renderView(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>{node}</DateRangeProvider>
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

// ── Unit level: the variant actually controls the accent ─────────────

describe("MetricTile variant accent", () => {
  it('renders the accent bar for variant="primary" (static tile)', () => {
    const { container } = renderView(
      <MetricTile label="In queue" value="7" variant="primary" />
    );
    expect(container.querySelector(ACCENT)).toBeTruthy();
  });

  it('renders the accent bar for variant="primary" (clickable tile)', () => {
    const { container } = renderView(
      <MetricTile label="Spend" value="$1,000" variant="primary" onClick={() => {}} />
    );
    expect(container.querySelector(ACCENT)).toBeTruthy();
  });

  it("renders NO accent bar for the default variant", () => {
    const { container } = renderView(
      <MetricTile label="Ready" value="3" />
    );
    expect(container.querySelector(ACCENT)).toBeNull();
  });

  it("primary label uses the higher-contrast tone; default stays muted", () => {
    const primary = renderView(
      <MetricTile label="Primary label" value="1" variant="primary" />
    );
    const plain = renderView(<MetricTile label="Default label" value="1" />);
    const primaryLabel = [...primary.container.querySelectorAll("div")].find(
      (d) => d.textContent === "Primary label" && d.children.length === 0
    );
    const plainLabel = [...plain.container.querySelectorAll("div")].find(
      (d) => d.textContent === "Default label" && d.children.length === 0
    );
    expect(primaryLabel?.className).toContain("text-muted-foreground/65");
    expect(plainLabel?.className).toContain("text-muted-foreground/40");
  });
});

// ── Page level: each strategy page renders ≥1 primary tile ───────────
// Accounts in the fixture with full strategy data.

const ACCOUNTS = ["bookster", "ecas"] as const;

const PAGES: [route: string, View: React.ComponentType][] = [
  ["/app/strategy", StrategyCommandCenter],
  ["/app/strategy/overview", StrategyOverview],
  ["/app/strategy/avatars", AvatarsView],
  ["/app/strategy/hypotheses", HypothesisQueueView],
];

for (const accountId of ACCOUNTS) {
  describe(`primary tile accent on strategy pages (${accountId})`, () => {
    for (const [route, View] of PAGES) {
      it(`${route} renders at least one primary MetricTile with its accent bar`, () => {
        select(accountId);
        window.history.replaceState({}, "", route);
        const { container } = renderView(<View />);
        const accents = container.querySelectorAll(ACCENT);
        expect(
          accents.length,
          `${route} should render ≥1 primary-variant MetricTile accent`
        ).toBeGreaterThanOrEqual(1);
      });
    }
  });
}
