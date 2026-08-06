// ─── Analysis · Command Center ──────────────────────────────────────────
// The parent /app/analysis route. Execution (run analysis on staged
// uploads) + the loop-hub nav — no charts, no analytical tables. Those
// live only in the child pages (Ad Performance, IAP Library, Audience,
// Placements, Budget, History).

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, StageLoopHub, buildLoopStages, CrossLink,
} from "../shared";
import { AnalysisControls } from "../ManualAnalysisControls";
import { useSetAccountCohort, useListAnalysisRuns, getGetMetrixSeedQueryKey, ApiError } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { LayoutDashboard, Store, Target, Wrench, Smartphone, Loader2 } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

const SECTION = "Analysis · 03";

const COHORT_OPTIONS: { id: NonNullable<AdAccount["cohort"]>; label: string; desc: string; Icon: typeof Store }[] = [
  { id: "ecommerce", label: "Ecommerce", desc: "Terminal metric: purchases / ROAS", Icon: Store },
  { id: "lead_gen", label: "Lead gen", desc: "Terminal metric: leads / cost per lead", Icon: Target },
  { id: "service", label: "Service", desc: "Terminal metric: bookings / cost per booking", Icon: Wrench },
  { id: "app", label: "App", desc: "Terminal metric: installs / cost per install", Icon: Smartphone },
];

function CohortSelector({ accountId, onDone }: { accountId: string; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useSetAccountCohort({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
        onDone?.();
      },
      onError: (err: unknown) => {
        toast({
          variant: "destructive",
          title: "Couldn't set business model",
          description: err instanceof ApiError ? err.message : "Please try again.",
        });
      },
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed">
        Set this account's business model before running analysis — it decides which terminal
        metric shows up in Budget, Ad Performance, and Exports instead of assuming ROAS for
        every account.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {COHORT_OPTIONS.map((c) => (
          <button
            key={c.id}
            onClick={() => mutation.mutate({ accountId, data: { cohort: c.id } })}
            disabled={mutation.isPending}
            className="flex items-center gap-2.5 p-3 rounded-lg border border-border/40 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/[0.04] transition-colors text-left disabled:opacity-60"
          >
            {mutation.isPending && mutation.variables?.data.cohort === c.id ? (
              <Loader2 className="w-4 h-4 text-interactive shrink-0 animate-spin" />
            ) : (
              <c.Icon className="w-4 h-4 text-interactive shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">{c.label}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">{c.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AnalysisCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const [changingCohort, setChangingCohort] = useState(false);
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
              {!acct.cohort || changingCohort ? (
                <SectionCard title="Business model" desc="Required before analysis can run.">
                  <CohortSelector accountId={acct.id} onDone={() => setChangingCohort(false)} />
                </SectionCard>
              ) : (
                <SectionCard
                  title="Run analysis"
                  desc="Pick a date range and explicitly analyze the staged manual uploads. Never runs automatically."
                  right={
                    <button onClick={() => setChangingCohort(true)} className="text-[10px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors">
                      {cohortLabel} · Change
                    </button>
                  }
                >
                  <AnalysisControls accountId={acct.id} />
                </SectionCard>
              )}

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <LayoutDashboard className="w-4 h-4 text-interactive shrink-0" />
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
                  <div className="flex items-center gap-2">
                    <div className="text-[13px] font-semibold text-foreground">Run history</div>
                    {runCount > 0 && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-interactive/70 bg-primary/[0.06] border border-primary/20 rounded px-1.5 py-0.5 leading-none">
                        {runCount} run{runCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
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
