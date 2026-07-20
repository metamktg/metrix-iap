// ─── Analysis · Audience Intelligence ─────────────────────────────────
// Three differentiated views of the demographic conversion pocket signal:
//
//   Intelligence Map — CVR × Link CTR scatter; bubbles sized by spend
//     share, colored by CPA efficiency vs. the account median. Quadrant
//     reference lines reveal Scale / Protect / Fix / Test strategy zones.
//
//   Pocket Grid — audience pocket tiles (age × gender cards) with
//     efficiency halo, spend share bar, KPI triad, and concept attribution
//     chips. Sortable by any KPI via RankSortBar.
//
//   Ranked — KPI-ranked rows with proportional share bars (existing view).
//
// All three views open the full SegmentDrilldownModal for messaging
// attribution on click. Data integrity rules from segment-analytics.ts are
// unchanged — nothing is estimated.

import { useMemo, useState, useCallback } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import type { DemographicRow } from "@/lib/data/seedTypes";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState, SkeletonTileRow,
} from "../shared";
import { TYPE } from "../typography";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  Users, Map, LayoutGrid, List, ArrowRight,
  AlertTriangle, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopeDemographicRows, cellGrainRows,
  listSegments, rowsForSegment,
  computeSegmentTotals, deriveSegmentMetrics,
  assessSegmentSignal, segmentLabel,
  type SegmentId, type SegmentRawTotals,
  type SegmentDerivedMetrics, type SegmentSignal,
} from "@/lib/segment-analytics";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import {
  RankSortBar, KpiStat, sortByRankMetric, useRankMetric,
  rankBarPct, type RankMetric,
} from "./rankSort";

// ── Types ─────────────────────────────────────────────────────────────

type ViewMode = "map" | "pockets" | "ranked";

interface SegmentEntry {
  seg: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
  signal: SegmentSignal;
}

interface ScatterPoint {
  x: number;
  y: number;
  spendShare: number;
  entry: SegmentEntry;
}

// ── Pure helpers ──────────────────────────────────────────────────────

function numMedian(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function topConcepts(cellRows: DemographicRow[], seg: SegmentId, max = 2): string[] {
  const seen = new Set<string>();
  for (const r of cellRows) {
    if (r.Age === seg.age && r.Gender === seg.gender && r.book2_concept_name) {
      seen.add(r.book2_concept_name);
      if (seen.size >= max) break;
    }
  }
  return Array.from(seen);
}

type CpaEff = "efficient" | "average" | "costly" | "unknown";

function cpaEff(cpa: number | null, med: number): CpaEff {
  if (cpa == null || med <= 0) return "unknown";
  const ratio = cpa / med;
  if (ratio < 0.85) return "efficient";
  if (ratio <= 1.15) return "average";
  return "costly";
}

const EFF_COLOR: Record<CpaEff, string> = {
  efficient: "rgb(52,211,153)",
  average:   "rgb(99,102,241)",
  costly:    "rgb(251,191,36)",
  unknown:   "rgb(100,116,139)",
};

const EFF_LABEL: Record<CpaEff, string> = {
  efficient: "Efficient",
  average:   "On target",
  costly:    "High CPA",
  unknown:   "—",
};

function buildRankMetrics(resultPlural: string): RankMetric<SegmentEntry>[] {
  return [
    { id: "results",     label: resultPlural,  direction: "desc", value: (e) => e.totals.results,     format: fmtNum },
    { id: "spend",       label: "Spend",        direction: "desc", value: (e) => e.totals.spend,       format: (v) => fmtUSD(v, 0) },
    { id: "cpa",         label: "CPA",          direction: "asc",  value: (e) => e.derived.cpa,        format: fmtUSD },
    { id: "ctr",         label: "Link CTR",     direction: "desc", value: (e) => e.derived.ctr,        format: fmtPct },
    { id: "cvr",         label: "CVR",          direction: "desc", value: (e) => e.derived.cvr,        format: fmtPct },
    { id: "cpm",         label: "CPM",          direction: "asc",  value: (e) => e.derived.cpm,        format: fmtUSD },
    { id: "impressions", label: "Impressions",  direction: "desc", value: (e) => e.totals.impressions, format: fmtNum },
  ];
}

// ── View toggle ───────────────────────────────────────────────────────

const VIEW_TABS: { id: ViewMode; label: string; Icon: React.ElementType }[] = [
  { id: "map",     label: "Intelligence Map", Icon: Map },
  { id: "pockets", label: "Pocket Grid",      Icon: LayoutGrid },
  { id: "ranked",  label: "Ranked",           Icon: List },
];

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-border/30 bg-white/[0.02] p-0.5"
      role="group"
      aria-label="Audience view mode"
    >
      {VIEW_TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-pressed={mode === id}
          className={cn(
            "flex items-center gap-1.5 h-7 px-3 rounded-md transition-colors",
            TYPE.label, "font-medium",
            mode === id
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground/55 hover:text-muted-foreground"
          )}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Intelligence Map ──────────────────────────────────────────────────
// Quadrant framing: X = Link CTR (ad engagement), Y = CVR (offer/landing fit).
// Together they isolate WHERE in the funnel each audience pocket is strong.

const QUADRANT_LABELS = [
  { top: true,  right: true,  label: "Scale Now",   sub: "High intent · converts" },
  { top: true,  right: false, label: "Niche",        sub: "Deep fit · tight reach" },
  { top: false, right: true,  label: "Fix Funnel",   sub: "Clicks don't convert" },
  { top: false, right: false, label: "Test More",    sub: "Low signal — cut or expand" },
];

function IntelligenceMapTab({
  entries, totalSpend, medianCpa, onSelect, resultPlural,
}: {
  entries: SegmentEntry[];
  totalSpend: number;
  medianCpa: number;
  onSelect: (seg: SegmentId) => void;
  resultPlural: string;
}) {
  const plotData = entries
    .filter((e) => e.derived.ctr != null && e.derived.cvr != null)
    .map<ScatterPoint>((e) => ({
      x: e.derived.ctr!,
      y: e.derived.cvr!,
      spendShare: totalSpend > 0 ? (e.totals.spend ?? 0) / totalSpend : 0,
      entry: e,
    }));

  const unplottable = entries.filter(
    (e) => e.derived.ctr == null || e.derived.cvr == null
  );

  const medCtr = numMedian(plotData.map((p) => p.x));
  const medCvr = numMedian(plotData.map((p) => p.y));

  const BubbleShape = useCallback(
    (props: { cx?: number; cy?: number; payload?: ScatterPoint }) => {
      const { cx = 0, cy = 0, payload } = props;
      if (!payload) return null;
      const r = 7 + payload.spendShare * 28;
      const eff = cpaEff(payload.entry.derived.cpa, medianCpa);
      const fill = EFF_COLOR[eff];
      const lbl = segmentLabel(payload.entry.seg);
      const abbr =
        lbl.split(" ")[0][0] + payload.entry.seg.age.split("-")[0];
      return (
        <g
          role="img"
          aria-label={lbl}
          onClick={() => onSelect(payload.entry.seg)}
          style={{ cursor: "pointer" }}
        >
          <circle cx={cx} cy={cy} r={r + 5} fill={fill} fillOpacity={0.06} />
          <circle
            cx={cx} cy={cy} r={r}
            fill={fill} fillOpacity={0.7}
            stroke="rgba(255,255,255,0.13)" strokeWidth={1.5}
          />
          <text
            x={cx} y={cy + 0.5}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fontWeight={700}
            fill="rgba(255,255,255,0.9)"
            style={{ pointerEvents: "none" }}
          >
            {abbr}
          </text>
        </g>
      );
    },
    [medianCpa, onSelect]
  );

  function MapTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    const eff = cpaEff(pt.entry.derived.cpa, medianCpa);
    return (
      <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5 elevation-floating min-w-[160px]">
        <p className={cn(TYPE.title, "font-semibold text-foreground mb-2")}>
          {segmentLabel(pt.entry.seg)}
        </p>
        <div className={cn("space-y-1", TYPE.caption, "text-muted-foreground")}>
          {[
            ["Link CTR", fmtPct(pt.x)],
            ["CVR", fmtPct(pt.y)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span>{k}</span>
              <span className="tabular-nums text-foreground/80">{v}</span>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <span>CPA</span>
            <span className="tabular-nums font-semibold" style={{ color: EFF_COLOR[eff] }}>
              {pt.entry.derived.cpa != null ? fmtUSD(pt.entry.derived.cpa) : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>{resultPlural}</span>
            <span className="tabular-nums text-foreground/80">{fmtNum(pt.entry.totals.results)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Spend</span>
            <span className="tabular-nums text-foreground/80">{fmtUSD(pt.entry.totals.spend ?? 0, 0)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (plotData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50 gap-2">
        <TrendingUp className="w-8 h-8" />
        <p className={TYPE.body}>No segments have both CTR and CVR data to plot.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* CPA color legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(["efficient", "average", "costly"] as CpaEff[]).map((eff) => (
          <div key={eff} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EFF_COLOR[eff] }} />
            <span className={cn(TYPE.label, "text-muted-foreground/55")}>
              {eff === "efficient" ? "Below-median CPA" : eff === "costly" ? "Above-median CPA" : "Near-median CPA"}
            </span>
          </div>
        ))}
        <span className={cn(TYPE.label, "text-muted-foreground/35")}>· Bubble size = spend share</span>
      </div>

      {/* Chart + quadrant overlay */}
      <div className="relative w-full rounded-xl border border-border/20 bg-white/[0.01] overflow-hidden" style={{ height: 460 }}>
        {/* Quadrant labels */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ left: 60, right: 20, top: 10, bottom: 50 }}
        >
          {QUADRANT_LABELS.map(({ top, right, label, sub }) => (
            <div
              key={label}
              className={cn(
                "absolute flex flex-col gap-0.5",
                top ? "top-2" : "bottom-2",
                right ? "right-2 items-end text-right" : "left-2 items-start"
              )}
            >
              <span className={cn(TYPE.label, "font-semibold text-muted-foreground/20")}>{label}</span>
              <span className={cn(TYPE.label, "text-muted-foreground/12 hidden sm:block")}>{sub}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 50, left: 60 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
              tickLine={false}
              label={{
                value: "Link CTR — ad engagement →",
                position: "insideBottom",
                offset: -30,
                fill: "rgba(148,163,184,0.4)",
                fontSize: 10,
              }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fill: "rgba(148,163,184,0.55)", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
              tickLine={false}
              label={{
                value: "CVR — conversion efficiency →",
                angle: -90,
                position: "insideLeft",
                offset: 50,
                fill: "rgba(148,163,184,0.4)",
                fontSize: 10,
              }}
            />
            {medCtr > 0 && (
              <ReferenceLine
                x={medCtr}
                stroke="rgba(99,102,241,0.22)"
                strokeDasharray="4 3"
                label={{ value: "median", position: "insideTopRight", fill: "rgba(99,102,241,0.35)", fontSize: 9 }}
              />
            )}
            {medCvr > 0 && (
              <ReferenceLine
                y={medCvr}
                stroke="rgba(99,102,241,0.22)"
                strokeDasharray="4 3"
                label={{ value: "median", position: "insideTopRight", fill: "rgba(99,102,241,0.35)", fontSize: 9 }}
              />
            )}
            <Tooltip content={<MapTooltip />} cursor={false} />
            <Scatter data={plotData} shape={BubbleShape as any} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {unplottable.length > 0 && (
        <p className={cn(TYPE.label, "text-muted-foreground/30")}>
          {unplottable.length} segment{unplottable.length > 1 ? "s" : ""} omitted — missing CTR/CVR:{" "}
          {unplottable.map((e) => segmentLabel(e.seg)).join(", ")}
        </p>
      )}
    </div>
  );
}

// ── Pocket Card ───────────────────────────────────────────────────────

function PocketCard({
  entry, cellRows, totalSpend, medianCpa, onSelect, resultPlural,
}: {
  entry: SegmentEntry;
  cellRows: DemographicRow[];
  totalSpend: number;
  medianCpa: number;
  onSelect: (seg: SegmentId) => void;
  resultPlural: string;
}) {
  const eff = cpaEff(entry.derived.cpa, medianCpa);
  const color = EFF_COLOR[eff];
  const spendPct = totalSpend > 0 ? ((entry.totals.spend ?? 0) / totalSpend) * 100 : 0;
  const concepts = topConcepts(cellRows, entry.seg, 2);

  return (
    <button
      onClick={() => onSelect(entry.seg)}
      data-testid={`row-audience-segment-${entry.seg.age}-${entry.seg.gender}`}
      className={cn(
        "w-full text-left rounded-xl border border-border/30 bg-white/[0.012]",
        "hover:border-primary/25 hover:bg-primary/[0.02] active:scale-[0.997]",
        "transition-all duration-100 group overflow-hidden flex flex-col"
      )}
    >
      {/* Efficiency stripe */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ background: `linear-gradient(90deg, ${color}55 0%, ${color}18 100%)` }}
      />

      <div className="px-4 py-3.5 flex flex-col gap-2.5 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={cn(TYPE.title, "font-bold text-foreground/90 truncate block")}>
              {segmentLabel(entry.seg)}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={cn(TYPE.label, "font-semibold")} style={{ color }}>
                {EFF_LABEL[eff]}
              </span>
              {entry.signal.low && (
                <span
                  className={cn(TYPE.label, "text-amber-300/55 flex items-center gap-0.5")}
                  title={entry.signal.reasons.join(" ")}
                >
                  <AlertTriangle className="w-3 h-3 inline" /> Low signal
                </span>
              )}
            </div>
          </div>
          <span
            className={cn(
              TYPE.label, "font-semibold shrink-0",
              "inline-flex items-center gap-1 h-6 px-2 rounded-md",
              "opacity-50 group-hover:opacity-100 transition-opacity"
            )}
            style={{ background: `${color}18`, color }}
          >
            Explore <ArrowRight className="w-3 h-3" />
          </span>
        </div>

        {/* Spend share bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={cn(TYPE.label, "text-muted-foreground/35")}>Spend share</span>
            <span className={cn(TYPE.label, "text-muted-foreground/55 tabular-nums")}>
              {spendPct.toFixed(1)}%
            </span>
          </div>
          <div
            className="h-[4px] rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)" }}
            role="progressbar"
            aria-valuenow={Math.round(spendPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(spendPct, 100)}%`,
                backgroundColor: color,
                opacity: 0.45,
              }}
            />
          </div>
        </div>

        {/* KPI triad */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "CPA",     value: entry.derived.cpa != null ? fmtUSD(entry.derived.cpa) : "—" },
            { label: "CVR",     value: entry.derived.cvr != null ? fmtPct(entry.derived.cvr) : "—" },
            { label: "Link CTR",value: entry.derived.ctr != null ? fmtPct(entry.derived.ctr) : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className={cn(TYPE.label, "text-muted-foreground/40")}>{label}</span>
              <span className={cn(TYPE.body, "font-semibold tabular-nums text-foreground/80")}>{value}</span>
            </div>
          ))}
        </div>

        {/* Results + spend footer */}
        <p className={cn(TYPE.label, "text-muted-foreground/45 tabular-nums")}>
          {fmtNum(entry.totals.results)} {resultPlural.toLowerCase()}
          {entry.totals.spend != null && ` · ${fmtUSD(entry.totals.spend, 0)}`}
        </p>

        {/* Concept attribution chips */}
        {concepts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {concepts.map((c) => (
              <span
                key={c}
                className={cn(
                  TYPE.label,
                  "px-1.5 py-0.5 rounded-full border border-border/20 bg-white/[0.025] text-muted-foreground/45 truncate max-w-[130px]"
                )}
                title={c}
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Pocket Grid tab ───────────────────────────────────────────────────

function PocketGridTab({
  ranked, cellRows, totalSpend, medianCpa, onSelect,
  rankMetrics, activeMetric, onSelectMetric, resultPlural,
}: {
  ranked: SegmentEntry[];
  cellRows: DemographicRow[];
  totalSpend: number;
  medianCpa: number;
  onSelect: (seg: SegmentId) => void;
  rankMetrics: RankMetric<SegmentEntry>[];
  activeMetric: RankMetric<SegmentEntry>;
  onSelectMetric: (id: string) => void;
  resultPlural: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={cn(TYPE.label, "text-muted-foreground/40")}>
          {ranked.length} audience pocket{ranked.length !== 1 ? "s" : ""} — click any tile for messaging attribution
        </p>
        <RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={onSelectMetric} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ranked.map((e) => (
          <PocketCard
            key={`${e.seg.age}|${e.seg.gender}`}
            entry={e}
            cellRows={cellRows}
            totalSpend={totalSpend}
            medianCpa={medianCpa}
            onSelect={onSelect}
            resultPlural={resultPlural}
          />
        ))}
      </div>
    </div>
  );
}

// ── Ranked List tab ───────────────────────────────────────────────────

function RankedListTab({
  ranked, activeMetric, onSelect, onSelectMetric, rankMetrics, resultPlural,
}: {
  ranked: SegmentEntry[];
  activeMetric: RankMetric<SegmentEntry>;
  onSelect: (seg: SegmentId) => void;
  onSelectMetric: (id: string) => void;
  rankMetrics: RankMetric<SegmentEntry>[];
  resultPlural: string;
}) {
  const metricValues = ranked.map((e) => activeMetric.value(e));

  return (
    <SectionCard
      title="Segment performance"
      desc="All cells · re-rank by KPI · click a segment for drivers"
      table="demographic_registration_signal"
      right={<RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={onSelectMetric} />}
    >
      <div className="space-y-2">
        {ranked.map((e, idx) => {
          const v = activeMetric.value(e);
          const barPct = rankBarPct(v, metricValues, activeMetric.direction);
          return (
            <button
              key={e.seg.age + e.seg.gender}
              onClick={() => onSelect(e.seg)}
              data-testid={`row-audience-segment-${e.seg.age}-${e.seg.gender}`}
              className={cn(
                "w-full text-left rounded-lg px-4 py-3.5 border border-border/30 bg-white/[0.01]",
                "hover:border-primary/30 hover:bg-primary/[0.03] active:scale-[0.998]",
                "transition-all duration-100 group"
              )}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="w-4 shrink-0 font-mono text-muted-foreground/35 tabular-nums text-right text-[10px]">
                  {idx + 1}
                </span>
                <span className={cn(TYPE.title, "font-semibold text-foreground/90 flex-1 truncate")}>
                  {segmentLabel(e.seg)}
                </span>
                {e.signal.low && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[8px] font-mono uppercase text-amber-300/65 shrink-0"
                    title={e.signal.reasons.join(" ")}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Low
                  </span>
                )}
                <span className={cn(TYPE.title, "font-bold tabular-nums text-foreground/80 shrink-0 mr-1")}>
                  {v != null ? activeMetric.format(v) : "—"}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-md text-label font-semibold bg-gradient-to-r from-violet-500 to-blue-500 text-white opacity-55 group-hover:opacity-100 transition-opacity shadow-sm shadow-violet-900/30">
                  Explore <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="ml-6 h-[6px] rounded-full bg-white/[0.05] overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/45 to-primary/65 group-hover:from-primary/60 group-hover:to-primary/80 transition-colors"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="ml-6 flex items-center gap-4 flex-wrap">
                <KpiStat label={resultPlural}  value={fmtNum(e.totals.results)}                                   highlight={activeMetric.id === "results"} />
                <KpiStat label="CPA"           value={e.derived.cpa != null ? fmtUSD(e.derived.cpa) : "—"}       highlight={activeMetric.id === "cpa"} />
                <KpiStat label="Spend"         value={e.totals.spend != null ? fmtUSD(e.totals.spend, 0) : "—"}  highlight={activeMetric.id === "spend"} />
                <KpiStat label="CTR"           value={e.derived.ctr != null ? fmtPct(e.derived.ctr) : "—"}       highlight={activeMetric.id === "ctr"} />
              </div>
            </button>
          );
        })}
      </div>
      <p className={cn("mt-3", TYPE.label, "text-muted-foreground/45")}>
        Bar length is relative to the best segment on {activeMetric.label}.{" "}
        {ranked.length} segment{ranked.length !== 1 ? "s" : ""} — click any row for its messaging attribution.
      </p>
    </SectionCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────

const SECTION = "Analysis · 03";
const VIEW_KEY = "metrix.audience.view.v1";
const RANK_KEY = "metrix.audience.rank.v1";

export function AudienceView() {
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const { rangeHasData } = useDateRange();

  const [selectedSeg, setSelectedSeg] = useState<SegmentId | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as ViewMode | null) ?? "pockets"; } catch { return "pockets"; }
  });

  const handleViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    try { localStorage.setItem(VIEW_KEY, m); } catch { /* storage blocked */ }
  }, []);

  const scopedRows = useMemo(
    () => scopeDemographicRows(analysis?.demographic_registration_signal ?? [], null),
    [analysis]
  );

  const cellRows = useMemo(
    () => cellGrainRows(analysis?.demographic_registration_signal ?? [], null),
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

  const term = account
    ? resultTerm(account)
    : { singular: "result", plural: "results", Plural: "Results" };

  const rankMetrics = useMemo(() => buildRankMetrics(term.Plural), [term.Plural]);
  const { activeId, select } = useRankMetric(RANK_KEY, rankMetrics.map((m) => m.id), "results");
  const activeMetric = rankMetrics.find((m) => m.id === activeId) ?? rankMetrics[0];
  const ranked = useMemo(() => sortByRankMetric(entries, activeMetric), [entries, activeMetric]);

  const totalSpend   = entries.reduce((n, e) => n + (e.totals.spend ?? 0), 0);
  const totalResults = entries.reduce((n, e) => n + (e.totals.results ?? 0), 0);
  const best = ranked[0];

  const medianCpa = useMemo(() => {
    return numMedian(entries.filter((e) => e.derived.cpa != null).map((e) => e.derived.cpa!));
  }, [entries]);

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
                <PendingState
                  title="No demographic signal"
                  message="Audience intelligence appears once demographic result data exists."
                  icon={Users}
                  action={<CrossLink to="/app/analysis/overview" label="Return to Analysis Overview" />}
                />
              </div>
            );
          }

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Audience"
                account={acct}
                subtitle="Audience intelligence: who converts, where the funnel holds, and what creative each pocket responds to."
                table="demographic_registration_signal"
                tabs="analysis"
              />
              <RangeScopeBar grainNote="Demographic signal aggregates each cell's full flight window — no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="audience data" />
              ) : (
                <>
                  {isRefetching ? (
                    <div className="px-6 pt-5"><SkeletonTileRow count={4} /></div>
                  ) : (
                    <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                      <MetricTile label="Pockets" value={fmtNum(entries.length)} />
                      <MetricTile label="Signal spend" value={fmtUSD(totalSpend, 0)} />
                      <MetricTile label={term.Plural} value={fmtNum(totalResults)} />
                      <MetricTile
                        label={`Prime · ${activeMetric.label}`}
                        value={best ? segmentLabel(best.seg) : "—"}
                        sub={
                          best && activeMetric.value(best) != null
                            ? `${activeMetric.format(activeMetric.value(best)!)} ${activeMetric.label.toLowerCase()}`
                            : undefined
                        }
                      />
                    </div>
                  )}

                  <div className="px-6 py-5 space-y-5 max-w-5xl">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h2 className="text-base font-semibold text-foreground/80">Audience Pockets</h2>
                      <ViewToggle mode={viewMode} onChange={handleViewMode} />
                    </div>

                    {viewMode === "map" && (
                      <IntelligenceMapTab
                        entries={entries}
                        totalSpend={totalSpend}
                        medianCpa={medianCpa}
                        onSelect={setSelectedSeg}
                        resultPlural={term.Plural}
                      />
                    )}

                    {viewMode === "pockets" && (
                      <PocketGridTab
                        ranked={ranked}
                        cellRows={cellRows}
                        totalSpend={totalSpend}
                        medianCpa={medianCpa}
                        onSelect={setSelectedSeg}
                        rankMetrics={rankMetrics}
                        activeMetric={activeMetric}
                        onSelectMetric={select}
                        resultPlural={term.Plural}
                      />
                    )}

                    {viewMode === "ranked" && (
                      <RankedListTab
                        ranked={ranked}
                        activeMetric={activeMetric}
                        onSelect={setSelectedSeg}
                        onSelectMetric={select}
                        rankMetrics={rankMetrics}
                        resultPlural={term.Plural}
                      />
                    )}
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
          kicker="Audience pocket"
        />
      )}
    </>
  );
}
