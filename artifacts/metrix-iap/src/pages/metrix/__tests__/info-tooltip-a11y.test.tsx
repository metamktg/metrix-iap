// ─── InfoTooltip keyboard-accessibility regression tests ───────────────
// Guards the three a11y properties of the 'i' info button:
//   1. tabIndex is never negative (button is Tab-reachable)
//   2. Focus-ring utility classes are present on the button element
//   3. The tooltip opens on focus — Radix wires aria-describedby to the
//      trigger when the tooltip is open, confirming screen-reader linkage

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { InfoTooltip } from "../shared";

afterEach(cleanup);

function renderTooltip(content = "Helpful explanation") {
  const result = render(<InfoTooltip content={content} />);
  // The button is the only element rendered in this container.
  const btn = within(result.container).getByRole("button", { name: /more info/i });
  return { ...result, btn };
}

describe("InfoTooltip keyboard accessibility", () => {
  it("button is reachable via Tab (tabIndex is not negative)", () => {
    const { btn } = renderTooltip();
    // tabIndex defaults to 0 when not explicitly set; -1 would hide it from Tab order.
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("button carries focus-ring utility classes for visible keyboard focus", () => {
    const { btn } = renderTooltip();
    // These Tailwind classes render the visible outline on :focus-visible.
    // If any are missing, keyboard users will not see a focus indicator.
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-ring");
    expect(btn.className).toContain("focus-visible:ring-offset-1");
  });

  it("button has aria-label that communicates purpose to screen readers", () => {
    const { btn } = renderTooltip();
    expect(btn.getAttribute("aria-label")).toBe("More info");
  });

  it("tooltip content becomes accessible in the DOM on focus (aria-describedby wired)", async () => {
    const content = "Unique tooltip explanation text";
    const { btn } = renderTooltip(content);

    fireEvent.focus(btn);

    // Radix Tooltip renders the content into a portal on open and links the
    // trigger to it via aria-describedby. Wait for that linkage to appear.
    await waitFor(() => {
      const id = btn.getAttribute("aria-describedby");
      expect(id).toBeTruthy();
      const contentEl = document.getElementById(id!);
      expect(contentEl).toBeTruthy();
      expect(contentEl!.textContent).toContain(content);
    });
  });

  it("tooltip content is hidden again after blur", async () => {
    const { btn } = renderTooltip("Some tooltip text");

    fireEvent.focus(btn);
    // Confirm it opens first.
    await waitFor(() => expect(btn.getAttribute("aria-describedby")).toBeTruthy());

    fireEvent.blur(btn);
    // After blur, Radix removes the aria-describedby linkage or removes the portal node.
    await waitFor(() => {
      const id = btn.getAttribute("aria-describedby");
      // Either the attribute is gone entirely, or the linked element is no longer present.
      if (id) {
        expect(document.getElementById(id)).toBeNull();
      } else {
        expect(id).toBeFalsy();
      }
    });
  });
});
