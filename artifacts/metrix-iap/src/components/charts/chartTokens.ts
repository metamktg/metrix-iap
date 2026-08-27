// ─── Chart primitives: the parts every Metrix chart shares ────────────
//
// One home for the categorical scale, the mark geometry and the axis
// styling, so a new chart cannot quietly invent its own. Before this
// existed there was exactly one chart component and every other chart was
// inline recharts with hand-picked colours — which is how the share donut
// ended up painting two segments the same colour.
//
// The rules encoded here are not stylistic preferences:
//
//   · The scale is FIVE slots, assigned by position and never cycled. A
//     sixth series folds into a neutral bucket, becomes a small multiple,
//     or is dropped — it never wraps around to slot 1.
//   · Colour follows the ENTITY, not its rank. Pass a stable key so a
//     filter that removes one series does not repaint the survivors.
//   · Status colours (success / warning / danger / info) are reserved and
//     never appear here.
//   · ONE axis. Two measures of different scale are two charts, or one
//     chart indexed to a common base — never a second y-scale.
//
// The palette itself is validated: OKLCH L inside the dark band, chroma
// above the grey floor, CVD ΔE 8.5 on ALL pairs (not just adjacent, so it
// holds for scatter and heatmaps too), normal-vision ΔE 16.3, and every
// slot at or above 3:1 against the card surface. See
// docs/resources/METRIX_Color_System_Decision.md.

/** The categorical scale, in fixed order. Never cycled. */
export const SERIES_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

export const MAX_SERIES = SERIES_VARS.length;

/** Not a category — the bucket everything past the scale folds into. */
export const NEUTRAL_VAR = "hsl(var(--muted-foreground))";

/**
 * Colour for a series, by its position in the *stable* ordering.
 * Past the scale, the neutral. Callers derive `index` from an entity key,
 * never from a sort position, so filtering never repaints.
 */
export function seriesColor(index: number): string {
  return index >= 0 && index < MAX_SERIES ? SERIES_VARS[index]! : NEUTRAL_VAR;
}

/**
 * Assign slots to entities once, by stable key, and keep the assignment
 * for the life of the view. Returns a lookup, not an array, so a filtered
 * subset keeps each entity's colour.
 */
export function assignSeriesColors(keys: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  keys.forEach((k, i) => out.set(k, seriesColor(i)));
  return out;
}

// ─── Mark geometry ────────────────────────────────────────────────────
// Thin marks, a rounded data-end anchored to the baseline, and a 2px
// surface gap between adjacent fills so bars read as separate objects
// rather than one striped block.

export const MARK = {
  /** Rounded data-end only — the baseline end stays square. */
  barRadius: 4,
  /** Gap between adjacent bars and between stacked segments. */
  gap: 2,
  lineWidth: 2,
  dotSize: 8,
  activeDotSize: 10,
} as const;

// ─── Axis + grid: recessive by construction ───────────────────────────
// The data is the figure; the frame is not. These are deliberately dim
// enough that no axis competes with a mark.

export const AXIS = {
  stroke: "hsl(var(--border))",
  tick: {
    fill: "hsl(var(--muted-foreground))",
    fontSize: 11,
    fontFamily: "inherit",
  },
  grid: {
    stroke: "hsl(var(--border))",
    strokeOpacity: 0.35,
    strokeDasharray: "2 4",
  },
  cursor: {
    stroke: "hsl(var(--muted-foreground))",
    strokeOpacity: 0.4,
    strokeWidth: 1,
  },
} as const;

/** Chart surface, for anything that needs to punch a gap out of a fill. */
export const SURFACE_VAR = "hsl(var(--card))";

// ─── Diverging scale: good ←→ bad ─────────────────────────────────────
//
// Not a categorical palette. A performance read — at goal / near goal /
// above goal, efficient / average / costly — is a POLARITY, and polarity
// has its own rules: two hues, a neutral GREY midpoint, and never a third
// hue in the middle.
//
// These sites used to reach for chart slots (`--chart-3` for good,
// `--chart-4` for bad, `--chart-1` in the middle). That worked only while
// slot 3 happened to be teal and slot 4 happened to be amber — an accident
// the categorical palette was under no obligation to preserve, and did not:
// re-stepping the scale made both ends green and the two verdicts
// indistinguishable. Polarity belongs on the reserved status tokens, which
// exist precisely so a palette change cannot repaint a verdict.

/** Good end. */
export const GOOD_VAR = "hsl(var(--status-success)";
/** Bad end. */
export const BAD_VAR = "hsl(var(--status-warning)";
/** The midpoint is grey on purpose — a hue there reads as a third category. */
export const MID_VAR = "hsl(var(--muted-foreground)";

/**
 * A fill for a diverging cell.
 *
 * @param t   0 = worst, 1 = best, 0.5 = neutral. Null when unmeasured.
 * @param max peak opacity at either end.
 */
export function divergingFill(t: number | null, max = 0.30): string {
  // Unmeasured is not "average". It gets the faintest possible surface, so
  // an absent cell never reads as a middling result.
  if (t == null || !Number.isFinite(t)) return "hsl(var(--muted-foreground) / 0.05)";
  const clamped = Math.min(1, Math.max(0, t));
  const distance = Math.abs(clamped - 0.5) * 2;       // 0 at the midpoint, 1 at either end
  const alpha = (0.05 + distance * (max - 0.05)).toFixed(3);
  if (distance < 0.12) return `${MID_VAR} / ${alpha})`;
  return `${clamped > 0.5 ? GOOD_VAR : BAD_VAR} / ${alpha})`;
}

/** Discrete verdict colours, for legends and chips. */
export const VERDICT = {
  good: "hsl(var(--status-success))",
  neutral: "hsl(var(--muted-foreground))",
  bad: "hsl(var(--status-warning))",
  unmeasured: "hsl(var(--muted-foreground) / 0.35)",
} as const;

/**
 * A single-hue sequential ramp for MAGNITUDE (spend, impressions, volume).
 * One hue, stepped by opacity — never a rainbow, and never the diverging
 * pair, because magnitude has no good end.
 */
export function magnitudeFill(t: number | null, slot = 0, max = 0.28): string {
  if (t == null || !Number.isFinite(t)) return "transparent";
  const clamped = Math.min(1, Math.max(0, t));
  return `color-mix(in srgb, ${seriesColor(slot)} ${(clamped * max * 100).toFixed(1)}%, transparent)`;
}
