// ─── Share Pie/Donut Chart ───────────────────────────────────────────
// Donut chart for share of spend or results across segments.
// Interactive tooltips; "Other" bucket for small slices.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";

interface SharePieChartProps {
  data: { name: string; value: number }[];
  unit: "usd" | "count";
  height?: number;
  showLegend?: boolean;
}

const PALETTE = [
  "#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#6366f1", "#f43f5e", "#14b8a6", "#a855f7",
];

export function SharePieChart({ data, unit, height = 220, showLegend = true }: SharePieChartProps) {
  if (data.length === 0) return null;

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
    <div className="w-full flex flex-col items-center" style={{ height }}>
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
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
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
                <div className="rounded-lg border border-border/50 bg-[hsl(222_61%_6%)] px-3 py-2 shadow-xl text-xs">
                  <div className="font-medium text-foreground mb-1">{name}</div>
                  <div className="text-muted-foreground">{fmt(value)} ({pct}%)</div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1">
          {chartData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="text-label-xs text-muted-foreground/70">{d.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
