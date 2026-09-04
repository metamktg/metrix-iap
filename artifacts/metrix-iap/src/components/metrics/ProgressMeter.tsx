// ─── Progress meter ───────────────────────────────────────────────────
//
// The bare share / coverage bar. There were eight of these at three heights
// (3px, 4px, 6px) and four track colours (border/30, foreground/[0.04],
// [0.05], [0.06]), which is enough variation that two bars on the same
// screen read as two different kinds of measurement when they are not.
//
// What none of them did:
//
//   · role="meter". A bar is a value, and a screen reader was told nothing
//     — it saw two empty divs. Every caller printed the percentage in text
//     beside it, so the information existed; it just never reached the
//     accessibility tree.
//   · Report an overrun. Every one clamped with Math.min(pct, 100) and then
//     printed the clamped number, so 140% of budget rendered as a full bar
//     labelled 100%. Clamping the BAR is right — it has nowhere to go — but
//     clamping the number hides the thing worth knowing.
//   · Distinguish "0%" from "no denominator". `spend / maxSpend` with a zero
//     max is NaN, and `width: NaN%` renders as an empty bar identical to a
//     real zero.

import { seriesColor } from "@/components/charts/chartTokens";

export interface ProgressMeterProps {
  /** Null when unmeasured. An empty bar is not the same as an absent one. */
  value: number | null;
  /** The denominator. <= 0 means there is nothing to be a share OF. */
  total: number;
  /** Names the measure for assistive tech. Required — a bare bar says nothing. */
  label: string;
  /** Series slot for the fill, so a two-bar row reads as two measures. */
  colorIndex?: number;
  /** Overrides the fill entirely — for status-graded bars. */
  fill?: string;
  /**
   * Class-based fill override, for call sites whose identity color already
   * exists as a Tailwind class (an avatar accent, a status tint, a hover
   * brightening). Wins over `fill` and `colorIndex`. The TRACK is not
   * overridable on purpose — one track everywhere is what makes two bars
   * on one screen read as the same kind of measurement.
   */
  fillClassName?: string;
  /** "sm" inside a dense row, "md" as a section's own bar. */
  size?: "sm" | "md";
  /**
   * Renders as N discrete steps instead of a continuous fill. Use this when
   * the measure is ORDINAL — a confidence tier, a stage index — because a
   * continuous bar states a precision the measure does not have.
   *
   * The site this was built for filled a smooth bar to 88% for "high", 55%
   * for "medium" and 20% for "low". Those numbers were invented to make the
   * bar look right; nothing measured them, and a reader has every reason to
   * read 88% as a measurement. Three of three steps says the same thing and
   * claims only what is true.
   */
  segments?: number;
  className?: string;
}

const TRACK_H = { sm: "h-1", md: "h-1.5" } as const;

export function ProgressMeter({
  value,
  total,
  label,
  colorIndex = 0,
  fill,
  fillClassName,
  size = "sm",
  segments,
  className = "",
}: ProgressMeterProps) {
  const measurable = value != null && Number.isFinite(value) && total > 0;
  const ratio = measurable ? value / total : null;
  const pct = ratio == null ? 0 : Math.min(1, Math.max(0, ratio)) * 100;

  if (segments != null && segments > 0) {
    const on = measurable ? Math.round(ratio! * segments) : 0;
    return (
      <div
        className={`${TRACK_H[size]} flex gap-0.5 ${className}`}
        role="meter"
        aria-valuenow={measurable ? Math.round(ratio! * segments) : undefined}
        aria-valuemin={0}
        aria-valuemax={segments}
        aria-label={
          measurable ? `${label}: ${on} of ${segments}` : `${label}: not measured`
        }
        title={measurable ? undefined : "Not measured"}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`flex-1 rounded-full transition-[background-color] duration-300 ease-[var(--mx-ease)] ${
              i < on && fillClassName ? fillClassName : ""
            }`}
            style={
              i < on && fillClassName
                ? undefined
                : {
                    background:
                      i < on
                        ? fill ?? seriesColor(colorIndex)
                        : "hsl(var(--foreground) / 0.06)",
                  }
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${TRACK_H[size]} rounded-full bg-foreground/[0.06] overflow-hidden ${className}`}
      role="meter"
      aria-valuenow={ratio == null ? undefined : Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={
        measurable
          ? `${label}: ${Math.round(ratio! * 100)}%`
          : total > 0
            ? `${label}: not measured`
            : `${label}: no total to compare against`
      }
      title={
        measurable
          ? undefined
          : total > 0
            ? "Not measured"
            : "Nothing to compare against · the total for this group is zero."
      }
    >
      {measurable && (
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-[var(--mx-ease)] ${fillClassName ?? ""}`}
          style={
            fillClassName
              ? { width: `${pct}%` }
              : { width: `${pct}%`, background: fill ?? seriesColor(colorIndex) }
          }
        />
      )}
    </div>
  );
}

/**
 * The percentage, as text, beside a meter. Kept here so the number and the
 * bar cannot disagree: the bar clamps at 100% because it has nowhere to go,
 * and this does NOT, so a 140% overrun reads as 140.
 */
export function progressText(value: number | null, total: number): string {
  if (value == null || !Number.isFinite(value)) return "–";
  if (total <= 0) return "n/a";
  return `${Math.round((value / total) * 100)}%`;
}
