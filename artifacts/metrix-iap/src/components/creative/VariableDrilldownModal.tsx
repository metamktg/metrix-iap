// ─── Variable drill-down modal ────────────────────────────────────────
// Opened from DNA family cards, "best read" chips, and variable table
// rows. Shows, for one creative variable: header KPIs from the import's
// own variable-level rows, the top ads (creative cells) carrying it,
// per-segment performance computed from cell-grain demographic rows
// scoped to carrier cells (tappable → segment drill-down), and the copy
// variants that ran with it. Placement data is account-level in every
// import and is deliberately excluded — it can't be attributed to one
// variable.

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import { ChevronRight, Info, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@workspace/command-deck/lib/utils";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getMST, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import { cardFromCell } from "@/lib/creative-assembly";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { DIALOG } from "@/pages/metrix/typography";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import { computeVariableDrilldown } from "@/lib/variable-drilldown";
import { segmentLabel, type SegmentId } from "@/lib/segment-analytics";
import { familyLabel } from "@/pages/metrix/strategy/strategyShared";
import { readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel } from "@/pages/metrix/shared";
import type { AnalysisData, VariablePerformanceRow } from "@/lib/data/seedTypes";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.02] p-2.5">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</div>
      <div className="text-base font-bold tabular-nums leading-tight mt-0.5 text-foreground">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground/55 leading-snug mt-0.5">{sub}</div>}
    </div>
  );
}

export function VariableDrilldownModal({
  open,
  onClose,
  code,
  analysis,
  /** Metric-filtered v3 rows so header totals match the page selection. */
  variableRows,
  selectedResultTypes,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  code: string | null;
  analysis: AnalysisData;
  /** Metric-filtered v3 rows so header totals match the page selection. */
  variableRows: VariablePerformanceRow[];
  /** The page's result-type selection — scopes cell/segment sections too. */
  selectedResultTypes?: string[] | null;
  /** If set, a ← Back button appears in the modal header. */
  onBack?: () => void;
}) {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const [, navigate] = useLocation();
  const mst = getMST(seed, adAccountId);
  const [segment, setSegment] = useState<SegmentId | null>(null);

  const data = useMemo(
    () => (code ? computeVariableDrilldown(code, { analysis, mst, variableRows, selectedResultTypes }) : null),
    [code, analysis, mst, variableRows, selectedResultTypes]
  );

  const cardCtx = useMemo(
    () => ({ perfRows: analysis.performance_by_cell, mst, ...getCreativeLinkContext(seed, adAccountId) }),
    [analysis, mst, seed, adAccountId]
  );

  if (!code || !data) return null;

  const topCells = data.rankedCells.slice(0, 3);
  const maxSegSpend = Math.max(...data.segments.rows.map((s) => s.totals.spend ?? 0), 0);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl bg-surface-deep border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left space-y-1">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1 text-label text-muted-foreground/60 hover:text-foreground transition-colors mb-0.5 -ml-0.5 group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back
              </button>
            )}
            <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
              Variable drill-down{data.family ? ` · ${familyLabel(data.family)}` : ""}
            </div>
            <DialogTitle className={cn(DIALOG.title, "flex items-center gap-2 flex-wrap")} data-testid="title-variable-drilldown">
              {readableVariables(code)}
              <span className="text-[9px] font-mono font-normal text-muted-foreground/60 border border-border/30 px-1.5 py-0.5 rounded">{code}</span>
            </DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground/70 leading-relaxed">
              Numbers come from this import's own variable-level rows and the creative cells that actually carried this
              variable — nothing estimated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ── Header KPIs ── */}
            {data.totals ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <Kpi label="Spend" value={fmtUSD(data.totals.spend, 0)} />
                <Kpi
                  label="Results"
                  value={fmtNum(data.totals.results)}
                  sub={data.totals.resultTypes.map(eventLabel).join(" + ")}
                />
                <Kpi label="CPA" value={data.totals.cpa != null ? fmtUSD(data.totals.cpa) : "—"} />
                <Kpi label="Link CTR" value={data.totals.ctrPct != null ? fmtPct(data.totals.ctrPct) : "—"} />
                <Kpi label="Unique ads" value={fmtNum(data.totals.uniqueAds)} />
              </div>
            ) : (
              <div className="flex items-start gap-2 text-caption text-muted-foreground/70 leading-relaxed rounded-lg border border-border/40 bg-white/[0.02] p-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  No variable-level performance row for this code in the current metric selection — the sections below
                  still show which creatives carried it.
                </span>
              </div>
            )}

            {/* ── Top ads carrying this variable ── */}
            <div className="space-y-1.5">
              <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">
                Top ads carrying this variable
              </p>
              {topCells.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {topCells.map((c) => (
                    <CreativeCard
                      key={c.cellId}
                      data={{
                        ...cardFromCell(c.cellId, cardCtx),
                        stats: {
                          spend: c.spend,
                          results: c.results,
                          cpa: c.cpa,
                          ctrPct: c.ctrPct,
                          resultLabel: "selected events",
                        },
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-caption text-muted-foreground/60">
                  No creative cell in this import carries this variable.
                </p>
              )}
              {data.rankedCells.length > 3 && (
                <p className="text-[9px] text-muted-foreground/50">
                  Top 3 of {data.rankedCells.length} carrier cells, ranked by results.
                </p>
              )}
            </div>

            {/* ── Segment performance ── */}
            <div className="space-y-1.5">
              <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">
                Segment performance — scoped to this variable's cells
              </p>
              {data.segments.available ? (
                <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
                  {data.segments.rows.map(({ segment: seg, totals, derived }) => {
                    const share = maxSegSpend > 0 && totals.spend != null ? totals.spend / maxSegSpend : 0;
                    return (
                      <button
                        key={`${seg.age}-${seg.gender}`}
                        onClick={() => setSegment(seg)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-primary/[0.07] cursor-pointer transition-colors group"
                        data-testid={`row-variable-segment-${seg.age}-${seg.gender}`}
                        title="Click to open segment drill-down"
                      >
                        <span className="text-caption font-medium text-foreground/85 w-32 shrink-0 capitalize">
                          {segmentLabel(seg)}
                        </span>
                        <span className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-violet-500/60 group-hover:from-primary/85 group-hover:to-violet-500/85 transition-colors"
                            style={{ width: `${Math.max(share * 100, 2)}%` }}
                          />
                        </span>
                        <span className="text-label tabular-nums text-muted-foreground/70 w-16 text-right shrink-0">
                          {totals.spend != null ? fmtUSD(totals.spend, 0) : "—"}
                        </span>
                        <span className="text-label tabular-nums text-foreground/80 w-20 text-right shrink-0">
                          {derived.cpa != null ? `${fmtUSD(derived.cpa)} CPA` : "— CPA"}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/35 group-hover:text-primary/80 group-hover:translate-x-0.5 transition-[color,background-color,border-color,box-shadow,opacity,transform] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-start gap-2 text-caption text-muted-foreground/60 leading-relaxed rounded-lg border border-border/30 bg-white/[0.01] p-3">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{data.segments.unavailableReason}</span>
                </div>
              )}
            </div>

            {/* ── Copy variants ── */}
            {data.textVariants.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">
                  Copy that ran with this variable
                </p>
                <div className="space-y-2">
                  {data.textVariants.map((v) => (
                    <div key={v.cellId} className="rounded-lg border border-border/40 bg-white/[0.02] p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono text-muted-foreground/60">{v.cellId}</span>
                        {v.conceptName && <span className="text-label font-medium text-foreground/80">{v.conceptName}</span>}
                      </div>
                      {v.primary && <p className="text-caption text-foreground/85 leading-relaxed">{v.primary}</p>}
                      {v.secondary && <p className="text-label text-muted-foreground/70 leading-relaxed">{v.secondary}</p>}
                      {v.cta && (
                        <span className="inline-block text-[9px] font-medium text-interactive/80 border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 rounded">
                          {v.cta}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className={cn("text-[9px] text-muted-foreground/50 leading-relaxed")}>
              Placement data is account-level in this import and can't be attributed to a single variable, so it's not
              shown here.
            </p>

            {/* ── Next step CTA ── */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/25">
              <p className="text-label text-muted-foreground/50 leading-relaxed">
                Use these variable insights to inform your next sprint test.
              </p>
              <button
                onClick={() => { onClose(); navigate("/app/strategy/map"); }}
                className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary/10 border border-primary/25 text-label font-semibold text-interactive/90 hover:bg-primary/15 hover:border-primary/40 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Strategy Map
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested segment drill-down, scoped to this variable's carrier cells */}
      <SegmentDrilldownModal
        open={segment != null}
        onClose={() => setSegment(null)}
        segment={segment}
        analysis={analysis}
        cellIds={data.carrierCellIds.length > 0 ? data.carrierCellIds : null}
        kicker={`Variable · ${readableVariables(code)}`}
      />
    </>
  );
}
