// ─── Sort / Filter Bar ───────────────────────────────────────────
// Reusable sort + search controls for tables and card grids.
// Keeps the bar compact and aligned with the Metrix design system.

import { Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc" | null;

export interface SortOption {
  key: string;
  label: string;
}

interface SortFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  sortOptions: SortOption[];
  sortKey: string | null;
  sortDir: SortDir;
  onSortChange: (key: string, dir: SortDir) => void;
  resultCount?: number;
}

export function SortFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  sortOptions,
  sortKey,
  sortDir,
  onSortChange,
  resultCount,
}: SortFilterBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-8 pl-8 pr-3 rounded-md border border-border/40 bg-white/[0.02] text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors"
        />
      </div>

      {/* Sort pills */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
        {sortOptions.map((opt) => {
          const active = sortKey === opt.key;
          const dir = active ? sortDir : null;
          return (
            <button
              key={opt.key}
              onClick={() => {
                if (!active) {
                  onSortChange(opt.key, "desc");
                } else if (dir === "desc") {
                  onSortChange(opt.key, "asc");
                } else {
                  onSortChange(opt.key, null);
                }
              }}
              className={cn(
                "h-7 px-2.5 rounded-md border text-label font-medium transition-colors flex items-center gap-1",
                active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.03]"
              )}
            >
              {opt.label}
              {dir === "desc" && <span className="text-[10px] leading-none">↓</span>}
              {dir === "asc" && <span className="text-[10px] leading-none">↑</span>}
            </button>
          );
        })}
      </div>

      {resultCount != null && (
        <span className="text-label-xs font-mono text-muted-foreground/50 ml-auto">
          {resultCount} result{resultCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
