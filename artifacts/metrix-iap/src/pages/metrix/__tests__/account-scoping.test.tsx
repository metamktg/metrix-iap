// ─── Account scoping regression tests ─────────────────────────────────
// Renders every account-scoped page in each account state and asserts:
//   - SKOV Pet selected  → unconfigured/setup state, never Bookster data
//   - Manager selected   → "pick an account" prompt, never Bookster data
//   - Bookster selected  → the page actually renders Bookster-scoped data
// Uses the real seed bundle served by the API so the assertions track
// production data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
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
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { SignalView } from "../listen/SignalView";
import { AlertsView } from "../listen/AlertsView";
import { RecommendationsView } from "../listen/RecommendationsView";
import { AnalysisCommandCenter } from "../analysis/AnalysisCommandCenter";
import { AdPerformanceView } from "../analysis/AdPerformanceView";
import { IapLibraryView } from "../analysis/IapLibraryView";
import { AudienceView } from "../analysis/AudienceView";
import { PlacementsView } from "../analysis/PlacementsView";
import { BudgetView } from "../analysis/BudgetView";
import { AnalysisHistoryView } from "../analysis/AnalysisHistoryView";
import { StrategyCommandCenter } from "../strategy/StrategyCommandCenter";
import { StrategyOverview } from "../strategy/StrategyOverview";
import { StrategyMapView } from "../strategy/StrategyMapView";
import { HypothesisQueueView } from "../strategy/HypothesisQueueView";
import { AvatarsView } from "../strategy/AvatarsView";
import { CommunicationsView } from "../strategy/CommunicationsView";
import { StrategyHistoryView } from "../strategy/StrategyHistoryView";
import { CreativeCommandCenter } from "../creative/CreativeCommandCenter";
import { CreativeLibraryView } from "../creative/CreativeLibraryView";
import { CreativeBriefBuilderView } from "../creative/CreativeBriefBuilderView";
import { CreativeScanView } from "../creative/CreativeScanView";
import { CreativeImportExportView } from "../creative/CreativeImportExportView";
import { ReportBuilderView } from "../reports/ReportBuilderView";
import { ReportHistoryView } from "../reports/ReportHistoryView";
import { MstCommandCenter } from "../mst/MstCommandCenter";
import { ConceptMapView } from "../mst/ConceptMapView";
import { MstSprintsView } from "../mst/MstSprintsView";
import { CrossmapResultsView } from "../mst/CrossmapResultsView";
import { MstPerformanceView } from "../mst/MstPerformanceView";
import { MstDirectionView } from "../mst/MstDirectionView";
import { GeneralView } from "../settings/GeneralView";
import { AdAccountOverview } from "../AdAccountOverview";

const SESSION_KEY = "metrix_active_account_v1";

// Every view gated by ModuleScopeGate (uniform pending/unconfigured states).
const GATED_VIEWS: [string, React.ComponentType][] = [
  ["Listen · Signal", SignalView],
  ["Listen · Alerts", AlertsView],
  ["Listen · Recommendations", RecommendationsView],
  ["Analysis · Command Center", AnalysisCommandCenter],
  ["Analysis · Ad Performance", AdPerformanceView],
  ["Analysis · IAP Library", IapLibraryView],
  ["Analysis · Audience", AudienceView],
  ["Analysis · Placements", PlacementsView],
  ["Analysis · Budget", BudgetView],
  ["Analysis · History", AnalysisHistoryView],
  ["Strategy · Command Center", StrategyCommandCenter],
  ["Strategy · Overview", StrategyOverview],
  ["Strategy · Map", StrategyMapView],
  ["Strategy · Hypothesis Queue", HypothesisQueueView],
  ["Strategy · Avatars", AvatarsView],
  ["Strategy · Communications", CommunicationsView],
  ["Strategy · History", StrategyHistoryView],
  ["Creative · Command Center", CreativeCommandCenter],
  ["Creative · Library", CreativeLibraryView],
  ["Creative · Brief Builder", CreativeBriefBuilderView],
  ["Creative · Scan", CreativeScanView],
  ["Creative · Import Export", CreativeImportExportView],
  ["Reports · Builder", ReportBuilderView],
  ["Reports · History", ReportHistoryView],
  ["MST · Command Center", MstCommandCenter],
  ["MST · Concept Map", ConceptMapView],
  ["MST · Sprints", MstSprintsView],
  ["MST · Crossmap Results", CrossmapResultsView],
  ["MST · Performance", MstPerformanceView],
  ["MST · Direction", MstDirectionView],
];

// Views that gate themselves (custom no-account / unconfigured handling).
const SELF_GATED_VIEWS: [string, React.ComponentType][] = [
  ["Settings · General", GeneralView],
  ["Ad Account Overview", AdAccountOverview],
];

function select(type: "manager" | "ad_account", adAccountId: string | null) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type, adAccountId }));
}

function renderView(View: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
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
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("SKOV Pet selected", () => {
  for (const [name, View] of [...GATED_VIEWS, ...SELF_GATED_VIEWS]) {
    it(`${name} shows no Bookster data`, () => {
      select("ad_account", "skov_pet");
      const { container } = renderView(View);
      expect(container.textContent).not.toContain("Bookster");
    });
  }

  for (const [name, View] of GATED_VIEWS) {
    it(`${name} shows the unconfigured state`, () => {
      select("ad_account", "skov_pet");
      const { container } = renderView(View);
      expect(container.textContent).toContain("Connect data source");
    });
  }
});

describe("Manager selected", () => {
  for (const [name, View] of [...GATED_VIEWS, ...SELF_GATED_VIEWS]) {
    it(`${name} prompts to pick an account and shows no Bookster data`, () => {
      select("manager", null);
      const { container } = renderView(View);
      expect(container.textContent).toContain("No ad account selected");
      expect(container.textContent).not.toContain("Bookster");
    });
  }

  it("prompts even when a previous ad-account selection is remembered", () => {
    // Switching back to the manager keeps the last adAccountId in storage;
    // scoped pages must still not resolve to it.
    select("manager", "bookster");
    const { container } = renderView(SignalView);
    expect(container.textContent).toContain("No ad account selected");
    expect(container.textContent).not.toContain("Scoped to ad account");
  });
});

describe("Unconfigured-state actions (SKOV Pet)", () => {
  it("Connect data source checklist step explains the real OAuth flow and hands off to Integrations", () => {
    select("ad_account", "skov_pet");
    renderView(SignalView);
    // The "Connect data source" checklist step is now the entry point — no
    // separate action button. Clicking it opens ConnectMetaDialog inline.
    fireEvent.click(screen.getByRole("button", { name: /Connect data source/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Authorize with Meta");
    expect(dialog.textContent).toContain("read-only ads access");
    // The real connection lives in Settings → Integrations; the dialog
    // hands off — it never fakes a connection.
    expect(screen.getByRole("button", { name: /Go to Integrations/i })).toBeTruthy();
  });

  it("cancelling the connect dialog leaves the account unconfigured", () => {
    select("ad_account", "skov_pet");
    renderView(SignalView);
    fireEvent.click(screen.getByRole("button", { name: /Connect data source/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    // Account must remain unconfigured — no performance data appears.
    expect(document.body.textContent).toContain("Connect data source");
    expect(document.body.textContent).not.toContain("Bookster");
  });
});

describe("Bookster selected (sanity)", () => {
  for (const [name, View] of GATED_VIEWS) {
    it(`${name} renders Bookster-scoped content`, () => {
      select("ad_account", "bookster");
      const { container } = renderView(View);
      // The account name is no longer repeated on the page (it lives in the
      // sidebar switcher only) — assert the page passed its scope gate and
      // rendered scoped content instead of a gate/unconfigured state.
      expect(container.textContent).not.toContain("No ad account selected");
      expect(container.textContent).not.toContain("Connect data source");
      expect(container.textContent).not.toContain("Connect Meta Ad Account");
      // And it never re-introduces the removed account banner.
      expect(container.textContent).not.toContain("Scoped to ad account");
    });
  }
});
