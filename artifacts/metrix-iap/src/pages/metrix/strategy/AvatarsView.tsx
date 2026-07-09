// ─── Strategy · Avatars ───────────────────────────────────────────────
// Audience avatars (ICP columns from the historical MST matrix) plus the
// demographic conversion signal for the active ad account.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, readableVariables, resultTerm,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { DemographicTable } from "../analysis/tables";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Users } from "lucide-react";
import type { MSTMatrixColumn, MSTMatrixCell } from "@/lib/data/seedTypes";

const SECTION = "Strategy · 04";

type Tab = "avatars" | "audience";

export function AvatarsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<Tab>("avatars");
  const [detail, setDetail] = useState<{ column: MSTMatrixColumn; cells: MSTMatrixCell[] } | null>(null);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const { rangeHasData } = useDateRange();

  return (
    <ModuleScopeGate section={SECTION} title="Avatars" account={account}>
      {() => {
        const acct = account!;
        const term = resultTerm(acct);
        const mst = getMST(seed, adAccountId);
        const matrix = mst?.historical_matrix_4x4;
        const analysis = getAnalysisData(seed, adAccountId);
        const demo = analysis?.demographic_registration_signal ?? [];

        if (!matrix) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Avatars" />
              <ScopeBanner account={acct} />
              <PendingState title="No avatars yet" message="Avatars are derived from the MST matrix once it's available for this account." icon={Users} />
            </div>
          );
        }

        const cellsFor = (colId: string) => matrix.cells.filter((c) => c.column_id === colId);

        const TABS: { id: Tab; label: string; count: number }[] = [
          { id: "avatars", label: "Avatars", count: matrix.columns.length },
          { id: "audience", label: "Audience signal", count: demo.length },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Avatars"
              subtitle="Audience avatars from the historical MST matrix, with their message angles."
              table="historical_matrix_4x4, demographic_registration_signal"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Avatars come from the historical matrix; audience signal aggregates full flight windows — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="avatar data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Avatars" value={String(matrix.columns.length)} />
              <MetricTile label="Message angles" value={String(matrix.cells.length)} sub="matrix cells across avatars" />
              <MetricTile label="Shared rows" value={String(matrix.rows.length)} />
              <MetricTile label="Audience rows" value={String(demo.length)} sub={`${term.singular} signal`} />
            </div>

            <div className="mt-4">
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
            </div>

            <div className="px-6 py-5 max-w-5xl">
              {tab === "avatars" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {matrix.columns.map((col) => {
                    const cells = cellsFor(col.id);
                    return (
                      <button
                        key={col.id}
                        onClick={() => setDetail({ column: col, cells })}
                        className="text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg border border-primary/25 bg-primary/[0.08] flex items-center justify-center">
                            <Users className="w-4 h-4 text-primary/70" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground leading-tight whitespace-pre-line">{col.name}</p>
                            <span className="text-[9px] font-mono text-muted-foreground/60">{col.icp}</span>
                          </div>
                        </div>
                        <div className="space-y-1.5 mt-3">
                          {cells.slice(0, 2).map((c) => (
                            <p key={c.cell_id} className="text-[11px] text-muted-foreground/70 leading-snug">
                              <span className="font-mono text-[9px] text-muted-foreground/60 mr-1">{c.cell_id}</span>
                              {c.plain_text.headline ?? c.concept_code}
                            </p>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/20 text-[10px] text-muted-foreground/60">
                          {cells.length} message angle{cells.length === 1 ? "" : "s"} · tap for details
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tab === "audience" && (
                demo.length ? (
                  <DemographicTable rows={demo} />
                ) : (
                  <PendingState title="No audience signal" message={`Demographic ${term.singular} signal appears once analysis is available.`} icon={Users} />
                )
              )}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4 flex-wrap">
                    {analysis && <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />}
                    <CrossLink to="/app/mst" label="Open MST matrix" />
                    <CrossLink to="/app/briefs/builder" label="Open Brief Builder" />
                  </div>
                }
              >
                {detail.cells.map((c) => (
                  <DrawerField key={c.cell_id} label={`${c.cell_id} · ${c.concept_code}`}>
                    {c.plain_text.headline && <p className="font-semibold text-foreground">{c.plain_text.headline}</p>}
                    {c.plain_text.primary && <p className="mt-1">{c.plain_text.primary}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.values(c.variable_stack).filter(Boolean).map((v) => (
                        <span key={v} className="text-[8px] font-mono text-muted-foreground/70 border border-border/30 px-1 py-0.5 rounded leading-none" title={readableVariables(v)}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </DrawerField>
                ))}
              </InfoDrawer>
            )}

            {detail && analysis && (
              <SegmentGridModal
                open={segmentsOpen}
                onClose={() => setSegmentsOpen(false)}
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                analysis={analysis}
                cellIds={detail.cells.map((c) => c.cell_id)}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
