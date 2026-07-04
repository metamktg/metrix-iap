import { useParams, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, Database, Zap, ChevronRight, AlertCircle,
  TrendingUp, Layers, ArrowRight,
} from "lucide-react";
import {
  getAdAccountById, getCampaignsForAccount, getAdsForAccount, ANALYSIS_RUNS,
} from "@/lib/mock-data";
import type { AdAccountStatus, PerformanceTier, Campaign } from "@/lib/types";

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

const TIER_COLORS: Record<PerformanceTier, string> = {
  1: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  2: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  3: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  4: "text-red-400 bg-red-500/10 border-red-500/20",
};
const TIER_LABELS: Record<PerformanceTier, string> = {
  1: "P1 — Top",
  2: "P2 — Strong",
  3: "P3 — Developing",
  4: "P4 — At Risk",
};

const CAMPAIGN_STATUS: Record<Campaign["status"], string> = {
  Active: "text-emerald-400",
  Paused: "text-yellow-400",
  Ended: "text-muted-foreground",
};

function dqColor(score: number): string {
  return score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-400" : "bg-orange-400";
}
function dqText(score: number): string {
  return score >= 80 ? "text-emerald-400" : score >= 60 ? "text-yellow-400" : "text-orange-400";
}

// ─── Account Detail ────────────────────────────────────────────────────

export function AccountDetail() {
  const { workspaceId, adAccountId } = useParams<{ workspaceId: string; adAccountId: string }>();
  const [, navigate] = useLocation();

  const account = adAccountId ? getAdAccountById(adAccountId) : undefined;

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-bold text-foreground">Account not found</h2>
          <p className="text-xs text-muted-foreground">ID: {adAccountId}</p>
          <button
            onClick={() => navigate(`/app/workspaces/${workspaceId}/ad-accounts`)}
            className="text-xs text-primary hover:underline"
          >
            Back to Account Intelligence
          </button>
        </div>
      </div>
    );
  }

  const campaigns = getCampaignsForAccount(account.id)
    .sort((a, b) => a.tier - b.tier || b.spend_usd - a.spend_usd);
  const ads = getAdsForAccount(account.id);
  const runs = ANALYSIS_RUNS
    .filter(r => r.ad_account_id === account.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const tierCounts: Record<PerformanceTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const ad of ads) tierCounts[ad.tier]++;
  const totalAds = ads.length || 1;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* Back */}
        <button
          onClick={() => navigate(`/app/workspaces/${workspaceId}/ad-accounts`)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Account Intelligence
        </button>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{account.account_name}</h1>
            <div className="text-xs text-muted-foreground font-mono">
              {account.platform} · {account.account_id_external} · {account.currency}
            </div>
            {account.platform_label && (
              <div className="text-[11px] text-muted-foreground/70">{account.platform_label}</div>
            )}
          </div>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded border font-semibold leading-none shrink-0",
            STATUS_STYLES[account.status]
          )}>
            {account.status}
          </span>
        </div>

        {/* Notes / context */}
        {account.notes && (
          <div className="flex items-start gap-3 bg-card border border-border/60 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-[hsl(var(--metrix-gold))] shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{account.notes}</p>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Spend Analyzed", value: fmtUSD(account.spend_analyzed_usd), color: "text-primary" },
            { label: "Campaigns", value: campaigns.length, color: "text-foreground" },
            { label: "Ads", value: ads.length, color: "text-foreground" },
            { label: "Open Recs", value: account.open_recommendations, color: account.open_recommendations > 0 ? "text-[hsl(var(--metrix-gold))]" : "text-emerald-400" },
          ].map(item => (
            <div key={item.label} className="bg-card border border-border/60 rounded-xl px-4 py-3">
              <div className={cn("text-2xl font-bold leading-none", item.color)}>{item.value}</div>
              <div className="text-[11px] font-medium text-foreground mt-1.5">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Signal quality */}
        <div className="bg-card border border-border/60 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Signal Quality</span>
            <span className={cn("ml-auto text-sm font-bold", dqText(account.data_quality_score))}>
              {account.data_quality_score}<span className="text-[10px] text-muted-foreground font-normal">/100</span>
            </span>
          </div>
          <div className="bg-border/30 rounded-full h-1.5 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", dqColor(account.data_quality_score))} style={{ width: `${account.data_quality_score}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            {account.data_quality_score >= 80
              ? "Strong signal — results are reliable for high-confidence decisions."
              : account.data_quality_score >= 60
              ? "Moderate signal — validate key findings before scaling spend."
              : "Weak signal — resolve tracking/data gaps before trusting run outputs."}
          </p>
        </div>

        {/* Creative tier distribution */}
        {ads.length > 0 && (
          <div className="bg-card border border-border/60 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Creative Tier Distribution</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden">
              {([1, 2, 3, 4] as PerformanceTier[]).map(t => tierCounts[t] > 0 && (
                <div
                  key={t}
                  className={cn(TIER_COLORS[t].split(" ")[1])}
                  style={{ width: `${(tierCounts[t] / totalAds) * 100}%` }}
                  title={`${TIER_LABELS[t]}: ${tierCounts[t]}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 pt-1">
              {([1, 2, 3, 4] as PerformanceTier[]).map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none", TIER_COLORS[t])}>
                    {TIER_LABELS[t]}
                  </span>
                  <span className="text-xs font-bold text-foreground">{tierCounts[t]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campaigns */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Campaigns ({campaigns.length})</span>
          </div>
          {campaigns.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground border border-border/40 rounded-xl">
              No campaign data imported for this account.
            </div>
          ) : (
            <div className="space-y-1.5">
              {campaigns.map(c => (
                <div key={c.id} className="flex items-center gap-3 bg-card border border-border/50 rounded-lg px-3 py-2.5">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none shrink-0", TIER_COLORS[c.tier])}>
                    {TIER_LABELS[c.tier].split(" ")[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span className={CAMPAIGN_STATUS[c.status]}>{c.status}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span>{c.objective}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <div className="text-xs font-bold text-foreground">{fmtUSD(c.spend_usd)}</div>
                      <div className="text-[9px] text-muted-foreground">Spend</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">{c.roas.toFixed(2)}x</div>
                      <div className="text-[9px] text-muted-foreground">ROAS</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">${c.cpa_usd.toFixed(0)}</div>
                      <div className="text-[9px] text-muted-foreground">CPA</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analysis runs — closed loop back into the engine */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Analysis Runs ({runs.length})</span>
          </div>
          {runs.length === 0 ? (
            <div className="flex items-center justify-between text-center py-4 px-4 text-xs text-muted-foreground border border-border/40 rounded-xl">
              <span>No analysis runs for this account yet.</span>
              <button
                onClick={() => navigate("/app/iap/new")}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Zap className="w-3 h-3" /> New IAP Run
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {runs.map(r => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/app/iap/runs/${r.id}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border/50 hover:border-border hover:bg-white/[0.02] text-left transition-all group"
                >
                  <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{r.depth} — {r.objective}</div>
                    <div className="text-[10px] text-muted-foreground">{r.status} · confidence {r.confidence_score} · {r.created_at}</div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer action */}
        <div className="flex items-center gap-3 py-4 border-t border-border/40">
          <button
            onClick={() => navigate("/app/iap/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            New IAP Run
          </button>
          <button
            onClick={() => navigate("/app/creative-library")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            <Layers className="w-3.5 h-3.5" />
            Creative Library
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

      </div>
    </div>
  );
}
