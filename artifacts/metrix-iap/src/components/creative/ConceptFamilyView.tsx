// ─── Concept family grouped view ──────────────────────────────────────
// Renders the Library "Group by concept" accordion: one card per concept
// family → expand to angle rows → expand angle to individual creative
// cells sorted by primary KPI (lowest CPA first), top cell badged.
//
// Data must already be metric- and date-filtered by the caller.

import { useState } from "react";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtUSD, fmtNum, fmtPct } from "@/pages/metrix/shared";
import type { ConceptFamilyGroup, AngleGroup, BlendedKPI } from "@/lib/concept-grouping";
import { rankCellsByPrimaryKpi, type CellRankKpi } from "@/lib/concept-grouping";
import { CreativeCard } from "./CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import type { CardAssemblyOpts } from "@/lib/creative-assembly";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";

// ─── Blended stat strip ───────────────────────────────────────────────

function BlendedStatStrip({ blended }: { blended: BlendedKPI }) {
  const items = [
    { label: "Spend",     value: fmtUSD(blended.spend, 0) },
    { label: "Results",   value: fmtNum(blended.results) },
    { label: "CPA",       value: blended.cpa != null ? fmtUSD(blended.cpa) : "—" },
    { label: "Link CTR",  value: blended.ctrPct != null ? fmtPct(blended.ctrPct) : "—" },
  ];
  return (
    <div className="flex items-center gap-4 tabular-nums">
      {items.map((it) => (
        <div key={it.label} className="shrink-0">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-0.5">
            {it.label}
          </div>
          <div className="text-caption font-semibold text-foreground/90">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Angle row ────────────────────────────────────────────────────────

interface AngleRowProps {
  group: AngleGroup;
  cardCtx: CardAssemblyOpts;
  demoByCell: Map<string, DemographicRow[]>;
  allPlacements: PlacementRow[];
  unmappedCellIds: Set<string>;
  rankKpi: CellRankKpi;
  onDetail: (row: CellPerformanceRow) => void;
  onUploadCreatives: () => void;
  onUploadCreative?: (cellId: string) => void;
}

function AngleRow({
  group,
  cardCtx,
  demoByCell,
  allPlacements,
  unmappedCellIds,
  rankKpi,
  onDetail,
  onUploadCreatives,
  onUploadCreative,
}: AngleRowProps) {
  const [showCells, setShowCells] = useState(false);

  const rankedCells = rankCellsByPrimaryKpi(group.cells, group.allRows, rankKpi);
  const topCellId = rankedCells[0]?.cell_id ?? null;

  function aggStats(cellId: string) {
    const rows = group.allRows.filter((r) => r.cell_id === cellId);
    const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
    const results = rows.reduce((s, r) => s + r.Results, 0);
    return {
      spend,
      results,
      cpa: results > 0 ? spend / results : null,
      ctrPct: rows[0]?.CTR_link_pct ?? null,
      resultLabel: rows.length === 1 ? rows[0]!["Result type"] : `${rows.length} events`,
    };
  }

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      {/* Angle header */}
      <button
        onClick={() => setShowCells((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
        aria-expanded={showCells}
        aria-label={`${showCells ? "Collapse" : "Expand"} angle ${group.angleKey}: ${group.angleLabel}`}
      >
        <span className="shrink-0 w-5 h-5 rounded border border-border/40 flex items-center justify-center">
          {showCells
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-none mb-0.5">
            Angle {group.angleKey}
          </div>
          <p className="text-caption font-medium text-foreground/80 truncate">{group.angleLabel}</p>
        </div>

        <BlendedStatStrip blended={group.blended} />

        <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50 border border-border/30 px-1.5 py-0.5 rounded-full ml-2">
          {group.blended.cellCount} cell{group.blended.cellCount === 1 ? "" : "s"}
        </span>
      </button>

      {/* Expanded cells grid */}
      {showCells && (
        <div className="border-t border-border/25 px-3 py-3 bg-white/[0.01]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {rankedCells.map((row, idx) => (
              <div key={row.cell_id} className="relative">
                {idx === 0 && topCellId === row.cell_id && (
                  <div className="absolute -top-2 left-2 z-10 flex items-center gap-1 bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[8px] font-semibold px-1.5 py-0.5 rounded-full">
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    Top
                  </div>
                )}
                <CreativeCard
                  data={{
                    ...cardFromCell(row.cell_id, cardCtx),
                    stats: aggStats(row.cell_id),
                  }}
                  unmapped={unmappedCellIds.has(row.cell_id)}
                  demographic={demoByCell.get(row.cell_id) ?? []}
                  placements={allPlacements}
                  onUploadCreatives={onUploadCreatives}
                  onUploadCreative={onUploadCreative}
                  expandFooter={(close) => (
                    <button
                      onClick={() => { close(); onDetail(row); }}
                      className="inline-flex items-center gap-1.5 text-title font-semibold text-white bg-primary hover:bg-primary/90 border border-primary px-3 py-1.5 rounded-lg shadow-sm shadow-primary/20 transition-all"
                    >
                      Full detail →
                    </button>
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Concept family card ──────────────────────────────────────────────

interface ConceptFamilyCardProps {
  group: ConceptFamilyGroup;
  cardCtx: CardAssemblyOpts;
  demoByCell: Map<string, DemographicRow[]>;
  allPlacements: PlacementRow[];
  unmappedCellIds: Set<string>;
  rankKpi: CellRankKpi;
  onDetail: (row: CellPerformanceRow) => void;
  onUploadCreatives: () => void;
  onUploadCreative?: (cellId: string) => void;
}

function ConceptFamilyCard({
  group,
  cardCtx,
  demoByCell,
  allPlacements,
  unmappedCellIds,
  rankKpi,
  onDetail,
  onUploadCreatives,
  onUploadCreative,
}: ConceptFamilyCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border transition-colors",
      expanded
        ? "border-primary/25 bg-white/[0.025]"
        : "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.03]"
    )}>
      {/* Concept header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} concept ${group.conceptId}`}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
      >
        <span className={cn(
          "shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition-colors",
          expanded ? "border-primary/40 bg-primary/10" : "border-border/40"
        )}>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-interactive/80" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-none mb-0.5">
            {group.conceptId}
          </div>
          <p className="text-title font-semibold text-foreground truncate">{group.conceptName}</p>
        </div>

        <BlendedStatStrip blended={group.blended} />

        <div className="shrink-0 flex items-center gap-1.5 ml-3">
          <span className="text-[9px] font-mono text-muted-foreground/50 border border-border/30 px-1.5 py-0.5 rounded-full">
            {group.blended.cellCount} cell{group.blended.cellCount === 1 ? "" : "s"}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/40 border border-border/25 px-1.5 py-0.5 rounded-full">
            {group.angles.length} angle{group.angles.length === 1 ? "" : "s"}
          </span>
        </div>
      </button>

      {/* Angle sub-list */}
      {expanded && (
        <div className="border-t border-border/25 px-4 py-3 space-y-2">
          {group.angles.map((angle) => (
            <AngleRow
              key={angle.angleKey}
              group={angle}
              cardCtx={cardCtx}
              demoByCell={demoByCell}
              allPlacements={allPlacements}
              unmappedCellIds={unmappedCellIds}
              rankKpi={rankKpi}
              onDetail={onDetail}
              onUploadCreatives={onUploadCreatives}
              onUploadCreative={onUploadCreative}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Top-level grouped view ───────────────────────────────────────────

export interface ConceptFamilyViewProps {
  groups: ConceptFamilyGroup[];
  cardCtx: CardAssemblyOpts;
  demoByCell: Map<string, DemographicRow[]>;
  allPlacements: PlacementRow[];
  unmappedCellIds: Set<string>;
  /**
   * KPI used to rank cells within each angle drill-down. Defaults to "cpa"
   * (lowest = best). Pass the surface's active primary KPI when a picker exists.
   */
  rankKpi?: CellRankKpi;
  onDetail: (row: CellPerformanceRow) => void;
  onUploadCreatives: () => void;
  onUploadCreative?: (cellId: string) => void;
}

export function ConceptFamilyView({
  groups,
  cardCtx,
  demoByCell,
  allPlacements,
  unmappedCellIds,
  rankKpi = "cpa",
  onDetail,
  onUploadCreatives,
  onUploadCreative,
}: ConceptFamilyViewProps) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-body font-semibold text-foreground/60">No concept families in selection</p>
        <p className="text-caption text-muted-foreground/50 mt-1">Adjust the metric selection to see grouped data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-label text-muted-foreground/50 tabular-nums">
          {groups.length} concept {groups.length === 1 ? "family" : "families"} · sorted by spend
        </span>
      </div>
      {groups.map((group) => (
        <ConceptFamilyCard
          key={group.conceptId}
          group={group}
          cardCtx={cardCtx}
          demoByCell={demoByCell}
          allPlacements={allPlacements}
          unmappedCellIds={unmappedCellIds}
          rankKpi={rankKpi}
          onDetail={onDetail}
          onUploadCreatives={onUploadCreatives}
          onUploadCreative={onUploadCreative}
        />
      ))}
    </div>
  );
}
