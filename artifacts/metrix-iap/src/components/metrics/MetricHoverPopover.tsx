// ─── Metric Hover Popover ──────────────────────────────────────────────
// Wraps a metric tile in a Radix HoverCard that shows a compact bar chart
// of the top-5 concepts driving that metric, plus a footer link to the
// full MetricDiagnosticModal.
//
// Touch support: on devices where hover is unavailable (tablets / phones)
// the built-in Radix hover trigger never fires.  This component detects
// that situation and switches to a tap-to-toggle model:
//   • Tap the Info icon  → open / close the popover
//   • Tap the tile body  → open MetricDiagnosticModal (unchanged)
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
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
  const isCpa = metric.id === "cpa_blended";
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
  const barColor = isCpa ? "#f59e0b" : "hsl(var(--interactive))";

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
            className="absolute top-2 right-2 p-0.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            <Info className="w-3 h-3" />
          </button>
        </div>
      </HoverCardTrigger>

      <HoverCardContent
        className="w-[300px] p-0 bg-popover/95 backdrop-blur-sm border-border/60 shadow-xl overflow-hidden"
        side="bottom"
        align="start"
        sideOffset={6}
      >
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-border/40">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-0.5">
            {metric.label}
          </div>
          <div className="text-stat metric-num leading-none">{metric.formatted}</div>
          {metric.sub && (
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{metric.sub}</div>
          )}
        </div>

        {/* Chart or stat fallback */}
        <div className="px-3 py-2.5">
          {hasChart ? (
            <>
              <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1.5">
                Top concepts
              </div>
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[130px] w-full"
              >
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
                  barSize={10}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  {refValue != null && (
                    <ReferenceLine
                      x={refValue}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                      label={{
                        value: "avg",
                        position: "insideTopRight",
                        fontSize: 8,
                        fill: "hsl(var(--muted-foreground))",
                        opacity: 0.6,
                      }}
                    />
                  )}
                  <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                    {chartData.map((_, i) => (
                      <RechartsCell key={i} fill={barColor} fillOpacity={1 - i * 0.12} />
                    ))}
                    <LabelList
                      dataKey="display"
                      position="right"
                      style={{ fontSize: 9, fill: "hsl(var(--foreground))", opacity: 0.8, fontFamily: "inherit" }}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </>
          ) : (
            <div className="py-2 space-y-1">
              <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
                {concepts.length === 0
                  ? "No concept rows available for this metric in the current import."
                  : "Only one concept found — full breakdown available in the diagnostic."}
              </div>
              {metric.sub && (
                <div className="text-[10px] font-mono text-muted-foreground/50">{metric.sub}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 border-t border-border/30 pt-2">
          <button
            onClick={onDiagnose}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-interactive hover:text-interactive/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            Diagnose full breakdown <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
