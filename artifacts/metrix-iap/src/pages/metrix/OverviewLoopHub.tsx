// ─── Overview · IAP Loop hub ────────────────────────────────────────────
// Shared by the Overview pulse view (compact) and the full /app/overview/loop
// page (per-account). Reads presence of real data already in the loaded
// seed bundle rather than firing per-account network calls.

import { Fragment } from "react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccounts,
  getAnalysisData,
  getStrategyData,
  getBriefBuilder,
  getMST,
} from "@/lib/data/metrixSeedAdapter";
import { CrossLink } from "./shared";
import { TYPE } from "./typography";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Plug, Infinity } from "lucide-react";
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

// ─── Navigation helper (client-side pushState) ────────────────────────

function go(href: string, e: React.MouseEvent) {
  e.preventDefault();
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// ─── Compact stage dots strip ────────────────────────────────────────

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

/** Compact account pill — name + 4 stage dots. */
function AccountPill({
  account,
  stages,
}: {
  account: AdAccount;
  stages: AccountLoopStage[];
}) {
  const abbrev =
    account.name.length > 14 ? account.name.slice(0, 13).trimEnd() + "…" : account.name;
  const configured = account.status === "configured";
  return (
    <span
      title={account.name}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded border leading-none shrink-0",
        configured
          ? "bg-white/[0.03] border-border/40"
          : "bg-white/[0.01] border-border/25 opacity-60"
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

// ─── Full-mode: individual account stage-chain card ────────────────────

function AccountLoopCard({
  account,
  stages,
}: {
  account: AdAccount;
  stages: AccountLoopStage[];
}) {
  const configured = account.status === "configured";
  const doneCount = stages.filter((s) => s.done).length;
  const allDone = configured && doneCount === stages.length;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5 transition-all",
        allDone
          ? "border-emerald-400/20 bg-emerald-400/[0.025]"
          : configured
            ? "border-border/40 bg-white/[0.02]"
            : "border-border/20 bg-transparent opacity-55"
      )}
    >
      {/* Account header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              allDone
                ? "bg-emerald-400"
                : configured
                  ? "bg-emerald-400/50"
                  : "bg-muted-foreground/30"
            )}
          />
          <span className="text-[13px] font-semibold text-foreground/90 truncate">{account.name}</span>
          {account.platform && (
            <span className="text-[10px] text-muted-foreground/50 shrink-0 hidden sm:inline">
              {account.platform}
            </span>
          )}
        </div>
        {configured && (
          <span
            className={cn(
              "text-[10px] font-medium tabular-nums shrink-0 ml-3",
              allDone ? "text-emerald-400/80" : doneCount > 0 ? "text-amber-400/70" : "text-muted-foreground/50"
            )}
          >
            {doneCount}/{stages.length}
          </span>
        )}
      </div>

      {configured ? (
        /* Stage chain: nodes connected by progress lines */
        <div className="flex items-center">
          {stages.map((stage, i) => (
            <Fragment key={stage.id}>
              {/* Stage node */}
              <a
                href={stage.to}
                onClick={(e) => go(stage.to, e)}
                title={`Go to ${stage.label}`}
                className="flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-white/[0.06] transition-colors group/stage"
              >
                <div
                  className={cn(
                    "w-[22px] h-[22px] rounded-full flex items-center justify-center border transition-all",
                    stage.done
                      ? "bg-emerald-400/15 border-emerald-400/40 group-hover/stage:bg-emerald-400/25"
                      : "bg-white/[0.03] border-border/40 group-hover/stage:border-border/60"
                  )}
                >
                  {stage.done ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Circle className="w-3 h-3 text-muted-foreground/40" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[9px] font-medium leading-none whitespace-nowrap",
                    stage.done
                      ? "text-emerald-400/80"
                      : "text-muted-foreground/45 group-hover/stage:text-muted-foreground/70"
                  )}
                >
                  {stage.label}
                </span>
              </a>

              {/* Connector line */}
              {i < stages.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-px mb-3.5 mx-0.5 transition-colors",
                    stage.done ? "bg-emerald-400/30" : "bg-border/25"
                  )}
                />
              )}
            </Fragment>
          ))}
        </div>
      ) : (
        /* Not connected state */
        <div className="flex items-center gap-2 py-1">
          <Plug className="w-3 h-3 text-muted-foreground/35 shrink-0" />
          <span className="text-[11px] text-muted-foreground/45">
            Not connected — configure to begin
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────

/** Rollup card — compact at top of Manager Overview, or full on /app/overview/loop. */
export function OverviewLoopSummary({ full = false }: { full?: boolean }) {
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
  const completeRows = configuredRows.filter((r) => r.stages.every((s) => s.done));
  const isScoped = selectedAccountType === "ad_account";

  // ── Full page view ────────────────────────────────────────────────────
  if (full) {
    return (
      <div className="space-y-3">
        {/* Summary banner */}
        {!isScoped && configuredRows.length > 0 && (
          <div className="flex items-center gap-3 px-0.5 mb-1">
            <div className="flex items-center gap-1.5">
              <Infinity className="w-3.5 h-3.5 text-interactive/70 shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                IAP Loop
              </span>
            </div>
            <div className="flex-1 h-px bg-border/30 rounded-full" />
            <span
              className={cn(
                "text-[11px] font-medium",
                completeRows.length === configuredRows.length && configuredRows.length > 0
                  ? "text-emerald-400/80"
                  : completeRows.length > 0
                    ? "text-amber-400/70"
                    : "text-muted-foreground/50"
              )}
            >
              {completeRows.length} / {configuredRows.length} complete
            </span>
          </div>
        )}

        {/* Per-account stage-chain cards */}
        {rows.map(({ account, stages }) => (
          <AccountLoopCard key={account.id} account={account} stages={stages} />
        ))}

        {rows.length === 0 && (
          <div className="rounded-xl border border-border/30 bg-white/[0.01] px-4 py-6 text-center">
            <span className="text-[12px] text-muted-foreground/50">No accounts configured.</span>
          </div>
        )}
      </div>
    );
  }

  // ── Compact embedded view (manager overview card) ─────────────────────
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
