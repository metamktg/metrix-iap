// ─── Breakdown control ────────────────────────────────────────────────
//
// The dimension picker above a Breakdown view. Its whole job is to not offer
// a split the rows cannot make.
//
// It follows ViewSwitcher's rule rather than hiding what it cannot do: an
// unusable dimension stays visible, disabled, with the reason and the distinct
// count attached. Hiding it makes "why can't I break this down by placement?"
// a support ticket; showing "Placement · 1 value" answers it on the spot.

import { useMemo } from "react";
import { Filter } from "lucide-react";
import {
  dimensionsFor, distinctCount, whyNotDimension,
  type BreakdownDimension,
} from "@/lib/data-module/breakdownDimensions";
import type { DataShape } from "@/lib/data-module/viewSupport";

export interface BreakdownControlProps<Row extends Record<string, unknown>> {
  shape: DataShape;
  rows: Row[];
  value: string | null;
  onChange: (key: string) => void;
  label?: string;
}

export function BreakdownControl<Row extends Record<string, unknown>>({
  shape, rows, value, onChange, label = "Break down by",
}: BreakdownControlProps<Row>) {
  const options = useMemo(() => {
    return dimensionsFor(shape).map((d: BreakdownDimension) => {
      const distinct = distinctCount(rows, d.key);
      return { ...d, distinct, reason: whyNotDimension(distinct) };
    });
  }, [shape, rows]);

  if (options.length === 0) {
    return (
      <p className="text-caption font-body text-muted-foreground/75">
        These rows carry no second dimension to break down by.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      <span className="inline-flex items-center gap-1.5 text-micro uppercase text-muted-foreground/75 shrink-0">
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="flex items-center gap-0.5 rounded-xl bg-input/30 p-1 max-w-full
                   overflow-x-auto overscroll-x-contain [scrollbar-width:none]
                   [&::-webkit-scrollbar]:hidden"
      >
        {options.map((o) => {
          const disabled = o.reason !== null;
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => !disabled && onChange(o.key)}
              disabled={disabled}
              aria-pressed={active}
              title={disabled ? `${o.reason} ${o.hint ?? ""}`.trim() : o.hint}
              className={`h-10 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-caption shrink-0
                          transition-[background-color,color,scale] duration-150 ease-[var(--ease-out)]
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                          ${
                            disabled
                              ? "text-muted-foreground/75 cursor-not-allowed"
                              : active
                                ? "bg-primary/20 text-foreground active:scale-[0.96]"
                                : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] active:scale-[0.96]"
                          }`}
            >
              <span>{o.label}</span>
              {/* The count is the reason, made visible without a hover. */}
              <span className="text-micro tabular-nums text-muted-foreground/75">
                {o.distinct}
              </span>
              {disabled && <span className="sr-only"> — unavailable: {o.reason}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
