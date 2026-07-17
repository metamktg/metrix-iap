// ─── Ad Account Overview ──────────────────────────────────────────────
// Layer-status-first layout: status hero → two-column body.
// Left: metric accordions, focus, results, core controls, opt loop.
// Right: persistent Task Tray anchored at all times.

import { TYPE } from "./typography";
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
  ModuleHeader, SectionCard, CaveatNote, DetailReveal, deriveLabel,
  UnconfiguredState, PendingState, fmtUSD, fmtNum, eventLabel, resultTerm,
} from "./shared";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { cn } from "@/lib/utils";
import { buildMetricCatalog, metricSourceFromCampaignSummary, metricById } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
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

  const core = account.iap.core_reanalysis_read ?? null;
  const cs = account.iap.campaign_summary;
  const events = Object.entries(cs.bottom_line_totals);
  const term = resultTerm(account);

  // core_reanalysis_read is nullable at runtime for freshly-analyzed accounts
  // whose seed hasn't fully populated the module yet — guard before rendering.
  if (!core) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Ad Account · 01" title={account.name} subtitle="Account overview" />
        <PendingState
          title="Analysis data loading"
          message="Core analysis data is being assembled. Refresh in a moment."
        />
      </div>
    );
  }

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
  // local_book2_library may contain multiple rows per cell_id (aspect
  // variants such as Feed / Square / Story) — count distinct concepts so the
  // number matches the cards shown on the Creative Scan page.
  const libraryCount = new Set(lib.map((c) => c.cell_id)).size;
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
  const [layerOpen, setLayerOpen] = useState(true);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  // ── Layer readiness ─────────────────────────────────────────────────
  type Layer = { name: string; count: number; unit: string; ready: boolean; to: string; Icon: React.ComponentType<{ className?: string }> };
  const layers: Layer[] = [
    { name: "Listen",         count: signals.length,              unit: signals.length === 1 ? "signal" : "signals",  ready: signals.length > 0,                       to: "/app/listen/signal",        Icon: Radio },
    { name: "Analysis",       count: cellCount + variableCount,   unit: "items",                                       ready: (cellCount + variableCount) > 0,           to: "/app/analysis/library",     Icon: BarChart3 },
    { name: "Strategy",       count: pillarCount + hypothesisCount, unit: "items",                                     ready: (pillarCount + hypothesisCount) > 0,       to: "/app/strategy/hypotheses",  Icon: Layers },
    { name: "Reports",        count: sectionCount,                unit: sectionCount === 1 ? "section" : "sections",  ready: sectionCount > 0,                          to: "/app/report-builder",       Icon: FileText },
    { name: "MST",            count: matrixCellCount,             unit: "cells",                                       ready: mstActive && matrixCellCount > 0,          to: "/app/mst",                  Icon: Grid3x3 },
  ];

  const readyCount = layers.filter((l) => l.ready).length;
  const allReady = readyCount === layers.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ModuleHeader
        section="Ad Account · 01"
        title={account.name}
        subtitle="Layer readiness · account focus · optimization loop"
        right={<span className="text-[10px] font-mono text-emerald-400/70 uppercase tracking-widest">Connected</span>}
        account={account}
      />

      {/* ── Layer Status ─────────────────────────────────────────────── */}
      <div className="border-b border-border/40 shrink-0">
        {/* Header row — always visible */}
        <div className="flex items-center gap-2.5 px-6 py-2">
          <h2 className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Layer Status</h2>
          <span className={cn(
            "text-[8px] font-bold uppercase tracking-widest border px-1.5 py-0.5 rounded-full leading-none",
            allReady
              ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
              : "text-amber-300/80 border-amber-400/30 bg-amber-400/[0.07]"
          )}>
            {readyCount}/{layers.length} ready
          </span>
          <div className="ml-auto flex items-center gap-3">
            {/* Collapsed icon strip — shown only when collapsed */}
            {!layerOpen && (
              <div className="flex items-center gap-1">
                {layers.map((l) => (
                  <button
                    key={l.name}
                    onClick={() => navigate(l.to)}
                    title={`${l.name} · ${l.ready ? "Ready" : "Pending"}`}
                    className={cn(
                      "w-6 h-6 flex items-center justify-center rounded-lg border transition-all",
                      l.ready
                        ? "border-emerald-400/35 bg-emerald-400/[0.08] text-emerald-400/80 hover:text-emerald-400 hover:border-emerald-400/55"
                        : "border-border/30 bg-white/[0.02] text-muted-foreground/30 hover:text-muted-foreground/60 hover:border-border/50"
                    )}
                  >
                    <l.Icon className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
            {!layerOpen && <span className="text-[9px] text-muted-foreground/35">Click any to navigate</span>}
            <button
              onClick={() => setLayerOpen(!layerOpen)}
              aria-label={layerOpen ? "Collapse layer status" : "Expand layer status"}
              className="flex items-center gap-1 text-muted-foreground/35 hover:text-muted-foreground/70 transition-colors"
            >
              <ChevronDown className={cn("w-3 h-3 transition-transform", !layerOpen && "-rotate-90")} />
            </button>
          </div>
        </div>

        {/* Expanded cards */}
        {layerOpen && (
          <div className="px-6 pb-3 grid grid-cols-dashboard-5 gap-1.5">
            {layers.map((l) => (
              <button
                key={l.name}
                onClick={() => navigate(l.to)}
                className={cn(
                  "group relative flex flex-col gap-1.5 px-2.5 py-2.5 rounded-lg border text-left transition-all",
                  "hover:-translate-y-px hover:shadow-lg active:translate-y-0",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
                  l.ready
                    ? "border-emerald-400/30 bg-gradient-to-br from-emerald-400/[0.07] to-emerald-400/[0.02] hover:border-emerald-400/55 hover:from-emerald-400/[0.10] shadow-emerald-400/5"
                    : "border-border/35 bg-white/[0.015] hover:border-border/55 hover:bg-white/[0.04]"
                )}
              >
                {/* Icon + badge */}
                <div className="flex items-center justify-between gap-1">
                  <l.Icon className={cn(
                    "w-3 h-3 transition-colors",
                    l.ready ? "text-emerald-400/75 group-hover:text-emerald-400" : "text-muted-foreground/35"
                  )} />
                  <span className={cn(
                    "text-[8px] font-bold uppercase tracking-wide border px-1 py-px rounded leading-none",
                    l.ready
                      ? "text-emerald-300 border-emerald-400/35 bg-emerald-400/12"
                      : "text-amber-300/65 border-amber-400/22 bg-amber-400/[0.07]"
                  )}>
                    {l.ready ? "Ready" : "Pending"}
                  </span>
                </div>
                {/* Name + count */}
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-foreground leading-tight truncate">{l.name}</div>
                  <div className="text-[9px] text-muted-foreground/55 mt-0.5 tabular-nums">
                    <span className="font-semibold text-foreground/60">{l.count}</span>{" "}{l.unit}
                  </div>
                </div>
                <ChevronRight className={cn(
                  "absolute right-2 bottom-2.5 w-2.5 h-2.5 transition-all",
                  "text-muted-foreground/15 group-hover:text-foreground/50 group-hover:translate-x-0.5"
                )} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Two-column body ────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: scrollable main content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-3 space-y-3">

          {/* Account Totals — metric accordions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/55">Account Totals</h2>
              <MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />
            </div>
            <div className="grid grid-cols-dashboard-4 gap-2">
              {selectedMetricIds.map((id) => {
                const m = metricById(metricCatalog, id);
                if (!m) return null;
                const isExpanded = expandedMetricId === id;
                return (
                  <div key={id} className="flex flex-col">
                    <button
                      onClick={() => setExpandedMetricId(isExpanded ? null : id)}
                      className={cn(
                        "group flex flex-col text-left rounded-lg border px-3 py-2.5 transition-all",
                        isExpanded
                          ? "border-primary/35 bg-primary/[0.08] rounded-b-none border-b-primary/15 shadow-sm shadow-primary/10"
                          : "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/55 truncate">{m.label}</span>
                        <ChevronDown className={cn(
                          "w-3 h-3 text-muted-foreground/30 transition-transform shrink-0",
                          isExpanded && "rotate-180 text-primary/60"
                        )} />
                      </div>
                      <span className="text-[16px] font-bold text-foreground tabular-nums leading-none">{m.formatted}</span>
                      {m.sub && <span className="text-[9px] text-muted-foreground/50 mt-1 leading-tight truncate">{m.sub}</span>}
                    </button>
                    {isExpanded && (
                      <div className="rounded-b-xl border border-t-0 border-primary/30 bg-primary/[0.04] px-4 py-3 space-y-2.5">
                        <p className={TYPE.caption}>
                          <span className="font-semibold text-foreground/80">{m.label}</span> for the current analysis window.
                          {m.sub && <> Covers {m.sub.toLowerCase()}.</>}
                        </p>
                        <button
                          onClick={() => { setOpenMetricId(id); setExpandedMetricId(null); }}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
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
            desc="Active sprint · top priority"
          >
            <div className="grid grid-cols-dashboard-2 gap-3">
              <div className="rounded-xl border border-purple-400/20 bg-purple-400/[0.03] p-4 hover:border-purple-400/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <Grid3x3 className="w-3.5 h-3.5 text-purple-300/80" />
                  <span className="text-[11px] font-semibold text-foreground">Current sprint</span>
                </div>
                {mstActive ? (
                  <>
                    <p className="text-[12px] text-foreground/80 leading-relaxed">
                      MST active · <span className="font-semibold text-foreground">{matrixCellCount}</span> matrix cells · <span className="font-semibold text-foreground">{libraryCount}</span> library concepts
                    </p>
                    <button onClick={() => navigate("/app/mst")} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-300 hover:text-purple-200 transition-colors">
                      Open MST <ArrowRight className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground/60 leading-relaxed">No active sprint — import data to begin.</p>
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-primary/80" />
                  <span className="text-[11px] font-semibold text-foreground">Next action</span>
                </div>
                {nextAction ? (
                  <>
                    <DetailReveal
                      label={nextAction.title}
                      labelClassName="text-[12px] font-semibold text-foreground leading-snug"
                      eyebrow="Next action"
                      sections={[{ label: "Recommended action", text: nextAction.recommended_action }]}
                    />
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
          <SectionCard title="Results by event" desc="Conversion volume by event">
            <div className="grid grid-cols-dashboard-4-sm gap-2">
              {events.map(([key, e]) => (
                <div key={key} className="rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-foreground/70 leading-tight mb-1.5 truncate">{eventLabel(key)}</div>
                  <div className="text-[18px] font-bold text-foreground tabular-nums leading-none">{fmtNum(e.results)}</div>
                  <div className="text-[10px] text-muted-foreground/65 mt-2 space-y-0.5">
                    <div>Spend <span className="text-foreground/70 font-medium">{fmtUSD(e.spend)}</span></div>
                    <div>Clicks <span className="text-foreground/70 font-medium">{fmtNum(e.link_clicks)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Core controls */}
          <SectionCard title="Core controls" desc="Control creative per funnel stage" table="core_reanalysis_read">
            <div className="grid grid-cols-dashboard-2 gap-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4 hover:border-emerald-400/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
                  <span className="text-[11px] font-semibold text-foreground">Primary control</span>
                </div>
                <p className="text-[13px] font-semibold text-foreground mb-1">{primaryControlName}</p>
                {(() => {
                  const read = resolveControlText(core.primary_control_read, core.primary_control);
                  return (
                    <DetailReveal
                      label={deriveLabel(read, 72)}
                      labelClassName="text-[12px] text-foreground/80 leading-relaxed"
                      eyebrow="Primary control"
                      sections={[{ label: "Control read", text: read }]}
                    />
                  );
                })()}
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
                  {core.registration_control_read && core.registration_control && (() => {
                    const read = resolveControlText(core.registration_control_read, core.registration_control);
                    return (
                      <DetailReveal
                        label={deriveLabel(read, 72)}
                        labelClassName="text-[12px] text-foreground/80 leading-relaxed"
                        eyebrow={`${term.Singular} control`}
                        sections={[{ label: "Control read", text: read }]}
                      />
                    );
                  })()}
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
            desc="Approve to Task Tray or dismiss · never auto-applied"
          >
            {deckCards.length ? (
              <RecommendationDeck scopeId={account.id} cards={deckCards} emptyLabel="All account recommendations reviewed" />
            ) : (
              <PendingState title="No recommendations yet" message="Optimization loop recommendations will appear here once generated." />
            )}
          </SectionCard>
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
