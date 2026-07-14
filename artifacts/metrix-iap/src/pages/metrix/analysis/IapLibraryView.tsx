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

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Images, Dna, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useSyncCreativeLinks, getGetMetrixSeedQueryKey, getAuthMeQueryKey, type AuthUser } from "@workspace/api-client-react";
import {
  getAdAccount, getAnalysisData, getStrategyData, getCampaignSummary,
  getCreativeLinkContext, getMST,
} from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import { useTileSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import {
  buildLibraryMetricCatalog, metricById,
  LIBRARY_METRIC_STORAGE_KEY, LIBRARY_DEFAULT_METRIC_IDS,
} from "@/lib/data/metricsCatalog";
import {
  ModuleHeader, ScopeBanner, ModuleTabs, ModuleScopeGate, PendingState, FlowCrumb, LoopAction, useFromParam,
  MetricTile, CaveatNote, MetricSelectionBar, CrossLink, useFocusParam,
  readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
  RangeScopeBar, NoDataInRangeState, StaleFocusNotice,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { ConceptFamilyView } from "@/components/creative/ConceptFamilyView";
import { cardFromCell, libraryCellById } from "@/lib/creative-assembly";
import { groupByConceptFamily } from "@/lib/concept-grouping";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import { VariableDrilldownModal } from "@/components/creative/VariableDrilldownModal";
import { CellTable, VariableTable } from "./tables";
import { rollupDnaFamilies } from "@/lib/creative-dna";
import { VariableChip, familyLabel } from "../strategy/strategyShared";
import type { CreativeCardStats } from "@/components/creative/CreativeCard";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { TaskTrayPanel } from "@/components/deck/TaskTrayPanel";
import { actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import type { SegmentId } from "@/lib/segment-analytics";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { CreativeLibraryDialog } from "@/pages/metrix/ConnectAccountDialogs";
import { useConceptHighlight } from "@/lib/concept-registry-context";

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
  const queryClient = useQueryClient();
  // Read the settled user from the query cache — avoids importing from
  // AuthContext (a Vite @refresh reset boundary) which would add this
  // module to the auth HMR graph and cause cascade crashes on codegen drift.
  const cachedUser = queryClient.getQueryData<AuthUser | null>(getAuthMeQueryKey());
  const isAdmin = cachedUser?.role === "admin";
  const syncMutation = useSyncCreativeLinks();
  const [syncResult, setSyncResult] = useState<{ linked: number; total: number } | null>(null);
  const [tab, setTab] = useState<Tab>("cells");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<CellPerformanceRow | null>(null);

  // ── Concept highlight (fired by ConceptChip hover in other views) ────
  const [highlightedCell, setHighlightedCell] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHighlight = useCallback((code: string) => {
    setHighlightedCell(code);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedCell(null), 2000);
    // Scroll the card into view if it exists on the current page
    setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-concept-cell="${code}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }, []);
  useConceptHighlight(onHighlight);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [creativeLibraryOpen, setCreativeLibraryOpen] = useState(false);
  const [groupByConcept, setGroupByConcept] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  // Variable drill-down (DNA cards, best-read chips, variable table rows)
  const [variableCode, setVariableCode] = useState<string | null>(null);
  // Segment drill-down opened from a card's Demographics tab (scoped to that cell)
  const [cardSegment, setCardSegment] = useState<{ segment: SegmentId; cellIds: string[] } | null>(null);
  // Full audience grid opened from a card's "Full breakdown" button on the Demographics tab
  const [cardGridCell, setCardGridCell] = useState<CellPerformanceRow | null>(null);
  const { rangeHasData } = useDateRange();

  const a       = getAnalysisData(seed, adAccountId);
  const summary = getCampaignSummary(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);
  const mst     = getMST(seed, adAccountId);
  const fp      = useFromParam();

  // Deck cards for Task Tray — derived from the account's optimization loop
  const optLoop = account?.iap?.optimization_loop ?? null;
  const deckCards: DeckCard[] = useMemo(
    () =>
      (optLoop?.recommendation_cards ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        rationale: c.rationale,
        recommendedAction: c.recommended_action,
        impact: c.impact,
        confidence: c.confidence,
        scope: c.scope,
        actionGroup: actionGroupForScope(c.scope),
      })),
    [optLoop]
  );

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

  // ── Concept family groups (for "Group by concept" toggle) ────────────
  // Computed at component top-level so no hook rules are violated.
  // libCells is the same metric- and date-filtered slice the grid uses.
  const conceptGroups = useMemo(
    () => groupByConceptFamily(libCells, mst),
    [libCells, mst]
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

  // Reset to page 1 whenever the active tab, account, or page size changes
  useEffect(() => { setPage(1); }, [tab, adAccountId, pageSize]);

  return (
    <>
      <ModuleScopeGate section={SECTION} title="IAP Library" account={account}>
        {() => {
          const acct = account!;
          if (!a) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="IAP Library" tabs="analysis" />
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

          // Cells that have uploaded creative assets but no performance data.
          // These are shown below the perf-cell grid so the user can see all
          // their uploaded images even before analysis has run on those cells.
          const perfCellIdsSet = new Set(a.performance_by_cell.map((r) => r.cell_id));
          const creativeOnlyCellIds = (() => {
            const seen = new Set<string>();
            const result: string[] = [];
            for (const ad of (cardCtx.ads ?? [])) {
              const cid = ad.cell;
              if (!cid || perfCellIdsSet.has(cid) || seen.has(cid) || !ad.creative_asset_url) continue;
              seen.add(cid);
              result.push(cid);
            }
            return result;
          })();

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
                tabs="analysis"
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

              {/* Tabs + filter bar actions */}
              <div className="mt-4 flex items-center justify-between px-6 pb-0">
                {/* Group by concept toggle — only meaningful on the cells tab */}
                {tab === "cells" ? (
                  <button
                    onClick={() => setGroupByConcept((v) => !v)}
                    aria-pressed={groupByConcept}
                    className={`flex items-center gap-1.5 text-[10px] font-medium border px-2.5 py-1.5 rounded-md transition-colors ${
                      groupByConcept
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/40 bg-white/[0.02] text-muted-foreground/70 hover:text-foreground hover:border-border/60 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Dna className="w-3.5 h-3.5" />
                    Group by concept
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  {isAdmin && adAccountId && (
                    <button
                      onClick={async () => {
                        setSyncResult(null);
                        try {
                          const result = await syncMutation.mutateAsync({ accountId: adAccountId });
                          setSyncResult({ linked: result.linked, total: result.total });
                          await queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
                        } catch {
                          // non-fatal — endpoint logs server-side
                        }
                      }}
                      disabled={syncMutation.isPending}
                      title={syncResult ? `${syncResult.linked}/${syncResult.total} creatives linked` : "Re-sync creative asset links"}
                      className={[
                        "flex items-center gap-1.5 text-[10px] font-medium border px-2.5 py-1.5 rounded-md transition-colors",
                        syncMutation.isPending
                          ? "border-border/30 text-muted-foreground/40 cursor-not-allowed"
                          : syncResult
                          ? "border-emerald-400/30 text-emerald-400/80 bg-emerald-400/[0.04] hover:bg-emerald-400/[0.08]"
                          : "border-border/40 text-muted-foreground/70 hover:text-foreground bg-white/[0.02] hover:bg-white/[0.04] hover:border-border/60",
                      ].join(" ")}
                    >
                      <RefreshCw className={["w-3.5 h-3.5", syncMutation.isPending ? "animate-spin" : ""].join(" ").trim()} />
                      {syncMutation.isPending
                        ? "Syncing…"
                        : syncResult
                        ? `${syncResult.linked}/${syncResult.total} linked`
                        : "Re-sync creatives"}
                    </button>
                  )}
                  <button
                    onClick={() => setCreativeLibraryOpen(true)}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/70 hover:text-foreground border border-border/40 hover:border-border/60 bg-white/[0.02] hover:bg-white/[0.04] px-2.5 py-1.5 rounded-md transition-colors"
                  >
                    <Images className="w-3.5 h-3.5" />
                    Add creatives
                  </button>
                </div>
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

                    {/* ── Grouped view ── */}
                    {groupByConcept ? (
                      cells.length ? (
                        <ConceptFamilyView
                          groups={conceptGroups}
                          cardCtx={cardCtx}
                          demoByCell={demoByCell}
                          allPlacements={allPlacements}
                          unmappedCellIds={unmappedCellIds}
                          onDetail={(row) => setDetail(row)}
                          onUploadCreatives={() => setCreativeLibraryOpen(true)}
                        />
                      ) : (
                        <PendingState title="No cells in selection" message="Adjust the metric selection to see cell performance." />
                      )
                    ) : (() => {
                      const uniqueCells = uniqueCellRows(cells);
                      const totalCells = uniqueCells.length;
                      const totalPages = Math.max(1, Math.ceil(totalCells / pageSize));
                      const safePage = Math.min(page, totalPages);
                      const pagedCells = uniqueCells.slice((safePage - 1) * pageSize, safePage * pageSize);
                      const rangeStart = (safePage - 1) * pageSize + 1;
                      const rangeEnd = Math.min(safePage * pageSize, totalCells);

                      if (totalCells === 0 && creativeOnlyCellIds.length === 0) {
                        return <PendingState title="No cells in selection" message="Adjust the metric selection to see cell performance." />;
                      }

                      return (
                        <div className="space-y-4">
                          {/* ── Performance cells ── */}
                          {totalCells > 0 && (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                {pagedCells.map((row) => (
                                  <div
                                    key={row.cell_id}
                                    data-concept-cell={row.cell_id}
                                    className={
                                      highlightedCell === row.cell_id
                                        ? "rounded-xl ring-2 ring-primary/70 ring-offset-1 ring-offset-background transition-all duration-300"
                                        : "transition-all duration-300"
                                    }
                                  >
                                    <CreativeCard
                                      data={{
                                        ...cardFromCell(row.cell_id, cardCtx),
                                        stats: aggStatsForCell(row.cell_id, cells),
                                      }}
                                      unmapped={unmappedCellIds.has(row.cell_id)}
                                      demographic={demoByCell.get(row.cell_id) ?? []}
                                      placements={allPlacements}
                                      onUploadCreatives={() => setCreativeLibraryOpen(true)}
                                      onSegmentClick={(seg) => setCardSegment({ segment: seg, cellIds: [row.cell_id] })}
                                      onFullBreakdownClick={() => setCardGridCell(row)}
                                      expandFooter={(close) => (
                                        <button
                                          onClick={() => { close(); setDetail(row); }}
                                          data-testid={`button-full-detail-${row.cell_id}`}
                                          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 border border-primary px-3 py-1.5 rounded-lg shadow-sm shadow-primary/20 transition-all"
                                        >
                                          Full detail →
                                        </button>
                                      )}
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* ── Pagination controls ── */}
                              <div className="flex items-center justify-between pt-3 border-t border-border/20">
                                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                                  {totalCells <= pageSize
                                    ? `${totalCells} creative${totalCells === 1 ? "" : "s"} with performance data`
                                    : `${rangeStart}–${rangeEnd} of ${totalCells}`}
                                </span>
                                <div className="flex items-center gap-3">
                                  {/* Page-size toggle */}
                                  <div className="flex items-center gap-0.5">
                                    {([10, 25, 50] as const).map((n) => (
                                      <button
                                        key={n}
                                        onClick={() => setPageSize(n)}
                                        className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${
                                          pageSize === n
                                            ? "bg-primary/15 text-primary"
                                            : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                      >
                                        {n}
                                      </button>
                                    ))}
                                    <span className="text-[9px] text-muted-foreground/35 ml-1">per page</span>
                                  </div>
                                  {/* Prev / page indicator / Next */}
                                  {totalPages > 1 && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={safePage === 1}
                                        className="text-[12px] w-6 h-6 flex items-center justify-center rounded border border-border/30 disabled:opacity-25 hover:bg-white/[0.04] transition-colors text-muted-foreground/70"
                                        aria-label="Previous page"
                                      >
                                        ‹
                                      </button>
                                      <span className="text-[10px] tabular-nums text-muted-foreground/50 px-1 min-w-[3rem] text-center">
                                        {safePage} / {totalPages}
                                      </span>
                                      <button
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={safePage === totalPages}
                                        className="text-[12px] w-6 h-6 flex items-center justify-center rounded border border-border/30 disabled:opacity-25 hover:bg-white/[0.04] transition-colors text-muted-foreground/70"
                                        aria-label="Next page"
                                      >
                                        ›
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}

                          {/* ── Creative assets without performance data ── */}
                          {creativeOnlyCellIds.length > 0 && (
                            <div className="space-y-3 pt-2 border-t border-border/15">
                              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
                                Creative assets — no performance data yet ({creativeOnlyCellIds.length})
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                {creativeOnlyCellIds.map((cellId) => (
                                  <CreativeCard
                                    key={cellId}
                                    data={{ ...cardFromCell(cellId, cardCtx), stats: aggStatsForCell(cellId, cells) }}
                                    unmapped={false}
                                    demographic={[]}
                                    placements={[]}
                                    onUploadCreatives={() => setCreativeLibraryOpen(true)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
                              onFullBreakdownClick={() => setCardGridCell(row)}
                              expandFooter={(close) => (
                                <button
                                  onClick={() => { close(); setDetail(row); }}
                                  data-testid={`button-full-detail-top-${row.cell_id}`}
                                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 border border-primary px-3 py-1.5 rounded-lg shadow-sm shadow-primary/20 transition-all"
                                >
                                  Full detail →
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
                  taskTray={adAccountId ? <TaskTrayPanel scopeId={adAccountId} cards={deckCards} compact /> : undefined}
                  footer={(() => {
                    // Contextual strategy navigation: find the pillar/hypothesis
                    // that cites this cell so the link lands in exactly the right place.
                    const matchedPillar = strategy?.message_pillars.find(
                      (p) => p.source_cells.includes(detail.cell_id),
                    );
                    const matchedHyp = matchedPillar
                      ? (strategy?.active_hypotheses.find(
                          (h) => h.pillar_id === matchedPillar.id && h.status === "ready_for_brief_builder",
                        ) ?? strategy?.active_hypotheses.find((h) => h.pillar_id === matchedPillar.id))
                      : null;
                    const stratUrl = matchedHyp
                      ? `/app/strategy/hypotheses?focus=${matchedHyp.id}&from=analysis&fromCell=${detail.cell_id}`
                      : `/app/strategy/map?from=analysis&fromCell=${detail.cell_id}`;
                    const briefUrl = `/app/briefs/builder?from=analysis&fromCell=${detail.cell_id}`;
                    return (
                      <div className="flex items-center gap-3 flex-wrap">
                        <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />
                        <LoopAction
                          to={stratUrl}
                          label={matchedPillar ? "See in Strategy" : "Open Strategy"}
                          icon="strategy"
                        />
                        <LoopAction
                          to={briefUrl}
                          label="Open Brief Builder"
                          icon="brief"
                          variant="secondary"
                        />
                        <CrossLink to="/app/mst" label="View in MST" />
                      </div>
                    );
                  })()}
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

              {/* ── Full audience grid opened from a card's Demographics tab ── */}
              {cardGridCell && (
                <SegmentGridModal
                  open={cardGridCell != null}
                  onClose={() => setCardGridCell(null)}
                  kicker={`Creative cell · ${cardGridCell.cell_id}`}
                  title={cardGridCell.book2_concept_name}
                  analysis={a}
                  cellIds={[cardGridCell.cell_id]}
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
