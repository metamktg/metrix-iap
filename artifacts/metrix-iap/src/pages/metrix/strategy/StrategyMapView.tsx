// ─── Strategy · Strategy Map ──────────────────────────────────────────
// Maps each message pillar to the creative cells that validated it, the
// variable stack it carries, and the hypotheses it feeds.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState,
  CrossLink, readableVariables, fmtUSD, fmtNum,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { cn } from "@/lib/utils";
import { Map, ArrowDown } from "lucide-react";
import type { MessagePillar } from "@/lib/data/seedTypes";

const SECTION = "Strategy · 04";

const PILLAR_ACCENT = [
  "border-l-emerald-400/50",
  "border-l-blue-400/50",
  "border-l-purple-400/50",
  "border-l-amber-400/50",
];

export function StrategyMapView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [segmentPillar, setSegmentPillar] = useState<MessagePillar | null>(null);
  const { rangeHasData } = useDateRange();
  const { inRangeCell } = useCellRangeScope(getAnalysisData(seed, adAccountId));

  return (
    <ModuleScopeGate section={SECTION} title="Strategy Map" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);

        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Strategy Map" />
              <ScopeBanner account={acct} />
              <PendingState title="No strategy map" message="The map draws from message pillars — none exist for this account yet." icon={Map} />
            </div>
          );
        }

        const pillars = strategy.message_pillars;
        const hypotheses = strategy.active_hypotheses;

        // Evidence rollup: spend/results across the cells that validated a
        // pillar, restricted to cells whose flight overlaps the date range.
        const cellEvidence = (cellIds: string[]) => {
          const rows = (analysis?.performance_by_cell ?? []).filter((r) => cellIds.includes(r.cell_id) && inRangeCell(r.cell_id));
          return {
            spend: rows.reduce((n, r) => n + r["Amount spent (USD)"], 0),
            results: rows.reduce((n, r) => n + r.Results, 0),
          };
        };

        // A hypothesis feeds a pillar if its source references the pillar id or a source cell.
        const hypothesesFor = (pillarId: string, cellIds: string[]) =>
          hypotheses.filter((h) => {
            const src = h.source.toLowerCase();
            return src.includes(pillarId.toLowerCase()) || cellIds.some((c) => src.includes(c.toLowerCase()));
          });

        const claimed = new Set(pillars.flatMap((p) => hypothesesFor(p.id, p.source_cells).map((h) => h.id)));
        const unattached = hypotheses.filter((h) => !claimed.has(h.id));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Strategy Map"
              subtitle="Evidence → pillar → hypothesis: how validated cells become the next round of tests."
              table="message_pillars, active_hypotheses, performance_by_cell"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Pillar evidence aggregates each cell's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="strategy map data" />
            ) : (
            <>
            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {pillars.map((p, i) => {
                const evidence = cellEvidence(p.source_cells);
                const linked = hypothesesFor(p.id, p.source_cells);
                return (
                  <div key={p.id} className={cn("rounded-xl border border-border/40 border-l-2 bg-white/[0.02] p-5", PILLAR_ACCENT[i % PILLAR_ACCENT.length])}>
                    {/* Evidence */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Evidence</span>
                      {p.source_cells.map((c) => (
                        <span key={c} className="text-[10px] font-mono text-foreground/80 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{c}</span>
                      ))}
                      {evidence.spend > 0 && (
                        <span className="text-[11px] text-muted-foreground/80 tabular-nums ml-1">
                          {fmtUSD(evidence.spend, 0)} spend · {fmtNum(evidence.results)} results
                        </span>
                      )}
                      {analysis && p.source_cells.length > 0 && (
                        <span className="ml-auto">
                          <SegmentDrilldownButton onClick={() => setSegmentPillar(p)} />
                        </span>
                      )}
                    </div>

                    {/* Pillar */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground/70">{p.id}</span>
                          <h3 className="text-[15px] font-semibold text-foreground leading-tight">{p.label}</h3>
                        </div>
                        <p className="text-[12px] text-foreground/85 mt-1.5 leading-relaxed">{p.plain_descriptor}</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">{p.why_it_matters}</p>
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {Object.entries(p.variable_stack).map(([family, code]) => (
                            <span key={family} className="text-[10px] text-foreground/80 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">
                              <span className="text-muted-foreground/70 capitalize">{family}:</span> {readableVariables(code)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Hypotheses fed by this pillar */}
                    {linked.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/20">
                        <div className="flex items-center gap-1.5 mb-2">
                          <ArrowDown className="w-3 h-3 text-muted-foreground/60" />
                          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Feeds hypotheses</span>
                        </div>
                        <div className="space-y-1.5">
                          {linked.map((h) => (
                            <div key={h.id} className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2">
                              <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">{h.id}</span>
                              <span className="text-[12px] text-foreground/90 flex-1 min-w-0">{h.label}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary border border-primary/25 bg-primary/10 px-1.5 py-0.5 rounded leading-none shrink-0">{h.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {unattached.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-white/[0.02] p-5">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">Other active hypotheses</div>
                  <div className="space-y-1.5">
                    {unattached.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2">
                        <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">{h.id}</span>
                        <span className="text-[12px] text-foreground/90 flex-1 min-w-0">{h.label}</span>
                        <span className="text-[11px] text-muted-foreground/75 shrink-0">{h.source}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary border border-primary/25 bg-primary/10 px-1.5 py-0.5 rounded leading-none shrink-0">{h.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <CrossLink to="/app/strategy/hypotheses" label="Open the hypothesis queue" />
                <CrossLink to="/app/briefs/builder" label="Draft briefs from pillars" />
              </div>
            </div>
            </>
            )}

            {segmentPillar && analysis && (
              <SegmentGridModal
                open
                onClose={() => setSegmentPillar(null)}
                kicker={`Pillar · ${segmentPillar.id}`}
                title={segmentPillar.label}
                analysis={analysis}
                cellIds={segmentPillar.source_cells}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
