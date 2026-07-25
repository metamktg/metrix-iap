// ─── MST · Crossmap Results ───────────────────────────────────────────
// Joins the 4×4 matrix cells to observed performance rows by cell_id:
// which planned matrix cells actually ran, and what they produced.
// Sort bar lets users rank by Spend / Results / CPA / Link CTR so the
// best-performing cells rise to the top immediately.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, CaveatNote, PendingState, MetricTile,
  CrossLink, readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange, formatIsoRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, useMstRangeScope } from "@/lib/date-scope";
import { TilePerformanceModal } from "@/components/creative/TilePerformanceModal";
import { TableShell, Th, Td } from "../analysis/tables";
import { RankSortBar, useRankMetric, type RankMetric } from "../analysis/rankSort";
import { cn } from "@/lib/utils";
import { GitMerge } from "lucide-react";
import type { MSTMatrixCell } from "@/lib/data/seedTypes";

const SECTION = "MST · 07";

// ─── Sort support ─────────────────────────────────────────────────────

interface CrossmapEnrichedRow {
  cell: MSTMatrixCell;
  perf: { "Amount spent (USD)": number; Results: number; "Result type": string; CPA_result: number | null; CTR_link_pct: number | null }[];
  spend: number;
  results: number;
  ran: boolean;
  cpa: number | null;
  avgCtr: number | null;
}

const CROSSMAP_SORT_KEY = "metrix.crossmap.sort.v1";

const CROSSMAP_METRICS: RankMetric<CrossmapEnrichedRow>[] = [
  { id: "spend",   label: "Spend",    direction: "desc", value: (r) => r.ran ? r.spend   : null, format: (v) => fmtUSD(v, 0) },
  { id: "results", label: "Results",  direction: "desc", value: (r) => r.ran ? r.results : null, format: fmtNum },
  { id: "cpa",     label: "CPA",      direction: "asc",  value: (r) => r.ran ? r.cpa     : null, format: fmtUSD },
  { id: "ctr",     label: "Link CTR", direction: "desc", value: (r) => r.ran ? r.avgCtr  : null, format: fmtPct },
];

export function CrossmapResultsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData, range } = useDateRange();
  const [activeCell, setActiveCell] = useState<MSTMatrixCell | null>(null);
  const mstData = getMST(seed, adAccountId);
  const analysisData = getAnalysisData(seed, adAccountId);
  const { inRangeCell } = useCellRangeScope(analysisData);
  const { mstRange, mstInRange } = useMstRangeScope(mstData, analysisData);

  const { activeId: sortId, select: setSortId } = useRankMetric(
    CROSSMAP_SORT_KEY,
    CROSSMAP_METRICS.map((m) => m.id),
    "spend",
  );
  const activeSort = CROSSMAP_METRICS.find((m) => m.id === sortId) ?? CROSSMAP_METRICS[0];

  return (
    <ModuleScopeGate section={SECTION} title="Crossmap Results" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const matrix = mst?.historical_matrix_4x4;

        if (!mst || mst.status !== "active" || !matrix || !analysis) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Crossmap Results" account={acct} />
              <PendingState title="No crossmap yet" message={mst?.render_policy ?? "Crossmap results appear once the matrix and performance data both exist."} icon={GitMerge}
                action={<CrossLink to="/app/mst/matrix" label="Open MST Matrix" />}
              />
            </div>
          );
        }

        // Join each matrix cell to its observed performance rows by cell_id,
        // then enrich with CPA and avg CTR for sort support.
        const joined: CrossmapEnrichedRow[] = matrix.cells.map((cell) => {
          const perf = analysis.performance_by_cell.filter((r) => r.cell_id === cell.cell_id && inRangeCell(r.cell_id)) as CrossmapEnrichedRow["perf"];
          const spend = perf.reduce((n, r) => n + r["Amount spent (USD)"], 0);
          const results = perf.reduce((n, r) => n + r.Results, 0);
          const cpa = results > 0 ? spend / results : null;
          const avgCtr = perf.length > 0
            ? perf.reduce((n, r) => n + (r.CTR_link_pct ?? 0), 0) / perf.length
            : null;
          return { cell, perf, spend, results, ran: perf.length > 0, cpa, avgCtr };
        });

        const ran = joined.filter((j) => j.ran);
        const planned = joined.length;
        const coveragePct = planned > 0 ? (ran.length / planned) * 100 : 0;
        const totalSpend = ran.reduce((n, j) => n + j.spend, 0);
        const totalResults = ran.reduce((n, j) => n + j.results, 0);

        // Sort: ran cells always come before non-ran; within ran, sort by active metric.
        const rows = [...joined].sort((a, b) => {
          if (a.ran !== b.ran) return Number(b.ran) - Number(a.ran);
          const va = activeSort.value(a);
          const vb = activeSort.value(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const dir = activeSort.direction === "asc" ? 1 : -1;
          return (va - vb) * dir;
        });

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Crossmap Results"
              subtitle="Planned cells × actual delivery"
              account={acct}
            />
            <RangeScopeBar />

            {!rangeHasData || !mstInRange ? (
              <NoDataInRangeState
                what="crossmap data"
                detail={
                  !mstInRange && mstRange && range
                    ? `The selected range (${formatIsoRange(range)}) does not overlap this account's MST data window (${formatIsoRange(mstRange)}).`
                    : undefined
                }
              />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Planned cells" value={fmtNum(planned)} />
              <MetricTile label="Cells with data" value={fmtNum(ran.length)} sub={`${coveragePct.toFixed(0)}% matrix coverage`} />
              <MetricTile label="Crossmapped spend" value={fmtUSD(totalSpend, 0)} />
              <MetricTile label="Crossmapped results" value={fmtNum(totalResults)} />
            </div>

            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />

              {/* Sort bar — ran cells rank by metric; non-ran always stay at bottom */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/40">
                  Top performers
                </span>
                <RankSortBar
                  metrics={CROSSMAP_METRICS}
                  activeId={sortId}
                  onSelect={setSortId}
                />
              </div>

              <TableShell>
                <thead className="sticky top-0 bg-surface-table z-10">
                  <tr className="border-b border-border/40">
                    <Th>Matrix cell</Th>
                    <Th>Concept</Th>
                    <Th>Diagonal</Th>
                    <Th>Result type</Th>
                    <Th right>Spend</Th>
                    <Th right>Results</Th>
                    <Th right>CPA</Th>
                    <Th right>Link CTR</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ cell, perf, ran: hasData }) => {
                    const diag = cell.diagonal_role === "diag_down" ? "Primary ↘" : cell.diagonal_role === "diag_up" ? "Counter ↗" : "—";
                    if (!hasData) {
                      return (
                        <tr
                          key={cell.cell_id}
                          onClick={() => setActiveCell(cell)}
                          className="border-b border-border/20 cursor-pointer hover:bg-white/[0.02]"
                        >
                          <Td><span className="font-mono text-caption text-muted-foreground/75">{cell.cell_id}</span></Td>
                          <Td>
                            <div className="font-medium text-foreground/75">{readableVariables(cell.concept_code)}</div>
                            {cell.plain_text.headline && <div className="text-label text-muted-foreground/60 mt-0.5">{cell.plain_text.headline}</div>}
                          </Td>
                          <Td className={cn(cell.diagonal_role === "diag_down" && "text-primary", cell.diagonal_role === "diag_up" && "text-teal-300")}>{diag}</Td>
                          <Td className="text-muted-foreground/40">—</Td>
                          <Td right>—</Td>
                          <Td right>—</Td>
                          <Td right>—</Td>
                          <Td right>—</Td>
                        </tr>
                      );
                    }
                    return perf.map((r, i) => (
                      <tr
                        key={cell.cell_id + r["Result type"]}
                        onClick={() => setActiveCell(cell)}
                        className="border-b border-border/20 cursor-pointer hover:bg-white/[0.02]"
                      >
                        <Td>{i === 0 ? <span className="font-mono text-caption text-foreground/85">{cell.cell_id}</span> : null}</Td>
                        <Td>
                          {i === 0 && (
                            <>
                              <div className="font-medium text-foreground">{readableVariables(cell.concept_code)}</div>
                              {cell.plain_text.headline && <div className="text-label text-muted-foreground/70 mt-0.5">{cell.plain_text.headline}</div>}
                            </>
                          )}
                        </Td>
                        <Td className={cn(cell.diagonal_role === "diag_down" && "text-primary", cell.diagonal_role === "diag_up" && "text-teal-300")}>{i === 0 ? diag : null}</Td>
                        <Td>{eventLabel(r["Result type"])}</Td>
                        <Td right>{fmtUSD(r["Amount spent (USD)"])}</Td>
                        <Td right>{fmtNum(r.Results)}</Td>
                        <Td right>{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}</Td>
                        <Td right>{fmtPct(r.CTR_link_pct)}</Td>
                      </tr>
                    ));
                  })}
                </tbody>
              </TableShell>

              <div className="flex items-center justify-end gap-4">
                <CrossLink to="/app/mst/matrix" label="Open the matrix" />
                <CrossLink to="/app/analysis/library" label="Full IAP library" />
              </div>
            </div>
            </>
            )}

            {activeCell && (
              <TilePerformanceModal
                open
                onClose={() => setActiveCell(null)}
                cellId={activeCell.cell_id}
                matrixCell={activeCell}
                analysis={analysis}
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
