// ─── Share Pie/Donut Chart ───────────────────────────────────────────
// Donut chart for share of spend or results across segments.
// Interactive tooltips; neutral "Other" bucket for thin and overflow slices.
// Accessibility: chart legend always visible; empty state instead of null;
// loading skeleton via isLoading prop.
//
// The palette is the five categorical chart slots and nothing else. It is
// NOT cycled — see lib/share-slices.ts for why the previous ten-entry,
// modulo-indexed list painted different segments the same colour. The
// slots come from chartTokens; this file used to carry its own copy of the
// list, which is how a re-stepped scale would have left this one chart
// behind.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import { allocateShareSlices } from "@/lib/share-slices";
import { MARK, NEUTRAL_VAR, SERIES_VARS } from "./chartTokens";
import { chartTooltipRenderer } from "./chartChrome";

interface SharePieChartProps {
  data: { name: string; value: number }[];
  unit: "usd" | "count";
  height?: number;
  showLegend?: boolean;
  isLoading?: boolean;
  emptyLabel?: string;
}

/** "Other" is not a category, so it does not get a categorical hue. */
const OTHER_VAR = NEUTRAL_VAR;

const sliceFill = (i: number, namedCount: number) =>
  i < namedCount ? SERIES_VARS[i]! : OTHER_VAR;

export function SharePieChart({
  data,
  unit,
  height = 220,
  showLegend = true,
  isLoading = false,
  emptyLabel = "No data yet",
}: SharePieChartProps) {
  if (isLoading) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-3"
        style={{ height }}
        aria-label="Loading chart"
        role="status"
      >
        <div className="w-32 h-32 rounded-full border-8 border-foreground/[0.06] animate-pulse" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {[80, 56, 64].map((w) => (
            <div key={w} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-foreground/[0.08] animate-pulse" />
              <div className="h-2.5 rounded bg-foreground/[0.08] animate-pulse" style={{ width: w }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-2 text-muted-foreground/75"
        style={{ height }}
        role="img"
        aria-label={emptyLabel}
      >
        <div className="w-20 h-20 rounded-full border-4 border-dashed border-border/30" />
        <span className="text-caption">{emptyLabel}</span>
      </div>
    );
  }

  const { named, folded, other, slices, total } = allocateShareSlices(data, SERIES_VARS.length);

  const fmt = unit === "usd"
    ? (v: number) => fmtUSD(v, 0)
    : (v: number) => fmtNum(v);
  const valueLabel = unit === "usd" ? "Spend" : "Count";

  const renderTooltip = chartTooltipRenderer<{ name: string; value: number }>((d) => {
    const i = slices.findIndex((s) => s.name === d.name);
    const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
    const isOther = other != null && d.name === other.name;
    return {
      title: d.name,
      rows: [
        { label: valueLabel, value: fmt(d.value), swatch: sliceFill(i < 0 ? slices.length : i, named.length) },
        { label: "Share", value: `${pct}%` },
      ],
      detail: isOther
        ? `${folded.length} segment${folded.length === 1 ? "" : "s"}: ${folded.map((f) => f.name).join(", ")}`
        : undefined,
    };
  });

  return (
    <div
      className="w-full flex flex-col items-center"
      style={{ height }}
      role="img"
      aria-label={
        `Donut chart: ${slices.map((d) => `${d.name} ${fmt(d.value)}`).join(", ")}` +
        (other ? `. Other holds ${folded.length}: ${folded.map((f) => f.name).join(", ")}` : "")
      }
    >
      <div className="w-full flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Radii are RELATIVE, not pixels. They were innerRadius={60}
              outerRadius={90} — absolute px, so the donut always demanded a
              180x180 box no matter what box it was given. On the Analysis
              Overview card that box measures 170x105, and all three sectors
              were drawn outside it: one starting 38px above the top edge,
              another running 33px below the bottom. The ring rendered as a
              set of clipped arcs. Percentages resolve against the smaller of
              width and height, so the donut now fits whatever it is placed
              in — this card and the 220px default alike. */}
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
            {...MARK.noAnimation}
          >
            {slices.map((d, i) => (
              <Cell key={d.name} fill={sliceFill(i, named.length)} />
            ))}
          </Pie>
          <Tooltip content={renderTooltip} wrapperStyle={{ outline: "none" }} />
        </PieChart>
      </ResponsiveContainer>
      </div>

      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1" aria-hidden="true">
          {slices.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: sliceFill(i, named.length) }}
              />
              <span className="text-label text-muted-foreground/80">{d.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
