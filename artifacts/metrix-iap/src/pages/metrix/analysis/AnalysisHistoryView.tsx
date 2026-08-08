// ─── Analysis · History ──────────────────────────────────────────────
// Full list of analysis runs for the account. Each run is a distinct
// data snapshot — the user can select up to 3 runs when building
// strategy from the IAP Loop.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey, type AnalysisRun } from "@workspace/api-client-react";
import {
  ModuleHeader,
  ModuleScopeGate,
  SectionCard,
  PendingState,
  InfoTooltip,
} from "../shared";
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  CalendarRange,
  Database,
  Info,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";

const SECTION = "Analysis · 03";

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RunStatusIcon({ status }: { status: AnalysisRun["status"] }) {
  if (status === "running") return <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />;
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
}

function RunCard({ run, index, isLatest }: { run: AnalysisRun; index: number; isLatest: boolean }) {
  const coverageLabel =
    run.date_start && run.date_end
      ? `${fmtDate(run.date_start)} → ${fmtDate(run.date_end)}`
      : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3",
        run.status === "success"
          ? "border-border/40 bg-white/[0.02]"
          : run.status === "running"
          ? "border-amber-400/25 bg-amber-400/[0.03]"
          : "border-red-400/20 bg-red-500/[0.03]"
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <RunStatusIcon status={run.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-title font-semibold text-foreground capitalize">{run.status}</span>
            {isLatest && (
              <span className="text-micro font-semibold uppercase tracking-wider text-emerald-400/70 bg-emerald-400/[0.08] border border-emerald-400/15 rounded px-1.5 py-0.5 leading-none">
                Latest
              </span>
            )}
            <span className="text-caption text-muted-foreground/60 ml-auto shrink-0">
              Run #{index + 1}
            </span>
          </div>
          {run.started_at && (
            <p className="text-caption text-muted-foreground/60 mt-0.5">
              {fmtDateTime(run.started_at)}
              {run.finished_at && ` · finished ${fmtDateTime(run.finished_at)}`}
            </p>
          )}
        </div>
      </div>

      {/* Coverage + rows */}
      {run.status === "success" && (
        <div className="grid grid-cols-2 gap-3">
          {coverageLabel && (
            <div className="flex items-start gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              <div>
                <div className="text-label text-muted-foreground/55 font-medium uppercase tracking-wide">Covered</div>
                <div className="text-body text-foreground/85 font-medium mt-0.5">{coverageLabel}</div>
              </div>
            </div>
          )}
          {run.rows_ingested != null && (
            <div className="flex items-start gap-2">
              <Database className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              <div>
                <div className="text-label text-muted-foreground/55 font-medium uppercase tracking-wide">Rows</div>
                <div className="text-body text-foreground/85 font-medium mt-0.5">
                  {run.rows_ingested.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date range preset badge */}
      <div className="flex items-center gap-1.5">
        <span className="text-label text-muted-foreground/50 font-medium uppercase tracking-wide">Range preset</span>
        <span className="text-label font-semibold text-muted-foreground/70 bg-white/[0.04] border border-border/30 px-1.5 py-0.5 rounded">
          {run.date_range ?? "custom"}
        </span>
      </div>

      {run.error_message && (
        <div className="flex items-start gap-2 text-caption text-red-400/80 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
          {run.error_message}
        </div>
      )}

      {/* Data integrity */}
      {run.status === "success" && (run.reconciliation ?? []).length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border/25">
          <div className="text-label text-muted-foreground/50 font-medium uppercase tracking-wide">
            Data integrity check
          </div>
          {run.reconciliation.map((r) => (
            <div
              key={r.metric_key}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-caption",
                r.flagged ? "bg-amber-400/[0.06] border border-amber-400/20" : "bg-white/[0.02] border border-border/20"
              )}
            >
              {r.flagged
                ? <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                : <CheckCircle2 className="w-3 h-3 text-emerald-400/60 shrink-0" />}
              <span className="font-medium text-foreground/80">
                {r.metric_key === "spend" ? "Spend" : r.metric_key === "results" ? "Results" : r.metric_key}
              </span>
              <span className="text-muted-foreground/60 ml-auto">
                Demo {r.demographic_total.toLocaleString()} · Placement {r.placement_total.toLocaleString()}
                {r.flagged && ` · ${r.delta_pct.toFixed(1)}% apart`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalysisHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { data, isLoading } = useListAnalysisRuns(account?.id ?? "", { query: { enabled: !!account?.id, queryKey: getListAnalysisRunsQueryKey(account?.id ?? "") } });
  const runs = data?.runs ?? [];
  const successRuns = runs.filter((r) => r.status === "success");

  return (
    <ModuleScopeGate section={SECTION} title="History" account={account}>
      {() => (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ModuleHeader
            section={SECTION}
            title="History"
            subtitle="All analysis runs for this account — each run is a distinct data snapshot."
            table="manual_analysis_runs"
          />
          <div className="px-6 py-5 space-y-5 max-w-3xl">

            {/* Strategy grounding callout */}
            {successRuns.length > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-primary/20 bg-primary/[0.04]">
                <Info className="w-3.5 h-3.5 text-interactive/80 shrink-0 mt-0.5" />
                <div className="flex items-center gap-1.5">
                  <p className="text-caption font-semibold text-foreground/90">
                    {successRuns.length} successful run{successRuns.length !== 1 ? "s" : ""} available.
                  </p>
                  <InfoTooltip content="Open the IAP Loop and go to the Strategy stage to select up to 3 runs to ground your strategy in — each run covers a distinct date range and can be combined." />
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 text-body text-muted-foreground/70 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
              </div>
            ) : runs.length === 0 ? (
              <PendingState
                title="No runs yet"
                message="Run analysis from the Analysis command center to create your first data snapshot."
                icon={History}
              />
            ) : (
              <SectionCard
                title={`${runs.length} run${runs.length !== 1 ? "s" : ""}`}
                desc="Most recent first. Each successful run can be independently selected for strategy generation."
              >
                <div className="space-y-3">
                  {runs.map((run, i) => (
                    <RunCard key={run.id} run={run} index={i} isLatest={i === 0} />
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
