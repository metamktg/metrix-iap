// ─── MST · Performance ──────────────────────────────────────────────
// Test-engine results: joins matrix cells (row = shared variable tested,
// column = avatar/ICP) to observed performance, then surfaces universal
// winners (best row averaged across every column/avatar) vs
// avatar-specific winners (best row within a single column) — the same
// distinction metrix-mst-test-engine draws. All derived from real joined
// rows, nothing modeled or fabricated.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, SectionCard, readableVariables, fmtUSD, fmtNum,
} from "../shared";
import { TrendingUp, Users } from "lucide-react";

const SECTION = "MST · 06";

interface RowAgg {
  rowId: string;
  sharedVariable: string;
  byColumn: Map<string, { spend: number; results: number; label: string }>;
  totalSpend: number;
  totalResults: number;
}

export function MstPerformanceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Performance" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const matrix = mst?.historical_matrix_4x4;

        if (!mst || mst.status !== "active" || !matrix || !analysis) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Performance" />
              <ScopeBanner account={acct} />
              <PendingState title="No test results yet" message={mst?.render_policy ?? "MST performance appears once the matrix and performance data both exist."} icon={TrendingUp} />
            </div>
          );
        }

        const rowAggs = new Map<string, RowAgg>();
        for (const cell of matrix.cells) {
          const perf = analysis.performance_by_cell.filter((r) => r.cell_id === cell.cell_id);
          if (perf.length === 0) continue;
          const spend = perf.reduce((n, r) => n + r["Amount spent (USD)"], 0);
          const results = perf.reduce((n, r) => n + r.Results, 0);
          const agg = rowAggs.get(cell.row_id) ?? {
            rowId: cell.row_id,
            sharedVariable: cell.row_shared_variable,
            byColumn: new Map(),
            totalSpend: 0,
            totalResults: 0,
          };
          const col = agg.byColumn.get(cell.column_id) ?? { spend: 0, results: 0, label: cell.column_label };
          col.spend += spend;
          col.results += results;
          agg.byColumn.set(cell.column_id, col);
          agg.totalSpend += spend;
          agg.totalResults += results;
          rowAggs.set(cell.row_id, agg);
        }

        const rows = [...rowAggs.values()];
        if (rows.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Performance" />
              <ScopeBanner account={acct} />
              <PendingState title="No test results in this window" message="No matrix cells have observed performance yet." icon={TrendingUp} />
            </div>
          );
        }

        const cpaOf = (spend: number, results: number) => (results > 0 ? spend / results : Infinity);

        // Universal winner: best CPA across the row's total (all columns combined).
        const universal = [...rows].sort((a, b) => cpaOf(a.totalSpend, a.totalResults) - cpaOf(b.totalSpend, b.totalResults))[0];

        // Avatar-specific winners: for each column, the row with the best CPA in that column alone.
        const columnIds = new Set(rows.flatMap((r) => [...r.byColumn.keys()]));
        const avatarWinners = [...columnIds].map((colId) => {
          let best: { row: RowAgg; spend: number; results: number; label: string } | null = null;
          for (const row of rows) {
            const col = row.byColumn.get(colId);
            if (!col || col.results === 0) continue;
            if (!best || cpaOf(col.spend, col.results) < cpaOf(best.spend, best.results)) {
              best = { row, spend: col.spend, results: col.results, label: col.label };
            }
          }
          return best ? { columnId: colId, ...best } : null;
        }).filter((x): x is NonNullable<typeof x> => x !== null);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Performance"
              subtitle="Universal vs avatar-specific winners, derived from matrix rows crossmapped to observed performance."
              table="historical_matrix_4x4, performance_by_cell"
            />
            <ScopeBanner account={acct} />
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Variables tested" value={String(rows.length)} />
              <MetricTile label="Avatars/columns" value={String(columnIds.size)} />
              <MetricTile label="Universal winner CPA" value={universal ? fmtUSD(cpaOf(universal.totalSpend, universal.totalResults)) : "—"} />
              <MetricTile label="Avatar-specific winners" value={String(avatarWinners.length)} />
            </div>
            <div className="px-6 py-5 space-y-4 max-w-4xl">
              <CaveatNote text="CPA winners are ranked only among rows/columns with observed results — cells with no performance yet are excluded, not treated as zero." />
              {universal && (
                <SectionCard title="Universal winner" desc="Best CPA averaged across every avatar/column this variable ran against.">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{readableVariables(universal.sharedVariable)}</p>
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{universal.rowId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold text-foreground tabular-nums">{fmtUSD(cpaOf(universal.totalSpend, universal.totalResults))} CPA</p>
                      <p className="text-[10px] text-muted-foreground/60">{fmtNum(universal.totalResults)} results · {fmtUSD(universal.totalSpend, 0)} spend</p>
                    </div>
                  </div>
                </SectionCard>
              )}
              <SectionCard title="Avatar-specific winners" desc="The best-performing variable for each individual avatar/column — may differ from the universal winner.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {avatarWinners.map((w) => (
                    <div key={w.columnId} className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Users className="w-3 h-3 text-primary/60" />
                        <span className="text-[11px] font-medium text-foreground">{w.label}</span>
                      </div>
                      <p className="text-[12px] text-foreground/85">{readableVariables(w.row.sharedVariable)}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 tabular-nums">{fmtUSD(cpaOf(w.spend, w.results))} CPA · {fmtNum(w.results)} results</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
