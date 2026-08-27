// ─── The one aggregation-null policy ──────────────────────────────────
//
// The platform had FOUR policies for the same conceptual operation — sum a
// numeric field across rows — and they disagreed exactly where it matters:
// `metricsCatalog` summed whatever was present and folded the rest with
// `?? 0`; `segment-analytics` returned null if any row lacked the field;
// `date-scope`'s `sumInRange` returned a non-nullable `number`, so an
// all-null rollup asserted "$0 spend" as measured truth; `summaryTrends`
// and `reportExport` took partial sums. Four answers to "which number do I
// trust", which is the worst possible position for a product whose stated
// invariant is that it never fabricates a measurement.
//
// The owner decision (2026-08-25, recorded on BUG-11) picked ONE:
//
//   A sum is null unless EVERY contributing row carries the value.
//
// Null, never 0. Zero is a real, meaningful figure in every metric this
// feeds — spend, results, adds-to-cart — so it must never stand in for an
// unknown. A partial sum is worse than no sum: it renders complete, it
// compares against complete figures, and nothing about it looks wrong.
//
// `sumStrictWithCoverage` additionally reports how many rows carried the
// field, so a surface can explain a null instead of just showing a dash —
// the second half of the same decision ("plus a per-metric coverage note").

export interface StrictSum {
  /** Null unless every contributing row carried a finite value. */
  total: number | null;
  /** Rows that carried a finite value. */
  covered: number;
  /** Rows considered — `covered` when the sum is non-null. */
  contributing: number;
}

export function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Strict sum with coverage. Use this when the caller wants to explain the
 * null ("3 of 11 cells carry adds-to-cart data") rather than render a bare
 * dash — see C3/C4 on why an unexplainable dash is its own honesty defect.
 */
export function sumStrictWithCoverage<T>(rows: readonly T[], pick: (row: T) => unknown): StrictSum {
  let total = 0;
  let covered = 0;
  for (const row of rows) {
    const v = numberOrNull(pick(row));
    if (v == null) continue;
    total += v;
    covered += 1;
  }
  const complete = rows.length > 0 && covered === rows.length;
  return { total: complete ? total : null, covered, contributing: rows.length };
}

/** Strict nullable sum: null when there are no rows, or any row lacks the field. */
export function sumStrict<T>(rows: readonly T[], pick: (row: T) => unknown): number | null {
  return sumStrictWithCoverage(rows, pick).total;
}
