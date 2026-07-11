// ─── Analysis · Combined (Unified Tabbed View) ────────────────────────
// Consolidates Budget, Audience, and Placements into one page with
// three tabs. Each tab has sortable/filterable data. Adds interactive
// charts (bar, pie, cross-map) for UVP visualization.
//
// Replaces the legacy /app/analysis/overview route. Old dedicated
// Audience/Placements/Budget routes still work for deep-links.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import {
  getAdAccount, getAnalysisData, getCampaignSummary,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState,
  SectionCard, CaveatNote, fmtUSD, fmtNum, resultTerm,
  RangeScopeBar, NoDataInRangeState, MetricTile,
} from "../shared";
import { SegmentCard } from "@/components/ui/SegmentCard";
import { MetricTileCarousel } from "@/components/ui/MetricTileCarousel";
import { SortFilterBar, type SortDir } from "@/components/ui/SortFilterBar";
import { SpendBarChart } from "@/components/charts/SpendBarChart";
import { SharePieChart } from "@/components/charts/SharePieChart";
import { CrossMapMatrix } from "@/components/charts/CrossMapMatrix";
import { ModuleTabs } from "../shared";
import {
  LineChart, Users, LayoutGrid, Wallet, BarChart3, Grid3x3,
} from "lucide-react";
import type { DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { buildMetricCatalog, metricSourceFromCampaignSummary, metricById } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";

const SECTION = "Analysis · 03";

type TabId = "total" | "audience" | "placements";

// ─── Tab helpers ──────────────────────────────────────────────────────

const TAB_META: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "total", label: "Total", Icon: Wallet },
  { id: "audience", label: "Audience", Icon: Users },
  { id: "placements", label: "Placements", Icon: LayoutGrid },
];

// ─── Audience helpers ─────────────────────────────────────────────────

function segmentKey(r: DemographicRow) {
  return `${r.Age}|${r.Gender}`;
}

interface SegmentAgg {
  age: string;
  gender: string;
  spend: number;
  results: number;
  linkClicks: number;
}

function aggregateSegments(rows: DemographicRow[]): SegmentAgg[] {
  const byKey = new Map<string, SegmentAgg>();
  for (const r of rows) {
    const key = segmentKey(r);
    const s = byKey.get(key) ?? { age: r.Age, gender: r.Gender, spend: 0, results: 0, linkClicks: 0 };
    s.spend += r["Amount spent (USD)"];
    s.results += r.Results;
    s.linkClicks += r["Link clicks"];
    byKey.set(key, s);
  }
  return [...byKey.values()].sort((a, b) => b.results - a.results);
}

// ─── Placement helpers ────────────────────────────────────────────────

interface PlacementAgg {
  placement: string;
  spend: number;
  results: number;
  impressions: number;
  v3Count: number;
  c4eCount: number;
}

function aggregatePlacements(v3: PlacementRow[], c4e: PlacementRow[]): PlacementAgg[] {
  const byKey = new Map<string, PlacementAgg>();
  for (const r of v3) {
    const s = byKey.get(r.Placement) ?? { placement: r.Placement, spend: 0, results: 0, impressions: 0, v3Count: 0, c4eCount: 0 };
    s.spend += r["Amount spent (USD)"];
    s.results += r.Results;
    s.impressions += r.Impressions;
    s.v3Count += 1;
    byKey.set(r.Placement, s);
  }
  for (const r of c4e) {
    const s = byKey.get(r.Placement) ?? { placement: r.Placement, spend: 0, results: 0, impressions: 0, v3Count: 0, c4eCount: 0 };
    s.spend += r["Amount spent (USD)"];
    s.results += r.Results;
    s.impressions += r.Impressions;
    s.c4eCount += 1;
    byKey.set(r.Placement, s);
  }
  return [...byKey.values()].sort((a, b) => b.spend - a.spend);
}

// ─── Sort / Filter helpers ────────────────────────────────────────────

function useSortFilter<T>(items: T[], searchFields: Array<keyof T>, sortFields: Record<string, (a: T, b: T) => number>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((item) => searchFields.some((f) => String(item[f] ?? "").toLowerCase().includes(q)));
  }, [items, search, searchFields]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir || !sortFields[sortKey]) return filtered;
    const cmp = sortFields[sortKey];
    const copy = [...filtered];
    copy.sort((a, b) => (sortDir === "asc" ? cmp(a, b) : cmp(b, a)));
    return copy;
  }, [filtered, sortKey, sortDir, sortFields]);

  const onSortChange = (key: string, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  return { search, setSearch, sortKey, sortDir, onSortChange, filtered: filtered as T[], sorted: sorted as T[] };
}

// ─── Total tab ────────────────────────────────────────────────────────

function TotalTab({
  summary,
  analysis,
  term,
}: {
  summary: NonNullable<ReturnType<typeof getCampaignSummary>>;
  analysis: NonNullable<ReturnType<typeof getAnalysisData>>;
  term: ReturnType<typeof resultTerm>;
}) {
  const { range, narrowed } = useCellRangeScope(analysis);

  const metricCatalog = useMemo(
    () => buildMetricCatalog(metricSourceFromCampaignSummary(summary)),
    [summary]
  );
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);
  const { selected: selectedMetricIds, toggle, move, reset } = useMetricSelection(availableMetricIds);
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  const events = Object.keys(summary.bottom_line_totals);
  const eventRows = events.map((e) => ({ event: e, totals: summary.bottom_line_totals[e] }));

  // Date-range scoped concept rollup (for "in range" metric tiles)
  const scoped = useMemo(() => {
    const rollup = analysis.concept_rollup ?? [];
    if (!narrowed || rollup.length === 0) return null;
    const rollupDates = (r: (typeof rollup)[number]) => ({ start: r.date_start, end: r.date_end });
    return {
      spend: sumInRange(rollup, range, rollupDates, (r) => r.spend),
      linkClicks: sumInRange(rollup, range, rollupDates, (r) => r.link_clicks),
      results: sumInRange(rollup, range, rollupDates, (r) => r.results),
      concepts: rollup.filter((r) => range && r.date_start && r.date_end && !(r.date_end < range.start || r.date_start > range.end)).length,
    };
  }, [analysis.concept_rollup, narrowed, range]);

  // Concept spend for charts
  const conceptSpend = useMemo(() => {
    const map = new Map<string, number>();
    const resultMap = new Map<string, number>();
    for (const r of analysis.performance_by_cell) {
      const name = r.book2_concept_name || "(unknown)";
      map.set(name, (map.get(name) ?? 0) + r["Amount spent (USD)"]);
      resultMap.set(name, (resultMap.get(name) ?? 0) + r.Results);
    }
    return Array.from(map.entries())
      .map(([name, spend]) => ({ name, spend, results: resultMap.get(name) ?? 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [analysis]);

  // Placement spend for charts
  const placementAgg = useMemo(() => {
    return aggregatePlacements(analysis.v3_placement_signal, analysis.c4e_placement_signal);
  }, [analysis]);

  const placementChartData = placementAgg.map((p) => ({ name: p.placement, spend: p.spend, results: p.results }));

  // Concept × placement cross-map (requires cell_id on placement rows; not
  // available in current seed model, so this surface is prepared but not
  // rendered until the data model supports it.)
  const crossMapRows: Array<{ concept: string; placement: string; spend: number; results: number }> = useMemo(() => [], []);
  const maxCrossSpend = 1;

  return (
    <>
      {scoped ? (
        <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile label="Spend (in range)" value={fmtUSD(scoped.spend, 0)} sub="concept flights overlapping range" />
          <MetricTile label="Link clicks (in range)" value={fmtNum(scoped.linkClicks)} />
          <MetricTile label="Results (in range)" value={fmtNum(scoped.results)} />
          <MetricTile label="Concept flights" value={String(scoped.concepts)} sub="overlapping selected range" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-6 pt-5 mb-1">
            <h2 className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Account totals</h2>
            <MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />
          </div>
          <MetricTileCarousel
            metrics={selectedMetricIds.map((id) => {
              const m = metricById(metricCatalog, id);
              return {
                id,
                label: m?.label ?? id,
                value: m?.formatted ?? "—",
                onClick: () => setOpenMetricId(id),
              };
            })}
            tileClassName="w-[170px] sm:w-[190px]"
          />
        </>
      )}

      <div className="px-6 py-5 space-y-5 max-w-5xl">
        {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

        {/* Efficiency by result event */}
        <SectionCard title="Efficiency by result event" desc="Spend and outcome for each result event." table="bottom_line_totals">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {eventRows.map(({ event, totals }) => (
              <SegmentCard
                key={event}
                name={event}
                metrics={[
                  { label: "Spend", value: fmtUSD(totals.spend, 0) },
                  { label: "Results", value: fmtNum(totals.results) },
                  { label: "CPA", value: totals.results > 0 ? fmtUSD(totals.spend / totals.results) : "—" },
                  { label: "Link clicks", value: fmtNum(totals.link_clicks) },
                ]}
              />
            ))}
          </div>
        </SectionCard>

        {/* Concept spend bar chart + pie chart */}
        <SectionCard
          title="Spend by concept"
          desc="Where budget went across creative concepts."
          table="performance_by_cell"
          right={
            <div className="flex items-center gap-1.5 text-label-xs text-muted-foreground/50">
              <BarChart3 className="w-3 h-3" />
              <span>{conceptSpend.length} concepts</span>
            </div>
          }
        >
          {conceptSpend.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-label-xs font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">Spend distribution</p>
                <SpendBarChart data={conceptSpend.slice(0, 10)} />
              </div>
              <div>
                <p className="text-label-xs font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">Share of spend</p>
                <SharePieChart data={conceptSpend.map((c) => ({ name: c.name, value: c.spend }))} unit="usd" />
              </div>
            </div>
          )}
        </SectionCard>

        {/* Placement bar chart */}
        {placementAgg.length > 0 && (
          <SectionCard
            title="Placement spend"
            desc="Delivery spend across placements."
            table="v3_placement_signal, c4e_placement_signal"
            right={
              <div className="flex items-center gap-1.5 text-label-xs text-muted-foreground/50">
                <BarChart3 className="w-3 h-3" />
                <span>{placementAgg.length} placements</span>
              </div>
            }
          >
            <SpendBarChart data={placementChartData} />
          </SectionCard>
        )}

        {/* Cross-map matrix (UVP) */}
        {crossMapRows.length > 0 && (
          <SectionCard
            title="Concept × placement cross-map"
            desc="Spend heat matrix showing which concepts performed on which placements."
            table="performance_by_cell, v3_placement_signal, c4e_placement_signal"
            right={
              <div className="flex items-center gap-1.5 text-label-xs text-muted-foreground/50">
                <Grid3x3 className="w-3 h-3" />
                <span>UVP</span>
              </div>
            }
          >
            <CrossMapMatrix rows={crossMapRows} maxSpend={maxCrossSpend} />
          </SectionCard>
        )}
      </div>

      <MetricDiagnosticModal
        open={openMetric != null}
        onClose={() => setOpenMetricId(null)}
        metric={openMetric}
        analysis={analysis}
        scope="account"
      />
    </>
  );
}

// ─── Audience tab ─────────────────────────────────────────────────────

function AudienceTab({
  rows,
  term,
}: {
  rows: DemographicRow[];
  term: ReturnType<typeof resultTerm>;
}) {
  const segments = useMemo(() => aggregateSegments(rows), [rows]);
  const maxResults = Math.max(...segments.map((s) => s.results), 1);

  const sortFields = useMemo(() => ({
    results: (a: SegmentAgg, b: SegmentAgg) => a.results - b.results,
    spend: (a: SegmentAgg, b: SegmentAgg) => a.spend - b.spend,
    cpa: (a: SegmentAgg, b: SegmentAgg) => {
      const ca = a.results > 0 ? a.spend / a.results : Infinity;
      const cb = b.results > 0 ? b.spend / b.results : Infinity;
      return ca - cb;
    },
  }), []);

  const { search, setSearch, sortKey, sortDir, onSortChange, sorted } = useSortFilter(
    segments,
    ["age", "gender"],
    sortFields
  );

  const totalSpend = segments.reduce((n, s) => n + s.spend, 0);
  const totalResults = segments.reduce((n, s) => n + s.results, 0);
  const top = segments[0];

  // Gender distribution pie
  const genderDist = useMemo(() => {
    const byGender = new Map<string, number>();
    for (const s of segments) {
      byGender.set(s.gender, (byGender.get(s.gender) ?? 0) + s.results);
    }
    return [...byGender.entries()].map(([name, value]) => ({ name, value: value as number }));
  }, [segments]);

  return (
    <>
      <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Segments" value={fmtNum(segments.length)} />
        <MetricTile label="Signal spend" value={fmtUSD(totalSpend, 0)} />
        <MetricTile label={term.Plural} value={fmtNum(totalResults)} />
        <MetricTile
          label="Top segment"
          value={top ? `${top.gender === "female" ? "F" : top.gender === "male" ? "M" : top.gender} ${top.age}` : "—"}
          sub={top ? `${fmtNum(top.results)} ${term.plural}` : undefined}
        />
      </div>

      <div className="px-6 py-5 space-y-5 max-w-5xl">
        <SectionCard
          title={`${term.Plural} by segment`}
          desc="Aggregated across all creative cells. Sort and filter to explore."
          table="demographic_registration_signal"
        >
          <SortFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search age or gender..."
            sortOptions={[
              { key: "results", label: "Results" },
              { key: "spend", label: "Spend" },
              { key: "cpa", label: "CPA" },
            ]}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
            resultCount={sorted.length}
          />

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((s) => {
              const cpa = s.results > 0 ? s.spend / s.results : null;
              const pct = Math.max((s.results / maxResults) * 100, 3);
              return (
                <SegmentCard
                  key={`${s.age}-${s.gender}`}
                  name={`${s.gender} · ${s.age}`}
                  descriptor={`${fmtNum(s.results)} results`}
                  metrics={[
                    { label: "Spend", value: fmtUSD(s.spend, 0) },
                    { label: "CPA", value: cpa != null ? fmtUSD(cpa) : "—" },
                    { label: "Link clicks", value: fmtNum(s.linkClicks) },
                  ]}
                  footer={
                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden mt-1">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  }
                />
              );
            })}
          </div>
        </SectionCard>

        {genderDist.length > 0 && (
          <SectionCard title="Gender distribution" desc="Share of results by gender." table="demographic_registration_signal">
            <div className="max-w-xs mx-auto">
              <SharePieChart data={genderDist} unit="count" />
            </div>
          </SectionCard>
        )}
      </div>
    </>
  );
}

// ─── Placements tab ───────────────────────────────────────────────────

function PlacementsTab({
  v3,
  c4e,
}: {
  v3: PlacementRow[];
  c4e: PlacementRow[];
}) {
  const agg = useMemo(() => aggregatePlacements(v3, c4e), [v3, c4e]);
  const maxSpend = Math.max(...agg.map((s) => s.spend), 1);

  const sortFields = useMemo(() => ({
    spend: (a: PlacementAgg, b: PlacementAgg) => a.spend - b.spend,
    results: (a: PlacementAgg, b: PlacementAgg) => a.results - b.results,
    impressions: (a: PlacementAgg, b: PlacementAgg) => a.impressions - b.impressions,
  }), []);

  const { search, setSearch, sortKey, sortDir, onSortChange, sorted } = useSortFilter(
    agg,
    ["placement"],
    sortFields
  );

  const totalSpend = agg.reduce((n, s) => n + s.spend, 0);
  const totalResults = agg.reduce((n, s) => n + s.results, 0);
  const top = agg[0];

  const chartData = agg.map((p) => ({ name: p.placement, spend: p.spend, results: p.results }));

  return (
    <>
      <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Placements" value={fmtNum(agg.length)} />
        <MetricTile label="Placement spend" value={fmtUSD(totalSpend, 0)} />
        <MetricTile label="Results" value={fmtNum(totalResults)} />
        <MetricTile label="Top placement" value={top?.placement ?? "—"} sub={top ? `${fmtUSD(top.spend, 0)} spend` : undefined} />
      </div>

      <div className="px-6 py-5 space-y-5 max-w-5xl">
        <SectionCard
          title="Spend by placement"
          desc="Combined across V3 and C4E signals. Sort and filter to explore."
          table="v3_placement_signal, c4e_placement_signal"
        >
          <SortFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search placement..."
            sortOptions={[
              { key: "spend", label: "Spend" },
              { key: "results", label: "Results" },
              { key: "impressions", label: "Impressions" },
            ]}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
            resultCount={sorted.length}
          />

          <div className="mt-4">
            <SpendBarChart data={chartData.slice(0, 10)} />
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((s) => (
              <SegmentCard
                key={s.placement}
                name={s.placement}
                descriptor={`${fmtNum(s.impressions)} impressions · ${s.v3Count > 0 ? `${s.v3Count} V3` : ""}${s.v3Count > 0 && s.c4eCount > 0 ? " + " : ""}${s.c4eCount > 0 ? `${s.c4eCount} C4E` : ""}`}
                metrics={[
                  { label: "Spend", value: fmtUSD(s.spend, 0) },
                  { label: "Results", value: fmtNum(s.results) },
                  { label: "CPA", value: s.results > 0 ? fmtUSD(s.spend / s.results) : "—" },
                ]}
                footer={
                  <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden mt-1">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-colors group-hover:bg-primary/80"
                      style={{ width: `${Math.max((s.spend / maxSpend) * 100, 3)}%` }}
                    />
                  </div>
                }
              />
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function AnalysisCombinedView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const summary = getCampaignSummary(seed, adAccountId);
  const { rangeHasData } = useDateRange();

  const [activeTab, setActiveTab] = useState<TabId>("total");

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Analysis" account={account}>
        {() => {
          const acct = account!;
          const term = resultTerm(acct);

          if (!summary || !analysis) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Analysis" />
                <ScopeBanner account={acct} />
                <PendingState title="No analysis yet" message="Analysis appears once performance data is connected or imported." icon={LineChart} />
              </div>
            );
          }

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Analysis"
                subtitle="What the account's performance data says, with all dimensions in one place."
                table="campaign_summary, performance_by_cell"
              />
              <ScopeBanner account={acct} />
              <RangeScopeBar grainNote="Campaign totals cover the account's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="analysis data" />
              ) : (
                <>
                  <ModuleTabs tabs={TAB_META} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

                  {activeTab === "total" && (
                    <TotalTab summary={summary} analysis={analysis} term={term} />
                  )}

                  {activeTab === "audience" && (
                    <AudienceTab rows={analysis.demographic_registration_signal} term={term} />
                  )}

                  {activeTab === "placements" && (
                    <PlacementsTab v3={analysis.v3_placement_signal} c4e={analysis.c4e_placement_signal} />
                  )}
                </>
              )}
            </div>
          );
        }}
      </ModuleScopeGate>
    </>
  );
}
