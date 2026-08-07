// ─── MST tile performance pop-up ──────────────────────────────────────
// Every MST tile (Matrix Builder, Crossmap, Concept Map) opens into this
// modal: granular performance for the creative cell behind the tile —
// per-result-type rows, funnel counts, creative context, avatar ×
// placement drill-down, and Ads Manager scaffolding. Cells that never
// ran show an explicit "not run" state instead of fabricated numbers.

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import { Grid3x3 } from "lucide-react";
import type { AdRecord, AnalysisData, MST, MSTMatrixCell } from "@/lib/data/seedTypes";
import { cardFromCell, cardFromMatrixCell, libraryCellById } from "@/lib/creative-assembly";
import { CreativeCard, VariableTagChips } from "./CreativeCard";
import { AdsManagerButton } from "./AdsManagerLink";
import { SegmentGridModal, SegmentDrilldownButton } from "./SegmentGridModal";

function usd(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.02] px-2.5 py-2">
      <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</div>
      <div className="text-title font-semibold text-foreground tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

export function TilePerformanceModal({
  open,
  onClose,
  cellId,
  matrixCell,
  analysis,
  mst,
  ads,
  metaAdAccountId,
}: {
  open: boolean;
  onClose: () => void;
  cellId: string;
  /** Planned matrix cell, when the tile came from the 4×4 matrix. */
  matrixCell?: MSTMatrixCell | null;
  analysis: AnalysisData | null;
  mst: MST | null;
  /** Ad registry for the account (seed `ads`). */
  ads?: AdRecord[];
  /** Numeric Meta ad account id for deep links — null until backfilled. */
  metaAdAccountId?: string | null;
}) {
  const [segmentsOpen, setSegmentsOpen] = useState(false);

  const perf = useMemo(
    () => (analysis?.performance_by_cell ?? []).filter((r) => r.cell_id === cellId),
    [analysis, cellId]
  );
  const lib = libraryCellById(mst, cellId);

  const totals = useMemo(() => {
    const spend = perf.reduce((n, r) => n + r["Amount spent (USD)"], 0);
    const results = perf.reduce((n, r) => n + r.Results, 0);
    const impressions = perf.reduce((n, r) => n + r.Impressions, 0);
    const linkClicks = perf.reduce((n, r) => n + r["Link clicks"], 0);
    const reach = perf.reduce((n, r) => Math.max(n, r.Reach), 0);
    return { spend, results, impressions, linkClicks, reach };
  }, [perf]);

  const card = matrixCell
    ? cardFromMatrixCell(matrixCell, { perfRows: analysis?.performance_by_cell, mst, ads, metaAdAccountId })
    : cardFromCell(cellId, { perfRows: analysis?.performance_by_cell, mst, ads, metaAdAccountId });

  const ran = perf.length > 0;
  const title = card.title;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl bg-surface-deep border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left space-y-1">
            <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
              MST tile · {cellId}
              {matrixCell?.diagonal_role === "diag_down" && " · Primary diagonal ↘"}
              {matrixCell?.diagonal_role === "diag_up" && " · Counter diagonal ↗"}
            </div>
            <DialogTitle className="text-callout font-semibold text-foreground leading-tight">{title}</DialogTitle>
            {matrixCell && (
              <DialogDescription className="text-caption text-muted-foreground/70">
                {matrixCell.column_label} × {matrixCell.row_shared_variable}
              </DialogDescription>
            )}
          </DialogHeader>

          {!ran ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 mx-auto rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
                <Grid3x3 className="w-4 h-4 text-muted-foreground/60" />
              </div>
              <p className="text-title font-medium text-foreground/60">This tile never ran</p>
              <p className="text-caption text-muted-foreground/60 max-w-sm mx-auto">
                No performance rows exist for {cellId} in this import — it's a planned matrix cell
                without observed spend. Numbers appear here once it runs.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Spend" value={usd(totals.spend, 0)} />
                <Stat label="Results" value={num(totals.results)} sub={perf.length > 1 ? `${perf.length} result types` : perf[0]?.["Result type"]} />
                <Stat label="Blended CPA" value={totals.results > 0 ? usd(totals.spend / totals.results) : "—"} />
                <Stat label="Reach" value={num(totals.reach)} />
              </div>

              {/* Funnel */}
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  Funnel · full flight window
                </div>
                <div className="grid grid-cols-3 divide-x divide-border/30">
                  <div className="px-3 py-2 text-center">
                    <div className="text-body font-semibold text-foreground tabular-nums">{num(totals.impressions)}</div>
                    <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60 mt-0.5">Impressions</div>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <div className="text-body font-semibold text-foreground tabular-nums">{num(totals.linkClicks)}</div>
                    <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60 mt-0.5">Link clicks</div>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <div className="text-body font-semibold text-foreground tabular-nums">{num(totals.results)}</div>
                    <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60 mt-0.5">Results</div>
                  </div>
                </div>
              </div>

              {/* Per-result-type rows */}
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30 bg-white/[0.015]">
                      <th className="text-left text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-1.5">Result type</th>
                      <th className="text-right text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-1.5">Spend</th>
                      <th className="text-right text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-1.5">Results</th>
                      <th className="text-right text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-1.5">CPA</th>
                      <th className="text-right text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-1.5">Link CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.map((r) => (
                      <tr key={r["Result type"]} className="border-b border-border/20 last:border-b-0">
                        <td className="px-3 py-1.5 text-caption text-foreground/85">{r["Result type"]}</td>
                        <td className="px-3 py-1.5 text-right text-caption tabular-nums text-foreground/85">{usd(r["Amount spent (USD)"])}</td>
                        <td className="px-3 py-1.5 text-right text-caption tabular-nums text-foreground/85">{num(r.Results)}</td>
                        <td className="px-3 py-1.5 text-right text-caption tabular-nums text-foreground/85">{r.CPA_result != null ? usd(r.CPA_result) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-caption tabular-nums text-foreground/85">{pct(r.CTR_link_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {card.iapRead && (
                <div className="space-y-1">
                  <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">IAP read</p>
                  <p className="text-caption text-foreground/80 leading-relaxed">{card.iapRead}</p>
                </div>
              )}

              {card.tags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Variable stack</p>
                  <VariableTagChips codes={card.tags} />
                </div>
              )}
            </div>
          )}

          {/* Cell copy — full prose lives here; the matrix tile face shows the headline only */}
          {matrixCell?.plain_text?.primary && (
            <div className="space-y-1 pt-1 border-t border-border/30">
              <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60 pt-2">Cell copy</p>
              {matrixCell.plain_text.headline && (
                <p className="text-body font-medium text-foreground leading-tight">{matrixCell.plain_text.headline}</p>
              )}
              <p className="text-caption text-foreground/80 leading-relaxed">{matrixCell.plain_text.primary}</p>
            </div>
          )}

          {/* Creative context */}
          {(lib || matrixCell) && (
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60 pt-2">Creative</p>
              <div className="max-w-[220px]">
                <CreativeCard data={card} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/30">
            <AdsManagerButton metaAdId={card.metaAdId} adAccountId={card.adAccountId} />
            {ran && analysis && (
              <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {analysis && (
        <SegmentGridModal
          open={segmentsOpen}
          onClose={() => setSegmentsOpen(false)}
          kicker={`MST tile · ${cellId}`}
          title={title}
          analysis={analysis}
          cellIds={[cellId]}
        />
      )}
    </>
  );
}
