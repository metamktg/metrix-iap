// ─── InfoTooltip keyboard-accessibility regression tests ───────────────
// Guards the three a11y properties of the 'i' info button:
//   1. tabIndex is never negative (button is Tab-reachable)
//   2. Focus-ring utility classes are present on the button element
//   3. The tooltip opens on focus — Radix wires aria-describedby to the
//      trigger when the tooltip is open, confirming screen-reader linkage
//   4. The rendered ring colour meets WCAG 2.1 SC 1.4.11 (≥3:1 contrast)
//      against the dark module-header background.

import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { InfoTooltip } from "../shared";
import {
  hslToRgb,
  relativeLuminance,
  contrastRatio,
  parseCssHslToken,
  extractCssVar,
} from "./wcag-contrast-helpers";

afterEach(cleanup);

function renderTooltip(content = "Helpful explanation") {
  const result = render(<InfoTooltip content={content} />);
  const btn = within(result.container).getByRole("button", { name: /more info/i });
  return { ...result, btn };
}

// ─── Read the design tokens live from the stylesheet ──────────────────────
// This means any future change to --ring or --background in index.css
// automatically flows through to this test — no manual sync needed.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../../index.css");
const cssSource = readFileSync(cssPath, "utf-8");

const ringHsl = parseCssHslToken(extractCssVar(cssSource, "--ring"));
const bgHsl = parseCssHslToken(extractCssVar(cssSource, "--background"));

const [rr, rg, rb] = hslToRgb(...ringHsl);
const [br, bg2, bb] = hslToRgb(...bgHsl);
const ringLuminance = relativeLuminance(rr, rg, rb);
const bgLuminance = relativeLuminance(br, bg2, bb);
const ringVsBgContrast = contrastRatio(ringLuminance, bgLuminance);

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("InfoTooltip keyboard accessibility", () => {
  it("button is reachable via Tab (tabIndex is not negative)", () => {
    const { btn } = renderTooltip();
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("button carries focus-ring utility classes for visible keyboard focus", () => {
    const { btn } = renderTooltip();
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-ring");
    expect(btn.className).toContain("focus-visible:ring-offset-1");
    // ring-offset-background ensures the gap colour matches the dark surface,
    // not the Tailwind default of white which would look jarring on dark UIs.
    expect(btn.className).toContain("focus-visible:ring-offset-background");
  });

  it("button has aria-label that communicates purpose to screen readers", () => {
    const { btn } = renderTooltip();
    expect(btn.getAttribute("aria-label")).toBe("More info");
  });

  it("tooltip content becomes accessible in the DOM on focus (aria-describedby wired)", async () => {
    const content = "Unique tooltip explanation text";
    const { btn } = renderTooltip(content);

    fireEvent.focus(btn);

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
    await waitFor(() => expect(btn.getAttribute("aria-describedby")).toBeTruthy());

    fireEvent.blur(btn);
    await waitFor(() => {
      const id = btn.getAttribute("aria-describedby");
      if (id) {
        expect(document.getElementById(id)).toBeNull();
      } else {
        expect(id).toBeFalsy();
      }
    });
  });
});

// ─── WCAG 2.1 SC 1.4.11 — Non-text Contrast ───────────────────────────────
// The focus ring must have a contrast ratio ≥ 3:1 against the adjacent surface.
// Token values are read live from src/index.css so any palette change that
// drops contrast below the threshold will fail this suite automatically.

describe("InfoTooltip focus-ring contrast (WCAG 2.1 SC 1.4.11)", () => {
  it("--ring token value is parseable from the stylesheet", () => {
    // If this fails, the token name or format changed — update the extractor.
    const [h, s, l] = ringHsl;
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(360);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
  });

  it("--background token value is parseable from the stylesheet", () => {
    const [h, s, l] = bgHsl;
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(360);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
  });

  it("ring colour (--ring) has ≥3:1 contrast against the dark module-header surface (--background)", () => {
    // WCAG 2.1 SC 1.4.11 requires non-text contrast ≥ 3:1.
    // Computed from the live CSS token values; fails automatically if the
    // palette is ever changed to a low-contrast combination.
    //
    // Current values (from index.css):
    //   --ring:       hsl(222 100% 54%)  ≈ #155dff  (Metrix electric blue)
    //   --background: hsl(221 66%  6%)   ≈ #050b18  (cockpit near-black)
    // Expected contrast ≈ 3.9:1  (well above the 3:1 threshold)
    expect(ringVsBgContrast).toBeGreaterThanOrEqual(3);
  });

  it("ring relative luminance is higher than the dark background luminance", () => {
    // Sanity check: the ring must be the lighter of the two surfaces.
    // If this ever flips, the ring is darker than the background, which
    // means it would be invisible (a dark ring on a dark background).
    expect(ringLuminance).toBeGreaterThan(bgLuminance);
  });
});
