// ─── Global date-range picker (topbar) ─────────────────────────────────
// Live range control: presets + custom range + compare-to-previous toggle.
// Bounds always reflect the active scope's actual data window — presets
// anchor to the end of available data, never to the wall clock.

import { useState } from "react";
import { CalendarRange, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import { Switch } from "@workspace/command-deck/components/ui/switch";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  useDateRange,
  PRESET_LABELS,
  formatIsoRange,
  type DateRangePreset,
} from "@/contexts/DateRangeContext";

const PRESET_ORDER: DateRangePreset[] = ["7d", "14d", "30d", "60d", "90d", "all"];

export function DateRangePicker() {
  const {
    bounds,
    range,
    compareRange,
    preset,
    compare,
    setPreset,
    setCustomRange,
    setCompare,
    rangeLabel,
  } = useDateRange();

  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");

  if (!bounds) {
    return (
      <div
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-caption text-muted-foreground/60 shrink-0"
        title="No dated performance data is available for this scope yet."
      >
        <CalendarRange className="w-3.5 h-3.5" />
        <span className="hidden md:inline">No data window</span>
      </div>
    );
  }

  const applyCustom = () => {
    if (!draftStart || !draftEnd) return;
    setCustomRange(draftStart, draftEnd);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v && range) {
        setDraftStart(range.start);
        setDraftEnd(range.end);
      }
    }}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Date range: ${rangeLabel}`}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-caption font-medium text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
        >
          <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/70" />
          <span className="hidden md:inline tabular-nums">{rangeLabel}</span>
          <span className="md:hidden">{PRESET_LABELS[preset]}</span>
          {compare && (
            <span className="text-[8px] font-semibold uppercase tracking-wide text-interactive border border-primary/25 bg-primary/10 px-1 py-0.5 rounded leading-none">
              vs prev
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0 bg-surface-overlay border-border/50">
        <div className="px-3 py-2.5 border-b border-border/40">
          <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Date range</p>
          <p className="text-label text-muted-foreground/70 mt-1">
            Data available {formatIsoRange(bounds)}
          </p>
        </div>

        <div className="p-1.5">
          {PRESET_ORDER.map((p) => (
            <button
              key={p}
              onClick={() => {
                setPreset(p);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 h-8 rounded text-body transition-colors",
                preset === p
                  ? "text-interactive bg-primary/10 font-medium"
                  : "text-foreground/75 hover:text-foreground hover:bg-white/5"
              )}
            >
              <span className="flex-1 text-left">{PRESET_LABELS[p]}</span>
              {preset === p && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>

        <div className="px-3 py-2.5 border-t border-border/40 space-y-2">
          <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Custom range</p>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={draftStart}
              min={bounds.start}
              max={bounds.end}
              onChange={(e) => setDraftStart(e.target.value)}
              aria-label="Custom range start"
              className="flex-1 min-w-0 h-7 px-1.5 rounded border border-border/40 bg-white/[0.03] text-caption text-foreground/80 [color-scheme:dark]"
            />
            <span className="text-label text-muted-foreground/60">→</span>
            <input
              type="date"
              value={draftEnd}
              min={bounds.start}
              max={bounds.end}
              onChange={(e) => setDraftEnd(e.target.value)}
              aria-label="Custom range end"
              className="flex-1 min-w-0 h-7 px-1.5 rounded border border-border/40 bg-white/[0.03] text-caption text-foreground/80 [color-scheme:dark]"
            />
          </div>
          <button
            onClick={applyCustom}
            disabled={!draftStart || !draftEnd}
            className="w-full h-7 rounded-md bg-primary/15 border border-primary/30 text-caption font-medium text-interactive hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            Apply custom range
          </button>
        </div>

        <div className="px-3 py-2.5 border-t border-border/40 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-caption font-medium text-foreground/80">Compare to previous period</p>
            {compare && compareRange && (
              <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-0.5">
                vs {formatIsoRange(compareRange)}
              </p>
            )}
          </div>
          <Switch
            checked={compare}
            onCheckedChange={setCompare}
            aria-label="Compare to previous period"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
