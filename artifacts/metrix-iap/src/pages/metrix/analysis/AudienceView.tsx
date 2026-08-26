// ─── Analysis · Audience Intelligence ─────────────────────────────────
// Three real "segment by" grains over the same demographic conversion
// pocket signal (segment-analytics.ts) — nothing here is estimated:
//
//   Cluster — real age×gender segments grouped by efficiency profile
//     (CPA × CVR) via a deterministic k-means pass (audience-clusters.ts).
//     Cluster labels are mechanically built from each cluster's top-spend
//     member segments — never an invented behavioral narrative.
//
//   Age — the same segments grouped by age bracket only (genders
//     combined), a plain real regrouping of the same rows.
//
//   Ranked — the original full per-segment ranked list, preserved as-is
//     (KPI stat rows, Explore → drilldown, low-signal flags).
//
// There is deliberately no "Placement" grain: SegmentDrilldownData.placements
// is a real field in segment-analytics.ts but is hardcoded
// `{ available: false, entries: [] }` everywhere in this codebase — no
// import populates it. Rather than ship a toggle option that always routes
// to a pending state, it is omitted; Cluster/Age/Ranked are all fully real.
//
// Cluster and Age modes share one rendering path (PositioningMapCard,
// ShareOfSpendCard, GroupDetailCard) over the common AudienceGroup<T> shape
// from audience-clusters.ts, so the same honesty rules apply to both.

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
  useShowMore, ShowMoreButton, SegmentGenderIcon, DetailReveal,
} from "../shared";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import type { DemographicRow } from "@/lib/data/seedTypes";
import { TYPE } from "../typography";
import {
  Users, Layers, Calendar as CalendarIcon, List, ArrowRight, AlertTriangle, TrendingUp,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  scopeDemographicRows,
  listSegments, rowsForSegment,
  computeSegmentTotals, deriveSegmentMetrics,
  assessSegmentSignal, segmentLabel, segmentKey,
  demographicCoverageOf,
  type SegmentId, type SegmentRawTotals,
  type SegmentDerivedMetrics, type SegmentSignal,
} from "@/lib/segment-analytics";
import { buildSegmentMetricCatalog } from "@/lib/data/segmentMetricsCatalog";
import { DataCoverageBanner } from "@/components/analysis/DataCoverageBanner";
import { useDemographicCoverage } from "@/hooks/useDemographicCoverage";
import {
  buildAudienceClusters, groupSegmentsByAge, classifyQuadrant, QUADRANT_LABEL,
  type AudienceGroup, type PositioningQuadrant,
} from "@/lib/audience-clusters";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import {
  RankSortBar, KpiStat, sortByRankMetric, useRankMetric,
  rankBarPct, MetricPickerTile, type RankMetric, type MetricGroup,
  type ResolvedMetricOption,
} from "./rankSort";

// ── Types ─────────────────────────────────────────────────────────────

type SegmentByMode = "cluster" | "age" | "ranked";

interface SegmentEntry {
  seg: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
  signal: SegmentSignal;
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

const QUADRANT_COLOR: Record<PositioningQuadrant, string> = {
  scale:    "hsl(var(--chart-3))",
  optimize: "hsl(var(--chart-1))",
  explore:  "hsl(var(--chart-2))",
  avoid:    "hsl(var(--chart-4))",
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

// ── Segment-by toggle ────────────────────────────────────────────────

const SEGMENT_BY_TABS: { id: SegmentByMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "cluster", label: "Cluster", Icon: Layers },
  { id: "age",     label: "Age",     Icon: CalendarIcon },
  { id: "ranked",  label: "Ranked",  Icon: List },
];

function SegmentByToggle({ mode, onChange }: { mode: SegmentByMode; onChange: (m: SegmentByMode) => void }) {
  return (
    <SegmentedToggle
      ariaLabel="Segment by"
      options={SEGMENT_BY_TABS}
      active={mode}
      onChange={onChange}
      responsiveLabels
    />
  );
}

// ── Positioning map — real cost-per-result × real results, bubble = spend ─
// Quadrant framing reuses this app's established scaling vocabulary
// (scalingBuckets.ts: Scale / Optimize / Explore / Avoid) rather than a
// second parallel vocabulary — see audience-clusters.ts classifyQuadrant.

function PositioningMapCard({
  groups, resultPlural, groupNoun,
}: {
  groups: AudienceGroup<SegmentEntry>[];
  resultPlural: string;
  groupNoun: string;
}) {
  const plotted = groups.filter((g) => g.derived.cpa != null && g.totals.results != null);

  const medianCpa = numMedian(plotted.map((g) => g.derived.cpa!));
  const medianResults = numMedian(plotted.map((g) => g.totals.results!));
  const totalSpend = plotted.reduce((n, g) => n + (g.totals.spend ?? 0), 0);

  type Point = { x: number; y: number; spendShare: number; group: AudienceGroup<SegmentEntry> };
  const plotData: Point[] = plotted.map((g) => ({
    x: g.derived.cpa!,
    y: g.totals.results!,
    spendShare: totalSpend > 0 ? (g.totals.spend ?? 0) / totalSpend : 0,
    group: g,
  }));

  const BubbleShape = useCallback(
    (props: { cx?: number; cy?: number; payload?: Point }) => {
      const { cx = 0, cy = 0, payload } = props;
      if (!payload) return null;
      const r = 8 + payload.spendShare * 30;
      const q = classifyQuadrant(payload.x, payload.y, medianCpa, medianResults);
      const fill = QUADRANT_COLOR[q];
      return (
        <g role="img" aria-label={payload.group.label} style={{ cursor: "default" }}>
          <circle cx={cx} cy={cy} r={r + 4} fill={fill} fillOpacity={0.08} />
          <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.72} stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />
          <text
            x={cx} y={cy + 0.5}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fontWeight={700}
            fill="rgba(255,255,255,0.92)"
            style={{ pointerEvents: "none" }}
          >
            {payload.group.id}
          </text>
        </g>
      );
    },
    [medianCpa, medianResults]
  );

  function MapTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    const q = classifyQuadrant(pt.x, pt.y, medianCpa, medianResults);
    return (
      <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5 elevation-floating min-w-[170px]">
        <p className={cn(TYPE.title, "text-foreground mb-2")}>{pt.group.label}</p>
        <div className={cn("space-y-1", TYPE.caption, "text-muted-foreground")}>
          <div className="flex justify-between gap-3">
            <span>Cost per result</span>
            <span className="tabular-nums text-foreground/80">{fmtUSD(pt.x)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>{resultPlural}</span>
            <span className="tabular-nums text-foreground/80">{fmtNum(pt.y)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Spend</span>
            <span className="tabular-nums text-foreground/80">{fmtUSD(pt.group.totals.spend ?? 0, 0)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Quadrant</span>
            <span className="tabular-nums font-semibold" style={{ color: QUADRANT_COLOR[q] }}>
              {QUADRANT_LABEL[q]}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      title="Positioning map"
      desc={`Cost per result vs. ${resultPlural.toLowerCase()} · bubble size = spend`}
      right={<SectionInfoIcon tip={`Each bubble is one real ${groupNoun}. X = cost per result, Y = ${resultPlural.toLowerCase()}, bubble size = spend. Quadrant cutoffs are the real median across plotted ${groupNoun}s.`} />}
    >
      {plotData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50 gap-2">
          <TrendingUp className="w-8 h-8" />
          <p className={TYPE.body}>Not enough real results data to plot {groupNoun}s.</p>
        </div>
      ) : (
        <div className="relative w-full rounded-xl border border-border/20 bg-white/[0.01] overflow-hidden" style={{ height: 380 }}>
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{ left: 60, right: 20, top: 10, bottom: 45 }}
          >
            {([
              { top: true,  right: false, q: "scale" as const },
              { top: true,  right: true,  q: "optimize" as const },
              { top: false, right: false, q: "explore" as const },
              { top: false, right: true,  q: "avoid" as const },
            ]).map(({ top, right, q }) => (
              <div
                key={q}
                className={cn(
                  "absolute",
                  top ? "top-1" : "bottom-6",
                  right ? "right-2 text-right" : "left-2"
                )}
              >
                <span className={cn(TYPE.label, "font-semibold")} style={{ color: `${QUADRANT_COLOR[q]}80` }}>
                  {QUADRANT_LABEL[q].toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 45, left: 60 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.10)" />
              <XAxis
                dataKey="x"
                type="number"
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmtUSD(v, 0)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                label={{
                  value: "Cost per result →",
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
                tickFormatter={(v: number) => fmtNum(v)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                label={{
                  value: `${resultPlural} →`,
                  angle: -90,
                  position: "insideLeft",
                  offset: 50,
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 10,
                }}
              />
              {medianCpa > 0 && (
                <ReferenceLine
                  x={medianCpa}
                  stroke="hsl(var(--chart-1) / 0.30)"
                  strokeDasharray="4 3"
                  label={{ value: "median", position: "insideTopRight", fill: "hsl(var(--chart-1) / 0.70)", fontSize: 9 }}
                />
              )}
              {medianResults > 0 && (
                <ReferenceLine
                  y={medianResults}
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
      )}
    </SectionCard>
  );
}

// ── Share of spend vs. share of results ────────────────────────────────

function ShareOfSpendCard({
  groups, resultPlural, groupNoun,
}: {
  groups: AudienceGroup<SegmentEntry>[];
  resultPlural: string;
  groupNoun: string;
}) {
  const totalSpend = groups.reduce((n, g) => n + (g.totals.spend ?? 0), 0);
  const totalResults = groups.reduce((n, g) => n + (g.totals.results ?? 0), 0);

  const rows = groups
    .map((g) => {
      const spendShare = totalSpend > 0 ? ((g.totals.spend ?? 0) / totalSpend) * 100 : 0;
      const resultShare = totalResults > 0 ? ((g.totals.results ?? 0) / totalResults) * 100 : 0;
      return { g, spendShare, resultShare, gap: Math.round(resultShare - spendShare) };
    })
    .sort((a, b) => b.spendShare - a.spendShare);

  return (
    <SectionCard
      title="Share of spend vs. share of result"
      desc={`Share of spend against share of ${resultPlural.toLowerCase()} · gap in points`}
      right={<SectionInfoIcon tip={`Each ${groupNoun}'s share of scoped spend next to its share of scoped ${resultPlural.toLowerCase()}. A positive gap returns more than its budget share; a negative gap takes more budget than it returns.`} />}
    >
      {totalSpend <= 0 ? (
        <p className={cn(TYPE.body, "text-muted-foreground/50 py-6 text-center")}>No spend to allocate.</p>
      ) : (
        <div className="space-y-2.5" data-testid="share-of-spend-rows">
          {rows.map(({ g, spendShare, resultShare, gap }) => (
            <div key={g.id} className="rounded-lg px-2 py-1.5 -mx-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={cn(TYPE.caption, "font-medium text-foreground/85 inline-flex items-center gap-1.5 min-w-0")}>
                  <span className="shrink-0 font-mono text-muted-foreground/45">{g.id}</span>
                  <span className="truncate">{g.label}</span>
                </span>
                <span className={cn(
                  TYPE.label,
                  "tabular-nums shrink-0",
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
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Group detail — collapsed by default, indexed against account average ─

// ─── Reasons for an absent stat (C3) ──────────────────────────────────
//
// The dashes on these rows used to be unexplainable. Rather than write a
// second set of reason strings, both helpers read the ones the segment
// metric catalog already computes — the same text the drill-down modal
// shows — so a change to why a metric is unavailable lands everywhere at
// once instead of drifting between surfaces.

function segmentStatReason(
  totals: SegmentRawTotals,
  derived: SegmentDerivedMetrics,
  metricId: string,
): string | undefined {
  const m = buildSegmentMetricCatalog(totals, derived).find((x) => x.id === metricId);
  return m?.availability === "unavailable" ? m.unavailableReason : undefined;
}

/** An index compares this group against the account blend; say which half is missing. */
function indexReason(label: string, accountValue: number | null, groupValue: number | null): string | undefined {
  if (accountValue != null && accountValue > 0 && groupValue != null) return undefined;
  if (groupValue == null && (accountValue == null || accountValue <= 0)) {
    return `neither this group's ${label} nor the account blend could be measured, so there is nothing to index against`;
  }
  if (groupValue == null) return `this group's own ${label} could not be measured`;
  return `the account-wide ${label} baseline could not be measured, so an index against it would be meaningless`;
}

function GroupDetailRow({
  group, accountDerived, onSelectMember, resultPlural,
}: {
  group: AudienceGroup<SegmentEntry>;
  accountDerived: SegmentDerivedMetrics;
  onSelectMember: (seg: SegmentId) => void;
  resultPlural: string;
}) {
  const cpaIndex =
    accountDerived.cpa != null && accountDerived.cpa > 0 && group.derived.cpa != null
      ? Math.round((group.derived.cpa / accountDerived.cpa) * 100)
      : null;
  const cvrIndex =
    accountDerived.cvr != null && accountDerived.cvr > 0 && group.derived.cvr != null
      ? Math.round((group.derived.cvr / accountDerived.cvr) * 100)
      : null;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/10 last:border-0 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn(TYPE.label, "font-mono text-muted-foreground/45 shrink-0")}>{group.id}</span>
        <DetailReveal
          label={group.label}
          labelClassName={cn(TYPE.title, "text-foreground/90")}
          eyebrow={`${group.members.length} member segment${group.members.length !== 1 ? "s" : ""}`}
          sections={[{
            render: () => (
              <div className="space-y-1">
                {group.members.map((m) => (
                  <button
                    key={segmentKey(m.seg)}
                    type="button"
                    onClick={() => onSelectMember(m.seg)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md",
                      "hover:bg-white/[0.05] transition-colors text-left"
                    )}
                  >
                    <span className={cn(TYPE.body, "inline-flex items-center gap-1.5")}>
                      <SegmentGenderIcon gender={m.seg.gender} />
                      {segmentLabel(m.seg)}
                    </span>
                    <span className={cn(TYPE.label, "text-interactive inline-flex items-center gap-0.5")}>
                      Explore <ArrowRight className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>
            ),
          }]}
        />
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <KpiStat
          label="CPA index"
          value={cpaIndex != null ? `${cpaIndex}%` : "—"}
          unavailableReason={indexReason("CPA", accountDerived.cpa, group.derived.cpa)}
        />
        <KpiStat
          label="CVR index"
          value={cvrIndex != null ? `${cvrIndex}%` : "—"}
          unavailableReason={indexReason("CVR", accountDerived.cvr, group.derived.cvr)}
        />
        <KpiStat
          label="Spend"
          value={group.totals.spend != null ? fmtUSD(group.totals.spend, 0) : "—"}
          unavailableReason={segmentStatReason(group.totals, group.derived, "spend")}
        />
        <KpiStat label={resultPlural} value={fmtNum(group.totals.results)} />
      </div>
    </div>
  );
}

function GroupDetailCard({
  title, groups, accountDerived, onSelectMember, resultPlural, groupNoun,
}: {
  title: string;
  groups: AudienceGroup<SegmentEntry>[];
  accountDerived: SegmentDerivedMetrics;
  onSelectMember: (seg: SegmentId) => void;
  resultPlural: string;
  groupNoun: string;
}) {
  return (
    <SectionCard
      title={title}
      desc={`${groups.length} ${groupNoun}${groups.length !== 1 ? "s" : ""}, indexed against the account average`}
      defaultOpen={false}
      right={<SectionInfoIcon tip="CPA/CVR index shows each group's rate relative to the real account-wide blended rate — 100% is the account average, under 100% CPA is cheaper than average, over 100% CVR is better than average." />}
    >
      {groups.length === 0 ? (
        <p className={cn(TYPE.body, "text-muted-foreground/50 py-4 text-center")}>No {groupNoun}s to show.</p>
      ) : (
        <div>
          {groups.map((g) => (
            <GroupDetailRow
              key={g.id}
              group={g}
              accountDerived={accountDerived}
              onSelectMember={onSelectMember}
              resultPlural={resultPlural}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Ranked List tab — preserved from the prior full per-segment view ────

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
                {e.signal.state === "insufficient_coverage" ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-label font-mono uppercase text-muted-foreground/60 shrink-0"
                    title={e.signal.reasons.join(" ")}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Coverage
                  </span>
                ) : e.signal.low ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-label font-mono uppercase text-amber-300/65 shrink-0"
                    title={e.signal.reasons.join(" ")}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Low
                  </span>
                ) : null}
                <span className={cn(TYPE.title, "font-bold tabular-nums text-foreground/80 shrink-0 mr-1")}>
                  {v != null ? activeMetric.format(v) : "—"}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-md text-label font-semibold bg-primary/15 text-interactive opacity-55 group-hover:opacity-100 transition-opacity">
                  Explore <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="ml-6 h-[6px] rounded-full bg-white/[0.05] overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="ml-6 flex items-center gap-4 flex-wrap">
                <KpiStat label={resultPlural}  value={fmtNum(e.totals.results)}                                   highlight={activeMetric.id === "results"} />
                <KpiStat label="CPA"           value={e.derived.cpa != null ? fmtUSD(e.derived.cpa) : "—"}       highlight={activeMetric.id === "cpa"}
                         unavailableReason={segmentStatReason(e.totals, e.derived, "cpa")} />
                <KpiStat label="Spend"         value={e.totals.spend != null ? fmtUSD(e.totals.spend, 0) : "—"}  highlight={activeMetric.id === "spend"}
                         unavailableReason={segmentStatReason(e.totals, e.derived, "spend")} />
                <KpiStat label="CTR"           value={e.derived.ctr != null ? fmtPct(e.derived.ctr) : "—"}       highlight={activeMetric.id === "ctr"}
                         unavailableReason={segmentStatReason(e.totals, e.derived, "ctr")} />
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
const SEGMENT_BY_KEY = "metrix.audience.segmentBy.v2";
const RANK_KEY = "metrix.audience.rank.v1";
const SEGMENT_BY_IDS: SegmentByMode[] = ["cluster", "age", "ranked"];

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
  const [mode, setMode] = useState<SegmentByMode>(() => {
    try {
      const stored = localStorage.getItem(SEGMENT_BY_KEY) as SegmentByMode | null;
      return stored && SEGMENT_BY_IDS.includes(stored) ? stored : "cluster";
    } catch { return "cluster"; }
  });
  const [preset, setPreset] = useState<ViewPreset>("all");

  const { data: presetData, isFetching: presetFetching } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", preset),
    enabled: preset !== "all" && !!adAccountId,
  });

  // Join coverage: prefer the active date preset's own summary when it
  // carries coverage (it is scoped tighter than the run), otherwise the
  // run-level coverage the shared hook resolves. The hook is the same source
  // SegmentDrilldownModal reads, so this view and the drill-down it opens can
  // never disagree about the same account.
  const runCoverage = useDemographicCoverage();
  const demoCoverage = useMemo(
    () => demographicCoverageOf(presetData?.data_coverage ?? null) ?? runCoverage,
    [presetData, runCoverage],
  );

  const handleMode = useCallback((m: SegmentByMode) => {
    setMode(m);
    try { localStorage.setItem(SEGMENT_BY_KEY, m); } catch { /* storage blocked */ }
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
        signal: assessSegmentSignal(totals, scopedTotals, demoCoverage),
      };
    });
  }, [scopedRows, demoCoverage]);

  const term = account
    ? resultTerm(account)
    : { singular: "result", plural: "results", Plural: "Results" };

  const rankMetrics = useMemo(() => buildRankMetrics(term.Plural), [term.Plural]);
  const { activeId, select } = useRankMetric(RANK_KEY, rankMetrics.map((m) => m.id), "results");
  const activeMetric = rankMetrics.find((m) => m.id === activeId) ?? rankMetrics[0];
  const ranked = useMemo(() => sortByRankMetric(entries, activeMetric), [entries, activeMetric]);

  const best = ranked[0];

  // Suppress the winner highlight when the active metric has no data for any
  // segment (all values are null) — ranked[0] would be an arbitrary
  // insertion-order pick, not a real leader.
  const topSeg = useMemo(() => {
    if (!best) return undefined;
    if (activeMetric.value(best) == null) return undefined;
    return best;
  }, [best, activeMetric]);

  // Header KPI tiles: two independently swappable slots, resolved from the
  // account-wide (spend-weighted) totals so a rate metric like CVR/CTR/CPM
  // shows the real blended reading, never an average-of-averages.
  const accountTotals = useMemo(() => computeSegmentTotals(scopedRows), [scopedRows]);
  const accountDerived = useMemo(() => deriveSegmentMetrics(accountTotals), [accountTotals]);
  const accountWideMetrics = useMemo(
    () => buildResolvedAudienceMetrics(accountTotals, accountDerived, term.Plural),
    [accountTotals, accountDerived, term.Plural]
  );
  const tileIds = accountWideMetrics.map((m) => m.id);
  const { activeId: tile1Id, select: selectTile1 } = useRankMetric(`${RANK_KEY}.tile1`, tileIds, "spend");
  const { activeId: tile2Id, select: selectTile2 } = useRankMetric(`${RANK_KEY}.tile2`, tileIds, "results");

  const medianCpa = useMemo(() => {
    return numMedian(entries.filter((e) => e.derived.cpa != null).map((e) => e.derived.cpa!));
  }, [entries]);

  // Cluster and Age are both real regroupings of the same segments —
  // clustering excludes segments with no results (null CPA) rather than
  // guessing them into a group; the age grouping has no such gap since it
  // doesn't depend on a rate metric.
  const clusterGroups = useMemo(() => buildAudienceClusters(entries), [entries]);
  const ageGroups = useMemo(() => groupSegmentsByAge(entries), [entries]);
  const activeGroups = mode === "cluster" ? clusterGroups : mode === "age" ? ageGroups : [];
  const groupNoun = mode === "cluster" ? "cluster" : "age group";

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Audience" account={account}>
        {() => {
          const acct = account!;
          const rows = analysis?.demographic_registration_signal ?? [];

          if (rows.length === 0) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Audience" accountName={acct.name} tabs="analysis" />
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
                accountName={acct.name}
                subtitle={`${clusterGroups.length} real behavioral cluster${clusterGroups.length !== 1 ? "s" : ""}, derived from the demographic breakdown — not declared targeting.`}
                tabs="analysis"
              />
              <>
                  <DatePresetBar
                    value={preset}
                    onChange={setPreset}
                    availableWindow={presetData?.available_window}
                    isFetching={presetFetching}
                  />

                  <div className="px-6 pt-5">
                    <DataCoverageBanner coverage={demoCoverage} />
                  </div>

                  {(isRefetching || (preset !== "all" && presetFetching)) ? (
                    <div className="px-6 pt-5"><SkeletonTileRow count={4} /></div>
                  ) : (
                    <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                      <MetricTile label="Segments" value={fmtNum(entries.length)} />
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

                  <div className="px-6 py-5 space-y-4 max-w-6xl">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className={cn(TYPE.label, "text-muted-foreground/40")}>
                        {mode === "ranked"
                          ? `${ranked.length} segment${ranked.length !== 1 ? "s" : ""}`
                          : `${activeGroups.length} ${groupNoun}${activeGroups.length !== 1 ? "s" : ""} · ${entries.length} real segments`}
                      </p>
                      <SegmentByToggle mode={mode} onChange={handleMode} />
                    </div>

                    {mode === "ranked" ? (
                      <RankedListTab
                        ranked={ranked}
                        activeMetric={activeMetric}
                        onSelect={setSelectedSeg}
                        onSelectMetric={select}
                        rankMetrics={rankMetrics}
                        resultPlural={term.Plural}
                        medianCpa={medianCpa}
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <PositioningMapCard groups={activeGroups} resultPlural={term.Plural} groupNoun={groupNoun} />
                          <ShareOfSpendCard groups={activeGroups} resultPlural={term.Plural} groupNoun={groupNoun} />
                        </div>
                        <GroupDetailCard
                          title={mode === "cluster" ? "Cluster detail" : "Age detail"}
                          groups={activeGroups}
                          accountDerived={accountDerived}
                          onSelectMember={setSelectedSeg}
                          resultPlural={term.Plural}
                          groupNoun={groupNoun}
                        />
                      </>
                    )}
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
          demoCoverage={demoCoverage}
        />
      )}
    </>
  );
}
