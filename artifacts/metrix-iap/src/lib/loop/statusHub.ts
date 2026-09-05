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

import type { AnalysisRun, ManualImport, ManualImportKind } from "@workspace/api-client-react";
import { estimateAnalysisEta } from "./analysisEta";

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
  history: { to: string; count: number };
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
          retained: latestSuccess ? "The last successful run's data is still shown" : "No completed run to show yet",
        }
      : null;

  return { inputs, inFlight, lastCompleted, failed, history: { to: historyTo, count: successes.length } };
}
