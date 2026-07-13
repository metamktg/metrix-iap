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

afterEach(cleanup);

function renderTooltip(content = "Helpful explanation") {
  const result = render(<InfoTooltip content={content} />);
  const btn = within(result.container).getByRole("button", { name: /more info/i });
  return { ...result, btn };
}

// ─── WCAG contrast helpers ─────────────────────────────────────────────────
// All math follows the WCAG 2.x algorithm for relative luminance and contrast.

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [r1 + m, g1 + m, b1 + m];
}

function srgbLinearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbLinearize(r) + 0.7152 * srgbLinearize(g) + 0.0722 * srgbLinearize(b);
}

function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse a CSS HSL token value in "H S% L%" format (no hsl() wrapper,
 * as used in Tailwind/shadcn CSS custom properties).
 * Returns [h 0-360, s 0-1, l 0-1].
 */
function parseCssHslToken(raw: string): [number, number, number] {
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 3) throw new Error(`Unexpected HSL token: "${raw}"`);
  return [parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100];
}

/**
 * Extract the *first* occurrence of a CSS custom property value from a CSS
 * string.  Handles optional `hsl(...)` wrapper so it works for both bare
 * channel tokens ("222 100% 54%") and full hsl() values.
 */
function extractCssVar(css: string, varName: string): string {
  const re = new RegExp(`${varName}:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) throw new Error(`CSS variable "${varName}" not found in stylesheet`);
  // Strip hsl() wrapper if present so we always get bare channel tokens.
  return m[1].trim().replace(/^hsl\(/, "").replace(/\)$/, "");
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
