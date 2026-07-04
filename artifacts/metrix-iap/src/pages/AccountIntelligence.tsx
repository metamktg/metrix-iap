import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  BarChart3, ArrowRight, ArrowUpRight, AlertCircle,
  CheckCircle2, Database, Zap,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  AD_ACCOUNTS, ANALYSIS_RUNS,
  getCampaignsForAccount, getAdsForAccount,
} from "@/lib/mock-data";
import type { AdAccount, AdAccountStatus } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

const STATUS_STYLES: Record<AdAccountStatus, string> = {
  Connected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Manual CSV Mode": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Needs Attention": "bg-orange-400/10 text-orange-400 border-orange-400/20",
  "API Sync Coming Soon": "bg-muted text-muted-foreground border-border/40",
};

function dqColor(score: number): string {
  return score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-400" : "bg-orange-400";
}

function dqText(score: number): string {
  return score >= 80 ? "text-emerald-400" : score >= 60 ? "text-yellow-400" : "text-orange-400";
}

// ─── Data quality bar ──────────────────────────────────────────────────

function DataQualityBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border/30 rounded-full h-1 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", dqColor(score))} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("text-[10px] font-mono font-semibold w-7 text-right", dqText(score))}>{score}</span>
    </div>
  );
}

// ─── Account card ──────────────────────────────────────────────────────

function AccountCard({ account, wsId }: { account: AdAccount; wsId: string }) {
  const [, navigate] = useLocation();
  const campaigns = getCampaignsForAccount(account.id);
  const ads = getAdsForAccount(account.id);
  const runs = ANALYSIS_RUNS.filter(r => r.ad_account_id === account.id);

  return (
    <button
      onClick={() => navigate(`/app/workspaces/${wsId}/ad-accounts/${account.id}`)}
      className="w-full text-left bg-card border border-border/60 rounded-xl p-4 hover:border-primary/30 hover:bg-primary/[0.03] transition-all group space-y-3"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{account.account_name}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {account.platform} · {account.account_id_external}
          </div>
          {account.platform_label && (
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">{account.platform_label}</div>
          )}
        </div>
        <span className={cn(
          "text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0",
          STATUS_STYLES[account.status]
        )}>
          {account.status}
        </span>
      </div>

      {/* Signal quality */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Database className="w-2.5 h-2.5" /> Signal Quality
          </span>
        </div>
        <DataQualityBar score={account.data_quality_score} />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        <div>
          <div className="text-xs font-bold text-foreground">{fmtUSD(account.spend_analyzed_usd)}</div>
          <div className="text-[9px] text-muted-foreground">Analyzed</div>
        </div>
        <div>
          <div className="text-xs font-bold text-foreground">{campaigns.length}</div>
          <div className="text-[9px] text-muted-foreground">Campaigns</div>
        </div>
        <div>
          <div className="text-xs font-bold text-foreground">{ads.length}</div>
          <div className="text-[9px] text-muted-foreground">Ads</div>
        </div>
        <div>
          <div className={cn("text-xs font-bold", account.open_recommendations > 0 ? "text-[hsl(var(--metrix-gold))]" : "text-foreground")}>
            {account.open_recommendations}
          </div>
          <div className="text-[9px] text-muted-foreground">Open recs</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/30">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Zap className="w-2.5 h-2.5" />
          {runs.length} analysis run{runs.length !== 1 ? "s" : ""}
          {account.last_analysis_at && (
            <>
              <span className="text-muted-foreground/30">·</span>
              last {account.last_analysis_at}
            </>
          )}
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
      </div>
    </button>
  );
}

// ─── Account Intelligence ──────────────────────────────────────────────

export function AccountIntelligence() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace.id;

  const accounts = AD_ACCOUNTS.filter(a => a.workspace_id === wsId);
  const totalSpend = accounts.reduce((s, a) => s + a.spend_analyzed_usd, 0);
  const totalRecs = accounts.reduce((s, a) => s + a.open_recommendations, 0);
  const avgDQ = accounts.length
    ? Math.round(accounts.reduce((s, a) => s + a.data_quality_score, 0) / accounts.length)
    : 0;
  const needsAttention = accounts.filter(a => a.status === "Needs Attention").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-7">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Account Intelligence</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Signal quality and performance posture per ad account — {currentWorkspace.name}
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Ad Accounts", value: accounts.length, sub: `${accounts.filter(a => a.data_quality_score >= 80).length} high signal`, color: "text-foreground" },
            { label: "Spend Analyzed", value: fmtUSD(totalSpend), sub: "across accounts", color: "text-primary" },
            { label: "Avg Signal Quality", value: avgDQ, sub: avgDQ >= 80 ? "strong" : avgDQ >= 60 ? "moderate" : "needs work", color: dqText(avgDQ) },
            { label: "Open Recommendations", value: totalRecs, sub: needsAttention > 0 ? `${needsAttention} account${needsAttention !== 1 ? "s" : ""} ${needsAttention === 1 ? "needs" : "need"} attention` : "all stable", color: totalRecs > 0 ? "text-[hsl(var(--metrix-gold))]" : "text-emerald-400" },
          ].map(item => (
            <div key={item.label} className="bg-card border border-border/60 rounded-xl px-4 py-3">
              <div className={cn("text-2xl font-bold leading-none", item.color)}>{item.value}</div>
              <div className="text-[11px] font-medium text-foreground mt-1.5">{item.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Priority Read banner */}
        {needsAttention > 0 && (
          <div className="flex items-start gap-3 bg-[hsl(var(--metrix-gold)/0.08)] border border-[hsl(var(--metrix-gold)/0.25)] rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-[hsl(var(--metrix-gold))] shrink-0 mt-0.5" />
            <div className="text-xs text-foreground leading-relaxed">
              <span className="font-semibold">Priority Read:</span>{" "}
              {needsAttention} account{needsAttention !== 1 ? "s" : ""} flagged for attention with {totalRecs} open recommendation{totalRecs !== 1 ? "s" : ""}.
              Review signal quality before launching new analysis runs.
            </div>
          </div>
        )}

        {/* Account grid */}
        {accounts.length === 0 ? (
          <div className="text-center py-16 border border-border/40 rounded-xl space-y-2">
            <Database className="w-6 h-6 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No ad accounts connected in this workspace.</p>
            <p className="text-xs text-muted-foreground/60">Connect an account or import CSV data to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {accounts.map(account => (
              <AccountCard key={account.id} account={account} wsId={wsId} />
            ))}
          </div>
        )}

        {/* Accounts summary note */}
        {accounts.some(a => a.notes) && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" /> Account Context
            </div>
            {accounts.filter(a => a.notes).map(a => (
              <div key={a.id} className="flex items-start gap-2 text-[11px] text-muted-foreground bg-card border border-border/40 rounded-lg px-3 py-2">
                <ArrowUpRight className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                <span><span className="text-foreground font-medium">{a.account_name}:</span> {a.notes}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
