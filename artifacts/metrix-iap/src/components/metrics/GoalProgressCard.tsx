// ─── Goal progress card ───────────────────────────────────────────────
//
// A figure, and how far it is along a goal someone actually set. The
// reference decks this is modelled on put a progress bar on every tile,
// which is the trap: a bar implies a denominator, and most metrics on this
// platform do not have one. Spend has no target unless a budget was entered.
// CTR has no goal at all. Painting a bar for those invents the goal.
//
// So the goal is REQUIRED for the bar, and its absence is stated rather than
// hidden — the card renders the figure, says no goal is set, and offers the
// control to set one if the caller passes it. That is the difference between
// "you are 60% of the way there" and "we do not know where there is".
//
// The fill direction is one formula with one flag:
//
//   lowerIsBetter false   results against a target — the bar is how much of
//                         the target has been reached, full is good
//   lowerIsBetter true    CPA against a ceiling — the bar is how much of the
//                         allowance is spent, full is the edge
//
// Both are value/goal. Only the verdict flips.

import type { ReactNode } from "react";
import { HEADING } from "@/pages/metrix/typography";
import { VERDICT } from "@/components/charts/chartTokens";
import { fmtDelta } from "@/lib/normalize";

export interface GoalProgressCardProps {
  label: string;
  /** Null when the metric could not be measured. Never coerced to 0. */
  value: number | null;
  /**
   * The target. Null means nobody set one — the bar does not render and the
   * card says so. It is never defaulted to a round number or to the value
   * itself.
   */
  goal: number | null;
  format: (n: number) => string;
  /** True for cost-style metrics, where the goal is a ceiling. */
  lowerIsBetter?: boolean;
  /** Where the goal came from — "median of this window", "set in Settings". */
  goalSource?: string;
  /** Change over the compared window, when one was computed. */
  deltaPct?: number | null;
  /** Rendered when there is no goal — e.g. a "Set a goal" control. */
  onEmptyGoal?: ReactNode;
  /** Explains a null value. A dash with no reason is the thing to avoid. */
  unmeasuredReason?: string;
}

export function GoalProgressCard({
  label,
  value,
  goal,
  format,
  lowerIsBetter = false,
  goalSource,
  deltaPct = null,
  onEmptyGoal,
  unmeasuredReason,
}: GoalProgressCardProps) {
  const hasGoal = goal != null && goal > 0 && value != null;
  const ratio = hasGoal ? value / goal : null;
  // Clamped for the BAR only. The percentage text below reports the real
  // number, so a 240%-of-ceiling overrun reads as 240% and not as "100%".
  const filled = ratio == null ? 0 : Math.min(1, Math.max(0, ratio));
  const over = ratio != null && ratio > 1;
  const good = ratio == null ? null : lowerIsBetter ? !over : ratio >= 1;
  const delta = fmtDelta(deltaPct);

  return (
    <div
      className="rounded-xl border border-border/40 bg-foreground/[0.02] p-3.5
                 transition-[border-color,background-color] duration-150
                 ease-[cubic-bezier(0.2,0,0,1)] hover:border-border/70"
    >
      <div className="flex items-baseline gap-2 mb-1.5 min-w-0">
        <span className={`${HEADING.h6} truncate`} title={label}>{label}</span>
        {delta && (
          // Unjudged, for the same reason SignalDeck's delta is: a rise in a
          // cost metric and a rise in a result metric are opposite news, and
          // the sign alone does not say which this is.
          <span
            className="ml-auto text-caption font-body tabular-nums text-muted-foreground"
            title="Change as reported over the compared window."
          >
            {delta}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 flex-wrap mb-2.5">
        <span className="text-h3 font-h3 font-semibold text-foreground tabular-nums leading-none">
          {value != null ? format(value) : "—"}
        </span>
        {value == null && unmeasuredReason && (
          <span className="text-caption font-body text-muted-foreground/75">{unmeasuredReason}</span>
        )}
        {hasGoal && (
          <span className="text-caption font-body text-muted-foreground/80 tabular-nums">
            {lowerIsBetter ? "of" : "toward"} {format(goal)}
          </span>
        )}
      </div>

      {hasGoal ? (
        <>
          <div
            className="h-1.5 rounded-full bg-foreground/[0.07] overflow-hidden"
            role="meter"
            aria-valuenow={Math.round((ratio ?? 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${format(value)} against a goal of ${format(goal)}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
              style={{
                width: `${filled * 100}%`,
                background: good ? VERDICT.good : VERDICT.bad,
              }}
            />
          </div>
          <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
            <span className="text-caption font-body tabular-nums text-muted-foreground">
              {(ratio! * 100).toFixed(0)}%
              {over && lowerIsBetter ? " of ceiling" : over ? " of target" : ""}
            </span>
            {goalSource && (
              <span className="text-micro font-mono text-muted-foreground/75 truncate" title={goalSource}>
                {goalSource}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-caption font-body text-muted-foreground/75"
            title="A progress bar needs a target. None has been set for this metric, so none is drawn — a bar against an assumed goal would report progress toward a number nobody chose."
          >
            {value == null ? "Not measured" : "No goal set"}
          </span>
          {onEmptyGoal}
        </div>
      )}
    </div>
  );
}
