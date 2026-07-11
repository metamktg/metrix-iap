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
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Users, ChevronRight, AlertTriangle } from "lucide-react";
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
                <ModuleHeader section={SECTION} title="Audience" />
                <ScopeBanner account={acct} />
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
                subtitle={`Who converts: the demographic ${term.singular} signal by age band and gender. Click any segment to see the messaging it responds to.`}
                table="demographic_registration_signal"
              />
              <ScopeBanner account={acct} />
              <RangeScopeBar grainNote="Demographic signal aggregates each cell's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="audience data" />
              ) : (
              <>
              <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
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
                  desc="Aggregated across all creative cells. Re-rank by any KPI; click a segment to see which concepts, copy and variables drive it."
                  table="demographic_registration_signal"
                >
                  <RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={select} className="mb-3" />

                  <div className="space-y-1.5">
                    {ranked.map((e, idx) => {
                      const v = activeMetric.value(e);
                      const barPct = rankBarPct(v, metricValues, activeMetric.direction);
                      return (
                        <button
                          key={e.seg.age + e.seg.gender}
                          onClick={() => setSelectedSeg(e.seg)}
                          data-testid={`row-audience-segment-${e.seg.age}-${e.seg.gender}`}
                          className={cn(
                            "w-full text-left rounded-lg px-3 py-2.5 border border-border/30 bg-white/[0.01]",
                            "hover:border-primary/25 hover:bg-primary/[0.03] active:scale-[0.995]",
                            "transition-all duration-100 group"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-5 shrink-0 text-[10px] font-mono text-muted-foreground/40 tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 w-36 shrink-0">
                              <div className="text-[12px] font-medium text-foreground/90 truncate">
                                {segmentLabel(e.seg)}
                              </div>
                              {e.signal.low && (
                                <span
                                  className="inline-flex items-center gap-0.5 mt-0.5 text-[8px] font-mono uppercase tracking-wider text-amber-300/80"
                                  title={e.signal.reasons.join(" ")}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" /> Low signal
                                </span>
                              )}
                            </div>
                            <div className="flex-1 grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-1 min-w-0">
                              <KpiStat label={term.Plural} value={fmtNum(e.totals.results)} highlight={activeMetric.id === "results"} />
                              <KpiStat label="Spend" value={e.totals.spend != null ? fmtUSD(e.totals.spend, 0) : "—"} highlight={activeMetric.id === "spend"} />
                              <KpiStat label="CPA" value={e.derived.cpa != null ? fmtUSD(e.derived.cpa) : "—"} highlight={activeMetric.id === "cpa"} />
                              <KpiStat label="Link CTR" value={e.derived.ctr != null ? fmtPct(e.derived.ctr) : "—"} highlight={activeMetric.id === "ctr"} />
                              <KpiStat label="CVR" value={e.derived.cvr != null ? fmtPct(e.derived.cvr) : "—"} highlight={activeMetric.id === "cvr"} />
                            </div>
                            <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                          </div>
                          <div className="mt-2 ml-8 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className="h-full bg-primary/50 rounded-full group-hover:bg-primary/70 transition-colors"
                              style={{ width: `${barPct}%` }}
                            />
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
