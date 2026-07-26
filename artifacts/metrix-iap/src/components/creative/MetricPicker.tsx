// ─── Metric tile picker ────────────────────────────────────────────────
// Compact popover checklist attached to the overview tile row, letting
// the user choose which metrics show and in what order. Backed by
// useMetricSelection (localStorage), shared by both overview pages.

import { Settings2, Check, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MetricDef } from "@/lib/data/metricsCatalog";

export function MetricPickerButton({
  catalog,
  selected,
  onToggle,
  onMove,
  onReset,
}: {
  catalog: MetricDef[];
  selected: string[];
  onToggle: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReset: () => void;
}) {
  const byId = new Map(catalog.map((m) => [m.id, m]));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-caption font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors">
          <Settings2 className="w-3.5 h-3.5" />
          Customize metrics
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">
            Metric tiles
          </span>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 text-label font-medium text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        {selected.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1">Selected order</p>
            {selected.map((id, i) => {
              const m = byId.get(id);
              if (!m) return null;
              return (
                <div key={id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-primary/[0.05] border border-primary/15">
                  <span className="text-caption text-foreground/85 flex-1 min-w-0 truncate">{m.label}</span>
                  <button
                    disabled={i === 0}
                    onClick={() => onMove(id, -1)}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/60"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={i === selected.length - 1}
                    onClick={() => onMove(id, 1)}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/60"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1">All metrics</p>
        <div className="space-y-0.5">
          {catalog.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => onToggle(m.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left transition-colors",
                  on ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    on ? "border-primary/50 bg-primary/20" : "border-border/40"
                  )}
                >
                  {on && <Check className="w-3.5 h-3.5 text-interactive" />}
                </span>
                <span className="text-caption text-foreground/85 flex-1 min-w-0 truncate">{m.label}</span>
                <span className="text-label text-muted-foreground/50 tabular-nums">{m.formatted}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
