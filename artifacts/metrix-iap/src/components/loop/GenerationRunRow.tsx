// ─── One generation run, as a row ──────────────────────────────────────
// The Strategy and Creative centres' run history cards and Strategy ›
// History list runs with this row: status, id, when, model, and what the
// run was built from (slice 3): a strategy run names the window its
// analysis runs cover and how many runs, a briefs run the strategy run it
// read. Fragments, never a sentence; the run's error whole behind the
// existing disclosure.

import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { GenerationRun } from "@workspace/api-client-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { DetailReveal, deriveLabel } from "@/pages/metrix/shared";
import { TYPE } from "@/pages/metrix/typography";
import { fmtDay } from "@/lib/normalize";

/** "2026-08-04 → 2026-09-02 · 2 runs" / "all time" / "strategy run of Sep 4" / null when nothing was recorded. */
function generationSourceLabel(run: GenerationRun, kind: "strategy" | "briefs", strategyRuns: readonly GenerationRun[] = []): string | null {
  if (kind === "strategy") {
    const ids = run.source_analysis_run_ids ?? [];
    const window = run.source_window_start && run.source_window_end ? `${run.source_window_start} → ${run.source_window_end}` : null;
    const count = ids.length > 1 ? `${ids.length} runs` : null;
    if (window || count) return [window, count].filter(Boolean).join(" · ");
    if (run.source_analysis_all_time) return "all time";
    if (ids.length === 1) return "1 run";
    return null;
  }
  if (run.source_generation_run_id) {
    const source = strategyRuns.find((r) => r.id === run.source_generation_run_id);
    return source ? `strategy run of ${fmtDay(source.started_at, { year: true })}` : "an earlier strategy run";
  }
  return null;
}

export function GenerationRunRow({
  run,
  kind,
  strategyRuns = [],
  className,
}: {
  run: GenerationRun;
  kind: "strategy" | "briefs";
  /** For a briefs run: the strategy runs, to name the one it read. */
  strategyRuns?: readonly GenerationRun[];
  className?: string;
}) {
  const source = generationSourceLabel(run, kind, strategyRuns);
  const outputs =
    run.output_count != null
      ? `${run.output_count} ${kind === "strategy" ? "pillar" : "brief"}${run.output_count === 1 ? "" : "s"}`
      : null;
  return (
    <div
      className={cn("flex items-center gap-2.5 py-2 border-t border-border/25 first:border-0 min-w-0", className)}
      data-testid={`generation-run-${run.id}`}
    >
      {run.status === "running" && <Loader2 className="w-4 h-4 text-status-warning animate-spin shrink-0" aria-hidden />}
      {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" aria-hidden />}
      {run.status === "error" && <XCircle className="w-4 h-4 text-status-danger shrink-0" aria-hidden />}
      <span className="flex-1 min-w-0">
        <span className="block text-body font-medium text-foreground/90 capitalize truncate">
          {run.status}
          <span className="ml-2 text-caption font-normal text-muted-foreground/75 normal-case">{run.id}</span>
        </span>
        <span className={cn(TYPE.caption, "block text-muted-foreground/75 truncate")}>
          {new Date(run.started_at).toLocaleString()}
          {run.model ? ` · ${run.model}` : ""}
          {outputs ? ` · ${outputs}` : ""}
          {source ? ` · from ${source}` : ""}
        </span>
        {run.status === "error" && run.error_message && (
          <DetailReveal
            label={deriveLabel(run.error_message, 72)}
            eyebrow="The run's own error"
            labelClassName={cn(TYPE.caption, "text-status-danger/90")}
            sections={[{ text: run.error_message }]}
          />
        )}
      </span>
    </div>
  );
}
