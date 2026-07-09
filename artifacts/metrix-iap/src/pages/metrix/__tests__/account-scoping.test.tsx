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
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { SignalView } from "../listen/SignalView";
import { AlertsView } from "../listen/AlertsView";
import { RecommendationsView } from "../listen/RecommendationsView";
import { AnalysisOverview } from "../analysis/AnalysisOverview";
import { IapLibraryView } from "../analysis/IapLibraryView";
import { AudienceView } from "../analysis/AudienceView";
import { PlacementsView } from "../analysis/PlacementsView";
import { BudgetView } from "../analysis/BudgetView";
import { StrategyOverview } from "../strategy/StrategyOverview";
import { StrategyMapView } from "../strategy/StrategyMapView";
import { HypothesisQueueView } from "../strategy/HypothesisQueueView";
import { AvatarsView } from "../strategy/AvatarsView";
import { BriefBuilderView } from "../briefs/BriefBuilderView";
import { BriefHistoryView } from "../briefs/BriefHistoryView";
import { NewReportView } from "../reports/NewReportView";
import { ReportHistoryView } from "../reports/ReportHistoryView";
import { ExportsView } from "../reports/ExportsView";
import { ConceptMapView } from "../mst/ConceptMapView";
import { MatrixBuilderView } from "../mst/MatrixBuilderView";
import { CreativeScanView } from "../mst/CreativeScanView";
import { CrossmapResultsView } from "../mst/CrossmapResultsView";
import { AccountSettingsView } from "../settings/AccountSettingsView";
import { AdAccountOverview } from "../AdAccountOverview";

const SESSION_KEY = "metrix_active_account_v1";

// Every view gated by ModuleScopeGate (uniform pending/unconfigured states).
const GATED_VIEWS: [string, React.ComponentType][] = [
  ["Listen · Signal", SignalView],
  ["Listen · Alerts", AlertsView],
  ["Listen · Recommendations", RecommendationsView],
  ["Analysis · Overview", AnalysisOverview],
  ["Analysis · IAP Library", IapLibraryView],
  ["Analysis · Audience", AudienceView],
  ["Analysis · Placements", PlacementsView],
  ["Analysis · Budget", BudgetView],
  ["Strategy · Overview", StrategyOverview],
  ["Strategy · Map", StrategyMapView],
  ["Strategy · Hypothesis Queue", HypothesisQueueView],
  ["Strategy · Avatars", AvatarsView],
  ["Briefs · Brief Builder", BriefBuilderView],
  ["Briefs · History", BriefHistoryView],
  ["Reports · New Report", NewReportView],
  ["Reports · History", ReportHistoryView],
  ["Reports · Exports", ExportsView],
  ["MST · Concept Map", ConceptMapView],
  ["MST · Matrix Builder", MatrixBuilderView],
  ["MST · Creative Scan", CreativeScanView],
  ["MST · Crossmap Results", CrossmapResultsView],
];

// Views that gate themselves (custom no-account / unconfigured handling).
const SELF_GATED_VIEWS: [string, React.ComponentType][] = [
  ["Settings · Account", AccountSettingsView],
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
            <View />
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
      expect(container.textContent).toContain("Connect Meta Ad Account");
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
  it("Connect Meta Ad Account explains the real OAuth flow and hands off to Integrations", () => {
    select("ad_account", "skov_pet");
    renderView(SignalView);
    fireEvent.click(screen.getByRole("button", { name: /Connect Meta Ad Account/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /Connect Meta Ad Account/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    // Account must remain unconfigured — no performance data appears.
    expect(document.body.textContent).toContain("Connect Meta Ad Account");
    expect(document.body.textContent).not.toContain("Bookster");
  });

  it("Add Manual Import opens the real staging upload dialog", () => {
    select("ad_account", "skov_pet");
    renderView(SignalView);
    fireEvent.click(screen.getByRole("button", { name: /Add Manual Import/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Add Manual Import");
    expect(dialog.textContent).toContain("Performance export (CSV)");
    // Files are staged raw for the analysis pipeline — never parsed into
    // performance data at upload time.
    expect(dialog.textContent).toContain("never at upload time");
  });
});

describe("Bookster selected (sanity)", () => {
  for (const [name, View] of GATED_VIEWS) {
    it(`${name} renders Bookster-scoped content`, () => {
      select("ad_account", "bookster");
      const { container } = renderView(View);
      expect(container.textContent).toContain("Bookster");
      expect(container.textContent).not.toContain("Connect Meta Ad Account");
    });
  }
});
