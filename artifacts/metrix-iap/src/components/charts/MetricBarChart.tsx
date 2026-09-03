// ─── Metric bar chart ─────────────────────────────────────────────────
//
// Ranked comparison across a categorical breakdown — placement, device,
// age band, concept, ad. One measure, one axis. Horizontal by default,
// because breakdown labels are words: a horizontal bar gives the label a
// full line instead of rotating it 45° under a vertical one.
//
// Honesty: a null measure is a gap with a dash, never a zero-height bar.
// A bar of length zero and a bar for "we could not measure this" must not
// look the same.

import { useMemo, useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { AXIS, MARK, NEUTRAL_VAR, seriesColor } from "./chartTokens";
import { chartTooltipRenderer, ChartEmpty, ChartSkeleton } from "./chartChrome";

export interface BarDatum {
  /** Stable identity. Colour follows this, never the sort position. */
  key: string;
  label: string;
  /** Null means "not measured" — rendered as a gap, not a zero bar. */
  value: number | null;
  /** Optional second line in the tooltip (e.g. "12 ads · $4,201 spend"). */
  detail?: string;
}

export interface MetricBarChartProps {
  data: BarDatum[];
  /** Formats the value for the axis, the tooltip and the direct label. */
  format: (n: number) => string;
  /** Names the measure. Required — a bar chart with an unnamed axis is a shape. */
  measureLabel: string;
  height?: number;
  /** Beyond this many bars the chart stops direct-labelling and relies on the axis. */
  directLabelMax?: number;
  /** Highest first (default) or lowest first — CPA-style metrics want ascending. */
  order?: "desc" | "asc";
  /** Cap the bars shown. The remainder is reported, never silently dropped. */
  limit?: number;
  isLoading?: boolean;
  emptyLabel?: string;
  /** One accent slot for the whole series (a single measure is one series). */
  colorIndex?: number;
}

export function MetricBarChart({
  data,
  format,
  measureLabel,
  height = 260,
  directLabelMax = 12,
  order = "desc",
  limit,
  isLoading = false,
  emptyLabel = "No data yet",
  colorIndex = 0,
}: MetricBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { rows, unmeasured, hidden } = useMemo(() => {
    const measured = data.filter((d) => d.value != null);
    const unmeasured = data.length - measured.length;
    const sorted = [...measured].sort((a, b) =>
      order === "desc" ? b.value! - a.value! : a.value! - b.value!,
    );
    const rows = limit != null ? sorted.slice(0, limit) : sorted;
    return { rows, unmeasured, hidden: sorted.length - rows.length };
  }, [data, order, limit]);

  if (isLoading) return <ChartSkeleton height={height} />;
  if (rows.length === 0) return <ChartEmpty height={height} label={emptyLabel} />;

  const fill = seriesColor(colorIndex);
  const showLabels = rows.length <= directLabelMax;

  return (
    <div className="w-full">
      <div
        style={{ height }}
        role="img"
        aria-label={
          `Bar chart of ${measureLabel}: ` +
          rows.map((r) => `${r.label} ${format(r.value!)}`).join(", ") +
          (unmeasured > 0 ? `. ${unmeasured} not measured` : "")
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: showLabels ? 64 : 12, bottom: 4, left: 4 }}
            barCategoryGap={MARK.gap * 2}
          >
            <CartesianGrid horizontal={false} {...AXIS.grid} />
            <XAxis
              type="number"
              tickFormatter={(v) => format(Number(v))}
              tick={AXIS.tick}
              axisLine={{ stroke: AXIS.stroke }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={132}
              tick={AXIS.tick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={AXIS.cursorFill}
              content={chartTooltipRenderer<BarDatum>((d) => ({
                title: d.label,
                rows: [{ label: measureLabel, value: format(d.value!), swatch: fill }],
                detail: d.detail,
              }))}
              wrapperStyle={{ outline: "none" }}
            />
            <Bar
              dataKey="value"
              // Rounded data-end only; the baseline end stays square so the
              // bar reads as anchored rather than floating.
              radius={[0, MARK.barRadius, MARK.barRadius, 0]}
              {...MARK.noAnimation}
              onMouseEnter={(_, i) => setHovered(rows[i]?.key ?? null)}
              onMouseLeave={() => setHovered(null)}
            >
              {rows.map((r) => (
                <Cell
                  key={r.key}
                  fill={fill}
                  // Dim the rest rather than brightening one: the hovered
                  // bar keeps its true colour, so the reading does not shift.
                  fillOpacity={hovered === null || hovered === r.key ? 1 : 0.45}
                />
              ))}
              {showLabels && (
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number) => format(v)}
                  className="tabular-nums"
                  style={MARK.valueLabel}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {(unmeasured > 0 || hidden > 0) && (
        <p className="text-label text-muted-foreground/80 mt-1.5 tabular-nums">
          {[
            hidden > 0 ? `${hidden} more not shown` : null,
            unmeasured > 0 ? `${unmeasured} not measured` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** Exported for the tooltip's neutral fallback in consumer stories/tests. */
export const BAR_NEUTRAL = NEUTRAL_VAR;
