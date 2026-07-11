// ─── FilterBar / FilterChips ───────────────────────────────────────────
// Shared filter strip + active-filter chips for list/table pages.
// Pure presentation: pages own the filter state; chips just render the
// active set with per-chip remove and a clear-all action.

import { Search, X, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

/** Horizontal strip that holds search + filter controls under a header. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap px-6 py-2.5 border-b border-border/30 bg-white/[0.01]", className)}>
      <ListFilter className="w-3 h-3 text-muted-foreground/60 shrink-0" />
      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Filters</span>
      {children}
    </div>
  );
}

/** Compact search input for FilterBar. */
export function FilterSearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-44 rounded-md border border-border/40 bg-white/[0.02] pl-6.5 pr-6 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** Toggleable filter option chip (e.g. a status or family filter). */
export function FilterToggleChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-body font-medium transition-colors",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/40 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.03]"
      )}
    >
      {label}
      {count != null && <span className="text-label-xs font-mono text-muted-foreground/60">{count}</span>}
    </button>
  );
}

export interface ActiveFilter {
  id: string;
  label: string;
}

/** Renders the currently-active filters as removable chips. */
export function FilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onRemove: (id: string) => void;
  onClearAll?: () => void;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {filters.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md border border-primary/25 bg-primary/[0.08] text-body text-primary"
        >
          {f.label}
          <button
            onClick={() => onRemove(f.id)}
            aria-label={`Remove filter ${f.label}`}
            className="p-0.5 rounded hover:bg-primary/15"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {onClearAll && filters.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-body font-medium text-muted-foreground/60 hover:text-foreground px-1.5 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
