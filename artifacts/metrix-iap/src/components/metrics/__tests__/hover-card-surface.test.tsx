// HoverCardContent's DEFAULT surface is the tokened one — the same
// popover-ground-over-blur, soft border and elevation step that popover.tsx
// and tooltip.tsx wear. It used to be `rounded-md border bg-popover shadow-md`,
// so every caller re-stated the whole surface to get the right one, and the
// one that did not (or dropped a class) sat beside a popover as a visibly
// different kind of panel.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/command-deck/components/ui/hover-card";

afterEach(cleanup);

describe("HoverCardContent default surface", () => {
  it("wears the tokened surface and not the stock shadow", () => {
    render(
      <HoverCard open>
        <HoverCardTrigger asChild>
          <button type="button">trigger</button>
        </HoverCardTrigger>
        <HoverCardContent data-testid="hc">body</HoverCardContent>
      </HoverCard>,
    );
    const el = document.querySelector('[data-testid="hc"]');
    expect(el).toBeTruthy();
    const cls = el!.className;
    for (const c of ["rounded-xl", "border-border/60", "bg-popover/95", "backdrop-blur-sm", "elevation-floating"]) {
      expect(cls).toContain(c);
    }
    expect(cls).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl)\b/);
    expect(cls).not.toMatch(/\brounded-md\b/);
  });
});
