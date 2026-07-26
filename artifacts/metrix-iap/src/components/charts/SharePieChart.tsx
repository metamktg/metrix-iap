// ─── Share Pie/Donut Chart ───────────────────────────────────────────
// Donut chart for share of spend or results across segments.
// Interactive tooltips; "Other" bucket for small slices.
// Accessibility: chart legend always visible; empty state instead of null;
// loading skeleton via isLoading prop.

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";

interface SharePieChartProps {
  data: { name: string; value: number }[];
  unit: "usd" | "count";
  height?: number;
  showLegend?: boolean;
  isLoading?: boolean;
  emptyLabel?: string;
}

// Chart palette — semantic CSS variable references for the Metrix dark theme.
// Ordered to maximize contrast between adjacent segments.
const PALETTE_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "hsl(var(--metrix-cyan))",
  "hsl(var(--primary))",
  "hsl(var(--metrix-gold))",
  "hsl(var(--metrix-success))",
  "hsl(var(--metrix-danger))",
];

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
        <div className="w-32 h-32 rounded-full border-8 border-white/[0.06] animate-pulse" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {[80, 56, 64].map((w) => (
            <div key={w} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-white/[0.08] animate-pulse" />
              <div className="h-2.5 rounded bg-white/[0.08] animate-pulse" style={{ width: w }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50"
        style={{ height }}
        role="img"
        aria-label={emptyLabel}
      >
        <div className="w-20 h-20 rounded-full border-4 border-dashed border-border/30" />
        <span className="text-caption">{emptyLabel}</span>
      </div>
    );
  }

  const total = data.reduce((n, d) => n + d.value, 0);

  // Bucket small slices into "Other" (anything < 3%)
  const threshold = total * 0.03;
  const main = data.filter((d) => d.value >= threshold);
  const other = data.filter((d) => d.value < threshold);
  const otherValue = other.reduce((n, d) => n + d.value, 0);
  const chartData = otherValue > 0 ? [...main, { name: "Other", value: otherValue }] : main;

  const fmt = unit === "usd"
    ? (v: number) => fmtUSD(v, 0)
    : (v: number) => fmtNum(v);

  return (
    <div
      className="w-full flex flex-col items-center"
      style={{ height }}
      role="img"
      aria-label={`Donut chart: ${chartData.map((d) => `${d.name} ${fmt(d.value)}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            stroke="none"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={PALETTE_VARS[i % PALETTE_VARS.length]} />
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
                </div>
              );
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-label text-muted-foreground/80">{value}</span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1" aria-hidden="true">
          {chartData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: PALETTE_VARS[i % PALETTE_VARS.length] }}
              />
              <span className="text-label text-muted-foreground/80">{d.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
