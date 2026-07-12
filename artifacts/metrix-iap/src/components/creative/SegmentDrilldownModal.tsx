// ─── Age × gender segment drill-down ──────────────────────────────────
// Opened by clicking a specific avatar segment (e.g. "Women 25-34").
// Shows, for that segment only: a configurable metric tile row (backed
// by real demographic-row totals — unavailable metrics render disabled
// with an explanation, never fabricated), the ranked IAP concepts / ad
// copy driving the segment, and the ranked creative variables with
// per-segment performance. Variables always render their human-readable
// IAP descriptor; the raw code lives only in the hover tooltip.

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2, Check, ChevronUp, ChevronDown, RotateCcw, Info, AlertTriangle, Ban, GitCompareArrows, X, ArrowLeftRight, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getMST } from "@/lib/data/metrixSeedAdapter";
import {
  computeSegmentDrilldown,
  scopeDemographicRows,
  listSegments,
  segmentKey,
  segmentLabel,
  type SegmentId,
  type SegmentRawTotals,
  type SegmentDerivedMetrics,
  type SegmentVariableAttribution,
  type SegmentDrilldownData,
} from "@/lib/segment-analytics";
import {
  buildSegmentMetricCatalog,
  segmentMetricById,
  MAX_VISIBLE_SEGMENT_METRICS,
  type SegmentMetricDef,
  type SegmentMetricDirection,
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

// ─── Compare-segment picker ───────────────────────────────────────────

function CompareSegmentPicker({
  candidates,
  onPick,
}: {
  candidates: SegmentId[];
  onPick: (seg: SegmentId) => void;
}) {
  const [open, setOpen] = useState(false);
  if (candidates.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-primary/25 bg-primary/[0.06] text-[11px] font-medium text-primary/85 hover:text-primary hover:bg-primary/10 transition-colors"
          data-testid="button-segment-compare"
        >
          <GitCompareArrows className="w-3 h-3" />
          Compare with…
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 max-h-[320px] overflow-y-auto">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1.5">
          Compare against (ordered by spend)
        </p>
        <div className="space-y-0.5">
          {candidates.map((seg) => (
            <button
              key={segmentKey(seg)}
              onClick={() => {
                onPick(seg);
                setOpen(false);
              }}
              className="w-full text-left px-1.5 py-1.5 rounded-md text-[11px] text-foreground/85 hover:bg-white/[0.04] transition-colors"
              data-testid={`picker-compare-segment-${segmentKey(seg)}`}
            >
              {segmentLabel(seg)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Side-by-side comparison view ─────────────────────────────────────

function CompareLowSignalBanner({ data, label }: { data: SegmentDrilldownData; label: string }) {
  if (!data.signal.low) return null;
  return (
    <div
      className="flex items-start gap-2 text-[10.5px] text-amber-200/90 leading-relaxed rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5"
      data-testid={`banner-low-signal-${segmentKey(data.segment)}`}
    >
      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-300" />
      <span>
        <span className="font-semibold">{label}: low signal.</span> {data.signal.reasons.join(" ")}
      </span>
    </div>
  );
}

// ─── Winner computation ────────────────────────────────────────────────

type WinnerSide = "a" | "b" | "tie" | null;

interface WinnerInfo {
  side: WinnerSide;
  /** |a - b| / loser × 100 — always relative to the losing side. 0 for ties or zero-denominator. */
  pctDiff: number;
}

function computeMetricWinner(
  aMetric: SegmentMetricDef | null,
  bMetric: SegmentMetricDef | null,
): WinnerInfo | null {
  if (!aMetric || !bMetric) return null;
  if (aMetric.direction === "neutral") return null;
  if (aMetric.availability === "unavailable" || bMetric.availability === "unavailable") return null;
  const a = aMetric.value;
  const b = bMetric.value;
  if (a == null || b == null) return null;

  const absMax = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  if (Math.abs(a - b) / absMax < 1e-9) return { side: "tie", pctDiff: 0 };

  const side: "a" | "b" = aMetric.direction === "higher_better"
    ? (a > b ? "a" : "b")
    : (a < b ? "a" : "b");

  // pctDiff is relative to the loser's value so the tooltip is accurate:
  // "winner is X% better than loser" where loser is the denominator.
  const loserValue = side === "a" ? b : a;
  const pctDiff = loserValue !== 0 ? Math.abs((a - b) / loserValue) * 100 : 0;

  return { side, pctDiff };
}

function CompareMetricCell({
  catalog,
  id,
  isWinner,
}: {
  catalog: SegmentMetricDef[];
  id: string;
  isWinner?: boolean;
}) {
  const m = segmentMetricById(catalog, id);
  if (!m) return <span className="text-muted-foreground/40">—</span>;
  if (m.availability === "unavailable") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground/40 cursor-default">—</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <p className="text-[10px]">{m.unavailableReason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className={cn("font-semibold", isWinner ? "text-emerald-300" : "text-foreground")}>
      {m.formatted}
    </span>
  );
}

/** Compact badge shown in the Δ column: arrow direction + rounded % diff. */
function WinnerDiffBadge({
  winner,
  label,
  compareLabel,
  metricLabel,
  direction,
}: {
  winner: WinnerInfo;
  label: string;
  compareLabel: string;
  metricLabel: string;
  direction: SegmentMetricDirection;
}) {
  if (winner.side === "tie") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-[9px] font-mono text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/30 cursor-default tabular-nums">
            tie
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-[10px]">{label} and {compareLabel} are equal on {metricLabel}.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (winner.side === null) return <span className="text-muted-foreground/30">—</span>;

  const isAWins = winner.side === "a";
  const winnerLabel = isAWins ? label : compareLabel;
  const loserLabel = isAWins ? compareLabel : label;
  const pct = winner.pctDiff < 0.5 ? "<1" : Math.round(winner.pctDiff).toString();
  const dirWord = direction === "lower_better" ? "lower" : "higher";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border cursor-default tabular-nums",
            isAWins
              ? "text-emerald-300/90 border-emerald-500/25 bg-emerald-500/[0.07]"
              : "text-sky-300/90 border-sky-500/25 bg-sky-500/[0.07]",
          )}
          data-testid={`winner-badge-${isAWins ? "a" : "b"}`}
        >
          {isAWins ? <ArrowLeft className="w-2 h-2 shrink-0" /> : null}
          {pct}%
          {!isAWins ? <ArrowRight className="w-2 h-2 shrink-0" /> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <p className="text-[10px]">
          <span className="font-semibold">{winnerLabel}</span> {metricLabel} is{" "}
          <span className="font-semibold">{pct}% {dirWord}</span> than {loserLabel}.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function CompareAttributionColumn({ data, side }: { data: SegmentDrilldownData; side: "a" | "b" }) {
  const topVariables = data.attribution.variables.slice(0, 8);
  return (
    <div className="space-y-3 min-w-0" data-testid={`compare-column-${side}`}>
      {!data.attribution.available ? (
        <div className="flex items-start gap-2 text-[10.5px] text-muted-foreground/70 leading-relaxed rounded-lg border border-border/30 bg-white/[0.02] p-2.5">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{data.attribution.unavailableReason}</span>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">Top concepts</p>
            <div className="rounded-lg border border-border/40 overflow-hidden">
              {data.attribution.cells.slice(0, 5).map((c) => (
                <div
                  key={c.cellId}
                  className="px-2.5 py-2 border-b border-border/20 last:border-b-0"
                  data-testid={`row-compare-concept-${side}-${c.cellId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-medium text-foreground truncate">{c.conceptName ?? c.cellId}</div>
                      <div className="text-[8.5px] font-mono text-muted-foreground/60">{c.cellId}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10.5px] font-semibold text-foreground tabular-nums">
                        {c.totals.results != null ? `${fmtNum(c.totals.results)} res` : "—"}
                      </div>
                      <div className="text-[8.5px] text-muted-foreground/60">
                        {c.totals.spend != null ? fmtUSD(c.totals.spend, 0) : "—"}
                        {c.derived.cpa != null ? ` · ${fmtUSD(c.derived.cpa)} CPA` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {topVariables.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">Ranked variables</p>
              <div className="rounded-lg border border-border/40 overflow-hidden">
                {topVariables.map((v, i) => (
                  <div
                    key={v.code}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/20 last:border-b-0"
                    data-testid={`row-compare-variable-${side}-${v.code}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[8.5px] font-mono text-muted-foreground/50 w-3.5 shrink-0">{i + 1}</span>
                      <VariableChip v={v} />
                    </div>
                    <div className="shrink-0 text-right text-[8.5px] text-muted-foreground/60 tabular-nums">
                      {v.derived.cpa != null ? `${fmtUSD(v.derived.cpa)} CPA` : v.totals.spend != null ? fmtUSD(v.totals.spend, 0) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sortable compare metric table ────────────────────────────────────

type CompareSortKey = "metric" | "a" | "b";
type CompareSortDir = "asc" | "desc";

function CompareSortTh({
  children, sortKey, current, dir, onSort, align = "right",
}: {
  children: React.ReactNode;
  sortKey: CompareSortKey;
  current: CompareSortKey | null;
  dir: CompareSortDir;
  onSort: (k: CompareSortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <th
      className={cn(
        "text-[9px] font-mono uppercase tracking-widest font-semibold px-3 py-2 cursor-pointer select-none group",
        "hover:text-foreground transition-colors",
        align === "right" ? "text-right" : "text-left",
        active ? "text-foreground/80" : "text-muted-foreground/60",
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {align === "left" && (active ? (
          dir === "asc" ? <ArrowUp className="w-2.5 h-2.5 text-primary/70" /> : <ArrowDown className="w-2.5 h-2.5 text-primary/70" />
        ) : (
          <ArrowDown className="w-2.5 h-2.5 opacity-0 group-hover:opacity-30 transition-opacity" />
        ))}
        {children}
        {align === "right" && (active ? (
          dir === "asc" ? <ArrowUp className="w-2.5 h-2.5 text-primary/70" /> : <ArrowDown className="w-2.5 h-2.5 text-primary/70" />
        ) : (
          <ArrowDown className="w-2.5 h-2.5 opacity-0 group-hover:opacity-30 transition-opacity" />
        ))}
      </span>
    </th>
  );
}

function CompareMetricTable({
  selected, catalog, compareCatalog, label, compareLabel,
  onToggle, onMove, onReset, atCap,
}: {
  selected: string[];
  catalog: SegmentMetricDef[];
  compareCatalog: SegmentMetricDef[];
  label: string;
  compareLabel: string;
  onToggle: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReset: () => void;
  atCap: boolean;
}) {
  const [sortKey, setSortKey] = useState<CompareSortKey | null>(null);
  const [sortDir, setSortDir] = useState<CompareSortDir>("desc");

  const handleSort = (k: CompareSortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const sortedSelected = useMemo(() => {
    if (!sortKey) return selected;
    return [...selected].sort((aId, bId) => {
      let cmp = 0;
      if (sortKey === "metric") {
        const ma = segmentMetricById(catalog, aId)?.label ?? "";
        const mb = segmentMetricById(catalog, bId)?.label ?? "";
        cmp = ma.localeCompare(mb);
      } else {
        const src = sortKey === "a" ? catalog : compareCatalog;
        const va = segmentMetricById(src, aId)?.value ?? null;
        const vb = segmentMetricById(src, bId)?.value ?? null;
        if (va == null && vb == null) cmp = 0;
        else if (va == null) cmp = 1;
        else if (vb == null) cmp = -1;
        else cmp = va - vb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [selected, sortKey, sortDir, catalog, compareCatalog]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
          Segment metrics, side by side
        </p>
        <SegmentMetricPicker
          catalog={catalog}
          selected={selected}
          atCap={atCap}
          onToggle={onToggle}
          onMove={onMove}
          onReset={onReset}
        />
      </div>
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/40 bg-white/[0.02]">
              <CompareSortTh sortKey="metric" current={sortKey} dir={sortDir} onSort={handleSort} align="left">
                Metric
              </CompareSortTh>
              <CompareSortTh sortKey="a" current={sortKey} dir={sortDir} onSort={handleSort}>
                <span className="text-primary/70 normal-case">{label}</span>
              </CompareSortTh>
              <th className="text-[9px] font-mono uppercase tracking-widest font-semibold px-2 py-2 text-center text-muted-foreground/40 w-[64px]">
                Δ
              </th>
              <CompareSortTh sortKey="b" current={sortKey} dir={sortDir} onSort={handleSort}>
                <span className="text-muted-foreground/70 normal-case">{compareLabel}</span>
              </CompareSortTh>
            </tr>
          </thead>
          <tbody>
            {sortedSelected.map((id) => {
              const m = segmentMetricById(catalog, id);
              if (!m) return null;
              const bMetric = segmentMetricById(compareCatalog, id);
              const winner = computeMetricWinner(m, bMetric);
              const aWins = winner?.side === "a";
              const bWins = winner?.side === "b";
              return (
                <tr key={id} className="border-b border-border/20 last:border-b-0" data-testid={`row-compare-metric-${id}`}>
                  <td className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                    {m.label}
                  </td>
                  <td className={cn("px-3 py-2 text-right text-[13px] tabular-nums", aWins && "bg-emerald-500/[0.04]")} data-testid={`cell-compare-metric-${id}-a`}>
                    <CompareMetricCell catalog={catalog} id={id} isWinner={aWins} />
                  </td>
                  <td className="px-2 py-2 text-center w-[64px]" data-testid={`cell-compare-diff-${id}`}>
                    {winner && winner.side !== null ? (
                      <WinnerDiffBadge
                        winner={winner}
                        label={label}
                        compareLabel={compareLabel}
                        metricLabel={m.label}
                        direction={m.direction}
                      />
                    ) : (
                      <span className="text-[9px] text-muted-foreground/25">—</span>
                    )}
                  </td>
                  <td className={cn("px-3 py-2 text-right text-[13px] tabular-nums", bWins && "bg-sky-500/[0.04]")} data-testid={`cell-compare-metric-${id}-b`}>
                    <CompareMetricCell catalog={compareCatalog} id={id} isWinner={bWins} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────

export function SegmentDrilldownModal({
  open,
  onClose,
  segment,
  analysis,
  cellIds,
  kicker = "Segment drill-down",
  onBack,
  onNextStep,
}: {
  open: boolean;
  onClose: () => void;
  segment: SegmentId | null;
  analysis: AnalysisData;
  /** Scope to these creative cells; null = whole account. */
  cellIds: string[] | null;
  kicker?: string;
  /** If set, a visible ← Back button appears in the header. */
  onBack?: () => void;
  /** Override the "Next step" CTA action. Defaults to opening the Audience view. */
  onNextStep?: () => void;
}) {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const mst = getMST(seed, adAccountId);
  const [, navigate] = useLocation();

  const [compareSegment, setCompareSegment] = useState<SegmentId | null>(null);

  // A new primary segment (or reopen) always starts un-compared.
  const primaryKey = segment ? segmentKey(segment) : null;
  useEffect(() => {
    setCompareSegment(null);
  }, [primaryKey, open]);

  const data = useMemo(
    () => (segment ? computeSegmentDrilldown(analysis, mst, segment, cellIds) : null),
    [analysis, mst, segment, cellIds]
  );
  const compareData = useMemo(
    () => (compareSegment ? computeSegmentDrilldown(analysis, mst, compareSegment, cellIds) : null),
    [analysis, mst, compareSegment, cellIds]
  );
  const catalog = useMemo(
    () => (data ? buildSegmentMetricCatalog(data.totals, data.derived) : []),
    [data]
  );
  const compareCatalog = useMemo(
    () => (compareData ? buildSegmentMetricCatalog(compareData.totals, compareData.derived) : []),
    [compareData]
  );
  const compareCandidates = useMemo(() => {
    if (!segment) return [];
    const scoped = scopeDemographicRows(analysis.demographic_registration_signal ?? [], cellIds);
    const pk = segmentKey(segment);
    return listSegments(scoped).filter((s) => segmentKey(s) !== pk);
  }, [analysis, cellIds, segment]);
  const { selected, toggle, move, reset, atCap } = useSegmentMetricSelection();

  if (!segment || !data) return null;
  const label = segmentLabel(segment);
  const hasRows = data.totals.rowCount > 0;
  const topVariables = data.attribution.variables.slice(0, 12);
  const comparing = compareSegment != null && compareData != null;
  const compareLabel = compareSegment ? segmentLabel(compareSegment) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "bg-[hsl(222_61%_6%)] border-border/50 max-h-[85vh] overflow-y-auto",
          comparing ? "max-w-5xl" : "max-w-3xl"
        )}
      >
        <TooltipProvider delayDuration={150}>
          <DialogHeader className="text-left space-y-1">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors mb-0.5 -ml-0.5 group"
              >
                <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                Back
              </button>
            )}
            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">{kicker}</div>
            <DialogTitle className="text-[15px] font-semibold text-foreground" data-testid="title-segment-drilldown">
              {comparing ? `${label} vs ${compareLabel}` : `${label} — what's driving results`}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground/70 leading-relaxed">
              {comparing
                ? "Both segments' numbers are computed independently from their own demographic rows"
                : "Every number below is computed from this segment's own demographic rows"}
              {cellIds ? ` (scoped to ${cellIds.join(", ")})` : ""}. Metrics the export can't support show as
              unavailable — never estimated.
            </DialogDescription>
          </DialogHeader>

          {comparing ? (
            <div className="space-y-4">
              {/* Compare controls */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-foreground px-2 py-1 rounded-md bg-primary/[0.08] border border-primary/20" data-testid="label-compare-a">
                    {label}
                  </span>
                  <ArrowLeftRight className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-[11px] font-semibold text-foreground px-2 py-1 rounded-md bg-white/[0.04] border border-border/40" data-testid="label-compare-b">
                    {compareLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CompareSegmentPicker
                    candidates={compareCandidates.filter((s) => segmentKey(s) !== segmentKey(compareSegment!))}
                    onPick={setCompareSegment}
                  />
                  <button
                    onClick={() => setCompareSegment(null)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/40 text-[11px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors"
                    data-testid="button-clear-compare"
                  >
                    <X className="w-3 h-3" />
                    Exit compare
                  </button>
                </div>
              </div>

              <CompareLowSignalBanner data={data} label={label} />
              <CompareLowSignalBanner data={compareData} label={compareLabel!} />

              {/* Metric comparison table */}
              <CompareMetricTable
                selected={selected}
                catalog={catalog}
                compareCatalog={compareCatalog}
                label={label}
                compareLabel={compareLabel!}
                onToggle={toggle}
                onMove={move}
                onReset={reset}
                atCap={atCap}
              />

              {/* Concepts + variables per segment, side by side */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  What's driving each segment
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CompareAttributionColumn data={data} side="a" />
                  <CompareAttributionColumn data={compareData} side="b" />
                </div>
              </div>

              <div className="flex items-start gap-2 text-[10px] text-muted-foreground/60 leading-relaxed">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  Each column is computed independently from that segment's own demographic rows — the same math as
                  the single-segment drill-down. Hover a dash for why a metric is unavailable in that segment.
                </span>
              </div>
            </div>
          ) : !hasRows ? (
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
                  <div className="flex items-center gap-2">
                    <CompareSegmentPicker candidates={compareCandidates} onPick={setCompareSegment} />
                    <SegmentMetricPicker
                      catalog={catalog}
                      selected={selected}
                      atCap={atCap}
                      onToggle={toggle}
                      onMove={move}
                      onReset={reset}
                    />
                  </div>
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

              {/* Driving concepts — visual card tiles */}
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  Top concepts for this segment
                </p>
                {!data.attribution.available ? (
                  <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed rounded-lg border border-border/30 bg-white/[0.02] p-3" data-testid="note-attribution-unavailable">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{data.attribution.unavailableReason}</span>
                  </div>
                ) : (() => {
                  const maxCResults = Math.max(...data.attribution.cells.map((x) => x.totals.results ?? 0), 1);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {data.attribution.cells.slice(0, 4).map((c) => {
                        const barPct = c.totals.results != null ? Math.round((c.totals.results / maxCResults) * 100) : 0;
                        return (
                          <div key={c.cellId} className="rounded-xl border border-border/40 bg-white/[0.02] p-3 space-y-2" data-testid={`row-segment-concept-${c.cellId}`}>
                            {/* Name + result count */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[11.5px] font-semibold text-foreground/90 truncate">{c.conceptName ?? c.cellId}</div>
                                <div className="text-[8.5px] font-mono text-muted-foreground/40 mt-0.5">{c.cellId}</div>
                              </div>
                              {c.totals.results != null && (
                                <div className="shrink-0 text-right">
                                  <span className="text-[14px] font-bold tabular-nums text-foreground/90 leading-none">{fmtNum(c.totals.results)}</span>
                                  <span className="block text-[8px] font-mono uppercase tracking-wide text-muted-foreground/45 leading-none mt-0.5">results</span>
                                </div>
                              )}
                            </div>
                            {/* Results share bar */}
                            <div className="h-[5px] rounded-full bg-white/[0.05] overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-primary/55 to-violet-500/55" style={{ width: `${barPct}%` }} />
                            </div>
                            {/* Copy preview */}
                            {c.copy?.primary && (
                              <p className="text-[10px] text-muted-foreground/65 leading-relaxed line-clamp-2 italic">
                                &ldquo;{c.copy.primary}&rdquo;
                                {c.copy.cta && <span className="not-italic text-primary/60 ml-1">&rarr; {c.copy.cta}</span>}
                              </p>
                            )}
                            {/* Variable chips */}
                            {c.variableCodes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                {c.variableCodes.slice(0, 3).map((code) => {
                                  const v = data.attribution.variables.find((x) => x.code === code);
                                  return v ? <VariableChip key={code} v={v} /> : null;
                                })}
                                {c.variableCodes.length > 3 && (
                                  <span className="text-[8px] text-muted-foreground/40 font-mono">+{c.variableCodes.length - 3}</span>
                                )}
                              </div>
                            )}
                            {/* KPI footer */}
                            <div className="flex items-center gap-3 pt-0.5 border-t border-border/20">
                              {c.totals.spend != null && <span className="text-[9px] tabular-nums text-muted-foreground/50">{fmtUSD(c.totals.spend, 0)}</span>}
                              {c.derived.cpa != null && <span className="text-[9px] tabular-nums text-muted-foreground/50">{fmtUSD(c.derived.cpa)} CPA</span>}
                              {c.derived.ctr != null && <span className="text-[9px] tabular-nums text-muted-foreground/50">{fmtPct(c.derived.ctr)} CTR</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Placement performance (joint demographic × placement grain only) */}
              {data.placements.available && data.placements.entries.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                    Placements in this segment
                  </p>
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    {data.placements.entries.map((p) => (
                      <div
                        key={`${p.placement}|${p.platform}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0"
                        data-testid={`row-segment-placement-${p.placement}-${p.platform}`}
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-foreground truncate">{p.placement}</div>
                          <div className="text-[9px] text-muted-foreground/60 capitalize">{p.platform}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[11px] font-semibold text-foreground tabular-nums">
                            {p.totals.results != null ? `${fmtNum(p.totals.results)} results` : "—"}
                          </div>
                          <div className="text-[9px] text-muted-foreground/60 tabular-nums">
                            {perfSummary(p.totals, p.derived).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-muted-foreground/55 leading-snug">
                    Computed from this import's combined demographic × placement rows for {label} only — real joint
                    grain, not the account-level placement marginals.
                  </p>
                </div>
              )}

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

          {/* ── Next step CTA ── */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/25 mt-1">
            <p className="text-[9.5px] text-muted-foreground/50 leading-relaxed">
              Use this segment's signal to strengthen your next sprint test.
            </p>
            <button
              onClick={() => {
                onClose();
                if (onNextStep) { onNextStep(); } else { navigate("/app/strategy/map"); }
              }}
              className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary/10 border border-primary/25 text-[10px] font-semibold text-primary/90 hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Strategy Map
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
