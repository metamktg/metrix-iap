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

import { useEffect, useMemo, useRef, useState } from "react";
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
}

function KpiMetricDropdown({ catalog, activeId, onSelect, onClose }: KpiMetricDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // micro-delay so the click that opened the dropdown doesn't immediately close it
    const tid = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(tid); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

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

  return (
    <div
      ref={ref}
      data-testid="kpi-metric-dropdown"
      className="absolute top-full left-0 mt-1 z-50 w-56 rounded-lg border border-border/60 bg-[hsl(var(--surface-raised))] shadow-2xl py-1 overflow-hidden"
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
  const m = metricById(catalog, metricId);
  if (!m) return null;

  const infoContent = disclosure || m.sub
    ? (
      <div className="space-y-1">
        {disclosure}
        {m.sub && <div className="text-muted-foreground/80">{m.sub}</div>}
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
            "w-2.5 h-2.5 shrink-0 transition-all",
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
  isRefetching = false, disclosures, onTileClick,
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
}) {
  const availableIds = useMemo(() => catalog.map((m) => m.id), [catalog]);
  const { tileMetricIds, setTileMetric } = useKpiTileMetrics(viewKey, availableIds, { tileCount });
  return (
    <>
      {tileMetricIds.map((metricId, slotIdx) => (
        <KpiTile
          key={slotIdx}
          metricId={metricId}
          catalog={catalog}
          isRefetching={isRefetching}
          variant={primaryFirst && slotIdx === 0 ? "primary" : "default"}
          onSelect={(id) => setTileMetric(slotIdx, id)}
          onClick={onTileClick ? () => onTileClick(metricId) : undefined}
          disclosure={disclosures?.[metricId]}
        />
      ))}
    </>
  );
}

function KpiValue({ formatted, isRefetching }: { formatted: string; isRefetching: boolean }) {
  // Nocturne stat treatment: heading-family weight (500) rather than the
  // previous extrabold — the canvas's calmer hero-tile number.
  return isRefetching ? (
    <span className="text-bignum font-medium text-muted-foreground/20 metric-num leading-none">—</span>
  ) : (
    <span className="text-bignum font-medium text-foreground metric-num leading-none tracking-[-0.02em]">
      {formatted}
    </span>
  );
}
