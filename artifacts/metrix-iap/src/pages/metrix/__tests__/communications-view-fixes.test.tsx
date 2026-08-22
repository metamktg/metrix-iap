// ─── Strategy · Communications — best-confidence badge ─────────────────
// Regression for a correctness bug: the "Who responds" confidence badge
// on a pillar card used to resolve via
//   matchedProfiles.map((pr) => pr.confidence_level).find(Boolean)
// which — despite the name "bestConfidence" — just returns the FIRST
// profile in array order (pillar.target_icps generation order, not a
// confidence-tier order) that has any non-empty confidence_level. A
// pillar whose target_icps lists a low-confidence ICP before a
// high-confidence one would show "Low" even though one of its own
// matched profiles is genuinely "High". The fix ranks matched profiles
// by the same CONF_ORDER ordinal scale strategyShared already uses to
// sort Avatars profiles by confidence, and picks the best-ranked one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const strategy = bookster.iap.strategy;

// Force a low-before-high ordering on one real pillar's target_icps: the
// bug reproduces exactly when a pillar's FIRST-listed matched ICP is not
// its highest-confidence one.
const pillar = strategy.message_pillars.find((p: { id: string }) => p.id === "PILLAR_TimeEfficiency");
if (!pillar) throw new Error("fixture missing PILLAR_TimeEfficiency");
const lowProfile = strategy.icp_profiles.find((p: { profile_id: string }) => p.profile_id === "ICP_BOOK0_MaleEfficiencyPocket");
const highProfile = strategy.icp_profiles.find((p: { profile_id: string }) => p.profile_id === "ICP_BOOK0_C2_TimePoorLearner");
if (!lowProfile || !highProfile) throw new Error("fixture missing expected ICP profiles");
lowProfile.confidence_level = "low";
highProfile.confidence_level = "high";
// Low-confidence ICP listed FIRST, high-confidence one SECOND — the exact
// shape that broke `.find(Boolean)`.
pillar.target_icps = [lowProfile.profile_id, highProfile.profile_id];

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { CommunicationsView } from "../strategy/CommunicationsView";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderCommunications() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <CommunicationsView />
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

describe("CommunicationsView — pillar card 'Who responds' confidence badge", () => {
  it("shows the HIGH confidence badge, not the first-listed (low) ICP's, when target_icps lists low before high", () => {
    renderCommunications();

    const card = screen.getByTestId(`pillar-card-${pillar.id}`);
    expect(within(card).getByText("High")).toBeTruthy();
    expect(within(card).queryByText("Low")).toBeNull();
  });
});
