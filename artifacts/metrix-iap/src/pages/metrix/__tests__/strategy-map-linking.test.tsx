// ─── Strategy Map hypothesis-linking regression tests ─────────────────
// The Strategy Map links each hypothesis to its pillar via an explicit
// `pillar_id` (never fragile text matching). These tests guard that
// contract against future refactors by rendering StrategyMapView against
// the checked-in seed fixture and asserting:
//   - a hypothesis with a matching pillar_id renders ONLY under that
//     pillar's "Feeds hypotheses" section
//   - a hypothesis with no pillar_id (or one pointing at a pillar not in
//     the set) renders under "Other active hypotheses" and nowhere else
//   - no hypothesis ever appears under more than one pillar
// Uses the same harness (fixture + DateRangeProvider) as the other
// metrix-iap view tests so assertions track production data.

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
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { StrategyMapView } from "../strategy/StrategyMapView";

const ACCOUNT_KEY = "metrix_active_account_v1";

type Hypothesis = { id: string; pillar_id?: string | null };
type Pillar = { id: string };

function strategyFor(accountId: string) {
  const acct = seed.ad_accounts.find((a: { id: string }) => a.id === accountId);
  return acct.iap.strategy as {
    message_pillars: Pillar[];
    active_hypotheses: Hypothesis[];
  };
}

function select(accountId: string) {
  sessionStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: accountId })
  );
}

function renderMap() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <DateRangeProvider>
          <StrategyMapView />
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

// Pillar cards and hypothesis rows carry stable data-testids
// (`pillar-card-<id>`, `hyp-row-<id>`). The first-layer rule means ids
// and full prose are no longer visible textContent (labels + popovers),
// so assertions anchor on these structural hooks instead.
function pillarCards(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-testid^="pillar-card-"]')];
}

function cardForPillar(container: HTMLElement, pillarId: string) {
  return container.querySelector<HTMLElement>(
    `[data-testid="pillar-card-${pillarId}"]`
  ) ?? undefined;
}

function holdsHypothesis(scope: HTMLElement, hypId: string) {
  return !!scope.querySelector(`[data-testid="hyp-row-${hypId}"]`);
}

// The "Other active hypotheses" bucket: the rounded card wrapping that label.
function otherSection(container: HTMLElement) {
  const label = [...container.querySelectorAll("div")].find(
    (d) => d.textContent?.trim() === "Other active hypotheses"
  );
  return label?.closest("div.rounded-xl") as HTMLElement | undefined;
}

// How many pillar cards hold a given hypothesis row.
function pillarCardsHolding(container: HTMLElement, hypId: string) {
  return pillarCards(container).filter((c) => holdsHypothesis(c, hypId));
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

// Both accounts in the fixture carry a mix of linked and unlinked
// hypotheses, so the same invariants are asserted for each.
const ACCOUNTS: [string, string][] = [
  ["bookster", "Bookster"],
  ["littledata", "City Street Print Brand"],
];

describe("fixture sanity", () => {
  for (const [accountId] of ACCOUNTS) {
    it(`${accountId} fixture has both linked and unlinked hypotheses`, () => {
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const attached = active_hypotheses.filter(
        (h) => h.pillar_id && pillarIds.has(h.pillar_id)
      );
      const unattached = active_hypotheses.filter(
        (h) => !h.pillar_id || !pillarIds.has(h.pillar_id!)
      );
      // Without both kinds present the assertions below would be vacuous.
      expect(attached.length).toBeGreaterThan(0);
      expect(unattached.length).toBeGreaterThan(0);
    });
  }
});

for (const [accountId, accountName] of ACCOUNTS) {
  describe(`Strategy Map linking (${accountName})`, () => {
    it("renders a hypothesis only under its linked pillar's section", () => {
      select(accountId);
      const { container } = renderMap();
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const attached = active_hypotheses.filter(
        (h) => h.pillar_id && pillarIds.has(h.pillar_id)
      );

      for (const h of attached) {
        const owner = cardForPillar(container, h.pillar_id!);
        expect(owner).toBeTruthy();
        // Appears in its owning pillar card…
        expect(holdsHypothesis(owner!, h.id)).toBe(true);
        // …and in no other pillar card.
        const otherCards = pillarCards(container).filter((c) => c !== owner);
        for (const c of otherCards) {
          expect(holdsHypothesis(c, h.id)).toBe(false);
        }
        // …and not in the "Other active hypotheses" bucket.
        const bucket = otherSection(container);
        if (bucket) expect(holdsHypothesis(bucket, h.id)).toBe(false);
      }
    });

    it("renders unlinked hypotheses only under 'Other active hypotheses'", () => {
      select(accountId);
      const { container } = renderMap();
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const unattached = active_hypotheses.filter(
        (h) => !h.pillar_id || !pillarIds.has(h.pillar_id!)
      );

      const bucket = otherSection(container);
      expect(bucket).toBeTruthy();
      for (const h of unattached) {
        // Present in the bucket…
        expect(holdsHypothesis(bucket!, h.id)).toBe(true);
        // …and in no pillar card.
        for (const c of pillarCards(container)) {
          expect(holdsHypothesis(c, h.id)).toBe(false);
        }
      }
    });

    it("never places a hypothesis under more than one pillar", () => {
      select(accountId);
      const { container } = renderMap();
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));

      for (const h of active_hypotheses) {
        const holding = pillarCardsHolding(container, h.id);
        const isLinked = !!h.pillar_id && pillarIds.has(h.pillar_id);
        // A linked hypothesis lands in exactly one pillar card; an
        // unlinked one lands in none — never two, never orphaned into the
        // wrong pillar.
        expect(holding.length).toBe(isLinked ? 1 : 0);
      }
    });
  });
}
