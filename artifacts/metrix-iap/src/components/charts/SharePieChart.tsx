// ─── Share Pie/Donut Chart ───────────────────────────────────────────
// Donut chart for share of spend or results across segments.
// Interactive tooltips; neutral "Other" bucket for thin and overflow slices.
// Accessibility: chart legend always visible; empty state instead of null;
// loading skeleton via isLoading prop.
//
// The palette is the five categorical chart slots and nothing else. It is
// NOT cycled — see lib/share-slices.ts for why the previous ten-entry,
// modulo-indexed list painted different segments the same colour.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import { allocateShareSlices } from "@/lib/share-slices";

interface SharePieChartProps {
  data: { name: string; value: number }[];
  unit: "usd" | "count";
  height?: number;
  showLegend?: boolean;
  isLoading?: boolean;
  emptyLabel?: string;
}

/**
 * The categorical scale, in fixed order. Five slots, assigned by position,
 * never cycled. A sixth segment folds into `OTHER_VAR` instead of borrowing
 * slot 1 back.
 */
const SERIES_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

/** "Other" is not a category, so it does not get a categorical hue. */
const OTHER_VAR = "hsl(var(--muted-foreground))";

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
          >
            {slices.map((d, i) => (
              <Cell key={d.name} fill={sliceFill(i, named.length)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              const name = p.name as string;
              const value = Number(p.value ?? 0);
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
              return (
                <div className="rounded-lg border border-border/50 bg-surface px-3 py-2 elevation-floating text-body">
                  <div className="font-medium text-foreground mb-1">{name}</div>
                  <div className="text-muted-foreground tabular-nums">{fmt(value)} ({pct}%)</div>
                  {other && name === other.name && (
                    <div className="text-caption text-muted-foreground/80 mt-1 max-w-[16rem]">
                      {folded.length} segment{folded.length === 1 ? "" : "s"}:{" "}
                      {folded.map((f) => f.name).join(", ")}
                    </div>
                  )}
                </div>
              );
            }}
          />
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
