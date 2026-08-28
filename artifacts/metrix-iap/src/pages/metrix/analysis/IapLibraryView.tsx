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
import { TYPE, HEADING } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { Images, Dna, RefreshCw, AlertTriangle, PlayCircle, TrendingUp, TrendingDown, Sliders } from "lucide-react";
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
  type MetricDef,
} from "@/lib/data/metricsCatalog";
import {
  ModuleHeader, ModuleTabs, ModuleScopeGate, PendingState, FlowCrumb, LoopAction, useFromParam,
  MetricTile, CaveatNote, MetricSelectionBar, CrossLink, useFocusParam, useTabParam,
  readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
  StaleFocusNotice, PILL_ACTIVE, PILL_INACTIVE,
  SectionInfoIcon,
} from "../shared";
import { useCellRunScope, usePersistedRunScope } from "@/lib/run-scope";
import { RunScopePicker } from "@/components/analysis/RunSelector";
import { BreakdownExplorer } from "@/components/analysis/BreakdownExplorer";
import { listBreakdownDimensions } from "@/lib/data/kpiBreakdown";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { ConceptFamilyView } from "@/components/creative/ConceptFamilyView";
import { cardFromCell, libraryCellById } from "@/lib/creative-assembly";
import { demographicEmptyReasonFor, placementsEmptyReasonFor } from "@/lib/creative-empty-reasons";
import { groupByConceptFamily } from "@/lib/concept-grouping";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import { VariableDrilldownModal } from "@/components/creative/VariableDrilldownModal";
import { CellTable, VariableTable } from "./tables";
import { rollupDnaFamilies } from "@/lib/creative-dna";
import { VariableChip, familyLabel } from "../strategy/strategyShared";
import type { CreativeCardStats } from "@/components/creative/CreativeCard";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import type { SegmentId } from "@/lib/segment-analytics";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { CreativeLibraryDialog, ManualImportDialog } from "@/pages/metrix/ConnectAccountDialogs";
import { CellCreativeUploadDialog } from "@/components/creative/CellCreativeUploadDialog";
import { DeconstructionReviewQueue } from "@/components/creative/DeconstructionReviewQueue";
import { useConceptHighlight } from "@/lib/concept-registry-context";
import {
  type FunnelStage, FUNNEL_STAGE_CONFIGS, getFunnelStageConfig,
} from "@/lib/funnelStages";
import {
  CreativeFilterPanel, DEFAULT_FILTER_STATE, applyCreativeFilters, sortValueForCell,
  type CreativeFilterState,
  describeCreativeFilters,
} from "@/components/creative/CreativeFilterPanel";
import { FilterDisclosure } from "@/components/widgets/FilterDisclosure";

const SECTION = "Analysis · 03";

type Tab = "cells" | "copy" | "top" | "variables" | "breakdown" | "review";
const TAB_IDS: readonly Tab[] = ["cells", "copy", "top", "variables", "breakdown", "review"];

const VARIABLE_FIELDS: { key: keyof CellPerformanceRow; label: string }[] = [
  { key: "hook_variable",       label: "Hook" },
  { key: "tone_variable",       label: "Tone" },
  { key: "framework_variable",  label: "Framework" },
  { key: "concept_variable",    label: "Concept" },
  { key: "pain_proof_variable", label: "Pain / proof" },
  { key: "proof_variable",      label: "Proof" },
  { key: "cta_variable",        label: "CTA" },
  { key: "funnel_stage_variable", label: "Funnel stage" },
  { key: "awareness_variable",  label: "Awareness" },
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
  const [tab, setTab] = useTabParam<Tab>("cells", TAB_IDS);
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
  const [importOpen, setImportOpen] = useState(false);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  // ── Tile-level segment grid: tracks which metric tile the user clicked ─
  const [tileSegmentsOpen, setTileSegmentsOpen] = useState(false);
  const [tileSegmentMetric, setTileSegmentMetric] = useState<MetricDef | null>(null);
  const [creativeLibraryOpen, setCreativeLibraryOpen] = useState(false);
  const [uploadCellId, setUploadCellId] = useState<string | null>(null);
  const [groupByConcept, setGroupByConcept] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  // ── Funnel stage + creative filters (local, non-persisted) ───────────
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("custom");
  const [creativeFilters, setCreativeFilters] = useState<CreativeFilterState>(DEFAULT_FILTER_STATE);
  // Variable drill-down (DNA cards, best-read chips, variable table rows)
  const [variableCode, setVariableCode] = useState<string | null>(null);
  // Segment drill-down opened from a card's Demographics tab (scoped to that cell)
  const [cardSegment, setCardSegment] = useState<{ segment: SegmentId; cellIds: string[] } | null>(null);
  // Full audience grid opened from a card's "Full breakdown" button on the Demographics tab
  const [cardGridCell, setCardGridCell] = useState<CellPerformanceRow | null>(null);
  const a       = getAnalysisData(seed, adAccountId);
  const summary = getCampaignSummary(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);
  const mst     = getMST(seed, adAccountId);
  const fp      = useFromParam();
  const { data: analysisRunsData } = useListAnalysisRuns(adAccountId ?? "", { query: { enabled: !!adAccountId, queryKey: getListAnalysisRunsQueryKey(adAccountId ?? "") } });
  const [runSelection, setRunSelection] = usePersistedRunScope(
    "iap-library", adAccountId, analysisRunsData?.runs,
  );

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
  const { filterByRun } = useCellRunScope(a, runSelection);

  // ── Customizable KPI tile row (library-scoped catalog + selection) ───
  // Built from the same metric- and run-filtered rows the grid uses so
  // the tiles always agree with what's below them.
  const libCells = useMemo(
    () => filterByRun((a?.performance_by_cell ?? []).filter((r) => selected.includes(r["Result type"]))),
    [a, selected, filterByRun]
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
    selected: savedTileIds, toggle: toggleTile, move: moveTile, reset: resetTiles,
  } = useTileSelection(tileCatalogIds, {
    storageKey: LIBRARY_METRIC_STORAGE_KEY,
    defaultIds: LIBRARY_DEFAULT_METRIC_IDS,
  });

  // When a named funnel stage is active, override tile IDs with the stage's preset.
  // Filter the stage tile IDs against what's actually in the catalog (some may be absent
  // for single-event accounts). Fall back to saved IDs for "custom".
  const funnelConfig = useMemo(() => getFunnelStageConfig(funnelStage), [funnelStage]);
  const tileIds = useMemo(() => {
    if (!funnelConfig) return savedTileIds;
    const available = new Set(tileCatalogIds);
    const filtered = funnelConfig.tileIds.filter((id) => available.has(id));
    return filtered.length > 0 ? filtered : savedTileIds;
  }, [funnelConfig, savedTileIds, tileCatalogIds]);

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
                <ModuleHeader section={SECTION} title="IAP Library" accountName={acct.name} tabs="analysis" />
                <PendingState
                  title="Analysis pending"
                  message="No analysis data available for this account yet."
                  action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
                />
              </div>
            );
          }

          const filterRows = <T extends { "Result type": string }>(rows: T[]) =>
            rows.filter((r) => selected.includes(r["Result type"]));

          // Metric selection first, then the analysis-run scope
          const cells        = filterByRun(filterRows(a.performance_by_cell));
          const variables    = filterRows(a.v3_variable_performance);
          const topCells     = filterByRun(filterRows(a.top_checkout_cells));
          const topVariables = filterRows(a.top_checkout_variables);

          // Ad copy tab: real cells that carry a mapped MST library primary
          // message. Real text only — cells without a library mapping (or
          // whose mapping has no primary_message) never appear here rather
          // than showing an empty quote.
          const copyCells = uniqueCellRows(cells).filter(
            (row) => !!libraryCellById(mst, row.cell_id)?.primary_message
          );

          const TABS: { id: Tab; label: string; count: number }[] = [
            { id: "cells",     label: "Creative cells",   count: cells.length },
            { id: "copy",      label: "Ad copy",          count: copyCells.length },
            { id: "top",       label: "Top performers",   count: topCells.length + topVariables.length },
            { id: "variables", label: "Variable performance", count: variables.length },
            // Breakdown: dimension × metric × chart cross-tab (Nocturne
            // "Metrix v1" design). Count = dimensions actually backed by rows.
            { id: "breakdown", label: "Breakdown",        count: listBreakdownDimensions(a).length },
            {
              id: "review",
              label: "Review queue",
              count: (account?.creative_deconstructions ?? []).filter((d) => d.status === "needs_review").length,
            },
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
                accountName={acct.name}
                subtitle="Cell & variable performance · by metric selection"
                tabs="analysis"
                right={
                  <RunScopePicker
                    runs={analysisRunsData?.runs ?? []}
                    value={runSelection}
                    onChange={setRunSelection}
                  />
                }
              />
              {focus && !a.performance_by_cell.some((r) => r.cell_id === focus) && (
                <StaleFocusNotice label="creative cell" />
              )}
              <MetricSelectionBar events={allEvents} isSelected={isSelected} onToggle={toggle} />

              {/* ── Funnel stage selector ── */}
              <div className="px-6 pt-3 pb-1 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
                <span className="text-label text-muted-foreground/75 shrink-0">Funnel</span>
                <div className="flex items-center rounded-md border border-border/30 overflow-hidden">
                  {(["upper", "lower", "custom"] as const).map((stage) => {
                    const label = stage === "upper" ? "Upper Funnel" : stage === "lower" ? "Lower Funnel" : "Custom";
                    const icon = stage === "upper"
                      ? <TrendingUp className="w-3 h-3 shrink-0" />
                      : stage === "lower"
                      ? <TrendingDown className="w-3 h-3 shrink-0" />
                      : null;
                    return (
                      <button
                        key={stage}
                        onClick={() => {
                          setFunnelStage(stage);
                          // Reset filters when switching stages
                          setCreativeFilters(DEFAULT_FILTER_STATE);
                          setPage(1);
                        }}
                        className={[
                          "pressable flex items-center gap-1 px-2.5 py-1 text-label font-medium transition-colors",
                          funnelStage === stage
                            ? "bg-foreground/10 text-foreground"
                            : "text-muted-foreground/75 hover:text-muted-foreground/75 hover:bg-foreground/[0.03]",
                        ].join(" ")}
                      >
                        {icon}{label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-6 pt-5">
                <div className="flex items-center justify-between mb-2">
                  {/* Funnel stage badge + section info */}
                  <div className="flex items-center gap-1.5">
                    {funnelConfig && (
                      <span className="text-micro font-semibold uppercase tracking-widest text-interactive/70 border border-primary/25 bg-primary/[0.06] px-2 py-0.5 rounded">
                        {funnelConfig.badge}
                      </span>
                    )}
                    <SectionInfoIcon tip="Aggregates every creative cell's full flight window for the selected metrics, so you can compare cell and variable performance side by side." />
                  </div>
                  <MetricPickerButton
                    catalog={tileCatalog}
                    selected={funnelStage === "custom" ? savedTileIds : tileIds}
                    onToggle={(id) => { setFunnelStage("custom"); toggleTile(id); }}
                    onMove={(id, dir) => { setFunnelStage("custom"); moveTile(id, dir); }}
                    onReset={() => { setFunnelStage("custom"); resetTiles(); }}
                  />
                </div>
                <div className="grid grid-cols-dashboard-4 gap-3">
                  {tileIds.map((id) => {
                    const m = metricById(tileCatalog, id);
                    if (!m) return null;
                    // lib_cells is a raw count (unique creative cells in selection)
                    // — it has no meaningful segment-level breakdown, so don't make it clickable.
                    const isSegmentable = m.id !== "lib_cells";
                    return (
                      <MetricTile
                        key={m.id}
                        label={m.label}
                        value={m.formatted}
                        sub={m.sub}
                        onClick={isSegmentable ? () => { setTileSegmentMetric(m); setTileSegmentsOpen(true); } : undefined}
                      />
                    );
                  })}
                  {tileIds.length === 0 && (
                    <div className="col-span-2 md:col-span-4 text-caption text-muted-foreground/75 border border-dashed border-border/40 rounded-lg px-3 py-4 text-center">
                      No metrics selected — use "Customize" to add tiles.
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
                    className={`flex items-center gap-1.5 text-label font-medium border px-2.5 py-1.5 rounded-md transition-colors ${
                      groupByConcept ? PILL_ACTIVE : PILL_INACTIVE
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
                        "pressable flex items-center gap-1.5 text-label font-medium border px-2.5 py-1.5 rounded-md transition-colors",
                        syncMutation.isPending
                          ? "border-border/30 text-muted-foreground/75 cursor-not-allowed"
                          : syncResult
                          ? "border-status-success/30 text-status-success/80 bg-status-success/[0.04] hover:bg-status-success/[0.08]"
                          : "border-border/40 text-muted-foreground/75 hover:text-foreground bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-border/60",
                      ].join(" ")}
                    >
                      <RefreshCw className={["pressable w-3.5 h-3.5", syncMutation.isPending ? "animate-spin" : ""].join(" ").trim()} />
                      {syncMutation.isPending
                        ? "Syncing…"
                        : syncResult
                        ? `${syncResult.linked}/${syncResult.total} linked`
                        : "Re-sync creatives"}
                    </button>
                  )}
                  <button
                    onClick={() => setImportOpen(true)}
                    className="pressable flex items-center gap-1.5 text-label font-medium text-foreground/80 hover:text-foreground border border-primary/30 hover:border-primary/50 bg-primary/[0.07] hover:bg-primary/[0.12] px-2.5 py-1.5 rounded-md transition-colors"
                  >
                    <PlayCircle className="w-3.5 h-3.5 text-interactive" />
                    Upload &amp; Run Analysis
                  </button>
                  <button
                    onClick={() => setCreativeLibraryOpen(true)}
                    className="pressable flex items-center gap-1.5 text-label font-medium text-muted-foreground/75 hover:text-foreground border border-border/40 hover:border-border/60 bg-foreground/[0.02] hover:bg-foreground/[0.04] px-2.5 py-1.5 rounded-md transition-colors"
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
                      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-status-warning/25 bg-status-warning/[0.04]">
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-px" strokeWidth={1.5} />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-caption font-medium text-status-warning/90">
                            {unmappedCellIds.size} creative {unmappedCellIds.size === 1 ? "cell" : "cells"} not fully mapped to IAP library
                          </p>
                          <p className="text-label text-muted-foreground/75">Missing library entry — assets may be incomplete.</p>
                        </div>
                        <button
                          onClick={() => setCreativeLibraryOpen(true)}
                          className="pressable shrink-0 flex items-center gap-1 text-label font-medium text-status-warning border border-status-warning/35 bg-status-warning/10 hover:bg-status-warning/20 px-2.5 py-1.5 rounded transition-colors"
                        >
                          <Images className="w-3.5 h-3.5" />
                          Add creatives
                        </button>
                      </div>
                    )}

                    {/* ── Grouped view ── */}
                    {groupByConcept ? (() => {
                      // Apply the same funnel sort + creative filters used in the flat grid
                      const sortKey = funnelConfig?.sortKey ?? "none";
                      const sortDir = funnelConfig?.sortDir ?? "desc";
                      let sortedCells = uniqueCellRows(cells);
                      if (sortKey !== "none") {
                        sortedCells = [...sortedCells].sort((a, b) => {
                          const va = sortValueForCell(a, sortKey);
                          const vb = sortValueForCell(b, sortKey);
                          return sortDir === "asc" ? va - vb : vb - va;
                        });
                      }
                      const totalBeforeFilter = sortedCells.length;
                      const effectiveSortKey = sortKey === "none" ? "spend" : sortKey;
                      // Determine which cell IDs survive the filters using the deduped
                      // representative rows (same eligibility logic as the flat grid).
                      const filteredDeduped = applyCreativeFilters(sortedCells, creativeFilters, effectiveSortKey, sortDir);
                      const survivingIds = new Set(filteredDeduped.map((r) => r.cell_id));
                      // Pass the FULL multi-result-type rows for surviving cells so that
                      // groupByConceptFamily can compute correct blended KPI aggregates.
                      const filteredFullRows = cells.filter((r) => survivingIds.has(r.cell_id));
                      const filteredConceptGroups = groupByConceptFamily(filteredFullRows, mst);

                      // Concept options always reflect the full (pre-filter) concept set
                      const conceptOptionNames = [...new Set(
                        conceptGroups.map((g) => g.conceptName).filter(Boolean) as string[]
                      )];

                      // Map funnel sort key to the nearest CellRankKpi for within-angle ordering
                      const rankKpi: import("@/lib/concept-grouping").CellRankKpi =
                        sortKey === "cpa"     ? "cpa"
                        : sortKey === "spend"   ? "spend"
                        : sortKey === "results" ? "results"
                        : sortKey === "ctr"     ? "ctr"
                        : "cpa";

                      if (totalBeforeFilter === 0) {
                        return <PendingState title="No cells in selection" message="Adjust the metric selection to see cell performance." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />;
                      }

                      return (
                        <div className="space-y-4">
                          {/* Collapsed by default — most sessions never touch it, and
                              it sat between the reader and the grid on every visit. The
                              ACTIVE filters stay on screen as chips whether it is open
                              or shut: a hidden filter would make this grid claim the
                              account has fewer creatives than it does. */}
                          <FilterDisclosure
                            activeSummary={describeCreativeFilters(creativeFilters)}
                            resultNote={`${filteredDeduped.length} of ${totalBeforeFilter} cells`}
                            onClear={() => { setCreativeFilters(DEFAULT_FILTER_STATE); setPage(1); }}
                          >
                            <CreativeFilterPanel
                              filters={creativeFilters}
                              onChange={(f) => { setCreativeFilters(f); setPage(1); }}
                              conceptOptions={conceptOptionNames}
                              shownCount={filteredDeduped.length}
                              totalCount={totalBeforeFilter}
                            />
                          </FilterDisclosure>

                          {filteredConceptGroups.length === 0 ? (
                            <PendingState
                              title="No cells match filters"
                              message="Adjust the spend floor, tier, or concept filter to see cells."
                              action={
                                <button
                                  onClick={() => setCreativeFilters(DEFAULT_FILTER_STATE)}
                                  className="pressable text-interactive hover:underline text-label"
                                >
                                  Clear filters
                                </button>
                              }
                            />
                          ) : (
                            <ConceptFamilyView
                              groups={filteredConceptGroups}
                              cardCtx={cardCtx}
                              demoByCell={demoByCell}
                              allPlacements={allPlacements}
                              unmappedCellIds={unmappedCellIds}
                              rankKpi={rankKpi}
                              onDetail={(row) => setDetail(row)}
                              onUploadCreatives={() => setCreativeLibraryOpen(true)}
                              onUploadCreative={adAccountId ? (cellId) => setUploadCellId(cellId) : undefined}
                            />
                          )}
                        </div>
                      );
                    })() : (() => {
                      // Apply funnel sort then creative filters
                      const sortKey = funnelConfig?.sortKey ?? "none";
                      const sortDir = funnelConfig?.sortDir ?? "desc";
                      let sortedCells = uniqueCellRows(cells);
                      if (sortKey !== "none") {
                        sortedCells = [...sortedCells].sort((a, b) => {
                          const va = sortValueForCell(a, sortKey);
                          const vb = sortValueForCell(b, sortKey);
                          return sortDir === "asc" ? va - vb : vb - va;
                        });
                      }
                      const totalBeforeFilter = sortedCells.length;
                      const filteredCells = applyCreativeFilters(sortedCells, creativeFilters, sortKey === "none" ? "spend" : sortKey, sortDir);
                      const conceptOptionNames = [...new Set(
                        conceptGroups.map((g) => g.conceptName).filter(Boolean) as string[]
                      )];
                      const totalCells = filteredCells.length;
                      const totalPages = Math.max(1, Math.ceil(totalCells / pageSize));
                      const safePage = Math.min(page, totalPages);
                      const pagedCells = filteredCells.slice((safePage - 1) * pageSize, safePage * pageSize);
                      const rangeStart = (safePage - 1) * pageSize + 1;
                      const rangeEnd = Math.min(safePage * pageSize, totalCells);

                      if (totalBeforeFilter === 0 && creativeOnlyCellIds.length === 0) {
                        return <PendingState title="No cells in selection" message="Adjust the metric selection to see cell performance." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />;
                      }

                      return (
                        <div className="space-y-4">
                          <FilterDisclosure
                            activeSummary={describeCreativeFilters(creativeFilters)}
                            resultNote={`${totalCells} of ${totalBeforeFilter} cells`}
                            onClear={() => { setCreativeFilters(DEFAULT_FILTER_STATE); setPage(1); }}
                          >
                            <CreativeFilterPanel
                              filters={creativeFilters}
                              onChange={(f) => { setCreativeFilters(f); setPage(1); }}
                              conceptOptions={conceptOptionNames}
                              shownCount={totalCells}
                              totalCount={totalBeforeFilter}
                            />
                          </FilterDisclosure>

                          {totalCells === 0 && (
                            <PendingState
                              title="No cells match filters"
                              message="Adjust the spend floor, tier, or concept filter to see cells."
                              action={<button onClick={() => setCreativeFilters(DEFAULT_FILTER_STATE)} className="pressable text-interactive hover:underline text-label">Clear filters</button>}
                            />
                          )}

                          {/* ── Performance cells ── */}
                          {totalCells > 0 && (
                            <>
                              <div className="grid grid-cols-dashboard-5-xl gap-3">
                                {pagedCells.map((row) => (
                                  <div
                                    key={row.cell_id}
                                    data-concept-cell={row.cell_id}
                                    className={
                                      highlightedCell === row.cell_id
                                        ? "rounded-xl ring-2 ring-primary/70 ring-offset-1 ring-offset-background transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300"
                                        : "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300"
                                    }
                                  >
                                    <CreativeCard
                                      data={{
                                        ...cardFromCell(row.cell_id, cardCtx),
                                        stats: aggStatsForCell(row.cell_id, cells),
                                      }}
                                      perfRow={row}
                                      unmapped={unmappedCellIds.has(row.cell_id)}
                                      demographic={demoByCell.get(row.cell_id) ?? []}
                                      placements={allPlacements}
                                      demographicEmptyReason={demographicEmptyReasonFor(a?.demographic_registration_signal ?? [], row.cell_id)}
                                      placementsEmptyReason={placementsEmptyReasonFor(allPlacements)}
                                      onUploadCreatives={() => setCreativeLibraryOpen(true)}
                                      onUploadCreative={adAccountId ? (cellId) => setUploadCellId(cellId) : undefined}
                                      onSegmentClick={(seg) => setCardSegment({ segment: seg, cellIds: [row.cell_id] })}
                                      onFullBreakdownClick={() => setCardGridCell(row)}
                                      expandFooter={(close) => (
                                        <button
                                          onClick={() => { close(); setDetail(row); }}
                                          data-testid={`button-full-detail-${row.cell_id}`}
                                          className="pressable inline-flex items-center gap-1.5 text-title font-bold text-foreground bg-primary hover:bg-primary/90 border border-primary px-3 py-1.5 rounded-lg shadow-sm shadow-primary/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
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
                                <span className="text-label text-muted-foreground/75 tabular-nums">
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
                                        className={`text-label font-medium px-2 py-1 rounded transition-colors ${
                                          pageSize === n
                                            ? "bg-primary/15 text-interactive"
                                            : "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]"
                                        }`}
                                      >
                                        {n}
                                      </button>
                                    ))}
                                    <span className="text-label text-muted-foreground/75 ml-1">per page</span>
                                  </div>
                                  {/* Prev / page indicator / Next */}
                                  {totalPages > 1 && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={safePage === 1}
                                        className="pressable text-body w-6 h-6 flex items-center justify-center rounded border border-border/30 disabled:opacity-25 hover:bg-foreground/[0.04] transition-colors text-muted-foreground/75"
                                        aria-label="Previous page"
                                      >
                                        ‹
                                      </button>
                                      <span className="text-label tabular-nums text-muted-foreground/75 px-1 min-w-[3rem] text-center">
                                        {safePage} / {totalPages}
                                      </span>
                                      <button
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={safePage === totalPages}
                                        className="pressable text-body w-6 h-6 flex items-center justify-center rounded border border-border/30 disabled:opacity-25 hover:bg-foreground/[0.04] transition-colors text-muted-foreground/75"
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
                              <p className="text-label uppercase tracking-widest text-muted-foreground/75">
                                Creative assets — no performance data yet ({creativeOnlyCellIds.length})
                              </p>
                              <div className="grid grid-cols-dashboard-5-xl gap-3">
                                {creativeOnlyCellIds.map((cellId) => (
                                  <CreativeCard
                                    key={cellId}
                                    data={{ ...cardFromCell(cellId, cardCtx), stats: aggStatsForCell(cellId, cells) }}
                                    unmapped={false}
                                    demographic={[]}
                                    placements={[]}
                                    onUploadCreatives={() => setCreativeLibraryOpen(true)}
                                    onUploadCreative={adAccountId ? (id) => setUploadCellId(id) : undefined}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Ad-level tiles ─────────────────────────────
                        Every ad in the analysis renders a tile, even when
                        it has no cell/concept code (typical for manual
                        imports of historical accounts). Real creative when
                        mapped; otherwise a placeholder that deep-links to
                        the manual creative import flow. */}
                    {(() => {
                      const seenNames = new Set<string>();
                      const adLevelAds = (cardCtx.ads ?? []).filter((ad) => {
                        if (!ad.ad_name || ad.ad_name.startsWith("__cell_override_")) return false;
                        if (seenNames.has(ad.ad_name)) return false;
                        seenNames.add(ad.ad_name);
                        // Ads already represented by a performance-cell or
                        // creative-only card are covered above.
                        if (ad.cell && (perfCellIdsSet.has(ad.cell) || creativeOnlyCellIds.includes(ad.cell))) return false;
                        return true;
                      });
                      if (adLevelAds.length === 0) return null;
                      return (
                        <div className="space-y-3 pt-2 border-t border-border/15" data-testid="section-ad-level-tiles">
                          <p className="text-label uppercase tracking-widest text-muted-foreground/75">
                            Ads without creative cells ({adLevelAds.length})
                          </p>
                          <div className="grid grid-cols-dashboard-5-xl gap-3">
                            {adLevelAds.map((ad) => {
                              const p = ad.performance ?? null;
                              return (
                                <CreativeCard
                                  key={ad.ad_name}
                                  data={{
                                    conceptCode: ad.concept ?? ad.cell ?? "AD",
                                    title: ad.ad_name,
                                    assetUrl: ad.creative_asset_url ?? null,
                                    assetFilename: ad.asset_filename ?? null,
                                    tags: [],
                                    metaAdId: ad.meta_ad_id ?? null,
                                    adAccountId: cardCtx.metaAdAccountId,
                                    stats: p
                                      ? {
                                          spend: p.spend,
                                          results: p.results,
                                          cpa: p.results > 0 ? p.spend / p.results : null,
                                          ctrPct: p.impressions > 0 ? (p.link_clicks / p.impressions) * 100 : null,
                                          resultLabel: p.result_type ? eventLabel(p.result_type) : undefined,
                                        }
                                      : undefined,
                                  }}
                                  unmapped={!ad.creative_asset_url}
                                  demographic={[]}
                                  placements={[]}
                                  onUploadCreatives={() => setCreativeLibraryOpen(true)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* ── Ad copy tab ──────────────────────────────────────
                    Real MST library primary text per cell, read against
                    the same result the cell's performance rows produced.
                    A cell's performance CPA (spend-weighted across its
                    metric-filtered rows) ranks it into a real Top 25% /
                    Mid 50% / Bottom 25% tier within this same set — never
                    a fabricated grade. */}
                {tab === "copy" && (
                  copyCells.length === 0 ? (
                    <PendingState
                      title="No ad copy in selection"
                      message="No creative cell in the current metric selection has mapped primary text yet."
                      action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
                    />
                  ) : (() => {
                    const conceptAngleByCellId = new Map<string, { conceptName: string; angleLabel: string }>();
                    for (const g of conceptGroups) {
                      for (const ag of g.angles) {
                        for (const c of ag.cells) {
                          if (!conceptAngleByCellId.has(c.cell_id)) {
                            conceptAngleByCellId.set(c.cell_id, { conceptName: g.conceptName, angleLabel: ag.angleLabel });
                          }
                        }
                      }
                    }

                    const copyStats = copyCells.map((row) => ({ row, stats: aggStatsForCell(row.cell_id, cells) }));
                    const rankedCpas = copyStats
                      .map(({ stats }) => stats.cpa)
                      .filter((v): v is number => v != null)
                      .sort((a, b) => a - b);
                    const p25 = rankedCpas[Math.floor(rankedCpas.length * 0.25)] ?? rankedCpas[rankedCpas.length - 1];
                    const p75 = rankedCpas[Math.floor(rankedCpas.length * 0.75)] ?? rankedCpas[rankedCpas.length - 1];
                    const tierFor = (cpa: number | null): { label: string; cls: string } => {
                      if (cpa == null || rankedCpas.length < 2) {
                        return { label: "Unranked", cls: "bg-foreground/[0.05] text-muted-foreground/75 border-border/30" };
                      }
                      if (cpa <= p25) return { label: "Top 25%", cls: "bg-status-success/10 text-status-success border-status-success/25" };
                      if (cpa >= p75) return { label: "Bottom 25%", cls: "bg-status-warning/10 text-status-warning border-status-warning/25" };
                      return { label: "Mid 50%", cls: "bg-foreground/[0.05] text-muted-foreground/75 border-border/30" };
                    };

                    return (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4">
                          <p className="text-label uppercase tracking-widest text-muted-foreground/75 mb-1">Text assets</p>
                          <h3 className="text-title font-bold text-foreground mb-1">Meta ad copy, read against the same result</h3>
                          <p className="text-caption text-muted-foreground/75 leading-relaxed">
                            Primary text for every cell in scope, so a copy pattern can be judged next to what it actually cost.
                          </p>
                        </div>
                        <div className="grid grid-cols-dashboard-4-xl gap-3">
                          {copyStats.map(({ row, stats }) => {
                            const lib = libraryCellById(mst, row.cell_id);
                            const tier = tierFor(stats.cpa ?? null);
                            const ctx = conceptAngleByCellId.get(row.cell_id);
                            const conceptLabel = ctx?.conceptName ?? lib?.book2_concept_name ?? row.book2_concept_name;
                            return (
                              <button
                                key={row.cell_id}
                                type="button"
                                onClick={() => setDetail(row)}
                                data-testid={`ad-copy-card-${row.cell_id}`}
                                className="rounded-xl border border-border/40 bg-foreground/[0.02] hover:border-primary/30 hover:bg-foreground/[0.04] active:bg-foreground/[0.06] transition-colors p-3.5 text-left flex flex-col gap-2.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-label text-interactive/80">{row.cell_id}</span>
                                  <span className={cn("text-micro font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0", tier.cls)}>
                                    {tier.label}
                                  </span>
                                </div>
                                <p className="text-body italic text-foreground/90 leading-relaxed">
                                  &ldquo;{lib?.primary_message}&rdquo;
                                </p>
                                <div className="mt-auto pt-2 border-t border-border/20 flex items-baseline justify-between gap-2 text-label text-muted-foreground/75">
                                  <span className="truncate">
                                    {conceptLabel}
                                    {ctx?.angleLabel ? ` · ${ctx.angleLabel}` : ""}
                                  </span>
                                  <span className="tabular-nums shrink-0">
                                    {stats.cpa != null ? fmtUSD(stats.cpa) : "—"} · {stats.results != null ? fmtNum(stats.results) : "—"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* ── Top performers tab ── */}
                {tab === "top" && (
                  <div className="space-y-5">
                    <div>
                      <h3 className={cn(HEADING.h5, "mb-2")}>Top checkout cells</h3>
                      {topCells.length ? (
                        <div className="grid grid-cols-dashboard-5-xl gap-3">
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
                              demographicEmptyReason={demographicEmptyReasonFor(a?.demographic_registration_signal ?? [], row.cell_id)}
                              placementsEmptyReason={placementsEmptyReasonFor(allPlacements)}
                              onUploadCreatives={() => setCreativeLibraryOpen(true)}
                              onUploadCreative={adAccountId ? (cellId) => setUploadCellId(cellId) : undefined}
                              onSegmentClick={(seg) => setCardSegment({ segment: seg, cellIds: [row.cell_id] })}
                              perfRow={row}
                              onFullBreakdownClick={() => setCardGridCell(row)}
                              expandFooter={(close) => (
                                <button
                                  onClick={() => { close(); setDetail(row); }}
                                  data-testid={`button-full-detail-top-${row.cell_id}`}
                                  className="pressable inline-flex items-center gap-1.5 text-title font-bold text-foreground bg-primary hover:bg-primary/90 border border-primary px-3 py-1.5 rounded-lg shadow-sm shadow-primary/20 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                                >
                                  Full detail →
                                </button>
                              )}
                            />
                          ))}
                        </div>
                      ) : (
                        <PendingState title="No ranked cells" message="No ranked cells in the current metric selection." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />
                      )}
                    </div>
                    <div>
                      <h3 className={cn(HEADING.h5, "mb-2")}>Top checkout variables</h3>
                      {topVariables.length ? <VariableTable rows={topVariables} onRowClick={(r) => setVariableCode(r.variable_id)} /> : <PendingState title="No ranked variables" message="No ranked variables in the current metric selection." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />}
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
                          <Dna className="w-3.5 h-3.5 text-interactive/70" />
                          <h3 className={cn(HEADING.h5)}>
                            DNA families in selection
                          </h3>
                        </div>
                        <div className="grid grid-cols-dashboard-4-xl gap-3">
                          {rollupDnaFamilies(variables, a?.latest_analysis_run_id ?? null).map((f) => (
                            <div
                              key={f.family}
                              role={f.top ? "button" : undefined}
                              tabIndex={f.top ? 0 : undefined}
                              onClick={f.top ? () => setVariableCode(f.top!.variableId) : undefined}
                              onKeyDown={f.top ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setVariableCode(f.top!.variableId); } } : undefined}
                              title={f.top ? "Open drill-down for this family's best read" : undefined}
                              className={`rounded-xl border border-border/40 bg-foreground/[0.02] p-3 ${f.top ? "cursor-pointer hover:border-primary/30 hover:bg-foreground/[0.04] active:bg-foreground/[0.06] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60" : ""}`}
                              data-testid={`dna-family-${f.family}`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-3">
                                <span className="text-sm font-bold text-foreground">{familyLabel(f.family)}</span>
                                <span className="text-label text-muted-foreground/75 border border-border/30 rounded px-1 py-0.5 leading-none">
                                  {f.variableCount} variable{f.variableCount === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 tabular-nums">
                                <div>
                                  <div className="text-micro uppercase tracking-widest text-muted-foreground/75 leading-none mb-0.5">Spend</div>
                                  <div className="text-caption font-semibold text-foreground/80">{fmtUSD(f.spend, 0)}</div>
                                </div>
                                <div>
                                  <div className="text-micro uppercase tracking-widest text-muted-foreground/75 leading-none mb-0.5">Results</div>
                                  <div className="text-caption font-semibold text-foreground/80">{fmtNum(f.results)}</div>
                                </div>
                                <div>
                                  <div className="text-micro uppercase tracking-widest text-muted-foreground/75 leading-none mb-0.5">CPA</div>
                                  <div className="text-caption font-semibold text-foreground/80">{f.cpa != null ? fmtUSD(f.cpa) : "—"}</div>
                                </div>
                              </div>
                              {f.top && (
                                <div className="mt-2 pt-2 border-t border-border/20 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-micro uppercase tracking-widest text-muted-foreground/75">Best read</span>
                                  <VariableChip code={f.top.variableId} showCode={false} className="opacity-80 scale-95 border-border/30" />
                                  {f.top.cpa != null && (
                                    <span className="text-label tabular-nums text-muted-foreground/75">{fmtUSD(f.top.cpa)} CPA</span>
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
                    <PendingState title="No variables in selection" message="Adjust the metric selection to see variable performance." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />
                  )
                )}

                {/* ── Breakdown tab (dimension × metric × chart cross-tab) ── */}
                {tab === "breakdown" && (
                  <BreakdownExplorer
                    analysis={a}
                    catalog={tileCatalog}
                    scopedCellRows={libCells}
                    scopeNarrowed={!runSelection.allTime}
                    windowLabel={runSelection.allTime ? undefined : "active run selection"}
                  />
                )}

                {/* ── Review queue tab (sub-80% deconstructed creatives) ── */}
                {tab === "review" && (
                  <DeconstructionReviewQueue accountId={adAccountId} />
                )}
              </div>

              {/* ── Cell detail drawer ── */}
              {detail && (
                <InfoDrawer
                  kicker={`Creative cell · ${detail.cell_id}`}
                  title={detail.book2_concept_name}
                  onClose={() => setDetail(null)}
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
                    const briefUrl = `/app/creative?from=analysis&fromCell=${detail.cell_id}`;
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
                    <MetricTile variant="primary" label="CPA" value={detail.CPA_result != null ? fmtUSD(detail.CPA_result) : "—"} />
                    <MetricTile label="Link CTR" value={fmtPct(detail.CTR_link_pct)} />
                  </div>
                  {/* Secondary delivery stats — derived from this row, dashes when absent */}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 rounded-lg border border-border/30 bg-foreground/[0.015] p-3">
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
                          <div className="text-label uppercase tracking-wider text-muted-foreground/75 leading-none mb-1">{s.label}</div>
                          <div className="text-caption font-semibold tabular-nums text-foreground/90">{s.value}</div>
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
                          <div key={p.id} className="text-caption text-foreground/80">{p.label}</div>
                        ))}
                      </div>
                    </DrawerField>
                  )}
                  {detail.legacy_library_match && (
                    <DrawerField label="Legacy library match">
                      <span className=" text-label text-muted-foreground/75">{detail.legacy_library_match}</span>
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
                        perfRow={detail}
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
                  metric={tileSegmentMetric}
                />
              )}

              {/* ── Tile-level segment grid (account-wide, metric-scoped) ── */}
              <SegmentGridModal
                open={tileSegmentsOpen}
                onClose={() => setTileSegmentsOpen(false)}
                kicker="IAP Library · All cells"
                title={tileSegmentMetric?.label ?? "Segment breakdown"}
                analysis={a}
                cellIds={null}
                metric={tileSegmentMetric}
              />

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

      {/* Cell-level creative upload dialog */}
      {adAccountId && uploadCellId && (
        <CellCreativeUploadDialog
          open={uploadCellId != null}
          onOpenChange={(v) => { if (!v) setUploadCellId(null); }}
          accountId={adAccountId}
          cellId={uploadCellId}
        />
      )}

      {/* Creative library sync dialog — invalidates seed query on close */}
      {account && (
        <CreativeLibraryDialog
          account={account}
          open={creativeLibraryOpen}
          onOpenChange={setCreativeLibraryOpen}
        />
      )}

      {/* Manual CSV upload + run analysis dialog */}
      {account && (
        <ManualImportDialog
          account={account}
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      )}
    </>
  );
}
