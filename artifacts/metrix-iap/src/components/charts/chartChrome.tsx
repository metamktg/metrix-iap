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
import { magnitudeLegend, divergingLegend } from "./chartTokens";

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
      className="w-full flex flex-col items-center justify-center gap-2 text-muted-foreground/75"
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

// ─── Scale legends ────────────────────────────────────────────────────
//
// Both of these render the SAME function that fills the marks. That is the
// whole point of them existing.
//
// Hand-drawn legends had gone stale in four places: a two-stop CSS gradient
// from `chart-1/0.04` to `chart-1/0.22` sitting beside cells painted from
// ramp steps 900 down to 600, and a `foreground → chart-3/0.30` gradient
// beside cells painted with the red/grey/green diverging scale. In each case
// the key described a map that no longer existed, which is worse than no key
// at all: the reader trusts it and misreads every cell.
//
// A legend that cannot be authored separately from the fill cannot drift
// from it.

export function MagnitudeLegend({
  label,
  colorIndex = 0,
  // "Less"/"More" and not "Low"/"High": low and high are this product's
  // CONFIDENCE vocabulary (ConfidenceBadge renders exactly those words), and
  // a magnitude strip that borrows them puts the two scales' language on the
  // same screen meaning different things. Caught by a test that asserted a
  // "Low" confidence badge and found two matches.
  lowLabel = "Less",
  highLabel = "More",
}: {
  label: string;
  colorIndex?: number;
  lowLabel?: string;
  highLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-caption text-muted-foreground/75">{lowLabel}</span>
      <span className="inline-flex gap-px" aria-hidden="true">
        {magnitudeLegend(colorIndex).map((fill, i) => (
          <span
            key={i}
            className="w-3 h-2.5 first:rounded-l-sm last:rounded-r-sm"
            style={{ background: fill }}
          />
        ))}
      </span>
      <span className="text-caption text-muted-foreground/75">{highLabel}</span>
      <span className="sr-only">{label}: darker is {highLabel.toLowerCase()}</span>
      <span className="text-caption text-muted-foreground/75">{label}</span>
    </span>
  );
}

export function VerdictLegend({ lowLabel, highLabel }: { lowLabel: string; highLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-caption text-muted-foreground/75">{lowLabel}</span>
      <span className="inline-flex gap-px" aria-hidden="true">
        {/* The "Not measured" entry is the hatch, which belongs beside the
            map itself rather than inside a two-ended scale strip. */}
        {divergingLegend()
          .filter((l) => l.label !== "Not measured")
          .map((l, i) => (
            <span
              key={i}
              className="w-3 h-2.5 first:rounded-l-sm last:rounded-r-sm"
              style={{ background: l.fill }}
            />
          ))}
      </span>
      <span className="text-caption text-muted-foreground/75">{highLabel}</span>
    </span>
  );
}
