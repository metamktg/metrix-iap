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

// ─── Single-series accents ────────────────────────────────────────────
//
// A ranked bar of ONE measure is one series, and it wears the product's
// interactive accent. Three charts used to spell that as
// `hsl(var(--interactive))`, and `--interactive` does not exist: index.css
// defines `--color-interactive` (an alias of `--mx-text-interactive`, which
// already resolves to a colour, not an H S L triplet). An SVG fill that
// resolves to nothing falls back to BLACK, which is how every KPI hover
// painted black bars over the navy card. The token is a bare `var()` here
// for the same reason `SERIES_VARS` are — wrapping a resolved colour in
// hsl() is a second way to produce the same broken paint.

export const SERIES = {
  /** The single-series accent. Bare var — see above. */
  interactive: "var(--color-interactive)",
  /**
   * A COST measure (CPA, cost per result, CPM). It is a magnitude, not a
   * verdict and not a warning, so it takes a second slot of the categorical
   * scale rather than amber — amber is the data-quality colour, and a CPA
   * hover in it read as "this import is broken". Slot 2 (cyan) rather than
   * slot 3, because slot 3 is purple in the dark theme and the owner has
   * ruled purple out of the KPI surfaces.
   */
  cost: SERIES_VARS[1],
} as const;

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

// ─── Type inside a chart ──────────────────────────────────────────────
//
// Recharts sets text through SVG attributes, so the CSS role classes in
// index.css (.text-micro / .text-label / …) cannot reach a tick. These are
// the SAME steps, restated in px, and the names say which role each one is:
// nothing inside a chart may sit under the 11px chrome floor. Ticks were at
// 9px and 10px in four charts and a reference-line label at 8px, which is
// the "ugly formatting" half of the KPI hover defect.

export const CHART_TYPE = {
  /** .text-micro — the chrome floor. Axis ticks, a reference-line word. */
  tick: 11,
  /** .text-label — a value written beside its bar. */
  label: 12,
  /** .text-caption — the reading floor; a tooltip row. */
  caption: 13,
  /** .text-body — a tooltip title. */
  body: 15,
} as const;

export const MARK = {
  /** Rounded data-end only — the baseline end stays square. */
  barRadius: 4,
  /** Thickness of a ranked bar. */
  barSize: 12,
  /** Gap between adjacent bars and between stacked segments. */
  gap: 2,
  lineWidth: 2,
  dotSize: 8,
  activeDotSize: 10,
  /**
   * Spread onto a Bar / Area / Pie. Recharts animates every mark in from
   * zero over 1500ms by default, so a page chart re-grows its bars on every
   * re-render — a filter change, a resize, a tooltip mount. A measurement
   * that keeps moving reads as loading, not as data.
   */
  noAnimation: { isAnimationActive: false },
  /**
   * The direct value label beside a bar: label step, semibold, foreground.
   * Pair it with `className="tabular-nums"` so a column of values aligns.
   */
  valueLabel: {
    fontSize: 12,
    fontWeight: 600,
    fill: "hsl(var(--foreground))",
    fontFamily: "inherit",
  },
} as const;

// ─── Axis + grid: recessive by construction ───────────────────────────
// The data is the figure; the frame is not. These are deliberately dim
// enough that no axis competes with a mark.

export const AXIS = {
  stroke: "hsl(var(--border))",
  /**
   * A dimmed foreground for an axis label that must be read against the
   * plot rather than the card — the trend and cell charts had this as a
   * `hsl(var(--foreground) / 0.70)` literal in five places.
   */
  labelDim: "hsl(var(--foreground) / 0.70)",
  tick: {
    fill: "hsl(var(--muted-foreground))",
    fontSize: CHART_TYPE.tick,
    fontFamily: "inherit",
  },
  grid: {
    stroke: "hsl(var(--border))",
    strokeOpacity: 0.35,
    strokeDasharray: "2 4",
  },
  /** A fainter grid for a small multiple — foreground at a tenth. */
  gridSoft: {
    stroke: "hsl(var(--foreground))",
    strokeOpacity: 0.1,
    strokeDasharray: "3 3",
  },
  /** Tooltip cursor on a line / area: a hairline. */
  cursor: {
    stroke: "hsl(var(--muted-foreground))",
    strokeOpacity: 0.4,
    strokeWidth: 1,
  },
  /** Tooltip cursor on a bar: a faint band behind the hovered row. */
  cursorFill: {
    fill: "hsl(var(--muted-foreground))",
    fillOpacity: 0.08,
  },
  /** A reference line (an account average) — dashed, recessive. */
  reference: {
    stroke: "hsl(var(--muted-foreground))",
    strokeOpacity: 0.6,
    strokeDasharray: "3 3",
  },
  /** The zoom brush under a trend: no black literal, the ground at half. */
  brush: {
    stroke: "hsl(var(--primary) / 0.35)",
    fill: "hsl(var(--background) / 0.5)",
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

// Fills come from RAMP STEPS, not from alpha over the ground. Alpha
// compositing drags a hue through the surface colour: amber at 0.28 over the
// dark card composites to rgb(90,73,53) — brown — and teal to a near-black
// that reads as an empty cell. Both were visibly wrong the first time this
// was rendered in a browser, which is the only way it could have been caught:
// jsdom resolves no custom properties and computes no composite.
//
// The v3 ramps exist precisely for this (Phase 3 §01: "700-900 for fills on
// dark ground, 100-300 for text on tints — replacing every
// rgba(21,93,255,0.12)-style literal").

// Per Phase 3 §01, a fill on the dark ground comes from ramp steps 700-900.
// Three bands per side, because a heat cell is read by comparison with its
// neighbours and three distinguishable levels beat nine that differ by less
// than the eye resolves.
const GOOD_STEPS = ["--mx-success-700", "--mx-success-800", "--mx-success-900"];
const BAD_STEPS  = ["--mx-danger-700",  "--mx-danger-800",  "--mx-danger-900"];
/** Neutral midpoint — a hue here would read as a third category. */
const MID_STEP = "--mx-neutral-700";
/** Unmeasured: fainter than every measured band, so absence never looks average. */
const NONE_STEP = "--mx-neutral-900";

/**
 * A fill for a diverging cell.
 *
 * @param t 0 = worst, 1 = best, 0.5 = neutral. Null when unmeasured.
 */
export function divergingFill(t: number | null): string {
  if (t == null || !Number.isFinite(t)) return `var(${NONE_STEP})`;
  const clamped = Math.min(1, Math.max(0, t));
  const distance = Math.abs(clamped - 0.5) * 2;
  if (distance < 0.15) return `var(${MID_STEP})`;
  const steps = clamped > 0.5 ? GOOD_STEPS : BAD_STEPS;
  const band = distance >= 0.75 ? 0 : distance >= 0.4 ? 1 : 2;
  return `var(${steps[band]})`;
}

/**
 * The legend for `divergingFill`, derived FROM it.
 *
 * A legend that names its own colours drifts the moment the scale is
 * re-stepped — which is exactly what happened here: the swatches showed the
 * bright base hues while the cells were painted from the dark end of the
 * ramp, so the key and the map disagreed. Deriving the swatches from the same
 * function makes that impossible rather than merely discouraged.
 */
export function divergingLegend(): { label: string; fill: string }[] {
  return [
    { label: "Worse", fill: divergingFill(0) },
    { label: "", fill: divergingFill(0.25) },
    { label: "Neutral", fill: divergingFill(0.5) },
    { label: "", fill: divergingFill(0.75) },
    { label: "Better", fill: divergingFill(1) },
    { label: "Not measured", fill: divergingFill(null) },
  ];
}

/**
 * Bright verdict colours — for a dot, an icon or a chip, where the colour IS
 * the mark rather than a surface something sits on. NOT for cell fills: use
 * `divergingFill`, and `divergingLegend` to key it.
 *
 * `bad` is danger red, not warning amber, and the distinction is deliberate:
 *
 *   POLARITY  — "this segment costs more than goal" — is the diverging scale,
 *               red <-> neutral <-> green. It is a reading of performance.
 *   WARNING   — "this export was missing a column", "these rows were
 *               superseded" — is amber, and means something needs attention
 *               about the DATA, not about the result.
 *
 * They were the same colour before, which made a merely expensive audience
 * look like a broken import.
 */
export const VERDICT = {
  good: "hsl(var(--status-success))",
  neutral: "hsl(var(--muted-foreground))",
  /** Between good and bad: partial coverage, a middling tier. Not a warning
   *  banner's amber by accident — the same status role, used as a MARK. */
  partial: "hsl(var(--status-warning))",
  bad: "hsl(var(--status-danger))",
  unmeasured: "hsl(var(--muted-foreground) / 0.35)",
} as const;

/**
 * A single-hue sequential ramp for MAGNITUDE (spend, impressions, volume).
 * One hue, stepped by opacity — never a rainbow, and never the diverging
 * pair, because magnitude has no good end.
 */
export function magnitudeFill(t: number | null, slot = 0): string {
  if (t == null || !Number.isFinite(t)) return "transparent";
  const clamped = Math.min(1, Math.max(0, t));
  // Four steps down one role's ramp, darkest for the smallest magnitude. Blue
  // is the default because magnitude on this platform is almost always spend.
  const role = slot === 3 ? "success" : "blue";
  if (clamped < 0.10) return "transparent";
  // Five bands, not three. The first version used 900/800/700 and resolved
  // only three distinct levels across a full range of values — two cells an
  // order of magnitude apart came out the same colour. Seen in the design
  // lab against the cockpit ground, where the darkest steps sit close to the
  // surface and compress further.
  // Stops at 600, not 500: a magnitude cell carries its value as text, and
  // step 500 puts that text at 3.9:1 — under AA. 600 holds 5.7:1 while the
  // steps stay evenly separated (47-54 in RGB distance).
  const step =
    clamped >= 0.75 ? 600 :
    clamped >= 0.50 ? 700 :
    clamped >= 0.25 ? 800 : 900;
  return `var(--mx-${role}-${step})`;
}

/** The legend for `magnitudeFill`, derived FROM it — same reason as above. */
export function magnitudeLegend(slot = 0): string[] {
  return [0.15, 0.35, 0.6, 0.85].map((t) => magnitudeFill(t, slot));
}
