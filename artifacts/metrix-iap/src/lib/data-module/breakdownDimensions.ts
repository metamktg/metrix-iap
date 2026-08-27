// ─── What a shape can be broken down BY ───────────────────────────────
//
// The companion to viewSupport.ts. That table answers "can this shape back a
// Breakdown view?"; this one answers "broken down by what?", which the
// switcher alone cannot: offering the Breakdown view and then having nothing
// to break down by is the same failure one step later.
//
// Same rule as viewSupport: a dimension the rows do not carry is never
// offered, and one that IS carried but has a single distinct value is offered
// DISABLED with the count, because a one-bar breakdown is not a breakdown and
// hiding the option makes the reader wonder where it went.

import type { DataShape } from "./viewSupport";

export interface BreakdownDimension {
  /** Stable key — also the row field this reads. */
  key: string;
  label: string;
  /** One line on what the split means, for the control's title attribute. */
  hint?: string;
}

const BY_SHAPE: Partial<Record<DataShape, BreakdownDimension[]>> = {
  performance_by_cell: [
    // The field names are the row's own. `concept` and `funnel_stage` do not
    // exist on CellPerformanceRow; naming them here would have produced a
    // dimension that always counted zero distinct values and silently
    // disabled itself, which looks exactly like an account with no data.
    { key: "book2_concept_name", label: "Concept", hint: "The BOOK2 creative concept the cell belongs to." },
    { key: "stage", label: "Funnel stage", hint: "The cell's display stage (TOF / MOF / BOF), not its ST_ registry code." },
  ],
  v3_variable_performance: [
    { key: "variable_family", label: "Family", hint: "Hook, tone, framework and the rest." },
    { key: "Result type", label: "Result type", hint: "The conversion event the rows were measured against." },
  ],
  demographic_registration_signal: [
    { key: "Age", label: "Age", hint: "Meta's age buckets, as exported." },
    { key: "Gender", label: "Gender", hint: "Meta's gender buckets, including unknown." },
    { key: "cell_id", label: "Cell", hint: "The matrix cell the rows were attributed to." },
  ],
  v3_placement_signal: [
    { key: "Placement", label: "Placement", hint: "Feed, Reels, Stories and the rest." },
    { key: "Platform", label: "Platform", hint: "Facebook, Instagram, Audience Network." },
  ],
  device_delivery_signal: [
    { key: "device", label: "Device", hint: "Mobile, desktop, connected TV." },
  ],
  top_checkout_variables: [
    { key: "variable_family", label: "Family", hint: "Hook, tone, framework and the rest." },
  ],
  // icp_profiles is deliberately absent. viewSupport excludes the Breakdown
  // view there because "positioning already IS the two-axis read — the Map
  // view is that breakdown", and that is right: splitting positioning by a
  // third field would restate the map with one axis thrown away.
};

/** Dimensions this shape's rows can carry. Empty when none can. */
export function dimensionsFor(shape: DataShape): BreakdownDimension[] {
  return BY_SHAPE[shape] ?? [];
}

/**
 * How many distinct values a dimension actually takes across these rows.
 *
 * This is the number that decides whether the option is usable, and it has to
 * be computed from the ROWS rather than assumed from the shape: an account
 * running one placement has a Placement column with one value in it, and a
 * breakdown by Placement there is a single bar labelled "Feed".
 *
 * Null values are not a distinct value — they are the absence of one — so
 * they are excluded from the count rather than bucketed as "(none)", which
 * would make a column of nulls look like a real second category.
 */
export function distinctCount<Row extends Record<string, unknown>>(
  rows: Row[],
  key: string,
): number {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (v == null || v === "") continue;
    seen.add(String(v));
  }
  return seen.size;
}

/**
 * Why a dimension cannot be used, or null when it can. The string is shown to
 * the reader, so it says what is true of THEIR data.
 */
export function whyNotDimension(distinct: number): string | null {
  if (distinct === 0) return "These rows carry no value for this dimension.";
  if (distinct === 1) {
    return "Every row shares one value here, so a breakdown by it would be a single bar.";
  }
  return null;
}
