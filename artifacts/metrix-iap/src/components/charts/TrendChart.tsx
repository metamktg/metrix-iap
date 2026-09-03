// ─── Trend chart ──────────────────────────────────────────────────────
//
// A metric over days, from the account's real day-grained rows. Up to five
// series on ONE axis — never two y-scales. Two measures of different
// magnitude are either two charts stacked, or one chart with both series
// indexed to a common base (`normalize="index"`), which is the only honest
// way to put spend and CTR in the same frame.
//
// Gaps are gaps. A day the account has no rows for is a break in the line,
// not a zero and not a straight segment bridging it — recharts is given
// `null` and `connectNulls={false}` so the absence is visible. The count of
// missing days is stated under the chart, because a break the reader has to
// notice is not the same as one they are told about.

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { AXIS, MARK, seriesColor } from "./chartTokens";
import { ChartTooltip, ChartEmpty, ChartSkeleton } from "./chartChrome";
import { fmtDay } from "@/lib/normalize";

export interface TrendSeries {
  /** Stable identity — colour follows this, not the array position. */
  key: string;
  label: string;
  /** One value per day in `days`, aligned by index. Null = not measured. */
  values: (number | null)[];
  format: (n: number) => string;
}

export interface TrendChartProps {
  /** ISO days, ascending. */
  days: string[];
  series: TrendSeries[];
  height?: number;
  /**
   * "raw" plots the values as they are — correct for one series, or several
   * that share a unit. "index" rebases every series to 100 at its first
   * measured day, which is what makes two different units legible together
   * without a second axis.
   */
  normalize?: "raw" | "index";
  /** Days inside the span the account had no rows for. Reported, not drawn. */
  missingDays?: string[];
  isLoading?: boolean;
  emptyLabel?: string;
}

const INDEX_BASE = 100;

export function TrendChart({
  days,
  series,
  height = 260,
  normalize = "raw",
  missingDays = [],
  isLoading = false,
  emptyLabel = "No trend data yet",
}: TrendChartProps) {
  const [muted, setMuted] = useState<string | null>(null);

  const shown = series.slice(0, 5);
  const dropped = series.length - shown.length;

  const rows = useMemo(() => {
    const bases = new Map<string, number>();
    if (normalize === "index") {
      for (const s of shown) {
        const first = s.values.find((v) => v != null && v !== 0);
        if (first != null) bases.set(s.key, first);
      }
    }
    return days.map((day, i) => {
      const row: Record<string, string | number | null> = { day };
      for (const s of shown) {
        const raw = s.values[i] ?? null;
        if (raw == null) { row[s.key] = null; continue; }
        const base = bases.get(s.key);
        row[s.key] = normalize === "index" && base ? (raw / base) * INDEX_BASE : raw;
      }
      return row;
    });
  }, [days, shown, normalize]);

  const hasAnyPoint = rows.some((r) => shown.some((s) => r[s.key] != null));

  if (isLoading) return <ChartSkeleton height={height} />;
  if (!hasAnyPoint) return <ChartEmpty height={height} label={emptyLabel} />;

  const axisFormat = (n: number) =>
    normalize === "index" ? `${Math.round(n)}` : (shown[0]?.format(n) ?? String(n));

  return (
    <div className="w-full">
      <div
        style={{ height }}
        role="img"
        aria-label={
          `Trend chart, ${days.length} days, ` +
          shown.map((s) => s.label).join(" and ") +
          (normalize === "index" ? ", indexed to 100 at each series' first measured day" : "") +
          (missingDays.length ? `. ${missingDays.length} days have no data` : "")
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} {...AXIS.grid} />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => fmtDay(String(d))}
              tick={AXIS.tick}
              axisLine={{ stroke: AXIS.stroke }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => axisFormat(Number(v))}
              tick={AXIS.tick}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            {normalize === "index" && (
              <ReferenceLine y={INDEX_BASE} stroke={AXIS.stroke} strokeDasharray="3 3" />
            )}
            <Tooltip
              cursor={AXIS.cursor}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const i = days.indexOf(String(label));
                return (
                  <ChartTooltip
                    title={fmtDay(String(label))}
                    rows={shown.map((s) => {
                      const raw = i >= 0 ? s.values[i] ?? null : null;
                      return {
                        label: s.label,
                        // Always show the REAL value in the tooltip, even when
                        // the plot is indexed — the index is a way to see the
                        // shape, not a replacement for the number.
                        value: raw == null ? "—" : s.format(raw),
                        swatch: seriesColor(series.findIndex((x) => x.key === s.key)),
                      };
                    })}
                  />
                );
              }}
            />
            {shown.map((s) => {
              const color = seriesColor(series.findIndex((x) => x.key === s.key));
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  strokeWidth={MARK.lineWidth}
                  strokeOpacity={muted === null || muted === s.key ? 1 : 0.3}
                  dot={false}
                  activeDot={{ r: MARK.activeDotSize / 2, strokeWidth: 0 }}
                  // A day with no rows breaks the line instead of being
                  // bridged, so an absence never reads as a flat trend.
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {shown.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          {shown.map((s) => {
            const color = seriesColor(series.findIndex((x) => x.key === s.key));
            return (
              <button
                key={s.key}
                type="button"
                // 40px minimum hit area on a 10px swatch, via padding rather
                // than a bigger swatch.
                className="flex items-center gap-1.5 -my-2 py-2 pr-1 rounded active:scale-[0.96]
                           transition-[scale,opacity] duration-150 ease-[var(--ease-out)]"
                onMouseEnter={() => setMuted(s.key)}
                onMouseLeave={() => setMuted(null)}
                onFocus={() => setMuted(s.key)}
                onBlur={() => setMuted(null)}
                aria-label={`Highlight ${s.label}`}
              >
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-caption text-muted-foreground">{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {(missingDays.length > 0 || dropped > 0 || normalize === "index") && (
        <p className="text-label text-muted-foreground/80 mt-1.5 tabular-nums">
          {[
            normalize === "index" ? "Indexed to 100 at each series' first measured day" : null,
            missingDays.length > 0 ? `${missingDays.length} days with no data` : null,
            dropped > 0 ? `${dropped} more series not shown` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
