// ─── Strategy Map: pillar disclosure hierarchy ────────────────────────
//
// Expanding a pillar reveals five things, and the order they appear in is
// the strategy's own hierarchy: who it targets, then where in the funnel it
// applies, then how to build it, then where to run it, then how to scale.
// Audience first because everything below is contingent on it; scale last
// because it only makes sense once the rest is settled.
//
// That order lived only in the declaration order of a module-private array,
// so reordering it — or dropping a section — changed what a user reads with
// nothing to object. These assertions read the ORDER OUT OF THE DOM rather
// than out of the array, so they hold against the rendered result and not
// merely the source.

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import seedBundle from "../../../../test-fixtures/metrix_seed_bundle.json";
import type { MessagePillar } from "@/lib/data/seedTypes";
import { PillarDetailSections, pillarHasDetails } from "../strategyShared";

afterEach(cleanup);

/** The strategy hierarchy, top to bottom, as a reader should meet it. */
const EXPECTED_ORDER = [
  "Targets",
  "Funnel application",
  "Execution specs",
  "Placement strategy",
  "Scaling guidance",
] as const;

/** A pillar from the real fixture that actually carries every section. */
function richestPillar(): MessagePillar {
  const accounts = (seedBundle as { ad_accounts?: any[] }).ad_accounts ?? [];
  const all: MessagePillar[] = accounts.flatMap(
    (a) => (a.iap?.strategy?.message_pillars ?? []) as MessagePillar[],
  );
  const withDetails = all.filter(pillarHasDetails);
  expect(
    withDetails.length,
    "fixture carries no pillar with disclosure sections. This suite would pass vacuously",
  ).toBeGreaterThan(0);
  // Pick the one with the most sections filled, so the order test sees the
  // longest sequence the UI can produce.
  return withDetails.sort(
    (a, b) => sectionCount(b) - sectionCount(a),
  )[0]!;
}

function sectionCount(p: MessagePillar): number {
  const keys = [
    "funnel_application",
    "execution_specifications",
    "placement_strategy",
    "scaling_guidance",
  ] as const;
  return (
    keys.filter((k) => typeof p[k] === "string" && (p[k] as string).length > 0)
      .length + ((p.target_icps?.length ?? 0) > 0 ? 1 : 0)
  );
}

/** Headings present in the rendered output, in document order. */
function renderedHeadingOrder(): string[] {
  const found: Array<{ text: string; top: number }> = [];
  for (const label of EXPECTED_ORDER) {
    const el = screen.queryByText(label);
    if (!el) continue;
    // compareDocumentPosition gives true document order in jsdom, where
    // layout coordinates are all zero.
    found.push({ text: label, top: domIndex(el) });
  }
  return found.sort((a, b) => a.top - b.top).map((f) => f.text);
}

function domIndex(el: Element): number {
  const all = Array.from(document.querySelectorAll("*"));
  return all.indexOf(el);
}

describe("Strategy Map · pillar disclosure hierarchy", () => {
  it("reveals sections in the strategy's own order, audience first", () => {
    const pillar = richestPillar();
    render(<PillarDetailSections pillar={pillar} />);

    const order = renderedHeadingOrder();
    expect(
      order.length,
      "no known section headings rendered. The labels may have been renamed",
    ).toBeGreaterThan(1);

    // Whatever subset this pillar carries, it must appear in the canonical
    // relative order — never shuffled.
    const canonical = EXPECTED_ORDER.filter((l) => order.includes(l));
    expect(order).toEqual([...canonical]);
  });

  it("puts Targets above every prose section when present", () => {
    const pillar = richestPillar();
    if ((pillar.target_icps?.length ?? 0) === 0) return;
    render(<PillarDetailSections pillar={pillar} />);

    const order = renderedHeadingOrder();
    expect(order[0], "audience is the top of the hierarchy").toBe("Targets");
  });

  it("renders nothing at all for a pillar with no disclosable content", () => {
    // Honest empty state: an expander that opens onto nothing is worse than
    // an expander that is not offered.
    const bare = { id: "P_BARE", name: "Bare pillar" } as unknown as MessagePillar;
    expect(pillarHasDetails(bare)).toBe(false);
    const { container } = render(<PillarDetailSections pillar={bare} />);
    expect(container.textContent?.trim()).toBe("");
  });

  it("offers the expander only when there is something behind it", () => {
    // pillarHasDetails gates the affordance; it must agree with what
    // PillarDetailSections actually renders, or the UI offers a dead control.
    const accounts = (seedBundle as { ad_accounts?: any[] }).ad_accounts ?? [];
    const all: MessagePillar[] = accounts.flatMap(
      (a) => (a.iap?.strategy?.message_pillars ?? []) as MessagePillar[],
    );
    const disagreements: string[] = [];
    for (const p of all) {
      const { container } = render(<PillarDetailSections pillar={p} />);
      const rendersSomething = (container.textContent ?? "").trim().length > 0;
      if (pillarHasDetails(p) !== rendersSomething) {
        disagreements.push(
          `${p.id}: pillarHasDetails=${pillarHasDetails(p)} but rendered=${rendersSomething}`,
        );
      }
      cleanup();
    }
    expect(
      disagreements,
      `Expander affordance disagrees with rendered content:\n${disagreements.join("\n")}`,
    ).toEqual([]);
  });
});
