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

import { useEffect, useMemo, useState } from "react";
import { VERDICT } from "@/components/charts/chartTokens";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartTooltip, ReferenceLine,
  Cell,
} from "recharts";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
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
import { sumStrict } from "@/lib/strict-sum";
import { FunnelChart } from "@/components/charts/FunnelChart";
import {
  TrendingUp, Layers, Table2, Activity, ArrowDown, ArrowUp,
  ChevronsUpDown, Video, ArrowRight,
} from "lucide-react";
import type { DemographicRow, PlacementRow, DeviceDeliveryRow } from "@/lib/data/seedTypes";
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
  // `!a` nulled a MEASURED zero numerator (C7): an ad set with a real,
  // recorded 0 adds-to-cart reported "not measured" instead of 0%, which
  // is the honesty invariant inverted — the platform's whole convention is
  // that zero and unknown are different facts. Only the numerator being
  // absent, or the denominator being absent or zero, makes the ratio
  // unknowable.
  if (a == null || b == null || b === 0) return null;
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

export interface FunnelStage {
  id: string;
  label: string;
  value: number | null;
  pctOfPrev: number | null;
  /** "awareness" | "engagement" | "intent" | "conversion" */
  zone: "awareness" | "engagement" | "intent" | "conversion";
}

/** Zone display names. The zones group the funnel into labelled bands;
 *  they are not a colour dimension — see FunnelWaterfall for why. */
export const ZONE_LABEL: Record<FunnelStage["zone"], string> = {
  awareness: "Awareness",
  engagement: "Engagement",
  intent: "Intent",
  conversion: "Conversion",
};

// A ZONE IS A POSITION IN A SEQUENCE, NOT A VERDICT.
//
// Two of these four used to wear reserved status colours: `intent` was
// status-warning throughout, and `conversion` mixed a chart slot for its
// bar with status-success for its text, tint and border. So a reader
// scanning the buyer-intent funnel saw amber at Intent and green at
// Conversion and took the obvious meaning — intent is a problem, conversion
// is healthy — when those are just the names of two stages. Every account
// got the same "warning", forever, regardless of its numbers.
//
// It also made `conversion` disagree with itself: a chart-3 bar under
// status-success text, two palettes on one stage.
//
// Four zones, four categorical slots, assigned in funnel order. Status
// colours stay reserved for actual verdicts — which this view still uses,
// correctly, on the ratio warnings further down.
export const ZONE_COLOR: Record<FunnelStage["zone"], { bar: string; text: string; bg: string; border: string }> = {
  awareness:  { bar: "bg-chart-1/70", text: "text-chart-1", bg: "bg-chart-1/[0.06]", border: "border-chart-1/25" },
  engagement: { bar: "bg-chart-2/70", text: "text-chart-2", bg: "bg-chart-2/[0.06]", border: "border-chart-2/25" },
  intent:     { bar: "bg-chart-3/70", text: "text-chart-3", bg: "bg-chart-3/[0.06]", border: "border-chart-3/25" },
  conversion: { bar: "bg-chart-4/70", text: "text-chart-4", bg: "bg-chart-4/[0.06]", border: "border-chart-4/25" },
};

/** Exported so callers outside this view (e.g. AdPerformanceView's compact
 *  "Buyer-intent funnel" card) can reuse the exact same stage math instead
 *  of re-deriving it. */
export function buildFunnelStages(rows: DemographicRow[]): FunnelStage[] {
  // A MEASURED ZERO IS NOT A GAP, and this used to erase the difference.
  //
  // The old shape was `acc.purchases += r.purchases ?? 0` followed by
  // `value: s.v > 0 ? s.v : null`. Two coercions in opposite directions:
  // every missing row counted as zero, and then a genuine total of zero was
  // relabelled "not measured". The renderer below then dropped nulls
  // entirely, so on an account with real traffic and no purchases the
  // Purchase row VANISHED from the funnel.
  //
  // That is the most misleading thing this view could do. A reader sees a
  // funnel that stops at Add to cart and concludes the data ends there —
  // when what actually happened is that nobody bought. "Zero purchases" is
  // not the absence of a finding, it IS the finding, and it is the one a
  // buyer-intent funnel exists to surface.
  //
  // sumStrict is the platform's single aggregation-null policy (BUG-11): a
  // sum is null unless EVERY contributing row carried the value, and it is
  // null rather than 0 precisely because zero is meaningful in every metric
  // that feeds this. Applied here it separates the two cases for the first
  // time: no rows carry `purchases` -> null, the column exists and totals
  // zero -> 0.
  const totals = {
    impressions: sumStrict(rows, (r) => r.Impressions),
    clicksAll: sumStrict(rows, (r) => r["Clicks (all)"]),
    linkClicks: sumStrict(rows, (r) => r["Link clicks"]),
    atc: sumStrict(rows, (r) => r.adds_to_cart),
    checkout: sumStrict(rows, (r) => r.checkouts_initiated),
    purchases: sumStrict(rows, (r) => r.purchases),
  };

  const stages: { id: string; label: string; v: number | null; zone: FunnelStage["zone"] }[] = [
    { id: "impressions", label: "Impressions",  v: totals.impressions, zone: "awareness"  },
    { id: "clicks_all",  label: "Clicks (all)", v: totals.clicksAll,   zone: "engagement" },
    { id: "link_clicks", label: "Link clicks",  v: totals.linkClicks,  zone: "engagement" },
    { id: "atc",         label: "Add to cart",  v: totals.atc,         zone: "intent"     },
    { id: "checkout",    label: "Checkout",     v: totals.checkout,    zone: "intent"     },
    { id: "purchases",   label: "Purchase",     v: totals.purchases,   zone: "conversion" },
  ];

  return stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1]!.v;
    return {
      id: s.id,
      label: s.label,
      value: s.v,
      // A step share needs BOTH ends measured. Previously `pct` was handed
      // coerced zeros, so a null previous stage produced a percentage
      // derived from a number nobody measured.
      pctOfPrev: s.v != null && prev != null && prev > 0 ? pct(s.v, prev) : null,
      zone: s.zone,
    };
  });
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

/**
 * Delivery-based device breakdown. Exported for unit tests. Rows can be
 * entirely empty even when placement rows exist — Meta's export can omit
 * the "Impression device" breakdown for a given window/account. Callers
 * should fall back to conversion_tracking_signal.devices (funnel-attributed)
 * with honest labeling in that case, never blend the two bases.
 */
export function buildDeviceRows(rows: DeviceDeliveryRow[]): BreakdownRow[] {
  const grouped = new Map<string, DeviceDeliveryRow[]>();
  for (const r of rows) {
    if (!grouped.has(r.device)) grouped.set(r.device, []);
    grouped.get(r.device)!.push(r);
  }
  return [...grouped.entries()].map(([label, rs]) => {
    const impressions = rs.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const linkClicks  = rs.reduce((s, r) => s + (r.link_clicks ?? 0), 0);
    const results     = rs.reduce((s, r) => s + (r.results ?? 0), 0);
    const spend       = rs.reduce((s, r) => s + (r.spend ?? 0), 0);
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

/** Exported for unit tests. */
export function buildPlacementRows(rows: PlacementRow[]): BreakdownRow[] {
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

// ─── The funnel, drawn by the chart that already knows how ────────────
//
// This was a hand-rolled waterfall: one bar per stage, `if (!stage.value)
// return null` at the top of the map, and a zone tint per stage. Three
// things were wrong with it, and FunnelChart already solves all three.
//
//   1. IT DROPPED STAGES. `!stage.value` is true for null AND for zero, so
//      a measured zero disappeared — see buildFunnelStages above for why
//      that is the worst thing this view could do. FunnelChart draws a gap
//      as a gap and a zero as a zero, and counts how many of each.
//
//   2. NO BASIS CHOICE. Bars were scaled against the largest stage, always.
//      Against a 2.1M-impression top, every lower-funnel bar is a sliver —
//      true, and unreadable. FunnelChart lets the reader measure against
//      the previous stage instead, states which basis is active, and never
//      changes the numbers inside the bars.
//
//   3. THREE HUES FOR ONE MEASURE. The zone tint painted awareness,
//      intent and conversion bars in three different colours down a single
//      funnel — one measure wearing a categorical scale, which is the thing
//      the palette rules exist to prevent, and three competing colours in a
//      column the eye should be able to read top to bottom in one pass.
//
// The ZONES are real and worth keeping — they are just not a colour
// dimension. They now group the stages as labelled bands, so the reader
// still sees where awareness ends and intent begins without three hues
// arguing about it. ZONE_COLOR stays exported: other surfaces use its text
// and border steps for zone chips, where a tint IS carrying a category.

function FunnelWaterfall({ stages }: { stages: FunnelStage[] }) {
  const hasLowerFunnel = stages.some(
    (s) => (s.zone === "intent" || s.zone === "conversion") && s.value != null && s.value > 0,
  );

  // Zone bands, in stage order, skipping any zone with no stages.
  const bands = useMemo(() => {
    const out: { zone: FunnelStage["zone"]; label: string; stages: FunnelStage[] }[] = [];
    for (const stage of stages) {
      const last = out[out.length - 1];
      if (last && last.zone === stage.zone) last.stages.push(stage);
      else out.push({ zone: stage.zone, label: ZONE_LABEL[stage.zone], stages: [stage] });
    }
    return out;
  }, [stages]);

  return (
    <div className="space-y-4">
      {bands.map((band) => (
        <div key={band.zone}>
          <div className={cn(TYPE.label, "mb-1.5", ZONE_COLOR[band.zone].text)}>{band.label}</div>
          <FunnelChart
            stages={band.stages.map((st) => ({ key: st.id, label: st.label, value: st.value }))}
            unitLabel=""
            emptyLabel={`No ${band.label.toLowerCase()} data in this window`}
            defaultBasis="previous"
          />
        </div>
      ))}
      {!hasLowerFunnel && (
        <div className="mt-2">
          <CaveatNote text="Add-to-cart, checkout, and purchase data comes from the demographic export when the account is configured for ecommerce conversion tracking. Stages with no measurement are shown as gaps rather than zeros." />
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
        "pressable flex items-center gap-1 text-label font-semibold uppercase tracking-wide transition-colors",
        isActive ? "text-interactive" : "text-muted-foreground/75 hover:text-foreground/70"
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

/** Exported for unit tests. */
export function BreakdownTable({
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
    return <div className="text-body text-muted-foreground/75 py-4">No data for this breakdown.</div>;
  }

  const allCols: RankMetric<BreakdownRow>[] = BREAKDOWN_METRICS.filter((m) => rows.some((r) => m.value(r) != null));
  // Default: show only priority cols + the active sort col (always visible for context)
  // Default: show only priority cols + the active sort col (always visible for context).
  // Edge case: if none of the priority/sort columns have data (e.g. placement rows
  // where only Impressions and Spend are populated), fall back to showing every
  // available column rather than silently rendering a table with zero metric columns.
  const priorityCols = allCols.filter(
    (m) => PRIORITY_COL_IDS.includes(m.id as (typeof PRIORITY_COL_IDS)[number]) || m.id === sortId
  );
  const cols = showAllCols || priorityCols.length === 0 ? allCols : priorityCols;
  const hiddenCount = allCols.length - cols.length;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="nc-table">
          <thead>
            <tr>
              <th className="sticky left-0 bg-transparent">Segment</th>
              {cols.map((col) => (
                <th key={col.id} className="whitespace-nowrap">
                  <SortableHeader col={col} activeId={sortId} direction={activeMetric.direction} onSort={onSort} />
                </th>
              ))}
              <th>Bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const v = activeMetric.value(row);
              const bar = rankBarPct(v, allVals, activeMetric.direction);
              const isTop = i === 0;
              return (
                <tr
                  key={row.label}
                  className="group"
                  // The nc-table row background is itself the fading rule that
                  // paints the bottom border — a bare Tailwind bg-* utility can't
                  // out-specificity that class rule, so the top-row tint is
                  // layered into the same multi-background shorthand (mirroring
                  // how .nc-table tbody tr:hover layers a solid tint under its
                  // own fading rule) via inline style, which the cascade always
                  // honors over the class.
                  style={isTop ? {
                    background:
                      "linear-gradient(hsl(var(--foreground) / 0.015), hsl(var(--foreground) / 0.015)) no-repeat 0 0 / 100% 100%, " +
                      "linear-gradient(to right, transparent, hsl(var(--foreground) / 0.08) 48px, hsl(var(--foreground) / 0.08) calc(100% - 48px), transparent) no-repeat bottom / 100% 1px",
                  } : undefined}
                >
                  <td className="sticky left-0 bg-transparent">
                    <span className="font-medium text-foreground/90 whitespace-nowrap">{row.label}</span>
                  </td>
                  {cols.map((col) => {
                    const val = col.value(row);
                    return (
                      <td key={col.id} className={cn(
                        "tabular-nums whitespace-nowrap",
                        col.id === sortId ? "font-semibold text-interactive" : "text-foreground/70"
                      )}>
                        {val != null ? col.format(val) : <span className="text-muted-foreground/75">—</span>}
                      </td>
                    );
                  })}
                  <td className="w-32">
                    <div className="h-1.5 bg-foreground/[0.04] rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-interactive/50 rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform]"
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
          className="pressable flex items-center gap-1 text-label font-medium text-muted-foreground/75 hover:text-foreground/70 transition-colors"
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
      <div className="flex items-center justify-center h-64 text-body text-muted-foreground/75">
        Need reach + impression data to plot frequency scatter.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-label text-muted-foreground/75">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-chart-1/70" />
          <span>High freq + high CTR → scale safely</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-destructive/70" />
          <span>High freq + low CTR → creative fatigue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-chart-3/70" />
          <span>Low freq + high CTR → expand budget</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          <span>Low freq + low CTR → wrong audience</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 50, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--foreground) / 0.04)" />
          <XAxis
            dataKey="x"
            type="number"
            name="Frequency"
            label={{ value: "Frequency (impressions / reach)", position: "bottom", offset: 0, style: { fontSize: 10, fill: "hsl(var(--foreground) / 0.4)" } }}
            tick={{ fontSize: 10, fill: "hsl(var(--foreground) / 0.5)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            name="Link CTR %"
            label={{ value: "Link CTR %", angle: -90, position: "left", offset: -10, style: { fontSize: 10, fill: "hsl(var(--foreground) / 0.4)" } }}
            tick={{ fontSize: 10, fill: "hsl(var(--foreground) / 0.5)" }}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine x={medFreq} stroke="hsl(var(--foreground) / 0.12)" strokeDasharray="4 3" />
          <ReferenceLine y={medCtr}  stroke="hsl(var(--foreground) / 0.12)" strokeDasharray="4 3" />
          <RechartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as (ScatterPoint & { spendShare: number });
              return (
                <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm px-3 py-2 elevation-floating text-caption space-y-0.5">
                  <div className="font-semibold text-foreground">{p.label}</div>
                  <div className="text-muted-foreground/75">Frequency: <span className="text-foreground/90">{fmtFreq(p.x)}</span></div>
                  <div className="text-muted-foreground/75">Link CTR: <span className="text-foreground/90">{fmtRate(p.y, 2)}</span></div>
                  <div className="text-muted-foreground/75">Spend share: <span className="text-foreground/90">{fmtRate(p.spendShare * 100)}</span></div>
                </div>
              );
            }}
          />
          <Scatter data={plotData}>
            {plotData.map((p, i) => {
              const highFreq = p.x >= medFreq;
              const highCtr  = p.y >= medCtr;
              // Each quadrant is a VERDICT on the segment, not a category:
              //   low freq + high CTR  -> fresh audience still converting (good)
              //   high freq + high CTR -> working but saturating (neutral)
              //   high freq + low CTR  -> fatigue (bad)
              //   low freq + low CTR   -> too little delivery to read yet
              const color = !highFreq && highCtr ? VERDICT.good
                : highFreq && highCtr ? VERDICT.neutral
                : highFreq && !highCtr ? VERDICT.bad
                : VERDICT.unmeasured;
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
    <div className="rounded-xl border border-border/30 bg-foreground/[0.015] p-5 flex items-start gap-3">
      <Video className="w-5 h-5 text-muted-foreground/75 shrink-0 mt-0.5" />
      <div className="space-y-1.5 max-w-xl flex-1 min-w-0">
        <div className="text-body font-semibold text-foreground/80">Video engagement metrics not available</div>
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

  const demoRows   = analysis?.demographic_registration_signal ?? [];
  const placRows   = [...(analysis?.v3_placement_signal ?? []), ...(analysis?.c4e_placement_signal ?? [])];
  const deviceRows: DeviceDeliveryRow[] = analysis?.device_delivery_signal ?? [];
  const convDevices = analysis?.conversion_tracking_signal?.devices ?? [];

  const funnelStages = useMemo(() => buildFunnelStages(demoRows), [demoRows]);

  const breakdownRows = useMemo<BreakdownRow[]>(() => {
    if (dim === "audience")  return buildAudienceRows(demoRows);
    if (dim === "placement") return buildPlacementRows(placRows);
    return buildDeviceRows(deviceRows);
  }, [dim, demoRows, placRows, deviceRows]);

  // If the persisted sort metric has no values in the current dimension's rows
  // (e.g. Frequency is audience-only and disappears in Placement mode), fall back
  // to "ctrLink" or the first metric that actually has data. Without this, rows
  // are sorted by an all-null column and no header is highlighted — an invisible sort.
  const effectiveSortId = useMemo(() => {
    if (breakdownRows.length === 0) return sortId;
    const activeMetric = BREAKDOWN_METRICS.find((m) => m.id === sortId);
    if (activeMetric && breakdownRows.some((r) => activeMetric.value(r) != null)) {
      return sortId; // persisted sort has data in this dimension — keep it
    }
    // Prefer ctrLink (the default), otherwise use the first metric with any data.
    const preferred = BREAKDOWN_METRICS.find(
      (m) => m.id === "ctrLink" && breakdownRows.some((r) => m.value(r) != null)
    );
    const firstAvailable = BREAKDOWN_METRICS.find(
      (m) => breakdownRows.some((r) => m.value(r) != null)
    );
    return (preferred ?? firstAvailable)?.id ?? sortId;
  }, [sortId, breakdownRows]);

  // Sync the fallback back to storage so the RankSortBar chip and the table
  // header both reflect the same sort after a dimension switch.
  useEffect(() => {
    if (effectiveSortId !== sortId) {
      setSort(effectiveSortId);
    }
  }, [effectiveSortId, sortId, setSort]);

  const summaryTiles = useMemo(() => buildSummaryTiles(demoRows), [demoRows]);

  return (
    <ModuleScopeGate section={SECTION} title="Engagement Funnel" account={account}>
      {() => {
        const acct = account!;

        if (demoRows.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Engagement Funnel" accountName={acct.name} tabs="analysis" />
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
              accountName={acct.name}
              subtitle="Upstream engagement quality — reach, frequency, CTR all vs link — through to purchase. Sortable by any stage, any dimension."
              tabs="analysis"
            />

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
              <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5 bg-foreground/[0.02]">
                {([ ["funnel", "Funnel", Layers], ["breakdown", "Breakdown", Table2], ["scatter", "Scatter", Activity] ] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "pressable inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-caption font-medium transition-colors",
                      viewMode === mode
                        ? "bg-primary/20 text-interactive border border-primary/25"
                        : "text-muted-foreground/75 hover:text-foreground/80"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Breakdown dimension (only in breakdown/scatter mode) */}
              {(viewMode === "breakdown" || viewMode === "scatter") && (
                <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5 bg-foreground/[0.02]">
                  {([ ["audience", "Audience"], ["placement", "Placement"], ["device", "Device"] ] as const).map(([d, l]) => (
                    <button
                      key={d}
                      onClick={() => setDim(d)}
                      className={cn(
                        "pressable px-2.5 py-1.5 rounded-md text-caption font-medium transition-colors",
                        dim === d
                          ? "bg-primary/20 text-interactive border border-primary/25"
                          : "text-muted-foreground/75 hover:text-foreground/80"
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
                    activeId={effectiveSortId}
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
                      <div className="rounded-lg border border-border/30 bg-foreground/[0.02] p-4">
                        <div className="text-label font-semibold uppercase tracking-wide text-muted-foreground/75 mb-1">CTR All</div>
                        <div className="text-display font-bold text-foreground">{fmtRate(summaryTiles.ctrAll, 2)}</div>
                        <div className="text-label text-muted-foreground/75 mt-1">All clicks ÷ impressions</div>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-foreground/[0.02] p-4">
                        <div className="text-label font-semibold uppercase tracking-wide text-muted-foreground/75 mb-1">CTR Link</div>
                        <div className="text-display font-bold text-foreground">{fmtRate(summaryTiles.ctrLink, 2)}</div>
                        <div className="text-label text-muted-foreground/75 mt-1">Link clicks ÷ impressions</div>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-foreground/[0.02] p-4">
                        <div className="text-label font-semibold uppercase tracking-wide text-muted-foreground/75 mb-1">Reach CTR</div>
                        <div className="text-display font-bold text-foreground">{fmtRate(summaryTiles.reachCtr, 2)}</div>
                        <div className="text-label text-muted-foreground/75 mt-1">Link clicks ÷ unique reach</div>
                      </div>
                    </div>
                    {summaryTiles.ctrAll != null && summaryTiles.ctrLink != null && summaryTiles.ctrAll > 0 && (
                      <div className="mt-3 p-3 rounded-lg border border-border/25 bg-foreground/[0.01] text-caption text-muted-foreground/75">
                        <span className="font-medium text-foreground/80">Intent conversion: </span>
                        {fmtRate(pct(summaryTiles.ctrLink, summaryTiles.ctrAll), 0)} of all clicks become link clicks.
                        {summaryTiles.ctrLink != null && summaryTiles.ctrAll != null && summaryTiles.ctrAll > 0 && summaryTiles.ctrLink / summaryTiles.ctrAll < 0.4 && (
                          <span className="text-status-warning/70 ml-1">Low ratio — check for high engagement creative that doesn't drive off-platform intent.</span>
                        )}
                      </div>
                    )}
                  </SectionCard>

                  <VideoPlaceholder />
                </>
              )}

              {viewMode === "breakdown" && (
                <SectionCard
                  title={`${dim === "audience" ? "Audience segment" : dim === "placement" ? "Placement" : "Device"} breakdown`}
                  desc={`All engagement metrics by ${dim === "audience" ? "age × gender pocket" : dim === "placement" ? "placement × platform" : "impression device"}. Sort by any column to find highest-frequency or highest-intent segments.`}
                  right={
                    <>
                      <span className="text-label text-muted-foreground/75">
                        {breakdownRows.length} {dim === "audience" ? "pockets" : dim === "placement" ? "placements" : "devices"}
                      </span>
                      <SectionInfoIcon tip="Sortable table of engagement metrics for each segment. Switch the sort column to surface your highest-frequency or highest-intent pockets." />
                    </>
                  }
                >
                  {dim === "device" && breakdownRows.length === 0 ? (
                    <>
                      <div className="text-body text-muted-foreground/75 py-4">No device breakdown for this window.</div>
                      <CaveatNote
                        text={
                          convDevices.length > 0
                            ? "Meta's export didn't include per-device delivery data for this window, so device-level spend/impressions aren't available. Conversion-attributed device data is shown on the Placements page instead (funnel actions only — no spend/impressions)."
                            : "Meta's export didn't include per-device delivery data for this window — this can happen for certain date ranges or account states. Placement and platform breakdowns are unaffected."
                        }
                      />
                    </>
                  ) : (
                    <BreakdownTable rows={breakdownRows} sortId={effectiveSortId} onSort={setSort} />
                  )}
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
                    title={`Frequency × Link CTR — ${dim === "audience" ? "Audience segments" : dim === "placement" ? "Placements" : "Devices"}`}
                    desc="Each dot is a segment. Bubble size = spend share. Reference lines show the account median. High-frequency + low-CTR segments signal creative fatigue."
                    right={<SectionInfoIcon tip="Segments above the median frequency line but below the median CTR line are candidates for creative refresh — they've seen the ad often enough that engagement is declining." />}
                  >
                    {dim === "audience" ? (
                      <FrequencyScatter rows={breakdownRows} />
                    ) : (
                      <div className="flex items-center justify-center h-40 text-body text-muted-foreground/75">
                        Placement rows don't include Reach data — frequency scatter requires the demographic export.
                        <button
                          onClick={() => setDim("audience")}
                          className="pressable ml-2 text-interactive underline"
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
