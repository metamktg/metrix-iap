// ─── Several analysis runs in one evidence pack: union with supersede ──
//
// Sweep spec §5.1 (slice 3, 2026-09-05). A strategy can be built on up to
// three analysis runs. The evidence pack is the UNION of their rows, and
// where two selected runs measured the same dates the later run's rows
// supersede the earlier run's for those dates: a re-run over a window is a
// re-measurement of it, and counting both would count the same spend twice
// (the defect slice 2 closed for single-run readers, reopened by hand).
//
// Two kinds of row, two rules:
//
//   · DATED rows (ad_performance and the four breakdown tables carry
//     date_start / date_end per row) are superseded per row: a row of an
//     older run whose dates fall inside a newer selected run's window is
//     dropped, since that newer run measured those dates.
//   · UNDATED rows (concept_performance, variable_performance, the signal
//     tables: one row per run over the run's whole window) are superseded
//     per run: they go only when a newer selected run's window contains the
//     older run's whole window. Two runs whose windows only partly overlap
//     keep both sets, because an aggregate over a window cannot be split at
//     a date; the pack names both windows so the model knows the overlap.
//
// Rows without a run id (the importer's, pre-migration history) are never
// superseded: nothing measured them again. Runs without a window (older
// rows without dates) neither supersede nor are superseded.

export interface RunWindow {
  id: string;
  date_start: string | null;
  date_end: string | null;
  started_at: string;
}

export interface RunTaggedRow {
  manual_analysis_run_id?: string | null;
  date_start?: string | null;
  date_end?: string | null;
}

const orderKey = (startedAt: string): number => {
  const t = Date.parse(startedAt);
  return Number.isNaN(t) ? 0 : t;
};

/** Newest first by started_at; ties keep input order. */
export function orderRunsNewestFirst<T extends { started_at: string }>(runs: readonly T[]): T[] {
  return runs
    .map((r, i) => ({ r, i }))
    .sort((a, b) => orderKey(b.r.started_at) - orderKey(a.r.started_at) || a.i - b.i)
    .map(({ r }) => r);
}

/** ISO dates compare as strings; a run without both dates has no window. */
function windowOf(run: RunWindow): { start: string; end: string } | null {
  if (!run.date_start || !run.date_end) return null;
  return { start: run.date_start, end: run.date_end };
}

/** The runs, newest first, that started after `run` and carry a window. */
function newerWindows(run: RunWindow, ordered: readonly RunWindow[]): { start: string; end: string }[] {
  const t = orderKey(run.started_at);
  return ordered
    .filter((r) => r.id !== run.id && orderKey(r.started_at) > t)
    .map(windowOf)
    .filter((w): w is { start: string; end: string } => w !== null);
}

/**
 * The rows that survive: every untagged row, every row of a run not in the
 * list, and of the listed runs the rows no newer run re-measured.
 */
export function supersedeRows<T extends RunTaggedRow>(rows: readonly T[], runs: readonly RunWindow[]): T[] {
  const ordered = orderRunsNewestFirst(runs);
  const byId = new Map(ordered.map((r) => [r.id, r]));
  // Per run: the newer windows that could supersede it (computed once).
  const newerById = new Map<string, { start: string; end: string }[]>();
  for (const r of ordered) newerById.set(r.id, newerWindows(r, ordered));

  return rows.filter((row) => {
    const runId = row.manual_analysis_run_id ?? null;
    if (runId === null) return true;
    const run = byId.get(runId);
    if (!run) return true;
    const newer = newerById.get(runId) ?? [];
    if (newer.length === 0) return true;
    if (row.date_start && row.date_end) {
      // Dated: gone when one newer window contains the row's dates.
      return !newer.some((w) => w.start <= row.date_start! && row.date_end! <= w.end);
    }
    // Undated: gone when one newer window contains the run's whole window.
    const own = windowOf(run);
    if (!own) return true;
    return !newer.some((w) => w.start <= own.start && own.end <= w.end);
  });
}

/** Which listed runs lost every row to a newer one: the whole-window case. */
export function supersededRunIds(runs: readonly RunWindow[]): string[] {
  const ordered = orderRunsNewestFirst(runs);
  return ordered
    .filter((r) => {
      const own = windowOf(r);
      if (!own) return false;
      return newerWindows(r, ordered).some((w) => w.start <= own.start && own.end <= w.end);
    })
    .map((r) => r.id);
}

/** The span the listed runs cover together: earliest start to latest end. */
export function effectiveWindow(runs: readonly RunWindow[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const r of runs) {
    const w = windowOf(r);
    if (!w) continue;
    if (start === null || w.start < start) start = w.start;
    if (end === null || w.end > end) end = w.end;
  }
  return start !== null && end !== null ? { start, end } : null;
}
