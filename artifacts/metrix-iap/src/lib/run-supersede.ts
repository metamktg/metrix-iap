// ─── Scoping rollup rows to one analysis run ──────────────────────────
//
// concept_performance and variable_performance retain ONE ROW PER RUN by
// design — schema.sql widened their unique keys to include
// manual_analysis_run_id precisely so re-runs accumulate rather than
// destroying history, and RunScopePicker reads that history.
//
// The consequence is that the arrays they feed — concept_rollup and
// v3_variable_performance — are cumulative. Summing them without scoping
// counts the same spend once per run: two runs over the same June flight
// report $2,000 for a $1,000 month, three report $3,000. Re-running
// analysis after uploading new reports is the documented workflow, so this
// is the ordinary path.
//
// Two rules, and the second is the one that is easy to get wrong:
//
//   · Scope to a run before aggregating.
//   · A row with a NULL run id is pre-migration history that was never
//     tagged. schema.sql is explicit: "Null rows must always be included
//     regardless of which run(s) are selected — never silently dropped."
//     They are kept, because dropping them would hide real measurements to
//     fix a problem they are not part of.

/** The two fields any run-tagged rollup row carries. */
export interface RunTagged {
  manual_analysis_run_id?: string | null;
}

/**
 * Rows belonging to `runId`, plus every untagged row.
 *
 * `runId` null means no run has succeeded for this account — there is
 * nothing to scope to, so the untagged rows are all there is and every row
 * is returned unchanged.
 */
export function scopeToRun<T extends RunTagged>(rows: T[], runId: string | null): T[] {
  if (!runId) return rows;
  return rows.filter((r) => r.manual_analysis_run_id == null || r.manual_analysis_run_id === runId);
}

/**
 * How many rows a scope would drop. Callers surface this rather than
 * quietly showing a smaller number than the one that was on screen before —
 * a total that falls because scoping was added should say why.
 */
export function supersededCount<T extends RunTagged>(rows: T[], runId: string | null): number {
  if (!runId) return 0;
  return rows.length - scopeToRun(rows, runId).length;
}

/**
 * True when these rows carry measurements from more than one run — the
 * condition under which an unscoped aggregate is wrong.
 */
export function spansMultipleRuns<T extends RunTagged>(rows: T[]): boolean {
  const ids = new Set<string>();
  for (const r of rows) if (r.manual_analysis_run_id) ids.add(r.manual_analysis_run_id);
  return ids.size > 1;
}
