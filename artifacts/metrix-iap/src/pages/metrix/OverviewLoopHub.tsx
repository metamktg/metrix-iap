// ─── Overview · IAP Loop hub ────────────────────────────────────────────
// Shared by the Overview pulse view (compact) and the full /app/overview/loop
// page (per-account). Reads presence of real data already in the loaded
// seed bundle — analysis/strategy/briefs/MST — rather than firing a
// stage-status network call per account for what is a coarse "has this
// stage produced anything yet" rollup, not the hard-gating source of
// truth (that's useStageStatus, used inside each account's own command
// centers where "running" vs "error" actually matters).

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccounts, getAnalysisData, getStrategyData, getBriefBuilder, getMST } from "@/lib/data/metrixSeedAdapter";
import { CrossLink } from "./shared";
import { TYPE } from "./typography";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

export interface AccountLoopStage {
  id: "analysis" | "strategy" | "creative" | "mst";
  label: string;
  to: string;
  done: boolean;
}

export function accountLoopStages(seed: ReturnType<typeof useMetrixSeed>, account: AdAccount): AccountLoopStage[] {
  const configured = account.status === "configured";
  const analysisDone = configured && (getAnalysisData(seed, account.id)?.performance_by_cell.length ?? 0) > 0;
  const strategyDone = configured && (getStrategyData(seed, account.id)?.message_pillars.length ?? 0) > 0;
  const briefsDone = configured && (getBriefBuilder(seed, account.id)?.draft_briefs.length ?? 0) > 0;
  const mstDone = configured && (getMST(seed, account.id)?.local_book2_library?.length ?? 0) > 0;
  return [
    { id: "analysis", label: "Analysis", to: "/app/analysis", done: analysisDone },
    { id: "strategy", label: "Strategy", to: "/app/strategy", done: strategyDone },
    { id: "creative", label: "Creative", to: "/app/creative", done: briefsDone },
    { id: "mst", label: "MST", to: "/app/mst", done: mstDone },
  ];
}

function StageChip({ stage }: { stage: AccountLoopStage }) {
  return (
    <span
      className={cn(
        TYPE.label,
        "inline-flex items-center gap-1 normal-case tracking-normal px-1.5 py-0.5 rounded border leading-none",
        stage.done ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10" : "text-muted-foreground/60 border-border/40 bg-white/[0.02]",
      )}
    >
      {stage.done ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
      {stage.label}
    </span>
  );
}

/** Rollup card — embedded (sliced) at the top of Manager Overview, or shown in full on /app/overview/loop. */
export function OverviewLoopSummary({ full = false }: { full?: boolean }) {
  const seed = useMetrixSeed();
  const { adAccounts } = useAccount();

  const rows = adAccounts.map((a) => ({ account: a, stages: accountLoopStages(seed, a) }));
  const shown = full ? rows : rows.slice(0, 6);
  const configuredCount = adAccounts.filter((a) => a.status === "configured").length;
  const needsAnalysis = rows.filter((r) => r.account.status === "configured" && !r.stages[0].done).length;

  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
      {!full && (
        <div className="flex items-center justify-between mb-3">
          <div className={cn(TYPE.label, "text-muted-foreground/70")}>IAP Loop</div>
          <CrossLink to="/app/overview/loop" label="Full loop status" />
        </div>
      )}
      {needsAnalysis > 0 && (
        <p className={cn(TYPE.caption, "text-muted-foreground/75 mb-3")}>
          {needsAnalysis} of {configuredCount} connected accounts still need analysis run.
        </p>
      )}
      <div className="space-y-2">
        {shown.map(({ account, stages }) => (
          <div key={account.id} className="flex items-center gap-3">
            <span className={cn(TYPE.body, "text-foreground/85 w-32 truncate shrink-0")}>{account.name}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {account.status === "configured" ? stages.map((s) => <StageChip key={s.id} stage={s} />) : (
                <span className={cn(TYPE.caption, "text-muted-foreground/60")}>Not connected</span>
              )}
            </div>
          </div>
        ))}
        {!full && rows.length > 6 && (
          <p className={cn(TYPE.caption, "text-muted-foreground/60 pt-1")}>+{rows.length - 6} more — see full loop status</p>
        )}
      </div>
    </div>
  );
}
