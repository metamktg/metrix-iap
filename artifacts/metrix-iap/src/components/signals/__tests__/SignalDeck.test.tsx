// ─── SignalDeck: what the card is allowed to claim ────────────────────
//
// The deck's whole risk is claiming more than the producer supplied — a
// rank it was not given, a number parsed out of prose, a verdict on a
// delta whose direction is not stated. These pin each one.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignalDeck } from "../SignalDeck";
import type { SignalCard } from "@/lib/data/seedTypes";

afterEach(cleanup);

const base = (over: Partial<SignalCard> = {}): SignalCard => ({
  id: "s1",
  account_id: "acct",
  scope: "account",
  title: "Fallback title",
  rationale: "The rationale every card carries.",
  impact: "medium",
  confidence: "medium",
  recommended_action: "Do the thing.",
  ...over,
});

describe("SignalDeck · the card leads with what was supplied", () => {
  it("leads with the metric when the producer gave one", () => {
    render(<SignalDeck cards={[base({ metric_value: "$18.40", metric_context: "vs $23.10 account mean", headline: "Testimonial hook is cheaper" })]} />);
    expect(screen.getByText("$18.40")).toBeTruthy();
    expect(screen.getByText("vs $23.10 account mean")).toBeTruthy();
  });

  it("leads with the headline when there is no metric, and shows no number", () => {
    const { container } = render(<SignalDeck cards={[base({ headline: "Frequency is climbing on the 45-54 pocket" })]} />);
    expect(screen.getByText("Frequency is climbing on the 45-54 pocket")).toBeTruthy();
    // Nothing may be parsed out of the prose to stand in for a metric.
    expect(container.querySelector(".text-h3")).toBeNull();
  });

  it("falls back to the title when there is no headline either", () => {
    render(<SignalDeck cards={[base()]} />);
    expect(screen.getByText("Fallback title")).toBeTruthy();
  });
});

describe("SignalDeck · a rank is never invented", () => {
  it("shows the raw impact and marks the card unranked when priority is absent", () => {
    render(<SignalDeck cards={[base({ impact: "high" })]} />);
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("unranked")).toBeTruthy();
  });

  it("uses the producer's priority when there is one, and does not mark it unranked", () => {
    render(<SignalDeck cards={[base({ priority: "critical" })]} />);
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.queryByText("unranked")).toBeNull();
  });

  it("orders ranked cards by severity and leaves unranked ones at the end", () => {
    render(
      <SignalDeck
        cards={[
          base({ id: "a", title: "Info one", priority: "informational" }),
          base({ id: "b", title: "No rank" }),
          base({ id: "c", title: "Critical one", priority: "critical" }),
          base({ id: "d", title: "Important one", priority: "important" }),
        ]}
      />,
    );
    const titles = screen.getAllByRole("article").map((a) => within(a).getByRole("heading").textContent);
    expect(titles).toEqual(["Critical one", "Important one", "Info one", "No rank"]);
  });
});

describe("SignalDeck · a delta is reported, not judged", () => {
  it("shows the sign but does not colour a rise as good", () => {
    render(<SignalDeck cards={[base({ metric_value: "$41.00", delta_pct: 22.4 })]} />);
    const delta = screen.getByText("+22%");
    // A rise in a COST metric is bad; the card carries no direction field, so
    // neither status colour may be applied.
    expect(delta.className).not.toContain("status-success");
    expect(delta.className).not.toContain("status-danger");
  });

  it("shows a fall with its sign, equally unjudged", () => {
    render(<SignalDeck cards={[base({ metric_value: "$9.10", delta_pct: -18 })]} />);
    const delta = screen.getByText("-18%");
    expect(delta.className).not.toContain("status-success");
    expect(delta.className).not.toContain("status-danger");
  });

  it("renders no delta at all when none was measured", () => {
    render(<SignalDeck cards={[base({ metric_value: "$9.10", delta_pct: null })]} />);
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("keeps a measured zero, which is not the same as unmeasured", () => {
    render(<SignalDeck cards={[base({ metric_value: "$9.10", delta_pct: 0 })]} />);
    // No leading "+" on zero — there is no direction to signal.
    expect(screen.getByText("0.0%")).toBeTruthy();
  });
});

describe("SignalDeck · flags and evidence", () => {
  it("surfaces the validation flag its producer set", () => {
    render(<SignalDeck cards={[base({ needs_validation: true })]} />);
    expect(screen.getByText("validate")).toBeTruthy();
  });

  it("does not show a validation flag that was not set", () => {
    render(<SignalDeck cards={[base()]} />);
    expect(screen.queryByText("validate")).toBeNull();
  });

  it("shows the evidence trace when the card carries one", () => {
    render(<SignalDeck cards={[base({ evidence_ref: "cell/AAFE_HK_v3" })]} />);
    expect(screen.getByText("cell/AAFE_HK_v3")).toBeTruthy();
  });
});

describe("SignalDeck · the deck itself", () => {
  it("holds cards past the initial window behind one control", async () => {
    const u = userEvent.setup();
    const many = Array.from({ length: 9 }, (_, i) => base({ id: `s${i}`, title: `Signal ${i}` }));
    render(<SignalDeck cards={many} initialVisible={4} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    await u.click(screen.getByRole("button", { name: /Show all 9/ }));
    expect(screen.getAllByRole("article")).toHaveLength(9);
  });

  it("gives the action button an accessible name naming its card", async () => {
    const u = userEvent.setup();
    let opened: SignalCard | null = null;
    render(
      <SignalDeck
        cards={[base({ headline: "Frequency climbing" })]}
        actionLabel="Investigate"
        onOpen={(c) => { opened = c; }}
      />,
    );
    await u.click(screen.getByRole("button", { name: "Investigate: Frequency climbing" }));
    expect(opened).not.toBeNull();
  });

  it("renders no action control when the deck is read-only", () => {
    render(<SignalDeck cards={[base()]} />);
    expect(screen.queryByRole("button", { name: /Open/ })).toBeNull();
  });

  it("says so plainly when there is nothing to show", () => {
    render(<SignalDeck cards={[]} emptyLabel="No alerts on this account" />);
    expect(screen.getByText("No alerts on this account")).toBeTruthy();
  });
});
