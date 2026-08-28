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

import { useState } from "react";
import { fmtDayRange } from "@/lib/normalize";
import { Checkbox } from "@workspace/command-deck/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import { cn } from "@workspace/command-deck/lib/utils";
import { ChevronDown, CalendarRange } from "lucide-react";
import type { AnalysisRun } from "@workspace/api-client-react";

export interface RunSelectorValue {
  allTime: boolean;
  /** Ignored/meaningless when allTime is true. */
  selectedRunIds: string[];
}

export const ALL_TIME_SELECTION: RunSelectorValue = { allTime: true, selectedRunIds: [] };

function runLabel(run: AnalysisRun): string {
  // date_start/date_end are Postgres `date` columns — calendar days, not
  // instants. Rendered through a local-timezone formatter they read a day
  // early for every viewer west of UTC. See fmtDay in lib/normalize.
  if (run.date_start && run.date_end) return fmtDayRange(run.date_start, run.date_end);
  return run.date_range ?? "Analysis run";
}

/** When the run happened (date + time), as secondary identity detail. */
function runTimestamp(run: AnalysisRun): string {
  return new Date(run.started_at).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Max individual runs selectable at once in the compact picker. */
export const RUN_SCOPE_MAX = 3;

// ─── Compact header run-scope picker ──────────────────────────────────
// Dropdown/popover replacement for the standing RunSelector checklist:
// a small trigger button in a page header showing the current selection
// ("All time" or up to RUN_SCOPE_MAX run names), with the all/none/some
// selection model inside the popover. Enforces the 3-run cap — a 4th
// pick shows the cap note instead of silently selecting.

export function RunScopePicker({
  runs,
  value,
  onChange,
}: {
  runs: AnalysisRun[];
  value: RunSelectorValue;
  onChange: (v: RunSelectorValue) => void;
}) {
  const [capHit, setCapHit] = useState(false);

  if (runs.length === 0) return null;

  const toggleRun = (runId: string) => {
    const set = new Set(value.allTime ? [] : value.selectedRunIds);
    if (set.has(runId)) {
      set.delete(runId);
      setCapHit(false);
    } else {
      if (set.size >= RUN_SCOPE_MAX) {
        setCapHit(true);
        return;
      }
      set.add(runId);
      setCapHit(false);
    }
    // Emptying the selection falls back to All time — never a zero-run view.
    if (set.size === 0) onChange({ allTime: true, selectedRunIds: [] });
    else onChange({ allTime: false, selectedRunIds: [...set] });
  };

  const selectedRuns = value.allTime
    ? []
    : runs.filter((r) => value.selectedRunIds.includes(r.id));
  const triggerLabel = value.allTime || selectedRuns.length === 0
    ? "All time"
    : selectedRuns.map((r) => runLabel(r)).join(" · ");

  return (
    <Popover onOpenChange={(open) => { if (!open) setCapHit(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-run-scope"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-foreground/[0.02] hover:bg-muted/30 px-2.5 py-1.5 text-caption text-foreground/80 transition-colors max-w-[280px]"
          title="Scope to analysis run"
        >
          <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
          <span className="truncate font-medium">{triggerLabel}</span>
          {!value.allTime && selectedRuns.length > 1 && (
            <span className="text-caption font-mono text-muted-foreground/75 shrink-0">
              {selectedRuns.length}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground/75 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/75 px-1 pb-2">
          Scope to analysis run
        </p>
        <button
          type="button"
          data-testid="option-run-all-time"
          onClick={() => { onChange(ALL_TIME_SELECTION); setCapHit(false); }}
          className={cn(
            "pressable-lg w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors",
            value.allTime
              ? "border-status-success/30 bg-status-success/[0.07] text-foreground/90"
              : "border-border/40 bg-transparent text-foreground/70 hover:bg-muted/30",
          )}
        >
          <Checkbox checked={value.allTime} className="pointer-events-none" />
          <span className="text-label font-semibold flex-1">All time</span>
          <span className="text-caption text-muted-foreground/75">
            {runs.length} run{runs.length !== 1 ? "s" : ""} total
          </span>
        </button>
        <div className="mt-2 rounded-lg border border-border/40 divide-y divide-border/30 overflow-hidden max-h-[280px] overflow-y-auto">
          {runs.map((run, idx) => {
            const isSel = !value.allTime && value.selectedRunIds.includes(run.id);
            return (
              <button
                key={run.id}
                type="button"
                data-testid={`option-run-${run.id}`}
                onClick={() => toggleRun(run.id)}
                className={cn(
                  "pressable-lg w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors",
                  isSel
                    ? "bg-status-success/[0.07] text-foreground/90"
                    : "bg-transparent text-foreground/55 hover:bg-muted/30",
                )}
              >
                <Checkbox checked={isSel} className="pointer-events-none" />
                <div className="flex-1 min-w-0">
                  <span className="text-label font-medium block truncate">{runLabel(run)}</span>
                  <span className="text-caption text-muted-foreground/75 block">{runTimestamp(run)}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {idx === 0 && (
                    <span className="text-micro font-semibold uppercase text-status-success/60 bg-status-success/[0.08] border border-status-success/15 rounded px-1 py-0.5 leading-none">
                      Latest
                    </span>
                  )}
                  {run.rows_ingested != null && (
                    <span className="text-caption font-mono text-muted-foreground/75">
                      {run.rows_ingested.toLocaleString()} rows
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {capHit && (
          <p data-testid="text-run-cap" className="text-body text-status-warning/80 px-1 pt-2">
            Up to {RUN_SCOPE_MAX} runs at a time — deselect one to add another.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
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
          "pressable-lg w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors",
          value.allTime
            ? "border-status-success/30 bg-status-success/[0.07] text-foreground/90"
            : "border-border/40 bg-transparent text-foreground/70 hover:bg-muted/30",
        )}
      >
        <Checkbox checked={value.allTime} className="pointer-events-none" />
        <span className="text-label font-semibold flex-1">All time</span>
        <span className="text-caption text-muted-foreground/75">
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
                  "pressable-lg w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors",
                  isSel
                    ? "bg-status-success/[0.07] text-foreground/90"
                    : "bg-transparent text-foreground/55 hover:bg-muted/30",
                )}
              >
                <Checkbox checked={isSel} className="pointer-events-none" />
                <span className="text-label font-medium flex-1 truncate">{runLabel(run)}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {idx === 0 && (
                    <span className="text-micro font-semibold uppercase text-status-success/60 bg-status-success/[0.08] border border-status-success/15 rounded px-1 py-0.5 leading-none">
                      Latest
                    </span>
                  )}
                  {run.rows_ingested != null && (
                    <span className="text-caption font-mono text-muted-foreground/75">
                      {run.rows_ingested.toLocaleString()} rows
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <div className="px-2.5 py-1.5 bg-foreground/[0.01]">
              <span className="text-caption text-muted-foreground/75">
                +{hiddenCount} older run{hiddenCount !== 1 ? "s" : ""} not shown
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
