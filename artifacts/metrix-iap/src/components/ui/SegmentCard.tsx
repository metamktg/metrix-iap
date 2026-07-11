// ─── SegmentCard ───────────────────────────────────────────────────────
// Comparison card for a segment (ICP/avatar, demographic band, placement
// group…): name, optional descriptor, a small metric grid, and an
// optional footer. Missing metrics render as "—", never a fabricated 0.

import { cn } from "@/lib/utils";

export interface SegmentMetric {
  label: string;
  /** Preformatted value; null/undefined renders an honest em dash. */
  value: string | null | undefined;
  /** Optional inline extra (e.g. a TrendIndicator). */
  extra?: React.ReactNode;
}

export function SegmentCard({
  name,
  descriptor,
  badge,
  metrics,
  footer,
  highlighted = false,
  onClick,
  className,
}: {
  name: string;
  descriptor?: string;
  badge?: React.ReactNode;
  metrics: SegmentMetric[];
  footer?: React.ReactNode;
  highlighted?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "mx-card p-4 text-left w-full flex flex-col gap-3",
        highlighted && "border-primary/30 bg-primary/[0.03]",
        onClick && "transition-colors hover:border-primary/30 hover:bg-primary/[0.02] cursor-pointer",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground leading-tight truncate">{name}</h4>
          {descriptor && <p className="text-body text-muted-foreground/70 mt-0.5 leading-snug">{descriptor}</p>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <dt className="text-label-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">{m.label}</dt>
            <dd className="text-body-lg font-bold text-foreground tabular-nums leading-tight mt-0.5 flex items-baseline gap-1.5 flex-wrap">
              {m.value ?? "—"}
              {m.extra}
            </dd>
          </div>
        ))}
      </dl>
      {footer && <div className="pt-1 border-t border-border/30">{footer}</div>}
    </Wrapper>
  );
}
