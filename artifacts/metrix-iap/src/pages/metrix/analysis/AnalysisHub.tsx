// ─── Analysis · Hub (/app/analysis) ──────────────────────────────────
// Command center for the Analysis layer of the loop:
// recent run status, KPIs, execution CTA, quick links to all sub-pages.

import { useState } from "react";
import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  HubTldrCard,
  TopCreativeStrip,
  TopAvatarPanel,
  TopCopyStrip,
  TopVariableStackStrip,
} from "../PerformanceIntelligence";
import {
  getAdAccount,
  getAnalysisData,
  getCampaignSummary,
  getCoreControls,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader,
  ModuleScopeGate,
  PendingState,
  CrossLink,
  fmtUSD,
  fmtPct,
  SectionCard,
  deriveLabel,
  InfoTooltip,
} from "../shared";
import { ManualImportDialog } from "../ConnectAccountDialogs";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  BarChart3,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  PlayCircle,
  ArrowRight,
} from "lucide-react";

const SECTION = "Analysis · 03";

function StatusPill({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cls =
    s === "success" || s === "completed"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : s === "running"
        ? "bg-primary/10 text-interactive border-primary/20"
        : s === "error" || s === "failed"
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-muted text-muted-foreground border-border/40";
  return (
    <span
      className={cn(
        "text-label font-semibold px-1.5 py-0.5 rounded border leading-none shrink-0 capitalize",
        cls,
      )}
    >
      {status}
    </span>
  );
}

function StatusBar({ status }: { status: string }) {
  const s = status?.toLowerCase();
  return (
    <div
      className={cn(
        "w-1 h-8 rounded-full shrink-0",
        s === "success" || s === "completed"
          ? "bg-emerald-500"
          : s === "running"
            ? "bg-primary"
            : s === "error" || s === "failed"
              ? "bg-destructive"
              : "bg-border",
      )}
    />
  );
}

export function AnalysisHub() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
    <ModuleScopeGate section={SECTION} title="Analysis" account={account}>
      {() => {
        const acct = account!;
        const analysis = getAnalysisData(seed, adAccountId);
        const summary = getCampaignSummary(seed, adAccountId);
        const controls = getCoreControls(seed, adAccountId);
        const loopStatus = acct.iap?.loop_status ?? [];

        const analysisStage = loopStatus.find((s) => s.stage === "analysis");
        const analysisRuns = acct.iap?.analysis?.performance_by_cell ?? [];

        const spend = summary?.total_spend_usd ?? 0;
        const impressions = summary?.total_impressions ?? null;
        const linkCtr = summary?.overall_link_ctr_pct ?? null;
        const cellCount = analysisRuns.length;

        const hasData = !!summary && cellCount > 0;

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="Analysis"
              account={acct}
              tabs="analysis"
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-5xl">
              {/* Action row */}
              <div className="flex items-center justify-between gap-4">
                <p className={cn(TYPE.caption, "text-muted-foreground")}>
                  {hasData
                    ? `${cellCount} cell${cellCount !== 1 ? "s" : ""} in latest run`
                    : "No analysis data yet"}
                </p>
                <button
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border transition-all bg-primary text-white border-primary hover:bg-primary/90 shadow-md shadow-primary/25 hover:shadow-primary/35"
                >
                  <PlayCircle className="w-4 h-4 shrink-0" />
                  Upload &amp; Run Analysis
                  <ArrowRight className="w-3.5 h-3.5 opacity-75 ml-0.5" />
                </button>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  {
                    label: "Total Spend",
                    value: spend > 0 ? fmtUSD(spend) : "—",
                    color: "text-foreground",
                  },
                  {
                    label: "Impressions",
                    value: impressions != null ? impressions.toLocaleString() : "—",
                    color: "text-foreground",
                  },
                  {
                    label: "Link CTR",
                    value: linkCtr != null ? fmtPct(linkCtr) : "—",
                    color: linkCtr != null && linkCtr >= 1.5 ? "text-interactive" : "text-foreground",
                  },
                  {
                    label: "Cells Analysed",
                    value: cellCount > 0 ? String(cellCount) : "—",
                    color: "text-foreground",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <p className={cn(TYPE.label, "text-muted-foreground/70 mb-1")}>
                      {kpi.label}
                    </p>
                    <div
                      className={cn(
                        "text-2xl font-bold tabular-nums",
                        kpi.color,
                      )}
                    >
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Loop stage status */}
              {analysisStage && (
                <div
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 rounded-xl border",
                    analysisStage.status === "complete"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-primary/5 border-primary/20",
                  )}
                >
                  {analysisStage.status === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Activity className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
                  )}
                  <p className={cn(TYPE.body, "text-foreground font-semibold")}>
                    Stage: <span className="capitalize">{analysisStage.status}</span>
                  </p>
                </div>
              )}

              {/* Primary control */}
              {controls?.primary_control && (
                <div className="bg-card/60 border border-primary/25 rounded-xl px-4 py-3.5">
                  <p className={cn(TYPE.label, "text-interactive mb-1.5")}>Primary Control</p>
                  <p className={cn(TYPE.body, "text-foreground leading-relaxed")}>
                    {controls.primary_control}
                  </p>
                  {controls.primary_control_read && (
                    <p className={cn(TYPE.caption, "text-muted-foreground mt-1.5 leading-relaxed")}>
                      {deriveLabel(controls.primary_control_read, 140)}
                    </p>
                  )}
                </div>
              )}

              {/* No-data state */}
              {!hasData && (
                <PendingState
                  title="No analysis data yet"
                  message="Import performance data or connect a Meta ad account to run your first IAP analysis."
                  icon={BarChart3}
                  action={
                    <CrossLink
                      to="/app/analysis/library"
                      label="Go to IAP Library"
                    />
                  }
                />
              )}

              {/* Quick links */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    label: "Analysis Overview",
                    desc: "KPI summary + core control read",
                    href: "/app/analysis/overview",
                  },
                  {
                    label: "IAP Library",
                    desc: "All runs + cell-level drill-down",
                    href: "/app/analysis/library",
                  },
                  {
                    label: "Audience",
                    desc: "Segment + demographic breakdown",
                    href: "/app/analysis/audience",
                  },
                  {
                    label: "Placements",
                    desc: "Feed / Story / Reels signal",
                    href: "/app/analysis/placements",
                  },
                  {
                    label: "Budget Insight",
                    desc: "Spend allocation read",
                    href: "/app/analysis/budget",
                  },
                ].map((l) => (
                  <div
                    key={l.href}
                    className="bg-card/60 border border-border/60 rounded-xl hover:border-primary/30 hover:bg-card transition-colors group"
                  >
                    <div className="flex items-center gap-1 px-4 py-3">
                      <a
                        href={l.href}
                        className="flex-1 flex items-center justify-between gap-1 min-w-0"
                      >
                        <span className={cn(TYPE.body, "font-semibold text-foreground truncate")}>
                          {l.label}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </a>
                      <InfoTooltip content={l.desc} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Performance Intelligence — panels self-guard on their own data */}
              <section aria-label="Performance Intelligence" className="space-y-4">
                <HubTldrCard accountId={adAccountId!} />
                <TopCreativeStrip accountId={adAccountId!} />
                <TopAvatarPanel accountId={adAccountId!} />
                <TopCopyStrip accountId={adAccountId!} />
                <TopVariableStackStrip accountId={adAccountId!} />
              </section>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
    {account && (
      <ManualImportDialog
        account={account}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    )}
    </>
  );
}
