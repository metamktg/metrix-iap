// ─── Optional inputs never blank a surface ─────────────────────────────
// Owner principle: nothing prohibits data from being shown because an
// OPTIONAL input is missing — show what exists and name what is missing.
// Each case here removes ONE input from the checked-in fixture and asserts
// the page still renders what the other inputs support:
//
//   Engagement Funnel — no demographic rows, placement/device rows exist
//   Budget            — no campaign summary, concept rows exist
//   Findings          — only failure patterns
//   Audience / DNA    — the stored result scope empties the rows: the scope
//                       bar stays on screen and the message says the rows
//                       exist under other events

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

let activeSeed = baseSeed;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: [] }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { EngagementFunnelView, accountHasVideoCreative } from "../EngagementFunnelView";
import { BudgetView } from "../BudgetView";
import { FindingsView } from "../FindingsView";
import { AudienceView } from "../AudienceView";
import { AnalysisDnaView } from "../AnalysisDnaView";
import { AvatarsView } from "../../strategy/AvatarsView";
import { writeStoredScopeId } from "@/lib/result-scope";

const SESSION_KEY = "metrix_active_account_v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Acct = any;

function seedWith(mutate: (acct: Acct) => void) {
  const seed = JSON.parse(JSON.stringify(baseSeed));
  const acct = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
  mutate(acct);
  return seed;
}

function renderView(View: React.ComponentType) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <View />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
  // result-scope.ts caches the per-account stored choice in module memory
  // after the first read, so clearing sessionStorage alone does not reset it.
  writeStoredScopeId("bookster", null);
});
afterEach(() => cleanup());

describe("Engagement Funnel — demographic export absent", () => {
  it("lands on the Placement breakdown, disables the demo-only modes with the reason named, and never blanks", () => {
    activeSeed = seedWith((a) => { a.iap.analysis.demographic_registration_signal = []; });
    renderView(EngagementFunnelView);
    expect(screen.queryByText("No engagement data")).toBeNull();
    expect(screen.getByTestId("funnel-no-demo-note")).toBeTruthy();
    expect(screen.getByText("Placement breakdown")).toBeTruthy();
    const funnel = screen.getByRole("button", { name: /^Funnel$/ }) as HTMLButtonElement;
    expect(funnel.disabled).toBe(true);
    expect(funnel.title).toContain("Demographics export");
    const audience = screen.getByRole("button", { name: /^Audience$/ }) as HTMLButtonElement;
    expect(audience.disabled).toBe(true);
    const placement = screen.getByRole("button", { name: /^Placement$/ }) as HTMLButtonElement;
    expect(placement.disabled).toBe(false);
  });

  it("is pending only when demographic, placement AND device rows are all absent", () => {
    activeSeed = seedWith((a) => {
      a.iap.analysis.demographic_registration_signal = [];
      a.iap.analysis.v3_placement_signal = [];
      a.iap.analysis.c4e_placement_signal = [];
      a.iap.analysis.device_delivery_signal = [];
    });
    renderView(EngagementFunnelView);
    expect(screen.getByText("No engagement data")).toBeTruthy();
  });

  it("shows the video-metrics caveat only when the account has a video creative", () => {
    renderView(EngagementFunnelView);
    expect(screen.queryByTestId("video-metrics-note")).toBeNull();
    cleanup();
    activeSeed = seedWith((a) => {
      a.ads = [{ ...(a.ads?.[0] ?? { ad_name: "A1" }), creative: { headline: null, primary_text: null, description: null, cta_type: null, link_destination: null, image_name: null, video_name: "hero.mp4", source: "performance_export" } }];
    });
    renderView(EngagementFunnelView);
    expect(screen.getByTestId("video-metrics-note")).toBeTruthy();
    // No titled "not available" box — a plain caveat.
    expect(screen.queryByText("Video engagement metrics not available")).toBeNull();
  });

  it("accountHasVideoCreative reads the account's own records, never assumes", () => {
    expect(accountHasVideoCreative(null)).toBe(false);
    expect(accountHasVideoCreative({ ads: [{ ad_name: "a", asset_filename: "clip.MOV" }], creative_assets: [] })).toBe(true);
    expect(accountHasVideoCreative({ ads: [{ ad_name: "a", asset_filename: "still.png" }], creative_assets: [{ asset_type: "video_asset" } as never] })).toBe(true);
    expect(accountHasVideoCreative({ ads: [{ ad_name: "a", asset_filename: "still.png" }], creative_assets: [] })).toBe(false);
  });
});

describe("Budget — campaign summary absent", () => {
  it("gates only the event-total tiles and still renders concept and placement spend", () => {
    activeSeed = seedWith((a) => { delete a.iap.campaign_summary; });
    renderView(BudgetView);
    expect(screen.queryByText("No budget data")).toBeNull();
    expect(screen.getByTestId("budget-no-summary-note")).toBeTruthy();
    expect(screen.getByText("Spend by concept")).toBeTruthy();
    expect(screen.getByText("Placement spend")).toBeTruthy();
    expect(screen.getByText("No campaign summary")).toBeTruthy();
  });
});

describe("Findings — failure patterns are intelligence", () => {
  it("renders the flagged-campaigns strip (and the scope bar) when failure patterns are the only intelligence", () => {
    activeSeed = seedWith((a) => {
      a.iap.intelligence.concept_scores = [];
      a.iap.intelligence.summary.executive_summary = { ...a.iap.intelligence.summary.executive_summary, top_finding: undefined };
      a.iap.analysis.concept_rollup = [];
      a.iap.optimization_loop = { ...(a.iap.optimization_loop ?? {}), recommendation_cards: [] };
    });
    renderView(FindingsView);
    expect(screen.queryByText("No intelligence data yet")).toBeNull();
    expect(screen.getByText("Flagged campaigns")).toBeTruthy();
    expect(screen.getByTestId("result-scope-bar")).toBeTruthy();
    // Section eyebrow spelled like every other analysis page, not "Analyze".
    expect(screen.queryByText("Analyze")).toBeNull();
  });
});

describe("Audience / Creative DNA — a stored scope that empties the rows", () => {
  // Bookster's bottom-line totals name four events; store a scope the rows
  // do not carry and the page must keep the switch on screen and say the
  // rows exist under another event — not "no signal".
  it("Audience keeps the scope bar above the empty state and counts the rows under other events", () => {
    activeSeed = seedWith((a) => {
      for (const r of a.iap.analysis.demographic_registration_signal) r["Result type"] = "onb_initiate_checkout";
    });
    writeStoredScopeId("bookster", "event:Mobile app installs");
    renderView(AudienceView);
    expect(screen.getByText("No demographic signal")).toBeTruthy();
    expect(screen.getByTestId("result-scope-bar")).toBeTruthy();
    expect(screen.getByText(/62 demographic rows exist under other result events/)).toBeTruthy();
  });

  it("Creative DNA keeps the scope bar above the empty state and counts the variable rows under other events", () => {
    activeSeed = seedWith((a) => { a.iap.strategy.variable_combinations = []; });
    writeStoredScopeId("bookster", "event:Mobile app installs");
    renderView(AnalysisDnaView);
    expect(screen.getByText("No creative DNA signal")).toBeTruthy();
    const bar = screen.getByTestId("result-scope-bar");
    expect(within(bar).getAllByTestId("result-scope-chip").length).toBeGreaterThan(1);
    expect(screen.getByText(/31 variable rows exist under other result events/)).toBeTruthy();
  });
});

describe("Avatars — profile detail with none of its three optional inputs", () => {
  it("keeps a disabled disclosure that names the inputs instead of vanishing", () => {
    activeSeed = seedWith((a) => {
      delete a.mst; // no matrix → no measured DNA for any profile
      a.iap.strategy.active_hypotheses = [];
      a.iap.analysis.v3_placement_signal = [];
      a.iap.analysis.c4e_placement_signal = [];
      for (const p of a.iap.strategy.icp_profiles) {
        p.message_resonance = null;
        p.demographic_foundation = null;
        p.psychographic_profile = null;
        p.behavioral_signals = null;
        p.funnel_entry_point = null;
      }
    });
    renderView(AvatarsView);
    const disabled = screen.getAllByTestId(/^profile-detail-disabled-/);
    expect(disabled.length).toBeGreaterThan(0);
    const btn = disabled[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain("placement rows");
    expect(btn.title).toContain("copy approach");
    expect(btn.title).toContain("ICP theory");
  });
});
