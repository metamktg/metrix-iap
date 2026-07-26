// ─── MST · Matrix Builder ─────────────────────────────────────────────
// The 4×4 concept × shared-variable historical matrix for the account.
// Diagonal roles highlight the primary (↘) and counter (↗) test paths.

import { useState, useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ModuleScopeGate, CaveatNote, PendingState, CrossLink, readableVariables, RangeScopeBar, NoDataInRangeState } from "../shared";
import { useDateRange, formatIsoRange } from "@/contexts/DateRangeContext";
import { useMstRangeScope } from "@/lib/date-scope";
import { TilePerformanceModal } from "@/components/creative/TilePerformanceModal";
import { cn } from "@/lib/utils";
import { Grid3x3 } from "lucide-react";
import type { MSTMatrix, MSTMatrixCell } from "@/lib/data/seedTypes";

const SECTION = "MST · 07";

// ─── CPA heatmap helpers ──────────────────────────────────────────────

type CpaEff = "efficient" | "average" | "costly";

const EFF_COLOR: Record<CpaEff, string> = {
  efficient: "rgb(52,211,153)",
  average:   "rgb(99,102,241)",
  costly:    "rgb(251,191,36)",
};

function numMedianMatrix(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const ROW_COLOR: Record<string, string> = {
  "var(--green)": "border-emerald-400/30 bg-emerald-400/[0.04]",
  "var(--blue)": "border-blue-400/30 bg-blue-400/[0.04]",
  "var(--amber)": "border-amber-400/30 bg-amber-400/[0.04]",
  "var(--purple)": "border-purple-400/30 bg-purple-400/[0.04]",
};

export function MatrixGrid({
  matrix, onCellClick, cellHeatmap,
}: {
  matrix: MSTMatrix;
  onCellClick?: (cell: MSTMatrixCell) => void;
  cellHeatmap?: Map<string, { eff: CpaEff; color: string }>;
}) {
  const cellOf = (col: string, row: string) => matrix.cells.find((c) => c.column_id === col && c.row_id === row);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: `130px repeat(${matrix.columns.length}, 1fr)` }}>
          <div className="p-2" />
          {matrix.columns.map((c) => (
            <div key={c.id} className="p-2 text-center">
              <div className="text-body font-semibold text-foreground leading-tight whitespace-pre-line">{c.name}</div>
              <div className="text-caption font-mono text-muted-foreground/80 mt-1">{c.id}</div>
            </div>
          ))}

          {matrix.rows.map((row) => (
            <div key={row.id} className="contents">
              <div className={cn("p-2 flex flex-col justify-center rounded-l-lg border-l-2 my-0.5", ROW_COLOR[row.color] ?? "border-border/40")}>
                <div className="text-body font-semibold text-foreground">{row.id}</div>
                <div className="text-caption text-muted-foreground/80 leading-tight mt-0.5">{readableVariables(row.shared)}</div>
              </div>
              {matrix.columns.map((col) => {
                const cell = cellOf(col.id, row.id);
                const diag = cell?.diagonal_role;
                const Tag = cell && onCellClick ? "button" : "div";
                return (
                  <Tag
                    key={col.id + row.id}
                    onClick={cell && onCellClick ? () => onCellClick(cell) : undefined}
                    aria-label={cell && onCellClick ? `Open performance for ${cell.cell_id}` : undefined}
                    className={cn(
                      "relative overflow-hidden m-0.5 p-2.5 rounded-lg border bg-white/[0.02] min-h-[112px] text-left",
                      diag === "diag_down" && "border-primary/40 ring-1 ring-primary/15",
                      diag === "diag_up" && "border-teal-400/40 ring-1 ring-teal-400/15",
                      !diag && "border-border/40",
                      cell && onCellClick && "cursor-pointer hover:bg-white/[0.05] hover:border-primary/40 transition-colors"
                    )}
                  >
                    {cell ? (
                      <>
                        {/* CPA efficiency stripe — top edge colour coded against account median */}
                        {cellHeatmap?.has(cell.cell_id) && (
                          <div
                            className="absolute top-0 left-0 right-0 h-[3px] rounded-t-lg"
                            style={{
                              background: `linear-gradient(90deg, ${cellHeatmap.get(cell.cell_id)!.color}88 0%, ${cellHeatmap.get(cell.cell_id)!.color}22 100%)`,
                            }}
                          />
                        )}
                        <div className="text-caption font-semibold text-interactive leading-tight">{readableVariables(cell.concept_code)}</div>
                        {cell.plain_text.headline && <div className="text-body font-medium text-foreground mt-1 leading-tight">{cell.plain_text.headline}</div>}
                        <div className="text-body font-mono text-muted-foreground/80 mt-1.5">{cell.cell_id}</div>
                      </>
                    ) : (
                      <div className="text-caption text-muted-foreground/60">—</div>
                    )}
                  </Tag>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MatrixBuilderView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData, range } = useDateRange();
  const [activeCell, setActiveCell] = useState<MSTMatrixCell | null>(null);
  const { mstRange, mstInRange } = useMstRangeScope(
    getMST(seed, adAccountId),
    getAnalysisData(seed, adAccountId)
  );

  // CPA heatmap — computed here (outside render-prop) so hook rules are respected.
  const analysisData = getAnalysisData(seed, adAccountId);
  const cellHeatmap = useMemo(() => {
    if (!analysisData) return new Map<string, { eff: CpaEff; color: string }>();
    const grouped = new Map<string, { spend: number; results: number }>();
    for (const row of analysisData.performance_by_cell) {
      const prev = grouped.get(row.cell_id) ?? { spend: 0, results: 0 };
      grouped.set(row.cell_id, {
        spend: prev.spend + row["Amount spent (USD)"],
        results: prev.results + row.Results,
      });
    }
    const cpas: number[] = [];
    for (const [, totals] of grouped) {
      if (totals.results > 0) cpas.push(totals.spend / totals.results);
    }
    const med = numMedianMatrix(cpas);
    const map = new Map<string, { eff: CpaEff; color: string }>();
    for (const [cellId, totals] of grouped) {
      const cpa = totals.results > 0 ? totals.spend / totals.results : null;
      if (cpa == null || med <= 0) continue;
      const ratio = cpa / med;
      const eff: CpaEff = ratio < 0.85 ? "efficient" : ratio <= 1.15 ? "average" : "costly";
      map.set(cellId, { eff, color: EFF_COLOR[eff] });
    }
    return map;
  }, [analysisData]);

  return (
    <ModuleScopeGate section={SECTION} title="Matrix Builder" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);

        if (!mst || mst.status !== "active" || !mst.historical_matrix_4x4) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Matrix Builder" account={acct} />
              <PendingState title="No matrix available" message={mst?.render_policy ?? "The matrix becomes available once historical data or imports exist."} icon={Grid3x3}
                action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
              />
            </div>
          );
        }

        const matrix = mst.historical_matrix_4x4;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Matrix Builder"
              subtitle="Historical concept × shared-variable matrix"
              account={acct}
            />
            <RangeScopeBar />
            {!rangeHasData || !mstInRange ? (
              <NoDataInRangeState
                what="MST data"
                detail={
                  !mstInRange && mstRange && range
                    ? `The selected range (${formatIsoRange(range)}) does not overlap this account's MST data window (${formatIsoRange(mstRange)}).`
                    : undefined
                }
              />
            ) : (
              <div className="px-6 py-5 space-y-4">
                <CaveatNote text={mst.render_policy} />
                <MatrixGrid matrix={matrix} onCellClick={setActiveCell} cellHeatmap={cellHeatmap} />
                <div className="flex items-center gap-4 text-caption text-muted-foreground/75 flex-wrap">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded border border-primary/40 ring-1 ring-primary/15 inline-block" /> Primary diagonal (↘)</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded border border-teal-400/40 ring-1 ring-teal-400/15 inline-block" /> Counter diagonal (↗)</span>
                  {cellHeatmap.size > 0 && (
                    <>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-[3px] rounded inline-block" style={{ background: EFF_COLOR.efficient }} /> Below-median CPA</span>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-[3px] rounded inline-block" style={{ background: EFF_COLOR.costly }} /> Above-median CPA</span>
                    </>
                  )}
                  <span className="text-muted-foreground/60">Click any tile for granular performance</span>
                  <span className="ml-auto"><CrossLink to="/app/mst/crossmap" label="See crossmap results" /></span>
                </div>
              </div>
            )}
            {activeCell && (
              <TilePerformanceModal
                open
                onClose={() => setActiveCell(null)}
                cellId={activeCell.cell_id}
                matrixCell={activeCell}
                analysis={getAnalysisData(seed, adAccountId)}
                mst={mst}
                {...getCreativeLinkContext(seed, adAccountId)}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
