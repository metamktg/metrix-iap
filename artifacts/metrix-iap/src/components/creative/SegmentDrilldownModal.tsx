// ─── Age × gender segment drill-down ──────────────────────────────────
// Opened by clicking a specific avatar segment (e.g. "Women 25-34").
// Shows, for that segment only: a configurable metric tile row (backed
// by real demographic-row totals — unavailable metrics render disabled
// with an explanation, never fabricated), the ranked IAP concepts / ad
// copy driving the segment, and the ranked creative variables with
// per-segment performance. Variables always render their human-readable
// IAP descriptor; the raw code lives only in the hover tooltip.

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2, Check, ChevronUp, ChevronDown, RotateCcw, Info, AlertTriangle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getMST } from "@/lib/data/metrixSeedAdapter";
import {
  computeSegmentDrilldown,
  segmentLabel,
  type SegmentId,
  type SegmentRawTotals,
  type SegmentDerivedMetrics,
  type SegmentVariableAttribution,
} from "@/lib/segment-analytics";
import {
  buildSegmentMetricCatalog,
  segmentMetricById,
  MAX_VISIBLE_SEGMENT_METRICS,
  type SegmentMetricDef,
} from "@/lib/data/segmentMetricsCatalog";
import { useSegmentMetricSelection } from "@/hooks/useSegmentMetricSelection";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { fmtUSD, fmtNum, fmtPct } from "@/pages/metrix/shared";
import type { AnalysisData } from "@/lib/data/seedTypes";

// ─── Metric picker (segment-scoped, capped) ───────────────────────────

function SegmentMetricPicker({
  catalog,
  selected,
  atCap,
  onToggle,
  onMove,
  onReset,
}: {
  catalog: SegmentMetricDef[];
  selected: string[];
  atCap: boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReset: () => void;
}) {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-[11px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors" data-testid="button-segment-metric-picker">
          <Settings2 className="w-3 h-3" />
          Customize metrics
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
            Segment metrics · max {MAX_VISIBLE_SEGMENT_METRICS}
          </span>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
        </div>

        {selected.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1">Selected order</p>
            {selected.map((id, i) => {
              const m = byId.get(id);
              if (!m) return null;
              return (
                <div key={id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-primary/[0.05] border border-primary/15">
                  <span className="text-[11px] text-foreground/85 flex-1 min-w-0 truncate">{m.label}</span>
                  <button
                    disabled={i === 0}
                    onClick={() => onMove(id, -1)}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/60"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    disabled={i === selected.length - 1}
                    onClick={() => onMove(id, 1)}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/60"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {atCap && (
              <p className="text-[9px] text-amber-300/80 pt-0.5">
                Maximum of {MAX_VISIBLE_SEGMENT_METRICS} metrics — remove one to add another.
              </p>
            )}
          </div>
        )}

        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1">All metrics</p>
        <div className="space-y-0.5">
          {catalog.map((m) => {
            const on = selected.includes(m.id);
            const disabled = m.availability === "unavailable";
            const capBlocked = !on && atCap;
            return (
              <button
                key={m.id}
                onClick={() => !disabled && !capBlocked && onToggle(m.id)}
                disabled={disabled || capBlocked}
                title={disabled ? m.unavailableReason : capBlocked ? `Maximum of ${MAX_VISIBLE_SEGMENT_METRICS} metrics reached` : undefined}
                data-testid={`picker-segment-metric-${m.id}`}
                className={cn(
                  "w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left transition-colors",
                  disabled ? "opacity-45 cursor-not-allowed" : capBlocked ? "opacity-60 cursor-not-allowed" : on ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    on ? "border-primary/50 bg-primary/20" : "border-border/40"
                  )}
                >
                  {on && <Check className="w-2.5 h-2.5 text-primary" />}
                  {disabled && !on && <Ban className="w-2.5 h-2.5 text-muted-foreground/50" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-foreground/85 truncate">{m.label}</span>
                  {disabled && (
                    <span className="block text-[9px] text-muted-foreground/55 leading-snug">{m.unavailableReason}</span>
                  )}
                </span>
                {!disabled && <span className="text-[10px] text-muted-foreground/50 tabular-nums">{m.formatted}</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Variable chip with descriptor + tooltip (code + segment perf) ────

function perfSummary(totals: SegmentRawTotals, derived: SegmentDerivedMetrics): string[] {
  const parts: string[] = [];
  if (totals.spend != null) parts.push(`Spend ${fmtUSD(totals.spend, 0)}`);
  if (totals.results != null) parts.push(`Results ${fmtNum(totals.results)}`);
  if (derived.cpa != null) parts.push(`CPA ${fmtUSD(derived.cpa)}`);
  if (derived.ctr != null) parts.push(`CTR ${fmtPct(derived.ctr)}`);
  return parts;
}

function VariableChip({ v }: { v: SegmentVariableAttribution }) {
  const prefix = getVariablePrefix(v.code);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center text-[10px] font-medium border px-1.5 py-0.5 rounded cursor-default", PREFIX_COLORS[prefix])}
          data-testid={`chip-segment-variable-${v.code}`}
        >
          {resolveVariableLabel(v.code)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        <p className="font-mono text-[10px] text-muted-foreground">{v.code}</p>
        <p className="text-[10px] mt-0.5">{perfSummary(v.totals, v.derived).join(" · ") || "No measurable performance in this segment"}</p>
        <p className="text-[9px] text-muted-foreground mt-0.5">In {v.cellIds.length} concept{v.cellIds.length === 1 ? "" : "s"} this segment saw</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────

export function SegmentDrilldownModal({
  open,
  onClose,
  segment,
  analysis,
  /** Scope to these creative cells; null = whole account. */
  cellIds,
  kicker = "Segment drill-down",
}: {
  open: boolean;
  onClose: () => void;
  segment: SegmentId | null;
  analysis: AnalysisData;
  cellIds: string[] | null;
  kicker?: string;
}) {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const mst = getMST(seed, adAccountId);

  const data = useMemo(
    () => (segment ? computeSegmentDrilldown(analysis, mst, segment, cellIds) : null),
    [analysis, mst, segment, cellIds]
  );
  const catalog = useMemo(
    () => (data ? buildSegmentMetricCatalog(data.totals, data.derived) : []),
    [data]
  );
  const { selected, toggle, move, reset, atCap } = useSegmentMetricSelection();

  if (!segment || !data) return null;
  const label = segmentLabel(segment);
  const hasRows = data.totals.rowCount > 0;
  const topVariables = data.attribution.variables.slice(0, 12);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-[hsl(222_61%_6%)] border-border/50 max-h-[85vh] overflow-y-auto">
        <TooltipProvider delayDuration={150}>
          <DialogHeader className="text-left space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">{kicker}</div>
            <DialogTitle className="text-[15px] font-semibold text-foreground" data-testid="title-segment-drilldown">
              {label} — what's driving results
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Every number below is computed from this segment's own demographic rows
              {cellIds ? ` (scoped to ${cellIds.join(", ")})` : ""}. Metrics the export can't support show as
              unavailable — never estimated.
            </DialogDescription>
          </DialogHeader>

          {!hasRows ? (
            <div className="py-10 text-center space-y-1">
              <p className="text-[12px] font-medium text-foreground/60">No demographic rows for {label}</p>
              <p className="text-[11px] text-muted-foreground/60">This segment doesn't appear in the current selection.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.signal.low && (
                <div className="flex items-start gap-2 text-[11px] text-amber-200/90 leading-relaxed rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3" data-testid="banner-low-signal">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                  <span>
                    <span className="font-semibold">Low signal.</span>{" "}
                    {data.signal.reasons.join(" ")} Read these numbers as directional, not conclusive.
                  </span>
                </div>
              )}

              {/* Metric tiles */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                    Segment metrics
                  </p>
                  <SegmentMetricPicker
                    catalog={catalog}
                    selected={selected}
                    atCap={atCap}
                    onToggle={toggle}
                    onMove={move}
                    onReset={reset}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {selected.map((id) => {
                    const m = segmentMetricById(catalog, id);
                    if (!m) return null;
                    const unavailable = m.availability === "unavailable";
                    return (
                      <div
                        key={id}
                        className={cn(
                          "rounded-lg border p-2.5",
                          unavailable ? "border-border/30 bg-white/[0.01]" : "border-border/40 bg-white/[0.02]"
                        )}
                        data-testid={`tile-segment-metric-${id}`}
                      >
                        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{m.label}</div>
                        <div className={cn("text-[16px] font-bold tabular-nums leading-tight mt-0.5", unavailable ? "text-muted-foreground/40" : "text-foreground")}>
                          {m.formatted}
                        </div>
                        {unavailable && (
                          <div className="text-[8.5px] text-muted-foreground/55 leading-snug mt-0.5">{m.unavailableReason}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Driving concepts + copy */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  IAP concepts driving this segment
                </p>
                {!data.attribution.available ? (
                  <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed rounded-lg border border-border/30 bg-white/[0.02] p-3" data-testid="note-attribution-unavailable">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{data.attribution.unavailableReason}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    {data.attribution.cells.map((c) => (
                      <div key={c.cellId} className="px-3 py-2.5 border-b border-border/20 last:border-b-0" data-testid={`row-segment-concept-${c.cellId}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-foreground truncate">{c.conceptName ?? c.cellId}</div>
                            <div className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">{c.cellId}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] font-semibold text-foreground tabular-nums">
                              {c.totals.results != null ? `${fmtNum(c.totals.results)} results` : "—"}
                            </div>
                            <div className="text-[9px] text-muted-foreground/60">
                              {c.totals.spend != null ? fmtUSD(c.totals.spend, 0) : "—"}
                              {c.derived.cpa != null ? ` · ${fmtUSD(c.derived.cpa)} CPA` : ""}
                              {c.derived.ctr != null ? ` · ${fmtPct(c.derived.ctr)} CTR` : ""}
                            </div>
                          </div>
                        </div>
                        {c.copy?.primary && (
                          <p className="text-[10.5px] text-foreground/70 leading-relaxed mt-1.5 line-clamp-2">
                            “{c.copy.primary}”
                            {c.copy.cta ? <span className="text-muted-foreground/60"> · CTA: {c.copy.cta}</span> : null}
                          </p>
                        )}
                        {c.variableCodes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {c.variableCodes.map((code) => {
                              const v = data.attribution.variables.find((x) => x.code === code);
                              return v ? <VariableChip key={code} v={v} /> : null;
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ranked variables */}
              {data.attribution.available && topVariables.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                    Creative variables ranked in this segment
                  </p>
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    {topVariables.map((v, i) => (
                      <div key={v.code} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0" data-testid={`row-segment-variable-${v.code}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[9px] font-mono text-muted-foreground/50 w-4 shrink-0">{i + 1}</span>
                          <VariableChip v={v} />
                        </div>
                        <div className="shrink-0 text-right text-[9px] text-muted-foreground/60 tabular-nums">
                          {perfSummary(v.totals, v.derived).join(" · ") || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 text-[10px] text-muted-foreground/60 leading-relaxed">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  Concepts and variables join this segment's demographic rows to their creative cells and variable
                  stacks. Hover a variable for its underlying code and per-segment performance.
                </span>
              </div>
            </div>
          )}
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
