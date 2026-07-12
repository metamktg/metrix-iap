// ─── Analysis · Budget ────────────────────────────────────────────────
// Spend allocation for the active ad account: campaign totals, per-event
// efficiency (metric selection), spend by concept, and placement spend.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, MetricSelectionBar, SectionCard, fmtUSD, fmtNum, fmtPct, eventLabel,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { PlacementTable } from "./tables";
import { Wallet } from "lucide-react";

const SECTION = "Analysis · 03";

export function BudgetView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  const summary = getCampaignSummary(seed, adAccountId);
  const allEvents = useMemo(
    () => Object.keys(summary?.bottom_line_totals ?? {}),
    [summary]
  );
  const { selected, toggle, isSelected } = useMetricSelection(adAccountId ?? "none", allEvents);
  const { rangeHasData } = useDateRange();
  const { inRangeCell } = useCellRangeScope(getAnalysisData(seed, adAccountId));

  return (
    <ModuleScopeGate section={SECTION} title="Budget" account={account}>
      {() => {
        const acct = account!;
        const a = getAnalysisData(seed, adAccountId);

        if (!summary) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Budget" />
              <ScopeBanner account={acct} />
              <PendingState title="No budget data" message="Campaign spend totals appear once analysis is available." icon={Wallet} />
            </div>
          );
        }

        const eventRows = selected
          .map((e) => ({ event: e, totals: summary.bottom_line_totals[e] }))
          .filter((r) => r.totals != null);

        // Spend by concept (from cell performance, dedupe cell spend across result types
        // is not possible without raw rows — sum as reported per row).
        const conceptSpend = new Map<string, number>();
        for (const r of a?.performance_by_cell ?? []) {
          if (!selected.includes(r["Result type"])) continue;
          if (!inRangeCell(r.cell_id)) continue;
          conceptSpend.set(r.book2_concept_name, (conceptSpend.get(r.book2_concept_name) ?? 0) + r["Amount spent (USD)"]);
        }
        const conceptRows = Array.from(conceptSpend.entries()).sort((x, y) => y[1] - x[1]);
        const maxConcept = Math.max(...conceptRows.map(([, v]) => v), 1);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Budget"
              subtitle="Where spend went and what it produced, by metric selection."
              table="campaign_summary, performance_by_cell"
            />
            <ScopeBanner account={acct} />
            <MetricSelectionBar events={allEvents} isSelected={isSelected} onToggle={toggle} />
            <RangeScopeBar grainNote="Budget figures aggregate the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="budget data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Total spend" value={fmtUSD(summary.total_spend_usd, 0)} />
              <MetricTile label="Impressions" value={fmtNum(summary.total_impressions)} />
              <MetricTile label="Link clicks" value={fmtNum(summary.total_link_clicks)} />
              <MetricTile label="Link CTR" value={fmtPct(summary.overall_link_ctr_pct)} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

              <SectionCard
                title="Efficiency by result event"
                desc="Spend and outcome for each selected result event."
                table="bottom_line_totals"
              >
                {eventRows.length === 0 ? (
                  <PendingState title="No events selected" message="Select at least one result event above." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {eventRows.map(({ event, totals }) => (
                      <div key={event} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                        <p className="text-[11px] font-semibold text-foreground mb-2">{eventLabel(event)}</p>
                        <div className="space-y-1.5 text-[11px] tabular-nums">
                          <div className="flex justify-between"><span className="text-muted-foreground/70">Spend</span><span className="text-foreground/85">{fmtUSD(totals.spend, 0)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground/70">Results</span><span className="text-foreground/85">{fmtNum(totals.results)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground/70">CPA</span><span className="text-foreground/85">{totals.results > 0 ? fmtUSD(totals.spend / totals.results) : "—"}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground/70">Link clicks</span><span className="text-foreground/85">{fmtNum(totals.link_clicks)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Spend by concept"
                desc="Reported spend across creative concepts in the current metric selection."
                table="performance_by_cell"
              >
                {conceptRows.length === 0 ? (
                  <PendingState title="No concept spend" message="No cell rows match the current metric selection." />
                ) : (
                  <div className="space-y-2.5">
                    {conceptRows.map(([name, spend]) => (
                      <div key={name}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
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
                <SectionCard
                  title="Placement spend"
                  desc="Spend and results by placement across analysis runs."
                  table="v3_placement_signal, c4e_placement_signal"
                >
                  <div className="space-y-5">
                    {a.v3_placement_signal.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">V3 placement signal</h4>
                        <PlacementTable rows={a.v3_placement_signal} />
                      </div>
                    )}
                    {a.c4e_placement_signal.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">C4E placement signal</h4>
                        <PlacementTable rows={a.c4e_placement_signal} />
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
