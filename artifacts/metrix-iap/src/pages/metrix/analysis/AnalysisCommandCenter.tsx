// ─── Analysis · Command Center ──────────────────────────────────────────
// The parent /app/analysis route. Execution (run analysis on staged
// uploads) + the loop-hub nav — no charts, no analytical tables. Those
// live only in the child pages (Ad Performance, IAP Library, Audience,
// Placements, Budget, History).

import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ModuleScopeGate, SectionCard, StageLoopHub, buildLoopStages, CrossLink, PendingState, HubNavGrid,
  MetricTile, fmtNum,
} from "../shared";
import { AnalysisControls } from "../ManualAnalysisControls";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard, Library, Users, LayoutGrid, Wallet, History,
  CheckCircle2, XCircle, Loader2, FileJson,
} from "lucide-react";
import { OBJECTIVE_OPTIONS } from "../settings/cohortOptions";

const SECTION = "Analysis · 03";

export function AnalysisCommandCenter() {
  const [, navigate] = useLocation();
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const { data: runsData } = useListAnalysisRuns(account?.id ?? "", { query: { enabled: !!account?.id, queryKey: getListAnalysisRunsQueryKey(account?.id ?? "") } });
  const runs = runsData?.runs ?? [];
  const runCount = runs.filter((r) => r.status === "success").length;
  const analysis = getAnalysisData(seed, adAccountId);
  const campaignSummary = getCampaignSummary(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Analysis" account={account}>
      {() => {
        const acct = account!;
        // Read-only summary of the account's configured objectives —
        // objectives are configured only in Settings → General (account
        // setup), never here, and never block an analysis run.
        const objectiveLabels = (acct.objectives ?? [])
          .map((o) => OBJECTIVE_OPTIONS.find((c) => c.id === o)?.label)
          .filter((l): l is string => !!l);
        const objectivesSummary = objectiveLabels.length > 0
          ? `Objectives: ${objectiveLabels.join(", ")}`
          : "No objectives configured";

        // Execution-card input tiles — every value reads a slice of this
        // account's own real analysis data (never fabricated, never a
        // second data fetch). Cells/concepts/events count distinct real
        // rows; window reads the account's own campaign summary window.
        const cellCount = analysis
          ? new Set(analysis.performance_by_cell.map((r) => r.cell_id)).size
          : null;
        const conceptCount = analysis?.concept_rollup
          ? new Set(analysis.concept_rollup.map((r) => `${r.book}:${r.concept}`)).size
          : analysis
          ? new Set(analysis.performance_by_cell.map((r) => r.book2_concept_name)).size
          : null;
        const eventCount = campaignSummary
          ? Object.keys(campaignSummary.bottom_line_totals ?? {}).length
          : null;
        const windowDays = (() => {
          const start = campaignSummary?.window_start;
          const end = campaignSummary?.window_end;
          if (!start || !end) return null;
          const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
          return days > 0 ? days : null;
        })();

        const recentRuns = runs.slice(0, 3);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Analysis"
              subtitle="Run analysis on this account's staged data. Everything below reads a different slice of the same result."
            />
            <StageLoopHub stages={buildLoopStages(status)} current="analysis" />

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <SectionCard
                title="Run analysis"
                desc="Pick a date range and explicitly analyze the staged manual uploads. Never runs automatically."
                right={<span className="text-label text-muted-foreground/70">{objectivesSummary}</span>}
              >
                {analysis && (
                  // 2x2 (not a page-width 4-across row) — this card's own
                  // max-w-3xl column doesn't leave enough room per tile at
                  // 4-across without truncating labels (same fix already
                  // applied in StrategyCommandCenter's execution card).
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <MetricTile label="Cells analysed" value={cellCount != null ? fmtNum(cellCount) : "—"} variant="primary" />
                    <MetricTile label="Concepts rolled up" value={conceptCount != null ? fmtNum(conceptCount) : "—"} />
                    <MetricTile label="Window" value={windowDays != null ? `${windowDays} days` : "—"} />
                    <MetricTile label="Events tracked" value={eventCount != null ? fmtNum(eventCount) : "—"} />
                  </div>
                )}
                <AnalysisControls accountId={acct.id} />
              </SectionCard>

              <SectionCard
                title="Run history"
                desc="Most recent analysis runs for this account, most recent first."
                right={<CrossLink to="/app/analysis/history" label="Full history" />}
              >
                {recentRuns.length === 0 ? (
                  <p className="text-caption text-muted-foreground/60">No analysis runs yet for this account.</p>
                ) : (
                  <div className="flex flex-col">
                    {recentRuns.map((r) => (
                      <div key={r.id} className="flex items-center gap-2.5 py-2 border-t border-border/25 first:border-0 min-w-0">
                        {r.status === "running" && <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />}
                        {r.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        {r.status === "error" && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                        <span className="flex-1 min-w-0">
                          <span className="block text-body text-foreground/85 truncate">
                            {r.status === "success" && r.date_start && r.date_end
                              ? `${r.date_start} → ${r.date_end}`
                              : r.date_range ?? "custom range"}
                            {r.rows_ingested != null && ` · ${fmtNum(r.rows_ingested)} rows`}
                          </span>
                          <span className="block text-label text-muted-foreground/60">
                            {r.started_at ? new Date(r.started_at).toLocaleString() : r.id}
                          </span>
                        </span>
                        <span className="mx-inline-badge shrink-0 capitalize">{r.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="JSON export"
                desc="Read-only snapshot of this account's Analysis data. Exports never mutate the loop."
              >
                <button
                  type="button"
                  onClick={() => navigate("/app/exports/analysis")}
                  data-testid="analysis-json-export-row"
                  className="w-full flex items-center gap-2.5 rounded-lg border border-border/30 bg-white/[0.015] hover:bg-white/[0.03] hover:border-primary/25 px-3 py-2.5 text-left transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5 text-interactive/80 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-body font-mono text-foreground/85 truncate">Analysis export</span>
                    <span className="block text-label text-muted-foreground/60">
                      {analysis
                        ? `${fmtNum(analysis.performance_by_cell.length)} cell rows · ${fmtNum(analysis.v3_variable_performance.length)} variable rows`
                        : "No analysis data yet"}
                    </span>
                  </span>
                  <span className="text-label font-semibold text-interactive shrink-0">Open →</span>
                </button>
              </SectionCard>

              <HubNavGrid
                label="Explore Analysis"
                items={[
                  {
                    to: "/app/analysis/performance",
                    label: "Ad Performance",
                    desc: "Campaign totals, control reads, and the full breakdown once analysis has run.",
                    Icon: LayoutDashboard,
                    lineage: "analysis.concept_rollup[] · performance_by_cell[]",
                  },
                  {
                    to: "/app/analysis/library",
                    label: "IAP Library",
                    desc: "Cell and variable performance across the account.",
                    Icon: Library,
                    lineage: "analysis.performance_by_cell[] · v3_variable_performance[]",
                  },
                  {
                    to: "/app/analysis/audience",
                    label: "Audience",
                    desc: "Demographic result signal by age and gender.",
                    Icon: Users,
                    lineage: "analysis.demographic_registration_signal[]",
                  },
                  {
                    to: "/app/analysis/placements",
                    label: "Placements",
                    desc: "Where delivery happened and what each placement produced.",
                    Icon: LayoutGrid,
                    lineage: "analysis.v3_placement_signal[] · c4e_placement_signal[]",
                  },
                  {
                    to: "/app/analysis/budget",
                    label: "Budget",
                    desc: "Spend allocation by result event, concept, and placement.",
                    Icon: Wallet,
                    lineage: "campaign_summary · performance_by_cell[]",
                  },
                  {
                    to: "/app/analysis/history",
                    label: runCount > 0 ? `Run history · ${runCount} run${runCount !== 1 ? "s" : ""}` : "Run history",
                    desc: runCount > 0
                      ? `${runCount} successful run${runCount !== 1 ? "s" : ""} — each can be selected independently when building strategy in the IAP Loop.`
                      : "Full detail on analysis runs for this account, including data-integrity flags.",
                    Icon: History,
                    lineage: "manual_analysis_runs[]",
                  },
                ]}
              />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
