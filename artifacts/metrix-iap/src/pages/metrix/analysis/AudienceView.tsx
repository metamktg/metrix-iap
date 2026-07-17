// ─── Analysis · Audience ──────────────────────────────────────────────
// Demographic conversion signal: who converts, by age band and gender.
// Data-rich segment rows (results, spend, CPA, CTR, CVR + share bar)
// rankable by any KPI. Clicking a segment opens the full drill-down —
// what messaging (concepts, ad copy, variables) that audience responds
// to — via the shared SegmentDrilldownModal.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Users, ChevronRight, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopeDemographicRows,
  listSegments,
  rowsForSegment,
  computeSegmentTotals,
  deriveSegmentMetrics,
  assessSegmentSignal,
  segmentLabel,
  type SegmentId,
  type SegmentRawTotals,
  type SegmentDerivedMetrics,
  type SegmentSignal,
} from "@/lib/segment-analytics";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import { RankSortBar, KpiStat, sortByRankMetric, useRankMetric, rankBarPct, type RankMetric } from "./rankSort";

const SECTION = "Analysis · 03";
const RANK_STORAGE_KEY = "metrix.audience.rank.v1";

interface SegmentEntry {
  seg: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
  signal: SegmentSignal;
}

function buildRankMetrics(resultPlural: string): RankMetric<SegmentEntry>[] {
  return [
    { id: "results", label: resultPlural, direction: "desc", value: (e) => e.totals.results, format: (v) => fmtNum(v) },
    { id: "spend", label: "Spend", direction: "desc", value: (e) => e.totals.spend, format: (v) => fmtUSD(v, 0) },
    { id: "cpa", label: "CPA", direction: "asc", value: (e) => e.derived.cpa, format: (v) => fmtUSD(v) },
    { id: "ctr", label: "Link CTR", direction: "desc", value: (e) => e.derived.ctr, format: (v) => fmtPct(v) },
    { id: "cvr", label: "CVR", direction: "desc", value: (e) => e.derived.cvr, format: (v) => fmtPct(v) },
    { id: "cpm", label: "CPM", direction: "asc", value: (e) => e.derived.cpm, format: (v) => fmtUSD(v) },
    { id: "impressions", label: "Impressions", direction: "desc", value: (e) => e.totals.impressions, format: (v) => fmtNum(v) },
  ];
}

export function AudienceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const { rangeHasData } = useDateRange();

  const [selectedSeg, setSelectedSeg] = useState<SegmentId | null>(null);

  // Honest account-level grain: when the import carries ACCOUNT aggregate
  // rows, those are the authoritative marginals — summing them together
  // with the overlapping per-cell rows would double-count.
  const scopedRows = useMemo(
    () => scopeDemographicRows(analysis?.demographic_registration_signal ?? [], null),
    [analysis]
  );

  const entries = useMemo<SegmentEntry[]>(() => {
    const scopedTotals = computeSegmentTotals(scopedRows);
    return listSegments(scopedRows).map((seg) => {
      const totals = computeSegmentTotals(rowsForSegment(scopedRows, seg));
      return {
        seg,
        totals,
        derived: deriveSegmentMetrics(totals),
        signal: assessSegmentSignal(totals, scopedTotals),
      };
    });
  }, [scopedRows]);

  const term = account ? resultTerm(account) : { singular: "result", plural: "results", Plural: "Results" };
  const rankMetrics = useMemo(() => buildRankMetrics(term.Plural), [term.Plural]);
  const { activeId, select } = useRankMetric(
    RANK_STORAGE_KEY,
    rankMetrics.map((m) => m.id),
    "results"
  );
  const activeMetric = rankMetrics.find((m) => m.id === activeId) ?? rankMetrics[0];
  const ranked = useMemo(() => sortByRankMetric(entries, activeMetric), [entries, activeMetric]);

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Audience" account={account}>
        {() => {
          const acct = account!;
          const rows = analysis?.demographic_registration_signal ?? [];

          if (rows.length === 0) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Audience" tabs="analysis" account={acct} />
                <PendingState title="No demographic signal" message="The audience read appears once demographic result data exists." icon={Users} />
              </div>
            );
          }

          const totalSpend = entries.reduce((n, e) => n + (e.totals.spend ?? 0), 0);
          const totalResults = entries.reduce((n, e) => n + (e.totals.results ?? 0), 0);
          const best = ranked[0];
          const metricValues = ranked.map((e) => activeMetric.value(e));

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Audience"
                account={acct}
                subtitle={`Who converts: the demographic ${term.singular} signal by age band and gender. Click any segment to see the messaging it responds to.`}
                table="demographic_registration_signal"
                tabs="analysis"
              />
              <RangeScopeBar grainNote="Demographic signal aggregates each cell's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="audience data" />
              ) : (
              <>
              <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                <MetricTile label="Segments" value={fmtNum(entries.length)} />
                <MetricTile label="Signal spend" value={fmtUSD(totalSpend, 0)} />
                <MetricTile label={term.Plural} value={fmtNum(totalResults)} />
                <MetricTile
                  label={`Best · ${activeMetric.label}`}
                  value={best ? segmentLabel(best.seg) : "—"}
                  sub={
                    best && activeMetric.value(best) != null
                      ? `${activeMetric.format(activeMetric.value(best)!)} ${activeMetric.label.toLowerCase()}`
                      : undefined
                  }
                />
              </div>

              <div className="px-6 py-5 space-y-4 max-w-5xl">
                <SectionCard
                  title="Segment performance"
                  desc="All cells · re-rank by KPI · click a segment for drivers"
                  table="demographic_registration_signal"
                  right={<RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={select} />}
                >
                  <div className="space-y-2">
                    {ranked.map((e, idx) => {
                      const v = activeMetric.value(e);
                      const barPct = rankBarPct(v, metricValues, activeMetric.direction);
                      return (
                        <button
                          key={e.seg.age + e.seg.gender}
                          onClick={() => setSelectedSeg(e.seg)}
                          data-testid={`row-audience-segment-${e.seg.age}-${e.seg.gender}`}
                          className={cn(
                            "w-full text-left rounded-lg px-4 py-3.5 border border-border/30 bg-white/[0.01]",
                            "hover:border-primary/30 hover:bg-primary/[0.03] active:scale-[0.998]",
                            "transition-all duration-100 group"
                          )}
                        >
                          {/* Header row: rank + name + primary KPI + vibrant action pill */}
                          <div className="flex items-center gap-2.5 mb-2.5">
                            <span className="w-4 shrink-0 text-[10px] font-mono text-muted-foreground/35 tabular-nums text-right">
                              {idx + 1}
                            </span>
                            <span className="text-[13px] font-semibold text-foreground/90 flex-1 truncate">
                              {segmentLabel(e.seg)}
                            </span>
                            {e.signal.low && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[8px] font-mono uppercase text-amber-300/70 shrink-0"
                                title={e.signal.reasons.join(" ")}
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Low
                              </span>
                            )}
                            <span className="text-[13px] font-bold tabular-nums text-foreground/80 shrink-0 mr-1">
                              {v != null ? activeMetric.format(v) : "—"}
                            </span>
                            {/* Vibrant CTA pill — spans full card click, styled as visual affordance */}
                            <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-violet-500 to-blue-500 text-white opacity-60 group-hover:opacity-100 transition-opacity shadow-sm shadow-violet-900/30">
                              Explore <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                          {/* Share bar — prominent, 6px */}
                          <div className="ml-6 h-[6px] rounded-full bg-white/[0.05] overflow-hidden mb-2.5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary/45 to-primary/65 group-hover:from-primary/60 group-hover:to-primary/80 transition-colors"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          {/* Secondary metrics */}
                          <div className="ml-6 flex items-center gap-4">
                            <KpiStat label={term.Plural} value={fmtNum(e.totals.results)} highlight={activeMetric.id === "results"} />
                            <KpiStat label="CPA" value={e.derived.cpa != null ? fmtUSD(e.derived.cpa) : "—"} highlight={activeMetric.id === "cpa"} />
                            <KpiStat label="Spend" value={e.totals.spend != null ? fmtUSD(e.totals.spend, 0) : "—"} highlight={activeMetric.id === "spend"} />
                            <KpiStat label="CTR" value={e.derived.ctr != null ? fmtPct(e.derived.ctr) : "—"} highlight={activeMetric.id === "ctr"} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] text-muted-foreground/50">
                    Bar length is relative to the best segment on the selected KPI ({activeMetric.label}).
                    {" "}{rows.length} underlying rows · click a segment for its messaging drill-down.
                  </p>
                </SectionCard>
              </div>
              </>
              )}
            </div>
          );
        }}
      </ModuleScopeGate>

      {analysis && (
        <SegmentDrilldownModal
          open={selectedSeg != null}
          onClose={() => setSelectedSeg(null)}
          segment={selectedSeg}
          analysis={analysis}
          cellIds={null}
          kicker="Audience segment"
        />
      )}
    </>
  );
}
