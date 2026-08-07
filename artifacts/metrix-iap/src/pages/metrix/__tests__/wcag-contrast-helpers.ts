import { readFileSync } from "node:fs";

/**
 * Shared WCAG 2.x contrast helpers for accessibility tests.
 *
 * All math follows the WCAG 2.x algorithm for relative luminance and contrast
 * ratio (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 *
 * These are pure functions — import them into any test that needs to assert
 * WCAG 2.1 SC 1.4.11 (Non-text Contrast ≥ 3:1) or SC 1.4.3 (text ≥ 4.5:1).
 */

/** Convert HSL (h 0-360, s 0-1, l 0-1) to sRGB [0-1] triplet. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)       { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else              { r1 = c; b1 = x; }
  return [r1 + m, g1 + m, b1 + m];
}

/** Linearise a single sRGB channel value (0-1) for luminance calculation. */
export function srgbLinearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance from sRGB [0-1] channels. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbLinearize(r) + 0.7152 * srgbLinearize(g) + 0.0722 * srgbLinearize(b);
}

/** WCAG contrast ratio from two relative-luminance values. */
export function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker  = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse a CSS HSL token value in "H S% L%" format (no hsl() wrapper,
 * as used in Tailwind/shadcn CSS custom properties).
 * Returns [h 0-360, s 0-1, l 0-1].
 */
export function parseCssHslToken(raw: string): [number, number, number] {
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 3) throw new Error(`Unexpected HSL token: "${raw}"`);
  return [parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100];
}

/**
 * Extract the *first* occurrence of a CSS custom property value from a CSS
 * string.  Handles optional `hsl(...)` wrapper so it works for both bare
 * channel tokens ("222 100% 54%") and full hsl() values.
 */
export function extractCssVar(css: string, varName: string): string {
  const re = new RegExp(`${varName}:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) throw new Error(`CSS variable "${varName}" not found in stylesheet`);
  return m[1].trim().replace(/^hsl\(/, "").replace(/\)$/, "");
}

/**
 * Alpha-composite a foreground colour at the given opacity over a background
 * colour, both as sRGB [0-1] triplets.  Returns the resulting opaque sRGB
 * triplet.  Uses straight-alpha compositing in sRGB space, matching browser
 * rendering of `color / <alpha>` CSS syntax.
 */
export function alphaComposite(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    alpha * fg[0] + (1 - alpha) * bg[0],
    alpha * fg[1] + (1 - alpha) * bg[1],
    alpha * fg[2] + (1 - alpha) * bg[2],
  ];
}

/**
 * Convenience: parse a bare HSL token from the stylesheet, convert to sRGB.
 */
export function hslTokenToRgb(tokenValue: string): [number, number, number] {
  return hslToRgb(...parseCssHslToken(tokenValue));
}

/**
 * Scan a component source string for every `focus-visible:ring-primary` (or
 * `focus-visible:ring-primary/<N>`) occurrence and return the opacity value in
 * [0, 1] for each one.
 *
 * - No opacity modifier (`ring-primary`)    → 1.0 (full opacity, safe)
 * - With modifier (`ring-primary/70`)       → 0.70
 * - Class absent entirely                   → throws so missing rings are caught
 *
 * Use this to drive contrast assertions over every interactive tile that
 * overrides the global focus ring with an inline Tailwind class.
 */
export function parseFocusRingOpacities(
  source: string,
  componentName = "<component>",
): number[] {
  if (!source.includes("focus-visible:ring-primary")) {
    throw new Error(
      `Could not find "focus-visible:ring-primary" in ${componentName} — ` +
        "the focus-ring class may have been removed or renamed.",
    );
  }
  const re = /focus-visible:ring-primary(?:\/(\d+))?/g;
  const results: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const pct = m[1] !== undefined ? parseInt(m[1], 10) : 100;
    results.push(pct / 100);
  }
  return results;
}

/**
 * Load the effective theme CSS for the always-dark Metrix IAP.
 * Shadcn tokens (--primary, --ring, --background, …) come from the
 * Command Deck design system package; the app is rendered with
 * class="dark" on <html>, so the package's `.dark` block holds the
 * effective values. App-specific tokens still live in the app's
 * index.css. This returns the package `.dark` block FIRST (so
 * extractCssVar's first-match wins) followed by the app stylesheet.
 */
export function loadEffectiveThemeCss(appCssPath: string, packageCssPath: string): string {
  const pkgCss = readFileSync(packageCssPath, "utf-8");
  const appCss = readFileSync(appCssPath, "utf-8");
  const darkBlock = pkgCss.match(/\.dark\s*\{[\s\S]*?\n\}/)?.[0];
  if (!darkBlock) throw new Error(".dark block not found in design-system stylesheet");
  return `${darkBlock}\n${appCss}`;
}
