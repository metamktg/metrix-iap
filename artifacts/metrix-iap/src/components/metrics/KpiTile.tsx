// ─── Unified KPI tile ──────────────────────────────────────────────────
// The single platform-wide KPI tile: label + chevron metric dropdown,
// value, optional info-hover disclosure, optional onClick drill-down.
// Consolidates ManagerOverview's MetricSelectTile and shared's static
// MetricTile so every view gets the same look and the metric-selection
// dropdown everywhere. Tiles show label + value ONLY — verbose sub-text
// lives behind the small ⓘ hover, never inline (disclosure rulebook).
//
// Styling is composed strictly from Command Deck / app tokens already in
// use (mx-kpi-tile, TYPE, text-bignum, border-primary, …) — no new styles.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronDown, Info } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/command-deck/components/ui/tooltip";
import { TYPE } from "@/pages/metrix/typography";
import { metricById, type MetricDef } from "@/lib/data/metricsCatalog";
import { useKpiTileMetrics } from "@/hooks/useKpiTileMetrics";

// ─── Metric dropdown (categorised, value-annotated) ───────────────────

interface KpiMetricDropdownProps {
  catalog: MetricDef[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The trigger button, used to place the portalled menu under its tile. */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function KpiMetricDropdown({ catalog, activeId, onSelect, onClose, anchorRef }: KpiMetricDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Anchor to the trigger in VIEWPORT coordinates. The dropdown is rendered
  // through a portal (see below), so it has no positioned ancestor to lay
  // itself out against — position: fixed plus the trigger's own rect is the
  // only thing that keeps it under its tile.
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 224; // w-56
    // Keep it on screen when a tile sits near the right edge.
    const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    // A fixed-position menu cannot follow the page, so close rather than
    // drift away from the tile it belongs to.
    const dismiss = () => onClose();
    // micro-delay so the click that opened the dropdown doesn't immediately close it
    const tid = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose, anchorRef]);

  const staticMetrics = catalog.filter((m) => !m.isResultEvent);
  const eventMetrics = catalog.filter((m) => m.isResultEvent);

  const Row = ({ m }: { m: MetricDef }) => (
    <button
      key={m.id}
      type="button"
      onClick={() => onSelect(m.id)}
      className={cn(
        "w-full text-left px-3 py-1.5 flex items-center justify-between gap-3 transition-colors",
        m.id === activeId
          ? "bg-primary/10 text-interactive"
          : "text-foreground/75 hover:bg-white/[0.05]",
      )}
    >
      <span className="text-caption truncate">{m.label}</span>
      <span className="text-caption font-mono tabular-nums text-muted-foreground/55 shrink-0">
        {m.value != null ? m.formatted : "—"}
      </span>
    </button>
  );

  // PORTALLED ON PURPOSE. .mx-kpi-tile sets `overflow: hidden` (index.css),
  // and this menu is positioned below the tile's bottom edge — so as an
  // in-flow absolute child it was clipped away entirely, on every KPI tile
  // in the product. z-50 does nothing against an overflow-hidden ancestor.
  // The metric picker is the whole point of the customizable tile rows, and
  // it was invisible everywhere. Rendering into document.body is what takes
  // it out of that clipping context; nothing else does.
  const menu = (
    <div
      ref={ref}
      data-testid="kpi-metric-dropdown"
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
      className="z-50 w-56 rounded-lg border border-border/60 bg-[hsl(var(--surface-raised))] shadow-2xl py-1 overflow-hidden"
    >
      <div className="px-2.5 py-1 text-micro font-mono uppercase tracking-widest text-muted-foreground/45">
        Delivery & efficiency
      </div>
      {staticMetrics.map((m) => <Row key={m.id} m={m} />)}

      {eventMetrics.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-border/20" />
          <div className="px-2.5 py-1 text-micro font-mono uppercase tracking-widest text-muted-foreground/45">
            Results by event
          </div>
          {eventMetrics.map((m) => <Row key={m.id} m={m} />)}
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}

// ─── Info hover (disclosure slot) ──────────────────────────────────────

export function KpiInfoHover({ content }: { content: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Metric details"
            data-testid="kpi-tile-info"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center shrink-0 text-muted-foreground/40 hover:text-muted-foreground/75 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-left leading-relaxed text-caption whitespace-normal">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Unified tile ──────────────────────────────────────────────────────

export interface KpiTileTrend {
  /** Percent change vs the preceding equal-length window (real measured values). */
  deltaPct: number;
  /** True when the movement is an improvement (cost metrics improve downward). */
  improved: boolean;
  /** The prior window's formatted value ("prior $1,204"). */
  priorFormatted: string;
}

/**
 * What a null on this tile means, when the metric carries no note of its
 * own. Deliberately says which of the two cases it is — the catalog omits
 * metrics it cannot compute at all (`hideWhenNull`), so a null that
 * survives to a rendered tile is an absence of measurement, not an absence
 * of definition.
 */
function unavailableNote(m: MetricDef): string {
  return m.isResultEvent
    ? "No rows in the current selection carry this result event, so there is nothing to total. This is an absence of data, not a value of zero."
    : "Not measured in the current selection — no row carries this field over the active scope. This is an absence of data, not a value of zero.";
}

export interface KpiTileProps {
  metricId: string;
  catalog: MetricDef[];
  onSelect: (id: string) => void;
  /** Optional drill-down (diagnostic modal / future breakdown modal). */
  onClick?: () => void;
  isRefetching?: boolean;
  /** Extra disclosure content shown in the ⓘ hover, above the metric's own sub-note. */
  disclosure?: React.ReactNode;
  /** Suppress the built-in ⓘ (when a wrapper like MetricHoverPopover renders its own). */
  hideInfo?: boolean;
  variant?: "primary" | "default";
  /** Nocturne trend layer: delta vs the preceding window — omitted when no real prior exists. */
  trend?: KpiTileTrend | null;
  /** Nocturne sparkline: SVG polyline points for a 100×24 viewBox — omitted when no per-day series exists. */
  sparkPoints?: string | null;
}

export function KpiTile({
  metricId, catalog, onSelect, onClick, isRefetching = false,
  disclosure, hideInfo = false, variant = "default", trend, sparkPoints,
}: KpiTileProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const m = metricById(catalog, metricId);
  if (!m) return null;

  // C4: the ⓘ used to appear only when a metric carried `sub` or a caller
  // passed `disclosure`, so the six base hero metrics — spend, impressions,
  // reach, clicks, link clicks, link CTR — rendered a bare "—" with no way
  // to ask why. Those are the highest-visibility numbers on the platform,
  // and a dash the reader cannot interrogate is exactly the ambiguity the
  // honest-null convention exists to remove. A null value now always has
  // something behind the ⓘ: the metric's own note when it has one, and
  // otherwise a statement of what null means here.
  const nullNote = m.value == null ? unavailableNote(m) : null;
  const infoContent = disclosure || m.sub || nullNote
    ? (
      <div className="space-y-1">
        {disclosure}
        {m.sub && <div className="text-muted-foreground/80">{m.sub}</div>}
        {!m.sub && nullNote && <div className="text-muted-foreground/80">{nullNote}</div>}
      </div>
    )
    : null;

  const isPrimary = variant === "primary";

  return (
    <div
      data-testid="kpi-tile"
      className={cn(
        "mx-kpi-tile p-4 relative flex flex-col gap-1",
        isPrimary && "border-primary/35 bg-primary/[0.03]",
      )}
    >
      {isPrimary && <div data-testid="metric-tile-primary-accent" className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />}

      {/* Label row: dropdown trigger + drill affordance + optional info hover */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
          className="flex items-center gap-1 group/lbl text-left min-w-0"
        >
          {/* Nocturne card-kicker: accent-tinted uppercase label */}
          <span className={cn(
            TYPE.label,
            "font-semibold uppercase tracking-[0.14em] truncate transition-colors",
            pickerOpen ? "text-interactive" : "text-interactive/75 group-hover/lbl:text-interactive",
          )}>
            {m.label}
          </span>
          <ChevronDown className={cn(
            "w-2.5 h-2.5 shrink-0 transition-[color,background-color,border-color,box-shadow,opacity,transform]",
            pickerOpen ? "rotate-180 text-interactive" : "text-muted-foreground/35 group-hover/lbl:text-muted-foreground/65",
          )} />
        </button>
        <span className="flex items-center gap-1.5 shrink-0">
          {/* Nocturne drill glyph — signals the tile opens a deep dive */}
          {onClick && (
            <ArrowUpRight aria-hidden="true" className="w-3 h-3 text-interactive/60" data-testid="kpi-tile-drill-glyph" />
          )}
          {!hideInfo && infoContent && <KpiInfoHover content={infoContent} />}
        </span>
      </div>

      {/* Value — label + value only; no inline sub-text */}
      {onClick ? (
        <button type="button" data-testid="kpi-tile-body" onClick={onClick} className="text-left hover:opacity-75 transition-opacity w-fit">
          <KpiValue formatted={m.formatted} isRefetching={isRefetching} />
        </button>
      ) : (
        <KpiValue formatted={m.formatted} isRefetching={isRefetching} />
      )}

      {/* Nocturne trend layer — delta vs the preceding window + prior value.
          Rendered only from real measured values (props absent otherwise). */}
      {!isRefetching && trend && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="kpi-tile-trend">
          <span className={cn(
            TYPE.body,
            "tabular-nums font-medium",
            trend.improved ? "text-emerald-400" : "text-amber-300",
          )}>
            {trend.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(trend.deltaPct).toFixed(1)}%
          </span>
          <span className={cn(TYPE.caption, "text-muted-foreground/50 tabular-nums")}>
            prior {trend.priorFormatted}
          </span>
        </div>
      )}

      {/* Nocturne sparkline — per-day series inside the active window. */}
      {!isRefetching && sparkPoints && (
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="kpi-tile-spark"
          className="w-full h-6 mt-1 overflow-visible"
        >
          <polyline
            points={sparkPoints}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {pickerOpen && (
        <KpiMetricDropdown
          anchorRef={triggerRef}
          catalog={catalog}
          activeId={metricId}
          onSelect={(id) => { onSelect(id); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Tile row with per-view persistence ────────────────────────────────
// Renders `tileCount` unified tiles as a fragment (drop inside any grid).
// Owns the useKpiTileMetrics hook so views whose tiles live inside render
// callbacks (ModuleScopeGate) still get persisted per-view selections.

export function KpiTileRow({
  viewKey, catalog, tileCount = 4, primaryFirst = true,
  isRefetching = false, disclosures, onTileClick, trendFor,
}: {
  viewKey: string;
  catalog: MetricDef[];
  tileCount?: number;
  /** Render the first slot with the primary accent (matches old MetricTile rows). */
  primaryFirst?: boolean;
  isRefetching?: boolean;
  /** Extra ⓘ-hover disclosure content per metric id. */
  disclosures?: Record<string, React.ReactNode>;
  onTileClick?: (metricId: string) => void;
  /** Nocturne trend layer lookup (e.g. a "vs prior" header toggle) — omit for tiles with no trend. */
  trendFor?: (metricId: string) => { trend: KpiTileTrend | null; spark: string | null };
}) {
  const availableIds = useMemo(() => catalog.map((m) => m.id), [catalog]);
  const { tileMetricIds, setTileMetric } = useKpiTileMetrics(viewKey, availableIds, { tileCount });
  return (
    <>
      {tileMetricIds.map((metricId, slotIdx) => {
        const { trend, spark } = trendFor?.(metricId) ?? { trend: null, spark: null };
        return (
          <KpiTile
            key={slotIdx}
            metricId={metricId}
            catalog={catalog}
            isRefetching={isRefetching}
            variant={primaryFirst && slotIdx === 0 ? "primary" : "default"}
            onSelect={(id) => setTileMetric(slotIdx, id)}
            onClick={onTileClick ? () => onTileClick(metricId) : undefined}
            disclosure={disclosures?.[metricId]}
            trend={trend}
            sparkPoints={spark}
          />
        );
      })}
    </>
  );
}

function KpiValue({ formatted, isRefetching }: { formatted: string; isRefetching: boolean }) {
  // Nocturne stat treatment: heading-family weight (500) rather than the
  // previous extrabold — the canvas's calmer hero-tile number.
  //
  // While refetching this rendered the SAME "—" glyph a null value renders,
  // only fainter, so "still loading" and "this number does not exist" were
  // the same picture — the reader cannot tell a slow request from data loss,
  // and the honest-null convention loses its meaning if loading borrows the
  // glyph. A pulsing bar is unmistakably an in-flight state, and aria-busy
  // says so to assistive tech; the dash now means exactly one thing.
  return isRefetching ? (
    <span
      className="inline-block h-[1em] w-[3.5ch] rounded bg-white/[0.08] animate-pulse align-middle"
      aria-busy="true"
      aria-label="Loading"
      data-testid="kpi-value-loading"
    />
  ) : (
    <span className="text-bignum font-medium text-foreground metric-num leading-none tracking-[-0.02em]">
      {formatted}
    </span>
  );
}
