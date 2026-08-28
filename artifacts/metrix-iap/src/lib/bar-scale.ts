// How long is a bar? One answer, used everywhere a bar is drawn.
//
// WHY THIS IS ITS OWN FILE
// Length is the strongest visual encoding of magnitude there is — far
// stronger than colour intensity, which is what the analysis tables used.
// That makes the length rule load-bearing: get it wrong and the table lies
// while every number in it is correct.
//
// It is also easy to get wrong in three specific ways, and the app had
// already started down that road with two separate `RankedBars`
// implementations. So the rule lives here, once, with tests.
//
// THE THREE WAYS A BAR LIES
//
//   1. A COST METRIC WITH A NAÏVE LENGTH. On CPA, lower is better. Scale it
//      as value/max and the worst performer gets the longest bar, which
//      reads as the winner to anyone scanning. `invert` fixes the length so
//      that length and rank agree.
//
//   2. A NULL DRAWN AS ZERO. "Not measured" and "measured zero" are
//      different facts. A zero-length bar for a null claims a measurement
//      nobody took. Null returns `null` here — the caller draws an empty
//      track and a dash.
//
//   3. A MEASURED ZERO DRAWN AS NOTHING. The mirror image. A real zero is a
//      finding; rendering it as an empty track makes it indistinguishable
//      from a gap. It gets a hairline stub instead (`MIN_STUB`).

/** Width of a measured-zero bar, as a share of the track. Visible, not zero. */
export const MIN_STUB = 0.012;

/**
 * Floor for the WORST value on an inverted scale. Without it the worst
 * performer draws nothing and reads as missing; with it, it keeps a bar you
 * can see is short rather than absent.
 */
export const INVERT_FLOOR = 0.12;

export interface BarScale {
  /** Share of the track, 0–1. Null when the value was not measured. */
  share: (value: number | null | undefined) => number | null;
  /** The measured extent the scale was built from. Null when nothing was. */
  min: number | null;
  max: number | null;
  /** How many of the inputs carried a value. */
  measured: number;
}

/**
 * Build a scale from the values that will share a track.
 *
 * `invert` is for metrics where lower is better (CPA, CPC, CPM). It anchors
 * on the RANGE rather than on zero, because a cost scale has no meaningful
 * zero: $4 CPA against a $5 best is nearly as good, and scaling from zero
 * would draw it at 20% of the track. Range-anchored, it draws near-full.
 */
export function barScale(
  values: readonly (number | null | undefined)[],
  invert = false,
): BarScale {
  const measured = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (measured.length === 0) {
    return { share: () => null, min: null, max: null, measured: 0 };
  }
  const min = Math.min(...measured);
  const max = Math.max(...measured);

  const share = (value: number | null | undefined): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (invert) {
      // Every value identical: they are all equally good, so they all fill.
      // Ranking them by an invented tiebreak would be a fabrication.
      if (max === min) return 1;
      return INVERT_FLOOR + (1 - INVERT_FLOOR) * ((max - value) / (max - min));
    }
    if (value === 0) return MIN_STUB;
    if (max <= 0) return MIN_STUB;
    // Negative values on a non-inverted scale (a delta column) clamp to the
    // stub rather than drawing backwards off the track.
    return Math.max(MIN_STUB, Math.min(1, value / max));
  };

  return { share, min, max, measured: measured.length };
}

/** Percentage string for a CSS width, or null for an unmeasured value. */
export function barWidth(scale: BarScale, value: number | null | undefined): string | null {
  const s = scale.share(value);
  return s == null ? null : `${(s * 100).toFixed(2)}%`;
}
