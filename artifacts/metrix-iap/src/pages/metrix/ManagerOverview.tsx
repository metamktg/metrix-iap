// ─── Manager / Agency Overview (default view) ─────────────────────────
// Only bottom-line performance totals may aggregate at manager level.
// No account-specific analysis, strategy, or reports here.
// No Optimization Loop at manager level — recommendations are READ-ONLY,
// labeled with their source account. Deeper action lives inside each account.

import { useLocation } from "wouter";
import { CheckCircle2, Plug, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, MetricTile, SectionCard, ConfidenceBadge, fmtUSD, fmtNum, fmtPct, eventLabel } from "./shared";
import { cn } from "@/lib/utils";

const IMPACT_STYLE: Record<string, string> = {
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
  setup: "bg-primary/10 text-primary border-primary/20",
};

const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  funnel: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  placement: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  mst: "bg-purple-500/10 text-purple-300 border-purple-500/20",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", cls)}>
      {text}
    </span>
  );
}

export function ManagerOverview() {
  const { manager, adAccounts, selectAdAccount } = useAccount();
  const seed = useMetrixSeed();
  const [, navigate] = useLocation();
  const data = getManagerOverview(seed);
  const totals = data.bottom_line_totals;
  const events = Object.entries(totals.result_totals_by_event);

  // Map account_id → display name so each rec shows its source account.
  const accountName = (id: string) =>
    adAccounts.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Metrix Manager · Agency Overview"
        title={manager.name}
        subtitle="Blended bottom-line performance across all connected ad accounts. Deeper analysis lives inside each ad account."
        right={
          <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">
            {data.configured_ad_accounts} configured · {data.unconfigured_ad_accounts} to set up
          </span>
        }
      />

      <div className="px-6 py-5 space-y-6 max-w-6xl">
        {/* Bottom-line totals */}
        <div>
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-3">Bottom-line totals</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile label="Total spend" value={fmtUSD(totals.spend_usd)} />
            <MetricTile label="Impressions" value={fmtNum(totals.impressions)} />
            <MetricTile label="Link clicks" value={fmtNum(totals.link_clicks)} />
            <MetricTile label="Link CTR" value={fmtPct(totals.link_ctr_pct)} />
          </div>
        </div>

        {/* Results by event */}
        <SectionCard title="Results by event" desc="Aggregated result volume across connected accounts, by conversion event.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {events.map(([key, e]) => (
              <div key={key} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3 h-3 text-primary/60" />
                  <span className="text-[11px] font-medium text-foreground leading-tight">{eventLabel(key)}</span>
                </div>
                <div className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{fmtNum(e.results)}</div>
                <div className="text-[10px] text-muted-foreground/50 mt-2 space-y-0.5">
                  <div>Spend {fmtUSD(e.spend)}</div>
                  <div>Link clicks {fmtNum(e.link_clicks)}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Accounts */}
        <SectionCard title="Ad accounts" desc="Select an account to open its scoped intelligence platform.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {adAccounts.map((a) => {
              const configured = a.status === "configured";
              return (
                <button
                  key={a.id}
                  onClick={() => selectAdAccount(a.id)}
                  className="flex items-center gap-3 p-3.5 rounded-lg border border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center shrink-0", configured ? "border-emerald-400/25 bg-emerald-400/10" : "border-border/40 bg-white/[0.03]")}>
                    {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Plug className="w-4 h-4 text-muted-foreground/50" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground leading-tight">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 capitalize">{configured ? `${a.platform} · connected` : "Setup required"}</div>
                  </div>
                </button>
              );
            })}

            {/* Add / Connect Ad Account entry point */}
            <button
              onClick={() => navigate("/app/settings")}
              className="flex items-center gap-3 p-3.5 rounded-lg border border-dashed border-border/50 bg-transparent hover:border-primary/40 hover:bg-primary/[0.03] transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg border border-dashed border-border/50 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-muted-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground/80 leading-tight">Add or connect an ad account</div>
                <div className="text-[10px] text-muted-foreground/50 mt-0.5">Connect Meta or add a manual import</div>
              </div>
            </button>
          </div>
        </SectionCard>

        {/* Manager recommendations — READ-ONLY, account-labeled. No swipe / no optimization loop here. */}
        <SectionCard
          title="Account recommendations"
          desc="Cross-account signals surfaced at the agency level. Read-only — open the source account to act on them. No campaign is auto-edited."
        >
          {data.recommendation_cards.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/50 py-4 text-center">No account recommendations at the moment.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {data.recommendation_cards.map((c) => (
                <div key={c.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col">
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Badge text={c.manager_card_descriptor ?? accountName(c.account_id)} cls="bg-primary/10 text-primary border-primary/20" />
                    <Badge text={c.scope} cls={SCOPE_STYLE[c.scope] ?? "bg-muted text-muted-foreground/60 border-border/40"} />
                    <Badge text={`${c.impact} impact`} cls={IMPACT_STYLE[c.impact] ?? IMPACT_STYLE.low} />
                    <ConfidenceBadge value={c.confidence} />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground leading-snug">{c.title}</p>
                  <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed">{c.rationale}</p>
                  <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border/20">
                    <ArrowRight className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-foreground/75 leading-relaxed">{c.recommended_action}</p>
                  </div>
                  <button
                    onClick={() => selectAdAccount(c.account_id)}
                    className="mt-3 self-start inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors"
                  >
                    Open {accountName(c.account_id)} <ArrowRight className="w-3 h-3" />
                  </button>
                  {c.source_path && (
                    <p className="text-[9px] font-mono text-muted-foreground/35 mt-2">source · {c.source_path}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
