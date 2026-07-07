// ─── Ad Account Overview ──────────────────────────────────────────────
// Scoped to the active ad account. Configured → health, current focus /
// next action, layer readiness, core controls, optimization loop deck.
// Unconfigured → connect state. All readiness/counts are derived from real
// seed data (presence + item counts) — never fabricated.

import { useMemo } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, KeyRound, Radio, BarChart3, Layers, FileText, Grid3x3, Zap, ArrowRight } from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import {
  getAdAccount, getListenSignals, getAnalysisData, getStrategyData,
  getReportBuilder, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, ScopeBanner, MetricTile, SectionCard, CaveatNote,
  UnconfiguredState, PendingState, fmtUSD, fmtNum, fmtPct, eventLabel,
} from "./shared";
import { cn } from "@/lib/utils";

const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, setup: 0 };

export function AdAccountOverview() {
  const adAccountId = useScopedAdAccountId();
  const [, navigate] = useLocation();
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

  // ── Derived (real-data) summaries ──────────────────────────────────
  const signals = getListenSignals(adAccountId);
  const analysis = getAnalysisData(adAccountId);
  const strategy = getStrategyData(adAccountId);
  const report = getReportBuilder(adAccountId);
  const mst = getMST(adAccountId);

  const cellCount = analysis?.performance_by_cell.length ?? 0;
  const variableCount = analysis?.v3_variable_performance.length ?? 0;
  const pillarCount = strategy?.message_pillars.length ?? 0;
  const hypothesisCount = strategy?.active_hypotheses.length ?? 0;
  const sectionCount = report?.report_sections.length ?? 0;
  const matrixCellCount = mst?.historical_matrix_4x4?.cells.length ?? 0;
  const libraryCount = mst?.local_book2_library?.length ?? 0;
  const mstActive = mst?.status === "active";

  const recCards = optLoop?.recommendation_cards ?? [];
  const nextAction = [...recCards].sort(
    (a, b) => (IMPACT_RANK[b.impact] ?? 0) - (IMPACT_RANK[a.impact] ?? 0)
  )[0];

  type Layer = { name: string; count: number; unit: string; ready: boolean; to: string; Icon: React.ComponentType<{ className?: string }> };
  const layers: Layer[] = [
    { name: "Listen", count: signals.length, unit: signals.length === 1 ? "signal" : "signals", ready: signals.length > 0, to: "/app/listen", Icon: Radio },
    { name: "Analysis", count: cellCount + variableCount, unit: "cells + variables", ready: (cellCount + variableCount) > 0, to: "/app/analysis", Icon: BarChart3 },
    { name: "Strategy", count: pillarCount + hypothesisCount, unit: "pillars + hypotheses", ready: (pillarCount + hypothesisCount) > 0, to: "/app/strategy", Icon: Layers },
    { name: "Report Builder", count: sectionCount, unit: sectionCount === 1 ? "section" : "sections", ready: sectionCount > 0, to: "/app/report-builder", Icon: FileText },
    { name: "MST", count: matrixCellCount, unit: "matrix cells", ready: mstActive && matrixCellCount > 0, to: "/app/mst", Icon: Grid3x3 },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Ad Account · 00"
        title={account.name}
        subtitle="Account health, current focus, layer readiness, and the account optimization loop."
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

        {/* Current focus / next action */}
        <SectionCard
          title="Current focus"
          desc="The active sprint and the highest-priority next action for this account, from the optimization loop."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-purple-400/15 bg-purple-400/[0.03] p-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Grid3x3 className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-[11px] font-semibold text-foreground">Current sprint</span>
              </div>
              {mstActive ? (
                <>
                  <p className="text-[12px] text-foreground/80 leading-relaxed">
                    MST active — {matrixCellCount} matrix cells across the concept × shared-variable grid, {libraryCount} concepts in the local library.
                  </p>
                  <button onClick={() => navigate("/app/mst")} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors">
                    Open MST <ArrowRight className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <p className="text-[12px] text-muted-foreground/60 leading-relaxed">No active sprint. MST becomes available once historical data or imports exist.</p>
              )}
            </div>

            <div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-foreground">Next action</span>
              </div>
              {nextAction ? (
                <>
                  <p className="text-[12px] font-medium text-foreground leading-snug">{nextAction.title}</p>
                  <p className="text-[11px] text-foreground/70 mt-1 leading-relaxed">{nextAction.recommended_action}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-2">{recCards.length} recommendation{recCards.length === 1 ? "" : "s"} in the optimization loop below.</p>
                </>
              ) : (
                <p className="text-[12px] text-muted-foreground/60 leading-relaxed">No recommendations yet.</p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Layer status / readiness */}
        <div>
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-3">Layer status</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {layers.map((l) => (
              <button
                key={l.name}
                onClick={() => navigate(l.to)}
                className="rounded-xl border border-border/40 bg-white/[0.02] p-3.5 text-left hover:border-border/60 hover:bg-white/[0.04] transition-colors flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <l.Icon className="w-3.5 h-3.5 text-primary/60" />
                  <span className={cn(
                    "text-[8px] font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                    l.ready ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10" : "text-muted-foreground/50 border-border/40 bg-white/[0.03]"
                  )}>
                    {l.ready ? "Ready" : "Pending"}
                  </span>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-foreground leading-tight">{l.name}</div>
                  <div className="text-[10px] text-muted-foreground/55 mt-0.5">
                    <span className="tabular-nums text-foreground/70 font-medium">{l.count}</span> {l.unit}
                  </div>
                </div>
              </button>
            ))}
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
