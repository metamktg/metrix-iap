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
