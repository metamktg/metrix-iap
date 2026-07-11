// ─── Analysis · IAP Library ───────────────────────────────────────────
// Creative cell + variable performance for the active ad account, with
// metric selection (result events), inline variable codes, a cell drill-
// down drawer, and cross-links into Strategy and Creative Briefs.
//
// Unmapped cells (perf data present but no IAP library mapping) are
// flagged with an amber badge and a top-of-grid warning banner.
// "Add creatives" button opens CreativeLibraryDialog so assets can be
// staged and mapped; the dialog invalidates the seed query on close so
// the library refreshes automatically.

import { useState, useEffect, useMemo } from "react";
import { Images, AlertTriangle } from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getAnalysisData, getStrategyData, getCampaignSummary,
  getCreativeLinkContext, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import {
  ModuleHeader, ScopeBanner, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CaveatNote, MetricSelectionBar, CrossLink, useFocusParam,
  readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
  RangeScopeBar, NoDataInRangeState, StaleFocusNotice,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell, libraryCellById } from "@/lib/creative-assembly";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { CellTable, VariableTable } from "./tables";
import type { CreativeCardStats } from "@/components/creative/CreativeCard";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { CreativeLibraryDialog } from "@/pages/metrix/ConnectAccountDialogs";

const SECTION = "Analysis · 03";

type Tab = "cells" | "top" | "variables";

const VARIABLE_FIELDS: { key: keyof CellPerformanceRow; label: string }[] = [
  { key: "hook_variable",       label: "Hook" },
  { key: "tone_variable",       label: "Tone" },
  { key: "framework_variable",  label: "Framework" },
  { key: "concept_variable",    label: "Concept" },
  { key: "pain_proof_variable", label: "Pain / proof" },
  { key: "proof_variable",      label: "Proof" },
  { key: "cta_variable",        label: "CTA" },
];

export function IapLibraryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<Tab>("cells");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<CellPerformanceRow | null>(null);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [creativeLibraryOpen, setCreativeLibraryOpen] = useState(false);
  const { rangeHasData } = useDateRange();

  const a       = getAnalysisData(seed, adAccountId);
  const summary = getCampaignSummary(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);
  const mst     = getMST(seed, adAccountId);

  const allEvents = useMemo(
    () => Object.keys(summary?.bottom_line_totals ?? {}),
    [summary]
  );
  const { selected, toggle, isSelected } = useMetricSelection(adAccountId ?? "none", allEvents);
  const { filterCells } = useCellRangeScope(a);

  // ── Unmapped cell detection ──────────────────────────────────────────
  // A cell is "unmapped" when it exists in performance_by_cell but has no
  // corresponding entry in MST.local_book2_library — no variable codes,
  // copy, or library metadata.
  const unmappedCellIds = useMemo(() => {
    if (!a || !mst) return new Set<string>();
    const uniqueIds = [...new Set(a.performance_by_cell.map((r) => r.cell_id))];
    return new Set(uniqueIds.filter((id) => !libraryCellById(mst, id)));
  }, [a, mst]);

  // ── Cell-scoped demographic index (Map for O(1) lookup per card) ─────
  const demoByCell = useMemo(() => {
    const map = new Map<string, DemographicRow[]>();
    for (const r of a?.demographic_registration_signal ?? []) {
      const arr = map.get(r.cell_id);
      if (arr) arr.push(r);
      else map.set(r.cell_id, [r]);
    }
    return map;
  }, [a]);

  // ── Account-level placements (same for every card) ───────────────────
  const allPlacements = useMemo(
    () => ([...(a?.v3_placement_signal ?? []), ...(a?.c4e_placement_signal ?? [])] as PlacementRow[]),
    [a]
  );

  // Deep-link: ?focus=<cell_id> opens the drawer on that cell
  useEffect(() => {
    if (focus && a) {
      const match = a.performance_by_cell.find((r) => r.cell_id === focus);
      if (match) setDetail(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <>
      <ModuleScopeGate section={SECTION} title="IAP Library" account={account}>
        {() => {
          const acct = account!;
          if (!a) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="IAP Library" />
                <ScopeBanner account={acct} />
                <PendingState title="Analysis pending" message="No analysis data available for this account yet." />
              </div>
            );
          }

          const filterRows = <T extends { "Result type": string }>(rows: T[]) =>
            rows.filter((r) => selected.includes(r["Result type"]));

          // Metric selection first, then the global date range
          const cells        = filterCells(filterRows(a.performance_by_cell));
          const variables    = filterRows(a.v3_variable_performance);
          const topCells     = filterCells(filterRows(a.top_checkout_cells));
          const topVariables = filterRows(a.top_checkout_variables);

          const totalSpend   = cells.reduce((s, r) => s + r["Amount spent (USD)"], 0);
          const totalResults = cells.reduce((s, r) => s + r.Results, 0);
          const uniqueCells  = new Set(cells.map((r) => r.cell_id)).size;

          const TABS: { id: Tab; label: string; count: number }[] = [
            { id: "cells",     label: "Creative cells",   count: cells.length },
            { id: "top",       label: "Top performers",   count: topCells.length + topVariables.length },
            { id: "variables", label: "Creative DNA",     count: variables.length },
          ];

          const pillarsForCell = (cellId: string) =>
            (strategy?.message_pillars ?? []).filter((p) => p.source_cells.includes(cellId));

          // Card grid helpers — deduplicate by cell_id (multiple result types
          // produce multiple rows per cell) and aggregate stats across the
          // metric-filtered selection for the card stat strip.
          const cardCtx = {
            perfRows: a.performance_by_cell,
            mst,
            ...getCreativeLinkContext(seed, adAccountId),
          };

          function aggStatsForCell(cellId: string, source: CellPerformanceRow[]): CreativeCardStats {
            const rows    = source.filter((r) => r.cell_id === cellId);
            const spend   = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
            const results = rows.reduce((s, r) => s + r.Results, 0);
            const primary = rows[0];
            return {
              spend,
              results,
              cpa:         results > 0 ? spend / results : null,
              ctrPct:      primary?.CTR_link_pct ?? null,
              resultLabel: rows.length === 1 ? eventLabel(primary!["Result type"]) : `${rows.length} events`,
            };
          }

          function uniqueCellRows(source: CellPerformanceRow[]): CellPerformanceRow[] {
            const seen = new Set<string>();
            return source.filter((r) => {
              if (seen.has(r.cell_id)) return false;
              seen.add(r.cell_id);
              return true;
            });
          }

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="IAP Library"
                subtitle="Creative cell and variable performance, filtered by metric selection."
                table="performance_by_cell, v3_variable_performance"
              />
              <ScopeBanner account={acct} />
              {focus && !a.performance_by_cell.some((r) => r.cell_id === focus) && (
                <StaleFocusNotice label="creative cell" />
              )}
              <MetricSelectionBar events={allEvents} isSelected={isSelected} onToggle={toggle} />
              <RangeScopeBar grainNote="Cell and variable metrics aggregate each creative's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="creative performance" />
              ) : (
              <>
              <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricTile label="Creative cells"     value={String(uniqueCells)} />
                <MetricTile label="Spend (selected)"   value={fmtUSD(totalSpend, 0)} />
                <MetricTile label="Results (selected)" value={fmtNum(totalResults)} />
                <MetricTile label="Avg CPA" value={totalResults > 0 ? fmtUSD(totalSpend / totalResults) : "—"} sub="spend ÷ results across selection" />
              </div>

              {/* Tabs + Add creatives action */}
              <div className="mt-4 flex items-center justify-end px-6 pb-0">
                <button
                  onClick={() => setCreativeLibraryOpen(true)}
                  className="mx-secondary-btn px-3 py-1.5 text-label"
                >
                  <Images className="w-3.5 h-3.5" />
                  Add creatives
                </button>
              </div>
              <div className="mt-1">
                <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
              </div>

              <div className="px-6 py-5 space-y-4">
                {(a.top_checkout_cells.length > 0 || a.top_checkout_variables.length > 0) && (
                  <CaveatNote text="V3 checkout results were not populated by age/gender. Demographic checkout claims remain directional based on spend and click quality, not result counts." />
                )}

                {/* ── Cells tab ── */}
                {tab === "cells" && (
                  <>
                    {/* Unmapped warning banner */}
                    {unmappedCellIds.size > 0 && (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.04]">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-px" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-body-lg font-medium text-amber-300/90">
                            {unmappedCellIds.size} creative {unmappedCellIds.size === 1 ? "cell" : "cells"} not fully mapped to IAP library
                          </p>
                          <p className="text-body text-muted-foreground/70 leading-relaxed">
                            {unmappedCellIds.size === 1 ? "This cell has" : "These cells have"} performance data but no library entry — variable codes, copy, and creative assets may be missing.
                          </p>
                        </div>
                        <button
                          onClick={() => setCreativeLibraryOpen(true)}
                          className="shrink-0 flex items-center gap-1.5 text-label font-medium text-amber-300 hover:text-amber-200 border border-amber-400/25 bg-amber-400/[0.06] hover:bg-amber-400/10 px-2.5 py-1.5 rounded-md transition-colors hover-elevate"
                        >
                          <Images className="w-3.5 h-3.5" />
                          Add creatives
                        </button>
                      </div>
                    )}

                    {cells.length ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {uniqueCellRows(cells).map((row) => (
                          <CreativeCard
                            key={row.cell_id}
                            data={{
                              ...cardFromCell(row.cell_id, cardCtx),
                              stats: aggStatsForCell(row.cell_id, cells),
                            }}
                            unmapped={unmappedCellIds.has(row.cell_id)}
                            demographic={demoByCell.get(row.cell_id) ?? []}
                            placements={allPlacements}
                            onUploadCreatives={() => setCreativeLibraryOpen(true)}
                            expandFooter={
                              <button
                                onClick={() => setDetail(row)}
                                className="inline-flex items-center gap-1 text-label font-medium text-primary/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
                              >
                                Full detail
                              </button>
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <PendingState title="No cells in selection" message="Adjust the metric selection to see cell performance." />
                    )}
                  </>
                )}

                {/* ── Top performers tab ── */}
                {tab === "top" && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-label font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">Top checkout cells</h3>
                      {topCells.length ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                          {uniqueCellRows(topCells).map((row) => (
                            <CreativeCard
                              key={row.cell_id}
                              data={{
                                ...cardFromCell(row.cell_id, cardCtx),
                                stats: aggStatsForCell(row.cell_id, topCells),
                              }}
                              unmapped={unmappedCellIds.has(row.cell_id)}
                              demographic={demoByCell.get(row.cell_id) ?? []}
                              placements={allPlacements}
                              onUploadCreatives={() => setCreativeLibraryOpen(true)}
                              expandFooter={
                                <button
                                  onClick={() => setDetail(row)}
                                  className="inline-flex items-center gap-1 text-label font-medium text-primary/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
                                >
                                  Full detail
                                </button>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <PendingState title="No ranked cells" message="No ranked cells in the current metric selection." />
                      )}
                    </div>
                    <div>
                      <h3 className="text-label font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">Top checkout variables</h3>
                      {topVariables.length ? <VariableTable rows={topVariables} /> : <PendingState title="No ranked variables" message="No ranked variables in the current metric selection." />}
                    </div>
                  </div>
                )}

                {/* ── Variables tab ── */}
                {tab === "variables" && (
                  variables.length
                    ? <VariableTable rows={variables} />
                    : <PendingState title="No variables in selection" message="Adjust the metric selection to see variable performance." />
                )}
              </div>
              </>
              )}

              {/* ── Cell detail drawer ── */}
              {detail && (
                <InfoDrawer
                  kicker={`Creative cell · ${detail.cell_id}`}
                  title={detail.book2_concept_name}
                  onClose={() => setDetail(null)}
                  footer={
                    <div className="flex items-center gap-4 flex-wrap">
                      <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />
                      <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                      <CrossLink to="/app/briefs/builder"      label="Open Brief Builder" />
                      <CrossLink to="/app/mst"                 label="View in MST" />
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MetricTile label="Spend"    value={fmtUSD(detail["Amount spent (USD)"], 0)} />
                    <MetricTile label="Results"  value={fmtNum(detail.Results)} sub={eventLabel(detail["Result type"])} />
                    <MetricTile label="CPA"      value={detail.CPA_result != null ? fmtUSD(detail.CPA_result) : "—"} />
                    <MetricTile label="Link CTR" value={fmtPct(detail.CTR_link_pct)} />
                  </div>
                  {detail.iap_read && <DrawerField label="IAP read">{detail.iap_read}</DrawerField>}
                  <DrawerField label="Variable stack">
                    <div className="space-y-1.5">
                      {VARIABLE_FIELDS.map(({ key, label }) => {
                        const code = detail[key];
                        if (!code || typeof code !== "string") return null;
                        return (
                          <div key={key} className="space-y-0.5">
                            <span className="block text-label text-muted-foreground/70 uppercase tracking-wide">{label}</span>
                            <span className="block text-label text-foreground/80">
                              {readableVariables(code)}
                              <span className="ml-1.5 text-label-xs font-mono text-muted-foreground/60">{code}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </DrawerField>
                  {pillarsForCell(detail.cell_id).length > 0 && (
                    <DrawerField label="Feeds strategy pillars">
                      <div className="space-y-1">
                        {pillarsForCell(detail.cell_id).map((p) => (
                          <div key={p.id} className="text-label text-foreground/80">{p.label}</div>
                        ))}
                      </div>
                    </DrawerField>
                  )}
                  {detail.legacy_library_match && (
                    <DrawerField label="Legacy library match">
                      <span className="font-mono text-label text-muted-foreground/60">{detail.legacy_library_match}</span>
                    </DrawerField>
                  )}
                  <DrawerField label="Creative">
                    <div className="max-w-full">
                      <CreativeCard
                        data={cardFromCell(detail.cell_id, {
                          perfRows: a.performance_by_cell,
                          mst,
                          ...getCreativeLinkContext(seed, adAccountId),
                        })}
                        unmapped={unmappedCellIds.has(detail.cell_id)}
                        demographic={demoByCell.get(detail.cell_id) ?? []}
                        placements={allPlacements}
                        onUploadCreatives={() => setCreativeLibraryOpen(true)}
                      />
                    </div>
                  </DrawerField>
                </InfoDrawer>
              )}

              {detail && (
                <SegmentGridModal
                  open={segmentsOpen}
                  onClose={() => setSegmentsOpen(false)}
                  kicker={`Creative cell · ${detail.cell_id}`}
                  title={detail.book2_concept_name}
                  analysis={a}
                  cellIds={[detail.cell_id]}
                />
              )}
            </div>
          );
        }}
      </ModuleScopeGate>

      {/* Creative library sync dialog — invalidates seed query on close */}
      {account && (
        <CreativeLibraryDialog
          account={account}
          open={creativeLibraryOpen}
          onOpenChange={setCreativeLibraryOpen}
        />
      )}
    </>
  );
}
