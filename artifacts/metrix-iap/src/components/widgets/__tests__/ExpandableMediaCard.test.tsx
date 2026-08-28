// The morph itself cannot be asserted in jsdom — there is no layout engine,
// so framer-motion's shared-layout interpolation does nothing measurable.
// What CAN be asserted is everything the reference got wrong, which is the
// part that traps people.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ExpandableMediaCard } from "../ExpandableMediaCard";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function setup(props: Partial<React.ComponentProps<typeof ExpandableMediaCard>> = {}) {
  return render(
    <ExpandableMediaCard
      mediaKey="c2b-hook"
      media={<img alt="creative" src="/x.png" />}
      eyebrow="Creative · C2B"
      title="Read less, keep more"
      {...props}
    >
      <p>full detail panel</p>
    </ExpandableMediaCard>,
  );
}

describe("opening and closing", () => {
  it("reveals the detail only once expanded", () => {
    setup();
    expect(screen.queryByText("full detail panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Expand Read less/ }));
    expect(screen.getByText("full detail panel")).toBeTruthy();
  });

  it("announces itself as a modal dialog labelled by its own title", () => {
    // The reference expands into a bare <div>: no role, no aria-modal, no
    // label. A screen reader gets no signal that the page changed.
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)!.textContent).toContain("Read less, keep more");
  });

  // WHY THESE ASSERT aria-expanded AND NOT dialog REMOVAL
  // AnimatePresence keeps an exiting node mounted until its exit animation
  // finishes, and jsdom has no layout or animation frames, so the node never
  // leaves the tree here. That is an artefact of the environment, not of the
  // component — `aria-expanded` on the trigger IS the real state, and it
  // flips synchronously.
  //
  // (An earlier version of this comment pointed at a browser spec that did
  // not exist. The morph mechanic IS browser-verified — by
  // smoke:metrix-iap-shared-layout, against the creative tile — but this
  // component is not yet wired to a route, so nothing verifies ITS exit in a
  // real browser. Stated rather than implied.)

  it("closes on Escape", () => {
    // The trap this exists to prevent: the reference has no key handling, so
    // a keyboard user who opens it cannot get out.
    setup();
    const trigger = screen.getByRole("button", { name: /Expand/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a backdrop click", () => {
    const { container } = setup();
    const trigger = screen.getByRole("button", { name: /Expand/ });
    fireEvent.click(trigger);
    const backdrop = container.ownerDocument.querySelector(".backdrop-blur-md")!;
    fireEvent.click(backdrop);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("returns focus to the tile it came from", () => {
    // In a grid of hundreds of tiles, dumping focus back at the top of the
    // document loses the reader's position entirely.
    setup();
    const trigger = screen.getByRole("button", { name: /Expand/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("locks and restores page scroll", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("the shared-layout pairing", () => {
  it("keeps the collapsed tile mounted while expanded", () => {
    // Unmounting it would leave the close animation with no destination
    // rectangle, so the panel would vanish instead of shrinking back.
    setup();
    const trigger = screen.getByRole("button", { name: /Expand/ });
    fireEvent.click(trigger);
    expect(trigger.isConnected).toBe(true);
    expect(trigger.style.visibility).toBe("hidden");
  });

  it("reports its expanded state on the trigger", () => {
    setup();
    const trigger = screen.getByRole("button", { name: /Expand/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("content", () => {
  it("renders the media in both states rather than a second copy", () => {
    setup();
    expect(screen.getAllByAltText("creative")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));
    // Collapsed tile stays mounted, so there are two — one per layout
    // participant. More than two would mean a stray render.
    expect(screen.getAllByAltText("creative")).toHaveLength(2);
  });

  it("renders a caller's overlay on the collapsed tile", () => {
    setup({ overlay: <span>Unmapped</span> });
    expect(screen.getByText("Unmapped")).toBeTruthy();
  });
});
