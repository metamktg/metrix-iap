// ─── Heat matrix ──────────────────────────────────────────────────────
//
// The Map view: a value placed on two axes. One component behind the MST 4x4
// cross map, avatar x concept, age x gender, and ICP positioning — four grids
// that were four hand-rolled implementations with four different ideas about
// what an empty cell means and four intensity formulas that had drifted apart.
//
// What it enforces that they did not:
//
//   · An unmeasured cell is visibly distinct from a measured low one. They
//     used the same faint fill, so "no data here" and "worst performer" were
//     the same square.
//   · The scale KIND is declared by the caller, not guessed. A magnitude
//     (spend) gets one hue stepped light-to-dark; a verdict (CPA against
//     goal) gets the diverging red/neutral/green. Painting a magnitude with
//     the diverging scale invents a good end the measure does not have.
//   · The legend is derived from the same function that paints the cells, so
//     the key cannot describe a map it no longer matches.
//   · Arrow-key navigation, which Phase 3 E6 requires of the matrix ("Matrix
//     arrow-key navigable, Enter opens detail") and which no grid had.

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { divergingFill, divergingLegend, magnitudeFill, magnitudeLegend } from "./chartTokens";
import { ChartEmpty } from "./chartChrome";
import { HEADING } from "@/pages/metrix/typography";

/** Hatch used for every unmeasured cell, so a gap never looks like a low value. */
const GAP_HATCH =
  "repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.10) 0 5px, transparent 5px 10px)";

export interface HeatCell {
  row: string;
  col: string;
  /** Null when nothing measured this intersection. Rendered as a gap. */
  value: number | null;
  /** Optional second line inside the cell (e.g. a cell id or a count). */
  sub?: string;
  /**
   * Everything else the caller knows about this intersection, for the hover.
   * A cell shows one number; the reader who stops on it usually wants the
   * two or three that produced it (spend, results, sample size). Without
   * this the callers that had it kept their own grid to keep it.
   */
  hint?: string;
  /** Passed back on select, so the caller can open its own detail. */
  meta?: unknown;
}

export interface HeatMatrixProps {
  rows: string[];
  cols: string[];
  cells: HeatCell[];
  /**
   * What the value MEANS, which decides the scale:
   *   "magnitude" — more is simply more (spend, impressions). One hue.
   *   "verdict"   — there is a good end and a bad end (CPA vs goal). Diverging.
   */
  scale: "magnitude" | "verdict";
  /** For "verdict": true when a LOWER value is better (CPA, cost per result). */
  lowerIsBetter?: boolean;
  /** For "verdict": the target. Without one the scale is relative to the grid's own range. */
  goal?: number | null;
  format: (n: number) => string;
  /** Names the measure — a grid of bare numbers is a puzzle. */
  measureLabel: string;
  onSelect?: (cell: HeatCell) => void;
  rowHeaderLabel?: string;
  emptyLabel?: string;
  /** Series slot for the magnitude ramp. */
  colorIndex?: number;
}

export function HeatMatrix({
  rows,
  cols,
  cells,
  scale,
  lowerIsBetter = false,
  goal = null,
  format,
  measureLabel,
  onSelect,
  rowHeaderLabel = "",
  emptyLabel = "No data yet",
  colorIndex = 0,
}: HeatMatrixProps) {
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  const { at, norm, measured } = useMemo(() => {
    const at = new Map<string, HeatCell>();
    for (const c of cells) at.set(`${c.row}\u0000${c.col}`, c);
    const values = cells.map((c) => c.value).filter((v): v is number => v != null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;

    /** Map a value to 0..1, where 1 is always "more intense" / "better". */
    const norm = (v: number | null): number | null => {
      if (v == null) return null;
      if (scale === "magnitude") return max > min ? (v - min) / (max - min) : 0.5;
      if (goal != null && goal > 0) {
        // Goal-relative, over a +/-100% window. The window has to be wide
        // enough that ordinary over-performance does not saturate: at +/-50%
        // both a value 1.6x goal and one 2.2x goal pinned to the same band,
        // and because the bands run brightest-at-the-extreme, the LESS bad
        // cell then rendered darker than the worse one — it read as the more
        // severe of the two. Seen in the design lab; invisible to jsdom.
        const off = (v - goal) / goal / 2;
        const signed = lowerIsBetter ? -off : off;
        return Math.min(1, Math.max(0, 0.5 + signed));
      }
      if (max === min) return 0.5;
      const t = (v - min) / (max - min);
      return lowerIsBetter ? 1 - t : t;
    };
    return { at, norm, measured: values.length };
  }, [cells, scale, goal, lowerIsBetter]);

  if (measured === 0) return <ChartEmpty height={220} label={emptyLabel} />;

  const fillFor = (v: number | null) =>
    scale === "verdict" ? divergingFill(norm(v)) : magnitudeFill(norm(v), colorIndex);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      const r = Math.min(rows.length - 1, Math.max(0, focus.r + move[0]!));
      const c = Math.min(cols.length - 1, Math.max(0, focus.c + move[1]!));
      setFocus({ r, c });
      gridRef.current?.querySelector<HTMLElement>(`[data-rc="${r}-${c}"]`)?.focus();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const cell = at.get(`${rows[focus.r]}\u0000${cols[focus.c]}`);
      if (cell) onSelect?.(cell);
    }
  };

  const template = `minmax(84px, 132px) repeat(${cols.length}, minmax(64px, 1fr))`;

  return (
    <div className="w-full">
      {/* min-w-0 is what lets overflow-x-auto actually clip: inside a flex or
          grid parent a scroll container sizes to its content by default and
          pushes the whole page sideways instead of scrolling itself. */}
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <div className="min-w-fit">
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: template }}>
            <span className={`${HEADING.h4} self-end`}>{rowHeaderLabel}</span>
            {cols.map((c) => (
              <span key={c} className={`${HEADING.h4} text-center truncate`} title={c}>
                {c}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={`${measureLabel} by ${rowHeaderLabel || "row"} and column`}
            onKeyDown={onKeyDown}
            className="flex flex-col gap-1"
          >
            {rows.map((r, ri) => (
              <div key={r} role="row" className="grid gap-1" style={{ gridTemplateColumns: template }}>
                <span className="text-caption text-muted-foreground self-center truncate pr-1" title={r}>
                  {r}
                </span>
                {cols.map((c, ci) => {
                  const cell = at.get(`${r}\u0000${c}`);
                  const v = cell?.value ?? null;
                  const isGap = v == null;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="gridcell"
                      data-rc={`${ri}-${ci}`}
                      tabIndex={ri === focus.r && ci === focus.c ? 0 : -1}
                      onFocus={() => setFocus({ r: ri, c: ci })}
                      onClick={() => cell && onSelect?.(cell)}
                      disabled={!cell || !onSelect}
                      aria-label={
                        `${r}, ${c}: ` +
                        (isGap ? `${measureLabel} not measured` : `${measureLabel} ${format(v)}`)
                      }
                      title={isGap ? "Not measured for this intersection" : cell?.hint}
                      className="h-14 rounded-lg px-1.5 flex flex-col items-center justify-center gap-0.5
                                 enabled:hover:ring-1 enabled:hover:ring-ring/50 enabled:active:scale-[0.96]
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                                 transition-[box-shadow,scale] duration-150 ease-[var(--mx-ease)]"
                      style={isGap ? { backgroundImage: GAP_HATCH } : { background: fillFor(v) }}
                    >
                      <span
                        className={`text-caption tabular-nums ${
                          isGap ? "text-muted-foreground/75" : "text-foreground font-medium"
                        }`}
                      >
                        {isGap ? "–" : format(v)}
                      </span>
                      {cell?.sub && !isGap && (
                        <span className="text-micro text-foreground truncate max-w-full">
                          {cell.sub}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend, derived from the same function that paints the cells. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
        <span className="text-label">{measureLabel}</span>
        {scale === "verdict" ? (
          // The hatch below is the one "Not measured" entry; the diverging
          // ramp's grey swatch of the same name would list it twice.
          divergingLegend().filter((l) => l.label !== "Not measured").map((l, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="w-4 h-3 rounded-sm" style={{ background: l.fill }} />
              {l.label && <span className="text-caption text-muted-foreground">{l.label}</span>}
            </span>
          ))
        ) : (
          <>
            <span className="text-caption text-muted-foreground">Less</span>
            {magnitudeLegend(colorIndex).map((f, i) => (
              <span key={i} className="w-4 h-3 rounded-sm border border-border/25" style={{ background: f }} />
            ))}
            <span className="text-caption text-muted-foreground">More</span>
          </>
        )}
        <span className="flex items-center gap-1">
          <span className="w-4 h-3 rounded-sm" style={{ backgroundImage: GAP_HATCH }} />
          <span className="text-caption text-muted-foreground">Not measured</span>
        </span>
        {scale === "verdict" && goal != null && (
          <span className="text-caption text-muted-foreground/80 tabular-nums">Goal {format(goal)}</span>
        )}
      </div>
    </div>
  );
}
