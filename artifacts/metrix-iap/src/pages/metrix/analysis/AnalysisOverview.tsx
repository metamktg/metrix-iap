// ─── Analysis · Overview ──────────────────────────────────────────────
// Multi-format analytics dashboard: spend trendline, result-type donut,
// cell performance bars, variable table, placement bars, demo heatmap,
// then the core control reads and drill-in module cards.

import { useResultScope } from "@/hooks/useResultScope";
import { ResultScopeBar } from "@/components/analysis/ResultScopeBar";
import { useState, useMemo, useEffect } from "react";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { rollupPlacements, derivePlacementRollup, type PlacementRollup } from "@/lib/placement-rollup";
import { useAnalysisView } from "@/contexts/AnalysisViewContext";
import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls, getMST,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  DetailReveal, deriveLabel,
  LoopAction, SkeletonTileRow, InfoTooltip, readableVariables, eventLabel, SectionInfoIcon,
  DataWindowBar, SegmentedToggle,
  type DataWindowSelection, fmtUSDAxis,
} from "../shared";
import {
  getGetAnalysisSummaryByDateRangeQueryOptions,
  getGetAccountAnalysisDataWindowsQueryOptions,
  useListAnalysisRuns,
  getListAnalysisRunsQueryKey,
} from "@workspace/api-client-react";
import { RunScopePicker } from "@/components/analysis/RunSelector";
import { useCellRunScope, usePersistedRunScope } from "@/lib/run-scope";
import { useQuery } from "@tanstack/react-query";
import { SharePieChart } from "@/components/charts/SharePieChart";
import { TrendSection } from "@/components/analysis/TrendSection";
import { HeatMatrix } from "@/components/charts/HeatMatrix";
import { KpiTileRow } from "@/components/metrics/KpiTile";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import {
  buildMetricCatalog, metricSourceFromApiTotals, metricSourceFromCampaignSummary,
} from "@/lib/data/metricsCatalog";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Brush,
} from "recharts";
import { AXIS, MARK, NEUTRAL_VAR, SERIES_VARS } from "@/components/charts/chartTokens";
import { chartTooltipRenderer } from "@/components/charts/chartChrome";
import { Slider } from "@workspace/command-deck/components/ui/slider";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  LineChart, Library, Users, LayoutGrid, Wallet, ArrowUp, ArrowDown,
} from "lucide-react";
import type {
  ConceptRollupRow, DemographicRow, PlacementRow, VariablePerformanceRow,
  AnalysisData,
} from "@/lib/data/seedTypes";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import type { SegmentId } from "@/lib/segment-analytics";
import { variableFamilyLabel } from "@/lib/variable-registry";

const SECTION = "Analysis · 03";

// ─── Monthly trend builder ────────────────────────────────────────────
// Day-weighted prorating: each concept's spend/results is distributed
// across months proportionally to the days that overlap — no duplication.
// Example: a 60-day concept spanning Jan 15–Mar 15 with $6,000 spend:
//   Jan → 16/60 days → $1,600; Feb → 28/60 → $2,800; Mar → 15/60 → $1,500.
// Total stays $5,900 ≈ $6,000 (rounding). Honest, not duplicated.

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface MonthBucket {
  month: string;
  spend: number;
  results: number;
}

function buildMonthlyTrend(rollup: ConceptRollupRow[]): MonthBucket[] {
  const withDates = rollup.filter((r) => r.date_start && r.date_end);
  if (withDates.length < 2) return [];

  const toDt = (s: string) => new Date(s);
  const allStarts = withDates.map((r) => toDt(r.date_start).getTime());
  const allEnds   = withDates.map((r) => toDt(r.date_end).getTime());
  const minDate   = new Date(Math.min(...allStarts));
  const maxDate   = new Date(Math.max(...allEnds));

  const months: { label: string; start: Date; end: Date }[] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const limit = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
  while (cur < limit) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    months.push({
      label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start: new Date(cur),
      end: monthEnd,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return months
    .map((m) => {
      let spend = 0, results = 0;
      for (const r of withDates) {
        const rS = toDt(r.date_start);
        const rE = toDt(r.date_end);
        // Total concept days (inclusive)
        const totalDays = Math.max(1, (rE.getTime() - rS.getTime()) / MS_PER_DAY + 1);
        // Overlapping days with this month (inclusive)
        const oS = rS < m.start ? m.start : rS;
        const oE = rE > m.end   ? m.end   : rE;
        if (oS > oE) continue;
        const overlapDays = (oE.getTime() - oS.getTime()) / MS_PER_DAY + 1;
        const ratio = overlapDays / totalDays;
        spend   += (r.spend   ?? 0) * ratio;
        results += (r.results ?? 0) * ratio;
      }
      return { month: m.label, spend, results };
    })
    .filter((m) => m.spend > 0 || m.results > 0);
}

// ─── Placement rollup (mirrors PlacementsView) ────────────────────────

// ─── Demographic heatmap builder ──────────────────────────────────────

interface DemoCell {
  age: string;
  gender: string;
  spend: number;
  results: number;
  cpa: number | null;
}

const AGE_ORDER    = ["13-17","18-24","25-34","35-44","45-54","55-64","65+","Unknown"];
const GENDER_ORDER = ["male","female","unknown"];

function buildDemoHeatmap(rows: DemographicRow[]) {
  const map = new Map<string, { spend: number; results: number }>();
  for (const r of rows) {
    const key = `${r.Age}|${r.Gender.toLowerCase()}`;
    const c = map.get(key) ?? { spend: 0, results: 0 };
    c.spend   += r["Amount spent (USD)"];
    c.results += r.Results;
    map.set(key, c);
  }

  const cells: DemoCell[] = [...map.entries()].map(([key, c]) => {
    const [age, gender] = key.split("|");
    return { age, gender, ...c, cpa: c.results > 0 ? c.spend / c.results : null };
  });

  const ages = [...new Set(cells.map((c) => c.age))].sort(
    (a, b) =>
      (AGE_ORDER.indexOf(a) >= 0 ? AGE_ORDER.indexOf(a) : 99) -
      (AGE_ORDER.indexOf(b) >= 0 ? AGE_ORDER.indexOf(b) : 99),
  );
  const genders = [...new Set(cells.map((c) => c.gender))].sort(
    (a, b) =>
      (GENDER_ORDER.indexOf(a) >= 0 ? GENDER_ORDER.indexOf(a) : 99) -
      (GENDER_ORDER.indexOf(b) >= 0 ? GENDER_ORDER.indexOf(b) : 99),
  );

  const cpas    = cells.map((c) => c.cpa).filter((v): v is number => v != null);
  const maxCpa  = cpas.length ? Math.max(...cpas) : 0;
  const minCpa  = cpas.length ? Math.min(...cpas) : 0;

  return { cells, ages, genders, maxCpa, minCpa };
}

// Tooltips, axes and marks below come from chartTokens / chartChrome. This
// file used to carry its own tooltip card, its own tick style (9px in a
// monospace literal) and a black-literal brush fill; each is now the shared
// token, so this page cannot drift from the chart components beside it.

// ─── Spend + results trend: SMALL MULTIPLES, not a dual axis ─────────
//
// This was one AreaChart with two y-axes — spend on the left in $k, results
// on the right as a count — and two filled areas laid over each other.
//
// That is the single worst chart mistake there is, and this codebase
// already forbids it: chartTokens.ts opens with "ONE axis. Two measures of
// different scale are two charts, or one chart indexed to a common base —
// never a second y-scale."
//
// The reason the rule exists is not tidiness. With two independent scales,
// where the results line sits relative to the spend area is decided by the
// two axis maxima, not by the data. Move either axis and the lines cross
// somewhere else. So the read an agency actually takes from this chart —
// "results are running ahead of spend here, behind it there" — was an
// artifact of axis choice, and could be inverted without changing a single
// number.
//
// Small multiples say the same things without the artifact: two panels,
// one measure each, a shared time axis, and a shared brush. Nothing is
// lost — both series are still there, still zoomable together, still
// tooltipped together via syncId — and no crossing point is implied
// between quantities that have no common scale.
//
// The results series also moves off `--metrix-success`. Status colours are
// reserved (chartTokens again: "Status colours ... are reserved and never
// appear here"); a count of results is a series, not a verdict.

const TREND_SYNC = "aov-trend";

function TrendPanel({
  data,
  dataKey,
  title,
  color,
  gradientId,
  tickFormatter,
  formatValue,
  height,
  showAxis,
  brush,
}: {
  data: MonthBucket[];
  dataKey: "spend" | "results";
  title: string;
  color: string;
  gradientId: string;
  tickFormatter: (v: number) => string;
  formatValue: (v: number) => string;
  height: number;
  showAxis: boolean;
  brush?: React.ReactNode;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          syncId={TREND_SYNC}
          margin={{ top: 4, right: 8, bottom: showAxis ? 0 : 2, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.26} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...AXIS.gridSoft} vertical={false} />
          <XAxis
            dataKey="month"
            tick={showAxis ? { ...AXIS.tick, fill: AXIS.labelDim } : false}
            tickLine={false}
            axisLine={false}
            height={showAxis ? 20 : 1}
          />
          <YAxis
            tickFormatter={tickFormatter}
            tick={{ ...AXIS.tick, fill: AXIS.labelDim }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={AXIS.cursor}
            content={chartTooltipRenderer<MonthBucket>((d) => ({
              title: d.month,
              rows: [{ label: title, value: formatValue(d[dataKey]), swatch: color }],
            }))}
            wrapperStyle={{ outline: "none" }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={title}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: color }}
            {...MARK.noAnimation}
          />
          {brush}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpendTrendChart({ data }: { data: MonthBucket[] }) {
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number }>({
    startIndex: 0,
    endIndex: Math.max(0, data.length - 1),
  });
  if (data.length < 2) return null;
  // Each panel names its own measure, so with one series apiece neither
  // needs a legend box.
  return (
    <div aria-label="Monthly spend and results, as two panels on a shared time axis">
      <div className={cn(TYPE.microLabel, "text-muted-foreground/75 pl-1")}>Spend</div>
      <TrendPanel
        data={data}
        dataKey="spend"
        title="Spend"
        color="var(--color-chart-1)"
        gradientId="aov-spend-gradient"
        tickFormatter={fmtUSDAxis}
        formatValue={(v: number) => fmtUSD(v, 0)}
        height={96}
        showAxis={false}
      />
      <div className={cn(TYPE.microLabel, "text-muted-foreground/75 pl-1 mt-1")}>Results</div>
      <TrendPanel
        data={data}
        dataKey="results"
        title="Results"
        color="var(--color-chart-2)"
        gradientId="aov-results-gradient"
        tickFormatter={(v: number) => fmtNum(v)}
        formatValue={(v: number) => fmtNum(v)}
        height={122}
        showAxis
        brush={
          <Brush
            dataKey="month"
            height={24}
            travellerWidth={7}
            startIndex={brushRange.startIndex}
            endIndex={brushRange.endIndex}
            stroke={AXIS.brush.stroke}
            fill={AXIS.brush.fill}
            aria-label="Drag to zoom the date range"
            onChange={(range) => {
              if (range && range.startIndex != null && range.endIndex != null) {
                setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
              }
            }}
          />
        }
      />
    </div>
  );
}

// ─── Cell performance bar chart ───────────────────────────────────────

type CellSort = "spend" | "cpa";

interface CellBarItem {
  name: string;
  spend: number;
  cpa: number | null;
  results: number;
  resultType: string;
}

function CellPerfBars({ items, resultNoun }: {
  items: CellBarItem[];
  resultNoun: string;
}) {
  if (items.length === 0) return null;
  const h = Math.min(items.length * 34 + 32, 260);
  return (
    <div style={{ height: h }} aria-label="Cell performance by spend">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 0, right: 56, bottom: 4, left: 4 }}
          barSize={MARK.barSize}
          barCategoryGap={MARK.gap * 2}
        >
          <CartesianGrid {...AXIS.gridSoft} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={fmtUSDAxis}
            tick={{ ...AXIS.tick, fill: AXIS.labelDim }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ ...AXIS.tick, fill: AXIS.labelDim }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)}
          />
          <Tooltip
            cursor={AXIS.cursorFill}
            content={chartTooltipRenderer<CellBarItem>((d) => ({
              title: d.name,
              rows: [
                { label: "Spend", value: fmtUSD(d.spend, 0), swatch: SERIES_VARS[0] },
                { label: resultNoun, value: fmtNum(d.results) },
                { label: "CPA", value: d.cpa != null ? fmtUSD(d.cpa) : "–" },
                { label: "Type", value: eventLabel(d.resultType) },
              ],
            }))}
            wrapperStyle={{ outline: "none" }}
          />
          {/* The leader wears the series colour; the field is the neutral
              bucket. A ranked list highlights ONE thing, and the rest are
              context — the field is not a second series. */}
          <Bar dataKey="spend" radius={[0, MARK.barRadius, MARK.barRadius, 0]} {...MARK.noAnimation}>
            {items.map((_, i) => (
              <Cell
                key={i}
                fill={i === 0 ? SERIES_VARS[0] : NEUTRAL_VAR}
                fillOpacity={i === 0 ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Placement visual table ───────────────────────────────────────────
// Each row shows: spend (proportional bar + value), CPA (color-coded badge),
// CTR (badge) — so all three metrics are visible without a tooltip.

function PlacementTable({ placements }: {
  placements: PlacementRollup[];
}) {
  if (placements.length === 0) return null;
  const maxSpend = Math.max(...placements.map((p) => p.spend), 1);

  // Median CPA is used to colour-code badges (emerald < median × 0.85, rose > median × 1.15)
  const cpas = placements.map((p) => p.cpa).filter((v): v is number => v != null).sort((a, b) => a - b);
  const medCpa = cpas.length ? cpas[Math.floor(cpas.length / 2)] : null;

  function cpaBadgeCls(cpa: number | null) {
    if (cpa == null || medCpa == null) return "text-muted-foreground/75";
    if (cpa <= medCpa * 0.85) return "text-status-success";
    if (cpa <= medCpa * 1.15) return "text-foreground/70";
    return "text-status-danger";
  }

  return (
    <div className="space-y-2.5" aria-label="Placement performance: spend, CPA, CTR">
      {placements.map((p) => (
        <div key={p.placement} className="flex items-start gap-3">
          {/* Spend bar column */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span
                className={cn(TYPE.caption, "text-foreground/75 truncate max-w-[160px]")}
                title={p.placement}
              >
                {p.placement.length > 24 ? p.placement.slice(0, 23) + "…" : p.placement}
              </span>
              <span className={cn(TYPE.label, " tabular-nums text-muted-foreground/75 ml-2 shrink-0")}>
                {fmtUSD(p.spend, 0)}
              </span>
            </div>
            <ProgressMeter value={p.spend} total={maxSpend} label={`${p.placement} share of top placement spend`} size="md" colorIndex={1} />
          </div>
          {/* CPA badge */}
          <div className="text-right shrink-0 w-[52px]">
            <div className={cn(TYPE.label, "text-muted-foreground/75 mb-0.5")}>CPA</div>
            <div className={cn(TYPE.caption, " font-semibold tabular-nums", cpaBadgeCls(p.cpa))}>
              {p.cpa != null ? fmtUSD(p.cpa, 0) : "–"}
            </div>
          </div>
          {/* CTR badge */}
          <div className="text-right shrink-0 w-[42px]">
            <div className={cn(TYPE.label, "text-muted-foreground/75 mb-0.5")}>CTR</div>
            <div className={cn(TYPE.caption, " tabular-nums text-foreground/60")}>
              {p.ctr != null ? fmtPct(p.ctr, 1) : "–"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Demographic heatmap grid ─────────────────────────────────────────
//
// Age rows x gender columns, coloured by CPA against goal. This delegates
// to HeatMatrix now rather than painting its own grid, which fixed three
// things it had drifted into:
//
//   · The legend did not match the map. It advertised an amber-to-emerald
//     gradient at 0.30 alpha while the cells painted from divergingFill's
//     danger/success ramp steps 700-900 — different hues, different
//     lightness. HeatMatrix derives its legend from the same function that
//     fills the cells, so the two cannot disagree.
//   · Over-goal was one flat bucket. cellBg tested `cpa >= goal * 1.1` and
//     returned the single worst fill, so a cell 5% over goal and one 300%
//     over rendered identically. HeatMatrix grades across a +/-100% window.
//   · An unmeasured cell and a mid-range one shared a fill. HeatMatrix
//     hatches the gap, so "nobody in this segment converted" cannot read as
//     "average performer".
//
// One thing is deliberately dropped: the "unknown" gender column used to
// render narrower and at 70% opacity. It is a real bucket carrying real
// spend, and the column header already says "unknown".

function DemoHeatmapGrid({
  heatmap,
  analysis,
  goalCpa,
}: {
  heatmap: ReturnType<typeof buildDemoHeatmap>;
  analysis: AnalysisData;
  goalCpa?: number | null;
}) {
  const { cells, ages, genders } = heatmap;
  const [selectedSegment, setSelectedSegment] = useState<SegmentId | null>(null);

  const matrixCells = useMemo(
    () =>
      cells.map((c) => ({
        row: c.age,
        col: c.gender,
        value: c.cpa,
        sub: fmtUSD(c.spend, 0),
        hint:
          `${c.age} / ${c.gender}: ` +
          (c.cpa != null ? `${fmtUSD(c.cpa)} CPA` : "no CPA · no results recorded") +
          ` \u00b7 ${fmtUSD(c.spend, 0)} spend \u00b7 ${fmtNum(c.results)} results` +
          `, click to drill down`,
        meta: { age: c.age, gender: c.gender } satisfies SegmentId,
      })),
    [cells],
  );

  if (cells.length === 0) return null;

  return (
    <div>
      <HeatMatrix
        rows={ages}
        cols={genders}
        cells={matrixCells}
        scale="verdict"
        lowerIsBetter
        goal={goalCpa ?? null}
        format={(n) => fmtUSD(n, 0)}
        measureLabel="CPA"
        rowHeaderLabel="Age"
        onSelect={(cell) => setSelectedSegment(cell.meta as SegmentId)}
        emptyLabel="No demographic rows in this window"
      />
      <p className={cn(TYPE.label, "text-muted-foreground/75 italic mt-2")}>
        Click any cell to explore segment attribution
      </p>

      {/* Segment drilldown modal — opened when a cell is clicked */}
      <SegmentDrilldownModal
        open={selectedSegment != null}
        onClose={() => setSelectedSegment(null)}
        segment={selectedSegment}
        analysis={analysis}
        cellIds={null}
      />
    </div>
  );
}

// ─── Compact variable table ───────────────────────────────────────────

type VarSortKey = "spend" | "cpa" | "ctr" | "results";

/** "asc" = lower is better (CPA); "desc" = higher is better. Drives the header arrow direction. */
const VAR_SORT_DIRECTION: Record<VarSortKey, "asc" | "desc"> = {
  spend: "desc",
  results: "desc",
  cpa: "asc",
  ctr: "desc",
};

function CompactVariableTable({ rows }: { rows: VariablePerformanceRow[] }) {
  const [sortKey, setSortKey] = useState<VarSortKey>("spend");

  const sorted = useMemo(() => {
    // Deduplicate by variable_id (take highest-spend row per variable)
    const byId = new Map<string, VariablePerformanceRow>();
    for (const r of rows) {
      const ex = byId.get(r.variable_id);
      if (!ex || r["Amount spent (USD)"] > ex["Amount spent (USD)"]) byId.set(r.variable_id, r);
    }
    const arr = [...byId.values()];
    const asc = VAR_SORT_DIRECTION[sortKey] === "asc";
    return arr
      .sort((a, b) => {
        const va = sortKey === "spend" ? a["Amount spent (USD)"]
                 : sortKey === "results" ? a.Results
                 : sortKey === "ctr" ? a.CTR_link_pct
                 : (a.CPA_result ?? Infinity);
        const vb = sortKey === "spend" ? b["Amount spent (USD)"]
                 : sortKey === "results" ? b.Results
                 : sortKey === "ctr" ? b.CTR_link_pct
                 : (b.CPA_result ?? Infinity);
        return asc ? va - vb : vb - va;
      })
      .slice(0, 8);
  }, [rows, sortKey]);

  if (sorted.length === 0) return null;

  const cols: { key: VarSortKey; label: string }[] = [
    { key: "spend",   label: "Spend" },
    { key: "results", label: "Results" },
    { key: "cpa",     label: "CPA" },
    { key: "ctr",     label: "CTR" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="nc-table">
        <thead>
          <tr>
            <th className="whitespace-nowrap">Variable</th>
            <th>Family</th>
            {cols.map((c) => {
              const active = sortKey === c.key;
              const dir = VAR_SORT_DIRECTION[c.key];
              return (
                <th
                  key={c.key}
                  className="text-right"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    onClick={() => setSortKey(c.key)}
                    aria-label={`Sort by ${c.label}${active ? (dir === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
                    className={cn(
                      "pressable hit-target-24 inline-flex items-center gap-0.5 text-label uppercase tracking-widest font-semibold transition-colors whitespace-nowrap",
                      active
                        ? "text-interactive"
                        : "text-muted-foreground/75 hover:text-foreground/80",
                    )}
                  >
                    {c.label}
                    {active && (dir === "asc"
                      ? <ArrowUp className="w-3 h-3" />
                      : <ArrowDown className="w-3 h-3" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.variable_id + i}>
              <td className="font-medium text-foreground/90 whitespace-nowrap">{readableVariables(r.variable_id)}</td>
              <td className="text-muted-foreground/75">{variableFamilyLabel(r.variable_family)}</td>
              <td className="text-right tabular-nums text-foreground/85">{fmtUSD(r["Amount spent (USD)"], 0)}</td>
              <td className="text-right tabular-nums text-foreground/85">{fmtNum(r.Results)}</td>
              <td className="text-right tabular-nums text-foreground/85">{r.CPA_result != null ? fmtUSD(r.CPA_result) : "–"}</td>
              <td className="text-right tabular-nums text-foreground/85">{fmtPct(r.CTR_link_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function AnalysisOverview() {
  const seed           = useMetrixSeed();
  const isRefetching   = useMetrixIsRefetching();
  const adAccountId    = useScopedAdAccountId();
  const account        = getAdAccount(seed, adAccountId);
  const analysis       = getAnalysisData(seed, adAccountId);

  const [cellSort, setCellSort] = useState<CellSort>("spend");
  const { topN, setTopN, goalCpa, setGoalCpa, selectedWindow, setSelectedWindow } = useAnalysisView();

  // ── Analysis-run scope (compact header dropdown) ──────────────────────
  const { data: analysisRunsData } = useListAnalysisRuns(adAccountId ?? "", { query: { enabled: !!adAccountId, queryKey: getListAnalysisRunsQueryKey(adAccountId ?? "") } });
  const [runSelection, setRunSelection] = usePersistedRunScope(
    "analysis-overview", adAccountId, analysisRunsData?.runs,
  );
  const { filterByRun } = useCellRunScope(analysis, runSelection);
  // One result scope for every analysis surface (lib/result-scope.ts).
  const resultScope = useResultScope(account, adAccountId, analysis?.performance_by_cell.map((r) => r["Result type"]));

  // KPI tile drill-down modal (one shared modal for all tiles).
  const [drillMetricId, setDrillMetricId] = useState<string | null>(null);

  // Fetch available date windows from actual ad_performance data (not run metadata).
  const { data: windowsData, isFetching: windowsFetching } = useQuery({
    ...getGetAccountAnalysisDataWindowsQueryOptions(adAccountId ?? ""),
    enabled: !!adAccountId,
  });

  // Full span of the imported data — used as the default query window so the
  // Overview always shows the COMPLETE imported dataset when no specific
  // window is selected (crucial for manual accounts whose ads carry no
  // cell/concept codes and whose seed-side analysis tables are thus sparse).
  const sortedWindows = windowsData?.windows ?? [];
  const fullSpan = sortedWindows.length > 0
    ? { start: sortedWindows[0]!.start, end: sortedWindows[sortedWindows.length - 1]!.end }
    : null;
  const queryWindow = selectedWindow ?? fullSpan;

  // Fetch re-aggregated data for the selected window (or the full span).
  const { data: runData, isFetching: runFetching } = useQuery({
    ...getGetAnalysisSummaryByDateRangeQueryOptions(
      adAccountId ?? "",
      queryWindow?.start ?? "",
      queryWindow?.end ?? "",
    ),
    enabled: !!queryWindow && !!adAccountId,
  });

  // ── Run-scoped canonical totals ───────────────────────────────────────
  // When specific runs are selected, the headline tiles must read the same
  // canonical daterange summary every other surface reads — never a client
  // re-sum of performance_by_cell, which is empty for manual accounts
  // (fabricating $0 tiles under a run selection) and bypasses the
  // account_totals ceiling and the impossible-CTR guard for importer
  // accounts. Selected runs map to their recorded windows; a multi-run
  // selection uses the union window, read ONCE from current rows (no
  // per-run summing, so overlapping run windows can never double-count).
  const runScopeWindow = useMemo(() => {
    if (runSelection.allTime) return null;
    const selected = (analysisRunsData?.runs ?? []).filter(
      (r) => runSelection.selectedRunIds.includes(r.id) && r.date_start && r.date_end,
    );
    if (selected.length === 0) return null;
    return {
      start: selected.map((r) => r.date_start!).reduce((m, d) => (d < m ? d : m)),
      end: selected.map((r) => r.date_end!).reduce((m, d) => (d > m ? d : m)),
    };
  }, [runSelection, analysisRunsData]);
  const { data: runScopeData } = useQuery({
    ...getGetAnalysisSummaryByDateRangeQueryOptions(
      adAccountId ?? "",
      runScopeWindow?.start ?? "",
      runScopeWindow?.end ?? "",
    ),
    enabled: !!adAccountId && !!runScopeWindow,
  });

  // ── Stale-window guard ────────────────────────────────────────────────
  // A persisted window selection can outlive the data it referred to (e.g.
  // after a fresh manual import replaces the dataset). If the selection no
  // longer matches any available window, fall back to "All data" so a stale
  // selection can never blank out the analysis.
  useEffect(() => {
    if (!selectedWindow || !windowsData) return;
    const stillValid = (windowsData.windows ?? []).some(
      (w) => w.start === selectedWindow.start && w.end === selectedWindow.end,
    );
    if (!stillValid) setSelectedWindow(null);
  }, [selectedWindow, windowsData, setSelectedWindow]);

  // Secondary guard: even a nominally-valid window must never render an empty
  // analysis — if the ranged query comes back with no rows at all, reset to
  // the full imported dataset.
  useEffect(() => {
    if (!selectedWindow || !runData || runFetching) return;
    const empty =
      (runData.concept_rows?.length ?? 0) === 0 &&
      (runData.placement_rows?.length ?? 0) === 0 &&
      (runData.demographic_rows?.length ?? 0) === 0;
    if (empty) setSelectedWindow(null);
  }, [selectedWindow, runData, runFetching, setSelectedWindow]);

  return (
    <ModuleScopeGate section={SECTION} title="Analysis Overview" account={account}>
      {() => {
        const acct    = account!;
        const term    = resultTerm(acct);
        const summary = getCampaignSummary(seed, adAccountId);
        const a       = analysis;
        const controls = getCoreControls(seed, adAccountId);

        if (!summary || !a) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Analysis Overview" accountName={acct.name} tabs="analysis" />
              <PendingState
                title="No analysis yet"
                message="Analysis appears once performance data is connected and an analysis run completes for this account."
                icon={LineChart}
                action={
                  <div className="flex flex-col items-center gap-3">
                    <LoopAction to="/app/analysis" icon="analysis" label="Run Analysis" />
                    <CrossLink to="/app/analysis/library" label="Or import data manually" />
                  </div>
                }
              />
            </div>
          );
        }

        // ── Metric data ───────────────────────────────────────────────
        // Run scoping: rollup rows carry manual_analysis_run_id directly;
        // cell-level rows go through the shared cell→concept run mapping.
        // Untagged legacy rows (null run id) always pass — never hide data
        // we can't honestly attribute to a run.
        // Result scope: rows written at result-event grain are filtered to
        // the scope's event(s); rows from before the split (null result_type)
        // are kept — they are "not split", not "another event".
        const { inScope, scopeRows } = resultScope;
        const rollup = (a.concept_rollup ?? []).filter(
          (r) =>
            (runSelection.allTime ||
              r.manual_analysis_run_id == null ||
              runSelection.selectedRunIds.includes(r.manual_analysis_run_id)) &&
            (r.result_type == null || inScope(r.result_type)),
        );
        // Variable rows carry a run id too — the assembler projects it
        // alongside the payload precisely so they can be scoped. The card's
        // caption used to say "account-wide (variable rows carry no run
        // linkage)", which stopped being true when that projection landed, so
        // the table summed every variable once per run while telling the
        // reader it could not be scoped at all.
        const scopedVariableRows = scopeRows(a.v3_variable_performance ?? [], (r) => r["Result type"]).filter(
          (r) =>
            runSelection.allTime ||
            r.manual_analysis_run_id == null ||
            runSelection.selectedRunIds.includes(r.manual_analysis_run_id),
        );
        const cellRows = filterByRun(scopeRows(a.performance_by_cell, (r) => r["Result type"]));
        const runScoped = !runSelection.allTime;

        // Run-scoped KPI totals, derived from the scoped cell rows so the
        // headline tiles always agree with the charts below them. Placement
        // and variable rows carry no cell linkage, so those sections are
        // explicitly labeled account-wide under a run selection instead of
        // pretending to be scoped.
        const scopedSpend = cellRows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
        const scopedImpressions = cellRows.reduce((s, r) => s + r.Impressions, 0);
        const scopedLinkClicks = cellRows.reduce((s, r) => s + r["Link clicks"], 0);
        const scopedCtrPct = scopedImpressions > 0 ? (scopedLinkClicks / scopedImpressions) * 100 : 0;
        const scopedDemoRows = filterByRun(scopeRows(a.demographic_registration_signal, (r) => r["Result type"]));

        // ── MST lookup for control-name resolution ────────────────────
        const mst = getMST(seed, adAccountId);
        const lib = mst?.local_book2_library ?? [];
        const resolveConceptName = (id: string) =>
          lib.find((c) => c.cell_id === id)?.book2_concept_name ?? id;
        // Resolve a concept CODE (e.g. "C2") → human name by finding any
        // library cell whose id starts with that code prefix.
        const resolveConceptCode = (code: string): string => {
          const match = lib.find((c) => c.cell_id.startsWith(code));
          return match?.book2_concept_name ?? code;
        };
        const resolveControlText = (text: string, id: string) => {
          const name = resolveConceptName(id);
          return name === id ? text : text.replace(id, name);
        };

        // ── Trend data (memoised inside render fn for simplicity) ─────
        const trendData = buildMonthlyTrend(rollup);

        // ── Result type donut data ────────────────────────────────────
        const resultTypeMap = new Map<string, number>();
        for (const r of cellRows) {
          const key = eventLabel(r["Result type"]);
          resultTypeMap.set(key, (resultTypeMap.get(key) ?? 0) + r["Amount spent (USD)"]);
        }
        const resultTypePie = [...resultTypeMap.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // ── Top cells ─────────────────────────────────────────────────
        // When a preset is active and data has loaded, use the concept_rows
        // returned by the API (derived from ad_performance for the window).
        // Otherwise fall back to the all-time seed performance_by_cell rows.
        // Prefer API rows whenever a window is selected OR the seed-side
        // surface is empty (manual accounts without cell codes).
        const sortedCells: CellBarItem[] = (runData && (selectedWindow || a.performance_by_cell.length === 0))
          ? [...runData.concept_rows].filter((r) => inScope(r.result_type))
              .sort((x, y) =>
                cellSort === "spend"
                  ? y.spend - x.spend
                  : (x.results > 0 ? x.spend / x.results : Infinity) -
                    (y.results > 0 ? y.spend / y.results : Infinity)
              )
              .slice(0, topN)
              .map((r) => ({
                name:       resolveConceptCode(r.concept),
                spend:      r.spend,
                cpa:        r.results > 0 ? r.spend / r.results : null,
                results:    r.results,
                resultType: "",
              }))
          : [...cellRows]
              .sort((x, y) =>
                cellSort === "spend"
                  ? y["Amount spent (USD)"] - x["Amount spent (USD)"]
                  : (x.CPA_result ?? Infinity) - (y.CPA_result ?? Infinity)
              )
              .slice(0, topN)
              .map((r) => ({
                name:       r.book2_concept_name ?? r.cell_id,
                spend:      r["Amount spent (USD)"],
                cpa:        r.CPA_result,
                results:    r.Results,
                resultType: r["Result type"],
              }));

        // ── Placements (top 6 by spend) ───────────────────────────────
        // When a run is selected and data has loaded, use the API placement rows.
        const allPlacements = (runData &&
          (selectedWindow || (a.v3_placement_signal.length === 0 && a.c4e_placement_signal.length === 0))
          ? runData.placement_rows.map((r) =>
              // Same derivation as the seed-row path — these rows arrive
              // pre-aggregated from the run API, so only the ratios are
              // computed here, and by the same function.
              derivePlacementRollup(r.placement, {
                spend: r.spend,
                results: r.results,
                impressions: r.impressions,
                linkClicks: r.link_clicks,
              }))
          : rollupPlacements([
              ...a.v3_placement_signal,
              ...a.c4e_placement_signal,
            ])
        )
          .sort((x, y) => y.spend - x.spend)
          .slice(0, 6);

        // ── Demographic heatmap ───────────────────────────────────────
        // When a run is selected and data has loaded, build heatmap from API rows.
        const heatmapRows = runData && (selectedWindow || a.demographic_registration_signal.length === 0)
          ? runData.demographic_rows.map((r) => ({
              cell_id: "", "Ad name": "", Age: r.age, Gender: r.gender,
              "Amount spent (USD)": r.spend ?? 0,
              Reach: 0, Impressions: 0,
              Results: r.results ?? 0, "Clicks (all)": 0, "Link clicks": r.link_clicks ?? 0,
              CPA_result: r.results && r.results > 0 && r.spend ? r.spend / r.results : null,
              CTR_link_pct: 0, Result_per_link_click_pct: 0,
            }))
          : scopedDemoRows;
        const heatmap = buildDemoHeatmap(heatmapRows);

        // ── Goal-CPA default: median of heatmap cell CPAs ─────────────
        const heatmapCpas = heatmap.cells
          .map((c) => c.cpa)
          .filter((v): v is number => v != null)
          .sort((a, b) => a - b);
        const medianCpa = heatmapCpas.length
          ? heatmapCpas[Math.floor(heatmapCpas.length / 2)]
          : null;
        const effectiveGoalCpa = goalCpa ?? medianCpa;

        // ── KPI tile catalog (shared by tiles + drill-down modal) ─────
        // Run-scoped: canonical window totals from the API (see
        // runScopeWindow above). The client-side cell re-sum survives only
        // as the last resort for legacy runs with no recorded window —
        // where it is also the only source that exists.
        const tileCatalog = buildMetricCatalog(
          runScoped
            ? runScopeData
              ? metricSourceFromApiTotals(runScopeData.totals)
              : metricSourceFromApiTotals({
                  total_spend_usd: scopedSpend,
                  total_impressions: scopedImpressions,
                  total_link_clicks: scopedLinkClicks,
                  overall_link_ctr_pct: scopedCtrPct,
                })
            : selectedWindow && runData
              ? metricSourceFromApiTotals(runData.totals)
              : metricSourceFromCampaignSummary(summary),
        );
        const drillWindowLabel = runScoped
          ? "run-scoped selection"
          : selectedWindow
            ? `${selectedWindow.start} → ${selectedWindow.end}`
            : "all data (full flight)";

        // ── Sub-page jump-off cards ───────────────────────────────────
        const subpages = [
          {
            to: "/app/analysis/library",
            label: "IAP Library",
            Icon: Library,
            desc: "Cell and variable performance across the account.",
            stat: `${cellRows.length} cell rows · ${a.v3_variable_performance.length} variable rows`,
          },
          {
            to: "/app/analysis/audience",
            label: "Audience",
            Icon: Users,
            desc: `Demographic ${term.singular} signal by age and gender.`,
            stat: `${scopedDemoRows.length} demographic rows`,
          },
          {
            to: "/app/analysis/placements",
            label: "Placements",
            Icon: LayoutGrid,
            desc: "Where delivery happened and what each placement produced.",
            stat: `${a.v3_placement_signal.length + a.c4e_placement_signal.length} placement rows`,
          },
          {
            to: "/app/analysis/budget",
            label: "Budget",
            Icon: Wallet,
            desc: "Spend allocation by result event, concept, and placement.",
            stat: `${fmtUSD(runScoped ? (runScopeData?.totals.total_spend_usd ?? scopedSpend) : summary.total_spend_usd, 0)} analyzed`,
          },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Analysis Overview"
              accountName={acct.name}
              subtitle="Performance reads · drill-in modules"
              tabs="analysis"
              right={
                <RunScopePicker
                  runs={analysisRunsData?.runs ?? []}
                  value={runSelection}
                  onChange={setRunSelection}
                />
              }
            />
            <ResultScopeBar scope={resultScope.scope} groups={resultScope.groups} onChange={resultScope.setScopeId} />
            <>
                {/* ── Data-window picker ──────────────────────────────── */}
                <DataWindowBar
                  windows={windowsData?.windows ?? []}
                  selected={selectedWindow}
                  onSelect={setSelectedWindow}
                  isFetching={windowsFetching}
                />

                {/* ── Metric tiles + result type donut (inline) ──── */}
                {(isRefetching || (!!selectedWindow && runFetching)) ? (
                  <div className="px-6 pt-5">
                    <SkeletonTileRow count={4} />
                  </div>
                ) : (
                  <div className="px-6 pt-5 flex gap-3 items-start">
                    {/* Left: 4 tiles in a 2×2 grid */}
                    <div className="flex-1 grid grid-cols-dashboard-4 gap-3">
                        <KpiTileRow
                          viewKey={runScoped ? "analysis-overview:run-scoped" : "analysis-overview"}
                          catalog={tileCatalog}
                          onTileClick={setDrillMetricId}
                        />
                    </div>
                    {/* Right: result type donut — inline with tiles */}
                    {resultTypePie.length > 0 && (
                      <div className="w-[196px] shrink-0 flex flex-col gap-1.5">
                        {/* Title above the tile, like every module. */}
                        <div className={cn(TYPE.microLabel, "text-muted-foreground/75 px-0.5")}>
                          By result type
                        </div>
                        <div className="rounded-xl border border-border/40 bg-foreground/[0.02] p-3 flex flex-col">
                        <SharePieChart
                          data={resultTypePie}
                          unit="usd"
                          height={148}
                          showLegend={resultTypePie.length <= 3}
                        />
                        <div className="mt-1.5 flex justify-end">
                          <CrossLink to="/app/analysis/library" label="Library →" />
                        </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Daily trend ─────────────────────────────────────
                    The first time-based read in the product: the window
                    totals above say how much, this says when. Fetched on
                    demand rather than carried in the seed — a daily series
                    is O(days x accounts). */}
                <TrendSection
                  accountId={adAccountId ?? null}
                  start={queryWindow?.start ?? null}
                  end={queryWindow?.end ?? null}
                  hasWindows={windowsFetching || (windowsData?.windows ?? []).length > 0}
                />

                <KpiDrilldownModal
                  open={drillMetricId != null}
                  onClose={() => setDrillMetricId(null)}
                  scope="account"
                  metricId={drillMetricId}
                  catalog={tileCatalog}
                  analysis={a}
                  // Run scoping maps cleanly onto seed cell rows; a date-window
                  // selection does not (seed cells have no daily grain), so
                  // under a window selection we pass no cell rows rather than
                  // full-flight rows mislabeled as window-scoped.
                  scopedCellRows={selectedWindow ? [] : cellRows}
                  scopeNarrowed={runScoped || selectedWindow != null}
                  windowLabel={drillWindowLabel}
                />

                {/* ── Secondary refresh action ──────────────────────── */}
                <div className="px-6 pt-2 flex justify-end">
                  <CrossLink to="/app/analysis" label="↻ Re-run analysis" />
                </div>

                <div className="px-6 py-5 space-y-4 max-w-5xl">
                  {summary.data_caveat && (
                    <div className="flex items-center gap-1">
                      <span className="text-label text-muted-foreground/75">Data window</span>
                      <InfoTooltip content={summary.data_caveat} />
                    </div>
                  )}

                  {/* ── Spend trendline (spend + results, dual-axis) ─ */}
                  {trendData.length >= 2 && (
                    <SectionCard
                      title="Spend by month"
                      desc="Day-prorated spend (blue) · results (green, right axis)"
                      right={<><SectionInfoIcon tip="Month-by-month spend trend with daily proration, plotted against result volume to surface delivery patterns." /><CrossLink to="/app/analysis/budget" label="Budget →" /></>}
                    >
                      <SpendTrendChart data={trendData} />
                    </SectionCard>
                  )}

                  {/* ── Cell performance bar chart ────────────────── */}
                  {!!selectedWindow && runFetching ? (
                    <SectionCard title="Top concepts by spend" desc="Loading…" right={<SectionInfoIcon tip="Ranks creative concepts by spend or CPA so you can quickly see which ideas are carrying the account." />}>
                      <SkeletonTileRow count={3} />
                    </SectionCard>
                  ) : sortedCells.length > 0 && (
                    <SectionCard
                      title="Top concepts by spend"
                      desc={
                        selectedWindow && runData
                          ? `${sortedCells.length} concept${sortedCells.length !== 1 ? "s" : ""} · run window · CPA`
                          : `${term.Plural} · CPA · ${cellRows.length} cells total`
                      }
                      right={
                        <div className="flex items-center gap-3">
                          <SectionInfoIcon tip="Ranks creative concepts by spend or CPA so you can quickly see which ideas are carrying the account." />
                          {/* Top-N slider */}
                          <div className="flex items-center gap-2">
                            <span className="text-label text-muted-foreground/75 whitespace-nowrap">
                              Top N: <span className="text-foreground/80">{topN}</span>
                            </span>
                            <Slider
                              aria-label="Number of top concepts to display"
                              min={5}
                              max={25}
                              step={5}
                              value={[topN]}
                              onValueChange={([v]) => setTopN(v)}
                              className="w-24"
                            />
                          </div>
                          <SegmentedToggle
                            ariaLabel="Sort top concepts by"
                            options={[
                              { id: "spend" as CellSort, label: "Spend" },
                              { id: "cpa"   as CellSort, label: "CPA" },
                            ]}
                            active={cellSort}
                            onChange={(k) => setCellSort(k)}
                          />
                          <CrossLink to="/app/analysis/library" label="All →" />
                        </div>
                      }
                    >
                      <CellPerfBars
                        items={sortedCells}
                        resultNoun={term.Plural}
                      />
                    </SectionCard>
                  )}

                  {/* ── Variable table + Placement bars ───────────── */}
                  {(scopedVariableRows.length > 0 || allPlacements.length > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      {scopedVariableRows.length > 0 && (
                        <SectionCard
                          title="Variable performance"
                          desc={`Hook · Tone · Framework · Concept, top 8 · click column to sort${runScoped ? " · scoped to the selected run(s)" : ""}`}
                          right={<><SectionInfoIcon tip="Shows how each creative variable family (hook, tone, framework, concept) performs on spend and CPA across the top results." /><CrossLink to="/app/analysis/library" label="Full →" /></>}
                        >
                          <CompactVariableTable rows={scopedVariableRows} />
                        </SectionCard>
                      )}
                      {allPlacements.length > 0 && (
                        <SectionCard
                          title="Top placements"
                          desc={`V3 + C4E combined · spend bar, CPA badge, CTR badge · top 6${runScoped ? " · account-wide (placement rows carry no run linkage)" : ""}`}
                          right={<><SectionInfoIcon tip="Surfaces the highest-spend placements with their CPA and CTR so you know where delivery is concentrated." /><CrossLink to="/app/analysis/placements" label="Full →" /></>}
                        >
                          <PlacementTable
                            placements={allPlacements}
                          />
                        </SectionCard>
                      )}
                    </div>
                  )}

                  {/* ── Demographic heatmap ───────────────────────── */}
                  {heatmap.cells.length > 0 && (
                    <SectionCard
                      title="Audience heatmap"
                      desc={
                        effectiveGoalCpa != null
                          ? `Age × gender · CPA against a ${fmtUSD(effectiveGoalCpa, 0)} goal · hover a cell for spend and results`
                          : "Age × gender · CPA relative to this grid's own range · hover a cell for spend and results"
                      }
                      right={
                        <div className="flex items-center gap-3">
                          <SectionInfoIcon tip="Maps CPA by age and gender to reveal which demographic segments are most and least efficient." />
                          {/* Goal-CPA slider */}
                          {medianCpa != null && (
                            <div className="flex items-center gap-2">
                              <span className="text-label text-muted-foreground/75 whitespace-nowrap">
                                Goal CPA: <span className="text-foreground/80">{fmtUSD(effectiveGoalCpa ?? medianCpa, 0)}</span>
                              </span>
                              <Slider
                                aria-label="Goal CPA threshold for heatmap coloring"
                                min={Math.round(heatmap.minCpa)}
                                max={Math.round(heatmap.maxCpa)}
                                step={Math.max(1, Math.round((heatmap.maxCpa - heatmap.minCpa) / 20))}
                                value={[Math.round(effectiveGoalCpa ?? medianCpa)]}
                                onValueChange={([v]) => setGoalCpa(v)}
                                className="w-28"
                              />
                            </div>
                          )}
                          <CrossLink to="/app/analysis/audience" label="Full →" />
                        </div>
                      }
                    >
                      <DemoHeatmapGrid heatmap={heatmap} analysis={a} goalCpa={effectiveGoalCpa} />
                    </SectionCard>
                  )}

                  {/* ── Core control reads ────────────────────────── */}
                  {controls && (
                    <SectionCard title="Core control reads" desc="Control creative · per funnel depth" right={<SectionInfoIcon tip="The benchmark creative concepts that set the efficiency floor. New tests are judged against these." />}>
                      <div className="grid grid-cols-dashboard-2 gap-3">
                        <div className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4">
                          <div className="text-micro uppercase tracking-widest text-muted-foreground/75 mb-1">Primary control</div>
                          <p className={TYPE.title}>{resolveConceptName(controls.primary_control)}</p>
                          <div className="mt-1.5">
                            {(() => {
                              const read = resolveControlText(controls.primary_control_read, controls.primary_control);
                              return (
                                <DetailReveal
                                  label={deriveLabel(read, 72)}
                                  labelClassName={TYPE.caption}
                                  eyebrow="Primary control"
                                  sections={[{ label: "Control read", text: read }]}
                                />
                              );
                            })()}
                          </div>
                          {resolveConceptName(controls.primary_control) !== controls.primary_control && (
                            <p className="text-label text-muted-foreground/75 mt-1.5">{controls.primary_control}</p>
                          )}
                        </div>
                        {controls.registration_control && (() => {
                          const regId   = controls.registration_control!;
                          const regName = resolveConceptName(regId);
                          return (
                            <div className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4">
                              <div className="text-micro uppercase tracking-widest text-muted-foreground/75 mb-1">{term.Singular} control</div>
                              <p className={TYPE.title}>{regName}</p>
                              {controls.registration_control_read && (() => {
                                const read = resolveControlText(controls.registration_control_read, regId);
                                return (
                                  <div className="mt-1.5">
                                    <DetailReveal
                                      label={deriveLabel(read, 72)}
                                      labelClassName={TYPE.caption}
                                      eyebrow={`${term.Singular} control`}
                                      sections={[{ label: "Control read", text: read }]}
                                    />
                                  </div>
                                );
                              })()}
                              {regName !== regId && (
                                <p className="text-label text-muted-foreground/75 mt-1.5">{regId}</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </SectionCard>
                  )}

                  {/* ── Sub-page drill-in cards ───────────────────── */}
                  <SectionCard title="Analysis modules" desc="Same data · different slices" right={<SectionInfoIcon tip="Deeper views of the same data sliced by library, audience, placements, and budget." />}>
                    <div className="grid grid-cols-dashboard-2 gap-3">
                      {subpages.map((s) => (
                        <div key={s.to} className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <s.Icon className="w-3.5 h-3.5 text-interactive" />
                            <span className={TYPE.title}>{s.label}</span>
                            <InfoTooltip content={s.desc} />
                          </div>
                          <div className="flex items-center justify-between mt-auto pt-1">
                            <span className="text-micro uppercase tracking-widest text-muted-foreground/75">{s.stat}</span>
                            <CrossLink to={s.to} label="Open" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <div className="flex items-center gap-3 pt-1">
                    <LoopAction to="/app/strategy/overview" label="Continue to Strategy" icon="strategy" />
                  </div>
                </div>
              </>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
