// ─── Ad Account Overview ──────────────────────────────────────────────
// Layer-status-first layout: status hero → two-column body.
// Left: metric accordions, focus, results, core controls, opt loop.
// Right: persistent Task Tray anchored at all times.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ShieldCheck, KeyRound, Radio, BarChart3, Layers, FileText, Grid3x3,
  Zap, ArrowRight, ChevronDown, ChevronRight,
} from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getListenSignals, getAnalysisData, getStrategyData,
  getReportBuilder, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, ScopeBanner, SectionCard, CaveatNote,
  UnconfiguredState, PendingState, fmtUSD, fmtNum, eventLabel, resultTerm,
} from "./shared";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { cn } from "@/lib/utils";
import { buildMetricCatalog, metricSourceFromCampaignSummary, metricById } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
import { TaskTrayPanel } from "@/components/deck/TaskTrayPanel";

const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, setup: 0 };

// ── Main export ─────────────────────────────────────────────────────────

export function AdAccountOverview() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const [, navigate] = useLocation();
  const account = getAdAccount(seed, adAccountId);

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

  // ── Early-exit states ───────────────────────────────────────────────

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Ad Account · 01" title="Ad Account Overview" subtitle="Select an ad account to begin." />
        <PendingState
          title="No ad account selected"
          message="Choose an ad account to view its overview."
          action={<InlineAccountPicker />}
        />
      </div>
    );
  }

  if (account.status !== "configured" || !account.iap) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Ad Account · 01" title={account.name} subtitle="Ad account overview" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const core = account.iap.core_reanalysis_read;
  const cs = account.iap.campaign_summary;
  const events = Object.entries(cs.bottom_line_totals);
  const term = resultTerm(account);

  // ── Derived summaries ───────────────────────────────────────────────
  const signals = getListenSignals(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);
  const report = getReportBuilder(seed, adAccountId);
  const mst = getMST(seed, adAccountId);

  // Resolve concept IDs to human-readable names from the MST library.
  const lib = mst?.local_book2_library ?? [];
  const resolveConceptName = (id: string) =>
    lib.find((c) => c.cell_id === id)?.book2_concept_name ?? id;
  const resolveControlText = (text: string, id: string) => {
    const name = resolveConceptName(id);
    if (name === id) return text;
    return text.replace(id, name);
  };
  const primaryControlName = resolveConceptName(core.primary_control);
  const registrationControlName = core.registration_control ? resolveConceptName(core.registration_control) : null;

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

  // ── Metric catalog + selection ──────────────────────────────────────
  const metricCatalog = useMemo(() => buildMetricCatalog(metricSourceFromCampaignSummary(cs)), [cs]);
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);
  const { selected: selectedMetricIds, toggle, move, reset } = useMetricSelection(availableMetricIds);
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  // ── Layer readiness ─────────────────────────────────────────────────
  type Layer = { name: string; count: number; unit: string; ready: boolean; to: string; Icon: React.ComponentType<{ className?: string }> };
  const layers: Layer[] = [
    { name: "Listen",         count: signals.length,              unit: signals.length === 1 ? "signal" : "signals",               ready: signals.length > 0,                       to: "/app/listen/signal",        Icon: Radio },
    { name: "Analysis",       count: cellCount + variableCount,   unit: "cells + variables",                                        ready: (cellCount + variableCount) > 0,           to: "/app/analysis/library",     Icon: BarChart3 },
    { name: "Strategy",       count: pillarCount + hypothesisCount, unit: "pillars + hypotheses",                                   ready: (pillarCount + hypothesisCount) > 0,       to: "/app/strategy/hypotheses",  Icon: Layers },
    { name: "Report Builder", count: sectionCount,                unit: sectionCount === 1 ? "section" : "sections",               ready: sectionCount > 0,                          to: "/app/report-builder",       Icon: FileText },
    { name: "MST",            count: matrixCellCount,             unit: "matrix cells",                                             ready: mstActive && matrixCellCount > 0,          to: "/app/mst",                  Icon: Grid3x3 },
  ];

  const readyCount = layers.filter((l) => l.ready).length;
  const allReady = readyCount === layers.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ModuleHeader
        section="Ad Account · 01"
        title={account.name}
        subtitle="Account health, current focus, layer readiness, and the account optimization loop."
        right={<span className="text-[10px] font-mono text-emerald-400/70 uppercase tracking-widest">Connected</span>}
      />
      <ScopeBanner account={account} />

      {/* ── Layer Status Hero (full-width, leads the hierarchy) ─────── */}
      <div className="px-6 py-4 border-b border-border/40 shrink-0 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/55">Layer Status</h2>
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full leading-none",
              allReady
                ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
                : "text-amber-300/80 border-amber-400/30 bg-amber-400/[0.07]"
            )}>
              {readyCount}/{layers.length} ready
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/40">Click any layer to navigate</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {layers.map((l) => (
            <button
              key={l.name}
              onClick={() => navigate(l.to)}
              className={cn(
                "group relative flex flex-col gap-2.5 p-3.5 rounded-xl border text-left transition-all",
                "hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
                l.ready
                  ? "border-emerald-400/30 bg-gradient-to-br from-emerald-400/[0.07] to-emerald-400/[0.02] hover:border-emerald-400/55 hover:from-emerald-400/[0.11] shadow-emerald-400/5"
                  : "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.05]"
              )}
            >
              {/* Icon + badge row */}
              <div className="flex items-center justify-between gap-1">
                <l.Icon className={cn(
                  "w-3.5 h-3.5 transition-colors",
                  l.ready ? "text-emerald-400/80 group-hover:text-emerald-400" : "text-muted-foreground/40"
                )} />
                <span className={cn(
                  "text-[8px] font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                  l.ready
                    ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/15"
                    : "text-amber-300/70 border-amber-400/25 bg-amber-400/[0.08]"
                )}>
                  {l.ready ? "Ready" : "Pending"}
                </span>
              </div>

              {/* Name + count */}
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-foreground leading-tight truncate">{l.name}</div>
                <div className="text-[10px] text-muted-foreground/60 mt-0.5 tabular-nums">
                  <span className="font-semibold text-foreground/65">{l.count}</span>{" "}{l.unit}
                </div>
              </div>

              {/* Navigate arrow */}
              <ChevronRight className={cn(
                "absolute right-2.5 bottom-3.5 w-3 h-3 transition-all",
                "text-muted-foreground/20 group-hover:text-foreground/55 group-hover:translate-x-0.5"
              )} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Two-column body ────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: scrollable main content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-6">

          {/* Account Totals — metric accordions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/55">Account Totals</h2>
              <MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {selectedMetricIds.map((id) => {
                const m = metricById(metricCatalog, id);
                if (!m) return null;
                const isExpanded = expandedMetricId === id;
                return (
                  <div key={id} className="flex flex-col">
                    <button
                      onClick={() => setExpandedMetricId(isExpanded ? null : id)}
                      className={cn(
                        "group flex flex-col text-left rounded-xl border px-4 py-3 transition-all",
                        isExpanded
                          ? "border-primary/35 bg-primary/[0.08] rounded-b-none border-b-primary/15 shadow-sm shadow-primary/10"
                          : "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/55">{m.label}</span>
                        <ChevronDown className={cn(
                          "w-3 h-3 text-muted-foreground/30 transition-transform shrink-0",
                          isExpanded && "rotate-180 text-primary/60"
                        )} />
                      </div>
                      <span className="text-[22px] font-bold text-foreground tabular-nums leading-none">{m.formatted}</span>
                      {m.sub && <span className="text-[9.5px] text-muted-foreground/50 mt-1.5 leading-tight">{m.sub}</span>}
                    </button>
                    {isExpanded && (
                      <div className="rounded-b-xl border border-t-0 border-primary/30 bg-primary/[0.04] px-4 py-3 space-y-2.5">
                        <p className="text-[11px] text-foreground/70 leading-relaxed">
                          <span className="font-semibold text-foreground/80">{m.label}</span> for the current analysis window.
                          {m.sub && <> Covers {m.sub.toLowerCase()}.</>}
                        </p>
                        <button
                          onClick={() => { setOpenMetricId(id); setExpandedMetricId(null); }}
                          className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          Diagnose full breakdown <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {selectedMetricIds.length === 0 && (
                <div className="col-span-2 md:col-span-4 text-[11px] text-muted-foreground/50 border border-dashed border-border/40 rounded-xl px-4 py-5 text-center">
                  No metrics selected — use "Customize" to add tiles.
                </div>
              )}
            </div>
          </div>

          {/* Current Focus */}
          <SectionCard
            title="Current focus"
            desc="The active sprint and the highest-priority next action for this account, from the optimization loop."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-purple-400/20 bg-purple-400/[0.03] p-4 hover:border-purple-400/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <Grid3x3 className="w-3.5 h-3.5 text-purple-300/80" />
                  <span className="text-[11px] font-semibold text-foreground">Current sprint</span>
                </div>
                {mstActive ? (
                  <>
                    <p className="text-[12px] text-foreground/80 leading-relaxed">
                      MST active — <span className="font-semibold text-foreground">{matrixCellCount}</span> matrix cells across the concept × shared-variable grid, <span className="font-semibold text-foreground">{libraryCount}</span> concepts in the local library.
                    </p>
                    <button onClick={() => navigate("/app/mst")} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-300 hover:text-purple-200 transition-colors">
                      Open MST <ArrowRight className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground/60 leading-relaxed">No active sprint — MST becomes available once historical data or imports exist.</p>
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-primary/80" />
                  <span className="text-[11px] font-semibold text-foreground">Next action</span>
                </div>
                {nextAction ? (
                  <>
                    <p className="text-[12px] font-semibold text-foreground leading-snug">{nextAction.title}</p>
                    <p className="text-[11px] text-foreground/70 mt-1.5 leading-relaxed">{nextAction.recommended_action}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2.5">
                      {recCards.length} recommendation{recCards.length === 1 ? "" : "s"} in the loop below ↓
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground/60 leading-relaxed">No recommendations yet.</p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Results by event */}
          <SectionCard title="Results by event" desc="Conversion volume by event for this account.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {events.map(([key, e]) => (
                <div key={key} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <div className="text-[11px] font-semibold text-foreground leading-tight mb-2">{eventLabel(key)}</div>
                  <div className="text-[22px] font-bold text-foreground tabular-nums leading-none">{fmtNum(e.results)}</div>
                  <div className="text-[10px] text-muted-foreground/65 mt-2.5 space-y-1">
                    <div>Spend <span className="text-foreground/70 font-medium">{fmtUSD(e.spend)}</span></div>
                    <div>Link clicks <span className="text-foreground/70 font-medium">{fmtNum(e.link_clicks)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Core controls */}
          <SectionCard title="Core controls" desc="The current control creative for each funnel stage, read from the latest reanalysis." table="core_reanalysis_read">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4 hover:border-emerald-400/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
                  <span className="text-[11px] font-semibold text-foreground">Primary control</span>
                </div>
                <p className="text-[13px] font-semibold text-foreground mb-1">{primaryControlName}</p>
                <p className="text-[12px] text-foreground/80 leading-relaxed">{resolveControlText(core.primary_control_read, core.primary_control)}</p>
                {primaryControlName !== core.primary_control && (
                  <p className="text-[9px] font-mono text-muted-foreground/40 mt-1.5">{core.primary_control}</p>
                )}
              </div>
              {core.registration_control && (
                <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.03] p-4 hover:border-blue-400/30 transition-colors">
                  <div className="flex items-center gap-1.5 mb-2">
                    <KeyRound className="w-3.5 h-3.5 text-blue-300/80" />
                    <span className="text-[11px] font-semibold text-foreground">{term.Singular} control</span>
                  </div>
                  <p className="text-[13px] font-semibold text-foreground mb-1">{registrationControlName ?? core.registration_control}</p>
                  {core.registration_control_read && core.registration_control && (
                    <p className="text-[12px] text-foreground/80 leading-relaxed">{resolveControlText(core.registration_control_read, core.registration_control)}</p>
                  )}
                  {registrationControlName !== core.registration_control && (
                    <p className="text-[9px] font-mono text-muted-foreground/40 mt-1.5">{core.registration_control}</p>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3">
              <CaveatNote text={core.data_caveat} />
            </div>
          </SectionCard>

          {/* Optimization loop — swiper deck (task tray in right panel) */}
          <SectionCard
            title="Optimization loop"
            desc="Account-scoped recommendations. Swipe right to approve → Task Tray. Left to dismiss. Approved tasks appear in the right panel and are never auto-applied."
          >
            {deckCards.length ? (
              <RecommendationDeck scopeId={account.id} cards={deckCards} emptyLabel="All account recommendations reviewed" />
            ) : (
              <PendingState title="No recommendations yet" message="Optimization loop recommendations will appear here once generated." />
            )}
          </SectionCard>
        </div>

        {/* Right: Persistent Task Tray */}
        <div className="w-[264px] shrink-0 border-l border-border/40 flex flex-col min-h-0">
          <TaskTrayPanel scopeId={account.id} cards={deckCards} />
        </div>
      </div>

      <MetricDiagnosticModal
        open={openMetric != null}
        onClose={() => setOpenMetricId(null)}
        metric={openMetric}
        analysis={analysis}
        mst={mst}
        scope="account"
      />
    </div>
  );
}
