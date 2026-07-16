// ─── Strategy · Strategy Map ──────────────────────────────────────────
// Maps each message pillar to the creative cells that validated it, the
// variable stack it carries, and the hypotheses it feeds — rendered as
// one visually traceable Evidence → Pillar → Hypothesis chain.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { resolveInlineVariableCodes } from "@/lib/variable-registry";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState,
  CrossLink, fmtUSD, fmtNum, FlowCrumb, useFromParam, LoopAction,
  RangeScopeBar, NoDataInRangeState, ExpandableText,
} from "../shared";
import {
  VariableStackChips, PillarDetailSections, pillarHasDetails,
  HypothesisStatusBadge, VariableCombinationsGrid, playbookHasContent, ScalingPlaybookLanes,
} from "./strategyShared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { cn } from "@/lib/utils";
import { Map, ChevronDown, FlaskConical, Layers, BarChart3 } from "lucide-react";
import type { MessagePillar } from "@/lib/data/seedTypes";
import { ConceptChip } from "@/components/concept/ConceptChip";
import { useConceptRegistry } from "@/lib/concept-registry-context";

const SECTION = "Strategy · 04";

const PILLAR_ACCENT = [
  "border-l-emerald-400/50",
  "border-l-blue-400/50",
  "border-l-purple-400/50",
  "border-l-amber-400/50",
];

/** Chain-stage label with a small icon, used to make the story traceable. */
function StageLabel({ Icon, children }: { Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3 h-3 text-muted-foreground/80" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/90">{children}</span>
    </div>
  );
}

export function StrategyMapView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const { registry } = useConceptRegistry();
  const account = getAdAccount(seed, adAccountId);
  const [segmentPillar, setSegmentPillar] = useState<MessagePillar | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { rangeHasData } = useDateRange();
  const { inRangeCell } = useCellRangeScope(getAnalysisData(seed, adAccountId));
  const fp = useFromParam();

  return (
    <ModuleScopeGate section={SECTION} title="Strategy Map" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);

        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Strategy Map" tabs="strategy" />
              <ScopeBanner account={acct} />
              <PendingState title="No strategy map" message="The map draws from message pillars — none exist for this account yet." icon={Map} />
            </div>
          );
        }

        const pillars = strategy.message_pillars;
        const hypotheses = strategy.active_hypotheses;
        const combinations = strategy.variable_combinations ?? [];
        const playbook = strategy.scaling_playbook ?? null;

        // Evidence rollup: spend/results across the cells that validated a
        // pillar, restricted to cells whose flight overlaps the date range.
        const cellEvidence = (cellIds: string[]) => {
          const rows = (analysis?.performance_by_cell ?? []).filter((r) => cellIds.includes(r.cell_id) && inRangeCell(r.cell_id));
          return {
            spend: rows.reduce((n, r) => n + r["Amount spent (USD)"], 0),
            results: rows.reduce((n, r) => n + r.Results, 0),
          };
        };

        // A hypothesis feeds a pillar only via its explicit pillar_id link —
        // no text inference, so it can never mislink. Hypotheses without a
        // link (or pointing at a pillar not in this set) stay unattached.
        const pillarIds = new Set(pillars.map((p) => p.id));
        const hypothesesFor = (pillarId: string) =>
          hypotheses.filter((h) => h.pillar_id === pillarId);

        const unattached = hypotheses.filter((h) => !h.pillar_id || !pillarIds.has(h.pillar_id));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Strategy Map"
              subtitle="Evidence → pillar → hypothesis: how validated cells become the next round of tests."
              table="message_pillars, active_hypotheses, performance_by_cell"
              tabs="strategy"
            />
            <ScopeBanner account={acct} />
            <FlowCrumb {...fp} />
            <RangeScopeBar grainNote="Pillar evidence aggregates each cell's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="strategy map data" />
            ) : (
            <>
            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {pillars.map((p, i) => {
                const evidence = cellEvidence(p.source_cells);
                const linked = hypothesesFor(p.id);
                const isOpen = expanded[p.id] ?? false;
                const hasDetails = pillarHasDetails(p);
                return (
                  <div key={p.id} className={cn("rounded-xl border border-border/40 border-l-2 bg-white/[0.02] p-5", PILLAR_ACCENT[i % PILLAR_ACCENT.length])}>
                    {/* 1 · Evidence */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <StageLabel Icon={BarChart3}>Evidence</StageLabel>
                      {p.source_cells.map((c) =>
                        registry[c]
                          ? <ConceptChip key={c} code={c} />
                          : <span key={c} className="text-[11px] font-mono text-foreground/85 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{c}</span>
                      )}
                      {evidence.spend > 0 && (
                        <span className="text-[12px] font-medium text-foreground/85 tabular-nums ml-1">
                          {fmtUSD(evidence.spend, 0)} spend · {fmtNum(evidence.results)} results
                        </span>
                      )}
                      {analysis && p.source_cells.length > 0 && (
                        <span className="ml-auto">
                          <SegmentDrilldownButton onClick={() => setSegmentPillar(p)} />
                        </span>
                      )}
                    </div>

                    {/* connector */}
                    <div className="ml-1.5 h-3 border-l border-border/40 mb-1" aria-hidden />

                    {/* 2 · Pillar */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StageLabel Icon={Layers}>Pillar</StageLabel>
                          <span className="text-[10px] font-semibold text-muted-foreground/60 tabular-nums">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <h3 className="text-[18px] font-semibold text-foreground leading-tight mt-1.5">{p.label}</h3>
                        <div className="mt-1.5">
                          <ExpandableText className="text-[12.5px] text-foreground/85 leading-relaxed" text={p.plain_descriptor} />
                        </div>
                        {(() => {
                          const resolved = p.why_it_matters ? resolveInlineVariableCodes(p.why_it_matters) : "";
                          if (!resolved) return null;
                          return (
                            <div className="mt-1.5">
                              <ExpandableText className="text-[11.5px] text-muted-foreground/80 leading-relaxed" text={resolved} threshold={200} />
                            </div>
                          );
                        })()}
                        <div className="mt-2.5">
                          <VariableStackChips stack={p.variable_stack} />
                        </div>

                        {hasDetails && (
                          <div className="mt-3">
                            <button
                              onClick={() => setExpanded((e) => ({ ...e, [p.id]: !isOpen }))}
                              aria-expanded={isOpen}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
                              {isOpen ? "Hide execution detail" : "Execution detail — funnel, specs, placement, scaling"}
                            </button>
                            {isOpen && (
                              <div className="mt-3">
                                <PillarDetailSections pillar={p} profiles={strategy.icp_profiles} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3 · Hypotheses fed by this pillar */}
                    {linked.length > 0 && (
                      <>
                        <div className="ml-1.5 h-3 border-l border-border/40 mt-3" aria-hidden />
                        <div className="pt-1">
                          <div className="mb-2">
                            <StageLabel Icon={FlaskConical}>Feeds hypotheses</StageLabel>
                          </div>
                          <div className="space-y-1.5">
                            {linked.map((h, hi) => (
                              <div key={h.id} className="flex items-start gap-2.5 rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2">
                                <span className="text-[10px] font-semibold text-muted-foreground/50 shrink-0 mt-0.5 tabular-nums w-4 text-right">
                                  {hi + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[12px] text-foreground/90 leading-snug block">{h.label}</span>
                                  {h.isolated_variable && (
                                    <span className="text-[10px] text-muted-foreground/60 leading-snug block mt-0.5 line-clamp-2">
                                      Isolates: {resolveInlineVariableCodes(h.isolated_variable)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <HypothesisStatusBadge status={h.status} />
                                  <CrossLink to={`/app/strategy/hypotheses?focus=${h.id}`} label="Open" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {unattached.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-white/[0.02] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/85 mb-2">Other active hypotheses</div>
                  <div className="space-y-1.5">
                    {unattached.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2">
                        <span className="text-[12px] text-foreground/90 flex-1 min-w-0">{h.label}</span>
                        <HypothesisStatusBadge status={h.status} />
                        <CrossLink to={`/app/strategy/hypotheses?focus=${h.id}`} label="Open" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Variable combinations: winning/losing stacks behind the map */}
              {combinations.length > 0 && (
                <div className="pt-2 space-y-3">
                  <div>
                    <h3 className="text-[16px] font-semibold text-foreground leading-tight">Variable combinations</h3>
                    <p className="text-[13px] text-muted-foreground/80 mt-0.5">Validated variable stacks with their real CPA / CVR reads and the engine's recommendation.</p>
                  </div>
                  <VariableCombinationsGrid combinations={combinations} />
                </div>
              )}

              {/* Scaling playbook lanes */}
              {playbookHasContent(playbook) && (
                <div className="pt-2 space-y-3">
                  <div>
                    <h3 className="text-[16px] font-semibold text-foreground leading-tight">Scaling playbook</h3>
                    <p className="text-[13px] text-muted-foreground/80 mt-0.5">Where the analysis says to push, tune, prove, look next — and what to stay away from.</p>
                  </div>
                  <ScalingPlaybookLanes playbook={playbook!} />
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <CrossLink to="/app/strategy/hypotheses" label="Open the hypothesis queue" />
                <LoopAction
                  to={fp.fromCell
                    ? `/app/briefs/builder?from=strategy&fromCell=${fp.fromCell}`
                    : "/app/briefs/builder"}
                  label="Draft briefs from pillars"
                  icon="brief"
                  variant="secondary"
                />
              </div>
            </div>
            </>
            )}

            {segmentPillar && analysis && (
              <SegmentGridModal
                open
                onClose={() => setSegmentPillar(null)}
                kicker={`Pillar ${String(pillars.findIndex((p) => p.id === segmentPillar.id) + 1).padStart(2, "0")}`}
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
