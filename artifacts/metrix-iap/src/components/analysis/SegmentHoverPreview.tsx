// ─── Segment hover preview ────────────────────────────────────────────
// The Nocturne "Metrix v1" generic metric-hover popover applied to
// segment rows: accent gradient stripe on the top edge, mono uppercase
// kicker, label/value rows, and the "Click to open the deep dive" footer
// cue. Shown on the Breakdown tab's mirrored table (and reusable by any
// segment row surface).
//
// Same interaction conventions as MetricHoverPopover: Radix HoverCard,
// 220ms open / 80ms close delays. On pure-touch devices the hover simply
// never fires — the row itself is already the tap target for the deep
// dive, so no extra affordance is needed.
//
// Honesty: only values the row actually carries are shown; a derived
// cost-per-result appears only when both spend and results exist and
// results > 0 — never a fabricated zero.

import { ArrowRight } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/command-deck/components/ui/hover-card";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import type { BreakdownRow } from "@/lib/data/kpiBreakdown";

export interface SegmentHoverPreviewProps {
  /** Mono uppercase kicker — the dimension label ("Concept", "Placement"). */
  kicker: string;
  /** The active metric's display label for the value row. */
  metricLabel: string;
  row: BreakdownRow;
  /** True when clicking the row opens the deep dive (renders the footer cue). */
  drillable: boolean;
  children: React.ReactNode;
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn(TYPE.microLabel, "shrink-0")}>{label}</span>
      <span className={cn(TYPE.body, "tabular-nums font-semibold text-foreground truncate")}>{value}</span>
    </div>
  );
}

export function SegmentHoverPreview({ kicker, metricLabel, row, drillable, children }: SegmentHoverPreviewProps) {
  const costPerResult =
    row.spend != null && row.results != null && row.results > 0 ? row.spend / row.results : null;

  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        className="w-[260px] p-0 bg-[hsl(var(--surface-raised))] border border-[hsl(var(--border-default))] shadow-2xl overflow-hidden rounded-xl"
        side="bottom"
        align="start"
        sideOffset={6}
      >
        {/* Accent top stripe — Nocturne popover signature */}
        <div className="h-[2px] w-full bg-gradient-to-r from-interactive/80 via-interactive/40 to-transparent" aria-hidden />

        <div className="px-3 pt-2.5 pb-2 border-b border-[hsl(var(--border-subtle))]">
          <div className={cn(TYPE.microLabel, "mb-0.5")} data-testid="segment-preview-kicker">{kicker}</div>
          <div className={cn(TYPE.title, "truncate")} data-testid="segment-preview-title" title={row.label}>
            {row.label}
          </div>
        </div>

        <div className="px-3 py-2.5 space-y-1.5" data-testid="segment-preview-values">
          <ValueRow label={metricLabel} value={row.formatted} />
          <ValueRow label="Spend" value={row.spend != null ? fmtUSD(row.spend, 0) : "n/a"} />
          <ValueRow label="Results" value={row.results != null ? fmtNum(row.results) : "n/a"} />
          {costPerResult != null && <ValueRow label="Cost / result" value={fmtUSD(costPerResult)} />}
          {row.note && (
            <p className={cn(TYPE.caption, "pt-1")} data-testid="segment-preview-note">{row.note}</p>
          )}
        </div>

        {drillable && (
          <div className="px-3 pb-2.5 border-t border-[hsl(var(--border-subtle))] pt-2">
            <span
              className="inline-flex items-center gap-1 text-caption font-semibold text-interactive"
              data-testid="segment-preview-cue"
            >
              Click to open the deep dive <ArrowRight className="w-3 h-3" aria-hidden />
            </span>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
