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
  useShowMore, ShowMoreButton, SegmentedToggle, SectionInfoIcon,
} from "../shared";
import { TYPE } from "../typography";
import { useCellRunScope, usePersistedRunScope } from "@/lib/run-scope";
import { RunScopePicker, ALL_TIME_SELECTION, type RunSelectorValue } from "@/components/analysis/RunSelector";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import { useDeepDive } from "@/contexts/DeepDiveContext";
import { buildCellDeepDiveModule } from "@/lib/data/deepDive";
import { SegmentGridModal } from "@/components/creative/SegmentGridModal";
import { TableShell, Th, Td } from "../analysis/tables";
import { RankSortBar, useRankMetric, type RankMetric } from "../analysis/rankSort";
import { cn } from "@workspace/command-deck/lib/utils";
import { GitMerge } from "lucide-react";
import type { MSTMatrixCell } from "@/lib/data/seedTypes";

const SECTION = "MST · 06";

// ─── Sort support ─────────────────────────────────────────────────────

interface CrossmapEnrichedRow {
  cell: MSTMatrixCell;
  perf: { "Amount spent (USD)": number; Results: number; "Result type": string; CPA_result: number | null; CTR_link_pct: number | null; Impressions: number; "Link clicks": number }[];
  spend: number;
  results: number;
  ran: boolean;
  cpa: number | null;
  avgCtr: number | null;
}

const CROSSMAP_SORT_KEY = "metrix.crossmap.sort.v1";

/** Coverage filter — narrows the table to delivered vs. still-planned
 *  cells without touching the header totals, which always describe the
 *  full planned matrix regardless of the active filter. */
type CoverageFilter = "all" | "ran" | "pending";
const COVERAGE_OPTIONS: { id: CoverageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ran", label: "Delivered" },
  { id: "pending", label: "Pending" },
];

const CROSSMAP_METRICS: RankMetric<CrossmapEnrichedRow>[] = [
  { id: "spend",   label: "Spend",    direction: "desc", value: (r) => r.ran ? r.spend   : null, format: (v) => fmtUSD(v, 0) },
  { id: "results", label: "Results",  direction: "desc", value: (r) => r.ran ? r.results : null, format: fmtNum },
  { id: "cpa",     label: "CPA",      direction: "asc",  value: (r) => r.ran ? r.cpa     : null, format: fmtUSD },
  { id: "ctr",     label: "Link CTR", direction: "desc", value: (r) => r.ran ? r.avgCtr  : null, format: fmtPct },
];

export function CrossmapResultsView({
  renderHeader = true,
  runScope,
  onRunScopeChange,
}: {
  renderHeader?: boolean;
  /** When provided (with onRunScopeChange), run scoping is controlled by the
   *  parent — e.g. MstCrossMapView owns the header picker for both tabs. */
  runScope?: RunSelectorValue;
  onRunScopeChange?: (v: RunSelectorValue) => void;
} = {}) {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const deepDive = useDeepDive();
  const [segmentsFor, setSegmentsFor] = useState<{ cellId: string; title: string } | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const { data: analysisRunsData } = useListAnalysisRuns(adAccountId ?? "", { query: { enabled: !!adAccountId, queryKey: getListAnalysisRunsQueryKey(adAccountId ?? "") } });
  const controlled = runScope !== undefined && onRunScopeChange !== undefined;
  // When controlled, the parent owns persistence — the local hook is inert
  // so it never reads/writes storage or runs the stale-run guard.
  const [localRunSelection, setLocalRunSelection] = usePersistedRunScope(
    "mst-crossmap", adAccountId, analysisRunsData?.runs, !controlled,
  );
  const runSelection = controlled ? runScope! : localRunSelection;
  const setRunSelection = controlled ? onRunScopeChange! : setLocalRunSelection;
  const analysisData = getAnalysisData(seed, adAccountId);
  const { inRunScope } = useCellRunScope(analysisData, runSelection);

  const { activeId: sortId, select: setSortId } = useRankMetric(
    CROSSMAP_SORT_KEY,
    CROSSMAP_METRICS.map((m) => m.id),
    "spend",
  );
  const activeSort = CROSSMAP_METRICS.find((m) => m.id === sortId) ?? CROSSMAP_METRICS[0];

  return (
    <ModuleScopeGate section={SECTION} title="Crossmap Results" account={account} renderHeader={renderHeader}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const matrix = mst?.historical_matrix_4x4;

        if (!mst || mst.status !== "active" || !matrix || !analysis) {
          return (
            <div className="flex-1 flex flex-col">
              {renderHeader && <ModuleHeader section={SECTION} title="Crossmap Results" accountName={acct.name} />}
              <PendingState title="No crossmap yet" message={mst?.render_policy ?? "Crossmap results appear once the matrix and performance data both exist."} icon={GitMerge}
                action={<CrossLink to="/app/mst/matrix" label="Open MST Matrix" />}
              />
            </div>
          );
        }

        // Join each matrix cell to its observed performance rows by cell_id,
        // then enrich with CPA and avg CTR for sort support.
        const joined: CrossmapEnrichedRow[] = matrix.cells.map((cell) => {
          const perf = analysis.performance_by_cell.filter((r) => r.cell_id === cell.cell_id && inRunScope(r.cell_id)) as CrossmapEnrichedRow["perf"];
          const spend = perf.reduce((n, r) => n + r["Amount spent (USD)"], 0);
          const results = perf.reduce((n, r) => n + r.Results, 0);
          const cpa = results > 0 ? spend / results : null;
          // Ratio metric: recomputed from summed link clicks ÷ summed
          // impressions across the cell's rows — never averaged per-row
          // rates, which skews toward low-impression rows (see kpiBreakdown.ts).
          const impressions = perf.reduce((n, r) => n + r.Impressions, 0);
          const linkClicks = perf.reduce((n, r) => n + r["Link clicks"], 0);
          const avgCtr = impressions > 0 ? (linkClicks / impressions) * 100 : null;
          return { cell, perf, spend, results, ran: perf.length > 0, cpa, avgCtr };
        });

        const ran = joined.filter((j) => j.ran);
        const planned = joined.length;
        const coveragePct = planned > 0 ? (ran.length / planned) * 100 : 0;
        const totalSpend = ran.reduce((n, j) => n + j.spend, 0);
        const totalResults = ran.reduce((n, j) => n + j.results, 0);

        // Tint precomputation for heatmap columns
        const allPerfSpends = ran.flatMap((j) => j.perf.map((p) => p["Amount spent (USD)"]));
        const maxPerfSpend = allPerfSpends.length > 0 ? Math.max(...allPerfSpends) : 1;
        const allPerfResults = ran.flatMap((j) => j.perf.map((p) => p.Results));
        const maxPerfResults = allPerfResults.length > 0 ? Math.max(...allPerfResults) : 1;
        const allPerfCpas = ran.flatMap((j) => j.perf.map((p) => p.CPA_result).filter((v): v is number => v != null));
        const minPerfCpa = allPerfCpas.length > 0 ? Math.min(...allPerfCpas) : 0;
        const maxPerfCpa = allPerfCpas.length > 0 ? Math.max(...allPerfCpas) : 0;

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

        // Coverage filter narrows what's shown in the table only — the
        // header totals above always describe the full planned matrix.
        const displayRows = coverageFilter === "all"
          ? rows
          : rows.filter((r) => (coverageFilter === "ran" ? r.ran : !r.ran));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {renderHeader ? (
              <ModuleHeader
                section={SECTION}
                title="Crossmap Results"
                accountName={acct.name}
                subtitle="Planned cells × actual delivery"
                right={
                  <RunScopePicker
                    runs={analysisRunsData?.runs ?? []}
                    value={runSelection}
                    onChange={setRunSelection}
                  />
                }
              />
            ) : controlled ? null : (
              (analysisRunsData?.runs.length ?? 0) > 0 && (
                <div className="px-6 pt-4 flex justify-end">
                  <RunScopePicker runs={analysisRunsData!.runs} value={runSelection} onChange={setRunSelection} />
                </div>
              )
            )}

            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Planned cells" value={fmtNum(planned)} />
              <MetricTile label="Cells with data" value={fmtNum(ran.length)} sub={`${coveragePct.toFixed(0)}% matrix coverage`} />
              <MetricTile label="Crossmapped spend" value={fmtUSD(totalSpend, 0)} />
              <MetricTile label="Crossmapped results" value={fmtNum(totalResults)} />
            </div>

            {/* Coverage bar — same "share of top" visual grammar as the MST
               avatar tiles, here showing delivered vs. planned matrix cells. */}
            <div className="px-6 pt-3">
              <div className="flex items-center justify-between text-label text-muted-foreground/40 mb-1">
                <span>Matrix coverage</span>
                <span className="tabular-nums">{fmtNum(ran.length)} of {fmtNum(planned)} cells · {coveragePct.toFixed(0)}%</span>
              </div>
              <div className="h-[3px] rounded-full overflow-hidden bg-border/30">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(coveragePct, 100)}%` }} />
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />

              {/* Table header — coverage filter narrows which rows show;
                 rank sort decides their order among delivered cells. */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className={cn(TYPE.label, "font-mono uppercase tracking-widest text-muted-foreground/40")}>
                    Crossmap
                  </span>
                  <SectionInfoIcon tip="Every planned matrix cell joined to its observed performance rows by cell_id. Delivered cells rank by the active sort metric; cells with no performance rows yet always sort last." />
                  {coverageFilter !== "all" && (
                    <span className={cn(TYPE.caption, "text-muted-foreground/50 tabular-nums")}>
                      {fmtNum(displayRows.length)} of {fmtNum(rows.length)} cells
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <SegmentedToggle
                    ariaLabel="Filter crossmap coverage"
                    options={COVERAGE_OPTIONS}
                    active={coverageFilter}
                    onChange={(id) => setCoverageFilter(id as CoverageFilter)}
                  />
                  <RankSortBar
                    metrics={CROSSMAP_METRICS}
                    activeId={sortId}
                    onSelect={setSortId}
                  />
                </div>
              </div>

              <TableShell>
                <thead className="sticky top-0 bg-surface-table z-10">
                  <tr>
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
                <CrossmapRows
                  rows={displayRows}
                  maxPerfSpend={maxPerfSpend}
                  maxPerfResults={maxPerfResults}
                  minPerfCpa={minPerfCpa}
                  maxPerfCpa={maxPerfCpa}
                  onSelectCell={(cell) => {
                    deepDive.push(
                      buildCellDeepDiveModule({
                        cellId: cell.cell_id,
                        matrixCell: cell,
                        analysis,
                        mst,
                        ...getCreativeLinkContext(seed, adAccountId),
                        trayScopeId: adAccountId,
                        onOpenSegments: () => setSegmentsFor({ cellId: cell.cell_id, title: cell.plain_text.headline ?? cell.cell_id }),
                      }),
                    );
                  }}
                />
              </TableShell>

              <div className="flex items-center justify-end gap-4">
                <CrossLink to="/app/mst/matrix" label="Open the matrix" />
                <CrossLink to="/app/analysis/library" label="Full IAP library" />
              </div>
            </div>

            {segmentsFor && analysis && (
              <SegmentGridModal
                open
                onClose={() => setSegmentsFor(null)}
                kicker={`MST tile · ${segmentsFor.cellId}`}
                title={segmentsFor.title}
                analysis={analysis}
                cellIds={[segmentsFor.cellId]}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}

function CrossmapRows({
  rows,
  maxPerfSpend,
  maxPerfResults,
  minPerfCpa,
  maxPerfCpa,
  onSelectCell,
}: {
  rows: CrossmapEnrichedRow[];
  maxPerfSpend: number;
  maxPerfResults: number;
  minPerfCpa: number;
  maxPerfCpa: number;
  onSelectCell: (cell: MSTMatrixCell) => void;
}) {
  const fold = useShowMore(rows, 10);
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={8} className="px-2.5 py-6 text-center text-caption text-muted-foreground/50">
            No cells match this filter.
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody>
      {fold.visible.map(({ cell, perf, ran: hasData }) => {
        const diag = cell.diagonal_role === "diag_down" ? "Primary ↘" : cell.diagonal_role === "diag_up" ? "Counter ↗" : "—";
        if (!hasData) {
          return (
            <tr
              key={cell.cell_id}
              onClick={() => onSelectCell(cell)}
              className="cursor-pointer"
            >
              <Td><span className="font-mono text-caption text-muted-foreground/75">{cell.cell_id}</span></Td>
              <Td>
                <div className="font-medium text-foreground/75">{readableVariables(cell.concept_code)}</div>
                {cell.plain_text.headline && <div className="text-label text-muted-foreground/60 mt-0.5">{cell.plain_text.headline}</div>}
              </Td>
              <Td className={cn(cell.diagonal_role === "diag_down" && "text-interactive", cell.diagonal_role === "diag_up" && "text-teal-300")}>{diag}</Td>
              <Td className="text-muted-foreground/40">—</Td>
              <Td right>—</Td>
              <Td right>—</Td>
              <Td right>—</Td>
              <Td right>—</Td>
            </tr>
          );
        }
        return perf.map((r, i) => {
          const spendIntensity = maxPerfSpend > 0 ? r["Amount spent (USD)"] / maxPerfSpend : 0;
          const resultsIntensity = maxPerfResults > 0 ? r.Results / maxPerfResults : 0;
          const cpaIntensity =
            r.CPA_result != null && maxPerfCpa > minPerfCpa
              ? 1 - (r.CPA_result - minPerfCpa) / (maxPerfCpa - minPerfCpa)
              : 0;
          return (
            <tr
              key={cell.cell_id + r["Result type"]}
              onClick={() => onSelectCell(cell)}
              className="cursor-pointer"
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
              <Td className={cn(cell.diagonal_role === "diag_down" && "text-interactive", cell.diagonal_role === "diag_up" && "text-teal-300")}>{i === 0 ? diag : null}</Td>
              <Td>{eventLabel(r["Result type"])}</Td>
              <Td right style={spendIntensity > 0 ? { background: `hsl(var(--chart-1) / ${(spendIntensity * 0.20).toFixed(3)})` } : undefined}>
                {fmtUSD(r["Amount spent (USD)"])}
              </Td>
              <Td right style={resultsIntensity > 0 ? { background: `hsl(var(--chart-3) / ${(resultsIntensity * 0.18).toFixed(3)})` } : undefined}>
                {fmtNum(r.Results)}
              </Td>
              <Td right style={cpaIntensity > 0 ? { background: `hsl(var(--chart-3) / ${(cpaIntensity * 0.20).toFixed(3)})` } : undefined}>
                {r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
              </Td>
              <Td right>{fmtPct(r.CTR_link_pct)}</Td>
            </tr>
          );
        });
      })}
      {fold.hiddenCount > 0 && (
        <tr>
          <td colSpan={8} className="p-0">
            <ShowMoreButton total={rows.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="matrix cells" />
          </td>
        </tr>
      )}
    </tbody>
  );
}
