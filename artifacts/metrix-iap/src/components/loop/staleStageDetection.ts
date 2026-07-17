// ── Stale-stage detection (pure, unit-testable) ─────────────────────────────
//
// Extracted from LoopCommandChain so the edge-case logic can be verified
// independently of React rendering.
//
// Rules:
//   analysisFinishedAt  — the `finished_at` of the latest analysis run, but
//                         ONLY when status === "success"; failed runs are
//                         treated as if they never ran (null).
//   strategyGeneratedAt — prefers the in-memory generation run (status
//                         "success" only), falls back to the loopStatus row
//                         for "strategy_map".  A failed in-memory run does
//                         NOT block the loopStatus fallback.
//   briefsGeneratedAt   — same pattern for "brief_builder".
//
//   strategyIsStale: strategy is complete, analysis is complete, both
//     timestamps exist, strategy is not currently running, AND analysis
//     finished AFTER strategy was generated.
//
//   briefsIsStale: briefs are complete, analysis is complete, briefs not
//     running, briefsGeneratedAt exists, AND either analysis finished after
//     briefs OR strategy was generated after briefs.

export interface RunInfo {
  status: string;
  finished_at?: string | null;
}

export interface LoopStatusEntry {
  stage: string;
  generated_at?: string | null;
}

export interface StaleStageInput {
  analysisRun: RunInfo | null;
  strategyLastRun: RunInfo | null;
  briefsLastRun: RunInfo | null;
  loopStatus: LoopStatusEntry[] | null;
  analysisComplete: boolean;
  strategyComplete: boolean;
  briefsComplete: boolean;
  strategyRunning: boolean;
  briefsRunning: boolean;
}

export interface StaleStageResult {
  analysisFinishedAt: string | null;
  strategyGeneratedAt: string | null;
  briefsGeneratedAt: string | null;
  strategyIsStale: boolean;
  briefsIsStale: boolean;
}

export function computeStaleStages(input: StaleStageInput): StaleStageResult {
  const {
    analysisRun,
    strategyLastRun,
    briefsLastRun,
    loopStatus,
    analysisComplete,
    strategyComplete,
    briefsComplete,
    strategyRunning,
    briefsRunning,
  } = input;

  const analysisFinishedAt =
    (analysisRun?.status === "success" ? (analysisRun.finished_at ?? null) : null) ?? null;

  const strategyGeneratedAt =
    (strategyLastRun?.status === "success" ? (strategyLastRun.finished_at ?? null) : null) ??
    (loopStatus?.find((l) => l.stage === "strategy_map")?.generated_at ?? null);

  const briefsGeneratedAt =
    (briefsLastRun?.status === "success" ? (briefsLastRun.finished_at ?? null) : null) ??
    (loopStatus?.find((l) => l.stage === "brief_builder")?.generated_at ?? null);

  const strategyIsStale =
    strategyComplete &&
    analysisComplete &&
    !!analysisFinishedAt &&
    !!strategyGeneratedAt &&
    !strategyRunning &&
    new Date(analysisFinishedAt) > new Date(strategyGeneratedAt);

  const briefsIsStale =
    briefsComplete &&
    analysisComplete &&
    !!briefsGeneratedAt &&
    !briefsRunning &&
    ((!!analysisFinishedAt && new Date(analysisFinishedAt) > new Date(briefsGeneratedAt)) ||
      (!!strategyGeneratedAt && new Date(strategyGeneratedAt) > new Date(briefsGeneratedAt)));

  return {
    analysisFinishedAt,
    strategyGeneratedAt,
    briefsGeneratedAt,
    strategyIsStale,
    briefsIsStale,
  };
}
