// ─── MST · Matrix Builder ─────────────────────────────────────────────
// The 4×4 concept × shared-variable historical matrix for the account.
// Diagonal roles highlight the primary (↘) and counter (↗) test paths.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, CaveatNote, PendingState, CrossLink, readableVariables } from "../shared";
import { TilePerformanceModal } from "@/components/creative/TilePerformanceModal";
import { cn } from "@/lib/utils";
import { Grid3x3 } from "lucide-react";
import type { MSTMatrix, MSTMatrixCell } from "@/lib/data/seedTypes";

const SECTION = "MST · 06";

const ROW_COLOR: Record<string, string> = {
  "var(--green)": "border-emerald-400/30 bg-emerald-400/[0.04]",
  "var(--blue)": "border-blue-400/30 bg-blue-400/[0.04]",
  "var(--amber)": "border-amber-400/30 bg-amber-400/[0.04]",
  "var(--purple)": "border-purple-400/30 bg-purple-400/[0.04]",
};

export function MatrixGrid({ matrix, onCellClick }: { matrix: MSTMatrix; onCellClick?: (cell: MSTMatrixCell) => void }) {
  const cellOf = (col: string, row: string) => matrix.cells.find((c) => c.column_id === col && c.row_id === row);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: `130px repeat(${matrix.columns.length}, 1fr)` }}>
          <div className="p-2" />
          {matrix.columns.map((c) => (
            <div key={c.id} className="p-2 text-center">
              <div className="text-[12px] font-semibold text-foreground leading-tight whitespace-pre-line">{c.name}</div>
              <div className="text-[9px] font-mono text-muted-foreground/40 mt-1">{c.id}</div>
            </div>
          ))}

          {matrix.rows.map((row) => (
            <div key={row.id} className="contents">
              <div className={cn("p-2 flex flex-col justify-center rounded-l-lg border-l-2 my-0.5", ROW_COLOR[row.color] ?? "border-border/40")}>
                <div className="text-[12px] font-semibold text-foreground">{row.id}</div>
                <div className="text-[11px] text-muted-foreground/80 leading-tight mt-0.5">{readableVariables(row.shared)}</div>
                <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">{row.shared}</div>
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
                      "m-0.5 p-2.5 rounded-lg border bg-white/[0.02] min-h-[112px] text-left",
                      diag === "diag_down" && "border-primary/40 ring-1 ring-primary/15",
                      diag === "diag_up" && "border-teal-400/40 ring-1 ring-teal-400/15",
                      !diag && "border-border/40",
                      cell && onCellClick && "cursor-pointer hover:bg-white/[0.05] hover:border-primary/40 transition-colors"
                    )}
                  >
                    {cell ? (
                      <>
                        {/* Eyebrow: smaller and lighter than the headline below it so the
                            two don't compete for the same read — the headline is the point,
                            the category is context. */}
                        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-interactive/80 leading-tight">{readableVariables(cell.concept_code)}</div>
                        {cell.plain_text.headline && <div className="text-[12px] font-semibold text-foreground mt-1 leading-tight">{cell.plain_text.headline}</div>}
                        {cell.plain_text.primary && <div className="text-[11px] text-muted-foreground/80 mt-1 leading-snug line-clamp-3">{cell.plain_text.primary}</div>}
                        <div className="text-[9px] font-mono text-muted-foreground/40 mt-1.5">{cell.cell_id}</div>
                      </>
                    ) : (
                      <div className="text-[11px] text-muted-foreground/60">—</div>
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

export function MstSprintsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [activeCell, setActiveCell] = useState<MSTMatrixCell | null>(null);

  return (
    <ModuleScopeGate section={SECTION} title="Sprints" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);

        if (!mst || mst.status !== "active" || !mst.historical_matrix_4x4) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Sprints" />
              <ScopeBanner account={acct} />
              <PendingState title="No matrix available" message={mst?.render_policy ?? "The matrix becomes available once historical data or imports exist."} icon={Grid3x3} />
            </div>
          );
        }

        const matrix = mst.historical_matrix_4x4;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Sprints"
              subtitle="The historical 4×4 concept × shared-variable test matrix for this account."
              table="historical_matrix_4x4"
            />
            <ScopeBanner account={acct} />
            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />
              <MatrixGrid matrix={matrix} onCellClick={setActiveCell} />
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground/75 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-primary/40 ring-1 ring-primary/15 inline-block" /> Primary diagonal (↘)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-teal-400/40 ring-1 ring-teal-400/15 inline-block" /> Counter diagonal (↗)</span>
                <span className="text-muted-foreground/60">Click any tile for granular performance</span>
                <span className="ml-auto"><CrossLink to="/app/mst/cross-map" label="See crossmap results" /></span>
              </div>
            </div>
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
