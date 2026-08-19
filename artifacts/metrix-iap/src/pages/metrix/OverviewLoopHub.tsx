// ─── Overview · IAP Loop hub ────────────────────────────────────────────
// Compact rollup card embedded at the top of Manager Overview. Reads
// presence of real data already in the loaded seed bundle rather than
// firing per-account network calls.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAnalysisData,
  getStrategyData,
  getBriefBuilder,
  getMST,
} from "@/lib/data/metrixSeedAdapter";
import { TYPE } from "./typography";
import { cn } from "@workspace/command-deck/lib/utils";
import type { AdAccount } from "@/lib/data/seedTypes";

export interface AccountLoopStage {
  id: "analysis" | "strategy" | "creative" | "mst";
  label: string;
  to: string;
  done: boolean;
}

export function accountLoopStages(
  seed: ReturnType<typeof useMetrixSeed>,
  account: AdAccount
): AccountLoopStage[] {
  const configured = account.status === "configured";
  const analysisDone =
    configured && (getAnalysisData(seed, account.id)?.performance_by_cell.length ?? 0) > 0;
  const strategyDone =
    configured && (getStrategyData(seed, account.id)?.message_pillars.length ?? 0) > 0;
  const briefsDone =
    configured && (getBriefBuilder(seed, account.id)?.draft_briefs.length ?? 0) > 0;
  const mstDone =
    configured && (getMST(seed, account.id)?.local_book2_library?.length ?? 0) > 0;
  return [
    { id: "analysis",  label: "Analysis",  to: "/app/analysis",  done: analysisDone },
    { id: "strategy",  label: "Strategy",  to: "/app/strategy",  done: strategyDone },
    { id: "creative",  label: "Creative",  to: "/app/creative",  done: briefsDone   },
    { id: "mst",       label: "MST",       to: "/app/mst",       done: mstDone      },
  ];
}

const STAGE_LABELS = ["Analysis", "Strategy", "Creative", "MST"] as const;

// ─── Main export ─────────────────────────────────────────────────────

/** Compact rollup card embedded at the top of Manager Overview. */
export function OverviewLoopSummary() {
  const seed = useMetrixSeed();
  const { adAccounts, selectedAccountType, activeAdAccountId } = useAccount();

  // ── Account scoping ──────────────────────────────────────────────────
  // When viewing as an ad account (not manager), scope the loop view to only
  // that account's data — do not reveal other clients' progress.
  const scopedAccounts =
    selectedAccountType === "ad_account" && activeAdAccountId
      ? adAccounts.filter((a) => a.id === activeAdAccountId)
      : adAccounts;

  const rows = scopedAccounts.map((a) => ({
    account: a,
    stages: accountLoopStages(seed, a),
  }));

  const configuredRows = rows.filter((r) => r.account.status === "configured");

  const total = configuredRows.length;
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
              {i > 0 && (
                <span className={cn(TYPE.label, "text-muted-foreground/30 mr-1")}>·</span>
              )}
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
      </div>
    </div>
  );
}
