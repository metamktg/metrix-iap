// ─── Recommendation slider ────────────────────────────────────────────
// The rail that carries derived direction on the overview and the command
// centres. What matters here is not that it scrolls — it is that a tile
// cannot state a number the rows do not have, and cannot be read without
// its provenance and its way to check.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import { getDecision, _resetForTest as resetDecisions } from "@/lib/data/decisionStore";
import { isInTray, getTrayItem, _resetForTest as resetTray } from "@/lib/data/trayStore";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RecommendationSlider } from "../RecommendationSlider";
import { deriveRecommendations } from "@/lib/data/recommendations";
import type { AdAccount } from "@/lib/data/seedTypes";
import type { DerivedRecommendation } from "@/lib/data/recommendations";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);
const bookster = (seed.ad_accounts as AdAccount[]).find((a) => a.id === "bookster")!;

beforeEach(() => {
  cleanup();
  resetDecisions();
  resetTray();
  localStorage.clear();
  // jsdom implements neither; the component must not depend on their effects.
  Element.prototype.scrollBy = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

const SCOPE = "bookster";

const rec = (o: Partial<DerivedRecommendation>): DerivedRecommendation => ({
  id: "derived:avoid:0",
  title: "Scale the C2 Row B lane",
  rationale: "C2 Row B carries the strongest cost per result in the account.",
  recommendedAction: "Isolate Row B as a dedicated ad set.",
  impact: "medium",
  confidence: "high for registration, directional for checkout",
  scope: "ad_account",
  actionGroup: "Budget actions",
  href: "/app/strategy/map",
  hrefLabel: "See the playbook",
  metric: { label: "Cost per result", value: "$12.40" },
  source: "strategy.scaling_playbook.avoid_combinations",
  stage: 3,
  derived: true,
  ...o,
});

describe("RecommendationSlider", () => {
  it("renders one tile per recommendation, each with its kind, provenance and a way to check it", () => {
    const recs = deriveRecommendations(bookster);
    render(<RecommendationSlider recs={recs} />);

    const tiles = screen.getAllByTestId("recommendation-tile");
    expect(tiles).toHaveLength(recs.length);
    expect(screen.getByTestId("recommendation-count").textContent).toBe(String(recs.length));

    for (const tile of tiles) {
      // Provenance is on the face, not only in the code.
      const provenance = within(tile).getByTitle(/^Source · /);
      expect(provenance).toBeTruthy();
      // And a way to go and check it (CrossLink renders a button that
      // navigates, so the role is button, not link).
      expect(within(tile).getAllByRole("button").length).toBeGreaterThan(0);
    }
  });

  it("states the absence of a number instead of showing a zero", () => {
    const withoutMetric: DerivedRecommendation = {
      id: "derived:validate:0",
      title: "Male 55-64 dedicated creative",
      rationale: "Named for validation by the strategy map.",
      recommendedAction: "Fund this as a test cell.",
      impact: "medium",
      confidence: "unvalidated",
      scope: "creative",
      actionGroup: "Creative actions",
      href: "/app/mst/sprints",
      hrefLabel: "Open the sprint matrix",
      metric: null,
      source: "strategy.scaling_playbook.validate",
      stage: 5,
      derived: true,
    };
    render(<RecommendationSlider recs={[withoutMetric]} />);
    expect(screen.getByTestId("recommendation-no-metric").textContent).toMatch(/No measured figure/i);
    expect(screen.queryByTestId("recommendation-metric")).toBeNull();
    expect(screen.queryByText(/\$0(\.00)?\b/)).toBeNull();
  });

  it("leads with the highest-stakes card the account has", () => {
    const recs = deriveRecommendations(bookster);
    render(<RecommendationSlider recs={recs} />);
    const first = screen.getAllByTestId("recommendation-tile")[0]!;
    expect(first.getAttribute("data-kind")).toBe("avoid");
  });

  it("keeps the paging controls visible and disabled at the ends rather than hiding them", () => {
    render(<RecommendationSlider recs={deriveRecommendations(bookster)} />);
    const prev = screen.getByRole("button", { name: "Previous recommendations" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "More recommendations" }) as HTMLButtonElement;
    // A control that vanishes under the cursor is worse than a disabled one:
    // both stay on screen, and with nothing to scroll (jsdom lays nothing
    // out) both are correctly disabled.
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);

    // Give the rail real overflow and it pages.
    const rail = screen.getByTestId("recommendation-rail");
    Object.defineProperty(rail, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(rail, "clientWidth", { value: 600, configurable: true });
    fireEvent.scroll(rail);
    expect((screen.getByRole("button", { name: "More recommendations" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "More recommendations" }));
    expect(Element.prototype.scrollBy).toHaveBeenCalled();
  });

  it("says why it is empty in the account's own words when it has nothing", () => {
    render(<RecommendationSlider recs={[]} emptyNote="Blocked on creative_scan for this account." />);
    expect(screen.getByTestId("recommendation-slider-empty")).toBeTruthy();
    expect(screen.getByText(/Blocked on creative_scan/)).toBeTruthy();
    expect(screen.queryByTestId("recommendation-tile")).toBeNull();
  });

  it("never renders a tile without a title or a rationale, whatever the source carried", () => {
    for (const account of seed.ad_accounts as AdAccount[]) {
      cleanup();
      const recs = deriveRecommendations(account);
      if (recs.length === 0) continue;
      render(<RecommendationSlider recs={recs} />);
      for (const tile of screen.getAllByTestId("recommendation-tile")) {
        expect(tile.textContent?.trim().length ?? 0).toBeGreaterThan(10);
      }
    }
  });
});

// ─── The rail as the next best action (owner, 2026-09-04) ──────────────
// What the hero card used to guarantee, the rail guarantees now: the top
// pending signal leads, a decision here is the same decision the deck
// makes, an approved tile is in the tray, a dismissed one is not, and the
// honest empty states tell "nothing derived" from "everything reviewed".

describe("RecommendationSlider, decidable", () => {
  it("carries Add to Tray and Dismiss only when it has a scope", () => {
    render(<RecommendationSlider recs={[rec({})]} />);
    expect(screen.queryByTestId("recommendation-approve")).toBeNull();
    expect(screen.queryByTestId("recommendation-dismiss")).toBeNull();
    cleanup();
    render(<RecommendationSlider recs={[rec({})]} scopeId={SCOPE} />);
    expect(screen.getByTestId("recommendation-approve")).toBeTruthy();
    expect(screen.getByTestId("recommendation-dismiss")).toBeTruthy();
  });

  it("approve records the decision, files a durable tray item, and the next signal leads", () => {
    render(
      <RecommendationSlider
        scopeId={SCOPE}
        recs={[rec({ id: "derived:avoid:0", title: "First signal" }), rec({ id: "derived:scale:0", title: "Second signal" })]}
      />,
    );
    expect(screen.getByTestId("recommendation-count").textContent).toBe("2");
    const first = screen.getAllByTestId("recommendation-tile")[0]!;
    expect(within(first).getByRole("heading", { level: 4 }).getAttribute("title")).toBe("First signal");
    fireEvent.click(within(first).getByTestId("recommendation-approve"));

    expect(getDecision(SCOPE, "derived:avoid:0")).toBe("approved");
    expect(isInTray(SCOPE, "derived:avoid:0")).toBe(true);
    expect(getTrayItem(SCOPE, "derived:avoid:0")?.title).toBe("First signal");
    const tiles = screen.getAllByTestId("recommendation-tile");
    expect(tiles).toHaveLength(1);
    expect(within(tiles[0]!).getByRole("heading", { level: 4 }).getAttribute("title")).toBe("Second signal");
    expect(screen.getByTestId("recommendation-count").textContent).toBe("1");
  });

  it("dismiss rejects without a tray item, and once nothing is pending the rail says everything was reviewed", () => {
    render(<RecommendationSlider scopeId={SCOPE} recs={[rec({ id: "derived:avoid:0" })]} />);
    fireEvent.click(screen.getByTestId("recommendation-dismiss"));
    expect(getDecision(SCOPE, "derived:avoid:0")).toBe("rejected");
    expect(isInTray(SCOPE, "derived:avoid:0")).toBe(false);
    const empty = screen.getByTestId("recommendation-slider-empty");
    expect(empty.getAttribute("data-reason")).toBe("reviewed");
    expect(empty.textContent).toMatch(/All 1 recommendations reviewed/);
  });

  it("tells 'nothing derived' apart from 'everything reviewed'", () => {
    render(<RecommendationSlider scopeId={SCOPE} recs={[]} emptyNote="Blocked on creative_scan for this account." />);
    const empty = screen.getByTestId("recommendation-slider-empty");
    expect(empty.getAttribute("data-reason")).toBe("none");
    expect(empty.textContent).toMatch(/Blocked on creative_scan/);
  });
});

describe("RecommendationSlider drawer", () => {
  it("the title opens the drawer with the whole reason, the action, the confidence in its own words, the provenance and the decision", () => {
    render(<RecommendationSlider scopeId={SCOPE} recs={[rec({})]} />);
    expect(screen.queryByTestId("recommendation-drawer")).toBeNull();
    fireEvent.click(screen.getByTestId("recommendation-open"));

    const drawer = screen.getByTestId("recommendation-drawer");
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(within(drawer).getByText("C2 Row B carries the strongest cost per result in the account.")).toBeTruthy();
    expect(within(drawer).getByText("Isolate Row B as a dedicated ad set.")).toBeTruthy();
    // The engine's own words, never a percentage, never title-cased.
    expect(within(drawer).getByText("high for registration, directional for checkout")).toBeTruthy();
    expect(within(drawer).getByText("Source · strategy.scaling_playbook.avoid_combinations")).toBeTruthy();
    expect(within(drawer).getByTestId("recommendation-drawer-metric").textContent).toContain("$12.40");
    expect(within(drawer).getByText(/Nothing is applied to a live campaign/)).toBeTruthy();

    fireEvent.click(within(drawer).getByTestId("recommendation-drawer-approve"));
    expect(getDecision(SCOPE, "derived:avoid:0")).toBe("approved");
    expect(isInTray(SCOPE, "derived:avoid:0")).toBe(true);
    // A decided card leaves the rail and its drawer closes with it.
    expect(screen.queryByTestId("recommendation-drawer")).toBeNull();
    expect(screen.getByTestId("recommendation-slider-empty")).toBeTruthy();
  });

  it("a read-only rail's drawer carries the reason and the evidence link but no decision", () => {
    render(<RecommendationSlider recs={[rec({})]} />);
    fireEvent.click(screen.getByTestId("recommendation-open"));
    const drawer = screen.getByTestId("recommendation-drawer");
    expect(within(drawer).getByText("See the playbook")).toBeTruthy();
    expect(within(drawer).queryByTestId("recommendation-drawer-approve")).toBeNull();
    expect(within(drawer).queryByTestId("recommendation-drawer-dismiss")).toBeNull();
  });

  it("a mouse drag on the rail's ground scrolls it and swallows the click that would land on a tile", () => {
    render(<RecommendationSlider recs={[rec({})]} />);
    const rail = screen.getByTestId("recommendation-rail");
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", clientX: 200, pointerId: 1 });
    const move = new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerType: "mouse", clientX: 120, pointerId: 1 });
    const up = new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse", clientX: 120, pointerId: 1 });
    fireEvent(rail, down);
    fireEvent(rail, move);
    expect(rail.scrollLeft).toBe(80);
    fireEvent(rail, up);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();

    // The click the browser fires after that drag is not an open.
    fireEvent.click(screen.getByTestId("recommendation-open"));
    expect(screen.queryByTestId("recommendation-drawer")).toBeNull();
    // The next, real click is.
    fireEvent.click(screen.getByTestId("recommendation-open"));
    expect(screen.getByTestId("recommendation-drawer")).toBeTruthy();
  });

  it("the arrow keys scroll the rail only when the rail itself has focus", () => {
    render(<RecommendationSlider recs={[rec({}), rec({ id: "derived:scale:0" })]} />);
    const rail = screen.getByTestId("recommendation-rail");
    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(Element.prototype.scrollBy).toHaveBeenCalledTimes(1);
    // A key pressed on a tile's button belongs to the button.
    fireEvent.keyDown(screen.getAllByTestId("recommendation-open")[0]!, { key: "ArrowRight" });
    expect(Element.prototype.scrollBy).toHaveBeenCalledTimes(1);
  });
});
