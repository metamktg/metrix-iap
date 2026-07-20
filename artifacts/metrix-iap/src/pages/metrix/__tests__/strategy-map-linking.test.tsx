// ─── Strategy Map hypothesis-linking regression tests ─────────────────
// Updated for the three-column selection-based layout:
//   - Left column: pillar list cards (data-testid="pillar-list-card-<id>")
//     — clicking one selects that pillar
//   - Right column: hypothesis rows (data-testid="hyp-row-<id>") shown
//     ONLY for the currently-selected pillar
//   - Unattached hypotheses (no valid pillar_id) appear under
//     "Unattached (N)" in the right column only when the first pillar is
//     selected (default on render)
//
// These tests simulate pillar selection via fireEvent.click and assert:
//   - selecting a pillar shows its hypotheses in the right column
//   - a hypothesis from pillar A is NOT visible when pillar B is selected
//   - no hypothesis appears for more than one pillar across all selections
//   - unlinked hypotheses appear in the Unattached section (first pillar)
// Uses the same harness (fixture + DateRangeProvider) as other view tests.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
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

// ── Helpers for the three-column layout ──────────────────────────────

/** Click the left-column card for a pillar to select it. */
function selectPillar(container: HTMLElement, pillarId: string) {
  const card = container.querySelector<HTMLElement>(
    `[data-testid="pillar-list-card-${pillarId}"]`
  );
  if (card) fireEvent.click(card);
}

/** True if a hyp-row for this id is currently rendered in the container. */
function hypVisible(container: HTMLElement, hypId: string) {
  return !!container.querySelector(`[data-testid="hyp-row-${hypId}"]`);
}

/** Find the wrapper around the "Unattached (N)" bucket in the right column. */
function unattachedSection(container: HTMLElement) {
  const label = [...container.querySelectorAll("p")].find((p) =>
    p.textContent?.trim().startsWith("Unattached")
  );
  return label?.closest<HTMLElement>("div.mt-3") ?? undefined;
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

// Both accounts in the fixture must have linked hypotheses.
const ACCOUNTS: [string, string][] = [
  ["bookster", "Bookster"],
  ["littledata", "City Street Print Brand"],
];

describe("fixture sanity", () => {
  for (const [accountId] of ACCOUNTS) {
    it(`${accountId} fixture has linked hypotheses`, () => {
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const attached = active_hypotheses.filter(
        (h) => h.pillar_id && pillarIds.has(h.pillar_id)
      );
      // Without linked hypotheses the rendering assertions below are vacuous.
      expect(attached.length).toBeGreaterThan(0);
    });
  }
});

for (const [accountId, accountName] of ACCOUNTS) {
  describe(`Strategy Map linking (${accountName})`, () => {
    it("renders a hypothesis when its linked pillar is selected", () => {
      select(accountId);
      const { container } = renderMap();
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const attached = active_hypotheses.filter(
        (h) => h.pillar_id && pillarIds.has(h.pillar_id)
      );

      for (const h of attached) {
        // Select the owning pillar; the hypothesis row must appear.
        selectPillar(container, h.pillar_id!);
        expect(
          hypVisible(container, h.id),
          `hyp ${h.id} should appear when pillar ${h.pillar_id} is selected`
        ).toBe(true);
      }
    });

    it("hides a hypothesis when a different pillar is selected", () => {
      select(accountId);
      const { container } = renderMap();
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const attached = active_hypotheses.filter(
        (h) => h.pillar_id && pillarIds.has(h.pillar_id)
      );
      if (message_pillars.length < 2 || attached.length === 0) return;

      // Take the first linked hypothesis and select a different pillar.
      const h = attached[0];
      const otherPillar = message_pillars.find((p) => p.id !== h.pillar_id);
      if (!otherPillar) return;

      selectPillar(container, otherPillar.id);
      expect(
        hypVisible(container, h.id),
        `hyp ${h.id} must NOT appear when non-owner pillar ${otherPillar.id} is selected`
      ).toBe(false);
    });

    it("never places a hypothesis under more than one pillar", () => {
      select(accountId);
      const { container } = renderMap();
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));

      // Cycle through every pillar; record how many pillar selections show each hyp.
      const appearsFor: Record<string, Set<string>> = {};
      for (const p of message_pillars) {
        selectPillar(container, p.id);
        for (const h of active_hypotheses) {
          if (hypVisible(container, h.id)) {
            (appearsFor[h.id] ??= new Set()).add(p.id);
          }
        }
      }

      for (const h of active_hypotheses) {
        const isLinked = !!h.pillar_id && pillarIds.has(h.pillar_id);
        const count = appearsFor[h.id]?.size ?? 0;
        if (isLinked) {
          // A linked hypothesis must appear for exactly its owning pillar.
          expect(
            count,
            `hyp ${h.id} (owner ${h.pillar_id}) should appear for exactly 1 pillar`
          ).toBe(1);
        } else {
          // An unlinked hypothesis appears in the Unattached bucket, which is
          // rendered alongside the FIRST pillar selection — so count may be 1.
          // It must never appear under MORE THAN ONE pillar (that would mean the
          // component is duplicating it across pillar-specific lanes).
          expect(
            count,
            `unlinked hyp ${h.id} must not appear for more than one pillar`
          ).toBeLessThanOrEqual(1);
        }
      }
    });

    it("unlinked hypotheses appear in the Unattached bucket (default first pillar)", () => {
      const { message_pillars, active_hypotheses } = strategyFor(accountId);
      const pillarIds = new Set(message_pillars.map((p) => p.id));
      const unattached = active_hypotheses.filter(
        (h) => !h.pillar_id || !pillarIds.has(h.pillar_id!)
      );
      // If this account has no unattached hypotheses, skip — nothing to assert.
      if (unattached.length === 0) return;

      select(accountId);
      const { container } = renderMap();
      // Default: first pillar selected → Unattached section is rendered.
      const bucket = unattachedSection(container);
      expect(bucket).toBeTruthy();
      // The component shows the first 3 unattached hyps (rest behind a link).
      for (const h of unattached.slice(0, 3)) {
        expect(
          hypVisible(bucket!, h.id),
          `unattached hyp ${h.id} should appear in the Unattached bucket`
        ).toBe(true);
      }
    });
  });
}
