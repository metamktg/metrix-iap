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
  ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, StageLoopHub, buildLoopStages, CrossLink,
} from "../shared";
import { AnalysisControls } from "../ManualAnalysisControls";
import { LayoutDashboard } from "lucide-react";

const SECTION = "Analysis · 03";

export function AnalysisCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);

  return (
    <ModuleScopeGate section={SECTION} title="Analysis" account={account}>
      {() => {
        const acct = account!;
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
              <SectionCard title="Run analysis" desc="Pick a date range and explicitly analyze the staged manual uploads. Never runs automatically.">
                <AnalysisControls accountId={acct.id} />
              </SectionCard>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <LayoutDashboard className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground">Ad Performance</div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      Campaign totals, control reads, and the full breakdown once analysis has run.
                    </p>
                  </div>
                </div>
                <CrossLink to="/app/analysis/performance" label="Open" />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-foreground">Run history</div>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                    Full detail on the account's most recent analysis run, including data-integrity flags.
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
