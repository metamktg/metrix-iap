// ─── MetricSelector ────────────────────────────────────────────────────
// Universal compact metric picker: a popover button listing metric
// options with toggle checkmarks. Generic over metric ids — pages wire
// it to their own selection state (useMetricSelection hooks or local
// state). Selection can never be emptied below `minSelected`.

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal, CheckSquare, Square, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricOption {
  id: string;
  label: string;
  /** Optional secondary text (e.g. why a metric may be unavailable). */
  hint?: string;
  /** Disabled options render but cannot be toggled. */
  disabled?: boolean;
}

export function MetricSelector({
  options,
  selected,
  onToggle,
  onReset,
  label = "Metrics",
  minSelected = 1,
}: {
  options: MetricOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onReset?: () => void;
  label?: string;
  minSelected?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Choose ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-body font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03] transition-colors"
        >
          <SlidersHorizontal className="w-3 h-3" />
          {label}
          <span className="text-label-xs font-mono text-muted-foreground/60">
            {selected.length}/{options.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">{label}</span>
          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1 text-label-xs font-medium text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {options.map((opt) => {
            const on = selected.includes(opt.id);
            const lastSelected = on && selected.length <= minSelected;
            const blocked = opt.disabled || lastSelected;
            return (
              <button
                key={opt.id}
                onClick={blocked ? undefined : () => onToggle(opt.id)}
                disabled={blocked}
                aria-pressed={on}
                title={lastSelected ? `At least ${minSelected} selected metric${minSelected === 1 ? "" : "s"} required` : undefined}
                className={cn(
                  "w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                  blocked ? "opacity-50" : "hover:bg-white/[0.04]"
                )}
              >
                {on ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0 mt-px" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-px" />
                )}
                <span className="flex-1 min-w-0">
                  <span className={cn("block text-body font-medium leading-tight", on ? "text-foreground" : "text-muted-foreground/80")}>
                    {opt.label}
                  </span>
                  {opt.hint && <span className="block text-label-xs text-muted-foreground/60 mt-0.5 leading-snug">{opt.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
