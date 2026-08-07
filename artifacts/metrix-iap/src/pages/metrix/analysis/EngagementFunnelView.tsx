// ─── Analysis · Engagement Funnel ─────────────────────────────────────
// Upstream engagement + full conversion funnel in a single surface.
//
// Three view modes selectable at the top:
//   Funnel    — Stage-by-stage waterfall: Impressions → Clicks (all) →
//               Link clicks → ATC → Checkout → Purchase, with absolute
//               counts, % of previous stage, and drop-off colour coding.
//   Breakdown — Sortable table showing every key engagement metric by
//               Audience segment | Placement | Device.
//   Scatter   — Frequency × Link CTR scatter per audience segment,
//               revealing frequency-fatigue pockets.
//
// Metric derivations (all from existing seed data, no fabrication):
//   CTR all      = Clicks (all) / Impressions × 100
//   Frequency    = Impressions / Reach
//   Unique CTR   = Link clicks / Reach × 100
//   CTR link     = CTR_link_pct (direct)
//   ATC rate     = adds_to_cart / link_clicks × 100
//   Checkout rate = checkouts_initiated / adds_to_cart × 100
//   CVR (to purchase) = purchases / link_clicks × 100
//
// ThruPlay and video play % require a Meta video creative report CSV
// which is not currently in the import spec — shown as "not available".

import { useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartTooltip, ReferenceLine,
  Cell,
} from "recharts";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, ScopeBanner, PendingState,
  SectionCard, MetricTile, CrossLink, fmtNum, fmtPct, fmtUSD,
  SkeletonTileRow, CaveatNote, SectionInfoIcon,
} from "../shared";
import {
  scopeDemographicRows, listSegments, rowsForSegment,
  computeSegmentTotals, deriveSegmentMetrics, segmentLabel,
  type SegmentId,
} from "@/lib/segment-analytics";
import {
  RankSortBar, sortByRankMetric, useRankMetric,
  rankBarPct, type RankMetric,
} from "./rankSort";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  TrendingUp, Layers, Table2, Activity, ArrowDown, ArrowUp,
  ChevronsUpDown, Video, ArrowRight,
} from "lucide-react";
import type { DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { TYPE } from "../typography";

const SECTION = "Analysis · 03";
const SORT_KEY = "funnel-breakdown-sort";

/** Columns shown by default; sort-active column is always included regardless. */
const PRIORITY_COL_IDS = ["ctrLink", "ctrAll", "frequency", "atcRate"] as const;

// ─── helpers ──────────────────────────────────────────────────────────

function safe(n: number | null | undefined, d = 0): number | null {
  return n == null ? null : n;
}
function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!a || !b) return null;
  return a / b;
}
function pct(a: number | null | undefined, b: number | null | undefined): number | null {
  const r = ratio(a, b);
  return r == null ? null : r * 100;
}
function fmtRate(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals) + "%";
}
function fmtFreq(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2) + "×";
}

// ─── funnel stage definitions ─────────────────────────────────────────

interface FunnelStage {
  id: string;
  label: string;
  value: number | null;
  pctOfPrev: number | null;
  /** "awareness" | "engagement" | "intent" | "conversion" */
  zone: "awareness" | "engagement" | "intent" | "conversion";
}

const ZONE_COLOR: Record<FunnelStage["zone"], { bar: string; text: string; bg: string; border: string }> = {
  awareness:  { bar: "bg-blue-400/70",   text: "text-blue-300",   bg: "bg-blue-400/[0.06]",   border: "border-blue-400/25" },
  engagement: { bar: "bg-indigo-400/70", text: "text-indigo-300", bg: "bg-indigo-400/[0.06]", border: "border-indigo-400/25" },
  intent:     { bar: "bg-amber-400/70",  text: "text-amber-300",  bg: "bg-amber-400/[0.06]",  border: "border-amber-400/25" },
  conversion: { bar: "bg-emerald-400/70",text: "text-emerald-300",bg: "bg-emerald-400/[0.06]",border: "border-emerald-400/25" },
};

function buildFunnelStages(rows: DemographicRow[]): FunnelStage[] {
  const totals = rows.reduce(
    (acc, r) => {
      acc.impressions += r.Impressions ?? 0;
      acc.clicksAll   += r["Clicks (all)"] ?? 0;
      acc.linkClicks  += r["Link clicks"] ?? 0;
      acc.atc         += r.adds_to_cart ?? 0;
      acc.checkout    += r.checkouts_initiated ?? 0;
      acc.purchases   += r.purchases ?? 0;
      return acc;
    },
    { impressions: 0, clicksAll: 0, linkClicks: 0, atc: 0, checkout: 0, purchases: 0 }
  );

  const stages: { id: string; label: string; v: number; zone: FunnelStage["zone"] }[] = [
    { id: "impressions", label: "Impressions",   v: totals.impressions, zone: "awareness"  },
    { id: "clicks_all",  label: "Clicks (all)",  v: totals.clicksAll,   zone: "engagement" },
    { id: "link_clicks", label: "Link clicks",   v: totals.linkClicks,  zone: "engagement" },
    { id: "atc",         label: "Add to cart",   v: totals.atc,         zone: "intent"     },
    { id: "checkout",    label: "Checkout",       v: totals.checkout,    zone: "intent"     },
    { id: "purchases",   label: "Purchase",       v: totals.purchases,   zone: "conversion" },
  ];

  return stages.map((s, i) => ({
    id: s.id,
    label: s.label,
    value: s.v > 0 ? s.v : null,
    pctOfPrev: i === 0 ? null : pct(s.v, stages[i - 1].v),
    zone: s.zone,
  }));
}

// ─── breakdown types ──────────────────────────────────────────────────

type BreakdownDim = "audience" | "placement" | "device";
type ViewMode = "funnel" | "breakdown" | "scatter";

interface BreakdownRow {
  label: string;
  impressions: number | null;
  reach: number | null;
  clicksAll: number | null;
  linkClicks: number | null;
  spend: number | null;
  results: number | null;
  atc: number | null;
  checkout: number | null;
  purchases: number | null;
  // derived
  ctrLink: number | null;
  ctrAll: number | null;
  frequency: number | null;
  uniqueCtr: number | null;
  atcRate: number | null;
  checkoutRate: number | null;
  cvr: number | null;
  cpa: number | null;
}

interface ScatterPoint {
  x: number; // frequency
  y: number; // CTR link %
  size: number; // spend share
  label: string;
}

function buildAudienceRows(rows: DemographicRow[]): BreakdownRow[] {
  const scoped = scopeDemographicRows(rows, null);
  const segments = listSegments(scoped);
  return segments.map((seg) => {
    const segRows = rowsForSegment(scoped, seg);
    const t = computeSegmentTotals(segRows);
    const d = deriveSegmentMetrics(t);
    return {
      label: segmentLabel(seg),
      impressions: t.impressions,
      reach: t.reach,
      clicksAll: t.clicksAll,
      linkClicks: t.linkClicks,
      spend: t.spend,
      results: t.results,
      atc: t.addsToCart,
      checkout: t.checkoutsInitiated,
      purchases: t.purchases,
      ctrLink: d.ctr,
      ctrAll: pct(t.clicksAll, t.impressions),
      frequency: d.frequency,
      uniqueCtr: pct(t.linkClicks, t.reach),
      atcRate: pct(t.addsToCart, t.linkClicks),
      checkoutRate: pct(t.checkoutsInitiated, t.addsToCart),
      cvr: pct(t.purchases, t.linkClicks),
      cpa: d.cpa,
    };
  });
}

function buildPlacementRows(rows: PlacementRow[]): BreakdownRow[] {
  const grouped = new Map<string, PlacementRow[]>();
  for (const r of rows) {
    const key = `${r.Platform} · ${r.Placement}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  return [...grouped.entries()].map(([label, rs]) => {
    const impressions = rs.reduce((s, r) => s + (r.Impressions ?? 0), 0);
    const linkClicks  = rs.reduce((s, r) => s + (r["Link clicks"] ?? 0), 0);
    const results     = rs.reduce((s, r) => s + (r.Results ?? 0), 0);
    const spend       = rs.reduce((s, r) => s + (r["Amount spent (USD)"] ?? 0), 0);
    const avgCtrLink  = impressions > 0 ? (linkClicks / impressions) * 100 : null;
    return {
      label,
      impressions: impressions || null,
      reach: null,
      clicksAll: null,
      linkClicks: linkClicks || null,
      spend: spend || null,
      results: results || null,
      atc: null, checkout: null, purchases: null,
      ctrLink: avgCtrLink,
      ctrAll: null,
      frequency: null,
      uniqueCtr: null,
      atcRate: null,
      checkoutRate: null,
      cvr: null,
      cpa: spend > 0 && results > 0 ? spend / results : null,
    };
  });
}

// ─── sort definitions ─────────────────────────────────────────────────

const BREAKDOWN_METRICS: RankMetric<BreakdownRow>[] = [
  { id: "ctrLink",      label: "CTR Link",     direction: "desc", value: (r) => r.ctrLink,      format: (v) => fmtRate(v, 2) },
  { id: "ctrAll",       label: "CTR All",      direction: "desc", value: (r) => r.ctrAll,       format: (v) => fmtRate(v, 2) },
  { id: "frequency",    label: "Frequency",    direction: "asc",  value: (r) => r.frequency,    format: (v) => fmtFreq(v) },
  { id: "uniqueCtr",    label: "Reach CTR",    direction: "desc", value: (r) => r.uniqueCtr,    format: (v) => fmtRate(v, 2) },
  { id: "atcRate",      label: "ATC Rate",     direction: "desc", value: (r) => r.atcRate,      format: (v) => fmtRate(v) },
  { id: "checkoutRate", label: "Checkout Rate",direction: "desc", value: (r) => r.checkoutRate, format: (v) => fmtRate(v) },
  { id: "cvr",          label: "CVR",          direction: "desc", value: (r) => r.cvr,          format: (v) => fmtRate(v, 2) },
  { id: "spend",        label: "Spend",        direction: "desc", value: (r) => r.spend,        format: (v) => fmtUSD(v, 0) },
  { id: "cpa",          label: "CPA",          direction: "asc",  value: (r) => r.cpa,          format: (v) => fmtUSD(v, 2) },
];

// ─── sub-components ───────────────────────────────────────────────────

function FunnelWaterfall({ stages }: { stages: FunnelStage[] }) {
  const maxVal = Math.max(...stages.map((s) => s.value ?? 0), 1);
  const hasLowerFunnel = stages.some((s) => (s.zone === "intent" || s.zone === "conversion") && s.value != null && s.value > 0);

  return (
    <div className="space-y-1.5">
      {stages.map((stage, i) => {
        if (!stage.value) return null;
        const c = ZONE_COLOR[stage.zone];
        const barW = Math.max((stage.value / maxVal) * 100, 1.5);
        return (
          <div key={stage.id} className={cn("rounded-lg border p-3", c.bg, c.border)}>
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 w-28 shrink-0">
                {stage.label}
              </span>
              <div className="flex-1 h-5 bg-white/[0.04] rounded overflow-hidden">
                <div
                  className={cn("h-full rounded transition-all", c.bar)}
                  style={{ width: `${barW}%` }}
                />
              </div>
              <span className="text-[13px] font-semibold text-foreground tabular-nums w-24 text-right shrink-0">
                {fmtNum(stage.value)}
              </span>
            </div>
            {stage.pctOfPrev != null && (
              <div className="flex items-center gap-1 ml-28 pl-3">
                <ArrowRight className="w-3 h-3 text-muted-foreground/35" />
                <span className={cn("text-[10px] font-medium", stage.pctOfPrev >= 20 ? "text-emerald-400/70" : stage.pctOfPrev >= 5 ? c.text : "text-red-400/70")}>
                  {stage.pctOfPrev.toFixed(1)}% of previous stage
                </span>
              </div>
            )}
          </div>
        );
      })}
      {!hasLowerFunnel && (
        <div className="mt-2">
          <CaveatNote text="Add-to-cart, checkout, and purchase data comes from the demographic export when the account is configured for ecommerce tracking. These fields appear once a matching export is staged and analyzed." />
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  col, activeId, direction, onSort,
}: {
  col: RankMetric<BreakdownRow>; activeId: string; direction: "asc" | "desc"; onSort: (id: string) => void;
}) {
  const isActive = col.id === activeId;
  return (
    <button
      onClick={() => onSort(col.id)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
        isActive ? "text-interactive" : "text-muted-foreground/55 hover:text-foreground/70"
      )}
    >
      {col.label}
      {isActive ? (
        direction === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
      ) : (
        <ChevronsUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

function BreakdownTable({
  rows, sortId, onSort,
}: {
  rows: BreakdownRow[];
  sortId: string;
  onSort: (id: string) => void;
}) {
  const [showAllCols, setShowAllCols] = useState(false);

  const activeMetric = BREAKDOWN_METRICS.find((m) => m.id === sortId) ?? BREAKDOWN_METRICS[0];
  const sorted = sortByRankMetric(rows, activeMetric);
  const allVals = sorted.map((r) => activeMetric.value(r));

  if (rows.length === 0) {
    return <div className="text-[12px] text-muted-foreground/60 py-4">No data for this breakdown.</div>;
  }

  const allCols: RankMetric<BreakdownRow>[] = BREAKDOWN_METRICS.filter((m) => rows.some((r) => m.value(r) != null));
  // Default: show only priority cols + the active sort col (always visible for context)
  const cols = showAllCols
    ? allCols
    : allCols.filter((m) => PRIORITY_COL_IDS.includes(m.id as (typeof PRIORITY_COL_IDS)[number]) || m.id === sortId);
  const hiddenCount = allCols.length - cols.length;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 sticky left-0 bg-transparent">
                Segment
              </th>
              {cols.map((col) => (
                <th key={col.id} className="pb-2 px-3 whitespace-nowrap">
                  <SortableHeader col={col} activeId={sortId} direction={activeMetric.direction} onSort={onSort} />
                </th>
              ))}
              <th className="pb-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55">
                Bar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {sorted.map((row, i) => {
              const v = activeMetric.value(row);
              const bar = rankBarPct(v, allVals, activeMetric.direction);
              const isTop = i === 0;
              return (
                <tr key={row.label} className={cn("group", isTop && "bg-white/[0.015]")}>
                  <td className="py-2 pr-4 sticky left-0">
                    <span className="text-[12px] font-medium text-foreground/90 whitespace-nowrap">{row.label}</span>
                  </td>
                  {cols.map((col) => {
                    const val = col.value(row);
                    return (
                      <td key={col.id} className={cn(
                        "py-2 px-3 text-[12px] tabular-nums whitespace-nowrap",
                        col.id === sortId ? "font-semibold text-interactive" : "text-foreground/70"
                      )}>
                        {val != null ? col.format(val) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 w-32">
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-interactive/50 rounded-full transition-all"
                        style={{ width: `${bar}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Progressive disclosure: expand / collapse secondary columns */}
      {(hiddenCount > 0 || showAllCols) && (
        <button
          onClick={() => setShowAllCols((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/55 hover:text-foreground/70 transition-colors"
        >
          {showAllCols ? (
            <><ArrowUp className="w-3 h-3" /> Show fewer columns</>
          ) : (
            <><ArrowDown className="w-3 h-3" /> Show {hiddenCount} more column{hiddenCount !== 1 ? "s" : ""} (CVR, Checkout Rate, Spend, CPA)</>
          )}
        </button>
      )}
    </div>
  );
}

function FrequencyScatter({ rows }: { rows: BreakdownRow[] }) {
  const points = rows
    .filter((r) => r.frequency != null && r.ctrLink != null && r.frequency > 0 && r.ctrLink > 0)
    .map<ScatterPoint>((r) => ({
      x: r.frequency!,
      y: r.ctrLink!,
      size: r.spend ?? 0,
      label: r.label,
    }));

  const totalSpend = points.reduce((s, p) => s + p.size, 0);
  const plotData = points.map((p) => ({ ...p, spendShare: totalSpend > 0 ? p.size / totalSpend : 0 }));

  const medFreq = plotData.length > 0 ? plotData.reduce((s, p) => s + p.x, 0) / plotData.length : 2;
  const medCtr  = plotData.length > 0 ? plotData.reduce((s, p) => s + p.y, 0) / plotData.length : 1;

  if (plotData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-[12px] text-muted-foreground/60">
        Need reach + impression data to plot frequency scatter.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-[10px] text-muted-foreground/60">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-400/70" />
          <span>High freq + high CTR → scale safely</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-400/70" />
          <span>High freq + low CTR → creative fatigue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400/70" />
          <span>Low freq + high CTR → expand budget</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          <span>Low freq + low CTR → wrong audience</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 50, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="x"
            type="number"
            name="Frequency"
            label={{ value: "Frequency (impressions / reach)", position: "bottom", offset: 0, style: { fontSize: 10, fill: "rgba(255,255,255,0.4)" } }}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            name="Link CTR %"
            label={{ value: "Link CTR %", angle: -90, position: "left", offset: -10, style: { fontSize: 10, fill: "rgba(255,255,255,0.4)" } }}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine x={medFreq} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" />
          <ReferenceLine y={medCtr}  stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" />
          <RechartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as (ScatterPoint & { spendShare: number });
              return (
                <div className="rounded-lg border border-border/50 bg-[#0a1628]/95 backdrop-blur px-3 py-2 shadow-lg text-[11px] space-y-0.5">
                  <div className="font-semibold text-foreground">{p.label}</div>
                  <div className="text-muted-foreground/70">Frequency: <span className="text-foreground/90">{fmtFreq(p.x)}</span></div>
                  <div className="text-muted-foreground/70">Link CTR: <span className="text-foreground/90">{fmtRate(p.y, 2)}</span></div>
                  <div className="text-muted-foreground/70">Spend share: <span className="text-foreground/90">{fmtRate(p.spendShare * 100)}</span></div>
                </div>
              );
            }}
          />
          <Scatter data={plotData}>
            {plotData.map((p, i) => {
              const highFreq = p.x >= medFreq;
              const highCtr  = p.y >= medCtr;
              const color = highFreq && highCtr ? "#60a5fa" : highFreq && !highCtr ? "#f87171" : !highFreq && highCtr ? "#34d399" : "#94a3b8";
              return (
                <Cell
                  key={i}
                  fill={color}
                  fillOpacity={0.7 + p.spendShare * 0.3}
                  r={6 + Math.sqrt(p.spendShare) * 14}
                />
              );
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function VideoPlaceholder() {
  return (
    <div className="rounded-xl border border-border/30 bg-white/[0.015] p-5 flex items-start gap-3">
      <Video className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-0.5" />
      <div className="space-y-1.5 max-w-xl flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-foreground/80">Video engagement metrics not available</div>
        <CaveatNote text="ThruPlay rate and video-play-percentage data require a Meta Video Creative report CSV — a separate export from the standard demographic/placement performance report, not currently detected in staged uploads. To see video metrics: in Meta Ads Manager, go to Columns → Customize, add ThruPlays and Video play %, export as CSV, and stage it alongside your performance exports." />
      </div>
    </div>
  );
}

// ─── account-level summary tiles from demographic rows ────────────────

function buildSummaryTiles(rows: DemographicRow[]) {
  const impressions = rows.reduce((s, r) => s + (r.Impressions ?? 0), 0);
  const reach       = rows.reduce((s, r) => s + (r.Reach ?? 0), 0);
  const clicksAll   = rows.reduce((s, r) => s + (r["Clicks (all)"] ?? 0), 0);
  const linkClicks  = rows.reduce((s, r) => s + (r["Link clicks"] ?? 0), 0);
  const frequency   = reach > 0 ? impressions / reach : null;
  const ctrAll      = impressions > 0 ? (clicksAll / impressions) * 100 : null;
  const ctrLink     = impressions > 0 ? (linkClicks / impressions) * 100 : null;
  const reachCtr    = reach > 0 ? (linkClicks / reach) * 100 : null;
  return { impressions, reach, frequency, ctrAll, ctrLink, reachCtr };
}

// ─── main component ───────────────────────────────────────────────────

export function EngagementFunnelView() {
  const seed       = useMetrixSeed();
  const acctId     = useScopedAdAccountId();
  const account    = getAdAccount(seed, acctId);
  const analysis   = getAnalysisData(seed, acctId ?? null);
  const isRefetch  = useMetrixIsRefetching();

  const [viewMode, setViewMode]   = useState<ViewMode>("funnel");
  const [dim, setDim]             = useState<BreakdownDim>("audience");
  const { activeId: sortId, select: setSort } = useRankMetric(SORT_KEY, BREAKDOWN_METRICS.map((m) => m.id), "ctrLink");

  const demoRows  = analysis?.demographic_registration_signal ?? [];
  const placRows  = [...(analysis?.v3_placement_signal ?? []), ...(analysis?.c4e_placement_signal ?? [])];

  const funnelStages = useMemo(() => buildFunnelStages(demoRows), [demoRows]);

  const breakdownRows = useMemo<BreakdownRow[]>(() => {
    if (dim === "audience")  return buildAudienceRows(demoRows);
    if (dim === "placement") return buildPlacementRows(placRows);
    return []; // device: future
  }, [dim, demoRows, placRows]);

  const summaryTiles = useMemo(() => buildSummaryTiles(demoRows), [demoRows]);

  return (
    <ModuleScopeGate section={SECTION} title="Engagement Funnel" account={account}>
      {() => {
        const acct = account!;

        if (demoRows.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Engagement Funnel" tabs="analysis" account={acct} />
              <PendingState
                title="No engagement data"
                message="Stage demographic performance CSVs and run analysis to see the engagement funnel."
                icon={TrendingUp}
                action={<CrossLink to="/app/analysis" label="Go to Analysis" />}
              />
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Engagement Funnel"
              subtitle="Upstream engagement quality — reach, frequency, CTR all vs link — through to purchase. Sortable by any stage, any dimension."
              tabs="analysis"
              account={acct}
            />
            <ScopeBanner account={acct} />

            {/* ── Summary tiles ─────────────────────────────────────── */}
            {isRefetch ? (
              <div className="px-6 pt-5"><SkeletonTileRow count={5} /></div>
            ) : (
              <div className="px-6 pt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <MetricTile
                  label="Impressions"
                  value={fmtNum(summaryTiles.impressions)}
                  sub="total served"
                />
                <MetricTile
                  label="Frequency"
                  value={fmtFreq(summaryTiles.frequency)}
                  sub="impressions per reach"
                />
                <MetricTile
                  label="CTR All"
                  value={fmtRate(summaryTiles.ctrAll, 2)}
                  sub="all clicks / impressions"
                />
                <MetricTile
                  label="CTR Link"
                  value={fmtRate(summaryTiles.ctrLink, 2)}
                  sub="link clicks / impressions"
                />
                <MetricTile
                  label="Reach CTR"
                  value={fmtRate(summaryTiles.reachCtr, 2)}
                  sub="link clicks / unique reach"
                />
              </div>
            )}

            {/* ── View / Dimension controls ──────────────────────────── */}
            <div className="px-6 pt-5 pb-1 flex flex-wrap items-center gap-3">
              {/* View mode */}
              <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5 bg-white/[0.02]">
                {([ ["funnel", "Funnel", Layers], ["breakdown", "Breakdown", Table2], ["scatter", "Scatter", Activity] ] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors",
                      viewMode === mode
                        ? "bg-primary/20 text-interactive border border-primary/25"
                        : "text-muted-foreground/70 hover:text-foreground/80"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Breakdown dimension (only in breakdown/scatter mode) */}
              {(viewMode === "breakdown" || viewMode === "scatter") && (
                <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5 bg-white/[0.02]">
                  {([ ["audience", "Audience"], ["placement", "Placement"] ] as const).map(([d, l]) => (
                    <button
                      key={d}
                      onClick={() => setDim(d)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors",
                        dim === d
                          ? "bg-primary/20 text-interactive border border-primary/25"
                          : "text-muted-foreground/70 hover:text-foreground/80"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}

              {/* Sort metric pill strip (breakdown mode) */}
              {viewMode === "breakdown" && (
                <div className="flex-1">
                  <RankSortBar
                    metrics={BREAKDOWN_METRICS}
                    activeId={sortId}
                    onSelect={setSort}
                  />
                </div>
              )}
            </div>

            {/* ── Main content area ──────────────────────────────────── */}
            <div className="px-6 py-5 space-y-5 max-w-5xl">

              {viewMode === "funnel" && (
                <>
                  <SectionCard
                    title="Conversion funnel"
                    desc="Stage-by-stage audience journey from impression to purchase. Each row shows the count and % retained from the previous stage."
                    right={<SectionInfoIcon tip="Absolute volume and stage-over-stage retention rate from impression through to purchase, drawn from the demographic export." />}
                  >
                    <FunnelWaterfall stages={funnelStages} />
                  </SectionCard>

                  {/* CTR comparison */}
                  <SectionCard
                    title="CTR comparison"
                    desc="All-clicks CTR vs link-click CTR. The gap between them shows how much engagement doesn't drive intent."
                    right={<SectionInfoIcon tip="A wide gap between CTR All and CTR Link means clicks are staying on-platform (reactions, shares, profile visits) rather than driving off-platform intent." />}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border/30 bg-white/[0.02] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 mb-1">CTR All</div>
                        <div className="text-[20px] font-bold text-foreground">{fmtRate(summaryTiles.ctrAll, 2)}</div>
                        <div className="text-[10px] text-muted-foreground/50 mt-1">All clicks ÷ impressions</div>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-white/[0.02] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 mb-1">CTR Link</div>
                        <div className="text-[20px] font-bold text-foreground">{fmtRate(summaryTiles.ctrLink, 2)}</div>
                        <div className="text-[10px] text-muted-foreground/50 mt-1">Link clicks ÷ impressions</div>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-white/[0.02] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/55 mb-1">Reach CTR</div>
                        <div className="text-[20px] font-bold text-foreground">{fmtRate(summaryTiles.reachCtr, 2)}</div>
                        <div className="text-[10px] text-muted-foreground/50 mt-1">Link clicks ÷ unique reach</div>
                      </div>
                    </div>
                    {summaryTiles.ctrAll != null && summaryTiles.ctrLink != null && summaryTiles.ctrAll > 0 && (
                      <div className="mt-3 p-3 rounded-lg border border-border/25 bg-white/[0.01] text-[11px] text-muted-foreground/70">
                        <span className="font-medium text-foreground/80">Intent conversion: </span>
                        {fmtRate(pct(summaryTiles.ctrLink, summaryTiles.ctrAll), 0)} of all clicks become link clicks.
                        {summaryTiles.ctrLink != null && summaryTiles.ctrAll != null && summaryTiles.ctrAll > 0 && summaryTiles.ctrLink / summaryTiles.ctrAll < 0.4 && (
                          <span className="text-amber-400/70 ml-1">Low ratio — check for high engagement creative that doesn't drive off-platform intent.</span>
                        )}
                      </div>
                    )}
                  </SectionCard>

                  <VideoPlaceholder />
                </>
              )}

              {viewMode === "breakdown" && (
                <SectionCard
                  title={`${dim === "audience" ? "Audience segment" : "Placement"} breakdown`}
                  desc={`All engagement metrics by ${dim === "audience" ? "age × gender pocket" : "placement × platform"}. Sort by any column to find highest-frequency or highest-intent segments.`}
                  right={
                    <>
                      <span className="text-[10px] text-muted-foreground/50">
                        {breakdownRows.length} {dim === "audience" ? "pockets" : "placements"}
                      </span>
                      <SectionInfoIcon tip="Sortable table of engagement metrics for each segment. Switch the sort column to surface your highest-frequency or highest-intent pockets." />
                    </>
                  }
                >
                  <BreakdownTable rows={breakdownRows} sortId={sortId} onSort={setSort} />
                  {dim === "audience" && (
                    <CaveatNote
                      text="Demographic rows don't carry raw impression counts per segment in every export — Frequency and CTR All are derived from available Reach and Impressions fields and may be 0 for some segments."
                    />
                  )}
                </SectionCard>
              )}

              {viewMode === "scatter" && (
                <>
                  <SectionCard
                    title={`Frequency × Link CTR — ${dim === "audience" ? "Audience segments" : "Placements"}`}
                    desc="Each dot is a segment. Bubble size = spend share. Reference lines show the account median. High-frequency + low-CTR segments signal creative fatigue."
                    right={<SectionInfoIcon tip="Segments above the median frequency line but below the median CTR line are candidates for creative refresh — they've seen the ad often enough that engagement is declining." />}
                  >
                    {dim === "audience" ? (
                      <FrequencyScatter rows={breakdownRows} />
                    ) : (
                      <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground/60">
                        Placement rows don't include Reach data — frequency scatter requires the demographic export.
                        <button
                          onClick={() => setDim("audience")}
                          className="ml-2 text-interactive underline"
                        >
                          Switch to Audience
                        </button>
                      </div>
                    )}
                  </SectionCard>
                  <VideoPlaceholder />
                </>
              )}
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
