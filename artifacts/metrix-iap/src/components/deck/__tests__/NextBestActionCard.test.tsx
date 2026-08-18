// ─── NextBestActionCard tests ─────────────────────────────────────────
// Covers: top-impact selection among pending cards, Approve → decision +
// durable tray item + promotion of the next pending card, Dismiss →
// rejection without a tray item, the real qualitative confidence value
// on the badge (never a fabricated percentage), and the render-nothing
// path once every card is decided.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { NextBestActionCard } from "../NextBestActionCard";
import type { DeckCard } from "../RecommendationDeck";
import { getDecision, _resetForTest as resetDecisions } from "@/lib/data/decisionStore";
import { isInTray, getTrayItem, _resetForTest as resetTray } from "@/lib/data/trayStore";

const SCOPE = "bookster";

const card = (o: Partial<DeckCard>): DeckCard => ({
  id: "c1",
  title: "Scale the C2 Row B lane",
  rationale: "C2 Row B carries the strongest CPA in the account.",
  recommendedAction: "Isolate Row B as a dedicated ad set.",
  impact: "medium",
  confidence: "high",
  scope: "ad_account",
  actionGroup: "Budget actions",
  ...o,
});

beforeEach(() => {
  resetDecisions();
  resetTray();
  localStorage.clear();
});
afterEach(cleanup);

describe("NextBestActionCard", () => {
  it("shows the highest-impact pending card", () => {
    render(
      <NextBestActionCard
        scopeId={SCOPE}
        cards={[
          card({ id: "low", title: "Low card", impact: "low" }),
          card({ id: "high", title: "High card", impact: "high" }),
          card({ id: "med", title: "Med card", impact: "medium" }),
        ]}
      />,
    );
    expect(screen.getByTestId("next-best-action-title").textContent).toBe("High card");
  });

  it("renders the real qualitative confidence value, not a percentage", () => {
    render(
      <NextBestActionCard
        scopeId={SCOPE}
        cards={[card({ confidence: "high for registration, directional for checkout" })]}
      />,
    );
    expect(
      screen.getByText("high for registration, directional for checkout confidence"),
    ).toBeTruthy();
  });

  it("approve records the decision, adds a durable tray item, and promotes the next card", () => {
    render(
      <NextBestActionCard
        scopeId={SCOPE}
        cards={[
          card({ id: "first", title: "First card", impact: "high" }),
          card({ id: "second", title: "Second card", impact: "medium" }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("next-best-action-approve"));

    expect(getDecision(SCOPE, "first")).toBe("approved");
    expect(isInTray(SCOPE, "first")).toBe(true);
    expect(getTrayItem(SCOPE, "first")?.title).toBe("First card");
    // The hero promotes the next pending card.
    expect(screen.getByTestId("next-best-action-title").textContent).toBe("Second card");
  });

  it("dismiss rejects the card without adding a tray item", () => {
    render(<NextBestActionCard scopeId={SCOPE} cards={[card({ id: "only" })]} />);
    fireEvent.click(screen.getByTestId("next-best-action-dismiss"));

    expect(getDecision(SCOPE, "only")).toBe("rejected");
    expect(isInTray(SCOPE, "only")).toBe(false);
    // Nothing pending → the hero renders nothing.
    expect(screen.queryByTestId("next-best-action-card")).toBeNull();
  });

  it("renders nothing when there are no cards at all", () => {
    render(<NextBestActionCard scopeId={SCOPE} cards={[]} />);
    expect(screen.queryByTestId("next-best-action-card")).toBeNull();
  });
});
