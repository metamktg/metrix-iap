// ─── Analysis · Concept Map ───────────────────────────────────────────
// Groups creative cells by concept and maps them onto strategy pillars.
// Shows which concepts feed which pillars, with drill-down and
// cross-links into the Hypothesis Queue and Brief Builder.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getStrategyData, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  CrossLink, fmtUSD, fmtNum, eventLabel,
} from "../shared";
import { VariableCodeChips } from "../analysis/tables";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { RangeScopeBar, NoDataInRangeState } from "../shared";
import { getMST } from "@/lib/data/metrixSeedAdapter";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { Network, Layers } from "lucide-react";
import type { CellPerformanceRow } from "@/lib/data/seedTypes";

const SECTION = "MST · 07";

interface ConceptGroup {
  name: string;
  cells: CellPerformanceRow[];
  spend: number;
  results: number;
  cellIds: string[];
}

export function ConceptMapView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [detail, setDetail] = useState<ConceptGroup | null>(null);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const { rangeHasData } = useDateRange();
  const { filterCells } = useCellRangeScope(getAnalysisData(seed, adAccountId));

  return (
    <ModuleScopeGate section={SECTION} title="Concept Map" account={account}>
      {() => {
        const acct = account!;
        const a = getAnalysisData(seed, adAccountId);
        const strategy = getStrategyData(seed, adAccountId);

        if (!a || a.performance_by_cell.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Concept Map" account={acct} />
              <PendingState title="No concepts yet" message="Concepts appear once cell-level analysis is available." icon={Network}
                action={<CrossLink to="/app/analysis/library" label="Open IAP Library" />}
              />
            </div>
          );
        }

        // Only cells whose concept flight overlaps the selected range.
        const rowsInRange = filterCells(a.performance_by_cell);

        const groupsMap = new Map<string, ConceptGroup>();
        for (const r of rowsInRange) {
          const g = groupsMap.get(r.book2_concept_name) ?? {
            name: r.book2_concept_name, cells: [], spend: 0, results: 0, cellIds: [],
          };
          g.cells.push(r);
          g.spend += r["Amount spent (USD)"];
          g.results += r.Results;
          if (!g.cellIds.includes(r.cell_id)) g.cellIds.push(r.cell_id);
          groupsMap.set(r.book2_concept_name, g);
        }
        const groups = Array.from(groupsMap.values()).sort((x, y) => y.spend - x.spend);
        const maxSpend = Math.max(...groups.map((g) => g.spend), 1);

        const pillars = strategy?.message_pillars ?? [];
        const pillarsForGroup = (g: ConceptGroup) =>
          pillars.filter((p) => p.source_cells.some((c) => g.cellIds.includes(c)));

        const linkedConcepts = groups.filter((g) => pillarsForGroup(g).length > 0).length;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Concept Map"
              subtitle="Concepts mapped to pillars"
              account={acct}
            />
            <RangeScopeBar />

            {!rangeHasData ? (
              <NoDataInRangeState what="concept data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Concepts" value={String(groups.length)} />
              <MetricTile label="Creative cells" value={String(new Set(rowsInRange.map((r) => r.cell_id)).size)} />
              <MetricTile label="Strategy pillars" value={String(pillars.length)} />
              <MetricTile label="Concepts feeding pillars" value={String(linkedConcepts)} />
            </div>

            <div className="px-6 py-5 grid grid-cols-dashboard-2 gap-3 max-w-5xl">
              {groups.map((g) => {
                const linked = pillarsForGroup(g);
                return (
                  <button
                    key={g.name}
                    onClick={() => setDetail(g)}
                    className="text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {g.cellIds.map((c) => (
                        <span key={c} className="text-[9px] font-mono text-muted-foreground/70 border border-border/40 px-1 py-0.5 rounded leading-none">{c}</span>
                      ))}
                    </div>
                    <p className="text-title font-semibold text-foreground leading-tight">{g.name}</p>

                    <div className="mt-3 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.max((g.spend / maxSpend) * 100, 3)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-label text-muted-foreground/60 tabular-nums">
                      <span>{fmtUSD(g.spend, 0)} spend</span>
                      <span>{fmtNum(g.results)} results</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-1.5 flex-wrap">
                      <Layers className="w-3.5 h-3.5 text-primary/50" />
                      {linked.length ? (
                        linked.map((p) => (
                          <span key={p.id} className="text-label text-primary/80 border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 rounded leading-none">{p.label}</span>
                        ))
                      ) : (
                        <span className="text-label text-muted-foreground/60">No pillar linked yet</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker={`Concept · ${detail.cellIds.join(", ")}`}
                title={detail.name}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4 flex-wrap">
                    <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />
                    <CrossLink to={`/app/analysis/library?focus=${detail.cellIds[0]}`} label="Open in IAP Library" />
                    <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Spend" value={fmtUSD(detail.spend, 0)} />
                  <MetricTile label="Results" value={fmtNum(detail.results)} />
                </div>
                <DrawerField label="Result breakdown">
                  <div className="space-y-1.5">
                    {detail.cells.map((r) => (
                      <div key={r.cell_id + r["Result type"]} className="flex items-center justify-between gap-2">
                        <span className="text-label text-muted-foreground/60">{r.cell_id} · {eventLabel(r["Result type"])}</span>
                        <span className="text-caption text-foreground/80 tabular-nums">{fmtNum(r.Results)} · {r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"} CPA</span>
                      </div>
                    ))}
                  </div>
                </DrawerField>
                <DrawerField label="Variable codes">
                  <div className="space-y-2">
                    {detail.cells.filter((r, i, arr) => arr.findIndex((x) => x.cell_id === r.cell_id) === i).map((r) => (
                      <div key={r.cell_id}>
                        <span className="text-[9px] font-mono text-muted-foreground/70">{r.cell_id}</span>
                        <VariableCodeChips row={r} />
                      </div>
                    ))}
                  </div>
                </DrawerField>
                {(getStrategyData(seed, adAccountId)?.message_pillars ?? [])
                  .filter((p) => p.source_cells.some((c) => detail.cellIds.includes(c)))
                  .map((p) => (
                    <DrawerField key={p.id} label={`Pillar · ${p.label}`}>
                      <p className="italic text-primary/80">"{p.plain_descriptor}"</p>
                      <p className="mt-1 text-caption text-muted-foreground/70">{p.why_it_matters}</p>
                    </DrawerField>
                  ))}
                <DrawerField label="Creatives">
                  <div className="grid grid-cols-2 gap-2">
                    {detail.cellIds.map((cid) => (
                      <CreativeCard
                        key={cid}
                        data={cardFromCell(cid, {
                          perfRows: a.performance_by_cell,
                          mst: getMST(seed, adAccountId),
                          ...getCreativeLinkContext(seed, adAccountId),
                        })}
                      />
                    ))}
                  </div>
                </DrawerField>
              </InfoDrawer>
            )}

            {detail && (
              <SegmentGridModal
                open={segmentsOpen}
                onClose={() => setSegmentsOpen(false)}
                kicker={`Concept · ${detail.cellIds.join(", ")}`}
                title={detail.name}
                analysis={a}
                cellIds={detail.cellIds}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
