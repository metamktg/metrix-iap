// ─── Variable drill-down modal ────────────────────────────────────────
// Opened from DNA family cards, "best read" chips, and variable table
// rows. Shows, for one creative variable: header KPIs from the import's
// own variable-level rows, the top ads carrying it (creative cells when
// the run joined cells, otherwise the ads the evidence layer links by Ad
// ID and name), per-segment performance from the most specific real
// source (cell grain, the run's variable × segment rows, or the carrier
// ads' ad-grain demographic rows — tappable → segment drill-down), the
// carrier ads' placement rows, and the copy variants that ran with it.
// The relationship is shown, never upgraded: ad-name tokens and
// deconstructed variables are contextual evidence on the ad.

import { ResultScopeTag } from "@/components/analysis/ResultScopeBar";
import type { ResultScope } from "@/lib/result-scope";
import { classifyResultEvent } from "@/lib/resultEvents";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import { ChevronRight, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@workspace/command-deck/lib/utils";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getMST, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import { cardFromAd, cardFromCell } from "@/lib/creative-assembly";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { DIALOG, TYPE } from "@/pages/metrix/typography";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import { computeVariableDrilldown, type VariableSegmentRollup } from "@/lib/variable-drilldown";
import { segmentLabel, type SegmentId, type SegmentSignal } from "@/lib/segment-analytics";
import { familyLabel } from "@/pages/metrix/strategy/strategyShared";
import { readableVariables, fmtUSD, eventLabel } from "@/pages/metrix/shared";
import type { AnalysisData, VariablePerformanceRow } from "@/lib/data/seedTypes";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { KpiTileRow } from "@/components/metrics/KpiTile";
import { buildVariableMetricCatalog } from "@/lib/data/metricsCatalog";
import { EvidenceChip, EvidenceExplainer } from "@/components/evidence/EvidenceChip";
import { SignalTag } from "@/components/evidence/SignalTag";
import { PlacementDrill } from "@/components/evidence/PlacementDrill";

/** A segment row's documented band as a signal: high is emphasised, an ordinary read is silent. */
function bandSignal(row: VariableSegmentRollup): SegmentSignal {
  const state = row.band === "high" ? "high" : row.band === "medium" ? "ok" : "low";
  return {
    state,
    low: state === "low",
    band: row.band,
    reasons: state === "low" ? [row.band === "insufficient" ? "Under the documented floor ($50 spend or 10 impressions)." : "Under the documented medium band (10 results or $100 spend)."] : [],
    coverage: null,
  };
}

/** What a variable is judged on first: what it cost, what it returned, per result, across how many ads. */
const VARIABLE_TILE_DEFAULTS = ["spend", "results", "cpa", "unique_ads"];
/** An awareness variable is never judged on cost per result: spend, the event's own count, the clicks it drew, the ads. */
const AWARENESS_TILE_DEFAULTS = ["spend", "results", "link_clicks", "unique_ads"];

/** The scale a set of result types is judged on when the page passed no scope: communication only when EVERY type is awareness. */
function scaleOfTypes(types: readonly string[]): "communication" | "cost_per_result" | null {
  if (types.length === 0) return null;
  const scales = new Set(types.map((t) => classifyResultEvent(t).scale));
  if (scales.size === 1 && scales.has("communication")) return "communication";
  return scales.has("cost_per_result") ? "cost_per_result" : null;
}

const SEGMENT_SOURCE_LABEL = {
  cells: "scoped to this variable's cells",
  variable_rows: "the run's variable × segment rows",
  ad_breakdowns: "the carrier ads' own demographic rows",
} as const;

export function VariableDrilldownModal({
  open,
  onClose,
  code,
  analysis,
  /** Metric-filtered v3 rows so header totals match the page selection. */
  variableRows,
  selectedResultTypes,
  resultScope,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  code: string | null;
  analysis: AnalysisData;
  /** Metric-filtered v3 rows so header totals match the page selection. */
  variableRows: VariablePerformanceRow[];
  /** The page's result-type selection — scopes cell/segment sections too. */
  selectedResultTypes?: string[] | null;
  /** The page's result scope, for the scale the header tiles are judged on (communication hides cost per result). */
  resultScope?: ResultScope | null;
  /** If set, a ← Back button appears in the modal header. */
  onBack?: () => void;
}) {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const [, navigate] = useLocation();
  const mst = getMST(seed, adAccountId);
  const account = getAdAccount(seed, adAccountId);
  const [segment, setSegment] = useState<SegmentId | null>(null);

  const data = useMemo(
    () =>
      code
        ? computeVariableDrilldown(code, {
            analysis,
            mst,
            variableRows,
            selectedResultTypes,
            ads: account?.ads ?? null,
            variableEvidence: account?.variable_evidence ?? null,
            breakdownRows: analysis.ad_breakdowns ?? null,
            segmentRows: analysis.variable_segment_performance ?? null,
          })
        : null,
    [code, analysis, mst, variableRows, selectedResultTypes, account],
  );

  const cardCtx = useMemo(
    () => ({ perfRows: analysis.performance_by_cell, mst, ...getCreativeLinkContext(seed, adAccountId) }),
    [analysis, mst, seed, adAccountId]
  );

  const scale = resultScope?.scale ?? (data?.totals ? scaleOfTypes(data.totals.resultTypes) : null);
  const catalog = useMemo(
    () => (data?.totals ? buildVariableMetricCatalog({ ...data.totals, scale }) : []),
    [data, scale],
  );
  const tileDefaults = scale === "communication" ? AWARENESS_TILE_DEFAULTS : VARIABLE_TILE_DEFAULTS;

  if (!code || !data) return null;

  const topCells = data.rankedCells.slice(0, 3);
  const topAds = topCells.length === 0 ? data.carrierAds.slice(0, 3) : [];
  const carrierCount = data.rankedCells.length > 0 ? data.rankedCells.length : data.carrierAds.length;
  const maxSegSpend = Math.max(...data.segments.rows.map((s) => s.totals.spend ?? 0), 0);
  const contextual = data.attribution !== "direct_asset";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl bg-surface-deep border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left space-y-1">
            {onBack && (
              <button
                onClick={onBack}
                className="pressable inline-flex items-center gap-1 text-label text-muted-foreground/75 hover:text-foreground transition-colors mb-0.5 -ml-0.5 group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back
              </button>
            )}
            <div className="text-label text-muted-foreground/75 uppercase tracking-widest">
              Variable drill-down{data.family ? ` · ${familyLabel(data.family)}` : ""}
            </div>
            <DialogTitle className={cn(DIALOG.title, "flex items-center gap-2 flex-wrap")} data-testid="title-variable-drilldown">
              {readableVariables(code)}
              <span className="text-caption font-normal text-muted-foreground/75 border border-border/30 px-1.5 py-0.5 rounded">{code}</span>
              {resultScope && <ResultScopeTag scope={resultScope} />}
              {data.evidenceState && <EvidenceChip state={data.evidenceState} testId="variable-evidence-chip" />}
            </DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground/75 leading-relaxed">
              Header totals are the import's own variable-level rows. Ads and segments join through the ads that carry this
              variable, Ad ID first — nothing estimated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ── Header KPIs: the platform's configurable tile row over this variable's own totals ── */}
            {catalog.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" data-testid="variable-kpi-tiles">
                <KpiTileRow viewKey={scale === "communication" ? "variable-drilldown:awareness" : "variable-drilldown"} catalog={catalog} tileCount={4} primaryFirst={false} defaults={tileDefaults} />
              </div>
            ) : (
              <p className={cn(TYPE.caption, "text-muted-foreground/75 leading-relaxed")}>
                No variable-level performance row for this code in the current metric selection — the sections below still
                show which creatives carried it.
              </p>
            )}

            {/* ── Top ads carrying this variable ── */}
            <div className="space-y-1.5">
              <p className="text-label uppercase tracking-widest text-muted-foreground/75">
                Top ads carrying this variable
              </p>
              {topCells.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {topCells.map((c) => (
                    <CreativeCard
                      key={c.cellId}
                      data={{
                        ...cardFromCell(c.cellId, cardCtx),
                        stats: {
                          spend: c.spend,
                          results: c.results,
                          cpa: c.cpa,
                          ctrPct: c.ctrPct,
                          resultLabel: "selected events",
                        },
                      }}
                    />
                  ))}
                </div>
              ) : topAds.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="variable-carrier-ads">
                  {topAds.map((a) => (
                    <CreativeCard
                      key={a.adIds[0] ?? a.adName}
                      data={{
                        ...cardFromAd(a.ad, { fallbackCode: code, metaAdAccountId: cardCtx.metaAdAccountId }),
                        stats: {
                          spend: a.spend,
                          results: a.results,
                          cpa: a.cpa,
                          ctrPct: a.ctrPct,
                          resultLabel: a.resultType ? eventLabel(a.resultType) : "results",
                        },
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className={cn(TYPE.caption, "text-muted-foreground/75")} data-testid="variable-no-carriers">
                  {data.segments.unavailableReason ?? "No ad in this run carries this variable."}
                </p>
              )}
              {carrierCount > 3 && (
                <p className={cn(TYPE.caption, "text-muted-foreground/75")}>
                  Top 3 of {carrierCount} carrier {topCells.length > 0 ? "cells" : "ads"}, ranked by results.
                </p>
              )}
            </div>

            {/* ── Segment performance ── */}
            <div className="space-y-1.5">
              <p className="text-label uppercase tracking-widest text-muted-foreground/75">
                Segment performance{data.segments.source ? ` — ${SEGMENT_SOURCE_LABEL[data.segments.source]}` : ""}
              </p>
              {data.segments.available ? (
                <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20" data-testid="variable-segments">
                  {data.segments.rows.map((row) => {
                    const { segment: seg, totals, derived } = row;
                    const share = maxSegSpend > 0 && totals.spend != null ? totals.spend / maxSegSpend : 0;
                    return (
                      <button
                        key={`${seg.age}-${seg.gender}`}
                        onClick={() => setSegment(seg)}
                        className="pressable-lg w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-primary/[0.07] cursor-pointer transition-colors group"
                        data-testid={`row-variable-segment-${seg.age}-${seg.gender}`}
                        title="Click to open segment drill-down"
                      >
                        <span className="text-caption font-medium text-foreground/85 w-32 shrink-0 capitalize truncate">
                          {segmentLabel(seg)}
                        </span>
                        <ProgressMeter
                          value={share * 100}
                          total={100}
                          label={`${segmentLabel(seg)} share`}
                          size="md"
                          fillClassName="bg-primary/60 group-hover:bg-primary/85 transition-colors"
                          className="flex-1"
                        />
                        <span className="text-label tabular-nums text-muted-foreground/75 w-16 text-right shrink-0">
                          {totals.spend != null ? fmtUSD(totals.spend, 0) : "—"}
                        </span>
                        <span className="text-label tabular-nums text-foreground/80 w-20 text-right shrink-0">
                          {derived.cpa != null ? `${fmtUSD(derived.cpa)} CPA` : "— CPA"}
                        </span>
                        <span className="w-[86px] shrink-0 hidden sm:flex justify-end">
                          <SignalTag signal={bandSignal(row)} testId="variable-segment-signal" />
                        </span>
                        {/* The row's OWN evidence state, not just the header's
                            worst-of. Two segments can carry the same volume
                            band and rest on different evidence — reconciled
                            ad-grain rows in one, a name-keyed join in the
                            other — and the reader deciding which segment to
                            fund needs that difference on the row. (A span, so
                            it never nests a control inside this button.) */}
                        {row.evidenceState && (
                          <span className="shrink-0 hidden md:flex">
                            <EvidenceChip state={row.evidenceState} testId="variable-segment-evidence" />
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/75 group-hover:text-primary/80 group-hover:translate-x-0.5 transition-[color,background-color,border-color,box-shadow,opacity,transform] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className={cn(TYPE.caption, "text-muted-foreground/75 leading-relaxed")} data-testid="variable-segments-unavailable">
                  {data.segments.unavailableReason}
                </p>
              )}
            </div>

            {/* ── Placements for the carrier ads ── */}
            <div className="space-y-1.5">
              <p className="text-label uppercase tracking-widest text-muted-foreground/75">Placements — the carrier ads' own rows</p>
              {data.placementRows.length > 0 ? (
                <PlacementDrill rows={data.placementRows} resultLabel={data.totals?.resultTypes[0] ? eventLabel(data.totals.resultTypes[0]) : "results"} />
              ) : (
                <p className={cn(TYPE.caption, "text-muted-foreground/75")} data-testid="variable-placements-unavailable">
                  No placement rows join to this variable's ads in this run.
                </p>
              )}
            </div>

            {/* ── Copy variants ── */}
            {data.textVariants.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-label uppercase tracking-widest text-muted-foreground/75">
                  Copy that ran with this variable
                </p>
                <div className="space-y-2">
                  {data.textVariants.map((v) => (
                    <div key={v.cellId} className="rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-caption text-muted-foreground/75">{v.cellId}</span>
                        {v.conceptName && <span className="text-label font-medium text-foreground/80">{v.conceptName}</span>}
                      </div>
                      {v.primary && <p className="text-caption text-foreground/85 leading-relaxed">{v.primary}</p>}
                      {v.secondary && <p className="text-label text-muted-foreground/75 leading-relaxed">{v.secondary}</p>}
                      {v.cta && (
                        <span className="inline-block text-caption font-medium text-interactive/80 border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 rounded">
                          {v.cta}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.evidenceState && <EvidenceExplainer state={data.evidenceState} contextual={contextual} testId="variable-evidence-explainer" />}

            {/* ── Next step CTA ── */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/25">
              <p className="text-label text-muted-foreground/75 leading-relaxed">
                Use these variable insights to inform your next sprint test.
              </p>
              <button
                onClick={() => { onClose(); navigate("/app/strategy/map"); }}
                className="pressable shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary/10 border border-primary/25 text-label font-semibold text-interactive/90 hover:bg-primary/15 hover:border-primary/40 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Strategy Map
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested segment drill-down, scoped to this variable's carrier cells when it has them */}
      <SegmentDrilldownModal
        open={segment != null}
        onClose={() => setSegment(null)}
        segment={segment}
        analysis={analysis}
        cellIds={data.carrierCellIds.length > 0 ? data.carrierCellIds : null}
        kicker={`Variable · ${readableVariables(code)}`}
      />
    </>
  );
}
