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
import { LOOP_STAGES } from "@/navigation/navTree";
import type { AdAccount } from "@/lib/data/seedTypes";

type Seed = ReturnType<typeof useMetrixSeed>;

export interface AccountLoopStage {
  /** A `LOOP_STAGES` id. */
  id: string;
  label: string;
  to: string;
  done: boolean;
}

// The rollup counts the loop stages that leave real output in the seed.
// Listen (continuous monitoring) and Action (the optimize producer has not
// landed — register F-e) have no "done" to count, so they are filtered out
// of `LOOP_STAGES` here rather than re-typed alongside it.
const DONE_BY_STAGE: Record<string, (seed: Seed, accountId: string) => boolean> = {
  analysis: (seed, id) => (getAnalysisData(seed, id)?.performance_by_cell.length ?? 0) > 0,
  strategy: (seed, id) => (getStrategyData(seed, id)?.message_pillars.length ?? 0) > 0,
  creative: (seed, id) => (getBriefBuilder(seed, id)?.draft_briefs.length ?? 0) > 0,
  mst: (seed, id) => (getMST(seed, id)?.local_book2_library?.length ?? 0) > 0,
};

const COUNTED_STAGES = LOOP_STAGES.filter((s) => s.id in DONE_BY_STAGE);

export function accountLoopStages(seed: Seed, account: AdAccount): AccountLoopStage[] {
  const configured = account.status === "configured";
  return COUNTED_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    to: s.to,
    done: configured && DONE_BY_STAGE[s.id]!(seed, account.id),
  }));
}

const STAGE_LABELS = COUNTED_STAGES.map((s) => s.label);

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
    <div className="rounded-xl border border-border/40 bg-foreground/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Stage completion summary */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={cn(TYPE.label, "text-muted-foreground/75 shrink-0")}>IAP Loop</span>
          <span className={cn(TYPE.label, "text-muted-foreground/75 shrink-0")}>·</span>
          {stageCounts.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1 shrink-0">
              {i > 0 && (
                <span className={cn(TYPE.label, "text-muted-foreground/75 mr-1")}>·</span>
              )}
              <span
                className={cn(
                  TYPE.label,
                  s.done === s.total && s.total > 0
                    ? "text-status-success/90"
                    : s.done > 0
                      ? "text-status-warning/80"
                      : "text-muted-foreground/75"
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
