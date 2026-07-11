// ─── ChartPanel ────────────────────────────────────────────────────────
// Consistent wrapper for in-page charts: title row, optional description
// and legend, fixed-height body, explicit empty state. Distinct from the
// low-level shadcn ChartContainer in ui/chart.tsx — this is the layout
// shell pages compose around any visualization.

import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChartLegendItem {
  label: string;
  colorClass: string; // e.g. "bg-primary" or "bg-emerald-400"
}

export function ChartPanel({
  title,
  desc,
  legend,
  right,
  empty,
  emptyMessage = "No data available for this chart.",
  heightClass = "min-h-[220px]",
  children,
  className,
}: {
  title: string;
  desc?: string;
  legend?: ChartLegendItem[];
  right?: React.ReactNode;
  /** When true, renders the explicit empty state instead of children. */
  empty?: boolean;
  emptyMessage?: string;
  heightClass?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mx-card overflow-hidden", className)}>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(120,170,255,0.10)]">
        <div className="flex-1 min-w-0">
          <h3 className="text-body-lg font-semibold text-foreground leading-tight">{title}</h3>
          {desc && <p className="text-body text-muted-foreground/70 mt-0.5 leading-snug">{desc}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {legend && legend.length > 0 && (
            <div className="flex items-center gap-2.5 flex-wrap">
              {legend.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5 text-label text-muted-foreground/70">
                  <span className={cn("w-2 h-2 rounded-sm shrink-0", item.colorClass)} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
          {right}
        </div>
      </div>
      <div className={cn("relative p-4", heightClass)}>
        {empty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <BarChart3 className="w-4 h-4 text-muted-foreground/50" />
            <p className="text-body text-muted-foreground/60 max-w-xs">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
