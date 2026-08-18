// ─── Analysis · Command Center ──────────────────────────────────────────
// The parent /app/analysis route. Execution (run analysis on staged
// uploads) + the loop-hub nav — no charts, no analytical tables. Those
// live only in the child pages (Ad Performance, IAP Library, Audience,
// Placements, Budget, History).

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ModuleScopeGate, SectionCard, StageLoopHub, buildLoopStages, CrossLink, PendingState, HubNavGrid,
} from "../shared";
import { AnalysisControls } from "../ManualAnalysisControls";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import { LayoutDashboard, History } from "lucide-react";
import { OBJECTIVE_OPTIONS } from "../settings/cohortOptions";

const SECTION = "Analysis · 03";

export function AnalysisCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const { data: runsData } = useListAnalysisRuns(account?.id ?? "", { query: { enabled: !!account?.id, queryKey: getListAnalysisRunsQueryKey(account?.id ?? "") } });
  const runCount = (runsData?.runs ?? []).filter((r) => r.status === "success").length;

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
                <AnalysisControls accountId={acct.id} />
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
