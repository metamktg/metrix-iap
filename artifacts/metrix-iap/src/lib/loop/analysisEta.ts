// ─── Analysis run ETA, from evidence only ─────────────────────────────
// Sweep spec §4.3: an ETA appears only from evidence. For Analysis that is
// the median wall-clock duration of this account's prior successful runs
// that are comparable with the one in flight; with no comparable run the
// hub shows the stage and the elapsed time and no ETA at all. Every ETA
// reads "usually about N min", never a countdown: a countdown claims a
// precision the evidence does not carry.
//
// Comparability today is the run's date-range preset (7d · 14d · 30d ·
// all): runs of the same preset read the same window of the same account's
// staged files, and the preset is the one parameter known while the run is
// still in flight. The spec's tighter band (rows within 50% of the run's
// expected rows) needs the staged files' row counts, which staging does not
// record until the detection work of §7.2 lands; when it does, this module
// narrows the candidates and nothing above it changes. `rows_ingested` is
// only known once a run has finished, so it cannot pick candidates for a
// run that has not.
//
// `stage_timings` (the engine writes one entry per stage boundary) makes
// the second claim possible: a stage that has already taken twice as long
// as it usually does on this account is named, so a reader can tell a slow
// stage from a stuck one.

import type { AnalysisRun } from "@workspace/api-client-react";

export interface StageTiming {
  stage: string;
  pct: number;
  at: string;
}

export interface AnalysisEta {
  /** Median duration of the comparable prior runs, or null with no evidence. */
  etaSeconds: number | null;
  /** How many prior runs the estimate rests on (0 when etaSeconds is null). */
  basisRuns: number;
  /** The current stage, when it has run past twice its usual duration here. */
  slowStage: string | null;
}

/** Seconds between a run's start and finish, or null while it has neither. */
function runDurationSeconds(run: Pick<AnalysisRun, "started_at" | "finished_at">): number | null {
  if (!run.started_at || !run.finished_at) return null;
  const s = new Date(run.started_at).getTime();
  const f = new Date(run.finished_at).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(f) || f < s) return null;
  return (f - s) / 1000;
}

/** The middle value; the mean of the two middle values for an even count. */
function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Stage timings off a run, tolerating the field's absence on older rows. */
function stageTimingsOf(run: Partial<Pick<AnalysisRun, "stage_timings">>): StageTiming[] {
  const raw = (run as { stage_timings?: unknown }).stage_timings;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is StageTiming =>
      !!t && typeof t === "object" && typeof (t as StageTiming).stage === "string" && typeof (t as StageTiming).at === "string",
  );
}

/**
 * Prior successful runs comparable with the run in flight: the same
 * date-range preset when any run of that preset finished before, else
 * every finished successful run. The in-flight run itself and any run
 * without a finish time never count.
 */
function comparableRuns(
  runs: readonly AnalysisRun[],
  inFlight: Pick<AnalysisRun, "id" | "date_range"> | null,
): AnalysisRun[] {
  const finished = runs.filter(
    (r) => r.status === "success" && r.id !== inFlight?.id && runDurationSeconds(r) !== null,
  );
  if (!inFlight?.date_range) return finished;
  const samePreset = finished.filter((r) => r.date_range === inFlight.date_range);
  return samePreset.length > 0 ? samePreset : finished;
}

/**
 * Seconds each stage took on a finished run: from its entry to the next
 * entry, the last stage to the finish. A run without timings yields none.
 */
function stageDurations(run: AnalysisRun): Map<string, number> {
  const out = new Map<string, number>();
  const timings = stageTimingsOf(run);
  if (timings.length === 0) return out;
  const end = run.finished_at ? new Date(run.finished_at).getTime() : NaN;
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i]!;
    const from = new Date(t.at).getTime();
    const to = i + 1 < timings.length ? new Date(timings[i + 1]!.at).getTime() : end;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    // A label that recurs (a retry, a repeated stage) accumulates.
    out.set(t.stage, (out.get(t.stage) ?? 0) + (to - from) / 1000);
  }
  return out;
}

/** A stage counts as slow past twice its usual duration and at least this long. */
const SLOW_STAGE_FLOOR_SECONDS = 30;

export function estimateAnalysisEta(
  runs: readonly AnalysisRun[],
  inFlight: AnalysisRun | null,
  nowMs: number,
): AnalysisEta {
  const basis = comparableRuns(runs, inFlight);
  const durations = basis.map((r) => runDurationSeconds(r)).filter((d): d is number => d !== null);
  const etaSeconds = median(durations);

  let slowStage: string | null = null;
  if (inFlight && inFlight.status === "running" && inFlight.progress_stage) {
    const stage = inFlight.progress_stage;
    const timings = stageTimingsOf(inFlight);
    const entered = timings.length > 0 ? timings[timings.length - 1]!.at : inFlight.started_at;
    const enteredMs = entered ? new Date(entered).getTime() : NaN;
    const inStage = Number.isFinite(enteredMs) ? (nowMs - enteredMs) / 1000 : 0;
    const usual = median(
      basis.map((r) => stageDurations(r).get(stage)).filter((d): d is number => typeof d === "number"),
    );
    if (usual !== null && inStage >= SLOW_STAGE_FLOOR_SECONDS && inStage > 2 * usual) slowStage = stage;
  }

  return { etaSeconds, basisRuns: etaSeconds === null ? 0 : durations.length, slowStage };
}

/** "usually about 3 min" from a median in seconds, minutes never below one. */
export function usuallyAboutLabel(etaSeconds: number): string {
  const minutes = Math.max(1, Math.round(etaSeconds / 60));
  return `usually about ${minutes} min`;
}
