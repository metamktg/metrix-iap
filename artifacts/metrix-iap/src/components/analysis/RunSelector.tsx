// ─── Analysis run selector ─────────────────────────────────────────────
// Shared control for scoping analysis-derived content (strategy evidence,
// IAP Library, MST, etc.) by analysis run instead of by date window.
//
// Two-part interaction: an "All time" toggle (checked by default — every
// run) sits above a checklist of individual runs, dimmed/disabled while
// All time is checked. This is deliberately not folded into one list with
// an "All time" row, and not a single-select — the product rule this
// implements is "select one run, several, or literally all of them," and
// the two concepts (a specific subset vs. everything) stay visually and
// semantically distinct. A run's date range is shown purely as a "which
// one is this" label — it is never used to filter anything here.

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { AnalysisRun } from "@workspace/api-client-react";

export interface RunSelectorValue {
  allTime: boolean;
  /** Ignored/meaningless when allTime is true. */
  selectedRunIds: string[];
}

export const ALL_TIME_SELECTION: RunSelectorValue = { allTime: true, selectedRunIds: [] };

function fmtRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function runLabel(run: AnalysisRun): string {
  if (run.date_start && run.date_end) return `${fmtRunDate(run.date_start)} – ${fmtRunDate(run.date_end)}`;
  return run.date_range ?? "Analysis run";
}

export function RunSelector({
  runs,
  value,
  onChange,
  maxVisible = 5,
}: {
  runs: AnalysisRun[];
  value: RunSelectorValue;
  onChange: (v: RunSelectorValue) => void;
  maxVisible?: number;
}) {
  const displayRuns = runs.slice(0, maxVisible);
  const hiddenCount = runs.length - displayRuns.length;

  const toggleRun = (runId: string) => {
    const set = new Set(value.selectedRunIds);
    if (set.has(runId)) set.delete(runId);
    else set.add(runId);
    onChange({ allTime: false, selectedRunIds: [...set] });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onChange({ allTime: true, selectedRunIds: [] })}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors",
          value.allTime
            ? "border-emerald-400/30 bg-emerald-400/[0.07] text-foreground/90"
            : "border-border/40 bg-transparent text-foreground/70 hover:bg-muted/30",
        )}
      >
        <Checkbox checked={value.allTime} className="pointer-events-none" />
        <span className="text-label font-semibold flex-1">All time</span>
        <span className="text-[9px] text-muted-foreground/40">
          {runs.length} run{runs.length !== 1 ? "s" : ""} total
        </span>
      </button>

      {displayRuns.length > 0 && (
        <div
          className={cn(
            "rounded-lg border border-border/40 divide-y divide-border/30 overflow-hidden transition-opacity",
            value.allTime && "opacity-40 pointer-events-none",
          )}
        >
          {displayRuns.map((run, idx) => {
            const isSel = !value.allTime && value.selectedRunIds.includes(run.id);
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => toggleRun(run.id)}
                disabled={value.allTime}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors",
                  isSel
                    ? "bg-emerald-400/[0.07] text-foreground/90"
                    : "bg-transparent text-foreground/55 hover:bg-muted/30",
                )}
              >
                <Checkbox checked={isSel} className="pointer-events-none" />
                <span className="text-label font-medium flex-1 truncate">{runLabel(run)}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {idx === 0 && (
                    <span className="text-[8px] font-semibold uppercase tracking-wider text-emerald-400/60 bg-emerald-400/[0.08] border border-emerald-400/15 rounded px-1 py-0.5 leading-none">
                      Latest
                    </span>
                  )}
                  {run.rows_ingested != null && (
                    <span className="text-[9px] font-mono text-muted-foreground/35">
                      {run.rows_ingested.toLocaleString()} rows
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <div className="px-2.5 py-1.5 bg-white/[0.01]">
              <span className="text-[9px] text-muted-foreground/25">
                +{hiddenCount} older run{hiddenCount !== 1 ? "s" : ""} not shown
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
