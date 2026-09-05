// ─── The analysis export's rows, one read ─────────────────────────────
// Three surfaces (the Exports page card, Exports › Analysis, the Analysis
// centre's export row) each gated on `performance_by_cell.length === 0`
// and told the reader to "run analysis first". The engine writes no cell
// library (change-log 30), so an account whose run had completed, with
// 399 ads carrying performance and 126 variable rows, read as nothing to
// export on every one of them; the centre's row also counted every run's
// variable rows (606 for a run of 126). This is the one read: cells when
// the importer wrote them, else one cell-shaped row per ad with
// performance (the IAP Library's own fallback), and the variable rows of
// the current run only (design pass, round 8).

import type { AdAccount, AnalysisData, CellPerformanceRow, VariablePerformanceRow } from "./data/seedTypes";
import { adGrainPerformanceRows } from "./ad-grain-rows";
import { scopeToRun } from "./run-supersede";

export interface AnalysisExportRows {
  /** Cell rows from the importer, else one row per ad with performance. */
  performance_by_cell: CellPerformanceRow[];
  /** Which grain the rows are: "cell" (a cell library) or "ad" (the run's ads). */
  grain: "cell" | "ad" | null;
  /** Variable rows of the current run (null run ids are pre-migration history and stay). */
  v3_variable_performance: VariablePerformanceRow[];
}

export function analysisExportRows(account: AdAccount | null | undefined, analysis: AnalysisData | null | undefined): AnalysisExportRows {
  const cells = analysis?.performance_by_cell ?? [];
  const adRows = cells.length === 0 ? adGrainPerformanceRows(account?.ads).rows : [];
  const rows = cells.length > 0 ? cells : adRows;
  return {
    performance_by_cell: rows,
    grain: cells.length > 0 ? "cell" : adRows.length > 0 ? "ad" : null,
    v3_variable_performance: scopeToRun(analysis?.v3_variable_performance ?? [], analysis?.latest_analysis_run_id ?? null),
  };
}

/** True when the export would carry no row at all. */
export function analysisExportEmpty(rows: AnalysisExportRows): boolean {
  return rows.performance_by_cell.length === 0 && rows.v3_variable_performance.length === 0;
}

/** The two count fragments a card shows for the export. */
export function analysisExportSummary(rows: AnalysisExportRows): string[] {
  const perf = rows.grain === "ad"
    ? `${rows.performance_by_cell.length} ads with performance`
    : `${rows.performance_by_cell.length} cell performance rows`;
  return [perf, `${rows.v3_variable_performance.length} variable performance rows`];
}
