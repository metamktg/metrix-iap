// ─── Ad Account Overview ──────────────────────────────────────────────
// Scoped to the active ad account. Configured → health, core controls,
// optimization loop deck (Task Tray / Dismissed Log). Unconfigured → connect state.

import { useMemo } from "react";
import { ShieldCheck, KeyRound } from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, ScopeBanner, MetricTile, SectionCard, CaveatNote,
  UnconfiguredState, PendingState, fmtUSD, fmtNum, fmtPct, eventLabel,
} from "./shared";

export function AdAccountOverview() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);

  const optLoop = account?.iap?.optimization_loop ?? null;
  const deckCards: DeckCard[] = useMemo(
    () =>
      (optLoop?.recommendation_cards ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        rationale: c.rationale,
        recommendedAction: c.recommended_action,
        impact: c.impact,
        confidence: c.confidence,
        scope: c.scope,
        actionGroup: actionGroupForScope(c.scope),
      })),
    [optLoop]
  );

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Ad Account · 00" title="Ad Account Overview" subtitle="Select an ad account to begin." />
        <PendingState title="No ad account selected" message="Choose an ad account from the switcher to view its overview." />
      </div>
    );
  }

  if (account.status !== "configured" || !account.iap) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Ad Account · 00" title={account.name} subtitle="Ad account overview" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const core = account.iap.core_reanalysis_read;
  const cs = account.iap.campaign_summary;
  const events = Object.entries(cs.bottom_line_totals);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Ad Account · 00"
        title={account.name}
        subtitle="Account health, core controls, and the account optimization loop."
        right={<span className="text-[10px] font-mono text-emerald-400/70 uppercase tracking-widest">Connected</span>}
      />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-6 max-w-6xl">
        {/* Health / totals */}
        <div>
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-3">Account totals</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile label="Total spend" value={fmtUSD(cs.total_spend_usd)} />
            <MetricTile label="Impressions" value={fmtNum(cs.total_impressions)} />
            <MetricTile label="Link clicks" value={fmtNum(cs.total_link_clicks)} />
            <MetricTile label="Link CTR" value={fmtPct(cs.overall_link_ctr_pct)} />
          </div>
        </div>

        {/* Results by event */}
        <SectionCard title="Results by event" desc="Conversion volume by event for this account.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {events.map(([key, e]) => (
              <div key={key} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5">
                <div className="text-[11px] font-medium text-foreground leading-tight mb-2">{eventLabel(key)}</div>
                <div className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{fmtNum(e.results)}</div>
                <div className="text-[10px] text-muted-foreground/50 mt-2 space-y-0.5">
                  <div>Spend {fmtUSD(e.spend)}</div>
                  <div>Link clicks {fmtNum(e.link_clicks)}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Core controls */}
        <SectionCard title="Core controls" desc="The current control creative for each funnel stage, read from the latest reanalysis." table="core_reanalysis_read">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03] p-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] font-semibold text-foreground">Checkout-depth control</span>
              </div>
              <p className="text-[12px] text-foreground/80 leading-relaxed">{core.primary_control_read}</p>
              <p className="text-[9px] font-mono text-muted-foreground/40 mt-2">{core.primary_control}</p>
            </div>
            <div className="rounded-lg border border-blue-400/15 bg-blue-400/[0.03] p-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-[11px] font-semibold text-foreground">Registration control</span>
              </div>
              <p className="text-[12px] text-foreground/80 leading-relaxed">{core.registration_control_read}</p>
              <p className="text-[9px] font-mono text-muted-foreground/40 mt-2">{core.registration_control}</p>
            </div>
          </div>
          <div className="mt-3">
            <CaveatNote text={core.data_caveat} />
          </div>
        </SectionCard>

        {/* Optimization loop */}
        <SectionCard
          title="Optimization loop"
          desc="Account-scoped recommendations. Swipe right to approve (creates a manual task), left to dismiss. Approved items never auto-edit campaigns."
        >
          {deckCards.length ? (
            <RecommendationDeck scopeId={account.id} cards={deckCards} emptyLabel="All account recommendations reviewed" />
          ) : (
            <PendingState title="No recommendations yet" message="Optimization loop recommendations will appear here once generated." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
