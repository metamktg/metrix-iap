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
import { Images, Dna } from "lucide-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getAnalysisData, getStrategyData, getCampaignSummary,
  getCreativeLinkContext, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import { useMetricSelection as useTileSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import {
  buildLibraryMetricCatalog, metricById,
  LIBRARY_METRIC_STORAGE_KEY, LIBRARY_DEFAULT_METRIC_IDS,
} from "@/lib/data/metricsCatalog";
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
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import { VariableDrilldownModal } from "@/components/creative/VariableDrilldownModal";
import { CellTable, VariableTable } from "./tables";
import { rollupDnaFamilies } from "@/lib/creative-dna";
import { VariableChip, familyLabel } from "../strategy/strategyShared";
import type { CreativeCardStats } from "@/components/creative/CreativeCard";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import type { SegmentId } from "@/lib/segment-analytics";
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
  // Variable drill-down (DNA cards, best-read chips, variable table rows)
  const [variableCode, setVariableCode] = useState<string | null>(null);
  // Segment drill-down opened from a card's Demographics tab (scoped to that cell)
  const [cardSegment, setCardSegment] = useState<{ segment: SegmentId; cellIds: string[] } | null>(null);
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

  // ── Customizable KPI tile row (library-scoped catalog + selection) ───
  // Built from the same metric- and range-filtered rows the grid uses so
  // the tiles always agree with what's below them.
  const libCells = useMemo(
    () => filterCells((a?.performance_by_cell ?? []).filter((r) => selected.includes(r["Result type"]))),
    [a, selected, filterCells]
  );
  const tileCatalog = useMemo(() => buildLibraryMetricCatalog(libCells), [libCells]);
  const tileCatalogIds = useMemo(() => tileCatalog.map((m) => m.id), [tileCatalog]);
  const {
    selected: tileIds, toggle: toggleTile, move: moveTile, reset: resetTiles,
  } = useTileSelection(tileCatalogIds, {
    storageKey: LIBRARY_METRIC_STORAGE_KEY,
    defaultIds: LIBRARY_DEFAULT_METRIC_IDS,
  });

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
              <div className="px-6 pt-5">
                <div className="flex items-center justify-end mb-2">
                  <MetricPickerButton catalog={tileCatalog} selected={tileIds} onToggle={toggleTile} onMove={moveTile} onReset={resetTiles} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {tileIds.map((id) => {
                    const m = metricById(tileCatalog, id);
                    if (!m) return null;
                    return <MetricTile key={m.id} label={m.label} value={m.formatted} sub={m.sub} />;
                  })}
                  {tileIds.length === 0 && (
                    <div className="col-span-2 md:col-span-4 text-[11px] text-muted-foreground/60 border border-dashed border-border/40 rounded-lg px-3 py-4 text-center">
                      No metrics selected — use “Customize” to add tiles.
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs + Add creatives action */}
              <div className="mt-4 flex items-center justify-end px-6 pb-0">
                <button
                  onClick={() => setCreativeLibraryOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/70 hover:text-foreground border border-border/40 hover:border-border/60 bg-white/[0.02] hover:bg-white/[0.04] px-2.5 py-1.5 rounded-md transition-colors"
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
                        <span className="text-amber-400 text-[13px] shrink-0 mt-px">⚠</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-[11px] font-medium text-amber-300/90">
                            {unmappedCellIds.size} creative {unmappedCellIds.size === 1 ? "cell" : "cells"} not fully mapped to IAP library
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                            {unmappedCellIds.size === 1 ? "This cell has" : "These cells have"} performance data but no library entry — variable codes, copy, and creative assets may be missing.
                          </p>
                        </div>
                        <button
                          onClick={() => setCreativeLibraryOpen(true)}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-300 hover:text-amber-200 border border-amber-400/25 bg-amber-400/[0.06] hover:bg-amber-400/10 px-2.5 py-1.5 rounded transition-colors"
                        >
                          <Images className="w-3 h-3" />
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
                            onSegmentClick={(seg) => setCardSegment({ segment: seg, cellIds: [row.cell_id] })}
                            expandFooter={(close) => (
                              <button
                                onClick={() => { close(); setDetail(row); }}
                                data-testid={`button-full-detail-${row.cell_id}`}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
                              >
                                Full detail
                              </button>
                            )}
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
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">Top checkout cells</h3>
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
                              onSegmentClick={(seg) => setCardSegment({ segment: seg, cellIds: [row.cell_id] })}
                              expandFooter={(close) => (
                                <button
                                  onClick={() => { close(); setDetail(row); }}
                                  data-testid={`button-full-detail-top-${row.cell_id}`}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
                                >
                                  Full detail
                                </button>
                              )}
                            />
                          ))}
                        </div>
                      ) : (
                        <PendingState title="No ranked cells" message="No ranked cells in the current metric selection." />
                      )}
                    </div>
                    <div>
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">Top checkout variables</h3>
                      {topVariables.length ? <VariableTable rows={topVariables} onRowClick={(r) => setVariableCode(r.variable_id)} /> : <PendingState title="No ranked variables" message="No ranked variables in the current metric selection." />}
                    </div>
                  </div>
                )}

                {/* ── Variables tab ── */}
                {tab === "variables" && (
                  variables.length ? (
                    <div className="space-y-4">
                      {/* Family rollup: which DNA families carry the account */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Dna className="w-3 h-3 text-primary/70" />
                          <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60">
                            DNA families in selection
                          </h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                          {rollupDnaFamilies(variables).map((f) => (
                            <div
                              key={f.family}
                              role={f.top ? "button" : undefined}
                              tabIndex={f.top ? 0 : undefined}
                              onClick={f.top ? () => setVariableCode(f.top!.variableId) : undefined}
                              onKeyDown={f.top ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setVariableCode(f.top!.variableId); } } : undefined}
                              title={f.top ? "Open drill-down for this family's best read" : undefined}
                              className={`rounded-xl border border-border/40 bg-white/[0.02] p-3 ${f.top ? "cursor-pointer hover:border-primary/30 hover:bg-white/[0.04] transition-colors" : ""}`}
                              data-testid={`dna-family-${f.family}`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-[11px] font-semibold text-foreground">{familyLabel(f.family)}</span>
                                <span className="text-[9px] font-mono text-muted-foreground/60">
                                  {f.variableCount} variable{f.variableCount === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 tabular-nums">
                                <div>
                                  <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-1">Spend</div>
                                  <div className="text-[11px] font-semibold text-foreground/90">{fmtUSD(f.spend, 0)}</div>
                                </div>
                                <div>
                                  <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-1">Results</div>
                                  <div className="text-[11px] font-semibold text-foreground/90">{fmtNum(f.results)}</div>
                                </div>
                                <div>
                                  <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-1">CPA</div>
                                  <div className="text-[11px] font-semibold text-foreground/90">{f.cpa != null ? fmtUSD(f.cpa) : "—"}</div>
                                </div>
                              </div>
                              {f.top && (
                                <div className="mt-2 pt-2 border-t border-border/20 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50">Best read</span>
                                  <VariableChip code={f.top.variableId} showCode={false} />
                                  {f.top.cpa != null && (
                                    <span className="text-[9px] tabular-nums text-muted-foreground/70">{fmtUSD(f.top.cpa)} CPA</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <VariableTable rows={variables} onRowClick={(r) => setVariableCode(r.variable_id)} />
                    </div>
                  ) : (
                    <PendingState title="No variables in selection" message="Adjust the metric selection to see variable performance." />
                  )
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
                  {/* Primary KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <MetricTile label="Spend"    value={fmtUSD(detail["Amount spent (USD)"], 0)} />
                    <MetricTile label="Results"  value={fmtNum(detail.Results)} sub={eventLabel(detail["Result type"])} />
                    <MetricTile label="CPA"      value={detail.CPA_result != null ? fmtUSD(detail.CPA_result) : "—"} />
                    <MetricTile label="Link CTR" value={fmtPct(detail.CTR_link_pct)} />
                  </div>
                  {/* Secondary delivery stats — derived from this row, dashes when absent */}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 rounded-lg border border-border/30 bg-white/[0.015] p-3">
                    {(() => {
                      const spend = detail["Amount spent (USD)"];
                      const imps = detail.Impressions;
                      const reach = detail.Reach;
                      const linkClicks = detail["Link clicks"];
                      const stats: { label: string; value: string }[] = [
                        { label: "Reach", value: fmtNum(reach) },
                        { label: "Impressions", value: fmtNum(imps) },
                        { label: "Frequency", value: reach > 0 ? (imps / reach).toFixed(2) : "—" },
                        { label: "Link clicks", value: fmtNum(linkClicks) },
                        { label: "CPM", value: imps > 0 ? fmtUSD((spend / imps) * 1000) : "—" },
                        { label: "CPC (link)", value: linkClicks > 0 ? fmtUSD(spend / linkClicks) : "—" },
                      ];
                      return stats.map((s) => (
                        <div key={s.label}>
                          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-1">{s.label}</div>
                          <div className="text-[11px] font-semibold tabular-nums text-foreground/90">{s.value}</div>
                        </div>
                      ));
                    })()}
                  </div>
                  <DrawerField label="Variable stack — tap a chip to drill down">
                    <div className="flex flex-wrap gap-1.5">
                      {VARIABLE_FIELDS.map(({ key, label }) => {
                        const code = detail[key];
                        if (!code || typeof code !== "string") return null;
                        return code.split(/\s*\+\s*/).filter(Boolean).map((c) => (
                          <button
                            key={key + c}
                            onClick={() => setVariableCode(c)}
                            title={`${label} — open variable drill-down`}
                            data-testid={`chip-drawer-variable-${c}`}
                            className="rounded transition-transform hover:scale-[1.04] active:scale-[0.97]"
                          >
                            <VariableChip code={c} />
                          </button>
                        ));
                      })}
                    </div>
                  </DrawerField>
                  {detail.iap_read && <DrawerField label="IAP read">{detail.iap_read}</DrawerField>}
                  {pillarsForCell(detail.cell_id).length > 0 && (
                    <DrawerField label="Feeds strategy pillars">
                      <div className="space-y-1">
                        {pillarsForCell(detail.cell_id).map((p) => (
                          <div key={p.id} className="text-[11px] text-foreground/80">{p.label}</div>
                        ))}
                      </div>
                    </DrawerField>
                  )}
                  {detail.legacy_library_match && (
                    <DrawerField label="Legacy library match">
                      <span className="font-mono text-[10px] text-muted-foreground/60">{detail.legacy_library_match}</span>
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

              {/* ── Variable drill-down (DNA cards, chips, table rows) ── */}
              <VariableDrilldownModal
                open={variableCode != null}
                onClose={() => setVariableCode(null)}
                code={variableCode}
                analysis={a}
                variableRows={variables}
                selectedResultTypes={selected}
              />

              {/* ── Segment drill-down from a card's Demographics tab ── */}
              <SegmentDrilldownModal
                open={cardSegment != null}
                onClose={() => setCardSegment(null)}
                segment={cardSegment?.segment ?? null}
                analysis={a}
                cellIds={cardSegment?.cellIds ?? null}
                kicker={cardSegment ? `Creative cell · ${cardSegment.cellIds[0]}` : undefined}
              />
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
