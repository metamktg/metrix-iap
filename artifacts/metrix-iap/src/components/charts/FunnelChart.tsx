// ─── Funnel ───────────────────────────────────────────────────────────
//
// Stage counts as a proportional bar column, not a tapering trapezoid. A
// drawn funnel encodes value in AREA, and area is the one channel people read
// worst — a shape half as wide looks about a third as big, so every classic
// funnel overstates its own drop-off. Length on a common baseline is the
// honest encoding of the same numbers, and it lets each stage carry its
// absolute count, its share of the top, and its step-over-step conversion
// side by side instead of buried in a tooltip.
//
// Two honesty rules the old inline funnels did not keep:
//
//   · A stage the export never carried is a GAP, not a zero. The two are the
//     opposite finding — "nobody reached checkout" versus "this export has no
//     checkout column" — and a zero-length bar states the first.
//   · A stage that exceeds the one above it is flagged, not clamped. It is a
//     real signal (attribution windows overlap; an action can be counted
//     against a click from a previous day) and silently capping it at 100%
//     hides a data-quality fact behind a tidy shape.

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { seriesColor, MARK } from "./chartTokens";
import { ChartEmpty } from "./chartChrome";
import { DetailReveal } from "@/pages/metrix/shared";

export interface FunnelStage {
  key: string;
  label: string;
  /** Null when the source never measured this stage. Not zero. */
  value: number | null;
  /** Optional note — e.g. the tracking basis for this stage. */
  note?: string;
}

/**
 * What a bar's LENGTH is a share of.
 *
 * Both are honest; they answer different questions, and neither answers the
 * other's. Against the top of the funnel, a 2.1M-impression first stage makes
 * every later bar a sliver — true, and unreadable, which is the failure mode
 * of every funnel drawn this way. Against the previous stage, each step's
 * conversion is legible but the cumulative collapse disappears.
 *
 * So the reader picks, the choice is stated on the chart, and the numbers
 * inside the bars never change — only what the length is measured against.
 */
export type FunnelBasis = "previous" | "top";

export interface FunnelChartProps {
  stages: FunnelStage[];
  format?: (n: number) => string;
  /** Names the population, e.g. "people" or "actions". */
  unitLabel?: string;
  emptyLabel?: string;
  /** Series slot for the bars. One measure, one hue. */
  colorIndex?: number;
  /** Default basis. "previous" is legible; "top" shows the true collapse. */
  defaultBasis?: FunnelBasis;
}

const fmtInt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`;

export function FunnelChart({
  stages,
  format = fmtInt,
  unitLabel = "",
  emptyLabel = "No funnel data yet",
  colorIndex = 0,
  defaultBasis = "previous",
}: FunnelChartProps) {
  const [basis, setBasis] = useState<FunnelBasis>(defaultBasis);
  const rows = useMemo(() => {
    const measured = stages.filter((s) => s.value != null);
    // The top of the funnel is the first stage that was actually measured —
    // not stage 0, which may itself be a gap.
    const top = measured[0]?.value ?? null;
    let previous: number | null = null;
    const out = stages.map((s) => {
      const share = s.value != null && top != null && top > 0 ? s.value / top : null;
      const step = s.value != null && previous != null && previous > 0 ? s.value / previous : null;
      const row = {
        ...s,
        share,
        step,
        // Above the previous stage is a real, reportable condition.
        exceedsPrevious: step != null && step > 1.0001,
        isGap: s.value == null,
      };
      if (s.value != null) previous = s.value;
      return row;
    });
    return { out, top, measuredCount: measured.length };
  }, [stages]);

  if (rows.measuredCount === 0) return <ChartEmpty height={200} label={emptyLabel} />;

  const fill = seriesColor(colorIndex);
  const gapCount = rows.out.filter((r) => r.isGap).length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-end mb-2 mx-scroll-x">
        <div role="group" aria-label="Bar length basis" className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-input/30 p-1">
          {([["previous", "vs previous stage"], ["top", "vs top of funnel"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBasis(id)}
              aria-pressed={basis === id}
              className={`h-10 px-2.5 rounded-lg text-caption whitespace-nowrap active:scale-[0.96]
                          transition-[background-color,color,scale] duration-150 ease-[var(--mx-ease)]
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                          ${basis === id ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol
        className="flex flex-col gap-1.5"
        role="img"
        aria-label={
          `Funnel: ` +
          rows.out.map((r) => `${r.label} ${r.value == null ? "not measured" : format(r.value)}`).join(", ")
        }
      >
        {rows.out.map((r) => (
          <li key={r.key} className="flex items-center gap-3">
            {/* 256 px of fixed label columns left a 38 px track at 390 px
                (audit round 6): the columns narrow below sm and the share
                reading yields to the value. */}
            <span className="text-caption text-muted-foreground w-20 sm:w-32 shrink-0 truncate" title={r.label}>
              {r.label}
            </span>

            <div className="flex-1 min-w-0 h-8 relative rounded-md bg-foreground/[0.03] overflow-hidden">
              {r.isGap ? (
                // A gap is drawn as a gap: a hatched, empty track that cannot
                // be mistaken for a bar of length zero.
                <div
                  className="absolute inset-0 rounded-md"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.12) 0 6px, transparent 6px 12px)",
                  }}
                />
              ) : (
                <div
                  className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-[var(--mx-ease)]"
                  style={{
                    width: `${Math.min(100, ((basis === "top" ? r.share : r.step ?? r.share) ?? 0) * 100)}%`,
                    background: fill,
                    borderRadius: `0 ${MARK.barRadius}px ${MARK.barRadius}px 0`,
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-between px-2.5 pointer-events-none">
                <span className="text-caption font-medium text-foreground tabular-nums">
                  {r.isGap ? "–" : format(r.value!)}
                </span>
                <span className="hidden sm:inline text-label text-foreground/70 tabular-nums">
                  {r.share != null ? `${pct(r.share * 100)} of top` : ""}
                </span>
              </div>
            </div>

            <span className="w-16 sm:w-32 shrink-0 text-right">
              {r.isGap ? (
                <DetailReveal
                  label="not measured"
                  labelClassName="text-caption text-muted-foreground/75"
                  eyebrow="Why this stage is blank"
                  sections={[{
                    text:
                      `This export did not carry a ${r.label.toLowerCase()} column. That is not the ` +
                      `same as a count of zero. Nothing in this data says whether anyone reached ` +
                      `this stage, so the row is drawn as a gap rather than an empty bar.`,
                  }]}
                />
              ) : r.step != null ? (
                <span
                  className={`text-caption tabular-nums inline-flex items-center gap-1 ${
                    r.exceedsPrevious ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground"
                  }`}
                  title={
                    r.exceedsPrevious
                      ? "This stage counts more than the one above it. Attribution windows overlap, so an action can be credited to a click from an earlier day. Reported, not clamped."
                      : "Share of the stage directly above"
                  }
                >
                  {r.exceedsPrevious && <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />}
                  {pct(r.step * 100)}
                </span>
              ) : (
                <span className="text-caption text-muted-foreground/75">–</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {(gapCount > 0 || unitLabel) && (
        <p className="text-label text-muted-foreground/80 mt-2 tabular-nums">
          {[
            `Bar length is share of the ${basis === "top" ? "top of the funnel" : "previous stage"}`,
            unitLabel ? `counts are ${unitLabel}` : null,
            gapCount > 0 ? `${gapCount} stage${gapCount === 1 ? "" : "s"} not carried by this export` : null,
            "right column is conversion from the stage above",
          ].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
