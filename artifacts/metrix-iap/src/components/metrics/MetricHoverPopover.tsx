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

import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell as RechartsCell,
  ReferenceLine,
  LabelList,
} from "recharts";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/command-deck/components/ui/hover-card";
import { ChartContainer, type ChartConfig } from "@workspace/command-deck/components/ui/chart";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import type { CellPerformanceRow } from "@/lib/data/seedTypes";
import { topConceptsForMetric } from "@/lib/data/metricConceptUtils";

// ── Chart config (single series) ────────────────────────────────────

const DEFAULT_CONFIG: ChartConfig = {
  value: { label: "Value", color: "hsl(var(--interactive))" },
};
const CPA_CONFIG: ChartConfig = {
  value: { label: "CPA", color: "hsl(var(--chart-amber, 38 92% 50%))" },
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
  // A cost metric's bar is a magnitude, not a verdict and not a warning. It
  // gets a second series hue so cost reads as a different measure from volume,
  // without implying anything is wrong: amber here made every CPA hover look
  // like a data-quality alert.
  const barColor = isCpa ? "hsl(var(--chart-3))" : "hsl(var(--interactive))";

  // Truncate concept names for Y-axis
  const chartData = concepts.map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name,
    value: c.value,
    display: c.metricDisplay,
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

      <HoverCardContent
        className="w-[300px] p-0 bg-popover/95 backdrop-blur-sm border border-border/60 elevation-floating overflow-hidden rounded-xl"
        side="bottom"
        align="start"
        sideOffset={6}
      >
        {/* Accent top stripe */}
        <div className="h-[2px] w-full bg-gradient-to-r from-interactive/80 via-interactive/40 to-transparent" />

        {/* Header */}
        <div className="px-3 pt-2.5 pb-2.5 border-b border-[hsl(var(--border-subtle))]">
          <div
            className="text-micro font-mono uppercase text-muted-foreground/75 mb-1"
            data-testid="metric-popover-header-label"
          >
            {metric.label}
          </div>
          <div className="text-stat metric-num leading-none text-foreground">{metric.formatted}</div>
          {metric.sub && (
            <div className="text-caption font-mono text-muted-foreground/75 mt-1 truncate tracking-wide">{metric.sub}</div>
          )}
        </div>

        {/* Chart or stat fallback */}
        <div className="px-3 py-3">
          {hasChart ? (
            <>
              <div className="text-micro font-mono uppercase text-interactive/70 mb-2">
                Top concepts
              </div>
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[135px] w-full"
              >
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
                  barSize={11}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={102}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit", opacity: 0.9 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  {refValue != null && (
                    <ReferenceLine
                      x={refValue}
                      stroke="hsl(var(--interactive))"
                      strokeDasharray="3 3"
                      strokeOpacity={0.35}
                      label={{
                        value: "avg",
                        position: "insideTopRight",
                        fontSize: 8,
                        fill: "hsl(var(--interactive))",
                        opacity: 0.55,
                      }}
                    />
                  )}
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {chartData.map((_, i) => (
                      <RechartsCell key={i} fill={barColor} fillOpacity={0.95 - i * 0.1} />
                    ))}
                    <LabelList
                      dataKey="display"
                      position="right"
                      style={{ fontSize: 9, fill: "hsl(var(--foreground))", opacity: 0.9, fontFamily: "inherit", fontWeight: 500 }}
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
                  : "Only one concept found — full breakdown available in the diagnostic."}
              </div>
              {metric.sub && (
                <div className="text-caption font-mono text-muted-foreground/75">{metric.sub}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 border-t border-[hsl(var(--border-subtle))] pt-2">
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
