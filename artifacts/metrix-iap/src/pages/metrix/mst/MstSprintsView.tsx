// ─── MST · Sprints — the canvas's sprint-matrix screen ─────────────────
// The 4×4 concept × shared-variable historical matrix rendered as the
// canvas grid: a status strip (Active tag · window · cells mapped),
// column heads carrying each concept's real rollup CPA, cell cards with
// an inner "Creative ›" button (canvas: cell.open), the scaling-playbook
// tier tag and rollup confidence, and the top-performing-concepts table
// underneath. Per the seed's render policy, performance renders only
// where source-backed (concept_rollup, concept level) — no per-cell
// pass/fail and no invented per-cell spend. Diagonal roles (↘ primary /
// ↗ counter) are real seed data with no canvas equivalent, kept as ring
// indicators. The whole cell stays clickable too (real-app addition
// over canvas) — both open the same performance/creative pop-up.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getMST, getAnalysisData, getCampaignSummary, getCreativeLinkContext, getStrategyData,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, CaveatNote, PendingState, CrossLink,
  SectionCard, SectionInfoIcon, ConfidenceBadge, SegmentedToggle, fmtUSD, fmtPct,
} from "../shared";
import { TYPE } from "../typography";
import { useDeepDive } from "@/contexts/DeepDiveContext";
import { buildCellDeepDiveModule } from "@/lib/data/deepDive";
import { SegmentGridModal } from "@/components/creative/SegmentGridModal";
import { bucketForConcept, BUCKET_LABEL, type ScalingBucket } from "@/lib/data/scalingBuckets";
import { cn } from "@workspace/command-deck/lib/utils";
import { Grid3x3 } from "lucide-react";
import type { ConceptRollupRow, MSTMatrix, MSTMatrixCell, ScalingPlaybook } from "@/lib/data/seedTypes";

const SECTION = "MST · 06";

/** Display order for the tier filter — worst-to-best playbook priority,
 *  matching the order bucketForConcept checks lists in. */
const TIER_ORDER: ScalingBucket[] = ["scale_now", "optimize", "validate", "explore", "avoid"];

const ROW_COLOR: Record<string, string> = {
  "var(--green)": "border-status-success/30 bg-status-success/[0.04]",
  "var(--blue)": "border-primary/30 bg-chart-1/[0.04]",
  "var(--amber)": "border-status-warning/30 bg-status-warning/[0.04]",
  "var(--purple)": "border-primary/30 bg-primary/[0.04]",
};

// ─── Matrix ↔ rollup linkage ───────────────────────────────────────────
// The matrix's column ids double as rollup concept codes ("C1".."C4").
// The rollup spans multiple books; the matrix belongs to whichever book
// names the most matrix columns. A strict winner is required — a tie
// (or no match) yields no book and therefore no performance overlay,
// never a guessed one.

export function matrixBookFor(rollup: ConceptRollupRow[], columnIds: string[]): string | null {
  const colSet = new Set(columnIds);
  const counts = new Map<string, number>();
  for (const r of rollup) {
    if (colSet.has(r.concept)) counts.set(r.book, (counts.get(r.book) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  let tied = false;
  for (const [book, n] of counts) {
    if (n > bestN) { best = book; bestN = n; tied = false; }
    else if (n === bestN) tied = true;
  }
  return tied || best == null ? null : best;
}

interface ColumnPerf {
  cpa: number | null;
  results: number | null;
  confidence: string | null;
  bucket: ScalingBucket | null;
}

function buildColumnPerf(
  rollup: ConceptRollupRow[],
  book: string | null,
  columnIds: string[],
  playbook: ScalingPlaybook | null,
): Record<string, ColumnPerf> {
  const out: Record<string, ColumnPerf> = {};
  if (!book) return out;
  for (const cid of columnIds) {
    const row = rollup.find((r) => r.book === book && r.concept === cid);
    if (!row) continue;
    out[cid] = {
      cpa: row.cpa,
      results: row.results,
      confidence: row.confidence,
      bucket: bucketForConcept(book, cid, playbook),
    };
  }
  return out;
}

// ─── Canvas matrix grid ────────────────────────────────────────────────

export function MatrixGrid({ matrix, columnPerf = {}, onCellClick, activeTier = "all" }: {
  matrix: MSTMatrix;
  /** Column-level rollup overlay — absent columns render position-only. */
  columnPerf?: Record<string, ColumnPerf>;
  onCellClick?: (cell: MSTMatrixCell) => void;
  /** Scaling-playbook tier filter — non-matching columns dim rather than
   *  disappear, so the 4×4 grid structure never breaks. */
  activeTier?: ScalingBucket | "all";
}) {
  const cellOf = (col: string, row: string) => matrix.cells.find((c) => c.column_id === col && c.row_id === row);
  const dimmedCol = (colId: string) => activeTier !== "all" && (columnPerf[colId]?.bucket ?? null) !== activeTier;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: `130px repeat(${matrix.columns.length}, 1fr)` }}>
          <div className="p-2" />
          {matrix.columns.map((c) => {
            const perf = columnPerf[c.id];
            return (
              <div key={c.id} className={cn("p-2 text-center transition-opacity", dimmedCol(c.id) && "opacity-30")}>
                <div className="text-body font-semibold text-foreground leading-tight whitespace-pre-line">{c.name}</div>
                <div className="text-micro text-muted-foreground/75 mt-1">
                  {c.id}
                  {perf && (
                    <span className={cn("ml-1.5", (perf.results ?? 0) === 0 ? "text-status-warning/70" : "text-interactive/80")} data-testid={`matrix-col-perf-${c.id}`}>
                      {perf.cpa != null ? `${fmtUSD(perf.cpa)} CPA` : "no conv."}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {matrix.rows.map((row) => (
            <div key={row.id} className="contents">
              <div className={cn("p-2 flex flex-col justify-center rounded-l-lg border-l-2 my-0.5", ROW_COLOR[row.color] ?? "border-border/40")}>
                <div className="text-body font-semibold text-foreground">Row {row.id}</div>
                <div className="text-micro text-muted-foreground/75 mt-0.5">{row.shared}</div>
              </div>
              {matrix.columns.map((col) => {
                const cell = cellOf(col.id, row.id);
                const perf = columnPerf[col.id];
                const bucket = perf?.bucket ?? null;
                const isScale = bucket === "scale_now";
                const isAvoid = bucket === "avoid";
                const diag = cell?.diagonal_role;
                const clickable = Boolean(cell && onCellClick);
                const openCell = () => { if (cell && onCellClick) onCellClick(cell); };
                return (
                  // Whole cell stays clickable (real-app enhancement over canvas, which only
                  // wires the inner "Creative ›" button) — a plain div with a button role
                  // rather than a native <button> so the nested Creative button below stays
                  // valid HTML instead of button-in-button.
                  <div
                    key={col.id + row.id}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? openCell : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCell(); } } : undefined}
                    aria-label={clickable ? `Open performance for ${cell!.cell_id}` : undefined}
                    data-testid={cell ? `matrix-cell-${cell.cell_id}` : undefined}
                    className={cn(
                      "m-0.5 p-2.5 rounded-lg border text-left min-h-[112px] flex flex-col gap-1.5 transition-opacity",
                      isScale ? "border-primary/50 bg-primary/[0.06]" : "bg-foreground/[0.02]",
                      !isScale && diag === "diag_down" && "border-primary/40 ring-1 ring-primary/15",
                      !isScale && diag === "diag_up" && "border-metrix-cyan/40 ring-1 ring-metrix-cyan/15",
                      !isScale && !diag && "border-border/40",
                      clickable && "cursor-pointer hover:bg-foreground/[0.05] hover:border-primary/40 transition-colors",
                      dimmedCol(col.id) && "opacity-30"
                    )}
                  >
                    {cell ? (
                      <>
                        {onCellClick && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openCell(); }}
                            aria-label={`Open creative for ${cell.cell_id}`}
                            data-testid={`matrix-cell-creative-${cell.cell_id}`}
                            className="pressable-lg h-11 w-full rounded-md bg-foreground/[0.05] hover:bg-foreground/[0.09] transition-colors flex items-center justify-center gap-1 text-micro font-medium text-muted-foreground/75"
                          >
                            Creative <span className="text-interactive text-caption leading-none" aria-hidden="true">›</span>
                          </button>
                        )}
                        <div className="text-micro text-muted-foreground/75">{cell.cell_id}</div>
                        {cell.plain_text.headline && (
                          <div className="text-body font-semibold text-foreground leading-tight line-clamp-3">{cell.plain_text.headline}</div>
                        )}
                        <div className="mt-auto pt-1.5 flex items-center justify-between gap-1.5">
                          <span
                            className={cn(
                              "text-micro inline-flex rounded px-1.5 py-0.5 font-semibold leading-none",
                              isScale
                                ? "bg-primary/25 text-interactive"
                                : isAvoid
                                  ? "bg-status-danger/25 text-status-danger"
                                  : bucket
                                    ? "bg-foreground/[0.06] text-foreground/70"
                                    : "text-muted-foreground/75",
                            )}
                          >
                            {bucket ? BUCKET_LABEL[bucket] : "—"}
                          </span>
                          <span className={cn(TYPE.label, "font-medium", isScale ? "text-interactive" : "text-muted-foreground/75")}>
                            {perf?.confidence ?? ""}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-caption text-muted-foreground/75">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Top performing concepts — the canvas's ranked table ──────────────

function TopConceptsTable({ rollup, book }: { rollup: ConceptRollupRow[]; book: string | null }) {
  if (!book) return null;
  const bookRows = rollup.filter((r) => r.book === book);
  const measured = bookRows.filter((r) => r.cpa != null);
  if (measured.length === 0) return null;
  const cvrs = bookRows.map((r) => r.cvr_link_pct).filter((v): v is number => v != null);
  const avgCvr = cvrs.length > 0 ? cvrs.reduce((n, v) => n + v, 0) / cvrs.length : null;
  const top = [...measured].sort((a, b) => a.cpa! - b.cpa!).slice(0, 5);
  return (
    <SectionCard
      title="Top performing concepts"
      desc={`${book} · ranked by cost per result`}
      table="concept_rollup"
      right={<SectionInfoIcon tip="The matrix book's measured concepts ranked cheapest-first, with each concept's link-CVR lift against the book's average. Only source-backed rollup rows appear — no per-cell performance is invented." />}
    >
      <div className="overflow-x-auto">
        <table className="nc-table" data-testid="mst-top-concepts">
          <thead>
            <tr>
              <th>Concept</th>
              <th className="text-right">Cost / result</th>
              <th className="text-right">CVR lift vs avg</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => {
              const lift = avgCvr != null && avgCvr > 0 && r.cvr_link_pct != null
                ? ((r.cvr_link_pct - avgCvr) / avgCvr) * 100
                : null;
              return (
                <tr key={`${r.book}:${r.concept}`}>
                  <td className="font-medium text-foreground/90">{r.book} · {r.concept}</td>
                  <td className="text-right tabular-nums text-foreground/85">{fmtUSD(r.cpa!)}</td>
                  <td className={cn("text-right tabular-nums", lift == null ? "text-muted-foreground/75" : lift >= 0 ? "text-status-success" : "text-status-danger")}>
                    {lift == null ? "—" : `${lift >= 0 ? "+" : ""}${fmtPct(lift)}`}
                  </td>
                  <td>{r.confidence ? <ConfidenceBadge value={r.confidence} /> : <span className={cn(TYPE.label, "text-muted-foreground/75")}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── View ──────────────────────────────────────────────────────────────

export function MstSprintsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const deepDive = useDeepDive();
  const [segmentsFor, setSegmentsFor] = useState<{ cellId: string; title: string } | null>(null);
  const [tierFilter, setTierFilter] = useState<ScalingBucket | "all">("all");

  return (
    <ModuleScopeGate section={SECTION} title="Sprints" account={account}>
      {() => {
        const mst = getMST(seed, adAccountId);

        if (!mst || mst.status !== "active" || !mst.historical_matrix_4x4) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Sprints" accountName={account!.name} />
              <PendingState title="No matrix available" message={mst?.render_policy ?? "The matrix becomes available once historical data or imports exist."} icon={Grid3x3} />
            </div>
          );
        }

        const matrix = mst.historical_matrix_4x4;
        const rollup = getAnalysisData(seed, adAccountId)?.concept_rollup ?? [];
        const columnIds = matrix.columns.map((c) => c.id);
        const book = matrixBookFor(rollup, columnIds);
        const playbook = getStrategyData(seed, adAccountId)?.scaling_playbook ?? null;
        const columnPerf = buildColumnPerf(rollup, book, columnIds, playbook);
        const summary = getCampaignSummary(seed, adAccountId);
        const windowLabel = summary?.window_start && summary?.window_end
          ? `${summary.window_start} → ${summary.window_end}`
          : null;
        // Only offer tiers actually present on this matrix's columns — never
        // a filter pill for a playbook bucket nothing here is classified into.
        const availableTiers = TIER_ORDER.filter((t) =>
          Object.values(columnPerf).some((p) => p.bucket === t)
        );

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Sprints"
              accountName={account!.name}
              subtitle="Historical 4×4 matrix · playbook tiers · concept-level performance"
              table="historical_matrix_4x4"
            />
            <div className="px-6 py-5 space-y-4">
              {/* Canvas status strip: Active tag + matrix name · window · cells mapped */}
              <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="mst-status-strip">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={cn(TYPE.label, "inline-flex border border-primary/40 bg-primary/15 text-interactive rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-widest")}>
                    Active
                  </span>
                  <span className={cn(TYPE.body, "text-foreground/80")}>
                    Historical matrix{book ? ` — ${book}` : ""}
                  </span>
                </div>
                <div className="flex gap-6">
                  {windowLabel && (
                    <div className="text-right">
                      <div className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Window</div>
                      <div className={cn(TYPE.body, "font-medium text-foreground/90 tabular-nums")}>{windowLabel}</div>
                    </div>
                  )}
                  <div className="text-right">
                    <div className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Cells mapped</div>
                    <div className={cn(TYPE.body, "font-medium text-foreground/90 tabular-nums")}>
                      {matrix.cells.length} / {matrix.columns.length * matrix.rows.length}
                    </div>
                  </div>
                </div>
              </div>

              <CaveatNote text={mst.render_policy} />

              {availableTiers.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(TYPE.label, " uppercase tracking-widest text-muted-foreground/75")}>
                    Filter by tier
                  </span>
                  <SegmentedToggle
                    ariaLabel="Filter matrix by scaling-playbook tier"
                    options={[
                      { id: "all", label: "All" },
                      ...availableTiers.map((t) => ({ id: t, label: BUCKET_LABEL[t] })),
                    ]}
                    active={tierFilter}
                    onChange={(id) => setTierFilter(id as ScalingBucket | "all")}
                  />
                  {tierFilter !== "all" && (
                    <span className="text-caption text-muted-foreground/75">
                      Other columns dim — click a cell for its detail regardless of tier
                    </span>
                  )}
                </div>
              )}

              <MatrixGrid
                matrix={matrix}
                columnPerf={columnPerf}
                activeTier={tierFilter}
                onCellClick={(cell) => {
                  deepDive.push(
                    buildCellDeepDiveModule({
                      cellId: cell.cell_id,
                      matrixCell: cell,
                      analysis: getAnalysisData(seed, adAccountId),
                      mst,
                      ...getCreativeLinkContext(seed, adAccountId),
                      trayScopeId: adAccountId,
                      onOpenSegments: () => setSegmentsFor({ cellId: cell.cell_id, title: cell.plain_text.headline ?? cell.cell_id }),
                    }),
                  );
                }}
              />
              <div className="flex items-center gap-4 text-caption text-muted-foreground/75 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-primary/40 ring-1 ring-primary/15 inline-block" /> Primary diagonal (↘)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-metrix-cyan/40 ring-1 ring-metrix-cyan/15 inline-block" /> Counter diagonal (↗)</span>
                <span className="text-muted-foreground/75">Tier tags come from the scaling playbook at concept level · click any cell for granular performance</span>
                <span className="ml-auto"><CrossLink to="/app/mst/cross-map" label="See crossmap results" /></span>
              </div>

              <TopConceptsTable rollup={rollup} book={book} />
            </div>
            {segmentsFor && (
              <SegmentGridModal
                open
                onClose={() => setSegmentsFor(null)}
                kicker={`MST tile · ${segmentsFor.cellId}`}
                title={segmentsFor.title}
                analysis={getAnalysisData(seed, adAccountId)!}
                cellIds={[segmentsFor.cellId]}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
