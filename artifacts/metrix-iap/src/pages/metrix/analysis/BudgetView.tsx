// ─── Analysis · Budget ────────────────────────────────────────────────
// Spend allocation for the active ad account: campaign totals, per-event
// efficiency (metric selection), spend by concept, and placement spend.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, CrossLink, MetricSelectionBar, SectionCard, fmtUSD, fmtNum, fmtPct, eventLabel,
  SkeletonTileRow, DatePresetBar, type ViewPreset,
} from "../shared";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { PlacementTable } from "./tables";
import { Wallet, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTION = "Analysis · 03";

export function BudgetView() {
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [preset, setPreset] = useState<ViewPreset>("all");
  const [showPlacements, setShowPlacements] = useState(false);

  const { data: presetData, isFetching: presetFetching } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", preset),
    enabled: preset !== "all" && !!adAccountId,
  });

  const summary = getCampaignSummary(seed, adAccountId);
  const allEvents = useMemo(
    () => Object.keys(summary?.bottom_line_totals ?? {}),
    [summary]
  );
  const { selected, toggle, isSelected } = useMetricSelection(adAccountId ?? "none", allEvents);

  return (
    <ModuleScopeGate section={SECTION} title="Budget" account={account}>
      {() => {
        const acct = account!;
        const a = getAnalysisData(seed, adAccountId);

        if (!summary) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Budget" tabs="analysis" account={acct} />
              <PendingState
                title="No budget data"
                message="Campaign spend totals appear once analysis is available."
                icon={Wallet}
                action={<CrossLink to="/app/analysis/overview" label="Return to Analysis Overview" />}
              />
            </div>
          );
        }

        // When a preset is active use API bottom_line_totals; otherwise seed summary.
        const activeBlt = preset !== "all" && presetData
          ? presetData.totals.bottom_line_totals
          : summary.bottom_line_totals;

        const eventRows = selected
          .map((e) => ({ event: e, totals: activeBlt[e] }))
          .filter((r) => r.totals != null);

        // Spend by concept: when a preset is active use API concept rows (total spend
        // across all result types — event filter not applicable at daily grain level).
        // When "all", use performance_by_cell filtered by selected event types.
        const conceptRows: [string, number][] = preset !== "all" && presetData
          ? presetData.concept_rows
              .map((r) => [`${r.book ?? ""} ${r.concept}`.trim(), r.spend] as [string, number])
              .sort((x, y) => y[1] - x[1])
          : (() => {
              const conceptSpend = new Map<string, number>();
              for (const r of a?.performance_by_cell ?? []) {
                if (!selected.includes(r["Result type"])) continue;
                conceptSpend.set(r.book2_concept_name, (conceptSpend.get(r.book2_concept_name) ?? 0) + r["Amount spent (USD)"]);
              }
              return Array.from(conceptSpend.entries()).sort((x, y) => y[1] - x[1]);
            })();
        const maxConcept = Math.max(...conceptRows.map(([, v]) => v), 1);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Budget"
              subtitle="Spend allocation · by metric selection"
              tabs="analysis"
              account={acct}
            />
            <MetricSelectionBar events={allEvents} isSelected={isSelected} onToggle={toggle} />
            <DatePresetBar
              value={preset}
              onChange={setPreset}
              availableWindow={presetData?.available_window}
              isFetching={presetFetching}
            />
            <>
            {(isRefetching || (preset !== "all" && presetFetching)) ? (
              <div className="px-6 pt-5">
                <SkeletonTileRow count={4} />
              </div>
            ) : (
              <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                {preset !== "all" && presetData ? (
                  <>
                    <MetricTile label="Total spend" value={fmtUSD(presetData.totals.total_spend_usd, 0)} />
                    <MetricTile label="Impressions" value={fmtNum(presetData.totals.total_impressions)} />
                    <MetricTile label="Link clicks" value={fmtNum(presetData.totals.total_link_clicks)} />
                    <MetricTile label="Link CTR" value={fmtPct(presetData.totals.overall_link_ctr_pct)} />
                  </>
                ) : (
                  <>
                    <MetricTile label="Total spend" value={fmtUSD(summary.total_spend_usd, 0)} />
                    <MetricTile label="Impressions" value={fmtNum(summary.total_impressions)} />
                    <MetricTile label="Link clicks" value={fmtNum(summary.total_link_clicks)} />
                    <MetricTile label="Link CTR" value={fmtPct(summary.overall_link_ctr_pct)} />
                  </>
                )}
              </div>
            )}

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

              <SectionCard
                title="Efficiency by result event"
                desc="Spend · results · CPA per event type"
              >
                {eventRows.length === 0 ? (
                  <PendingState title="No events selected" message="Select at least one result event above." action={<CrossLink to="/app/analysis/overview" label="Return to Overview" />} />
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    {/* Compact header row */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-6 px-3 py-2 border-b border-border/30 bg-white/[0.015]">
                      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/55">Event</span>
                      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/55 text-right">Spend</span>
                      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/55 text-right">Results</span>
                      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/55 text-right">CPA</span>
                      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/55 text-right">Clicks</span>
                    </div>
                    {eventRows.map(({ event, totals }) => (
                      <div
                        key={event}
                        className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-6 px-3 py-2.5 border-b border-border/15 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <span className="text-body font-medium text-foreground/90 truncate">{eventLabel(event)}</span>
                        <span className="text-body font-mono tabular-nums text-foreground/80 text-right">{fmtUSD(totals.spend, 0)}</span>
                        <span className="text-body font-mono tabular-nums text-foreground/80 text-right">{fmtNum(totals.results)}</span>
                        <span className="text-body font-mono tabular-nums text-foreground/80 text-right">{totals.results > 0 ? fmtUSD(totals.spend / totals.results) : "—"}</span>
                        <span className="text-body font-mono tabular-nums text-muted-foreground/60 text-right">{fmtNum(totals.link_clicks)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Spend by concept"
                desc="Current metric selection"
                >
                {conceptRows.length === 0 ? (
                  <PendingState title="No concept spend" message="No cell rows match the current metric selection." action={<CrossLink to="/app/analysis/overview" label="Return to Overview" />} />
                ) : (
                  <div className="space-y-2.5">
                    {conceptRows.map(([name, spend]) => (
                      <div key={name}>
                        <div className="flex items-center justify-between text-caption mb-1">
                          <span className="text-foreground/85 font-medium">{name}</span>
                          <span className="text-muted-foreground/60 tabular-nums">{fmtUSD(spend, 0)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.max((spend / maxConcept) * 100, 3)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {a && (a.v3_placement_signal.length > 0 || a.c4e_placement_signal.length > 0) && (
                <div className="rounded-xl border border-border/30 bg-white/[0.01] overflow-hidden">
                  <button
                    onClick={() => setShowPlacements((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group"
                    aria-expanded={showPlacements}
                  >
                    <div className="text-left">
                      <span className="text-sm font-bold text-foreground">Placement spend</span>
                      <span className="text-label text-muted-foreground/45 ml-2">
                        {a.v3_placement_signal.length + a.c4e_placement_signal.length} rows
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <CrossLink to="/app/analysis/placements" label="Full breakdown →" />
                      {showPlacements
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors" />
                      }
                    </div>
                  </button>
                  {showPlacements && (
                    <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-4">
                      {a.v3_placement_signal.length > 0 && (
                        <div>
                          <h4 className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">V3 signal</h4>
                          <PlacementTable rows={a.v3_placement_signal} />
                        </div>
                      )}
                      {a.c4e_placement_signal.length > 0 && (
                        <div>
                          <h4 className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">C4E signal</h4>
                          <PlacementTable rows={a.c4e_placement_signal} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
