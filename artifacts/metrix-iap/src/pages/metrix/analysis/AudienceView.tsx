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
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  SkeletonTileRow, DatePresetBar, type ViewPreset, SegmentedToggle, SectionInfoIcon,
  useShowMore, ShowMoreButton, SegmentGenderIcon,
} from "../shared";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import type { DemographicRow } from "@/lib/data/seedTypes";
import { TYPE } from "../typography";
import {
  Users, Map, LayoutGrid, List, ArrowRight,
  AlertTriangle, TrendingUp,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  scopeDemographicRows,
  listSegments, rowsForSegment,
  computeSegmentTotals, deriveSegmentMetrics,
  assessSegmentSignal, segmentLabel,
  type SegmentId, type SegmentRawTotals,
  type SegmentDerivedMetrics, type SegmentSignal,
} from "@/lib/segment-analytics";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import {
  RankSortBar, KpiStat, sortByRankMetric, useRankMetric,
  rankBarPct, MetricPickerTile, type RankMetric, type MetricGroup,
  type ResolvedMetricOption,
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

type CpaEff = "efficient" | "average" | "costly" | "unknown";

function cpaEff(cpa: number | null, med: number): CpaEff {
  if (cpa == null || med <= 0) return "unknown";
  const ratio = cpa / med;
  if (ratio < 0.85) return "efficient";
  if (ratio <= 1.15) return "average";
  return "costly";
}

const EFF_COLOR: Record<CpaEff, string> = {
  efficient: "hsl(var(--chart-3))",
  average:   "hsl(var(--chart-1))",
  costly:    "hsl(var(--chart-4))",
  unknown:   "hsl(var(--chart-5))",
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
    { id: "impressions", label: "Impressions",  direction: "desc", value: (e) => e.totals.impressions, format: fmtNum },
    { id: "cvr",         label: "CVR",          direction: "desc", value: (e) => e.derived.cvr,        format: fmtPct },
    { id: "cpm",         label: "CPM",          direction: "asc",  value: (e) => e.derived.cpm,        format: fmtUSD },
    { id: "atcRate",     label: "Add to cart rate", direction: "desc", value: (e) => e.derived.addToCartRate,   format: fmtPct },
    { id: "costPerAtc",  label: "Cost per ATC",     direction: "asc",  value: (e) => e.derived.costPerAddToCart, format: fmtUSD },
    { id: "checkoutRate", label: "Checkout rate",   direction: "desc", value: (e) => e.derived.checkoutRate,    format: fmtPct },
  ];
}

/**
 * Same 10 metrics as buildRankMetrics, resolved to a single account-wide
 * value (spend-weighted where applicable — e.g. CVR/CTR/CPM come from
 * deriveSegmentMetrics on the SUMMED totals, never a naive average of each
 * segment's own rate) so the header KPI tiles can swap between them without
 * showing a statistically wrong blended number.
 */
function buildResolvedAudienceMetrics(
  totals: SegmentRawTotals,
  derived: SegmentDerivedMetrics,
  resultPlural: string,
): ResolvedMetricOption[] {
  return [
    { id: "results",      label: resultPlural,       formatted: fmtNum(totals.results ?? 0) },
    { id: "spend",        label: "Spend",             formatted: fmtUSD(totals.spend ?? 0, 0) },
    { id: "cpa",          label: "CPA",               formatted: derived.cpa != null ? fmtUSD(derived.cpa) : "—" },
    { id: "ctr",          label: "Link CTR",          formatted: derived.ctr != null ? fmtPct(derived.ctr) : "—" },
    { id: "impressions",  label: "Impressions",       formatted: fmtNum(totals.impressions ?? 0) },
    { id: "cvr",          label: "CVR",               formatted: derived.cvr != null ? fmtPct(derived.cvr) : "—" },
    { id: "cpm",          label: "CPM",               formatted: derived.cpm != null ? fmtUSD(derived.cpm) : "—" },
    { id: "atcRate",      label: "Add to cart rate",  formatted: derived.addToCartRate != null ? fmtPct(derived.addToCartRate) : "—" },
    { id: "costPerAtc",   label: "Cost per ATC",      formatted: derived.costPerAddToCart != null ? fmtUSD(derived.costPerAddToCart) : "—" },
    { id: "checkoutRate", label: "Checkout rate",     formatted: derived.checkoutRate != null ? fmtPct(derived.checkoutRate) : "—" },
  ];
}

const AUDIENCE_RANK_GROUPS: MetricGroup[] = [
  { label: "Performance", ids: ["results", "spend", "cpa"] },
  { label: "Traffic",     ids: ["ctr", "impressions"] },
  { label: "Engagement",  ids: ["cvr", "cpm"] },
  { label: "Downstream intent", ids: ["atcRate", "costPerAtc", "checkoutRate"] },
];

// ── View toggle ───────────────────────────────────────────────────────

const VIEW_TABS: { id: ViewMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "map",     label: "Intelligence Map", Icon: Map },
  { id: "pockets", label: "Pocket Grid",      Icon: LayoutGrid },
  { id: "ranked",  label: "Ranked",           Icon: List },
];

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <SegmentedToggle
      ariaLabel="Audience view mode"
      options={VIEW_TABS}
      active={mode}
      onChange={onChange}
      responsiveLabels
    />
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
  entries, totalSpend, medianCpa, onSelect, resultPlural, topSeg,
}: {
  entries: SegmentEntry[];
  totalSpend: number;
  medianCpa: number;
  onSelect: (seg: SegmentId) => void;
  resultPlural: string;
  topSeg?: SegmentEntry;
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
      const isTop =
        topSeg != null &&
        payload.entry.seg.age === topSeg.seg.age &&
        payload.entry.seg.gender === topSeg.seg.gender;
      const r = (isTop ? 9 : 7) + payload.spendShare * 28;
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
          <circle cx={cx} cy={cy} r={r + 5} fill={fill} fillOpacity={isTop ? 0.15 : 0.06} />
          <circle
            cx={cx} cy={cy} r={r}
            fill={fill} fillOpacity={isTop ? 0.9 : 0.7}
            stroke={isTop ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.13)"}
            strokeWidth={isTop ? 2 : 1.5}
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
    [medianCpa, onSelect, topSeg]
  );

  function MapTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    const eff = cpaEff(pt.entry.derived.cpa, medianCpa);
    return (
      <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5 elevation-floating min-w-[160px]">
        <p className="flex items-center gap-1.5 mb-2">
          <SegmentGenderIcon gender={pt.entry.seg.gender} />
          <span className={cn(TYPE.title, "text-foreground")}>
            {segmentLabel(pt.entry.seg)}
          </span>
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
            <span className={cn(TYPE.label, "text-muted-foreground/70")}>
              {eff === "efficient" ? "Below-median CPA" : eff === "costly" ? "Above-median CPA" : "Near-median CPA"}
            </span>
          </div>
        ))}
        <span className={cn(TYPE.label, "text-muted-foreground/65")}>· Bubble size = spend share</span>
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
              <span className={cn(TYPE.label, "font-semibold text-muted-foreground/40")}>{label}</span>
              <span className={cn(TYPE.label, "text-muted-foreground/40 hidden sm:block")}>{sub}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 50, left: 60 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.10)" />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              label={{
                value: "Link CTR — ad engagement →",
                position: "insideBottom",
                offset: -30,
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
              }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              label={{
                value: "CVR — conversion efficiency →",
                angle: -90,
                position: "insideLeft",
                offset: 50,
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
              }}
            />
            {medCtr > 0 && (
              <ReferenceLine
                x={medCtr}
                stroke="hsl(var(--chart-1) / 0.30)"
                strokeDasharray="4 3"
                label={{ value: "median", position: "insideTopRight", fill: "hsl(var(--chart-1) / 0.70)", fontSize: 9 }}
              />
            )}
            {medCvr > 0 && (
              <ReferenceLine
                y={medCvr}
                stroke="hsl(var(--chart-1) / 0.30)"
                strokeDasharray="4 3"
                label={{ value: "median", position: "insideTopRight", fill: "hsl(var(--chart-1) / 0.70)", fontSize: 9 }}
              />
            )}
            <Tooltip content={<MapTooltip />} cursor={false} />
            <Scatter data={plotData} shape={BubbleShape as any} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {unplottable.length > 0 && (
        <p className={cn(TYPE.label, "text-muted-foreground/55")}>
          {unplottable.length} segment{unplottable.length > 1 ? "s" : ""} omitted — missing CTR/CVR:{" "}
          {unplottable.map((e) => segmentLabel(e.seg)).join(", ")}
        </p>
      )}
    </div>
  );
}

// ── Pocket Card — L1: efficiency stripe + name + CPA only ─────────────
// Full KPI breakdown, spend share, and concept attribution are in the
// SegmentDrilldownModal (L3) — opened by clicking any card.

function PocketCard({
  entry, medianCpa, onSelect,
}: {
  entry: SegmentEntry;
  medianCpa: number;
  onSelect: (seg: SegmentId) => void;
}) {
  const eff = cpaEff(entry.derived.cpa, medianCpa);
  const color = EFF_COLOR[eff];

  return (
    <button
      onClick={() => onSelect(entry.seg)}
      data-testid={`row-audience-segment-${entry.seg.age}-${entry.seg.gender}`}
      className={cn(
        "w-full text-left rounded-xl border border-border/30",
        "hover:border-primary/25 active:scale-[0.997]",
        "transition-all duration-100 group overflow-hidden flex flex-col"
      )}
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, ${color}06 60%, rgba(255,255,255,0.01) 100%)`,
      }}
    >
      {/* Efficiency stripe — visual-only efficiency signal */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ background: `linear-gradient(90deg, ${color}77 0%, ${color}22 100%)` }}
      />

      <div className="px-4 py-3 flex flex-col gap-1.5 flex-1">
        {/* L1: name + efficiency label + low-signal flag */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <SegmentGenderIcon gender={entry.seg.gender} />
              <span className={cn(TYPE.title, "text-foreground/90 truncate flex-1 min-w-0")}>
                {segmentLabel(entry.seg)}
              </span>
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

        {/* L1: single primary metric — CPA */}
        {entry.derived.cpa != null && (
          <div className="flex items-baseline gap-1.5">
            <span className={cn(TYPE.body, "font-semibold tabular-nums text-foreground/80")}>
              {fmtUSD(entry.derived.cpa)}
            </span>
            <span className={cn(TYPE.label, "text-muted-foreground/40")}>CPA</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Pocket Grid tab ───────────────────────────────────────────────────

function PocketGridTab({
  ranked, medianCpa, onSelect,
  rankMetrics, activeMetric, onSelectMetric,
}: {
  ranked: SegmentEntry[];
  medianCpa: number;
  onSelect: (seg: SegmentId) => void;
  rankMetrics: RankMetric<SegmentEntry>[];
  activeMetric: RankMetric<SegmentEntry>;
  onSelectMetric: (id: string) => void;
}) {
  const fold = useShowMore(ranked, 10);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={cn(TYPE.label, "text-muted-foreground/40")}>
          {ranked.length} pocket{ranked.length !== 1 ? "s" : ""}
        </p>
        <RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={onSelectMetric} groups={AUDIENCE_RANK_GROUPS} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fold.visible.map((e) => (
          <PocketCard
            key={`${e.seg.age}|${e.seg.gender}`}
            entry={e}
            medianCpa={medianCpa}
            onSelect={onSelect}
          />
        ))}
      </div>
      <ShowMoreButton total={ranked.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="segments" />
    </div>
  );
}

// ── Ranked List tab ───────────────────────────────────────────────────

// ── Share balance — spend share vs result share, per pocket ───────────
// Nocturne "Metrix v1" composition: two thin proportional bars per
// segment (budget share vs result share) with the gap called out in
// points. Everything is a share of the real scoped totals — a pocket
// with no results simply shows a 0-width result bar, never an estimate.

function ShareBalanceCard({ entries, onSelect }: {
  entries: SegmentEntry[];
  onSelect: (seg: SegmentId) => void;
}) {
  const totalSpend = entries.reduce((n, e) => n + (e.totals.spend ?? 0), 0);
  const totalResults = entries.reduce((n, e) => n + (e.totals.results ?? 0), 0);
  if (totalSpend <= 0) return null;

  const rows = entries
    .map((e) => {
      const spendShare = ((e.totals.spend ?? 0) / totalSpend) * 100;
      const resultShare = totalResults > 0 ? ((e.totals.results ?? 0) / totalResults) * 100 : 0;
      return { e, spendShare, resultShare, gap: Math.round(resultShare - spendShare) };
    })
    .sort((a, b) => b.spendShare - a.spendShare);

  return (
    <SectionCard
      title="Budget vs results"
      desc="Share of spend against share of results · gap in points"
      right={<SectionInfoIcon tip="Each pocket's share of scoped spend next to its share of scoped results. A positive gap returns more than its budget share; a negative gap takes more budget than it returns." />}
    >
      <div className="space-y-2.5" data-testid="share-balance-rows">
        {rows.map(({ e, spendShare, resultShare, gap }) => (
          <button
            key={segmentLabel(e.seg)}
            type="button"
            onClick={() => onSelect(e.seg)}
            data-testid={`share-balance-row-${segmentLabel(e.seg)}`}
            className="w-full text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={cn(TYPE.caption, "font-medium text-foreground/85 inline-flex items-center gap-1.5")}>
                <SegmentGenderIcon gender={e.seg.gender} />
                {segmentLabel(e.seg)}
              </span>
              <span className={cn(
                TYPE.label,
                "tabular-nums",
                gap >= 3 ? "text-emerald-400" : gap <= -3 ? "text-amber-300" : "text-muted-foreground/45",
              )}>
                {gap > 0 ? "+" : ""}{gap}pts
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={cn(TYPE.label, "w-12 shrink-0 text-muted-foreground/45 normal-case")}>Spend</span>
                <div className="flex-1 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(spendShare, 100)}%` }} />
                </div>
                <span className={cn(TYPE.label, "w-9 shrink-0 text-right tabular-nums text-muted-foreground/60")}>
                  {spendShare.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(TYPE.label, "w-12 shrink-0 text-muted-foreground/45 normal-case")}>{totalResults > 0 ? "Results" : "Results —"}</span>
                <div className="flex-1 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
                  <div className="h-full rounded-full bg-chart-2/70" style={{ width: `${Math.min(resultShare, 100)}%` }} />
                </div>
                <span className={cn(TYPE.label, "w-9 shrink-0 text-right tabular-nums text-muted-foreground/60")}>
                  {totalResults > 0 ? `${resultShare.toFixed(0)}%` : "n/a"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function RankedListTab({
  ranked, activeMetric, onSelect, onSelectMetric, rankMetrics, resultPlural, medianCpa,
}: {
  ranked: SegmentEntry[];
  activeMetric: RankMetric<SegmentEntry>;
  onSelect: (seg: SegmentId) => void;
  onSelectMetric: (id: string) => void;
  rankMetrics: RankMetric<SegmentEntry>[];
  resultPlural: string;
  medianCpa: number;
}) {
  const fold = useShowMore(ranked, 10);
  const metricValues = ranked.map((e) => activeMetric.value(e));

  return (
    <SectionCard
      title="Segment performance"
      desc="All cells · re-rank by KPI · click a segment for drivers"
      right={<><SectionInfoIcon tip="Ranks each age–gender pocket by the active KPI so you can spot which segments are driving results and which need attention." /><RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={onSelectMetric} groups={AUDIENCE_RANK_GROUPS} /></>}
    >
      <div className="space-y-2">
        {fold.visible.map((e, idx) => {
          const v = activeMetric.value(e);
          const barPct = rankBarPct(v, metricValues, activeMetric.direction);
          const eff = cpaEff(e.derived.cpa, medianCpa);
          const accentColor = EFF_COLOR[eff];
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
              style={{ borderLeftColor: accentColor, borderLeftWidth: "3px" }}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="w-4 shrink-0 font-mono text-muted-foreground/35 tabular-nums text-right text-label">
                  {idx + 1}
                </span>
                <SegmentGenderIcon gender={e.seg.gender} />
                <span className={cn(TYPE.title, "text-foreground/90 flex-1 truncate")}>
                  {segmentLabel(e.seg)}
                </span>
                {e.signal.low && (
                  <span
                    className="inline-flex items-center gap-0.5 text-label font-mono uppercase text-amber-300/65 shrink-0"
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
      <ShowMoreButton total={ranked.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="segments" />
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

/** Adapt API demographic rows → DemographicRow[] for existing analysis helpers.
 * Note: demographic_performance does not store impressions — Impressions and
 * CTR_link_pct are unavailable for preset windows and default to 0. */
function adaptApiDemoRows(rows: {
  age: string; gender: string; spend: number | null; results: number | null; link_clicks: number | null;
  adds_to_cart?: number | null; checkouts_initiated?: number | null; purchases?: number | null;
  adds_to_cart_value?: number | null;
}[]): DemographicRow[] {
  return rows.map((r) => ({
    cell_id: "",
    "Ad name": "",
    Age: r.age,
    Gender: r.gender,
    "Amount spent (USD)": r.spend ?? 0,
    Reach: 0,
    Impressions: 0,
    Results: r.results ?? 0,
    "Clicks (all)": 0,
    "Link clicks": r.link_clicks ?? 0,
    CPA_result: r.results && r.results > 0 && r.spend ? r.spend / r.results : null,
    CTR_link_pct: 0, // impressions not stored at demographic level
    Result_per_link_click_pct: r.link_clicks && r.link_clicks > 0 && r.results ? (r.results / r.link_clicks) * 100 : 0,
    adds_to_cart: r.adds_to_cart ?? null,
    checkouts_initiated: r.checkouts_initiated ?? null,
    purchases: r.purchases ?? null,
    adds_to_cart_value: r.adds_to_cart_value ?? null,
  }));
}

export function AudienceView() {
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const [selectedSeg, setSelectedSeg] = useState<SegmentId | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as ViewMode | null) ?? "pockets"; } catch { return "pockets"; }
  });
  const [preset, setPreset] = useState<ViewPreset>("all");

  const { data: presetData, isFetching: presetFetching } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", preset),
    enabled: preset !== "all" && !!adAccountId,
  });

  const handleViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    try { localStorage.setItem(VIEW_KEY, m); } catch { /* storage blocked */ }
  }, []);

  // When a preset is active and data has loaded, use the API rows; otherwise seed rows.
  const activeDemoRows = useMemo(() => {
    if (preset !== "all" && presetData) return adaptApiDemoRows(presetData.demographic_rows);
    return analysis?.demographic_registration_signal ?? [];
  }, [preset, presetData, analysis]);

  const scopedRows = useMemo(
    () => scopeDemographicRows(activeDemoRows, null),
    [activeDemoRows]
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

  const totalSpend = entries.reduce((n, e) => n + (e.totals.spend ?? 0), 0);
  const best = ranked[0];

  // Suppress the winner highlight when the active metric has no data for any
  // segment (all values are null). In that case ranked[0] is arbitrary — its
  // position reflects insertion order, not metric leadership — so topSeg is
  // left undefined so IntelligenceMapTab renders no bubble as the winner and
  // the Prime tile falls back to "—".
  const topSeg = useMemo(() => {
    if (!best) return undefined;
    if (activeMetric.value(best) == null) return undefined;
    return best;
  }, [best, activeMetric]);

  // Header KPI tiles: two independently swappable slots, resolved from the
  // account-wide (spend-weighted) totals so a rate metric like CVR/CTR/CPM
  // shows the real blended reading, never an average-of-averages.
  const accountWideMetrics = useMemo(() => {
    const t = computeSegmentTotals(scopedRows);
    return buildResolvedAudienceMetrics(t, deriveSegmentMetrics(t), term.Plural);
  }, [scopedRows, term.Plural]);
  const tileIds = accountWideMetrics.map((m) => m.id);
  const { activeId: tile1Id, select: selectTile1 } = useRankMetric(`${RANK_KEY}.tile1`, tileIds, "spend");
  const { activeId: tile2Id, select: selectTile2 } = useRankMetric(`${RANK_KEY}.tile2`, tileIds, "results");

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
                <ModuleHeader section={SECTION} title="Audience" tabs="analysis" />
                <PendingState
                  title="No demographic signal"
                  message="Audience intelligence appears once demographic result data exists."
                  icon={Users}
                  action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
                />
              </div>
            );
          }

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Audience"
                subtitle="Audience intelligence: who converts, where the funnel holds, and what creative each pocket responds to."
                tabs="analysis"
              />
              <>
                  <DatePresetBar
                    value={preset}
                    onChange={setPreset}
                    availableWindow={presetData?.available_window}
                    isFetching={presetFetching}
                  />

                  {(isRefetching || (preset !== "all" && presetFetching)) ? (
                    <div className="px-6 pt-5"><SkeletonTileRow count={4} /></div>
                  ) : (
                    <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                      <MetricTile label="Pockets" value={fmtNum(entries.length)} />
                      <MetricPickerTile
                        options={accountWideMetrics}
                        groups={AUDIENCE_RANK_GROUPS}
                        activeId={tile1Id}
                        onSelect={selectTile1}
                      />
                      <MetricPickerTile
                        options={accountWideMetrics}
                        groups={AUDIENCE_RANK_GROUPS}
                        activeId={tile2Id}
                        onSelect={selectTile2}
                      />
                      <MetricTile
                        variant="primary"
                        label={`Prime · ${activeMetric.label}`}
                        value={topSeg ? segmentLabel(topSeg.seg) : "—"}
                        sub={
                          topSeg
                            ? `${activeMetric.format(activeMetric.value(topSeg)!)} ${activeMetric.label.toLowerCase()}`
                            : undefined
                        }
                      />
                    </div>
                  )}

                  <div className="px-6 py-5 space-y-5 max-w-5xl">
                    <div className="flex items-center justify-end gap-3">
                      <ViewToggle mode={viewMode} onChange={handleViewMode} />
                    </div>

                    {viewMode === "map" && (
                      <IntelligenceMapTab
                        entries={entries}
                        totalSpend={totalSpend}
                        medianCpa={medianCpa}
                        onSelect={setSelectedSeg}
                        resultPlural={term.Plural}
                        topSeg={topSeg}
                      />
                    )}

                    {viewMode === "pockets" && (
                      <PocketGridTab
                        ranked={ranked}
                        medianCpa={medianCpa}
                        onSelect={setSelectedSeg}
                        rankMetrics={rankMetrics}
                        activeMetric={activeMetric}
                        onSelectMetric={select}
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
                        medianCpa={medianCpa}
                      />
                    )}

                    <ShareBalanceCard entries={entries} onSelect={setSelectedSeg} />
                  </div>
                </>
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
