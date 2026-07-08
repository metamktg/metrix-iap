// ─── MST · Crossmap Results ───────────────────────────────────────────
// Joins the 4×4 matrix cells to observed performance rows by cell_id:
// which planned matrix cells actually ran, and what they produced.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, CaveatNote, PendingState, MetricTile,
  CrossLink, readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
} from "../shared";
import { TableShell, Th, Td } from "../analysis/tables";
import { cn } from "@/lib/utils";
import { GitMerge } from "lucide-react";

const SECTION = "MST · 07";

export function CrossmapResultsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

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
              <ModuleHeader section={SECTION} title="Crossmap Results" />
              <ScopeBanner account={acct} />
              <PendingState title="No crossmap yet" message={mst?.render_policy ?? "Crossmap results appear once the matrix and performance data both exist."} icon={GitMerge} />
            </div>
          );
        }

        // Join each matrix cell to its observed performance rows by cell_id.
        const joined = matrix.cells.map((cell) => {
          const perf = analysis.performance_by_cell.filter((r) => r.cell_id === cell.cell_id);
          const spend = perf.reduce((n, r) => n + r["Amount spent (USD)"], 0);
          const results = perf.reduce((n, r) => n + r.Results, 0);
          return { cell, perf, spend, results, ran: perf.length > 0 };
        });
        const ran = joined.filter((j) => j.ran);
        const planned = joined.length;
        const coveragePct = planned > 0 ? (ran.length / planned) * 100 : 0;
        const totalSpend = ran.reduce((n, j) => n + j.spend, 0);
        const totalResults = ran.reduce((n, j) => n + j.results, 0);

        const rows = [...joined].sort((a, b) => Number(b.ran) - Number(a.ran) || b.spend - a.spend);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Crossmap Results"
              subtitle="Planned matrix cells crossmapped to what actually ran and what it produced."
              table="historical_matrix_4x4, performance_by_cell"
            />
            <ScopeBanner account={acct} />

            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Planned cells" value={fmtNum(planned)} />
              <MetricTile label="Cells with data" value={fmtNum(ran.length)} sub={`${coveragePct.toFixed(0)}% matrix coverage`} />
              <MetricTile label="Crossmapped spend" value={fmtUSD(totalSpend, 0)} />
              <MetricTile label="Crossmapped results" value={fmtNum(totalResults)} />
            </div>

            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />

              <TableShell>
                <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
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
                        <tr key={cell.cell_id} className="border-b border-border/20">
                          <Td><span className="font-mono text-[11px] text-muted-foreground/75">{cell.cell_id}</span></Td>
                          <Td>
                            <div className="font-medium text-foreground/75">{readableVariables(cell.concept_code)}</div>
                            {cell.plain_text.headline && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{cell.plain_text.headline}</div>}
                          </Td>
                          <Td className={cn(cell.diagonal_role === "diag_down" && "text-primary", cell.diagonal_role === "diag_up" && "text-teal-300")}>{diag}</Td>
                          <Td className="text-muted-foreground/60" >Not run</Td>
                          <Td right>—</Td>
                          <Td right>—</Td>
                          <Td right>—</Td>
                          <Td right>—</Td>
                        </tr>
                      );
                    }
                    return perf.map((r, i) => (
                      <tr key={cell.cell_id + r["Result type"]} className="border-b border-border/20 hover:bg-white/[0.02]">
                        <Td>{i === 0 ? <span className="font-mono text-[11px] text-foreground/85">{cell.cell_id}</span> : null}</Td>
                        <Td>
                          {i === 0 && (
                            <>
                              <div className="font-medium text-foreground">{readableVariables(cell.concept_code)}</div>
                              {cell.plain_text.headline && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{cell.plain_text.headline}</div>}
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

              <div className="flex items-center gap-4">
                <CrossLink to="/app/mst/matrix" label="Open the matrix" />
                <CrossLink to="/app/analysis/library" label="Full IAP library" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
