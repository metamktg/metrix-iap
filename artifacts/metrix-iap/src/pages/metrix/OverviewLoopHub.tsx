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

/** Compact 4-dot stage indicator for a single account pill. */
function AccountStageDots({ stages }: { stages: AccountLoopStage[] }) {
  return (
    <span className="flex items-center gap-0.5">
      {stages.map((s) => (
        <span
          key={s.id}
          title={s.label}
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            s.done ? "bg-emerald-400/80" : "bg-border/60"
          )}
        />
      ))}
    </span>
  );
}

/** Compact account pill — name abbrev + 4 stage dots. */
function AccountPill({ account, stages }: { account: AdAccount; stages: AccountLoopStage[] }) {
  const abbrev = account.name.length > 14 ? account.name.slice(0, 13).trimEnd() + "…" : account.name;
  const configured = account.status === "configured";
  return (
    <span
      title={account.name}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded border leading-none shrink-0",
        configured ? "bg-white/[0.03] border-border/40" : "bg-white/[0.01] border-border/25 opacity-60"
      )}
      style={{ minWidth: "8rem", maxWidth: "9rem" }}
    >
      <span className={cn(TYPE.caption, "truncate text-foreground/80 flex-1 min-w-0")}>{abbrev}</span>
      {configured ? (
        <AccountStageDots stages={stages} />
      ) : (
        <span className={cn(TYPE.label, "text-muted-foreground/50 shrink-0")}>–</span>
      )}
    </span>
  );
}

const STAGE_LABELS = ["Analysis", "Strategy", "Creative", "MST"] as const;

/** Rollup card — embedded (sliced) at the top of Manager Overview, or shown in full on /app/overview/loop. */
export function OverviewLoopSummary({ full = false }: { full?: boolean }) {
  const seed = useMetrixSeed();
  const { adAccounts } = useAccount();

  const rows = adAccounts.map((a) => ({ account: a, stages: accountLoopStages(seed, a) }));
  const shown = full ? rows : rows;
  const configuredRows = rows.filter((r) => r.account.status === "configured");
  const total = configuredRows.length;

  // If in full mode, fall back to original expanded layout
  if (full) {
    const configuredCount = adAccounts.filter((a) => a.status === "configured").length;
    const needsAnalysis = rows.filter((r) => r.account.status === "configured" && !r.stages[0].done).length;
    return (
      <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
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
        </div>
      </div>
    );
  }

  // Compact embedded view: summary line + account pills row
  // Compute done counts per stage across configured accounts
  const stageCounts = STAGE_LABELS.map((_, stageIdx) => ({
    label: STAGE_LABELS[stageIdx],
    done: configuredRows.filter((r) => r.stages[stageIdx]?.done).length,
    total,
  }));

  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Stage completion summary */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={cn(TYPE.label, "text-muted-foreground/60 shrink-0")}>IAP Loop</span>
          <span className={cn(TYPE.label, "text-muted-foreground/40 shrink-0")}>·</span>
          {stageCounts.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1 shrink-0">
              {i > 0 && <span className={cn(TYPE.label, "text-muted-foreground/30 mr-1")}>·</span>}
              <span
                className={cn(
                  TYPE.label,
                  s.done === s.total && s.total > 0
                    ? "text-emerald-400/90"
                    : s.done > 0
                      ? "text-amber-400/80"
                      : "text-muted-foreground/55"
                )}
              >
                {s.label} {s.done}/{s.total}
              </span>
            </span>
          ))}
        </div>
        <CrossLink to="/app/overview/loop" label="See full loop status" />
      </div>

      {/* Horizontal account pills strip */}
      {rows.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {rows.map(({ account, stages }) => (
            <AccountPill key={account.id} account={account} stages={stages} />
          ))}
        </div>
      )}
    </div>
  );
}
