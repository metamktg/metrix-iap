// ─── Ad Account Overview ──────────────────────────────────────────────
// Loop-command-chain layout: IAP loop hero → two-column body.
// Left: metric accordions, focus, results, core controls, opt loop.
// Right: persistent Task Tray anchored at all times.

import { TYPE } from "./typography";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ShieldCheck, KeyRound, Grid3x3,
  Zap, ArrowRight,
} from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getAnalysisData, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, SectionCard, SectionInfoIcon, CaveatNote, DetailReveal, deriveLabel,
  UnconfiguredState, PendingState, CrossLink, fmtUSD, fmtNum, eventLabel, resultTerm,
  SkeletonTileRow, LoopChecklist, type LoopChecklistStep,
} from "./shared";
import { useListWorkspaceReports } from "@workspace/api-client-react";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { cn } from "@workspace/command-deck/lib/utils";
import { buildMetricCatalog, metricSourceFromCampaignSummary, metricById } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
import { MetricHoverPopover } from "@/components/metrics/MetricHoverPopover";
import { LoopCommandChain } from "@/components/loop/LoopCommandChain";

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

  // ── Hooks hoisted above early returns (Rules of Hooks) ──────────────
  const isRefetching = useMetrixIsRefetching();
  const { data: reportsData } = useListWorkspaceReports(seed.manager_account.id);
  const cs = account?.iap?.campaign_summary ?? null;
  const metricCatalog = useMemo(
    () => (cs ? buildMetricCatalog(metricSourceFromCampaignSummary(cs)) : []),
    [cs]
  );
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);
  const { selected: selectedMetricIds, toggle, move, reset } = useMetricSelection(availableMetricIds);
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);

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
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ModuleHeader
          section="Ad Account · 01"
          title={account.name}
          subtitle="Set up this account to begin the IAP loop"
        />
        {/* Show the IAP loop blueprint for all accounts — unconfigured accounts
            see every stage locked/pending, giving the same structural frame
            as a configured account and a clear picture of what comes next. */}
        <div className="px-6 py-2 border-b border-border/40 shrink-0">
          <LoopCommandChain accountId={account.id} account={account} managerId={seed.manager_account.id} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <UnconfiguredState account={account} />
        </div>
      </div>
    );
  }

  const core = account.iap.core_reanalysis_read ?? null;

  // core_reanalysis_read is nullable at runtime for freshly-analyzed accounts
  // whose seed hasn't fully populated the module yet — guard before rendering.
  if (!core) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Ad Account · 01" title={account.name} subtitle="Account overview" />
        <PendingState
          title="Analysis data loading"
          message="Core analysis data is being assembled. Refresh in a moment."
          action={<CrossLink to="/app/analysis/overview" label="Go to Analysis" />}
        />
      </div>
    );
  }

  // ── Derived summaries ───────────────────────────────────────────────
  const analysis = getAnalysisData(seed, adAccountId);
  const mst = getMST(seed, adAccountId);

  const events = Object.entries(account.iap.campaign_summary.bottom_line_totals);
  const term = resultTerm(account);

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

  const matrixCellCount = mst?.historical_matrix_4x4?.cells?.length ?? 0;
  // local_book2_library may contain multiple rows per cell_id (aspect
  // variants such as Feed / Square / Story) — count distinct concepts so the
  // number matches the cards shown on the Creative Scan page.
  const libraryCount = new Set(lib.map((c) => c.cell_id)).size;
  const mstActive = mst?.status === "active";

  const recCards = optLoop?.recommendation_cards ?? [];
  const nextAction = [...recCards].sort(
    (a, b) => (IMPACT_RANK[b.impact] ?? 0) - (IMPACT_RANK[a.impact] ?? 0)
  )[0];

  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  // ── Loop-checklist signals (same derivation as LoopCommandChain) ─────
  const iap = account.iap;
  const loopCellCount    = iap.analysis?.performance_by_cell?.length ?? 0;
  const loopPillarCount  = iap.strategy?.message_pillars?.length ?? 0;
  const loopBriefCount   = iap.brief_builder?.draft_briefs?.length ?? 0;
  const loopReportCount  = (reportsData?.reports ?? []).filter((r) => r.ad_account_id === adAccountId).length;

  const loopSteps: LoopChecklistStep[] = [
    { label: "Data connected",       done: true,                    route: "/app/settings/account" },
    { label: "Analysis run",         done: loopCellCount > 0,       route: "/app/analysis/overview" },
    { label: "Strategy generated",   done: loopPillarCount > 0,     route: "/app/strategy/overview" },
    { label: "Briefs generated",     done: loopBriefCount > 0,      route: "/app/briefs/builder" },
    { label: "Report created",       done: loopReportCount > 0,     route: "/app/reports/new" },
  ];
  const allLoopComplete = loopSteps.every((s) => s.done);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ModuleHeader
        section="Ad Account · 01"
        title={account.name}
        subtitle="Command chain · focus · optimization"
        right={<span className="text-label font-mono text-emerald-400/90 uppercase tracking-widest">Connected</span>}
        account={account}
      />

      {/* ── IAP Loop Command Chain ────────────────────────────────────── */}
      <div className="px-6 py-2 border-b border-border/40 shrink-0">
        <LoopCommandChain accountId={account.id} account={account} managerId={seed.manager_account.id} />
      </div>

      {/* ── Two-column body ────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: scrollable main content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-3 space-y-3">

          {/* Account Totals — metric accordions */}
          <SectionCard
            title="Account Totals"
            right={<MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />}
          >
            {isRefetching ? (
              <SkeletonTileRow count={selectedMetricIds.length || 4} />
            ) : null}
            <div className={cn("grid grid-cols-dashboard-4 gap-2", isRefetching && "hidden")}>
              {selectedMetricIds.map((id) => {
                const m = metricById(metricCatalog, id);
                if (!m) return null;
                return (
                  <MetricHoverPopover
                    key={id}
                    metric={m}
                    cellRows={analysis?.performance_by_cell ?? []}
                    onDiagnose={() => setOpenMetricId(id)}
                  >
                    <button
                      onClick={() => setOpenMetricId(id)}
                      className="flex flex-col text-left rounded-lg border px-3 py-2.5 pr-7 transition-all border-border/55 bg-white/[0.04] hover:border-border/70 hover:bg-white/[0.06] w-full"
                    >
                      <span className="text-label font-mono uppercase tracking-widest text-data-caption truncate mb-1">{m.label}</span>
                      <span className="text-stat metric-num leading-none">{m.formatted}</span>
                      {m.sub && <span className="text-label text-muted-foreground/75 mt-1 leading-tight truncate">{m.sub}</span>}
                    </button>
                  </MetricHoverPopover>
                );
              })}
              {selectedMetricIds.length === 0 && (
                <div className="col-span-2 md:col-span-4 text-caption text-muted-foreground/50 border border-dashed border-border/40 rounded-xl px-4 py-5 text-center">
                  No metrics selected — use "Customize" to add tiles.
                </div>
              )}
            </div>
          </SectionCard>

          {/* Current Focus */}
          <SectionCard
            title="Current focus"
            desc="Active sprint · top priority"
            right={<SectionInfoIcon tip="Your active sprint and the top recommended action from the latest analysis." />}
          >
            <div className="grid grid-cols-dashboard-2 gap-3">
              <div className="rounded-xl border border-purple-400/20 bg-purple-400/[0.03] p-4 hover:border-purple-400/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <Grid3x3 className="w-3.5 h-3.5 text-purple-300/80" />
                  <span className="text-caption font-semibold text-foreground">Current sprint</span>
                </div>
                {mstActive ? (
                  <>
                    <p className="text-body text-foreground/80 leading-relaxed">
                      MST active · <span className="font-semibold text-foreground">{matrixCellCount}</span> matrix cells · <span className="font-semibold text-foreground">{libraryCount}</span> library concepts
                    </p>
                    <button onClick={() => navigate("/app/mst")} className="mt-3 inline-flex items-center gap-1.5 text-caption font-semibold text-purple-300 hover:text-purple-200 transition-colors">
                      Open MST <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <p className="text-body text-muted-foreground/80 leading-relaxed">No active sprint — import data to begin.</p>
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-interactive/80" />
                  <span className="text-caption font-semibold text-foreground">Next action</span>
                </div>
                {nextAction ? (
                  <>
                    <DetailReveal
                      label={nextAction.title}
                      labelClassName="text-body font-semibold text-foreground leading-snug"
                      eyebrow="Next action"
                      sections={[{ label: "Recommended action", text: nextAction.recommended_action }]}
                    />
                    <p className="text-label text-muted-foreground/75 mt-2.5">
                      {recCards.length} recommendation{recCards.length === 1 ? "" : "s"} in the loop below ↓
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-start gap-1.5 py-1">
                    <Zap className="w-4 h-4 text-interactive/30" />
                    <p className="text-caption font-semibold text-muted-foreground/60">No actions yet</p>
                    <p className="text-label text-muted-foreground/50 leading-snug">
                      Run an analysis to surface optimisation actions.{" "}
                      <CrossLink to="/app/analysis" label="Go to Analysis" />
                    </p>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Results by event */}
          <SectionCard title="Results by event" desc="Conversion volume by event" right={<SectionInfoIcon tip="Conversion volume split by event type for the selected date window." />}>
            <div className="grid grid-cols-dashboard-4-sm gap-2">
              {events.map(([key, e]) => {
                const isZero = !e.results || e.results === 0;
                return (
                  <div key={key} className={cn("mx-kpi-tile px-3 py-2.5", isZero && "opacity-60")}>
                    <div className="text-label font-semibold text-foreground/90 leading-tight mb-1.5 truncate">{eventLabel(key)}</div>
                    <div className={cn("text-stat metric-num leading-none", isZero && "text-muted-foreground/45")}>{fmtNum(e.results)}</div>
                    <div className="text-label text-muted-foreground mt-2 space-y-0.5">
                      <div>Spend <span className="text-foreground/90 font-medium">{fmtUSD(e.spend)}</span></div>
                      <div>Clicks <span className="text-foreground/60">{fmtNum(e.link_clicks)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Core controls */}
          <SectionCard title="Core controls" desc="Control creative per funnel stage" right={<SectionInfoIcon tip="The benchmark creatives that define performance expectations per funnel stage." />}>
            <div className="grid grid-cols-dashboard-2 gap-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4 hover:border-emerald-400/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
                  <span className="text-caption font-semibold text-foreground">Primary control</span>
                  <SectionInfoIcon tip="The top-performing creative benchmark for this funnel stage." />
                </div>
                <p className="text-title font-semibold text-foreground mb-1">{primaryControlName}</p>
                {(() => {
                  const read = resolveControlText(core.primary_control_read, core.primary_control);
                  return (
                    <DetailReveal
                      label={deriveLabel(read, 72)}
                      labelClassName="text-body text-foreground/80 leading-relaxed"
                      eyebrow="Primary control"
                      sections={[{ label: "Control read", text: read }]}
                    />
                  );
                })()}
                {primaryControlName !== core.primary_control && (
                  <p className="text-label font-mono text-muted-foreground/40 mt-1.5">
                    <span className="text-label text-muted-foreground/30 not-italic">Code · </span>{core.primary_control}
                  </p>
                )}
              </div>
              {core.registration_control && (
                <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.03] p-4 hover:border-blue-400/30 transition-colors">
                  <div className="flex items-center gap-1.5 mb-2">
                    <KeyRound className="w-3.5 h-3.5 text-[#62e6ff]/80" />
                    <span className="text-caption font-semibold text-foreground">{term.Singular} control</span>
                    <SectionInfoIcon tip={`The control creative for the ${term.Singular} conversion stage.`} />
                  </div>
                  <p className="text-title font-semibold text-foreground mb-1">{registrationControlName ?? core.registration_control}</p>
                  {core.registration_control_read && core.registration_control && (() => {
                    const read = resolveControlText(core.registration_control_read, core.registration_control);
                    return (
                      <DetailReveal
                        label={deriveLabel(read, 72)}
                        labelClassName="text-body text-foreground/80 leading-relaxed"
                        eyebrow={`${term.Singular} control`}
                        sections={[{ label: "Control read", text: read }]}
                      />
                    );
                  })()}
                  {registrationControlName !== core.registration_control && (
                    <p className="text-label font-mono text-muted-foreground/40 mt-1.5">
                      <span className="text-label text-muted-foreground/30 not-italic">Code · </span>{core.registration_control}
                    </p>
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
            right={<SectionInfoIcon tip="AI-generated recommendations to approve or dismiss — never applied automatically." />}
          >
            {deckCards.length ? (
              <RecommendationDeck scopeId={account.id} cards={deckCards} emptyLabel="All account recommendations reviewed" />
            ) : (
              <PendingState
                title="No recommendations yet"
                message="Optimization loop recommendations will appear here once generated."
                action={<CrossLink to="/app/listen/recommendations" label="View Recommendations" />}
              />
            )}
          </SectionCard>
        </div>

        {/* Right: loop-progress checklist — always visible; hides label once all steps complete */}
        <div className="w-52 shrink-0 border-l border-border/30 overflow-y-auto py-3 px-3 space-y-2">
          {!allLoopComplete && (
            <p className={cn(TYPE.label, "text-muted-foreground/40 uppercase tracking-widest px-1 mb-1")}>Loop stages</p>
          )}
          <LoopChecklist steps={loopSteps} allComplete={allLoopComplete} />
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
