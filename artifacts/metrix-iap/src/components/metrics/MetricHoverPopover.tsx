// ─── Metric Hover Popover ──────────────────────────────────────────────
// Wraps a metric tile in a Radix HoverCard that shows a compact bar chart
// of the top-5 concepts driving that metric, plus a footer link to the
// full KpiDrilldownModal.
//
// Touch support: on devices where hover is unavailable (tablets / phones)
// the built-in Radix hover trigger never fires.  This component detects
// that situation and switches to a tap-to-toggle model:
//   • Tap the Info icon  → open / close the popover
//   • Tap the tile body  → open KpiDrilldownModal (unchanged)
// Desktop hover behaviour is fully preserved — no regression.
//
// The chart draws from chartTokens / chartChrome and nothing else. It used
// to paint its bars `hsl(var(--interactive))` — a token that does not exist
// (index.css defines `--color-interactive`), so the SVG fill resolved to
// nothing and fell back to black over the navy card — with ticks at 9px, a
// reference label at 8px, opacity stepped by RANK (the fifth concept was
// visibly fainter for being fifth) and no tooltip. Every one of those is
// now a shared token, so the next chart cannot re-invent them.

import { useId, useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  LabelList,
  Tooltip,
} from "recharts";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/command-deck/components/ui/hover-card";
import { ChartContainer, type ChartConfig } from "@workspace/command-deck/components/ui/chart";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import type { CellPerformanceRow } from "@/lib/data/seedTypes";
import { topConceptsForMetric } from "@/lib/data/metricConceptUtils";
import { AXIS, MARK, SERIES } from "@/components/charts/chartTokens";
import { chartTooltipRenderer } from "@/components/charts/chartChrome";
import { fmtNum, fmtUSD } from "@/pages/metrix/shared";

// ── Chart config (single series) ────────────────────────────────────
// One accent for a volume metric; the cost series colour for a cost metric,
// so cost reads as a DIFFERENT MEASURE from volume without implying that
// anything is wrong — never amber (the data-quality colour) and never a
// verdict hue.

const DEFAULT_CONFIG: ChartConfig = {
  value: { label: "Value", color: SERIES.interactive },
};
const CPA_CONFIG: ChartConfig = {
  value: { label: "Cost", color: SERIES.cost },
};

// ── Touch detection ──────────────────────────────────────────────────
// `hover: none` is true on pure-touch devices (phones, tablets).
// We read it once per component mount; the result is stable for the
// lifetime of the component.

function useIsTouch(): boolean {
  return useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
    []
  );
}

// ── Chart datum ──────────────────────────────────────────────────────

interface ConceptBar {
  /** Truncated for the axis; `fullName` is what the tooltip shows. */
  name: string;
  fullName: string;
  value: number | null;
  display: string;
  spend: number;
  results: number;
}

const AXIS_LABEL_MAX = 18;

// ── Main component ───────────────────────────────────────────────────

interface MetricHoverPopoverProps {
  metric: MetricDef;
  cellRows: CellPerformanceRow[];
  onDiagnose: () => void;
  /** Tile content — must NOT include the Info icon; this component renders it. */
  children: React.ReactNode;
}

export function MetricHoverPopover({ metric, cellRows, onDiagnose, children }: MetricHoverPopoverProps) {
  const isCpa = metric.id === "cpa_blended" || metric.id.startsWith("cost:");
  const isCtr = metric.id === "link_ctr";
  const isTouch = useIsTouch();
  // A gradient id must be unique per mounted chart: two popovers on one
  // page sharing an id would paint from whichever <defs> mounted last.
  const gradientId = `metric-popover-fill-${useId().replace(/:/g, "")}`;

  // Controlled open state lets us:
  //   • keep Radix hover on desktop (onOpenChange fires on pointer-enter/leave)
  //   • manually toggle on touch via the Info button
  const [open, setOpen] = useState(false);

  // Top-5 concepts for this metric
  const concepts = topConceptsForMetric(cellRows, metric, 5);

  // Account-level reference value for rate metrics
  const refValue: number | null = (() => {
    if (isCtr && metric.value != null) return metric.value;
    if (isCpa && metric.value != null) return metric.value;
    return null;
  })();

  const hasChart = concepts.length >= 2;
  const chartConfig = isCpa ? CPA_CONFIG : DEFAULT_CONFIG;
  const barColor = isCpa ? SERIES.cost : SERIES.interactive;

  const chartData: ConceptBar[] = concepts.map((c) => ({
    name: c.name.length > AXIS_LABEL_MAX ? c.name.slice(0, AXIS_LABEL_MAX - 1) + "…" : c.name,
    fullName: c.name,
    value: c.value,
    display: c.metricDisplay,
    spend: c.spend,
    results: c.results,
  }));

  const renderTooltip = chartTooltipRenderer<ConceptBar>((d) => ({
    title: d.fullName,
    rows: [
      { label: metric.label, value: d.display, swatch: barColor },
      { label: "Spend", value: fmtUSD(d.spend, 0) },
      { label: "Results", value: fmtNum(d.results) },
    ],
  }));

  // ── Info icon click handler ──────────────────────────────────────
  // Touch: toggle the popover, stop propagation so the tile button
  //        (which opens the modal) is not also triggered.
  // Desktop: open the full diagnostic modal, matching the pre-existing
  //          behaviour where clicking the Info icon area opened the modal.
  const handleInfoClick = (e: React.MouseEvent) => {
    if (isTouch) {
      e.stopPropagation();
      setOpen((prev) => !prev);
    } else {
      onDiagnose();
    }
  };

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={220} closeDelay={80}>
      {/*
        The trigger wraps a relative container holding:
          1. `children` — the tile button (opens modal on click)
          2. Info icon — absolutely positioned; drives popover on touch,
             opens modal on desktop (click falls through to onDiagnose).
        We add `group` here so child elements can use group-hover utilities.
      */}
      <HoverCardTrigger asChild>
        <div className="relative group">
          {children}
          <button
            type="button"
            aria-label={open ? "Hide metric chart" : "Show metric chart"}
            aria-expanded={open}
            onClick={handleInfoClick}
            className="pressable absolute top-2 right-2 p-0.5 text-muted-foreground/75 group-hover:text-muted-foreground/75 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            <Info className="w-3 h-3" />
          </button>
        </div>
      </HoverCardTrigger>

      {/* The surface (bg, blur, ring, elevation, radius) is the HoverCardContent
          default now; this only sets the width and drops the padding so the
          accent stripe can run edge to edge. */}
      {/* Bounded to the room the viewport has (Radix's available-height
          variable) with an internal scroll, and kept 8 px off the edges: at
          390 px the card's 490 px of chart and table flipped above its tile
          and ran 34 px past the top of the screen with no way to reach it
          (check:controls, 2026-09-05). */}
      <HoverCardContent
        className="w-[320px] p-0 overflow-x-hidden overflow-y-auto max-h-[var(--radix-hover-card-content-available-height)]"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
      >
        {/* Accent top stripe — the series colour, so a cost popover is keyed
            to its bars before the reader gets to them. */}
        <div
          aria-hidden="true"
          className="h-[2px] w-full"
          style={{ background: `linear-gradient(to right, ${barColor}, transparent)` }}
        />

        {/* Header: eyebrow, big stat, caveat */}
        <div className="px-3.5 pt-3 pb-3 border-b border-border-subtle">
          <div
            className="text-micro uppercase text-muted-foreground/75 mb-1.5"
            data-testid="metric-popover-header-label"
          >
            {metric.label}
          </div>
          <div className="text-stat metric-num leading-none text-foreground tabular-nums">{metric.formatted}</div>
          {metric.sub && (
            <div className="text-caption text-muted-foreground/75 mt-1.5 truncate">{metric.sub}</div>
          )}
        </div>

        {/* Chart or stat fallback */}
        <div className="px-3.5 pt-3 pb-2.5">
          {hasChart ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-micro uppercase text-muted-foreground/75">Top concepts</div>
                <div className="flex items-center gap-1.5 text-micro uppercase text-muted-foreground/75">
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-[2px] shrink-0"
                    style={{ backgroundColor: barColor }}
                  />
                  {isCpa ? "Cost" : metric.label}
                  {/* The account's own value is the dashed line in the chart;
                      it is named here, not on the line, where a label at the
                      line's foot sat over the first row's axis text. */}
                  {refValue != null && (
                    <span className="normal-case tracking-normal tabular-nums text-muted-foreground/75">· avg {metric.formatted}</span>
                  )}
                </div>
              </div>
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[140px] w-full"
              >
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 0, right: 52, bottom: 0, left: 0 }}
                  barSize={MARK.barSize}
                  barCategoryGap={MARK.gap * 2}
                >
                  <defs>
                    {/* Token colour at two opacities — a flat entity colour
                        with a little light on the data end. Nothing here
                        varies by rank. */}
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={barColor} stopOpacity={0.78} />
                      <stop offset="100%" stopColor={barColor} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={112}
                    tick={AXIS.tick}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={AXIS.cursorFill}
                    content={renderTooltip}
                    wrapperStyle={{ outline: "none", zIndex: 1 }}
                  />
                  {refValue != null && (
                    <ReferenceLine x={refValue} {...AXIS.reference} />
                  )}
                  <Bar
                    dataKey="value"
                    fill={`url(#${gradientId})`}
                    radius={[0, MARK.barRadius, MARK.barRadius, 0]}
                    {...MARK.noAnimation}
                  >
                    <LabelList
                      dataKey="display"
                      position="right"
                      className="tabular-nums"
                      style={MARK.valueLabel}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </>
          ) : (
            <div className="py-2 space-y-1">
              <div className="text-caption text-muted-foreground/75 leading-relaxed">
                {concepts.length === 0
                  ? "No concept rows available for this metric in the current import."
                  : "Only one concept found · full breakdown available in the diagnostic."}
              </div>
              {metric.sub && (
                <div className="text-caption text-muted-foreground/75">{metric.sub}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3.5 pb-3 border-t border-border-subtle pt-2.5">
          <button
            onClick={onDiagnose}
            className="pressable inline-flex items-center gap-1 text-caption font-semibold text-interactive hover:text-interactive/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            Diagnose full breakdown <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
