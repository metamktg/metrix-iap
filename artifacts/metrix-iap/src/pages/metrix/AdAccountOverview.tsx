// ─── Ad Account Overview ──────────────────────────────────────────────
// Loop-command-chain layout: IAP loop hero → two-column body.
// Left: metric accordions, focus, results, core controls, opt loop.
// Right: persistent Task Tray anchored at all times.

import { TYPE } from "./typography";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ShieldCheck, KeyRound, Grid3x3,
  ArrowRight,
} from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getAnalysisData, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import { NextBestActionCard } from "@/components/deck/NextBestActionCard";
import {
  ModuleHeader, SectionCard, SectionInfoIcon, CaveatNote, DetailReveal, deriveLabel,
  UnconfiguredState, PendingState, CrossLink, fmtUSD, fmtNum, eventLabel, resultTerm,
  SkeletonTileRow,
  OverviewHeaderControls, type ViewPreset,
} from "./shared";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { cn } from "@workspace/command-deck/lib/utils";
import { buildMetricCatalog, metricSourceFromCampaignSummary, metricSourceFromApiTotals, metricById } from "@/lib/data/metricsCatalog";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { trendForMetric, sparkSeriesForMetric, sparkPoints } from "@/lib/data/summaryTrends";
import { useKpiTileMetrics } from "@/hooks/useKpiTileMetrics";
import { KpiTile } from "@/components/metrics/KpiTile";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import { MetricHoverPopover } from "@/components/metrics/MetricHoverPopover";
import { LoopCommandChain } from "@/components/loop/LoopCommandChain";

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
  const cs = account?.iap?.campaign_summary ?? null;

  // Nocturne trend layer: the date-preset pills window the tiles through
  // the analysis-summary endpoint (real per-day rows + real prior-window
  // totals). "all" keeps the seed's full-flight campaign summary; a preset
  // switches BOTH the tile values and their deltas/sparklines to the same
  // window so the pairing can never disagree.
  const [preset, setPreset] = useState<ViewPreset>("all");
  // "vs prior" / "Summary·Detailed" — the page-header cluster's real,
  // visible effects: compareOn shows/hides each tile's already-computed
  // trend-vs-prior line, detailOn expands the two control-read popovers
  // below by default. Both start on, matching current default behavior.
  const [compareOn, setCompareOn] = useState(true);
  const [detailOn, setDetailOn] = useState(false);
  const { data: summary, isFetching: summaryFetching } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", preset),
    enabled: !!adAccountId && account?.status === "configured",
  });
  const windowedTotals = preset !== "all" && summary ? summary.totals : null;
  const metricCatalog = useMemo(
    () => {
      if (windowedTotals) return buildMetricCatalog(metricSourceFromApiTotals(windowedTotals));
      return cs ? buildMetricCatalog(metricSourceFromCampaignSummary(cs)) : [];
    },
    [cs, windowedTotals]
  );

  // Format a raw prior value in the metric's own display format.
  const formatLikeMetric = (metricId: string, v: number): string => {
    if (metricId === "spend" || metricId === "cpa_blended" || metricId === "cpc" || metricId === "cpm") return fmtUSD(v);
    if (metricId === "link_ctr" || metricId === "cvr") return `${v.toFixed(2)}%`;
    return fmtNum(Math.round(v));
  };

  // Per-metric trend + sparkline, from the same summary window as the values.
  // "vs prior" off hides the trend/prior line entirely — the sparkline (not
  // a prior-period comparison) still renders either way.
  const tileTrendFor = (metricId: string) => {
    if (!summary) return { trend: null, spark: null };
    const series = sparkSeriesForMetric(metricId, summary.daily ?? []);
    if (!compareOn) return { trend: null, spark: series ? sparkPoints(series) : null };
    const t = trendForMetric(metricId, summary.totals, summary.prior_totals);
    return {
      trend: t
        ? { deltaPct: t.deltaPct, improved: t.improved, priorFormatted: formatLikeMetric(metricId, t.prior) }
        : null,
      spark: series ? sparkPoints(series) : null,
    };
  };
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);
  // Nocturne hero KPI row: a fixed 4-tile grid (Alex's product decision),
  // each slot independently metric-selectable via its own dropdown — not
  // the old variable-length "add/remove tiles" picker.
  const { tileMetricIds, setTileMetric } = useKpiTileMetrics("account-overview", availableMetricIds, { tileCount: 4 });
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
          action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
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
    // Global replacement via split/join — a plain `.replace(id, name)` only
    // swaps the first match, so a cell id mentioned twice in the same
    // generated sentence would leave the raw code showing the second time.
    // split/join sidesteps building a regex from a string that could
    // theoretically contain regex-special characters.
    return text.split(id).join(name);
  };
  const primaryControlName = resolveConceptName(core.primary_control);
  const registrationControlName = core.registration_control ? resolveConceptName(core.registration_control) : null;

  const matrixCellCount = mst?.historical_matrix_4x4?.cells?.length ?? 0;
  // local_book2_library may contain multiple rows per cell_id (aspect
  // variants such as Feed / Square / Story) — count distinct concepts so the
  // number matches the cards shown on the Creative Scan page.
  const libraryCount = new Set(lib.map((c) => c.cell_id)).size;
  const mstActive = mst?.status === "active";

  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ModuleHeader
        section="Account Overview · 01"
        title={`${account.name} · Account Overview`}
        subtitle="Command chain · focus · optimization"
        right={
          <OverviewHeaderControls
            preset={preset}
            onPresetChange={setPreset}
            isFetching={summaryFetching}
            availableWindow={summary?.available_window}
            compareOn={compareOn}
            onToggleCompare={() => setCompareOn((v) => !v)}
            detailOn={detailOn}
            onToggleDetail={() => setDetailOn((v) => !v)}
            exportTo="/app/exports/analysis"
          />
        }
      />

      {/* ── IAP Loop Command Chain ────────────────────────────────────── */}
      <div className="px-6 py-2 border-b border-border/40 shrink-0">
        <LoopCommandChain accountId={account.id} account={account} managerId={seed.manager_account.id} />
      </div>

      {/* ── Main body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Scrollable main content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-3 space-y-3">

          {/* Next best action — Nocturne hero for the top pending
              recommendation; renders nothing when none are pending. */}
          <NextBestActionCard scopeId={account.id} cards={deckCards} />

          {/* Account Totals — fixed 4-tile Nocturne hero row, each tile
              independently metric-selectable via its own dropdown. */}
          <SectionCard title="Account Totals">
            {(isRefetching || (preset !== "all" && summaryFetching)) ? (
              <SkeletonTileRow count={4} />
            ) : null}
            <div className={cn("grid grid-cols-dashboard-4 gap-2", (isRefetching || (preset !== "all" && summaryFetching)) && "hidden")}>
              {tileMetricIds.map((id, slotIdx) => {
                const m = metricById(metricCatalog, id);
                if (!m) return null;
                return (
                  <MetricHoverPopover
                    key={slotIdx}
                    metric={m}
                    cellRows={analysis?.performance_by_cell ?? []}
                    onDiagnose={() => setOpenMetricId(id)}
                  >
                    {(() => {
                      const { trend, spark } = tileTrendFor(id);
                      return (
                        <KpiTile
                          metricId={id}
                          catalog={metricCatalog}
                          onSelect={(newId) => setTileMetric(slotIdx, newId)}
                          onClick={() => setOpenMetricId(id)}
                          hideInfo
                          trend={trend}
                          sparkPoints={spark}
                        />
                      );
                    })()}
                  </MetricHoverPopover>
                );
              })}
            </div>
          </SectionCard>

          {/* Current sprint — MST status has no canvas equivalent on this
              screen, so it stays as its own compact card. The "next
              action" half that used to sit beside it read the exact same
              optimization_loop.recommendation_cards as NextBestActionCard
              above and has been removed as a duplicate surface. Kept
              visually quiet (small pad, muted border/bg, lighter type) so
              it doesn't compete with the KPI tiles / Results-by-event
              flow around it — the real MST data is unchanged. */}
          {mstActive && (
            <SectionCard
              title="Current sprint"
              desc="MST status"
              right={<SectionInfoIcon tip="Whether a Matrix Sprint Test is active for this account, and how many matrix cells and library concepts it covers." />}
            >
              <div className="rounded-lg border border-border/30 bg-foreground/[0.015] p-2.5 hover:border-border/50 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <Grid3x3 className="w-3 h-3 text-interactive/75" />
                  <span className="text-caption font-medium text-foreground/75">MST active</span>
                </div>
                <p className="text-caption text-muted-foreground/75 leading-relaxed">
                  <span className="font-medium text-foreground/75">{matrixCellCount}</span> matrix cells · <span className="font-medium text-foreground/75">{libraryCount}</span> library concepts
                </p>
                <button onClick={() => navigate("/app/mst")} className="pressable mt-2 inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-interactive transition-colors">
                  Open MST <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </SectionCard>
          )}

          {/* Results by event — Nocturne canvas table */}
          <SectionCard title="Results by event" desc="Conversion volume by event" right={<SectionInfoIcon tip="Conversion volume split by event type for the selected date window." />}>
            <div className="overflow-x-auto">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th className="text-right">Results</th>
                    <th className="text-right">Spend</th>
                    <th className="text-right">Cost / result</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(([key, e]) => {
                    const isZero = !e.results || e.results === 0;
                    const cpa = e.results > 0 ? e.spend / e.results : null;
                    return (
                      <tr key={key} className={cn(isZero && "opacity-40")}>
                        <td><span className="font-medium text-foreground/90">{eventLabel(key)}</span></td>
                        <td className="text-right tabular-nums text-foreground/85">{fmtNum(e.results)}</td>
                        <td className="text-right tabular-nums text-muted-foreground/75">{fmtUSD(e.spend, 0)}</td>
                        <td className={cn("text-right tabular-nums", cpa != null ? "text-foreground/80" : "text-muted-foreground/75")}>
                          {cpa != null ? fmtUSD(cpa) : "n/a"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Core controls */}
          <SectionCard title="Core controls" desc="Control creative per funnel stage" right={<SectionInfoIcon tip="The benchmark creatives that define performance expectations per funnel stage." />}>
            <div className="grid grid-cols-dashboard-2 gap-3">
              <div className="rounded-xl border border-status-success/20 bg-status-success/[0.03] p-4 hover:border-status-success/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-status-success/80" />
                  <span className="text-caption font-semibold text-foreground">Primary control</span>
                  <SectionInfoIcon tip="The top-performing creative benchmark for this funnel stage." />
                </div>
                <p className="text-title font-bold text-foreground mb-1">{primaryControlName}</p>
                {(() => {
                  const read = resolveControlText(core.primary_control_read, core.primary_control);
                  return (
                    <DetailReveal
                      key={String(detailOn)}
                      label={deriveLabel(read, 72)}
                      labelClassName="text-body text-foreground/80 leading-relaxed"
                      eyebrow="Primary control"
                      sections={[{ label: "Control read", text: read }]}
                      defaultOpen={detailOn}
                    />
                  );
                })()}
                {primaryControlName !== core.primary_control && (
                  <p className="text-label font-mono text-muted-foreground/75 mt-1.5">
                    <span className="text-label text-muted-foreground/75 not-italic">Code · </span>{core.primary_control}
                  </p>
                )}
              </div>
              {core.registration_control && (
                <div className="rounded-xl border border-primary/20 bg-chart-1/[0.03] p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-1.5 mb-2">
                    <KeyRound className="w-3.5 h-3.5 text-accent/80" />
                    <span className="text-caption font-semibold text-foreground">{term.Singular} control</span>
                    <SectionInfoIcon tip={`The control creative for the ${term.Singular} conversion stage.`} />
                  </div>
                  <p className="text-title font-bold text-foreground mb-1">{registrationControlName ?? core.registration_control}</p>
                  {core.registration_control_read && core.registration_control && (() => {
                    const read = resolveControlText(core.registration_control_read, core.registration_control);
                    return (
                      <DetailReveal
                        key={String(detailOn)}
                        label={deriveLabel(read, 72)}
                        labelClassName="text-body text-foreground/80 leading-relaxed"
                        eyebrow={`${term.Singular} control`}
                        sections={[{ label: "Control read", text: read }]}
                        defaultOpen={detailOn}
                      />
                    );
                  })()}
                  {registrationControlName !== core.registration_control && (
                    <p className="text-label font-mono text-muted-foreground/75 mt-1.5">
                      <span className="text-label text-muted-foreground/75 not-italic">Code · </span>{core.registration_control}
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
            right={
              <>
                <CrossLink to="/app/act/queue" label="Open full queue" />
                <SectionInfoIcon tip="AI-generated recommendations to approve or dismiss — never applied automatically." />
              </>
            }
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
      </div>

      <KpiDrilldownModal
        open={openMetric != null}
        onClose={() => setOpenMetricId(null)}
        scope="account"
        metricId={openMetricId}
        catalog={metricCatalog}
        analysis={analysis}
        windowLabel={cs?.window_start && cs?.window_end ? `${cs.window_start} → ${cs.window_end} (full flight)` : "full flight window"}
      />
    </div>
  );
}
