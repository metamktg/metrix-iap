// ─── Dumbbell (connected-dot) rows ────────────────────────────────────
//
// Two shares of the same whole, per row, with the DIFFERENCE between them
// as the primary mark.
//
// WHY THIS EXISTS. The Audience view's "Share of spend vs. share of result"
// card drew two share-of-total progress bars per row, each on its own
// 0–100 track. Measured on the Bookster fixture, six groups:
//
//   C1  spend 23.9%  results 14.1%   gap −10 pts
//   C2  spend 23.2%  results 25.6%   gap  +2
//   C3  spend 19.0%  results 28.2%   gap  +9
//   C4  spend 18.5%  results 16.7%   gap  −2
//   C5  spend 13.5%  results 10.3%   gap  −3
//   C6  spend  1.9%  results  5.1%   gap  +3
//
// Two problems, both structural rather than cosmetic:
//
//   1. Shares of a whole split across N groups are all small. Every one of
//      those twelve bars used between 2% and 28% of its track, so 72–98%
//      of the ink budget was empty rail. The chart spent its whole width
//      to render numbers that never left the first quarter of it.
//
//   2. The card is NAMED for the gap — "gap in points" — and the gap was
//      the one quantity not drawn. It was text. Reading it off the bars
//      means differencing two lengths in two separate rows, which is the
//      hardest comparison in visual perception. C1 (−10, the worst) and
//      C3 (+9, the best) looked near-identical: a medium-short bar above a
//      medium-short bar, both times.
//
// A dumbbell fixes both. The two values share ONE axis, so the segment
// between them has a length, and that length IS the gap. Direction is
// carried by colour from the reserved verdict tokens — polarity, not
// category — and reinforced by the sign on the printed value, so the read
// never rests on colour alone.
//
// The axis runs 0 → the largest share present (rounded up), not 0 → 100.
// Nothing is exaggerated by that: every row shares the one scale and it is
// labelled. It just stops the plot from dedicating three quarters of its
// width to a region no group reaches.

import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { MARK, SERIES_VARS, VERDICT } from "./chartTokens";

export interface DumbbellRow {
  /** Stable identity — never a sort position. */
  id: string;
  label: string;
  /** Short prefix shown before the label, e.g. a cell code. */
  code?: string;
  a: number;
  b: number;
  /** Absent when the measure has no denominator — drawn as unmeasured. */
  measured?: boolean;
}

/**
 * Points of difference below which a gap is called neutral. Matches the
 * threshold the card's own text badge already used, so the colour and the
 * wording cannot disagree.
 */
const NEUTRAL_BAND = 3;

function gapColor(gap: number, measured: boolean): string {
  if (!measured) return VERDICT.unmeasured;
  if (Math.abs(gap) < NEUTRAL_BAND) return VERDICT.neutral;
  return gap > 0 ? VERDICT.good : VERDICT.bad;
}

export function DumbbellRows({
  rows,
  aLabel,
  bLabel,
  unmeasuredNote,
  formatValue = (n: number) => `${n.toFixed(0)}%`,
  "data-testid": testId,
}: {
  rows: DumbbellRow[];
  aLabel: string;
  bLabel: string;
  /** Shown in place of the b-value when a row is unmeasured. */
  unmeasuredNote?: string;
  formatValue?: (n: number) => string;
  "data-testid"?: string;
}) {
  if (rows.length === 0) return null;

  // One shared axis for every row. Headroom so the rightmost dot is never
  // flush against the edge, and a floor so a set of tiny shares does not
  // magnify noise into apparent signal.
  const peak = Math.max(...rows.flatMap((r) => [r.a, r.measured === false ? 0 : r.b]), 0);
  const axisMax = Math.max(10, Math.ceil((peak * 1.08) / 5) * 5);
  const pct = (v: number) => `${Math.min(100, (v / axisMax) * 100)}%`;

  return (
    <div className="space-y-3" data-testid={testId}>
      {/* Key. Identity never rides on the fill alone. */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Swatches carry the same shape as the marks. A key that shows two
            identical discs for a ring and a disc is a key that disagrees
            with its own plot. */}
        {[
          { label: aLabel, fill: SERIES_VARS[0]!, ring: true },
          { label: bLabel, fill: SERIES_VARS[1]!, ring: false },
        ].map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="rounded-full shrink-0"
              style={{
                width: s.ring ? MARK.dotSize + 1 : MARK.dotSize,
                height: s.ring ? MARK.dotSize + 1 : MARK.dotSize,
                background: s.ring ? "transparent" : s.fill,
                border: s.ring ? `2px solid ${s.fill}` : undefined,
              }}
            />
            <span className={cn(TYPE.label, "text-muted-foreground/85 normal-case")}>{s.label}</span>
          </span>
        ))}
        <span className={cn(TYPE.label, "text-muted-foreground/75 normal-case ml-auto tabular-nums")}>
          0–{axisMax}%
        </span>
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => {
          const measured = r.measured !== false;
          const gap = Math.round(r.b - r.a);
          const stroke = gapColor(gap, measured);
          const lo = Math.min(r.a, r.b);
          const hi = Math.max(r.a, r.b);
          return (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(110px,190px)_1fr_auto] items-center gap-3"
              role="img"
              aria-label={
                measured
                  ? `${r.label}: ${aLabel} ${formatValue(r.a)}, ${bLabel} ${formatValue(r.b)}, ` +
                    `${gap > 0 ? "up" : gap < 0 ? "down" : "level"} ${Math.abs(gap)} points`
                  : `${r.label}: ${aLabel} ${formatValue(r.a)}, ${bLabel} not measured`
              }
            >
              <span className={cn(TYPE.caption, "font-medium text-foreground/85 inline-flex items-center gap-1.5 min-w-0")}>
                {r.code && <span className="shrink-0 text-muted-foreground/75 tabular-nums">{r.code}</span>}
                <span className="truncate">{r.label}</span>
              </span>

              {/* The plot. A rail for the shared axis, one segment whose
                  length is the gap, and the two dots that bound it. */}
              <div className="relative h-4">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-foreground/[0.07]" />
                {measured && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: pct(lo),
                      width: `calc(${pct(hi)} - ${pct(lo)})`,
                      height: MARK.lineWidth,
                      background: stroke,
                    }}
                  />
                )}
                {/* Dots last so they sit over the segment. A ring in the
                    surface colour keeps them legible where they overlap. */}
                <Dot at={pct(r.a)} fill={SERIES_VARS[0]!} variant="ring" />
                {measured && <Dot at={pct(r.b)} fill={SERIES_VARS[1]!} variant="solid" />}
              </div>

              <div className="flex items-center gap-2.5 justify-end shrink-0">
                <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/75 w-9 text-right")}>
                  {formatValue(r.a)}
                </span>
                <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/75 w-9 text-right")}>
                  {measured ? formatValue(r.b) : unmeasuredNote ?? "n/a"}
                </span>
                <span
                  className={cn(TYPE.label, "tabular-nums w-12 text-right font-medium")}
                  style={{ color: stroke }}
                >
                  {measured ? `${gap > 0 ? "+" : ""}${gap}pts` : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The two ends differ in SHAPE as well as hue — a ring for the first
 * series, a solid disc for the second.
 *
 * The categorical palette is validated for CVD separation, but that
 * validation is about fills at chart scale; these marks are 8px on a dark
 * ground, and rendered at that size the two slots read as "blue" and
 * "blue" at a glance even to full-colour vision. Shape is a second channel
 * that costs nothing and survives every colour condition, which is exactly
 * what the accessibility pass asks for when identity would otherwise rest
 * on hue alone.
 */
function Dot({ at, fill, variant }: { at: string; fill: string; variant: "ring" | "solid" }) {
  const size = variant === "ring" ? MARK.dotSize + 1 : MARK.dotSize;
  return (
    <div
      aria-hidden
      className="absolute top-1/2 rounded-full"
      style={{
        left: at,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        background: variant === "solid" ? fill : "hsl(var(--card))",
        border: variant === "ring" ? `2px solid ${fill}` : undefined,
        // 2px surface ring, per the mark spec for overlapping marks: where
        // spend and results are nearly equal the two dots collide, and
        // without it they merge into one blob of the wrong colour.
        boxShadow: "0 0 0 2px hsl(var(--card))",
      }}
    />
  );
}
