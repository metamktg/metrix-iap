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
