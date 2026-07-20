// ─── Global :focus-visible ring contrast — WCAG 2.1 SC 1.4.11 ──────────────
//
// index.css applies a single catch-all rule:
//   :focus-visible { outline: 2px solid hsl(var(--primary)); … }
//
// The ring colour is the full --primary token (no alpha reduction). This suite
// locks in that the ring stays readable on the two most common dark surfaces:
//   1. The app body / dark background (--background) — primary CTA buttons
//      and nav links live here.
//   2. The card surface (--card) — text inputs and form controls live here;
//      the outline ring appears in the space around the input, against --card.
//
// Any change to --primary in index.css, or reintroduction of opacity in the
// :focus-visible rule, will flow through these tests automatically via the
// live CSS token read.
//
// ─── StageTile inline focus ring (LoopCommandChain) ─────────────────────────
//
// StageTile overrides the global rule with an explicit Tailwind class:
//   focus-visible:ring-2 focus-visible:ring-primary/<opacity>
//
// WCAG 2.1 SC 1.4.11 still applies: the composited ring colour on the dark
// --background surface must achieve ≥3:1 contrast. The opacity is parsed live
// from the component source so any regression (e.g. reverting to /40) is caught
// automatically without needing to update the threshold here.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractCssVar,
  hslTokenToRgb,
  parseCssHslToken,
  alphaComposite,
  relativeLuminance,
  contrastRatio,
  parseFocusRingOpacities,
} from "./wcag-contrast-helpers";

// ─── Read design tokens live from the stylesheet ────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../../index.css");
const cssSource = readFileSync(cssPath, "utf-8");

const primaryRgb = hslTokenToRgb(extractCssVar(cssSource, "--primary"));
const bgRgb      = hslTokenToRgb(extractCssVar(cssSource, "--background"));
const cardRgb    = hslTokenToRgb(extractCssVar(cssSource, "--card"));

// ─── Extract the focus-visible outline rule ──────────────────────────────────
// Parse the :focus-visible block to determine the actual alpha in use.
// The outline is `hsl(var(--primary))` with no opacity modifier (alpha = 1.0).
// If someone adds `/ <alpha>` back, this extractor picks it up so the contrast
// computation stays accurate.

function parseFocusVisibleAlpha(css: string): number {
  const block = css.match(/:focus-visible\s*\{[^}]+\}/)?.[0] ?? "";
  const slashAlpha = block.match(/--primary\)\s*\/\s*([0-9.]+)/);
  return slashAlpha ? parseFloat(slashAlpha[1]) : 1.0;
}

const FOCUS_RING_ALPHA = parseFocusVisibleAlpha(cssSource);

// Alpha-composite the ring colour over each surface at the live opacity value.
const ringOnBg   = alphaComposite(primaryRgb, bgRgb,   FOCUS_RING_ALPHA);
const ringOnCard = alphaComposite(primaryRgb, cardRgb, FOCUS_RING_ALPHA);

const bgLum       = relativeLuminance(...bgRgb);
const cardLum     = relativeLuminance(...cardRgb);
const ringOnBgLum = relativeLuminance(...ringOnBg);
const ringOnCardLum = relativeLuminance(...ringOnCard);

// ─── Token parsing sanity ────────────────────────────────────────────────────

describe("Global :focus-visible ring — design token parsing", () => {
  it("--primary is parseable from the stylesheet", () => {
    const [h, s, l] = parseCssHslToken(extractCssVar(cssSource, "--primary"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(360);
    expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThanOrEqual(1);
  });

  it("--background is parseable from the stylesheet", () => {
    const [h, s, l] = parseCssHslToken(extractCssVar(cssSource, "--background"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(360);
    expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThanOrEqual(1);
  });

  it("--card is parseable from the stylesheet", () => {
    const [h, s, l] = parseCssHslToken(extractCssVar(cssSource, "--card"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(360);
    expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThanOrEqual(1);
  });
});

// ─── WCAG 2.1 SC 1.4.11: Non-text Contrast ≥ 3:1 ───────────────────────────

describe("Global :focus-visible ring contrast (WCAG 2.1 SC 1.4.11)", () => {
  // Primary CTA buttons — these sit on the dark app background.
  it("focus ring on --background (primary CTA buttons, nav links) meets ≥3:1 contrast", () => {
    // Current values (from index.css):
    //   --primary:    hsl(222 100% 54%)  ≈ #155dff  (Metrix electric blue)
    //   --background: hsl(221 66%  6%)   ≈ #050b18  (cockpit near-black)
    // Contrast at full opacity ≈ 3.9:1 — well above the threshold.
    const ratio = contrastRatio(ringOnBgLum, bgLum);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("ring is lighter than the dark background (ring is visible, not hidden)", () => {
    // Sanity: if the ring is darker than the background it becomes invisible.
    expect(ringOnBgLum).toBeGreaterThan(bgLum);
  });

  // Text inputs — the focus outline appears in the space around the input field,
  // against the card surface (not the input fill).
  it("focus ring on --card surface (text inputs, form controls) meets ≥3:1 contrast", () => {
    const ratio = contrastRatio(ringOnCardLum, cardLum);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("ring is lighter than the card surface (ring is visible on input cards)", () => {
    expect(ringOnCardLum).toBeGreaterThan(cardLum);
  });
});

// ─── Opacity guard ───────────────────────────────────────────────────────────
//
// The :focus-visible outline must use --primary. If opacity is present, the
// alpha compositing above already propagates it through to the contrast check.
// This additional guard catches two failure modes:
//   a) --primary is removed from the outline entirely (invisible ring)
//   b) opacity is reduced so far that even if contrast checks somehow pass,
//      the deviation is visible in code review
//
// WCAG 2.1 SC 1.4.11 requires ≥3:1; opacity < ~0.85 on these dark surfaces
// drops below that threshold. Full opacity (1.0) is the safe default.

describe(":focus-visible opacity guard", () => {
  it("the :focus-visible outline references --primary", () => {
    const block = cssSource.match(/:focus-visible\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toContain("--primary");
  });

  it("the live opacity value achieves ≥3:1 contrast on --background (guards against accidental reduction)", () => {
    // This test redundantly locks in the two requirements together:
    // if opacity is reduced AND the contrast drops below 3:1, both the
    // dedicated contrast test above AND this test will fail simultaneously,
    // making the cause immediately obvious in CI output.
    expect(FOCUS_RING_ALPHA).toBeGreaterThan(0);
    const ratio = contrastRatio(ringOnBgLum, bgLum);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

// ─── StageTile focus ring — LoopCommandChain (WCAG 2.1 SC 1.4.11) ───────────
//
// StageTile applies `focus-visible:ring-primary/<N>` directly in its className.
// This section reads the component source at test-time, extracts the live
// opacity percentage, and asserts the alpha-composited ring colour meets ≥3:1
// contrast against the dark --background surface the tiles sit on.
//
// If the class is ever regressed to a lower opacity (e.g. /40 → ~2.8:1), the
// contrast assertion below will fail immediately.

const loopChainPath = resolve(
  __dirname,
  "../../../components/loop/LoopCommandChain.tsx",
);
const loopChainSource = readFileSync(loopChainPath, "utf-8");

/**
 * Parse the opacity from a Tailwind `focus-visible:ring-primary` or
 * `focus-visible:ring-primary/<N>` class in the StageTile className string.
 * Returns a value in [0, 1].
 *
 * - No opacity modifier (`ring-primary`) → returns 1.0 (full opacity, safe).
 * - With modifier (`ring-primary/70`) → returns 70/100 = 0.70.
 * - Class missing entirely → throws so the regression is immediately visible.
 *
 * On the cockpit near-black --background (hsl 221 66% 6%), measured contrast:
 *   ring-primary at 100% ≈ 3.9:1  ✓  meets WCAG AA (3:1 minimum)
 *   ring-primary at  70% ≈ 2.4:1  ✗  below threshold
 *   ring-primary at  40% ≈ 1.7:1  ✗  well below threshold (original broken value)
 * Lower opacity always yields lower contrast on this surface. Only ≥85%
 * opacity reliably clears 3:1; full opacity (no modifier) is the safe default.
 */
function parseStageTileRingAlpha(source: string): number {
  if (!source.includes("focus-visible:ring-primary")) {
    throw new Error(
      'Could not find "focus-visible:ring-primary" in LoopCommandChain.tsx — ' +
      "the StageTile focus-ring class may have been removed or renamed.",
    );
  }
  const withModifier = source.match(/focus-visible:ring-primary\/(\d+)/);
  if (!withModifier) return 1.0;
  const pct = parseInt(withModifier[1], 10);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    throw new Error(`Unexpected ring opacity percentage: ${withModifier[1]}`);
  }
  return pct / 100;
}

const STAGE_TILE_RING_ALPHA = parseStageTileRingAlpha(loopChainSource);

const stageTileRingRgb = alphaComposite(primaryRgb, bgRgb, STAGE_TILE_RING_ALPHA);
const stageTileRingLum = relativeLuminance(...stageTileRingRgb);

describe("StageTile focus ring contrast — LoopCommandChain (WCAG 2.1 SC 1.4.11)", () => {
  it("focus-visible:ring-primary class is present in StageTile", () => {
    expect(loopChainSource).toContain("focus-visible:ring-primary");
  });

  it("ring has no opacity modifier, or modifier ≥85 (guards against low-contrast values)", () => {
    // On the cockpit near-black --background, only full (or near-full) opacity
    // achieves ≥3:1. Values at or below /70 drop to ~2.4:1, below WCAG AA.
    // Full opacity (no modifier) is the safe default; this guard catches any
    // accidental reintroduction of a low-opacity suffix such as /40 or /70.
    const pct = Math.round(STAGE_TILE_RING_ALPHA * 100);
    expect(pct).toBeGreaterThanOrEqual(85);
  });

  it("StageTile focus ring on --background meets ≥3:1 contrast (WCAG AA)", () => {
    // Alpha-composite the ring colour at the live opacity over the dark
    // --background surface, then assert the resulting contrast ratio.
    // This is the ground-truth accessibility check; the opacity guard above
    // is a human-readable early warning that maps directly to the threshold.
    const ratio = contrastRatio(stageTileRingLum, bgLum);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("StageTile focus ring is lighter than the background (ring is visible)", () => {
    expect(stageTileRingLum).toBeGreaterThan(bgLum);
  });
});

// ─── AccountSwitcher focus rings (WCAG 2.1 SC 1.4.11) ───────────────────────
//
// AccountSwitcher renders two focusable buttons (compact icon-only and expanded
// label trigger) each with an inline `focus-visible:ring-primary` class.
// Both live in the sidebar on the dark --background surface.
// The test reads the live source so any re-introduction of an opacity modifier
// (e.g. ring-primary/40 → ~1.5:1, far below 3:1) will fail immediately.

const accountSwitcherPath = resolve(
  __dirname,
  "../../../components/layout/AccountSwitcher.tsx",
);
const accountSwitcherSource = readFileSync(accountSwitcherPath, "utf-8");
const accountSwitcherOpacities = parseFocusRingOpacities(
  accountSwitcherSource,
  "AccountSwitcher.tsx",
);

describe("AccountSwitcher focus ring contrast — sidebar buttons (WCAG 2.1 SC 1.4.11)", () => {
  it("focus-visible:ring-primary class is present in AccountSwitcher", () => {
    expect(accountSwitcherSource).toContain("focus-visible:ring-primary");
  });

  it("all AccountSwitcher focus rings have no opacity modifier, or modifier ≥85", () => {
    // ring-primary/40 (the original value) yields ~1.5:1 on --background — well
    // below WCAG AA 3:1. Only ≥85% opacity reliably clears the threshold.
    for (const alpha of accountSwitcherOpacities) {
      expect(Math.round(alpha * 100)).toBeGreaterThanOrEqual(85);
    }
  });

  it("all AccountSwitcher focus rings meet ≥3:1 contrast on --background (WCAG AA)", () => {
    for (const alpha of accountSwitcherOpacities) {
      const ringRgb = alphaComposite(primaryRgb, bgRgb, alpha);
      const ratio = contrastRatio(relativeLuminance(...ringRgb), bgLum);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── InlineAccountPicker focus ring (WCAG 2.1 SC 1.4.11) ────────────────────
//
// InlineAccountPicker renders a single focusable button with an inline
// `focus-visible:ring-primary` class. It appears in empty-state panels on
// the dark --background surface.

const inlinePickerPath = resolve(
  __dirname,
  "../../../components/layout/InlineAccountPicker.tsx",
);
const inlinePickerSource = readFileSync(inlinePickerPath, "utf-8");
const inlinePickerOpacities = parseFocusRingOpacities(
  inlinePickerSource,
  "InlineAccountPicker.tsx",
);

describe("InlineAccountPicker focus ring contrast — account picker button (WCAG 2.1 SC 1.4.11)", () => {
  it("focus-visible:ring-primary class is present in InlineAccountPicker", () => {
    expect(inlinePickerSource).toContain("focus-visible:ring-primary");
  });

  it("InlineAccountPicker focus ring has no opacity modifier, or modifier ≥85", () => {
    for (const alpha of inlinePickerOpacities) {
      expect(Math.round(alpha * 100)).toBeGreaterThanOrEqual(85);
    }
  });

  it("InlineAccountPicker focus ring meets ≥3:1 contrast on --background (WCAG AA)", () => {
    for (const alpha of inlinePickerOpacities) {
      const ringRgb = alphaComposite(primaryRgb, bgRgb, alpha);
      const ratio = contrastRatio(relativeLuminance(...ringRgb), bgLum);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── CreativeCard focus ring (WCAG 2.1 SC 1.4.11) ───────────────────────────
//
// CreativeCard renders a focusable card with `focus-visible:ring-primary` and
// `ring-offset-background`. The ring appears against the dark --background
// surface (the offset pushes it just outside the card border).

const creativeCardPath = resolve(
  __dirname,
  "../../../components/creative/CreativeCard.tsx",
);
const creativeCardSource = readFileSync(creativeCardPath, "utf-8");
const creativeCardOpacities = parseFocusRingOpacities(
  creativeCardSource,
  "CreativeCard.tsx",
);

describe("CreativeCard focus ring contrast — creative grid tile (WCAG 2.1 SC 1.4.11)", () => {
  it("focus-visible:ring-primary class is present in CreativeCard", () => {
    expect(creativeCardSource).toContain("focus-visible:ring-primary");
  });

  it("CreativeCard focus ring has no opacity modifier, or modifier ≥85", () => {
    for (const alpha of creativeCardOpacities) {
      expect(Math.round(alpha * 100)).toBeGreaterThanOrEqual(85);
    }
  });

  it("CreativeCard focus ring meets ≥3:1 contrast on --background (WCAG AA)", () => {
    // ring-offset-background means the ring sits against --background, not the
    // card fill — test against the same dark surface as the global rule.
    for (const alpha of creativeCardOpacities) {
      const ringRgb = alphaComposite(primaryRgb, bgRgb, alpha);
      const ratio = contrastRatio(relativeLuminance(...ringRgb), bgLum);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── CreativeExpandDialog age-band buttons focus ring (WCAG 2.1 SC 1.4.11) ──
//
// CreativeExpandDialog renders a list of age-band selector buttons with an
// inline `focus-visible:ring-primary` class. They appear inside a dialog panel
// which floats over the dark --background surface.

const creativeExpandPath = resolve(
  __dirname,
  "../../../components/creative/CreativeExpandDialog.tsx",
);
const creativeExpandSource = readFileSync(creativeExpandPath, "utf-8");
const creativeExpandOpacities = parseFocusRingOpacities(
  creativeExpandSource,
  "CreativeExpandDialog.tsx",
);

describe("CreativeExpandDialog focus ring contrast — age-band buttons (WCAG 2.1 SC 1.4.11)", () => {
  it("focus-visible:ring-primary class is present in CreativeExpandDialog", () => {
    expect(creativeExpandSource).toContain("focus-visible:ring-primary");
  });

  it("CreativeExpandDialog focus ring has no opacity modifier, or modifier ≥85", () => {
    for (const alpha of creativeExpandOpacities) {
      expect(Math.round(alpha * 100)).toBeGreaterThanOrEqual(85);
    }
  });

  it("CreativeExpandDialog focus ring meets ≥3:1 contrast on --background (WCAG AA)", () => {
    for (const alpha of creativeExpandOpacities) {
      const ringRgb = alphaComposite(primaryRgb, bgRgb, alpha);
      const ratio = contrastRatio(relativeLuminance(...ringRgb), bgLum);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });
});
