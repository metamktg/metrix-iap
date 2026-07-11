// ─── TrendIndicator ────────────────────────────────────────────────────
// Honest relative-position indicator: compares a value against a stated
// benchmark (e.g. the account average) and says so explicitly. There is
// no prior-period data in this import, so this never fabricates
// time-over-time deltas — the benchmark label is always rendered.

import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrendIndicator({
  value,
  benchmark,
  benchmarkLabel = "vs account avg",
  lowerIsBetter = false,
  flatThresholdPct = 2,
  className,
}: {
  value: number | null | undefined;
  benchmark: number | null | undefined;
  /** Explicit statement of what the comparison is against. */
  benchmarkLabel?: string;
  /** e.g. CPA: lower is the good direction. */
  lowerIsBetter?: boolean;
  /** Within ±this % of the benchmark counts as flat. */
  flatThresholdPct?: number;
  className?: string;
}) {
  if (value == null || benchmark == null || benchmark === 0) return null;

  const deltaPct = ((value - benchmark) / Math.abs(benchmark)) * 100;
  const flat = Math.abs(deltaPct) < flatThresholdPct;
  const better = lowerIsBetter ? deltaPct < 0 : deltaPct > 0;

  const Icon = flat ? Minus : deltaPct > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? "text-muted-foreground/60"
    : better
      ? "text-emerald-400"
      : "text-red-400";

  return (
    <span className={cn("inline-flex items-baseline gap-1 text-body", className)}>
      <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", tone)}>
        <Icon className="w-3 h-3 self-center" />
        {flat ? "≈" : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}%`}
      </span>
      <span className="text-label text-muted-foreground/60">{benchmarkLabel}</span>
    </span>
  );
}
