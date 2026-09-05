// ─── Status hub model ──────────────────────────────────────────────────
// Sweep spec §4.1: one model, four rows, for every Execution Layer page.
// The builder for each stage lives here, pure, so what the hub says about
// a run is a function of the run records and nothing else. The Analysis
// builder is the first (slice 1); Strategy, Creative and MST follow the
// same shape in slice 3.
//
// First-layer rule (§4.4): every string here is a fragment joined with the
// house " · ", never a sentence. Prose that needs to exist (a run's whole
// error, its warnings) rides in fields the component discloses on demand.
//
// Slice 3 (2026-09-05) adds the Strategy, Creative and MST builders (§4.2).
// A generation run carries no stage timings, so its in-flight row names
// the engine's stage and the elapsed time, and its ETA is the median of
// the account's prior successful runs of the kind, falling back to the
// measured platform median (§4.3) when the account has none.

import type { AnalysisRun, GenerationRun, ManualImport, ManualImportKind } from "@workspace/api-client-react";
import type { RunSelectorValue } from "@/components/analysis/RunSelector";
import { fmtDay, fmtDayRange } from "@/lib/normalize";
import { estimateAnalysisEta, median, runDurationSeconds } from "./analysisEta";

export interface StatusHubInput {
  label: string;
  detail?: string;
  to?: string;
}

export interface StatusHubInFlight {
  /** Empty while the request is in flight and no run row exists yet. */
  runId: string;
  startedAt: string;
  stage: string;
  /** The engine's own percentage; null means "no number yet", never 0. */
  percent: number | null;
  elapsedSeconds: number;
  /** Median of comparable prior runs; null with no evidence (§4.3). */
  etaSeconds: number | null;
  /** The current stage, when it has run past twice its usual duration. */
  slowStage: string | null;
}

export interface StatusHubCompleted {
  runId: string;
  finishedAt: string;
  /** "2026-08-04 → 2026-09-02 · 21,130 rows" */
  summary: string;
  /** The run's own warnings, verbatim; the component shows a count and discloses the list. */
  warnings: string[];
  detailsTo?: string;
}

export interface StatusHubFailed {
  runId: string;
  finishedAt: string;
  /** The run's own error, whole; the component clips it on the first layer. */
  message: string;
  /** What the reader still has: "The last successful run's data is still shown". */
  retained: string;
}

export interface StatusHubModel {
  inputs: StatusHubInput[];
  inFlight: StatusHubInFlight | null;
  lastCompleted: StatusHubCompleted | null;
  failed: StatusHubFailed | null;
  /** The completed-run count, with a link when a history page exists; absent on a stage without runs (MST). */
  history?: { count: number; to?: string };
}

/** What the engine does between the click and the run row existing. */
const PREFLIGHT_STAGE = "Validating staged files before the run starts";

const IMPORT_KIND_SHORT: Record<ManualImportKind, string> = {
  performance_demo_csv: "Demographics",
  performance_placement_csv: "Placements",
  performance_ad_summary_csv: "Ad Summary",
  performance_conversion_device_csv: "Conversion device",
  performance_asset_csv: "Asset breakdown",
  creative_asset: "Creative",
};

/** The creative next step, as CreativeNextStepNudge derives it; the hub carries it as a line. */
export type CreativeStepLine =
  | { kind: "deconstruct"; pending: number }
  | { kind: "reanalyze"; deconstructed: number }
  | null;

function fmtRows(n: number): string {
  return `${n.toLocaleString("en-US")} row${n === 1 ? "" : "s"}`;
}

const byStartDesc = (a: AnalysisRun, b: AnalysisRun) =>
  new Date(b.started_at).getTime() - new Date(a.started_at).getTime();

export function buildAnalysisHub(args: {
  runs: readonly AnalysisRun[];
  imports: readonly ManualImport[];
  /** "30 days" · "All staged data" */
  windowLabel: string;
  creativeStep: CreativeStepLine;
  /** True from the Run click until the server's run row is visible. */
  starting: boolean;
  nowMs: number;
  historyTo: string;
}): StatusHubModel {
  const { runs, imports, windowLabel, creativeStep, starting, nowMs, historyTo } = args;

  // Inputs: what the next run will read.
  const staged = imports.filter((imp) => imp.status === "staged" && imp.kind !== "creative_asset");
  const inputs: StatusHubInput[] = [];
  if (staged.length === 0) {
    inputs.push({ label: "Nothing staged", detail: "Add a performance export" });
  } else {
    const kinds = Array.from(new Set(staged.map((imp) => IMPORT_KIND_SHORT[imp.kind] ?? imp.kind)));
    inputs.push({ label: `${staged.length} file${staged.length === 1 ? "" : "s"} staged`, detail: kinds.join(", ") });
  }
  // The window is the run's one parameter the reader chooses. The run's
  // objectives stay on the run card as its parameter line: the business
  // model is an analysis lens, never a description of the account.
  inputs.push({ label: `Window · ${windowLabel}` });
  if (creativeStep?.kind === "deconstruct") {
    inputs.push({
      label: `${creativeStep.pending} creative${creativeStep.pending === 1 ? "" : "s"} staged, not deconstructed`,
      detail: "Creative",
      to: "/app/creative",
    });
  } else if (creativeStep?.kind === "reanalyze") {
    inputs.push({
      label: `${creativeStep.deconstructed} deconstructed since the last run`,
      detail: "Re-run to use them",
    });
  }

  const ordered = runs.slice().sort(byStartDesc);
  const running = ordered.find((r) => r.status === "running") ?? null;
  const successes = ordered.filter((r) => r.status === "success");
  const latest = ordered[0] ?? null;
  const latestSuccess = successes[0] ?? null;

  // In flight: the server's run row, or the pre-flight while it does not exist yet.
  let inFlight: StatusHubInFlight | null = null;
  if (running) {
    const startedMs = new Date(running.started_at).getTime();
    const eta = estimateAnalysisEta(runs, running, nowMs);
    inFlight = {
      runId: running.id,
      startedAt: running.started_at,
      stage: running.progress_stage || "Starting",
      percent: typeof running.progress_pct === "number" && running.progress_pct > 0 ? running.progress_pct : null,
      elapsedSeconds: Number.isFinite(startedMs) ? Math.max(0, Math.round((nowMs - startedMs) / 1000)) : 0,
      etaSeconds: eta.etaSeconds,
      slowStage: eta.slowStage,
    };
  } else if (starting) {
    const eta = estimateAnalysisEta(runs, null, nowMs);
    inFlight = {
      runId: "",
      startedAt: new Date(nowMs).toISOString(),
      stage: PREFLIGHT_STAGE,
      percent: null,
      elapsedSeconds: 0,
      etaSeconds: eta.etaSeconds,
      slowStage: null,
    };
  }

  const lastCompleted: StatusHubCompleted | null = latestSuccess
    ? {
        runId: latestSuccess.id,
        finishedAt: latestSuccess.finished_at ?? latestSuccess.started_at,
        summary: [
          latestSuccess.date_start && latestSuccess.date_end
            ? `${latestSuccess.date_start} → ${latestSuccess.date_end}`
            : latestSuccess.date_range ?? "custom range",
          latestSuccess.rows_ingested != null ? fmtRows(latestSuccess.rows_ingested) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        warnings: latestSuccess.csv_warnings ?? [],
        detailsTo: historyTo,
      }
    : null;

  // A failure is reported while it is the latest thing that happened: a
  // later success settles it, and the history keeps the record.
  const failed: StatusHubFailed | null =
    latest && latest.status === "error" && !running
      ? {
          runId: latest.id,
          finishedAt: latest.finished_at ?? latest.started_at,
          message: latest.error_message ?? "The run ended with an error",
          // What the reader is still looking at (sweep spec §7.7): a failed
          // run deletes only its own rows and the account keeps pointing at
          // its last successful run, so that run's window is named here.
          retained: latestSuccess
            ? `The last successful run's data${
                latestSuccess.date_start && latestSuccess.date_end ? ` (${latestSuccess.date_start} → ${latestSuccess.date_end})` : ""
              } is still shown`
            : "No completed run to show yet",
        }
      : null;

  return { inputs, inFlight, lastCompleted, failed, history: { to: historyTo, count: successes.length } };
}

// ─── Generation stages: Strategy and Creative ──────────────────────────

/**
 * The measured platform median for a generation run (GenerationControls
 * measured 209 s for strategy and 199 s for briefs over every successful
 * production run); the ETA when this account has no successful run of the
 * kind yet (§4.3).
 */
const GENERATION_TYPICAL_SECONDS = 210;

const byGenStartDesc = (a: GenerationRun, b: GenerationRun) =>
  new Date(b.started_at).getTime() - new Date(a.started_at).getTime();

/** Median duration of the account's prior successful runs of the kind, else the platform median. */
function generationEtaSeconds(runs: readonly GenerationRun[], inFlightId: string | null): number {
  const durations = runs
    .filter((r) => r.status === "success" && r.id !== inFlightId)
    .map((r) => runDurationSeconds(r))
    .filter((d): d is number => d !== null && d > 0);
  return median(durations) ?? GENERATION_TYPICAL_SECONDS;
}

/**
 * The runs the hub reasons over: the list when the server serves one, else
 * the latest run alone (an older server, or the list still loading).
 */
function generationRuns(runs: readonly GenerationRun[], latest: GenerationRun | null): GenerationRun[] {
  const all = runs.slice();
  if (latest && !all.some((r) => r.id === latest.id)) all.push(latest);
  return all.sort(byGenStartDesc);
}

function generationInFlight(args: {
  runs: readonly GenerationRun[];
  latest: GenerationRun | null;
  starting: boolean;
  nowMs: number;
  fallbackStage: string;
  preflightStage: string;
}): StatusHubInFlight | null {
  const { runs, latest, starting, nowMs, fallbackStage, preflightStage } = args;
  if (latest && latest.status === "running") {
    const startedMs = new Date(latest.started_at).getTime();
    return {
      runId: latest.id,
      startedAt: latest.started_at,
      stage: latest.progress_stage || fallbackStage,
      percent: typeof latest.progress_pct === "number" && latest.progress_pct > 0 ? latest.progress_pct : null,
      elapsedSeconds: Number.isFinite(startedMs) ? Math.max(0, Math.round((nowMs - startedMs) / 1000)) : 0,
      etaSeconds: generationEtaSeconds(runs, latest.id),
      slowStage: null,
    };
  }
  if (starting) {
    return {
      runId: "",
      startedAt: new Date(nowMs).toISOString(),
      stage: preflightStage,
      percent: null,
      elapsedSeconds: 0,
      etaSeconds: generationEtaSeconds(runs, null),
      slowStage: null,
    };
  }
  return null;
}

/** The latest run's failure while it is the latest thing that happened. */
function generationFailed(ordered: readonly GenerationRun[], retained: string): StatusHubFailed | null {
  const latest = ordered[0] ?? null;
  if (!latest || latest.status !== "error") return null;
  return {
    runId: latest.id,
    finishedAt: latest.finished_at ?? latest.started_at,
    message: latest.error_message ?? "The run ended with an error",
    retained,
  };
}

/** "2026-08-04 → 2026-09-02" from the run record, or "all time" for an older all-time run. */
function sourceWindowLabel(run: GenerationRun): string | null {
  if (run.source_window_start && run.source_window_end) return `${run.source_window_start} → ${run.source_window_end}`;
  if (run.source_analysis_all_time) return "all time";
  return null;
}

/** The analysis runs a selection names, in the order of the list. */
function selectedAnalysisRuns(selection: RunSelectorValue, analysisRuns: readonly AnalysisRun[]): AnalysisRun[] {
  if (selection.allTime) return [];
  return analysisRuns.filter((r) => selection.selectedRunIds.includes(r.id));
}

/** Earliest start to latest end over runs with dates, as "Aug 1 – Sep 2". */
function analysisWindowLabel(runs: readonly AnalysisRun[]): string | null {
  const dated = runs.filter((r) => r.date_start && r.date_end);
  if (dated.length === 0) return null;
  const start = dated.map((r) => r.date_start!).sort()[0]!;
  const end = dated.map((r) => r.date_end!).sort().at(-1)!;
  return fmtDayRange(start, end);
}

/** The one input line of the Strategy hub: what the next run will be built on (§5.1). */
export function strategyBaseInput(selection: RunSelectorValue, analysisRuns: readonly AnalysisRun[]): StatusHubInput {
  if (selection.allTime) {
    return { label: "Based on · All time", detail: "the account's current analysis run" };
  }
  const selected = selectedAnalysisRuns(selection, analysisRuns);
  if (selected.length === 0) {
    return { label: "Based on · no analysis run selected", detail: "Pick a run" };
  }
  if (selected.length === 1) {
    const run = selected[0]!;
    const label = run.date_start && run.date_end ? fmtDayRange(run.date_start, run.date_end) : run.date_range ?? "analysis run";
    return {
      label: `Based on · ${label}`,
      detail: run.rows_ingested != null ? `${run.rows_ingested.toLocaleString("en-US")} rows` : undefined,
    };
  }
  const window = analysisWindowLabel(selected);
  return {
    label: `Based on · ${selected.length} runs`,
    detail: [window, "later run supersedes overlapping dates"].filter(Boolean).join(", "),
  };
}

export function buildStrategyHub(args: {
  /** The account's strategy runs (the list endpoint), newest first or not. */
  runs: readonly GenerationRun[];
  /** The polled latest run; may already be in `runs`. */
  latest: GenerationRun | null;
  selection: RunSelectorValue;
  analysisRuns: readonly AnalysisRun[];
  /** The rendered strategy's provenance and counts (the seed). */
  strategy: { provenance?: string; pillars: number; hypotheses: number } | null;
  starting: boolean;
  nowMs: number;
  historyTo: string;
}): StatusHubModel {
  const { runs, latest, selection, analysisRuns, strategy, starting, nowMs, historyTo } = args;
  const ordered = generationRuns(runs, latest);
  const successes = ordered.filter((r) => r.status === "success");
  const latestSuccess = successes[0] ?? null;
  const running = ordered.find((r) => r.status === "running") ?? null;

  const inputs: StatusHubInput[] = [strategyBaseInput(selection, analysisRuns)];

  const inFlight = generationInFlight({
    runs: ordered,
    latest: running ?? latest,
    starting,
    nowMs,
    fallbackStage: "Generating strategy from validated analysis…",
    preflightStage: "Reading the analysis evidence before the run starts",
  });

  let lastCompleted: StatusHubCompleted | null = null;
  if (latestSuccess) {
    const generatedShown = strategy?.provenance === "generated";
    const pillars = latestSuccess.output_count ?? (generatedShown && strategy ? strategy.pillars : null);
    const hypotheses = generatedShown && strategy ? strategy.hypotheses : null;
    lastCompleted = {
      runId: latestSuccess.id,
      finishedAt: latestSuccess.finished_at ?? latestSuccess.started_at,
      summary: [
        pillars != null ? `${pillars} pillar${pillars === 1 ? "" : "s"}` : null,
        hypotheses != null ? `${hypotheses} hypothes${hypotheses === 1 ? "is" : "es"}` : null,
        sourceWindowLabel(latestSuccess),
        latestSuccess.model,
      ]
        .filter(Boolean)
        .join(" · ") || fmtDay(latestSuccess.finished_at ?? latestSuccess.started_at, { year: true }),
      warnings: [],
      detailsTo: historyTo,
    };
  }

  const failed = running ? null : generationFailed(ordered, "The current strategy is unchanged");

  return { inputs, inFlight, lastCompleted, failed, history: { to: historyTo, count: successes.length } };
}

/** "run of Sep 4 · 3 pillars" for a strategy run, as the Creative hub and picker name it. */
export function strategyRunLabel(run: Pick<GenerationRun, "started_at" | "output_count">): string {
  const day = fmtDay(run.started_at, { year: true });
  return run.output_count != null ? `run of ${day} · ${run.output_count} pillar${run.output_count === 1 ? "" : "s"}` : `run of ${day}`;
}

export function buildCreativeHub(args: {
  /** The account's briefs runs. */
  runs: readonly GenerationRun[];
  latest: GenerationRun | null;
  /** The account's successful strategy runs (for the source label and the currency rule). */
  strategyRuns: readonly GenerationRun[];
  /** The strategy run the next briefs run will read; null when the imported set is briefed. */
  baseStrategyRun: GenerationRun | null;
  /** Pillars in the set the next run reads (the imported set when no generated one exists). */
  basePillars: number;
  creatives: { staged: number; deconstructed: number };
  briefs: { provenance?: string; total: number; static: number; video: number; ugc: number };
  starting: boolean;
  nowMs: number;
}): StatusHubModel {
  const { runs, latest, strategyRuns, baseStrategyRun, basePillars, creatives, briefs, starting, nowMs } = args;
  const ordered = generationRuns(runs, latest);
  const successes = ordered.filter((r) => r.status === "success");
  const latestSuccess = successes[0] ?? null;
  const running = ordered.find((r) => r.status === "running") ?? null;
  const strategySuccesses = strategyRuns.filter((r) => r.status === "success").slice().sort(byGenStartDesc);
  const strategyById = new Map(strategySuccesses.map((r) => [r.id, r]));

  const inputs: StatusHubInput[] = [];
  inputs.push(
    baseStrategyRun
      ? { label: `Based on · strategy ${strategyRunLabel(baseStrategyRun)}` }
      : { label: `Based on · imported strategy`, detail: `${basePillars} pillar${basePillars === 1 ? "" : "s"}` },
  );
  if (creatives.staged > 0) {
    inputs.push({
      label: `${creatives.staged} creative${creatives.staged === 1 ? "" : "s"} staged`,
      detail: `${creatives.deconstructed} deconstructed`,
    });
  } else {
    inputs.push({ label: "No creatives staged", detail: "Optional" });
  }
  // The currency rule (§5.2): a brief set counts as current only when it
  // started after the latest successful strategy run.
  const currentStrategy = strategySuccesses[0] ?? null;
  const briefsPredateStrategy =
    latestSuccess !== null &&
    currentStrategy !== null &&
    new Date(latestSuccess.started_at).getTime() < new Date(currentStrategy.started_at).getTime();
  if (briefsPredateStrategy) {
    inputs.push({ label: "Current briefs predate the current strategy", detail: "Regenerate to match" });
  }

  const inFlight = generationInFlight({
    runs: ordered,
    latest: running ?? latest,
    starting,
    nowMs,
    fallbackStage: "Generating briefs from strategy…",
    preflightStage: "Reading the strategy pillars before the run starts",
  });

  let lastCompleted: StatusHubCompleted | null = null;
  if (latestSuccess) {
    const generatedShown = briefs.provenance === "generated" && !briefsPredateStrategy;
    const total = latestSuccess.output_count ?? (generatedShown ? briefs.total : null);
    const formats = generatedShown
      ? [
          briefs.static > 0 ? `${briefs.static} static` : null,
          briefs.video > 0 ? `${briefs.video} video` : null,
          briefs.ugc > 0 ? `${briefs.ugc} UGC` : null,
        ]
      : [];
    const source = latestSuccess.source_generation_run_id ? strategyById.get(latestSuccess.source_generation_run_id) : null;
    lastCompleted = {
      runId: latestSuccess.id,
      finishedAt: latestSuccess.finished_at ?? latestSuccess.started_at,
      summary: [
        total != null ? `${total} brief${total === 1 ? "" : "s"}` : null,
        ...formats,
        source ? `from strategy ${strategyRunLabel(source)}` : latestSuccess.source_generation_run_id ? "from an earlier strategy run" : null,
      ]
        .filter(Boolean)
        .join(" · ") || fmtDay(latestSuccess.finished_at ?? latestSuccess.started_at, { year: true }),
      warnings: [],
    };
  }

  const failed = running ? null : generationFailed(ordered, "The current briefs are unchanged");

  return { inputs, inFlight, lastCompleted, failed, history: { count: successes.length } };
}

// ─── MST: no run of its own ────────────────────────────────────────────

export function buildMstHub(args: {
  briefs: { total: number; provenance?: string };
  /** The latest successful briefs run, when the brief set was generated in-app. */
  briefsRun: GenerationRun | null;
  matrix: { avatars: number; cells: number } | null;
}): StatusHubModel {
  const { briefs, briefsRun, matrix } = args;
  const inputs: StatusHubInput[] = [];
  if (briefs.total > 0) {
    inputs.push({
      label: `Brief set · ${briefs.total} brief${briefs.total === 1 ? "" : "s"}`,
      detail: briefs.provenance === "generated" && briefsRun ? `generated ${fmtDay(briefsRun.started_at, { year: true })}` : "Creative",
      to: "/app/creative",
    });
  } else {
    inputs.push({ label: "No brief set yet", detail: "Generate briefs", to: "/app/creative" });
  }
  if (matrix && matrix.avatars > 0) {
    inputs.push({ label: `Matrix · ${matrix.avatars} avatar${matrix.avatars === 1 ? "" : "s"} · ${matrix.cells} cell${matrix.cells === 1 ? "" : "s"}` });
  } else {
    inputs.push({ label: "No matrix yet", detail: "The matrix reads briefed cells" });
  }
  return { inputs, inFlight: null, lastCompleted: null, failed: null };
}
