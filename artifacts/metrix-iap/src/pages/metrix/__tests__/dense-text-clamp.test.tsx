// DenseText — the More/Less control must track what is ACTUALLY clipped.
//
// The defect these tests lock down was found by rendering, not by a check:
// three registry notes of ~135 characters each fit entirely inside
// `line-clamp-2` at a 1440px column (measured scrollHeight === clientHeight)
// and every one still carried a "More" button that did nothing visible.
//
// jsdom has no layout — every height is 0 — so these tests install a fake
// layout on HTMLParagraphElement to exercise both branches. That is also the
// reason the character threshold survives as a fallback: without it, every
// component test in the repo would silently lose the control.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DenseText } from "../shared";

const SHORT = "Nine words is not very much text at all.";
const LONG =
  "Confirmed known gap: no AW_ registry definition exists in the client library " +
  "and no AW_ performance rows appear in any source export.";

/**
 * Install a fake layout so the component can measure something real.
 * Heights are read through a mutable box so a test can model what a real
 * browser does when the paragraph expands: the clamp comes off, and
 * scrollHeight and clientHeight become equal.
 */
const layout = { client: 0, scroll: 0 };

function withLayout(clientHeight: number, scrollHeight: number) {
  layout.client = clientHeight;
  layout.scroll = scrollHeight;
  const proto = HTMLParagraphElement.prototype;
  const c = Object.getOwnPropertyDescriptor(proto, "clientHeight");
  const s = Object.getOwnPropertyDescriptor(proto, "scrollHeight");
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => layout.client });
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get: () => layout.scroll });
  return () => {
    if (c) Object.defineProperty(proto, "clientHeight", c);
    else delete (proto as unknown as Record<string, unknown>)["clientHeight"];
    if (s) Object.defineProperty(proto, "scrollHeight", s);
    else delete (proto as unknown as Record<string, unknown>)["scrollHeight"];
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  cleanup();
});

describe("when the paragraph can be measured", () => {
  it("hides More on long text that fits inside the clamp", () => {
    // THE BUG. 135 characters, well past the 120-char threshold, but the
    // column is wide enough that both lines fit. A character count cannot
    // know that; a measurement can.
    restore = withLayout(48, 48);
    render(<DenseText text={LONG} />);
    expect(screen.queryByRole("button", { name: /More/ })).toBeNull();
    expect(screen.getByText(LONG)).toBeTruthy();
  });

  it("shows More on short text that does NOT fit — a narrow column", () => {
    // The mirror image, and the reason a bigger threshold is not the fix:
    // at 390px this same text wraps past two lines and genuinely needs the
    // control. Width decides, not length.
    restore = withLayout(48, 96);
    render(<DenseText text={SHORT} />);
    expect(screen.getByRole("button", { name: /More/ })).toBeTruthy();
  });

  it("keeps the control after expanding, so Less is always reachable", () => {
    // Expanded, a real paragraph is its own full height and measures as
    // un-clipped. Dropping the button at that moment would strand the
    // reader in the expanded state with no way back, so the test models
    // exactly that: heights equalise the instant the clamp comes off.
    restore = withLayout(48, 96);
    render(<DenseText text={SHORT} />);
    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    layout.scroll = layout.client; // the clamp is gone; nothing is clipped
    expect(screen.getByRole("button", { name: /Less/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Less/ }));
    expect(screen.getByText(SHORT)).toBeTruthy();
  });
});

describe("when there is no layout to measure (jsdom, hidden subtree)", () => {
  it("falls back to the character threshold rather than hiding the control", () => {
    // clientHeight 0 means "unmeasurable", not "fits". Treating it as
    // "fits" would remove the control from every component test in the
    // repo and from any collapsed panel.
    render(<DenseText text={LONG} />);
    expect(screen.getByRole("button", { name: /More/ })).toBeTruthy();
  });

  it("shows no control for text under the threshold", () => {
    render(<DenseText text={SHORT} />);
    expect(screen.queryByRole("button", { name: /More/ })).toBeNull();
  });

  it("honours an explicit lower threshold", () => {
    render(<DenseText text={SHORT} threshold={10} />);
    expect(screen.getByRole("button", { name: /More/ })).toBeTruthy();
  });
});
