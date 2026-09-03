// ─── Analysis · History ──────────────────────────────────────────────
// Full list of analysis runs for the account. Each run is a distinct
// data snapshot — the user can select up to 3 runs when building
// strategy from the IAP Loop.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { CsvWarningsPanel } from "@/components/analysis/CsvWarningsPanel";
import { fmtDay } from "@/lib/normalize";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey, type AnalysisRun } from "@workspace/api-client-react";
import {
  ModuleHeader,
  ModuleScopeGate,
  SectionCard,
  PendingState,
  InfoTooltip,
  CrossLink,
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
import { DisclosureStack, type DisclosureItem } from "@/components/widgets/DisclosureStack";
import { TYPE } from "../typography";
import { useMemo } from "react";

const SECTION = "Analysis · 03";

/** An INSTANT (started_at / finished_at) — local time is correct here. */
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RunStatusIcon({ status }: { status: AnalysisRun["status"] }) {
  if (status === "running") return <Loader2 className="w-4 h-4 text-status-warning animate-spin shrink-0" />;
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />;
  return <XCircle className="w-4 h-4 text-status-danger shrink-0" />;
}

/** The disclosed body of one run — everything below the face row. */
function RunDetail({ run }: { run: AnalysisRun }) {
  const coverageLabel =
    run.date_start && run.date_end
      // Calendar days, not instants — see fmtDay in lib/normalize.
      ? `${fmtDay(run.date_start, { year: true })} → ${fmtDay(run.date_end, { year: true })}`
      : null;

  return (
    <div className="space-y-3">
      {/* Coverage + rows */}
      {run.status === "success" && (
        <div className="grid grid-cols-2 gap-3">
          {coverageLabel && (
            <div className="flex items-start gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0 mt-0.5" />
              <div>
                <div className="text-label text-muted-foreground/75 font-medium uppercase tracking-wide">Covered</div>
                <div className="text-body text-foreground/85 font-medium mt-0.5">{coverageLabel}</div>
              </div>
            </div>
          )}
          {run.rows_ingested != null && (
            <div className="flex items-start gap-2">
              <Database className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0 mt-0.5" />
              <div>
                <div className="text-label text-muted-foreground/75 font-medium uppercase tracking-wide">Rows</div>
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
        <span className="text-label text-muted-foreground/75 font-medium uppercase tracking-wide">Range preset</span>
        <span className="text-label font-semibold text-muted-foreground/75 bg-foreground/[0.04] border border-border/30 px-1.5 py-0.5 rounded">
          {run.date_range ?? "custom"}
        </span>
      </div>

      {run.error_message && (
        <div className="flex items-start gap-2 text-caption text-status-danger/80 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-status-danger" />
          {run.error_message}
        </div>
      )}

      {/* Run warnings (C10). csv_warnings has always been on the AnalysisRun
          this list already fetches, but only ManualAnalysisControls rendered
          it, and only for the LATEST run — so a run started from the Loop
          command chain or the task tray surfaced its warnings nowhere, and
          this screen, the one that lists every run, showed none at all. Same
          component as the controls panel, so the severity split and the
          reduced-confidence headline can never drift between the two. */}
      {run.status === "success" && <CsvWarningsPanel run={run} compact />}

      {/* A run row used to end here — a dead end. The run's outputs are read
          on Analysis Overview, whose RunScopePicker scopes to any run; it
          reads no query param and its store's key builder is private to
          lib/run-scope.ts, so the link opens the page and the picker does
          the scoping (audit §1.10). */}
      {run.status === "success" && (
        <div className="pt-1">
          <CrossLink to="/app/analysis/overview" label="Open in Analysis Overview" srNote="scope to this run with the run picker" />
        </div>
      )}

      {/* Data integrity: `reconciliation` is declared optional in the API
          contract because nothing writes it today (see openapi.yaml). This
          block is therefore inert in practice and self-hides — it is kept,
          rather than deleted, so implementing the writer needs no UI work.
          Read through a local so the empty and absent cases are one path. */}
      {run.status === "success" && (run.reconciliation ?? []).length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border/25">
          <div className="text-label text-muted-foreground/75 font-medium uppercase tracking-wide">
            Data integrity check
          </div>
          {(run.reconciliation ?? []).map((r) => (
            <div
              key={r.metric_key}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-caption",
                r.flagged ? "bg-status-warning/[0.06] border border-status-warning/20" : "bg-foreground/[0.02] border border-border/20"
              )}
            >
              {r.flagged
                ? <AlertTriangle className="w-3 h-3 text-status-warning shrink-0" />
                : <CheckCircle2 className="w-3 h-3 text-status-success/60 shrink-0" />}
              <span className="font-medium text-foreground/80">
                {r.metric_key === "spend" ? "Spend" : r.metric_key === "results" ? "Results" : r.metric_key}
              </span>
              <span className="text-muted-foreground/75 ml-auto">
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

// Watermelon DisclosureStack, function-matched: run history was a wall of
// fully-expanded cards — every run's stats, warnings and integrity rows on
// the first layer. Now each run is a face row (status, when, coverage, row
// count) that SPLITS open in place. Honesty rules shape the defaults: a run
// with warnings or a failure must never hide its signal behind a fold, so
// the face meta carries the warning count / failed state, and those runs —
// plus the latest — start open (multi mode).
function RunHistoryStack({ runs }: { runs: AnalysisRun[] }) {
  const items = useMemo<DisclosureItem[]>(() => runs.map((run, i) => {
    const warnings = run.csv_warnings ?? [];
    return {
      id: run.id,
      title: `Run #${i + 1} — ${run.status === "success" ? "Success" : run.status === "running" ? "Running" : "Failed"}`,
      icon: run.status === "running" ? Loader2 : run.status === "success" ? CheckCircle2 : XCircle,
      meta: (
        <span className="inline-flex items-center gap-2">
          {i === 0 && (
            <span className={cn(TYPE.microLabel, "font-semibold text-status-success/70 bg-status-success/[0.08] border border-status-success/15 rounded px-1.5 py-0.5 leading-none")}>
              Latest
            </span>
          )}
          {warnings.length > 0 && (
            <span className={cn(TYPE.microLabel, "inline-flex items-center gap-1 font-semibold text-status-warning/80")}>
              <AlertTriangle className="w-3 h-3" /> {warnings.length}
            </span>
          )}
          {run.status === "error" && (
            <span className={cn(TYPE.microLabel, "font-semibold text-status-danger/80")}>Failed</span>
          )}
          {run.started_at && (
            <span className={cn(TYPE.caption, "text-muted-foreground/75 tabular-nums")}>{fmtDateTime(run.started_at)}</span>
          )}
        </span>
      ),
      content: <RunDetail run={run} />,
    };
  }), [runs]);

  const defaultOpen = useMemo(() => {
    const open = new Set<string>();
    if (runs[0]) open.add(runs[0].id);
    for (const r of runs) {
      if ((r.csv_warnings ?? []).length > 0 || r.status === "error") open.add(r.id);
    }
    return [...open];
  }, [runs]);

  return (
    <DisclosureStack
      items={items}
      mode="multi"
      defaultOpen={defaultOpen}
      label="Analysis runs"
      data-testid="run-history-stack"
    />
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
            accountName={account!.name}
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
              <div className="flex items-center gap-2 text-body text-muted-foreground/75 py-4">
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
                <RunHistoryStack runs={runs} />
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
