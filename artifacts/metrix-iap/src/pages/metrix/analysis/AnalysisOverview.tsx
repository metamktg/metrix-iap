// ─── Analysis · Overview ──────────────────────────────────────────────
// Entry point for the Analysis section: campaign totals, the core
// control reads, and jump-offs into each analysis subpage.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, SectionCard, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import { LineChart, Library, Users, LayoutGrid, Wallet, ArrowRight } from "lucide-react";
import { buildMetricCatalog, metricSourceFromCampaignSummary, metricById } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
import { cn } from "@/lib/utils";

const SECTION = "Analysis · 03";

export function AnalysisOverview() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const analysis = getAnalysisData(seed, adAccountId);
  const summary = getCampaignSummary(seed, adAccountId);
  const { range, narrowed, filterCells } = useCellRangeScope(analysis);
  const [, navigate] = useLocation();

  const metricCatalog = useMemo(
    () => (summary ? buildMetricCatalog(metricSourceFromCampaignSummary(summary)) : []),
    [summary]
  );
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);
  const { selected: selectedMetricIds, toggle, move, reset } = useMetricSelection(availableMetricIds);
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Analysis Overview" account={account}>
        {() => {
          const acct = account!;
          const term = resultTerm(acct);
          const a = analysis;
          const controls = getCoreControls(seed, adAccountId);

          if (!summary || !a) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Analysis Overview" />
                <ScopeBanner account={acct} />
                <PendingState title="No analysis yet" message="Analysis appears once performance data is connected or imported." icon={LineChart} />
              </div>
            );
          }

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
              label: "Budget Insight",
              Icon: Wallet,
              desc: "Spend allocation by result event, concept, and placement.",
              stat: `${fmtUSD(summary.total_spend_usd, 0)} analyzed`,
            },
          ];

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Analysis Overview"
                subtitle="What the account's performance data says, and where to drill in."
                table="campaign_summary, performance_by_cell"
              />
              <ScopeBanner account={acct} />
              <RangeScopeBar grainNote="Campaign totals cover the account's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="analysis data" />
              ) : (
              <>
              {/* ── Metric tiles ── */}
              {scoped ? (
                <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricTile label="Spend (in range)" value={fmtUSD(scoped.spend, 0)} sub="concept flights overlapping range" />
                  <MetricTile label="Link clicks (in range)" value={fmtNum(scoped.linkClicks)} />
                  <MetricTile label="Results (in range)" value={fmtNum(scoped.results)} />
                  <MetricTile label="Concept flights" value={String(scoped.concepts)} sub="overlapping selected range" />
                </div>
              ) : (
                <div>
                  <div className="px-6 pt-5 flex items-center justify-between mb-2">
                    <h2 className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Account totals</h2>
                    <MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />
                  </div>
                  <div className="px-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {selectedMetricIds.map((id) => {
                      const m = metricById(metricCatalog, id);
                      if (!m) return null;
                      return (
                        <button key={id} onClick={() => setOpenMetricId(id)} className="text-left group">
                          <MetricTile label={m.label} value={m.formatted} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="px-6 py-5 space-y-4 max-w-5xl">
                {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

                {controls && (
                  <SectionCard title="Core control reads" desc="The current control concept for each funnel depth." table="core_reanalysis_read">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="mx-card-nested p-4">
                        <div className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">Primary control</div>
                        <p className="text-body-lg font-semibold text-foreground">{controls.primary_control}</p>
                        <p className="text-body text-muted-foreground mt-1.5 leading-relaxed">{controls.primary_control_read}</p>
                      </div>
                      {controls.registration_control && (
                        <div className="mx-card-nested p-4">
                          <div className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">{term.Singular} control</div>
                          <p className="text-body-lg font-semibold text-foreground">{controls.registration_control}</p>
                          <p className="text-body text-muted-foreground mt-1.5 leading-relaxed">{controls.registration_control_read}</p>
                        </div>
                      )}
                    </div>
                  </SectionCard>
                )}

                <SectionCard title="Analysis modules" desc="Each module reads a different slice of the same account data.">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {subpages.map((s) => (
                      <button
                        key={s.to}
                        onClick={() => navigate(s.to)}
                        className={cn(
                          "group text-left mx-card-nested p-4 flex flex-col gap-2.5",
                          "hover-elevate active-elevate"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <s.Icon className="w-4 h-4 text-primary" />
                          <span className="text-body-lg font-semibold text-foreground">{s.label}</span>
                        </div>
                        <p className="text-body text-muted-foreground leading-relaxed flex-1">{s.desc}</p>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/20">
                          <span className="text-label font-mono text-muted-foreground/70">{s.stat}</span>
                          <span className="flex items-center gap-1 text-label font-medium text-primary/80 group-hover:text-primary transition-colors">
                            Open <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </button>
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

      <MetricDiagnosticModal
        open={openMetric != null}
        onClose={() => setOpenMetricId(null)}
        metric={openMetric}
        analysis={analysis}
        scope="account"
      />
    </>
  );
}
