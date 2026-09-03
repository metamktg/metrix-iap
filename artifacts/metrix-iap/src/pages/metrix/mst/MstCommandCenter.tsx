// ─── MST · Command Center ────────────────────────────────────────────
// The parent /app/mst route. No execution control here — no backend job
// exists yet to "run" a sprint (MST is populated by the importer, not an
// in-app action). Hard-gated on this account having at least one
// generated brief. Deeper cross-map/sprint-grid/creative-scan analysis
// still lives only in the child pages — but the matrix's own avatar
// tiles (concepts × avatar column, each a real matrix-cell rollup) live
// here: an avatar tile is MST matrix-cell data first, ICP identity
// second, so it belongs on the MST overview rather than duplicated onto
// the Strategy/Avatars ICP page.

import type { EvaluationScale } from "@/lib/resultEvents";
import { useResultScope } from "@/hooks/useResultScope";
import { ResultScopeBar } from "@/components/analysis/ResultScopeBar";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getStrategyData, getAds } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ModuleScopeGate, PrerequisiteGate,
  StageLoopHub, buildLoopStages, HubNavGrid,
  MetricTile, SectionCard, SectionInfoIcon, resultTerm, fmtUSD, fmtPct, fmtNum,
  useFocusParam, CaveatNote,
} from "../shared";
import {
  PersonaAvatar, StatGrid, AccordionToggle, FoldedGrid, DnaChipStrip,
  VariableStackChips, VariableChip, familyLabel,
} from "../strategy/strategyShared";
import {
  computeAvatarDna, columnIdForCell,
  type AvatarDna, type DnaVariable,
} from "@/lib/creative-dna";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { useLocation } from "wouter";
import { RunScopePicker } from "@/components/analysis/RunSelector";
import { useCellRunScope, usePersistedRunScope } from "@/lib/run-scope";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import {
  Network, Grid3x3, Compass, Library, Dna, ChevronRight, ArrowDownRight, ArrowUp, ArrowDown,
} from "lucide-react";
import type { MSTMatrixColumn, MSTMatrixCell, ICPProfile, AdRecord, CellPerformanceRow } from "@/lib/data/seedTypes";
import { cn } from "@workspace/command-deck/lib/utils";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";

const SECTION = "MST · 06";

const CHILDREN = [
  { to: "/app/mst/cross-map", label: "Cross-Map", Icon: Network, desc: "Concepts mapped to strategy pillars, and planned cells crossmapped to observed performance.", lineage: "mst.local_book2_library[] · performance_by_cell[]" },
  { to: "/app/mst/sprints", label: "Sprints", Icon: Grid3x3, desc: "The 4×4 test matrix for this account.", lineage: "mst.historical_matrix_4x4 · concept_rollup[]" },
  { to: "/app/mst/creative-scan", label: "Creative Scan", Icon: Library, desc: "Scanned local creative library: message system, variable stack, and mapping confidence per concept.", lineage: "mst.local_book2_library[]" },
  { to: "/app/mst/direction", label: "Direction", Icon: Compass, desc: "The Optimization Loop — next-sprint priorities.", lineage: "optimization_loop" },
];

// ─── Sort ──────────────────────────────────────────────────────────────

type SortKey = "spend" | "cpa" | "cvr" | "cpm" | "confidence";

const SORT_LABEL: Record<SortKey, string> = {
  spend: "Spend", cpa: "CPA", cvr: "Link CVR", cpm: "CPM", confidence: "Confidence",
};
/** Under a communication scope an avatar is never sorted on cost per result or a conversion rate. */
const COST_SCALE_SORTS: readonly SortKey[] = ["cpa", "cvr"];
function sortKeysFor(scale: EvaluationScale | null): SortKey[] {
  return (Object.keys(SORT_LABEL) as SortKey[]).filter((k) => scale !== "communication" || !COST_SCALE_SORTS.includes(k));
}
/** "asc" = lower is better (cost metrics), "desc" = higher is better — drives the sort-pill arrow. */
const SORT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  spend: "desc", cpa: "asc", cvr: "desc", cpm: "asc", confidence: "desc",
};

interface ColumnPerf {
  spend: number;
  results: number;
  cpa: number | null;
  /** Real Link CVR: results ÷ link clicks × 100 — same definition as
   *  ICP performance_data.cvr_link_pct (results ARE aggregated here, so
   *  this is never approximated as click-through rate). */
  cvr: number | null;
  /** upper-funnel reach efficiency: spend ÷ impressions × 1000 */
  cpm: number | null;
}

function computeColumnPerf(columnId: string, columnIds: string[], rows: CellPerformanceRow[]): ColumnPerf {
  const matched = rows.filter((r) => columnIdForCell(r.cell_id, columnIds) === columnId);
  if (matched.length === 0) return { spend: 0, results: 0, cpa: null, cvr: null, cpm: null };
  const spend = matched.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = matched.reduce((s, r) => s + r.Results, 0);
  const impressions = matched.reduce((s, r) => s + r.Impressions, 0);
  const linkClicks = matched.reduce((s, r) => s + r["Link clicks"], 0);
  return {
    spend, results,
    cpa: results > 0 ? spend / results : null,
    cvr: linkClicks > 0 ? (results / linkClicks) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

/** Stable per-avatar accent so identity reads consistently regardless of sort order. */
const AVATAR_ACCENTS = [
  "bg-chart-1/70", "bg-primary/70", "bg-status-warning/70",
  "bg-metrix-cyan/70", "bg-primary/70", "bg-primary/70",
] as const;
function avatarAccent(index: number) {
  return AVATAR_ACCENTS[index % AVATAR_ACCENTS.length];
}

// ─── DNA loci bars ────────────────────────────────────────────────────
// Each measured variable as a diverging bar around the avatar's own
// spend-weighted average CPA — a real derivation ((avg − cpa) / avg,
// positive = cheaper than the avatar's own average), never an invented
// isolation score. Variables without a CPA carry no bar.

function DnaLociBars({ variables }: { variables: DnaVariable[] }) {
  const measured = variables.filter((v) => v.cpa != null && v.spend > 0);
  if (measured.length < 2) return null;
  const totalSpend = measured.reduce((n, v) => n + v.spend, 0);
  const avgCpa = measured.reduce((n, v) => n + (v.cpa as number) * v.spend, 0) / totalSpend;
  if (!(avgCpa > 0)) return null;
  const rows = measured
    .map((v) => ({ v, lift: ((avgCpa - (v.cpa as number)) / avgCpa) * 100 }))
    .sort((a, b) => b.lift - a.lift);
  const maxAbs = Math.max(10, ...rows.map((r) => Math.abs(r.lift)));

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1 mb-1.5">
        <Dna className="w-3.5 h-3.5 text-interactive/70" />
        <span className="text-label uppercase tracking-widest text-muted-foreground/75">CPA vs avatar average</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ v, lift }, idx) => {
          const w = (Math.abs(lift) / maxAbs) * 50;
          const good = lift >= 0;
          return (
            <div key={v.code} className="flex items-center gap-2">
              <span className="text-label w-6 shrink-0 text-muted-foreground/75">L{idx + 1}</span>
              <span className="text-caption w-28 shrink-0 truncate text-foreground/75" title={v.code}>{v.code}</span>
              <div className="relative flex-1 h-[5px]">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border/60" />
                <div
                  className={cn("absolute inset-y-0 rounded-full", good ? "bg-primary/60" : "bg-status-danger/45")}
                  style={good ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              </div>
              <span className={cn("text-label w-12 shrink-0 text-right tabular-nums", good ? "text-status-success" : "text-status-danger")}>
                {lift > 0 ? "+" : ""}{lift.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DnaVariableLine({ v, resultNoun }: { v: DnaVariable; resultNoun: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/15 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <VariableChip code={v.code} />
        {v.family && (
          <span className="text-label uppercase tracking-wider text-muted-foreground/75">
            {familyLabel(v.family)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 tabular-nums">
        <span className="text-label text-muted-foreground/75">{fmtUSD(v.spend, 0)}</span>
        <span className="text-label text-muted-foreground/75">{fmtNum(v.results)} {resultNoun}</span>
        <span className="text-label font-semibold text-foreground/85">
          {v.cpa != null ? `${fmtUSD(v.cpa)} CPA` : "no CPA"}
        </span>
      </div>
    </div>
  );
}

// ─── Avatar tile ────────────────────────────────────────────────────────
// Canvas card grammar: persona medallion + rank line + name (tap for
// detail), a hairline stat grid, and creative DNA behind a fold — no more
// boxed "Performance" sub-panel or highlighted active-sort pills.

function AvatarTile({
  col, cells, perf, maxSpend, matched, flash, registerRef,
  onClickAvatar, dna, accentIndex, rank, sortBy, onNavigateProfile,
}: {
  col: MSTMatrixColumn;
  cells: MSTMatrixCell[];
  perf: ColumnPerf;
  maxSpend: number;
  matched: ICPProfile[];
  flash: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onClickAvatar: (col: MSTMatrixColumn, cells: MSTMatrixCell[]) => void;
  dna: AvatarDna | null;
  accentIndex: number;
  rank: number;
  sortBy: SortKey;
  onNavigateProfile: (profileId: string) => void;
}) {
  const [dnaOpen, setDnaOpen] = useState(false);
  const spendPct = maxSpend > 0 ? (perf.spend / maxSpend) * 100 : 0;
  const hasPerf = perf.spend > 0 || perf.cpa != null;
  const flatName = col.name.replace(/\n/g, " ");
  const activeCls = "text-interactive";

  return (
    <div
      ref={registerRef}
      className={cn(
        "relative rounded-xl border bg-card/50 p-4 transition-colors duration-500 scroll-mt-24 overflow-hidden",
        flash ? "border-primary/70 bg-primary/[0.06]" : "border-border/50 hover:border-border",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", avatarAccent(accentIndex))} aria-hidden />
      <button
        onClick={() => onClickAvatar(col, cells)}
        className="pressable-lg group w-full text-left flex items-start justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <PersonaAvatar name={flatName} />
          <div className="min-w-0">
            <p className="text-micro uppercase tracking-widest text-muted-foreground/75 mb-0.5">
              AVATAR {String(rank).padStart(2, "0")}
            </p>
            <span className="inline-flex items-center gap-1 text-title font-bold text-foreground leading-tight whitespace-pre-line">
              {col.name}
              <ChevronRight className="w-3.5 h-3.5 text-interactive/70 shrink-0 -translate-x-0.5 group-hover:translate-x-0 transition-transform" />
            </span>
            <div className="text-label text-muted-foreground/75">{col.icp}</div>
          </div>
        </div>
        <span className="shrink-0 text-caption font-medium text-muted-foreground/75">
          {cells.length} angle{cells.length !== 1 ? "s" : ""}
        </span>
      </button>

      {hasPerf && (
        <div className="mt-3">
          <StatGrid
            cols={4}
            cells={[
              { label: "Spend", value: fmtUSD(perf.spend, 0), valueClassName: sortBy === "spend" ? activeCls : undefined },
              { label: "CPA", value: perf.cpa != null ? fmtUSD(perf.cpa) : "—", valueClassName: sortBy === "cpa" ? activeCls : undefined },
              { label: "Link CVR", value: perf.cvr != null ? fmtPct(perf.cvr) : "—", valueClassName: sortBy === "cvr" ? activeCls : undefined },
              { label: "CPM", value: perf.cpm != null ? fmtUSD(perf.cpm) : "—", valueClassName: sortBy === "cpm" ? activeCls : undefined },
            ]}
          />
        </div>
      )}

      {maxSpend > 0 && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-label text-muted-foreground/75 mb-1">
            <span>Spend share</span>
            <span className="tabular-nums">{spendPct.toFixed(0)}% of top</span>
          </div>
          <ProgressMeter
            value={spendPct}
            total={100}
            label="Spend share of top avatar"
            size="sm"
            fillClassName={avatarAccent(accentIndex)}
          />
        </div>
      )}

      {dna && dna.variables.length > 0 && (
        <div className="mt-3">
          <AccordionToggle label="Creative DNA" open={dnaOpen} onToggle={() => setDnaOpen((o) => !o)} icon={Dna} />
          {dnaOpen && (
            <div className="mt-2.5">
              <DnaChipStrip
                variables={dna.variables}
                label={`Measured · ${dna.measuredCellIds.length} angle${dna.measuredCellIds.length === 1 ? "" : "s"}`}
                testId={`avatar-dna-${col.id}`}
              />
              <DnaLociBars variables={dna.variables} />
            </div>
          )}
        </div>
      )}

      {matched.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/20 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75">
            ICP profile{matched.length === 1 ? "" : "s"}
          </span>
          {matched.map((p) => (
            <button
              key={p.profile_id}
              onClick={() => onNavigateProfile(p.profile_id)}
              className="pressable inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
              data-testid={`link-avatar-icp-${p.profile_id}`}
            >
              {p.profile_name}
              <ArrowDownRight className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sort bar ─────────────────────────────────────────────────────────

function AvatarSortBar({ sortBy, onSort, keys }: { sortBy: SortKey; onSort: (k: SortKey) => void; keys: SortKey[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Sort avatars">
      <span className="text-label font-semibold text-muted-foreground/75 normal-case tracking-normal">Sort</span>
      {keys.map((k) => {
        const active = sortBy === k;
        return (
          <button
            key={k}
            onClick={() => onSort(k)}
            aria-pressed={active}
            className={cn(
              "pressable inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-body font-semibold transition-colors border",
              active
                ? "bg-primary/12 border-primary/35 text-interactive"
                : "bg-transparent border-border/40 text-muted-foreground/75 hover:text-foreground/80 hover:border-border/60",
            )}
          >
            {SORT_LABEL[k]}
            {active && (SORT_DIRECTION[k] === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Drawer ad list ─────────────────────────────────────────────────────

function DrawerAdList({
  matchedAds,
  runScopeActive,
}: {
  matchedAds: Array<AdRecord & { cell_id: string }>;
  /** True when the page's RunScopePicker is narrowed to specific run(s)
   *  (not "All time"). AdRecord.performance is a full-window aggregate with
   *  no run identity to scope by — unlike the tile above (whose Spend/CPA/
   *  CVR/CPM DO narrow to the selection), these per-ad figures can never
   *  follow it. Surface that honestly rather than let the two numbers
   *  silently disagree on their time base. */
  runScopeActive: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (matchedAds.length === 0) {
    return <p className="text-caption text-muted-foreground/75">No ad records matched to this avatar's cells.</p>;
  }
  const visible = showAll ? matchedAds : matchedAds.slice(0, 8);
  return (
    <div className="space-y-2">
      {runScopeActive && (
        <CaveatNote
          text="Per-ad Spend and Results below are full-window totals, not scoped to the run selection above."
          defaultExpanded
        />
      )}
      {visible.map((ad, i) => {
        // Each ad's own real per-ad aggregate — never the cell-level rollup,
        // which would show the same number on every ad sharing a cell.
        const perf = ad.performance;
        return (
          <div
            key={ad.ad_name + i}
            data-testid={`drawer-ad-row-${i}`}
            className="flex items-start justify-between gap-2 border-b border-border/15 pb-1.5 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-body font-medium text-foreground/85 truncate" title={ad.ad_name}>{ad.ad_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {ad.cell && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-label border border-border/30 px-1 py-0.5 rounded text-muted-foreground/75 cursor-default">
                          {ad.cell}
                          <span className="sr-only">{` — matrix cell${ad.concept ? ` for ${ad.concept}` : ""}`}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-caption leading-relaxed">
                          Matrix cell <span className="">{ad.cell}</span>{ad.concept ? ` — ${ad.concept}` : ""}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {ad.variation && (
                  <span className="text-label border border-border/30 px-1 py-0.5 rounded text-muted-foreground/75" title="Variation">
                    Var {ad.variation}
                  </span>
                )}
                {ad.test_id && (
                  <span className="text-label border border-border/30 px-1 py-0.5 rounded text-muted-foreground/75" title="Test ID">
                    {ad.test_id}
                  </span>
                )}
                {ad.concept && <span className="text-label text-muted-foreground/75">{ad.concept}</span>}
              </div>
            </div>
            {perf && (perf.spend > 0 || perf.results > 0) && (
              <div className="flex items-center gap-3 shrink-0 tabular-nums text-right">
                {perf.spend > 0 && (
                  <div><p className="text-label text-muted-foreground/75">Spend</p><p className="text-body text-foreground/70">{fmtUSD(perf.spend, 0)}</p></div>
                )}
                {perf.results > 0 && (
                  <div><p className="text-label text-muted-foreground/75">Results</p><p className="text-body text-foreground/70">{fmtNum(perf.results)}</p></div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {matchedAds.length > 8 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="pressable text-caption text-interactive underline-offset-2 hover:underline">
          {showAll ? "Show fewer" : `Show all ${matchedAds.length} ads`}
        </button>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function MstCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const [, navigate] = useLocation();

  const [sortByRaw, setSortBy] = useState<SortKey>("spend");
  const [detail, setDetail] = useState<{ column: MSTMatrixColumn; cells: MSTMatrixCell[] } | null>(null);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const avatarRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashAvatar, setFlashAvatar] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mst = getMST(seed, adAccountId);
  const matrix = mst?.historical_matrix_4x4 ?? null;
  const analysis = getAnalysisData(seed, adAccountId);
  const strategyData = getStrategyData(seed, adAccountId);
  const icpProfiles = strategyData?.icp_profiles ?? [];
  const term = resultTerm(account);

  // ── Analysis-run scope (compact header dropdown) ──────────────────────
  // Avatar-tile KPIs (spend, CPA, Link CVR, CPM) are aggregated straight
  // from performance_by_cell — scoping the source rows to the selected
  // run(s) before aggregating means every tile respects the selection,
  // not just a cosmetic picker.
  const { data: analysisRunsData } = useListAnalysisRuns(adAccountId ?? "", { query: { enabled: !!adAccountId, queryKey: getListAnalysisRunsQueryKey(adAccountId ?? "") } });
  const [runSelection, setRunSelection] = usePersistedRunScope(
    "mst-command-center", adAccountId, analysisRunsData?.runs,
  );
  const { filterByRun } = useCellRunScope(analysis, runSelection);
  // One result scope for every analysis surface: avatar-column KPIs are
  // summed over the scope's event(s) only.
  const resultScope = useResultScope(account, adAccountId, analysis?.performance_by_cell.map((r) => r["Result type"]));
  const { scopeRows } = resultScope;
  const sortKeys = useMemo(() => sortKeysFor(resultScope.scope?.scale ?? null), [resultScope.scope]);
  // A cost sort chosen under a conversion scope falls back to spend when the
  // reader switches to an awareness event — never a cost per ThruPlay.
  const sortBy: SortKey = sortKeys.includes(sortByRaw) ? sortByRaw : "spend";
  const cellRows = useMemo(() => filterByRun(scopeRows(analysis?.performance_by_cell ?? [], (r) => r["Result type"])), [analysis, filterByRun, scopeRows]);
  const scopedAnalysis = useMemo(
    () => (analysis ? { ...analysis, performance_by_cell: cellRows } : analysis),
    [analysis, cellRows],
  );

  const columnIds = useMemo(() => matrix?.columns.map((c) => c.id) ?? [], [matrix]);

  const dnaByColumn = useMemo(
    () => (matrix ? new Map(matrix.columns.map((col) => [col.id, computeAvatarDna(col.id, matrix, scopedAnalysis, mst)])) : new Map<string, AvatarDna>()),
    [matrix, scopedAnalysis, mst],
  );

  const perfByColumn = useMemo(
    () => (matrix ? new Map(matrix.columns.map((col) => [col.id, computeColumnPerf(col.id, columnIds, cellRows)])) : new Map<string, ColumnPerf>()),
    [matrix, columnIds, cellRows],
  );

  const maxSpend = useMemo(() => {
    let max = 0;
    for (const p of perfByColumn.values()) max = Math.max(max, p.spend);
    return max;
  }, [perfByColumn]);

  const accentIndexByColumn = useMemo(() => new Map((matrix?.columns ?? []).map((c, i) => [c.id, i])), [matrix]);

  const sortedColumns = useMemo(() => {
    if (!matrix) return [];
    const emptyPerf: ColumnPerf = { spend: 0, results: 0, cpa: null, cvr: null, cpm: null };
    return [...matrix.columns].sort((a, b) => {
      const pa = perfByColumn.get(a.id) ?? emptyPerf;
      const pb = perfByColumn.get(b.id) ?? emptyPerf;
      switch (sortBy) {
        case "spend": return (pb.spend ?? 0) - (pa.spend ?? 0);
        case "cpa": return (pa.cpa ?? Infinity) - (pb.cpa ?? Infinity);
        case "cvr": return (pb.cvr ?? -1) - (pa.cvr ?? -1);
        case "cpm": return (pa.cpm ?? Infinity) - (pb.cpm ?? Infinity);
        case "confidence": {
          const da = dnaByColumn.get(a.id);
          const db = dnaByColumn.get(b.id);
          return (db?.measuredCellIds.length ?? 0) - (da?.measuredCellIds.length ?? 0);
        }
      }
    });
  }, [matrix, perfByColumn, sortBy, dnaByColumn]);

  const adsByCell = useMemo(() => {
    const ads = getAds(seed, adAccountId);
    const map = new Map<string, AdRecord[]>();
    for (const ad of ads) {
      if (!ad.cell) continue;
      const list = map.get(ad.cell) ?? [];
      list.push(ad);
      map.set(ad.cell, list);
    }
    return map;
  }, [seed, adAccountId]);

  const scrollToAvatar = useCallback((columnId: string) => {
    setTimeout(() => {
      const el = avatarRefs.current[columnId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashAvatar(columnId);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashAvatar(null), 1600);
    }, 60);
  }, []);

  // Cross-page deep link from an ICP profile's "Avatars" back-link
  // (/app/mst?focus=<columnId>) — scroll to and flash that tile once the
  // matrix has rendered.
  const focus = useFocusParam();
  useEffect(() => {
    if (!focus || !matrix) return;
    if (!matrix.columns.some((c) => c.id === focus)) return;
    scrollToAvatar(focus);
  }, [focus, matrix, scrollToAvatar]);

  return (
    <ModuleScopeGate section={SECTION} title="MST" account={account}>
      {() => {
        const acct = account!;
        const profileById = new Map(icpProfiles.map((p) => [p.profile_id, p]));
        const cellsFor = (colId: string) => (matrix ? matrix.cells.filter((c) => c.column_id === colId) : []);
        const matchedProfilesFor = (col: MSTMatrixColumn): ICPProfile[] =>
          (col.matched_profile_ids ?? []).map((id) => profileById.get(id)).filter((p): p is ICPProfile => p != null);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="MST"
              accountName={acct.name}
              subtitle="Matrix Sprint Test results for this account's briefed creative."
              right={
                <RunScopePicker
                  runs={analysisRunsData?.runs ?? []}
                  value={runSelection}
                  onChange={setRunSelection}
                />
              }
            />
            <ResultScopeBar scope={resultScope.scope} groups={resultScope.groups} onChange={resultScope.setScopeId} />
            <StageLoopHub stages={buildLoopStages(status)} current="mst" />

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              <PrerequisiteGate
                met={status.mst.unlocked}
                title="Generate briefs first"
                message="MST reads matrix cells briefed for this account — this account doesn't have any generated briefs yet."
                ctaLabel="Go to Creative"
                ctaTo="/app/creative"
              >
                {() => (
                  <>
                    {matrix && matrix.columns.length > 0 && (
                      <>
                        <div className="grid grid-cols-dashboard-4 gap-3">
                          <MetricTile label="Avatars" value={String(matrix.columns.length)} variant="primary" />
                          <MetricTile label="Message angles" value={String(matrix.cells.length)} sub="matrix cells" />
                          <MetricTile label="Top spend share" value={maxSpend > 0 ? fmtUSD(maxSpend, 0) : "—"} sub="leading avatar" />
                          <MetricTile label="ICP profiles" value={String(icpProfiles.length)} sub="strategy map" />
                        </div>

                        <SectionCard
                          title="Matrix avatars"
                          desc={`Sorted by ${SORT_LABEL[sortBy]} · tap any card for detail`}
                          right={<><SectionInfoIcon tip="Audience avatars from the MST matrix, each with its measured performance, creative DNA, and linked ICP profiles." /><AvatarSortBar sortBy={sortBy} onSort={setSortBy} keys={sortKeys} /></>}
                        >
                          <FoldedGrid
                            items={sortedColumns}
                            limit={6}
                            noun="avatars"
                            gridClassName="grid grid-cols-dashboard-2 gap-3"
                            renderItem={(col, i) => {
                              const cells = cellsFor(col.id);
                              const matched = matchedProfilesFor(col);
                              const perf = perfByColumn.get(col.id) ?? { spend: 0, results: 0, cpa: null, cvr: null, cpm: null };
                              const dna = dnaByColumn.get(col.id) ?? null;
                              return (
                                <AvatarTile
                                  key={col.id}
                                  col={col}
                                  cells={cells}
                                  perf={perf}
                                  maxSpend={maxSpend}
                                  matched={matched}
                                  flash={flashAvatar === col.id}
                                  registerRef={(el) => { avatarRefs.current[col.id] = el; }}
                                  onClickAvatar={(c, cs) => setDetail({ column: c, cells: cs })}
                                  dna={dna}
                                  accentIndex={accentIndexByColumn.get(col.id) ?? i}
                                  rank={i + 1}
                                  sortBy={sortBy}
                                  onNavigateProfile={(profileId) => navigate(`/app/strategy/avatars?focus=${profileId}`)}
                                />
                              );
                            }}
                          />
                        </SectionCard>
                      </>
                    )}

                    <HubNavGrid items={CHILDREN} label="Explore MST" />
                  </>
                )}
              </PrerequisiteGate>
            </div>

            {detail && (
              <InfoDrawer
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4 flex-wrap">
                    {analysis && <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />}
                    {matchedProfilesFor(detail.column).map((p) => (
                      <button
                        key={p.profile_id}
                        onClick={() => navigate(`/app/strategy/avatars?focus=${p.profile_id}`)}
                        className="pressable inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
                        data-testid={`link-drawer-icp-${p.profile_id}`}
                      >
                        View ICP: {p.profile_name}
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                    <button
                      onClick={() => navigate("/app/creative")}
                      className="pressable inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
                    >
                      Open Creative
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                }
              >
                {(() => {
                  const matchedAds: Array<AdRecord & { cell_id: string }> = detail.cells.flatMap((c) =>
                    (adsByCell.get(c.cell_id) ?? []).map((ad) => ({ ...ad, cell_id: c.cell_id })),
                  );
                  return (
                    <DrawerField label={matchedAds.length > 0 ? `Matched ads (${matchedAds.length})` : "Matched ads"}>
                      <DrawerAdList matchedAds={matchedAds} runScopeActive={!runSelection.allTime} />
                    </DrawerField>
                  );
                })()}
                {(() => {
                  const dna = dnaByColumn.get(detail.column.id);
                  if (!dna) return null;
                  return (
                    <DrawerField label="Variable resonance — ranked by results">
                      {dna.variables.length > 0 ? (
                        <>
                          <p className="text-label text-muted-foreground/75 leading-relaxed mb-1.5">
                            Aggregated from {dna.measuredCellIds.length} measured angle{dna.measuredCellIds.length === 1 ? "" : "s"} ({dna.measuredCellIds.join(", ")})
                            {dna.extensionCellIds.length > 0 ? ` — ${dna.extensionCellIds.length} beyond the planned grid` : ""}.
                            Planned angles without data are excluded. Variables share angles; rows overlap and are not additive.
                          </p>
                          <div data-testid={`drawer-dna-${detail.column.id}`}>
                            {dna.variables.slice(0, 10).map((v) => (
                              <DnaVariableLine key={v.code} v={v} resultNoun={term.plural} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-caption text-muted-foreground/75">
                          No measured variable resonance yet — none of this avatar's angles have performance data.
                        </p>
                      )}
                    </DrawerField>
                  );
                })()}
                {detail.cells.map((c) => (
                  <DrawerField key={c.cell_id} label={`${c.cell_id} · ${c.concept_code}`}>
                    {c.plain_text.headline && <p className="font-semibold text-foreground">{c.plain_text.headline}</p>}
                    {c.plain_text.primary && <p className="mt-1">{c.plain_text.primary}</p>}
                    <div className="mt-2">
                      <VariableStackChips stack={c.variable_stack} />
                    </div>
                  </DrawerField>
                ))}
              </InfoDrawer>
            )}

            {detail && scopedAnalysis && (
              <SegmentGridModal
                open={segmentsOpen}
                onClose={() => setSegmentsOpen(false)}
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                analysis={scopedAnalysis}
                cellIds={detail.cells.map((c) => c.cell_id)}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
