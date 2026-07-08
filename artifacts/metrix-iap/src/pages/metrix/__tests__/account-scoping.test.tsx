// ─── Account scoping regression tests ─────────────────────────────────
// Renders every account-scoped page in each account state and asserts:
//   - SKOV Pet selected  → unconfigured/setup state, never Bookster data
//   - Manager selected   → "pick an account" prompt, never Bookster data
//   - Bookster selected  → the page actually renders Bookster-scoped data
// Uses the real seed bundle served by the API so the assertions track
// production data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../../api-server/src/data/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { SignalView } from "../listen/SignalView";
import { AlertsView } from "../listen/AlertsView";
import { RecommendationsView } from "../listen/RecommendationsView";
import { IapLibraryView } from "../analysis/IapLibraryView";
import { ConceptMapView } from "../analysis/ConceptMapView";
import { BudgetView } from "../analysis/BudgetView";
import { HypothesisQueueView } from "../strategy/HypothesisQueueView";
import { AvatarsView } from "../strategy/AvatarsView";
import { BriefBuilderView } from "../briefs/BriefBuilderView";
import { BriefHistoryView } from "../briefs/BriefHistoryView";
import { MSTView } from "../MSTView";
import { ReportBuilderView } from "../ReportBuilderView";
import { SettingsView } from "../SettingsView";
import { AdAccountOverview } from "../AdAccountOverview";

const SESSION_KEY = "metrix_active_account_v1";

const GATED_VIEWS: [string, React.ComponentType][] = [
  ["Listen · Signal", SignalView],
  ["Listen · Alerts", AlertsView],
  ["Listen · Recommendations", RecommendationsView],
  ["Analysis · IAP Library", IapLibraryView],
  ["Analysis · Concept Map", ConceptMapView],
  ["Analysis · Budget", BudgetView],
  ["Strategy · Hypothesis Queue", HypothesisQueueView],
  ["Strategy · Avatars", AvatarsView],
  ["Briefs · Brief Builder", BriefBuilderView],
  ["Briefs · History", BriefHistoryView],
];

const SELF_GATED_VIEWS: [string, React.ComponentType][] = [
  ["MST", MSTView],
  ["Report Builder", ReportBuilderView],
  ["Settings", SettingsView],
  ["Ad Account Overview", AdAccountOverview],
];

function select(type: "manager" | "ad_account", adAccountId: string | null) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type, adAccountId }));
}

function renderView(View: React.ComponentType) {
  return render(
    <AccountProvider>
      <View />
    </AccountProvider>
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
