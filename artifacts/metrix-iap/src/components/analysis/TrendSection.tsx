// ─── Trend section ────────────────────────────────────────────────────
//
// The first time-based view in the product. Everything before it read a
// window as a single total — "$41,208 over 34 days" — which answers how
// much but never when, so a campaign that spent evenly and one that burned
// its budget in four days looked identical.
//
// The day grain has always been in `ad_performance` (one row per ad per
// day). It is fetched here rather than carried in the seed, because a daily
// series is O(days x accounts) and the seed is already a per-boot payload
// for every account the user can see.
//
// Two measures can be compared without a second y-axis: picking a second
// metric switches the plot to indexed mode, rebasing each series to 100 at
// its first measured day. The tooltip keeps showing the real values, so the
// index is a way to see shape, never a substitute for the number.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGetAccountDailySeriesQueryOptions } from "@workspace/api-client-react";
import type { DailySeriesPoint } from "@workspace/api-client-react";
import { TrendChart, type TrendSeries } from "@/components/charts/TrendChart";
import { fmtUSD, fmtNum, fmtPct } from "@/pages/metrix/shared";
import { TYPE } from "@/pages/metrix/typography";

interface TrendMetric {
  key: string;
  label: string;
  pick: (p: DailySeriesPoint) => number | null;
  format: (n: number) => string;
}

/**
 * Only metrics `ad_performance` actually carries per day. Reach is absent on
 * purpose: it is a deduplicated people count, so a day-over-day reach line
 * invites a cross-day sum that would double-count anyone present on two days.
 */
const METRICS: TrendMetric[] = [
  { key: "spend",       label: "Spend",       pick: (p) => p.spend ?? null,        format: (n) => fmtUSD(n, 0) },
  { key: "results",     label: "Results",     pick: (p) => p.results ?? null,      format: (n) => fmtNum(n) },
  { key: "cpa",         label: "Cost/result", pick: (p) => p.cpa ?? null,          format: (n) => fmtUSD(n) },
  { key: "impressions", label: "Impressions", pick: (p) => p.impressions ?? null,  format: (n) => fmtNum(n) },
  { key: "link_clicks", label: "Link clicks", pick: (p) => p.link_clicks ?? null,  format: (n) => fmtNum(n) },
  { key: "ctr",         label: "Link CTR",    pick: (p) => p.ctr_link_pct ?? null, format: (n) => fmtPct(n, 2) },
];

export interface TrendSectionProps {
  accountId: string | null;
  start: string | null;
  end: string | null;
}

export function TrendSection({ accountId, start, end }: TrendSectionProps) {
  const [chosen, setChosen] = useState<string[]>(["spend"]);

  const enabled = Boolean(accountId && start && end);
  const { data, isFetching } = useQuery({
    ...getGetAccountDailySeriesQueryOptions(accountId ?? "", start ?? "", end ?? ""),
    enabled,
  });

  const points = useMemo(() => data?.points ?? [], [data]);
  const days = useMemo(() => points.map((p) => p.day), [points]);

  const series: TrendSeries[] = useMemo(
    () =>
      // Iterate METRICS, not `chosen`, so a series keeps the same colour slot
      // regardless of the order the reader ticked the boxes.
      METRICS.filter((m) => chosen.includes(m.key)).map((m) => ({
        key: m.key,
        label: m.label,
        values: points.map((p) => m.pick(p)),
        format: m.format,
      })),
    [points, chosen],
  );

  const toggle = (key: string) =>
    setChosen((prev) =>
      prev.includes(key)
        ? // Never leave the chart with nothing plotted.
          prev.length === 1 ? prev : prev.filter((k) => k !== key)
        : [...prev, key],
    );

  return (
    <section className="px-6 pt-5" aria-label="Daily trend">
      <div className="rounded-2xl border border-border/40 bg-foreground/[0.02] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h3 className="text-title font-bold text-foreground leading-snug">Daily trend</h3>
            <p className={`${TYPE.label} mt-0.5`}>
              {days.length > 0 ? `${days.length} days` : "Day-level view of the selected window"}
            </p>
          </div>
          {/* Metric chips. Outer card is rounded-2xl (16px) with p-4 (16px),
              so these inner controls sit at rounded-lg — concentric, not
              the same radius as the surface holding them. */}
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((m) => {
              const on = chosen.includes(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggle(m.key)}
                  aria-pressed={on}
                  className={`h-10 px-3 rounded-lg text-caption active:scale-[0.96]
                              transition-[background-color,color,scale] duration-150 ease-[var(--mx-ease)]
                              ${on
                                ? "bg-primary/18 text-foreground"
                                : "bg-input/30 text-muted-foreground hover:text-foreground"}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {!enabled ? (
          <p className="text-body text-muted-foreground/75 py-6 text-center">
            Select a data window to see the daily trend.
          </p>
        ) : (
          <TrendChart
            days={days}
            series={series}
            missingDays={data?.missing_days ?? []}
            // One metric plots its real values; two or more only make sense
            // on a shared scale, and a second y-axis is never that.
            normalize={series.length > 1 ? "index" : "raw"}
            isLoading={isFetching && points.length === 0}
            emptyLabel="No day-level rows in this window"
            height={240}
          />
        )}
      </div>
    </section>
  );
}
