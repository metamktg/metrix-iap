// ─── Creative filter panel ─────────────────────────────────────────────
// Filters for the IAP Library "Creative cells" tab:
//  - Spend floor (min spend chip input)
//  - Performance tier (All / Top 25% / Mid 50% / Bottom 25% pill toggle)
//  - Concept group multi-select popover

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";

export type PerformanceTier = "all" | "top25" | "mid50" | "bottom25";

export interface CreativeFilterState {
  minSpendUsd: number | null;
  tier: PerformanceTier;
  conceptNames: string[];
}

export const DEFAULT_FILTER_STATE: CreativeFilterState = {
  minSpendUsd: null,
  tier: "all",
  conceptNames: [],
};

const TIERS: { value: PerformanceTier; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "top25",    label: "Top 25%" },
  { value: "mid50",    label: "Mid 50%" },
  { value: "bottom25", label: "Bottom 25%" },
];

// ─── Spend floor input ──────────────────────────────────────────────────

function SpendFloorInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(value != null ? String(value) : "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    (text: string) => {
      const n = parseFloat(text.replace(/[^0-9.]/g, ""));
      onChange(Number.isFinite(n) && n > 0 ? n : null);
    },
    [onChange]
  );

  const dirtyRef = useRef(false);
  useEffect(() => {
    // Only debounce actual user edits — scheduling on mount leaks a timer
    // that can fire after the environment is torn down (e.g. jsdom in tests)
    // and dispatches a pointless state update on first render.
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush(raw);
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // Keep raw in sync when the parent clears the value externally
  useEffect(() => {
    if (value == null && raw !== "") setRaw("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex items-center gap-1 border border-border/40 rounded-md px-2.5 py-1 bg-foreground/[0.02] hover:border-border/60 transition-colors">
      <span className="text-label text-muted-foreground/75 shrink-0">≥ $</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => flush(raw)}
        className="w-14 bg-transparent text-label text-foreground/80 outline-none placeholder:text-muted-foreground/75 tabular-nums"
        aria-label="Minimum spend filter"
      />
      {value != null && (
        <button
          onClick={() => { setRaw(""); onChange(null); }}
          className="pressable text-muted-foreground/75 hover:text-muted-foreground/75 transition-colors"
          aria-label="Clear spend floor"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── Concept multi-select popover ───────────────────────────────────────

function ConceptMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    );
  };

  const label =
    selected.length === 0
      ? "All concepts"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} concepts`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 border rounded-md px-2.5 py-1 text-label font-medium transition-colors",
            selected.length > 0
              ? "border-primary/40 bg-primary/[0.06] text-foreground"
              : "border-border/40 bg-foreground/[0.02] text-muted-foreground/75 hover:border-border/60 hover:text-foreground"
          )}
          aria-label="Filter by concept"
        >
          <span className="max-w-[120px] truncate">{label}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground/75" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 max-h-[280px] overflow-y-auto p-1.5">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/75 px-1.5 pb-1 mb-0.5 border-b border-border/20">
          Concept family
        </p>
        {options.length === 0 ? (
          <p className="text-label text-muted-foreground/75 px-1.5 py-2">No concept families found</p>
        ) : (
          <>
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="pressable-lg w-full text-left text-label text-interactive/70 hover:text-interactive px-1.5 py-1.5 rounded transition-colors"
              >
                Clear all
              </button>
            )}
            {options.map((name) => {
              const on = selected.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => toggle(name)}
                  className={cn(
                    "pressable-lg w-full flex items-center gap-2 text-left px-1.5 py-1.5 rounded text-label transition-colors",
                    on ? "bg-foreground/[0.04] text-foreground" : "text-foreground/70 hover:bg-foreground/[0.03]"
                  )}
                >
                  <span className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                    on ? "border-primary/50 bg-primary/20" : "border-border/40"
                  )}>
                    {on && <Check className="w-2.5 h-2.5 text-interactive" />}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main export ────────────────────────────────────────────────────────

export function CreativeFilterPanel({
  filters,
  onChange,
  conceptOptions,
  /** Count of cells shown after all filters, and total before. */
  shownCount,
  totalCount,
}: {
  filters: CreativeFilterState;
  onChange: (f: CreativeFilterState) => void;
  conceptOptions: string[];
  shownCount: number;
  totalCount: number;
}) {
  const isFiltered = filters.minSpendUsd != null || filters.tier !== "all" || filters.conceptNames.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Spend floor */}
      <div className="flex items-center gap-1.5">
        <span className="text-label text-muted-foreground/75 shrink-0">Min spend</span>
        <SpendFloorInput
          value={filters.minSpendUsd}
          onChange={(v) => onChange({ ...filters, minSpendUsd: v })}
        />
      </div>

      {/* Tier pills */}
      <div className="flex items-center rounded-md border border-border/30 overflow-hidden">
        {TIERS.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange({ ...filters, tier: t.value })}
            className={cn(
              "pressable px-2.5 py-1 text-label font-medium transition-colors",
              filters.tier === t.value
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground/75 hover:text-muted-foreground/75 hover:bg-foreground/[0.03]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Concept multi-select */}
      {conceptOptions.length > 0 && (
        <ConceptMultiSelect
          options={conceptOptions}
          selected={filters.conceptNames}
          onChange={(v) => onChange({ ...filters, conceptNames: v })}
        />
      )}

      {/* Active filter summary */}
      {isFiltered && (
        <span className="text-label text-muted-foreground/75 tabular-nums">
          Showing <span className="text-foreground/70 font-medium">{shownCount}</span> of {totalCount} cells
        </span>
      )}

      {/* Clear all */}
      {isFiltered && (
        <button
          onClick={() => onChange(DEFAULT_FILTER_STATE)}
          className="pressable text-label text-muted-foreground/75 hover:text-foreground transition-colors flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Filter application ─────────────────────────────────────────────────

export interface FilterableCell {
  cell_id: string;
  "Amount spent (USD)": number;
  book2_concept_name: string;
}

/** Sort metric used for tier calculation. */
export function sortValueForCell<T extends { CPA_result: number | null; CTR_link_pct: number; "Amount spent (USD)": number; Results: number; Impressions: number; Reach: number; "Link clicks": number; Result_per_link_click_pct: number }>(
  row: T,
  sortKey: import("@/lib/funnelStages").SortKey
): number {
  switch (sortKey) {
    case "cpa":       return row.CPA_result ?? Infinity;
    case "ctr":       return row.CTR_link_pct;
    case "spend":     return row["Amount spent (USD)"];
    case "results":   return row.Results;
    case "impressions": return row.Impressions;
    case "reach":     return row.Reach;
    case "link_clicks": return row["Link clicks"];
    case "cvr":       return row.Result_per_link_click_pct;
    default:          return 0;
  }
}

/**
 * Apply spend floor → concept → tier filters to a deduplicated cell row list.
 * Returns the filtered rows in their natural (input) order; sorting is the
 * caller's responsibility via the funnel stage sort config.
 */
export function applyCreativeFilters<T extends FilterableCell & { CPA_result: number | null; CTR_link_pct: number; Results: number; Impressions: number; Reach: number; "Link clicks": number; Result_per_link_click_pct: number }>(
  rows: T[],
  filters: CreativeFilterState,
  sortKey: import("@/lib/funnelStages").SortKey,
  /**
   * Sort direction of the active sort metric.
   * "desc" = higher-is-better (CTR, Impressions) → "Top 25%" = highest values (≥ p75)
   * "asc"  = lower-is-better  (CPA)              → "Top 25%" = lowest  values (≤ p25)
   * Defaults to "desc" when not supplied (custom / no stage).
   */
  sortDir: "asc" | "desc" = "desc"
): T[] {
  let result = rows;

  // 1. Spend floor
  if (filters.minSpendUsd != null) {
    result = result.filter((r) => r["Amount spent (USD)"] >= filters.minSpendUsd!);
  }

  // 2. Concept group
  if (filters.conceptNames.length > 0) {
    const names = new Set(filters.conceptNames);
    result = result.filter((r) => names.has(r.book2_concept_name));
  }

  // 3. Tier (computed from the post-spend/concept list)
  if (filters.tier !== "all" && result.length > 1) {
    const sortedValues = [...result]
      .map((r) => sortValueForCell(r, sortKey))
      .sort((a, b) => a - b); // always ascending for percentile math
    const n = sortedValues.length;
    const p25 = sortedValues[Math.floor(n * 0.25)] ?? sortedValues[n - 1];
    const p75 = sortedValues[Math.floor(n * 0.75)] ?? sortedValues[n - 1];

    // For higher-is-better (desc): top = highest values ≥ p75, bottom = lowest ≤ p25
    // For lower-is-better  (asc):  top = lowest  values ≤ p25, bottom = highest ≥ p75
    const higherIsBetter = sortDir === "desc";

    if (filters.tier === "top25") {
      result = result.filter((r) => {
        const v = sortValueForCell(r, sortKey);
        return higherIsBetter ? v >= p75 : v <= p25;
      });
    } else if (filters.tier === "bottom25") {
      result = result.filter((r) => {
        const v = sortValueForCell(r, sortKey);
        return higherIsBetter ? v <= p25 : v >= p75;
      });
    } else if (filters.tier === "mid50") {
      result = result.filter((r) => {
        const v = sortValueForCell(r, sortKey);
        return v > p25 && v < p75;
      });
    }
  }

  return result;
}
