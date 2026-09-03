// ─── Recommendation slider ────────────────────────────────────────────
// The rail that carries derived direction on the overview and the command
// centres. What matters here is not that it scrolls — it is that a tile
// cannot state a number the rows do not have, and cannot be read without
// its provenance and its way to check.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
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
  // jsdom implements neither; the component must not depend on their effects.
  Element.prototype.scrollBy = vi.fn();
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
