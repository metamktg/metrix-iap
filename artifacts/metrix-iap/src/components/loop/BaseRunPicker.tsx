// ─── "Base this run on" ────────────────────────────────────────────────
// Sweep spec §5 (slice 3, 2026-09-05). Two controls, one rule: a generation
// is manually executed, never automatic, and the reader sees what the NEXT
// run will be built on and can change it before pressing the button.
// Changing the control changes nothing until the run is pressed.
//
//   · BaseRunPicker (Strategy): wraps the compact RunScopePicker over the
//     account's successful analysis runs (all time or up to three runs);
//     the selection is persisted per account per browser under the key the
//     Account Overview's command chain shares, so both read and write the
//     same choice. The default is the latest successful run, not all time.
//     Beside the picker: the effective window the choice covers and, for
//     several runs, the supersede rule in one fragment.
//   · StrategyRunPicker (Creative): a single-select popover over the
//     account's successful strategy runs (date, pillar count, model),
//     exactly one, no combining; default the latest.

import { useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import { cn } from "@workspace/command-deck/lib/utils";
import { ChevronDown, Layers } from "lucide-react";
import type { AnalysisRun, GenerationRun } from "@workspace/api-client-react";
import { RunScopePicker, type RunSelectorValue } from "@/components/analysis/RunSelector";
import { strategyBaseInput, strategyRunLabel } from "@/lib/loop/statusHub";
import { fmtDay } from "@/lib/normalize";
import { TYPE } from "@/pages/metrix/typography";

/** The persisted-scope key Strategy and the Overview chain share (§5.1). */
export const STRATEGY_BASE_RUN_PAGE_KEY = "strategy-base-run";

export function BaseRunPicker({
  runs,
  value,
  onChange,
}: {
  /** The account's analysis runs; only successful ones with rollups can be based on. */
  runs: AnalysisRun[];
  value: RunSelectorValue;
  onChange: (v: RunSelectorValue) => void;
}) {
  const successes = runs.filter((r) => r.status === "success");
  const line = strategyBaseInput(value, successes);
  const summary = line.label.replace(/^Based on · /, "");
  return (
    <div
      data-testid="base-run-picker"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border/30 bg-foreground/[0.015] px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className={cn(TYPE.microLabel, "mb-0.5")}>Base this run on</p>
        <p className={cn(TYPE.caption, "text-foreground/85 min-w-0")} data-testid="base-run-summary">
          <span className="font-medium">{summary}</span>
          {line.detail && <span className="text-muted-foreground/75"> · {line.detail}</span>}
        </p>
      </div>
      {successes.length > 0 ? (
        <RunScopePicker runs={successes} value={value} onChange={onChange} />
      ) : (
        <span className={cn(TYPE.caption, "text-muted-foreground/75")}>No successful analysis run yet</span>
      )}
    </div>
  );
}

// ─── Strategy run choice (Creative) ────────────────────────────────────

function strategyRunStorageKey(accountId: string): string {
  return `metrix.strategyRun.${accountId}`;
}

/**
 * The strategy run the next briefs run reads: the stored choice when it
 * still names one of the account's successful strategy runs, else the
 * latest. Returns null while the account has no generated strategy (the
 * imported set is briefed then, and there is nothing to pick).
 */
export function useSelectedStrategyRun(
  accountId: string | null,
  strategyRuns: readonly GenerationRun[],
): [GenerationRun | null, (id: string) => void] {
  const successes = strategyRuns
    .filter((r) => r.status === "success")
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const [stored, setStored] = useState<{ accountId: string | null; id: string | null }>(() => ({
    accountId,
    id: readStoredStrategyRun(accountId),
  }));
  if (stored.accountId !== accountId) setStored({ accountId, id: readStoredStrategyRun(accountId) });
  const chosen = stored.accountId === accountId ? stored.id : readStoredStrategyRun(accountId);
  const selected = (chosen && successes.find((r) => r.id === chosen)) || successes[0] || null;
  const choose = useCallback(
    (id: string) => {
      setStored({ accountId, id });
      if (!accountId) return;
      try {
        sessionStorage.setItem(strategyRunStorageKey(accountId), id);
      } catch {
        // Storage unavailable: the choice still holds for this visit.
      }
    },
    [accountId],
  );
  return [selected, choose];
}

function readStoredStrategyRun(accountId: string | null): string | null {
  if (!accountId) return null;
  try {
    return sessionStorage.getItem(strategyRunStorageKey(accountId));
  } catch {
    return null;
  }
}

export function StrategyRunPicker({
  runs,
  value,
  onChange,
}: {
  /** The account's strategy runs; only successful ones are offered. */
  runs: readonly GenerationRun[];
  /** The selected run's id. */
  value: string | null;
  onChange: (id: string) => void;
}) {
  const successes = runs
    .filter((r) => r.status === "success")
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  // Single-select: a choice closes the list, the way a select does.
  const [open, setOpen] = useState(false);
  if (successes.length === 0) return null;
  const selected = successes.find((r) => r.id === value) ?? successes[0]!;
  return (
    <div
      data-testid="strategy-run-picker"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border/30 bg-foreground/[0.015] px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className={cn(TYPE.microLabel, "mb-0.5")}>Base this run on</p>
        <p className={cn(TYPE.caption, "text-foreground/85 min-w-0")} data-testid="strategy-run-summary">
          <span className="font-medium">strategy {strategyRunLabel(selected)}</span>
          {selected.model && <span className="text-muted-foreground/75"> · {selected.model}</span>}
        </p>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="button-strategy-run"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-foreground/[0.02] hover:bg-muted/30 px-2.5 py-1.5 text-caption text-foreground/80 transition-colors max-w-[280px]"
            title="Choose the strategy run to brief"
          >
            <Layers className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
            <span className="truncate font-medium">{fmtDay(selected.started_at, { year: true })}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground/75 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2">
          <p className={cn(TYPE.label, "px-1 pb-2")}>Strategy run to brief</p>
          <div role="radiogroup" aria-label="Strategy run to brief" className="rounded-lg border border-border/40 divide-y divide-border/30 overflow-hidden max-h-[280px] overflow-y-auto">
            {successes.map((run, idx) => {
              const isSel = run.id === selected.id;
              return (
                <button
                  key={run.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  data-testid={`option-strategy-run-${run.id}`}
                  onClick={() => { onChange(run.id); setOpen(false); }}
                  className={cn(
                    "pressable-lg w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors",
                    isSel ? "bg-status-success/[0.07] text-foreground/90" : "bg-transparent text-foreground/55 hover:bg-muted/30",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("w-3.5 h-3.5 rounded-full border shrink-0", isSel ? "border-status-success bg-status-success/70" : "border-border/60")}
                  />
                  <span className="flex-1 min-w-0">
                    <span className={cn(TYPE.caption, "font-medium text-foreground block truncate")}>{strategyRunLabel(run)}</span>
                    <span className="text-caption text-muted-foreground/75 block truncate">
                      {new Date(run.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {run.model ? ` · ${run.model}` : ""}
                    </span>
                  </span>
                  {idx === 0 && (
                    <span className={cn(TYPE.microLabel, "font-semibold text-status-success/60 bg-status-success/[0.08] border border-status-success/15 rounded px-1 py-0.5 leading-none shrink-0")}>
                      Latest
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
