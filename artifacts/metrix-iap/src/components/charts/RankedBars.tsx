// The racing form: name, bar, number — one row per thing being compared.
//
// WHY THIS RATHER THAN THE RECHARTS BAR
// MetricBarChart draws the same comparison through recharts, with an axis, a
// grid and rotated tick labels. That is the right tool when the reader needs
// to read values OFF an axis. It is the wrong one for a ranked list, which is
// what almost every comparison in this product actually is: "which concept
// has the lowest CPA", "which placement took the most spend". For that
// question the axis is furniture — the reader wants the ORDER, the RELATIVE
// LENGTHS, and the exact number, and an axis gives them a fourth thing to
// look at while making the labels fight for space.
//
// So: rows. Label on the left at full width, bar in the middle on a shared
// left edge, value right-aligned. Three columns, scanned in one pass, with
// no chart chrome between them. It is the shape a racing form uses for the
// same reason — a list of runners, a bar, a number — and it is why a race
// card is legible at a glance while a spreadsheet of the same data is not.
//
// WHAT THE LENGTH MEANS
// Length is a share of the LARGEST measured value, and that is stated. Every
// other basis (a share of the total, a share of a target) answers a different
// question, and a bar chart that does not say which one it is using is asking
// the reader to guess.
//
// HONESTY
//   · A null is a gap: an empty track, a dash for the value, and no bar. A
//     zero-length bar and "we could not measure this" must never look alike —
//     which is the whole reason this does not just render `width: 0%`.
//   · A measured ZERO draws a hairline stub rather than nothing, so it is
//     visibly a measurement rather than an absence.
//   · Rows past `limit` are REPORTED, never silently dropped.
//
// LOWER-IS-BETTER METRICS
// CPA, cost per result and CPM are better when smaller, so ranking them
// descending puts the worst performer at the top under the longest bar —
// which reads as "winner" to anyone scanning. `order="asc"` sorts them the
// right way up; `invertLength` additionally makes the BAR longer for the
// better value, so length and rank agree. Passing neither on a cost metric
// is the commonest way a chart like this lies without any number being wrong.

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { seriesColor } from "./chartTokens";
import { ChartEmpty } from "./chartChrome";
import { DUR_MED, EASE, staggerDelay } from "@/lib/motion";

export interface RankedDatum {
  /** Stable identity. Colour and order follow this, never the row index. */
  key: string;
  label: string;
  /** Null means NOT MEASURED — an empty track and a dash, never a zero bar. */
  value: number | null;
  /** Optional second line under the label — "31 ads · 2.1M impressions". */
  detail?: string;
  /** Optional right-hand annotation beside the value — a delta, a count. */
  note?: string;
}

export interface RankedBarsProps {
  data: RankedDatum[];
  format: (n: number) => string;
  /** Names the measure. A bar with an unnamed quantity is a shape. */
  measureLabel: string;
  /** "desc" (default) for more-is-better; "asc" for cost metrics. */
  order?: "desc" | "asc";
  /**
   * Make the BAR longer for the better value. Set it with `order="asc"` on a
   * cost metric so length and rank agree — otherwise the worst performer
   * wears the longest bar and reads as the winner.
   */
  invertLength?: boolean;
  /** Rows shown. The remainder is reported under the list, never dropped. */
  limit?: number;
  /** One accent slot: a single measure is a single series. */
  colorIndex?: number;
  emptyLabel?: string;
  onRowClick?: (d: RankedDatum) => void;
  className?: string;
  "data-testid"?: string;
}

export function RankedBars({
  data,
  format,
  measureLabel,
  order = "desc",
  invertLength = false,
  limit,
  colorIndex = 0,
  emptyLabel = "Nothing measured in this window",
  onRowClick,
  className,
  "data-testid": testId,
}: RankedBarsProps) {
  const reduced = useReducedMotion();

  const { rows, hidden, measuredCount } = useMemo(() => {
    const measured = data.filter((d) => d.value != null);
    // Sort measured rows; gaps sink to the bottom rather than sorting as 0,
    // which would rank "not measured" as the worst performer.
    const sorted = [...data].sort((a, b) => {
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return order === "asc" ? a.value - b.value : b.value - a.value;
    });
    const shown = limit != null ? sorted.slice(0, limit) : sorted;
    return {
      rows: shown,
      hidden: sorted.length - shown.length,
      measuredCount: measured.length,
    };
  }, [data, order, limit]);

  if (measuredCount === 0) return <ChartEmpty height={160} label={emptyLabel} />;

  const values = rows.map((r) => r.value).filter((v): v is number => v != null);
  const max = Math.max(...values, 0);
  const min = Math.min(...values);
  const fill = seriesColor(colorIndex);

  /** Share of the track this row's bar occupies, 0–1. */
  const share = (v: number): number => {
    if (invertLength) {
      // Better (smaller) values get longer bars. Anchored on the range so the
      // best performer fills the track and the worst keeps a visible stub.
      if (max === min) return 1;
      return 0.12 + 0.88 * ((max - v) / (max - min));
    }
    return max > 0 ? v / max : 0;
  };

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <ul className="flex flex-col gap-1" role="list">
        {rows.map((d, i) => {
          const measured = d.value != null;
          const pct = measured ? share(d.value!) * 100 : 0;
          const Row = onRowClick ? "button" : "div";
          return (
            <li key={d.key}>
              <Row
                {...(onRowClick
                  ? { type: "button" as const, onClick: () => onRowClick(d) }
                  : {})}
                className={cn(
                  // The three columns. `min-h-11` keeps a row a comfortable
                  // touch target even when its label is one short word.
                  "group w-full min-h-11 grid items-center gap-3 px-2 py-1.5 rounded-lg text-left",
                  // Label column is content-sized to a cap, so short labels do
                  // not strand the bars far to the right on a wide screen and
                  // long ones still wrap rather than truncating to nothing.
                  "grid-cols-[minmax(7rem,14rem)_1fr_auto]",
                  onRowClick && "pressable transition-colors hover:bg-foreground/[0.04]",
                )}
              >
                <span className="min-w-0">
                  <span data-ranked-label className={cn(TYPE.body, "block leading-snug text-balance")}>
                    {d.label}
                  </span>
                  {d.detail && (
                    <span className={cn(TYPE.caption, "block leading-snug")}>{d.detail}</span>
                  )}
                </span>

                {/* The track is always drawn. An empty track is what "not
                    measured" looks like — distinct from a short bar, which is
                    a small measurement. */}
                <span className="relative h-2 rounded-full bg-foreground/[0.07] overflow-hidden">
                  {measured && (
                    <motion.span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: fill }}
                      initial={reduced ? false : { width: 0 }}
                      animate={{
                        // A measured zero keeps a hairline stub so it reads as
                        // a measurement rather than an absence.
                        width: pct === 0 ? "3px" : `${pct}%`,
                      }}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { duration: DUR_MED, ease: EASE, delay: staggerDelay(i, rows.length) }
                      }
                    />
                  )}
                </span>

                <span className="flex items-baseline gap-1.5 justify-end">
                  <span
                    className={cn(
                      TYPE.body,
                      "tabular-nums font-semibold",
                      measured ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {measured ? format(d.value!) : "–"}
                  </span>
                  {d.note && <span className={cn(TYPE.caption, "tabular-nums")}>{d.note}</span>}
                </span>
              </Row>
            </li>
          );
        })}
      </ul>

      {/* One interpolated string, not five JSX children. Split across text
          nodes this reads identically in a browser and is unmatchable by a
          test — which is how a caption ends up asserted-on by accident and
          then quietly wrong. */}
      <p className={cn(TYPE.caption, "mt-2 px-2")}>
        {`${measureLabel} · bar length is a share of the ${invertLength ? "best" : "largest"} value` +
          (hidden > 0 ? ` · ${hidden} more row${hidden === 1 ? "" : "s"} not shown` : "")}
      </p>
    </div>
  );
}
