// ─── Which views a data shape can actually back ───────────────────────
//
// Phase 3 §02, the Universal Data Module: "Every module built on
// AnalysisData / StrategyData / MST rows shares one component, not a bespoke
// chart per page: a view switcher across the shapes that data actually
// supports." And its acceptance line: components "only offer views their data
// shape actually supports."
//
// That rule needs a place to live where it can be checked, not restated in
// each page's JSX. This is that place — a table, not a component, so the
// question "can placements be a donut?" has one answer everywhere.
//
// The rule is not stylistic. A Trend view over rows that carry a single
// [date_start, date_end] window would draw a two-point line and imply a
// trajectory the data never measured. A Funnel over rows with no stage counts
// would render stages at zero, which reads as "nobody converted" rather than
// "this export did not carry conversion columns". Offering a view the data
// cannot back is a way of fabricating, and I1 forbids fabricating.

export type DataView = "trend" | "compare" | "breakdown" | "funnel" | "map" | "table";

export const ALL_VIEWS: DataView[] = ["trend", "compare", "breakdown", "funnel", "map", "table"];

export const VIEW_LABEL: Record<DataView, string> = {
  trend: "Trend",
  compare: "Compare",
  breakdown: "Breakdown",
  funnel: "Funnel",
  map: "Map",
  table: "Table",
};

/**
 * The data shapes the platform actually has. Names match the seed fields so a
 * reader can trace a view back to the rows behind it.
 */
export type DataShape =
  | "performance_by_cell"
  | "concept_rollup"
  | "v3_variable_performance"
  | "top_checkout_variables"
  | "demographic_registration_signal"
  | "v3_placement_signal"
  | "device_delivery_signal"
  | "conversion_tracking_signal"
  | "historical_matrix_4x4"
  | "icp_profiles"
  | "daily_series";

interface ShapeSpec {
  views: DataView[];
  /** Why the excluded views are excluded — surfaced to the reader, not just to us. */
  why: Partial<Record<DataView, string>>;
}

/**
 * Phase 3 §02's table, verbatim, plus the two shapes that table implies:
 * conversion_tracking_signal (the funnel counts) and daily_series (the
 * day-grained rows the trend endpoint returns).
 */
const SUPPORT: Record<DataShape, ShapeSpec> = {
  performance_by_cell: {
    views: ["trend", "compare", "table"],
    why: {
      breakdown: "Cell rows carry no audience or placement dimension to break down by.",
      funnel: "Cell rows carry spend and results, not funnel stage counts.",
      map: "The Map view is the 4×4 matrix itself — use historical_matrix_4x4.",
    },
  },
  concept_rollup: {
    views: ["trend", "compare", "table"],
    why: {
      breakdown: "Concept rollups are already aggregated; there is no second dimension left.",
      funnel: "Concept rollups carry spend and results, not funnel stage counts.",
      map: "The Map view is the 4×4 matrix itself — use historical_matrix_4x4.",
    },
  },
  v3_variable_performance: {
    views: ["compare", "breakdown", "table"],
    why: {
      trend: "Variable rows are window totals, not a day series — a line here would invent a trajectory.",
      funnel: "Variable rows carry spend and results, not funnel stage counts.",
      map: "Variables are a ranked list, not a grid — there is no row and column to place them on.",
    },
  },
  top_checkout_variables: {
    views: ["compare", "breakdown", "table"],
    why: {
      trend: "These are totals for one window, not a day series — a line would invent a trajectory.",
      funnel: "These are variables ranked by checkout, not the checkout funnel itself.",
      map: "Variables are a ranked list, not a grid — there is no row and column to place them on.",
    },
  },
  demographic_registration_signal: {
    views: ["breakdown", "map", "table"],
    why: {
      trend: "Demographic rows are window totals, not a day series.",
      compare: "Age × gender is two dimensions — Breakdown and Map both keep them; a single ranked bar flattens one away.",
      funnel: "Present only when the export carried the downstream columns; the Funnel view reads conversion_tracking_signal.",
    },
  },
  v3_placement_signal: {
    views: ["compare", "breakdown", "table"],
    why: {
      trend: "Placement rows are window totals, not a day series.",
      funnel: "Placement rows carry spend and results per placement, not funnel stage counts.",
      map: "Placement is a flat list — a Map needs two axes to place a value on, and this has one.",
    },
  },
  device_delivery_signal: {
    views: ["compare", "breakdown", "table"],
    why: {
      trend: "Device rows cover one window, not a day series — a line would invent a trajectory.",
      funnel: "Delivery rows measure spend and impressions per device, not funnel stage counts.",
      map: "Device is a flat list — a Map needs two axes to place a value on, and this has one.",
    },
  },
  conversion_tracking_signal: {
    views: ["funnel", "table"],
    why: {
      trend: "Each row covers one attributed window, not a day series to plot along.",
      compare: "Spend is not attributable under this tracking basis, so there is no measure to rank by.",
      breakdown: "The device / platform / placement split IS the shape — the Funnel view already splits by it.",
      map: "There is no row and column here to place a value on.",
    },
  },
  historical_matrix_4x4: {
    views: ["map", "table"],
    why: {
      trend: "The matrix is a plan for what to test, not a series of measurements over time.",
      compare: "A ranked bar throws away the row × column position that makes it a matrix.",
      breakdown: "The matrix's row and column ARE the breakdown; a second one would restate it.",
      funnel: "Matrix cells record what ran and what it produced, not funnel stage counts.",
    },
  },
  icp_profiles: {
    views: ["map", "table"],
    why: {
      trend: "Profiles describe who an audience is; they carry no dates to plot along.",
      compare: "Profiles are positions, not a single ranked measure.",
      breakdown: "Positioning already IS the two-axis read — the Map view is that breakdown.",
      funnel: "Profiles carry no funnel stage counts to lay out as a funnel.",
    },
  },
  daily_series: {
    views: ["trend", "table"],
    why: {
      compare: "A day series ranked as bars is just a worse trend line — days have an order.",
      breakdown: "The daily rollup has no second dimension left.",
      funnel: "Daily rollups carry no stage counts — the Funnel view reads conversion_tracking_signal.",
      map: "There is no row and column here to place a value on.",
    },
  },
};

/** Views this shape can honestly render, in a stable order. */
export function viewsFor(shape: DataShape): DataView[] {
  const spec = SUPPORT[shape];
  return ALL_VIEWS.filter((v) => spec.views.includes(v));
}

/** Why a view is unavailable for a shape — null when it IS available. */
export function whyNot(shape: DataShape, view: DataView): string | null {
  const spec = SUPPORT[shape];
  if (spec.views.includes(view)) return null;
  return spec.why[view] ?? "This data shape cannot back that view.";
}

/**
 * Views supported by AT LEAST ONE of several shapes, for a surface that shows
 * more than one. Intersecting instead would hide views that a shape can
 * genuinely back; the switcher disables per-shape, it does not pre-filter.
 */
export function viewsForAny(shapes: DataShape[]): DataView[] {
  const union = new Set(shapes.flatMap(viewsFor));
  return ALL_VIEWS.filter((v) => union.has(v));
}

/**
 * A pie is legible up to five slices. Past that it is a bar chart that has
 * been bent into a circle — Phase 3 §02 names this case directly ("Placements
 * never gets a 7-slice donut").
 */
export const MAX_PIE_SLICES = 5;

export function canRenderAsPie(categoryCount: number): boolean {
  return categoryCount >= 2 && categoryCount <= MAX_PIE_SLICES;
}
