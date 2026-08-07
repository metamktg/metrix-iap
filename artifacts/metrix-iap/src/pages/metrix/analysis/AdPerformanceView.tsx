// ─── Analysis · Ad Performance ──────────────────────────────────────────
// The charts/tiles read surface for Analysis (formerly "Overview"):
// campaign totals, the core control reads, and jump-offs into each
// analysis subpage. The Analysis command center (AnalysisCommandCenter,
// mounted at the parent /app/analysis route) owns execution + run
// history — this page is read-only.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls, getMST } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState, SectionInfoIcon,
} from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import { LineChart, Library, Users, LayoutGrid, Wallet, TrendingUp } from "lucide-react";

const SECTION = "Analysis · 03";

export function AdPerformanceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const analysis = getAnalysisData(seed, adAccountId);
  const { range, narrowed, filterCells } = useCellRangeScope(analysis);

  return (
    <ModuleScopeGate section={SECTION} title="Ad Performance" account={account}>
      {() => {
        const acct = account!;
        const term = resultTerm(acct);
        const summary = getCampaignSummary(seed, adAccountId);
        const a = analysis;
        const controls = getCoreControls(seed, adAccountId);

        if (!summary || !a) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Ad Performance" />
              <ScopeBanner account={acct} />
              <PendingState title="No analysis yet" message="Analysis appears once performance data is connected or imported." icon={LineChart} />
            </div>
          );
        }

        // Range-scoped totals from the dated concept rollup. When the user
        // narrows the range, tiles reflect only concepts whose flight
        // window overlaps it — no per-day interpolation, whole flights.
        const rollup = a.concept_rollup ?? [];
        const rollupDates = (r: (typeof rollup)[number]) => ({ start: r.date_start, end: r.date_end });
        const scoped = narrowed
          ? {
              spend: sumInRange(rollup, range, rollupDates, (r) => r.spend),
              linkClicks: sumInRange(rollup, range, rollupDates, (r) => r.link_clicks),
              results: sumInRange(rollup, range, rollupDates, (r) => r.results),
              concepts: rollup.filter((r) => range && r.date_start && r.date_end && !(r.date_end < range.start || r.date_start > range.end)).length,
            }
          : null;
        const cellRowsInRange = filterCells(a.performance_by_cell).length;

        const mst = getMST(seed, adAccountId);
        const lib = mst?.local_book2_library ?? [];
        const resolveConceptName = (id: string) =>
          lib.find((c) => c.cell_id === id)?.book2_concept_name ?? id;
        const resolveControlText = (text: string, id: string) => {
          const name = resolveConceptName(id);
          if (name === id) return text;
          return text.replace(id, name);
        };

        const subpages = [
          {
            to: "/app/analysis/library",
            label: "IAP Library",
            Icon: Library,
            desc: "Cell and variable performance across the account.",
            stat: narrowed
              ? `${cellRowsInRange} cell rows in range · ${a.v3_variable_performance.length} variable rows`
              : `${a.performance_by_cell.length} cell rows · ${a.v3_variable_performance.length} variable rows`,
          },
          {
            to: "/app/analysis/audience",
            label: "Audience",
            Icon: Users,
            desc: `Demographic ${term.singular} signal by age and gender.`,
            stat: `${a.demographic_registration_signal.length} demographic rows`,
          },
          {
            to: "/app/analysis/placements",
            label: "Placements",
            Icon: LayoutGrid,
            desc: "Where delivery happened and what each placement produced.",
            stat: `${a.v3_placement_signal.length + a.c4e_placement_signal.length} placement rows`,
          },
          {
            to: "/app/analysis/budget",
            label: "Budget",
            Icon: Wallet,
            desc: "Spend allocation by result event, concept, and placement.",
            stat: `${fmtUSD(summary.total_spend_usd, 0)} analyzed`,
          },
          {
            to: "/app/analysis/funnel",
            label: "Engagement Funnel",
            Icon: TrendingUp,
            desc: "Frequency, CTR all vs link, reach CTR, and full conversion waterfall.",
            stat: `${fmtNum(summary.total_impressions)} impressions · ${fmtNum(summary.total_link_clicks)} link clicks`,
          },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Ad Performance"
              subtitle="What the account's performance data says, and where to drill in."
              table="campaign_summary, performance_by_cell"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Campaign totals cover the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="analysis data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {scoped ? (
                <>
                  <MetricTile variant="primary" label="Spend (in range)" value={fmtUSD(scoped.spend, 0)} sub="concept flights overlapping range" />
                  <MetricTile label="Link clicks (in range)" value={fmtNum(scoped.linkClicks)} />
                  <MetricTile label="Results (in range)" value={fmtNum(scoped.results)} />
                  <MetricTile label="Concept flights" value={String(scoped.concepts)} sub="overlapping selected range" />
                </>
              ) : (
                <>
                  <MetricTile variant="primary" label="Total spend" value={fmtUSD(summary.total_spend_usd, 0)} />
                  <MetricTile label="Impressions" value={fmtNum(summary.total_impressions)} />
                  <MetricTile label="Link clicks" value={fmtNum(summary.total_link_clicks)} />
                  <MetricTile label="Link CTR" value={fmtPct(summary.overall_link_ctr_pct)} />
                </>
              )}
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

              {controls && (
                <SectionCard title="Core control reads" desc="Control creative · per funnel depth" table="core_reanalysis_read" right={<SectionInfoIcon tip="The winning concept at each funnel stage as determined by the most recent re-analysis run — the benchmark every new test is measured against." />}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(() => {
                      const primaryName = resolveConceptName(controls.primary_control);
                      const primaryResolved = primaryName !== controls.primary_control;
                      return (
                        <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                          <div className={cn(TYPE.microLabel, "text-muted-foreground/70 mb-1.5")}>Primary control</div>
                          {/* Unresolved codes (no human name in local_book2_library) render
                              de-emphasized instead of borrowing the resolved-name treatment —
                              a raw composite ID is not a headline. */}
                          <p className={primaryResolved ? TYPE.title : cn(TYPE.body, "font-mono text-muted-foreground/70")}>
                            {primaryName}
                          </p>
                          <p className={cn(TYPE.body, "text-muted-foreground/80 mt-1.5")}>{resolveControlText(controls.primary_control_read, controls.primary_control)}</p>
                          {primaryResolved && (
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/40 mt-1.5")}>{controls.primary_control}</p>
                          )}
                        </div>
                      );
                    })()}
                    {controls.registration_control && (() => {
                      const regId = controls.registration_control!;
                      const regName = resolveConceptName(regId);
                      const regResolved = regName !== regId;
                      return (
                        <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                          <div className={cn(TYPE.microLabel, "text-muted-foreground/70 mb-1.5")}>{term.Singular} control</div>
                          <p className={regResolved ? TYPE.title : cn(TYPE.body, "font-mono text-muted-foreground/70")}>
                            {regName}
                          </p>
                          {controls.registration_control_read && (
                            <p className={cn(TYPE.body, "text-muted-foreground/80 mt-1.5")}>{resolveControlText(controls.registration_control_read, regId)}</p>
                          )}
                          {regResolved && (
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/40 mt-1.5")}>{regId}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </SectionCard>
              )}

              {/* Reference strip only — these 5 destinations are already reachable
                  via the Analysis section tab bar in ModuleHeader above; this is
                  a compact index (label + a live stat), not a second nav. Each
                  module's full description lives in the title attr, not as
                  always-visible first-layer prose. */}
              <SectionCard title="Analysis modules" desc="Same data · different slices" right={<SectionInfoIcon tip="Each module drills into a different dimension of the same import — Library (cell/variable performance), Audience, Placements, Budget, and Engagement Funnel." />}>
                <div className="flex flex-wrap gap-2">
                  {subpages.map((s) => (
                    <div
                      key={s.to}
                      title={s.desc}
                      className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] pl-3 pr-1.5 py-1.5"
                    >
                      <s.Icon className="w-3.5 h-3.5 text-interactive shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className={TYPE.title}>{s.label}</span>
                        <span className={cn(TYPE.microLabel, "text-muted-foreground/50 truncate")}>{s.stat}</span>
                      </div>
                      <CrossLink to={s.to} label="Open" />
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
