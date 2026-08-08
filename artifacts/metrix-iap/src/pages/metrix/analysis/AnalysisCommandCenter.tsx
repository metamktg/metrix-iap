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
  ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, StageLoopHub, buildLoopStages, CrossLink, PendingState,
} from "../shared";
import { AnalysisControls } from "../ManualAnalysisControls";
import { useListAnalysisRuns } from "@workspace/api-client-react";
import { LayoutDashboard, Settings2 } from "lucide-react";
import { COHORT_OPTIONS } from "../settings/cohortOptions";

const SECTION = "Analysis · 03";

export function AnalysisCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const { data: runsData } = useListAnalysisRuns(account?.id ?? "");
  const runCount = (runsData?.runs ?? []).filter((r) => r.status === "success").length;

  return (
    <ModuleScopeGate section={SECTION} title="Analysis" account={account}>
      {() => {
        const acct = account!;
        const cohortLabel = COHORT_OPTIONS.find((c) => c.id === acct.cohort)?.label;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Analysis"
              subtitle="Run analysis on this account's staged data. Everything below reads a different slice of the same result."
            />
            <ScopeBanner account={acct} />
            <StageLoopHub stages={buildLoopStages(status)} current="analysis" />

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              {!acct.cohort ? (
                <SectionCard title="Business model not set" desc="Configure it in account settings before analysis can run.">
                  <PendingState
                    title="No business model configured"
                    message="This account's conversion objective (sales, leads, apps, local business) decides which terminal metric analysis reports — it's set once in Settings, not here."
                    icon={Settings2}
                    action={<CrossLink to="/app/settings/general" label="Go to Settings" />}
                  />
                </SectionCard>
              ) : (
                <SectionCard
                  title="Run analysis"
                  desc="Pick a date range and explicitly analyze the staged manual uploads. Never runs automatically."
                  right={
                    <CrossLink to="/app/settings/general" label={`${cohortLabel} · Settings`} />
                  }
                >
                  <AnalysisControls accountId={acct.id} />
                </SectionCard>
              )}

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <LayoutDashboard className="w-4 h-4 text-interactive shrink-0" />
                  <div className="min-w-0">
                    <div className="text-title font-semibold text-foreground">Ad Performance</div>
                    <p className="text-caption text-muted-foreground/80 leading-relaxed">
                      Campaign totals, control reads, and the full breakdown once analysis has run.
                    </p>
                  </div>
                </div>
                <CrossLink to="/app/analysis/performance" label="Open" />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-title font-semibold text-foreground">Run history</div>
                    {runCount > 0 && (
                      <span className="text-micro font-semibold uppercase tracking-wider text-interactive/70 bg-primary/[0.06] border border-primary/20 rounded px-1.5 py-0.5 leading-none">
                        {runCount} run{runCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-muted-foreground/80 leading-relaxed">
                    {runCount > 0
                      ? `${runCount} successful run${runCount !== 1 ? "s" : ""} — each can be selected independently when building strategy in the IAP Loop.`
                      : "Full detail on analysis runs for this account, including data-integrity flags."}
                  </p>
                </div>
                <CrossLink to="/app/analysis/history" label="Open" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
