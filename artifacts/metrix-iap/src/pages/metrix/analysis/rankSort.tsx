// ─── Shared KPI rank-sort control ─────────────────────────────────────
// Lets any ranked analysis list (Audience segments, Placements, …) be
// re-ranked by a KPI. Cost metrics (CPA/CPM/CPC) rank ascending — the
// cheapest read is the best one — volume/rate metrics rank descending.
// Null values always sort last: a missing number is never "best".

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Check } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@workspace/command-deck/components/ui/popover";
import { TYPE } from "../typography";

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

/** Optional metric grouping for RankSortBar — adds eyebrow labels + separators. */
export interface MetricGroup {
  label: string;
  ids: string[];
}

/**
 * Generic grouped metric list used by both RankSortBar's dropdown and
 * MetricPickerTile's dropdown — a single, shared "pick a metric" surface
 * instead of two hand-rolled lists with slightly different markup.
 */
function MetricOptionList({
  ids,
  labelFor,
  groups,
  activeId,
  onSelect,
}: {
  ids: string[];
  labelFor: (id: string) => string;
  groups?: MetricGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const Row = ({ id }: { id: string }) => {
    const active = id === activeId;
    return (
      <button
        key={id}
        onClick={() => onSelect(id)}
        data-testid={`rank-metric-${id}`}
        aria-pressed={active}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
          active ? "bg-primary/10 text-interactive" : "text-foreground/80 hover:bg-white/[0.05]"
        )}
      >
        <Check className={cn("w-3 h-3 shrink-0", active ? "opacity-100" : "opacity-0")} />
        <span className={cn(TYPE.body, "truncate")}>{labelFor(id)}</span>
      </button>
    );
  };

  if (!groups) {
    return <div className="py-1">{ids.map((id) => <Row key={id} id={id} />)}</div>;
  }

  return (
    <div className="py-1">
      {groups.map((g, gi) => {
        const groupIds = ids.filter((id) => g.ids.includes(id));
        if (groupIds.length === 0) return null;
        return (
          <div key={g.label}>
            {gi > 0 && <div className="my-1 border-t border-border/20" />}
            <div className={cn(TYPE.microLabel, "text-muted-foreground/45 px-2.5 py-1")}>{g.label}</div>
            {groupIds.map((id) => <Row key={id} id={id} />)}
          </div>
        );
      })}
    </div>
  );
}

/** Single dropdown: pick which KPI ranks the list. Replaces a row of pill
 *  buttons with one compact trigger — the option list (with `groups`
 *  category headers, if passed) opens in a popover. */
export function RankSortBar<Row>({
  metrics,
  activeId,
  onSelect,
  className,
  groups,
}: {
  metrics: RankMetric<Row>[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  groups?: MetricGroup[];
}) {
  const [open, setOpen] = useState(false);
  const active = metrics.find((m) => m.id === activeId) ?? metrics[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 bg-white/[0.02] hover:bg-white/[0.05] transition-colors",
            className
          )}
        >
          <span className={cn(TYPE.microLabel, "text-muted-foreground/55")}>Sort by</span>
          <span className={cn(TYPE.body, "font-semibold text-foreground/90")}>{active.label}</span>
          {active.direction === "asc" ? (
            <ArrowUp className="w-3 h-3 text-interactive" />
          ) : (
            <ArrowDown className="w-3 h-3 text-interactive" />
          )}
          <ChevronDown className={cn("w-3 h-3 text-muted-foreground/50 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0 border-border/60 bg-popover/95 backdrop-blur-sm overflow-hidden">
        <MetricOptionList
          ids={metrics.map((m) => m.id)}
          labelFor={(id) => metrics.find((m) => m.id === id)?.label ?? id}
          groups={groups}
          activeId={activeId}
          onSelect={(id) => { onSelect(id); setOpen(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A pre-resolved metric option for MetricPickerTile — value already
 *  computed and formatted by the caller (no per-row accessor needed here,
 *  unlike RankMetric, since the tile shows one aggregate reading). */
export interface ResolvedMetricOption {
  id: string;
  label: string;
  formatted: string;
}

/**
 * Swappable KPI tile: shows one metric's value with a dropdown (opened by
 * clicking the label) to swap which metric from `options` is featured —
 * generalizes the per-tile picker pattern from the Manager Overview KPI
 * strip so any page's header tiles can offer the same "pick from all
 * available metrics" interaction instead of a fixed, single-metric tile.
 */
export function MetricPickerTile({
  options,
  groups,
  activeId,
  onSelect,
  sub,
  variant = "default",
}: {
  options: ResolvedMetricOption[];
  groups?: MetricGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  sub?: string;
  variant?: "primary" | "default";
}) {
  const [open, setOpen] = useState(false);
  const isPrimary = variant === "primary";
  const active = options.find((o) => o.id === activeId) ?? options[0];
  if (!active) return null;

  return (
    <div className={cn("mx-kpi-tile p-4 relative", isPrimary && "border-primary/35 bg-primary/[0.03]")}>
      {isPrimary && <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-1 group/lbl text-left w-fit">
            <span className={cn(
              TYPE.microLabel,
              isPrimary ? "text-muted-foreground/65" : "text-muted-foreground/50",
              "transition-colors",
              open && "text-interactive"
            )}>
              {active.label}
            </span>
            <ChevronDown className={cn(
              "w-2.5 h-2.5 shrink-0 transition-all",
              open ? "rotate-180 text-interactive" : "text-muted-foreground/35 group-hover/lbl:text-muted-foreground/65"
            )} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0 border-border/60 bg-popover/95 backdrop-blur-sm overflow-hidden">
          <MetricOptionList
            ids={options.map((o) => o.id)}
            labelFor={(id) => options.find((o) => o.id === id)?.label ?? id}
            groups={groups}
            activeId={activeId}
            onSelect={(id) => { onSelect(id); setOpen(false); }}
          />
        </PopoverContent>
      </Popover>
      <div className="text-bignum font-bold text-foreground metric-num leading-none tracking-[-0.035em] mt-1">
        {active.formatted}
      </div>
      {sub && <div className={cn(TYPE.caption, "text-muted-foreground/50 mt-2 leading-snug line-clamp-2")}>{sub}</div>}
    </div>
  );
}

/** Tiny labeled KPI value used inside data-rich list rows. */
/**
 * A dense stat cell with an optional reason for an absent value (C3).
 *
 * KpiStat had no disclosure slot at all, so every "—" on the Audience
 * stat rows was structurally unexplainable — the reader could not tell a
 * metric this segment genuinely cannot compute from one the page failed to
 * compute. The `segmentMetricsCatalog` availability/unavailableReason
 * pattern already solves this everywhere else, and its `missing()` strings
 * are the reasons passed in here; this only supplies the render half.
 *
 * The affordance is a dotted underline plus a `title`, NOT a tooltip or a
 * DetailReveal: these stats also render inside button-cards (the ranked
 * segment rows), where the rulebook forbids a nested interactive element.
 * One mechanism that is correct in both places beats two that disagree.
 */
export function KpiStat({
  label,
  value,
  highlight,
  unavailableReason,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  /** Why this stat has no value. Ignored when a real value is present. */
  unavailableReason?: string;
}) {
  const isAbsent = value === "—" || value === "n/a";
  const reason = isAbsent ? unavailableReason : undefined;
  return (
    <div className="min-w-0">
      <div className={cn(TYPE.microLabel, "mb-1")}>
        {label}
      </div>
      <div
        className={cn(
          "text-caption font-semibold tabular-nums leading-none truncate",
          highlight ? "text-interactive" : "text-foreground/90",
          reason && "border-b border-dotted border-muted-foreground/40 cursor-help",
        )}
        {...(reason ? { title: `${label}: ${reason}`, "data-unavailable-reason": reason } : {})}
      >
        {value}
      </div>
    </div>
  );
}
