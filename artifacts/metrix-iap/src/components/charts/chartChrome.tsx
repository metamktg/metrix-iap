// ─── Chart chrome: tooltip, empty state, skeleton ─────────────────────
//
// The pieces every chart needs and none should re-implement. Three details
// here are deliberate rather than decorative:
//
//   · Concentric radius. The tooltip is rounded-xl (12px) with p-2.5 (10px),
//     so the swatch inside it is rounded-[2px], not the same radius as its
//     own container. Matching radii on nested surfaces is the single most
//     common thing that makes an interface feel slightly wrong.
//   · Layered shadow, not a border. A hard 1px line reads as a seam against
//     whatever is behind it; stacked transparent shadows read as depth on
//     any background.
//   · tabular-nums on every number. A tooltip that follows the pointer
//     across a series is the exact place where proportional digits make
//     values twitch horizontally as they change.

import type { ReactNode } from "react";

export interface TooltipRow {
  label: string;
  value: string;
  /** CSS colour for the series swatch. Omit for a value with no mark. */
  swatch?: string;
}

export function ChartTooltip({
  title,
  rows,
  detail,
}: {
  title: string;
  rows: TooltipRow[];
  detail?: ReactNode;
}) {
  return (
    <div
      className="rounded-xl bg-popover/95 backdrop-blur-sm p-2.5 min-w-[9rem] max-w-[16rem]"
      style={{
        boxShadow:
          "0 0 0 1px hsl(var(--border) / 0.6), 0 1px 2px hsl(0 0% 0% / 0.28), " +
          "0 6px 16px hsl(0 0% 0% / 0.30), 0 12px 32px hsl(0 0% 0% / 0.22)",
      }}
    >
      <div className="text-body font-medium text-foreground leading-snug" style={{ textWrap: "pretty" }}>
        {title}
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            {r.swatch && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: r.swatch }}
              />
            )}
            <span className="text-caption text-muted-foreground flex-1 truncate">{r.label}</span>
            <span className="text-caption font-medium text-foreground tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
      {detail && (
        <div className="text-label text-muted-foreground/80 mt-1.5 leading-relaxed" style={{ textWrap: "pretty" }}>
          {detail}
        </div>
      )}
    </div>
  );
}

export function ChartEmpty({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="w-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50"
      style={{ height }}
      role="img"
      aria-label={label}
    >
      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border/30" />
      <span className="text-caption">{label}</span>
    </div>
  );
}

export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full flex items-end gap-1.5 px-2 pb-2"
      style={{ height }}
      role="status"
      aria-label="Loading chart"
    >
      {[62, 84, 48, 71, 38, 56, 92].map((h, i) => (
        <div
          key={h}
          className="flex-1 rounded-t bg-foreground/[0.06] animate-pulse"
          // Stagger, so the skeleton reads as one object resolving rather
          // than seven independent things blinking in unison.
          style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}
