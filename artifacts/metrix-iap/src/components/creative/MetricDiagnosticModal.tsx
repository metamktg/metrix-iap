// ─── Metric diagnostic modal ───────────────────────────────────────────
// Opened by tapping a customizable overview metric tile. Shows the
// blended top-line stat for that metric, then reuses the avatar ×
// placement segment-grid pattern (SegmentGridModal) for the breakdown,
// plus the top IAP library concepts driving the metric with a link
// through to the concept/MST view. Metrics with no underlying data show
// an honest pending state — never a fabricated number.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import { Gauge, ArrowRight, Info } from "lucide-react";
import type { AnalysisData, MST } from "@/lib/data/seedTypes";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import { SegmentGridModal, SegmentDrilldownButton } from "./SegmentGridModal";
import {
  topConceptsForMetric,
  allCellIdsForMetric,
  type ConceptDriver,
} from "@/lib/data/metricConceptUtils";

export function MetricDiagnosticModal({
  open,
  onClose,
  metric,
  analysis,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  metric: MetricDef | null;
  analysis: AnalysisData | null;
  mst?: MST | null;
  /** Manager scope stays top-line-only, consistent with the manager aggregation rule. */
  scope: "account" | "manager";
}) {
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [, navigate] = useLocation();

  const concepts = useMemo(
    () => (analysis && metric ? topConceptsForMetric(analysis.performance_by_cell, metric) : []),
    [analysis, metric]
  );
  const allDrivingCellIds = useMemo(
    () => (analysis && metric?.isResultEvent ? allCellIdsForMetric(analysis.performance_by_cell, metric) : []),
    [analysis, metric]
  );

  if (!metric) return null;
  const hasData = metric.value != null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl bg-surface-deep border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left space-y-1">
            <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
              Metric diagnostic
            </div>
            <DialogTitle className="text-callout font-semibold text-foreground">{metric.label}</DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground/70 leading-relaxed">
              {scope === "account"
                ? "Blended top-line value, avatar × placement breakdown, and the IAP library concepts driving this metric for this account."
                : "Blended top-line value across all connected accounts. Open an account for the avatar/placement breakdown and concept drivers — manager-level analysis doesn't aggregate below bottom-line totals."}
            </DialogDescription>
          </DialogHeader>

          {!hasData ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 mx-auto rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
                <Gauge className="w-4 h-4 text-muted-foreground/60" />
              </div>
              <p className="text-title font-medium text-foreground/60">No data for this metric yet</p>
              <p className="text-caption text-muted-foreground/60 max-w-sm mx-auto">
                {metric.label} has no underlying rows for this account/date range in the current import.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-1">
                  Blended top-line
                </div>
                <div className="text-bignum font-bold text-foreground tabular-nums leading-none tracking-[-0.03em]">
                  {metric.formatted}
                </div>
              </div>

              {scope === "account" && analysis && !metric.isResultEvent && (
                <div className="flex items-center gap-2">
                  <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} label="Avatar × placement breakdown" />
                </div>
              )}

              {scope === "account" && analysis && metric.isResultEvent && (
                <div className="flex items-start gap-2 text-caption text-muted-foreground/70 leading-relaxed rounded-lg border border-border/30 bg-white/[0.02] p-3">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Avatar × placement breakdown isn't available for "{metric.label}" — the demographic and
                    placement exports don't carry a result-type column, so segment rows can't be honestly
                    scoped to this event (they'd otherwise mix in every other result type). The concept list
                    below is still event-scoped, using each creative cell's own result-type data.
                  </span>
                </div>
              )}

              {scope === "account" && (
                <div className="space-y-1.5">
                  <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">
                    Top IAP library concepts driving this metric
                  </p>
                  {concepts.length === 0 ? (
                    <p className="text-caption text-muted-foreground/60 py-2">
                      No creative-cell rows back this metric{metric.isResultEvent ? ` for "${metric.label}"` : ""} in this import.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-border/40 overflow-hidden">
                      {concepts.map((c) => (
                        <button
                          key={c.cellId}
                          onClick={() => navigate(`/app/analysis/library?focus=${encodeURIComponent(c.cellId)}`)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0 hover:bg-white/[0.02] transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <div className="text-caption font-medium text-foreground truncate">{c.name}</div>
                            <div className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">{c.cellId}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-caption font-semibold text-foreground tabular-nums">{c.metricDisplay}</div>
                            <div className="text-[9px] text-muted-foreground/60">
                              {fmtUSD(c.spend, 0)} · {fmtNum(c.results)} results
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-interactive/60 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {scope === "manager" && (
            <div className="flex items-start gap-2 text-label text-muted-foreground/60 leading-relaxed pt-1 border-t border-border/30">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Only bottom-line totals aggregate across accounts. Open an ad account for full metric diagnostics.</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {scope === "account" && analysis && (
        <SegmentGridModal
          open={segmentsOpen}
          onClose={() => setSegmentsOpen(false)}
          kicker={`Metric · ${metric.label}`}
          title={metric.label}
          analysis={analysis}
          cellIds={metric.isResultEvent ? allDrivingCellIds : null}
          metric={metric}
        />
      )}
    </>
  );
}
