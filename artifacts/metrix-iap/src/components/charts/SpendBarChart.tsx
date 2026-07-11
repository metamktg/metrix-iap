// ─── Spend Bar Chart ───────────────────────────────────────────
// Horizontal bar chart for concept or placement spend breakdown.
// Uses Recharts BarChart with a dark theme palette.

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { fmtUSD } from "@/pages/metrix/shared";

interface SpendBarChartProps {
  data: { name: string; spend: number; results?: number }[];
  color?: string;
  height?: number;
}

const PALETTE = [
  "#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#6366f1", "#f43f5e", "#14b8a6", "#a855f7",
];

export function SpendBarChart({ data, color = "#3b82f6", height = 260 }: SpendBarChartProps) {
  if (data.length === 0) return null;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            angle={data.length > 6 ? -35 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 50 : 24}
            interval={0}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => {
              if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
              return `$${v}`;
            }}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              const d = p.payload as { name: string; spend: number; results?: number };
              return (
                <div className="rounded-lg border border-border/50 bg-[hsl(222_61%_6%)] px-3 py-2 shadow-xl text-xs">
                  <div className="font-medium text-foreground mb-1">{d.name}</div>
                  <div className="text-muted-foreground">Spend: {fmtUSD(d.spend, 0)}</div>
                  {d.results != null && <div className="text-muted-foreground">Results: {d.results.toLocaleString()}</div>}
                </div>
              );
            }}
          />
          <Bar dataKey="spend" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
