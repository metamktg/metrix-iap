// ─── Analysis · Concept Map ───────────────────────────────────────────
// Groups creative cells by concept and maps them onto strategy pillars.
// Shows which concepts feed which pillars, ranked by Spend/Results/CPA
// and filterable by pillar-link status, with drill-down (right-panel deep
// dive, chaining into individual cells) and cross-links into the
// Hypothesis Queue and Brief Builder.

import { useResultScope } from "@/hooks/useResultScope";
import { ResultScopeBar } from "@/components/analysis/ResultScopeBar";
import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getStrategyData, getCreativeLinkContext, getMST } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  CrossLink, fmtUSD, fmtNum, useShowMore, ShowMoreButton, SegmentedToggle,
} from "../shared";
import { TYPE } from "../typography";
import { useCellRunScope, usePersistedRunScope } from "@/lib/run-scope";
import { RunScopePicker, type RunSelectorValue } from "@/components/analysis/RunSelector";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import { RankSortBar, useRankMetric, sortByRankMetric, rankBarPct, type RankMetric } from "../analysis/rankSort";
import { useDeepDive } from "@/contexts/DeepDiveContext";
import { buildConceptGroupDeepDiveModule } from "@/lib/data/deepDive";
import { SegmentGridModal } from "@/components/creative/SegmentGridModal";
import { cn } from "@workspace/command-deck/lib/utils";
import { Network, Layers } from "lucide-react";
import type { CellPerformanceRow, MessagePillar } from "@/lib/data/seedTypes";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";

const SECTION = "MST · 06";

interface ConceptGroup {
  name: string;
  cells: CellPerformanceRow[];
  spend: number;
  results: number;
  cpa: number | null;
  cellIds: string[];
}

const CONCEPT_SORT_KEY = "metrix.concept-map.sort.v1";

const CONCEPT_METRICS: RankMetric<ConceptGroup>[] = [
  { id: "spend",   label: "Spend",   direction: "desc", value: (g) => g.spend,   format: (v) => fmtUSD(v, 0) },
  { id: "results", label: "Results", direction: "desc", value: (g) => g.results, format: fmtNum },
  { id: "cpa",     label: "CPA",     direction: "asc",  value: (g) => g.cpa,     format: (v) => fmtUSD(v) },
];

type LinkFilter = "all" | "linked" | "unlinked";

export function ConceptMapView({
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
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [segmentsFor, setSegmentsFor] = useState<{ cellIds: string[]; title: string } | null>(null);
  const resultScope = useResultScope(account, adAccountId, getAnalysisData(seed, adAccountId)?.performance_by_cell.map((r) => r["Result type"]));
  const { data: analysisRunsData } = useListAnalysisRuns(adAccountId ?? "", { query: { enabled: !!adAccountId, queryKey: getListAnalysisRunsQueryKey(adAccountId ?? "") } });
  const controlled = runScope !== undefined && onRunScopeChange !== undefined;
  // When controlled, the parent owns persistence — the local hook is inert
  // so it never reads/writes storage or runs the stale-run guard.
  const [localRunSelection, setLocalRunSelection] = usePersistedRunScope(
    "concept-map", adAccountId, analysisRunsData?.runs, !controlled,
  );
  const runSelection = controlled ? runScope! : localRunSelection;
  const setRunSelection = controlled ? onRunScopeChange! : setLocalRunSelection;
  const { filterByRun } = useCellRunScope(getAnalysisData(seed, adAccountId), runSelection);
  const { activeId: sortId, select: setSortId } = useRankMetric(CONCEPT_SORT_KEY, CONCEPT_METRICS.map((m) => m.id), "spend");
  const activeSort = CONCEPT_METRICS.find((m) => m.id === sortId) ?? CONCEPT_METRICS[0];

  return (
    <ModuleScopeGate section={SECTION} title="Concept Map" account={account} renderHeader={renderHeader}>
      {() => {
        const acct = account!;
        const a = getAnalysisData(seed, adAccountId);
        const strategy = getStrategyData(seed, adAccountId);
        const mst = getMST(seed, adAccountId);
        const cardOpts = getCreativeLinkContext(seed, adAccountId);

        if (!a || a.performance_by_cell.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              {renderHeader && <ModuleHeader section={SECTION} title="Concept Map" accountName={acct.name} />}
              <PendingState title="No concepts yet" message="Concepts appear once cell-level analysis is available." icon={Network}
                action={<CrossLink to="/app/analysis/library" label="Open IAP Library" />}
              />
            </div>
          );
        }

        // Only cells whose concept was produced by the selected analysis run(s),
        // inside the result scope (one event or the allowed blend).
        const rowsInRange = filterByRun(resultScope.scopeRows(a.performance_by_cell, (r) => r["Result type"]));

        const groupsMap = new Map<string, ConceptGroup>();
        for (const r of rowsInRange) {
          const g = groupsMap.get(r.book2_concept_name) ?? {
            name: r.book2_concept_name, cells: [], spend: 0, results: 0, cpa: null, cellIds: [],
          };
          g.cells.push(r);
          g.spend += r["Amount spent (USD)"];
          g.results += r.Results;
          if (!g.cellIds.includes(r.cell_id)) g.cellIds.push(r.cell_id);
          groupsMap.set(r.book2_concept_name, g);
        }
        const groups = Array.from(groupsMap.values());
        for (const g of groups) g.cpa = g.results > 0 ? g.spend / g.results : null;

        const pillars = strategy?.message_pillars ?? [];
        const pillarsForGroup = (g: ConceptGroup) =>
          pillars.filter((p) => p.source_cells.some((c) => g.cellIds.includes(c)));

        const linkedConcepts = groups.filter((g) => pillarsForGroup(g).length > 0).length;

        const filtered = groups.filter((g) => {
          if (linkFilter === "all") return true;
          const linked = pillarsForGroup(g).length > 0;
          return linkFilter === "linked" ? linked : !linked;
        });
        const sorted = sortByRankMetric(filtered, activeSort);
        const barValues = filtered.map(activeSort.value);

        const openGroup = (g: ConceptGroup) => {
          deepDive.push(
            buildConceptGroupDeepDiveModule({
              name: g.name,
              cellIds: g.cellIds,
              cellRows: g.cells,
              spend: g.spend,
              results: g.results,
              pillars: pillarsForGroup(g),
              analysis: a,
              mst,
              ...cardOpts,
              onOpenGroupSegments: () => setSegmentsFor({ cellIds: g.cellIds, title: g.name }),
              onOpenCellSegments: (cellId) => setSegmentsFor({ cellIds: [cellId], title: cellId }),
            }),
          );
        };

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {renderHeader ? (
              <ModuleHeader
                section={SECTION}
                title="Concept Map"
                accountName={acct.name}
                subtitle="Concepts mapped to pillars"
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

            {renderHeader && (
              <ResultScopeBar scope={resultScope.scope} groups={resultScope.groups} onChange={resultScope.setScopeId} />
            )}

            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Concepts" value={String(groups.length)} />
              <MetricTile label="Creative cells" value={String(new Set(rowsInRange.map((r) => r.cell_id)).size)} />
              <MetricTile label="Strategy pillars" value={String(pillars.length)} />
              <MetricTile label="Concepts feeding pillars" value={String(linkedConcepts)} />
            </div>

            <div className="px-6 pt-4 flex items-center justify-between gap-3 flex-wrap">
              <SegmentedToggle
                ariaLabel="Filter concepts by pillar link"
                active={linkFilter}
                onChange={(id) => setLinkFilter(id as LinkFilter)}
                options={[
                  { id: "all", label: "All" },
                  { id: "linked", label: "Linked" },
                  { id: "unlinked", label: "Unlinked" },
                ]}
              />
              <RankSortBar metrics={CONCEPT_METRICS} activeId={sortId} onSelect={setSortId} />
            </div>

            <ConceptGroupList
              groups={sorted}
              barValues={barValues}
              activeMetric={activeSort}
              pillarsForGroup={pillarsForGroup}
              onSelect={openGroup}
            />

            {segmentsFor && (
              <SegmentGridModal
                open
                onClose={() => setSegmentsFor(null)}
                kicker={`Concept · ${segmentsFor.cellIds.join(", ")}`}
                title={segmentsFor.title}
                analysis={a}
                cellIds={segmentsFor.cellIds}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}

function ConceptGroupList({
  groups,
  barValues,
  activeMetric,
  pillarsForGroup,
  onSelect,
}: {
  groups: ConceptGroup[];
  barValues: (number | null)[];
  activeMetric: RankMetric<ConceptGroup>;
  pillarsForGroup: (g: ConceptGroup) => MessagePillar[];
  onSelect: (g: ConceptGroup) => void;
}) {
  const fold = useShowMore(groups, 6);
  if (groups.length === 0) {
    return (
      <div className="px-6 py-8">
        <p className={cn(TYPE.body, "text-muted-foreground/75 text-center")}>No concepts match this filter.</p>
      </div>
    );
  }
  return (
    <div className="px-6 py-5 grid grid-cols-dashboard-2 gap-3 max-w-5xl">
      {fold.visible.map((g) => {
        const linked = pillarsForGroup(g);
        const pct = rankBarPct(activeMetric.value(g), barValues, activeMetric.direction);
        return (
          <button
            key={g.name}
            onClick={() => onSelect(g)}
            className="pressable-lg text-left rounded-xl border border-border/40 bg-foreground/[0.02] p-4 transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:border-primary/35 hover:bg-primary/[0.04] hover:-translate-y-px"
            data-testid={`concept-group-${g.name}`}
          >
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {g.cellIds.map((c) => (
                <span key={c} className={cn(TYPE.label, " text-muted-foreground/75 border border-border/30 px-1 py-0.5 rounded leading-none")}>{c}</span>
              ))}
            </div>
            <p className={cn(TYPE.title, "leading-tight")}>{g.name}</p>

            <ProgressMeter
              value={pct}
              total={100}
              label={`${g.name} spend share`}
              size="md"
              fillClassName="bg-chart-1/65"
              className="mt-3"
            />
            <div className={cn("flex items-center justify-between mt-1.5", TYPE.label, "text-muted-foreground/75 tabular-nums")}>
              <span>{fmtUSD(g.spend, 0)} spend</span>
              <span>{fmtNum(g.results)} results</span>
              <span>{g.cpa != null ? fmtUSD(g.cpa) : "—"} CPA</span>
            </div>

            <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-1.5 flex-wrap">
              <Layers className="w-3.5 h-3.5 text-interactive/50" />
              {linked.length ? (
                linked.map((p) => (
                  <span key={p.id} className={cn(TYPE.label, "text-interactive/85 border border-primary/25 bg-primary/[0.08] px-1.5 py-0.5 rounded leading-none")}>{p.label}</span>
                ))
              ) : (
                <span className={cn(TYPE.label, "text-muted-foreground/75")}>No pillar linked yet</span>
              )}
            </div>
          </button>
        );
      })}
      <ShowMoreButton total={groups.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="groups" />
    </div>
  );
}
