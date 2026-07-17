// ─── Shared KPI rank-sort control ─────────────────────────────────────
// Lets any ranked analysis list (Audience segments, Placements, …) be
// re-ranked by a KPI. Cost metrics (CPA/CPM/CPC) rank ascending — the
// cheapest read is the best one — volume/rate metrics rank descending.
// Null values always sort last: a missing number is never "best".

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RankMetric<Row> {
  id: string;
  /** Chip label, e.g. "CPA". */
  label: string;
  /** "asc" = lower is better (cost metrics); "desc" = higher is better. */
  direction: "asc" | "desc";
  value: (row: Row) => number | null;
  format: (v: number) => string;
}

/** Stable sort by the metric; null values always last regardless of direction. */
export function sortByRankMetric<Row>(rows: Row[], metric: RankMetric<Row>): Row[] {
  const dir = metric.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = metric.value(a);
    const vb = metric.value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * dir;
  });
}

/**
 * Direction-aware bar width (0–100) for a ranked row's relative bar.
 * The BEST value on the active metric always gets the longest bar:
 * - "desc" metrics (volume/rate): proportional to max — v / max.
 * - "asc" cost metrics (CPA/CPM/CPC): inverted — min / v, so the
 *   cheapest read gets 100% and pricier reads get shorter bars.
 * Null values render no bar. A small floor keeps non-null bars visible.
 */
export function rankBarPct(
  value: number | null,
  values: (number | null)[],
  direction: "asc" | "desc"
): number {
  if (value == null) return 0;
  const nums = values.filter((v): v is number => v != null && v > 0);
  if (direction === "desc") {
    const max = Math.max(...nums, 0);
    if (max <= 0) return 0;
    return Math.max((value / max) * 100, value > 0 ? 3 : 0);
  }
  if (value <= 0 || nums.length === 0) return 0;
  const min = Math.min(...nums);
  return Math.max((min / value) * 100, 3);
}

/** Selected rank metric id, persisted per-surface in localStorage. */
export function useRankMetric(storageKey: string, validIds: string[], defaultId: string) {
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw && validIds.includes(raw)) return raw;
    } catch {
      /* storage unavailable — fall through */
    }
    return defaultId;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, activeId);
    } catch {
      /* storage unavailable — selection stays in-memory */
    }
  }, [storageKey, activeId]);

  const select = useCallback(
    (id: string) => {
      if (validIds.includes(id)) setActiveId(id);
    },
    [validIds]
  );

  return { activeId, select };
}

/** Horizontal chip row: pick which KPI ranks the list. */
export function RankSortBar<Row>({
  metrics,
  activeId,
  onSelect,
  className,
}: {
  metrics: RankMetric<Row>[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mr-1">
        Rank by
      </span>
      {metrics.map((m) => {
        const active = m.id === activeId;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            data-testid={`rank-metric-${m.id}`}
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 rounded-full border text-label font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/40 bg-white/[0.01] text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04]"
            )}
          >
            {m.label}
            {active &&
              (m.direction === "asc" ? (
                <ArrowUp className="w-3.5 h-3.5 text-primary/70" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-primary/70" />
              ))}
          </button>
        );
      })}
    </div>
  );
}

/** Tiny labeled KPI value used inside data-rich list rows. */
export function KpiStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-1">
        {label}
      </div>
      <div
        className={cn(
          "text-caption font-semibold tabular-nums leading-none truncate",
          highlight ? "text-primary" : "text-foreground/90"
        )}
      >
        {value}
      </div>
    </div>
  );
}
