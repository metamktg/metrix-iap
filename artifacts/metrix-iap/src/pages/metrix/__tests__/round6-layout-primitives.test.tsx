// ─── Audit round 6 · the layout primitives behind the 390 px findings ────
// jsdom has no layout, so the 390 px verdicts themselves come from the
// route shots (`shoot:routes`, SHOOT_WIDTHS=390) recorded in the register.
// What a unit test CAN hold are the primitive-level rules the fixes rest on,
// each of which was a one-line regression waiting to recur:
//
//   · SegmentedToggle collapses to icon-only ONLY when an option has an icon;
//     without one the label stays (two switches rendered empty pills).
//   · PendingState carries horizontal padding (Billing's paragraph ran edge
//     to edge).
//   · ModuleHeader's account-name span may break below lg (it clipped the
//     account name mid-token on 39 account-scoped pages).
//   · The shared scroller exists in index.css with its edge fade, the rails
//     use it, and a `.nc-table` inside a scroller keeps its content width.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Layers } from "lucide-react";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { PendingState, SegmentedToggle } from "../shared";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => fs.readFileSync(path.join(src, rel), "utf-8");

describe("SegmentedToggle · responsiveLabels", () => {
  it("keeps the label visible at every width when the options carry no icon", () => {
    render(
      <TooltipProvider>
        <SegmentedToggle
          options={[{ id: "spend", label: "Spend" }, { id: "results", label: "Results" }]}
          active="spend"
          onChange={() => {}}
          ariaLabel="Rank events by"
          responsiveLabels
        />
      </TooltipProvider>,
    );
    const label = screen.getByText("Spend");
    expect(label.className).not.toContain("hidden");
    expect(screen.getByText("Results").className).not.toContain("hidden");
  });

  it("collapses to icon-only below sm when an option carries an icon", () => {
    render(
      <TooltipProvider>
        <SegmentedToggle
          options={[{ id: "a", label: "Segments", Icon: Layers }, { id: "b", label: "Dates", Icon: Layers }]}
          active="a"
          onChange={() => {}}
          ariaLabel="Segment by"
          responsiveLabels
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Segments").className).toContain("hidden sm:inline");
    // The accessible name survives the collapse.
    expect(screen.getByRole("button", { name: "Segments" })).toBeTruthy();
  });
});

describe("PendingState", () => {
  it("carries horizontal padding so its paragraph never runs edge to edge", () => {
    const { container } = render(<PendingState title="Nothing yet" message="A sentence that explains why this surface is empty." />);
    expect((container.firstElementChild as HTMLElement).className).toContain("px-6");
  });
});

describe("the shared scroller and the table floor (index.css)", () => {
  const css = read("index.css");

  it("defines .mx-scroll-x as a hidden-scrollbar scroller", () => {
    const block = css.slice(css.indexOf(".mx-scroll-x {"), css.indexOf(".mx-scroll-x::-webkit-scrollbar"));
    expect(block).toContain("overflow-x: auto");
    expect(block).toContain("overscroll-behavior-x: contain");
    expect(block).toContain("scrollbar-width: none");
    // No static mask on the base rule: a fade that does not follow the scroll
    // dims the first tab and the rail's border on every rail that fits.
    expect(block).not.toContain("mask-image");
  });

  it("the edge fade is scroll-driven, below 1024 px, and absent where the browser cannot drive it", () => {
    const fade = css.slice(css.indexOf("@supports (animation-timeline: scroll())"), css.indexOf("@keyframes progress-slide"));
    expect(fade).toMatch(/@media \(width < 1024px\)\s*\{\s*\.mx-scroll-x\s*\{/);
    expect(fade).toContain("animation-timeline: scroll(self x)");
    expect(fade).toContain("mask-image: linear-gradient(to right, transparent 0, #000 var(--mx-fade-l), #000 calc(100% - var(--mx-fade-r)), transparent 100%)");
    // Both widths start at 0 (a fully opaque mask): a container whose timeline
    // never activates, because nothing overflows, shows no fade.
    expect(css).toMatch(/@property --mx-fade-l \{ syntax: "<length>"; inherits: false; initial-value: 0px; \}/);
    expect(css).toMatch(/@property --mx-fade-r \{ syntax: "<length>"; inherits: false; initial-value: 0px; \}/);
    const frames = css.slice(css.indexOf("@keyframes mx-scroll-fade"), css.indexOf("@keyframes progress-slide"));
    expect(frames).toMatch(/0% \{ --mx-fade-l: 0px; --mx-fade-r: 14px; \}/);
    expect(frames).toMatch(/100% \{ --mx-fade-l: 14px; --mx-fade-r: 0px; \}/);
  });

  it("gives a table inside a scroller its content width", () => {
    expect(css).toMatch(/\.mx-scroll-x > \.nc-table,\s*\.overflow-x-auto > \.nc-table \{ min-width: max-content; \}/);
  });

  it("defines the collapse-to-one pillar grid token", () => {
    expect(css).toMatch(/\.grid-cols-dashboard-3-md \{\s*grid-template-columns: repeat\(1, minmax\(0, 1fr\)\);/);
  });

  it("the rails scroll through the shared class, not four hand-copied patterns", () => {
    for (const rel of ["components/nav/TabRail.tsx", "components/data-module/ViewSwitcher.tsx", "components/data-module/BreakdownControl.tsx", "components/loop/LoopCommandChain.tsx"]) {
      const source = read(rel);
      expect(source, rel).toContain("mx-scroll-x");
      expect(source, rel).not.toContain("[&::-webkit-scrollbar]:hidden");
    }
  });
});

describe("Report History · the card's buttons wrap under the text instead of squeezing it", () => {
  it("the row wraps and the text block asks for a 12 rem floor", () => {
    const source = read("pages/metrix/reports/ReportHistoryView.tsx");
    expect(source).toContain('<div className="flex items-start gap-3 flex-wrap">');
    expect(source).toContain('<div className="flex-1 min-w-0 basis-48">');
  });
});

describe("Strategy Map · the centre column keeps its height in the stacked column", () => {
  it("sizes to its content below lg (flex-1 + overflow-y-auto collapsed it to 0 px)", () => {
    const source = read("pages/metrix/strategy/StrategyMapView.tsx");
    expect(source).toContain('<div className="max-lg:flex-none lg:flex-1 min-w-0 max-lg:overflow-visible lg:overflow-y-auto">');
    expect(source).toContain('className="max-lg:flex-none lg:flex-1 flex flex-col lg:flex-row min-h-0 max-lg:overflow-visible lg:overflow-hidden border-t border-border/30"');
  });
});

describe("ModuleHeader · the account name may break at phone width", () => {
  it("the separator stays glued at lg and up, and nothing above it forces one line", () => {
    const source = read("pages/metrix/shared.tsx");
    expect(source).toContain('<span className="max-lg:whitespace-normal lg:whitespace-nowrap">{accountName} ·</span> {title}');
    expect(source).toContain('<h1 className="mx-section-header__title break-words">');
  });

  it("the title block asks for a 16 rem floor, so a right-hand chip wraps under it instead of squeezing the H1", () => {
    const source = read("pages/metrix/shared.tsx");
    expect(source).toContain('<div className="flex-1 min-w-0 basis-64 mx-section-header">');
  });
});
