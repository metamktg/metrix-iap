// ─── Manager / Agency Overview (default view) ─────────────────────────
// Only bottom-line performance totals may aggregate at manager level.
// No account-specific analysis, strategy, or reports here.

import { useMemo } from "react";
import { CheckCircle2, Plug, TrendingUp } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import { ModuleHeader, MetricTile, SectionCard, fmtUSD, fmtNum, fmtPct, eventLabel } from "./shared";
import { cn } from "@/lib/utils";

export function ManagerOverview() {
  const { manager, adAccounts, selectAdAccount } = useAccount();
  const data = getManagerOverview();
  const totals = data.bottom_line_totals;

  const deckCards: DeckCard[] = useMemo(
    () =>
      data.recommendation_cards.map((c) => ({
        id: c.id,
        title: c.title,
        rationale: c.rationale,
        recommendedAction: c.recommended_action,
        impact: c.impact,
        confidence: c.confidence,
        scope: c.scope,
        descriptor: c.manager_card_descriptor,
        actionGroup: actionGroupForScope(c.scope),
      })),
    [data.recommendation_cards]
  );

  const events = Object.entries(totals.result_totals_by_event);

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
          </div>
        </SectionCard>

        {/* Manager recommendations (blended, cross-account) */}
        <SectionCard
          title="Manager recommendations"
          desc="Cross-account signals surfaced at the agency level. Each carries the source account. Approving creates a manual task — no campaign is auto-edited."
        >
          <RecommendationDeck scopeId={manager.id} cards={deckCards} emptyLabel="All manager recommendations reviewed" />
        </SectionCard>
      </div>
    </div>
  );
}
