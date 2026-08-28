// ─── Analysis · Budget ────────────────────────────────────────────────
// Spend allocation for the active ad account: campaign totals, per-event
// efficiency (metric selection), spend by concept, and placement spend.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CaveatNote, CrossLink, MetricSelectionBar, SectionCard, fmtUSD, fmtNum, eventLabel,
  SkeletonTileRow, DatePresetBar, type ViewPreset, SectionInfoIcon,
  useShowMore, ShowMoreButton, SegmentedToggle,
} from "../shared";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { PlacementTable } from "./tables";
import { KpiTileRow } from "@/components/metrics/KpiTile";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import {
  buildMetricCatalog, metricSourceFromApiTotals, metricSourceFromCampaignSummary,
} from "@/lib/data/metricsCatalog";
import { Wallet, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { HEADING, TYPE } from "../typography";
import { DataModule } from "@/components/data-module/DataModule";
import { RankedBars } from "@/components/charts/RankedBars";
import type { DataView } from "@/lib/data-module/viewSupport";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";

const SECTION = "Analysis · 03";

// ── Event efficiency rows (folded) ────────────────────────────────────

type EventRow = { event: string; totals: { spend: number; results: number; link_clicks: number } };

// ── Efficiency by result event ────────────────────────────────────────
//
// Was a five-column numeric grid: uppercase mono column heads over four
// columns of mono figures. Everything in it was true and almost none of it
// was scannable — the reader has to read every cell to find out which event
// is efficient, because nothing in the layout ranks anything. Comparing
// "$9.81" to "$8.99" across two rows of a table is arithmetic; comparing two
// bar lengths is looking.
//
// So it is a DataModule now: the title states what it is, the view switcher
// states how you are looking at it, the metric toggle picks what is being
// ranked, and the scope chips under the data say what the numbers are
// scoped to. The old grid is still there — it is the Table view, which is
// the right rendering when the reader wants every column at once.
//
// The CPA case is the one worth getting right. CPA is better when SMALLER,
// so ranking it descending puts the worst event at the top under the longest
// bar, which reads as "winner" to anyone scanning. Selecting it flips both
// the sort and the bar length, so length and rank agree.

type EventMetric = "spend" | "results" | "cpa" | "clicks";

const EVENT_METRICS: { id: EventMetric; label: string }[] = [
  { id: "spend", label: "Spend" },
  { id: "results", label: "Results" },
  { id: "cpa", label: "CPA" },
  { id: "clicks", label: "Clicks" },
];

/** CPA is a cost: smaller is better, so it sorts and scales the other way. */
const LOWER_IS_BETTER: Record<EventMetric, boolean> = {
  spend: false, results: false, cpa: true, clicks: false,
};

function eventMetricValue(r: EventRow, m: EventMetric): number | null {
  switch (m) {
    case "spend": return r.totals.spend;
    case "results": return r.totals.results;
    case "clicks": return r.totals.link_clicks;
    // Zero results is a real measurement, but a cost PER result does not
    // exist without a denominator — null, never 0, and never spend/0.
    case "cpa": return r.totals.results > 0 ? r.totals.spend / r.totals.results : null;
  }
}

const EVENT_FORMAT: Record<EventMetric, (n: number) => string> = {
  spend: (n) => fmtUSD(n, 0),
  results: fmtNum,
  clicks: fmtNum,
  cpa: (n) => fmtUSD(n, 2),
};

function EventRowsList({ rows }: { rows: EventRow[] }) {
  const fold = useShowMore(rows, 8);
  const [view, setView] = useState<DataView>("compare");
  const [metric, setMetric] = useState<EventMetric>("spend");

  const ranked = useMemo(
    () =>
      rows.map((r) => ({
        key: r.event,
        label: eventLabel(r.event),
        value: eventMetricValue(r, metric),
        // The other three metrics stay on the row, so switching what is
        // RANKED never costs the reader the rest of the picture.
        detail: [
          `${fmtUSD(r.totals.spend, 0)} spend`,
          `${fmtNum(r.totals.results)} results`,
          `${fmtNum(r.totals.link_clicks)} clicks`,
        ].join(" · "),
      })),
    [rows, metric],
  );

  const lower = LOWER_IS_BETTER[metric];
  const metricLabel = EVENT_METRICS.find((m) => m.id === metric)!.label;

  return (
    <DataModule
      title="Efficiency by result event"
      shape="conversion_tracking_signal"
      view={view}
      onViewChange={setView}
      views={["compare", "table"]}
      info="Breaks down spend, results, and CPA by each tracked result event so you can see which conversion goals are running efficiently."
      scope={[
        { label: "Metric", value: metricLabel, active: metric !== "spend" },
        { label: "Events", value: String(rows.length) },
        { label: "Ranked", value: lower ? "best first (lower is better)" : "highest first" },
      ]}
      actions={
        <SegmentedToggle
          options={EVENT_METRICS.map((m) => ({ id: m.id, label: m.label }))}
          active={metric}
          onChange={setMetric as (id: EventMetric) => void}
          ariaLabel="Rank events by"
          responsiveLabels
        />
      }
      data-testid="efficiency-by-result-event"
    >
      {view === "compare" ? (
        <RankedBars
          data={ranked}
          format={EVENT_FORMAT[metric]}
          measureLabel={metricLabel}
          order={lower ? "asc" : "desc"}
          invertLength={lower}
          emptyLabel={`No ${metricLabel.toLowerCase()} measured for these events`}
        />
      ) : (
        <div className="rounded-xl border border-border/40 overflow-x-auto">
          <div className="min-w-[36rem]">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-6 px-3 py-2 border-b border-border/30 bg-foreground/[0.015]">
              <span className="text-label uppercase text-muted-foreground/75">Event</span>
              <span className="text-label uppercase text-muted-foreground/75 text-right">Spend</span>
              <span className="text-label uppercase text-muted-foreground/75 text-right">Results</span>
              <span className="text-label uppercase text-muted-foreground/75 text-right">CPA</span>
              <span className="text-label uppercase text-muted-foreground/75 text-right">Clicks</span>
            </div>
            {fold.visible.map(({ event, totals }) => (
              <div
                key={event}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-6 px-3 py-2.5 border-b border-border/15 last:border-b-0 hover:bg-foreground/[0.02] transition-colors"
              >
                <span className="text-body font-medium text-foreground/90 truncate">{eventLabel(event)}</span>
                <span className="text-body tabular-nums text-foreground/80 text-right">{fmtUSD(totals.spend, 0)}</span>
                <span className="text-body tabular-nums text-foreground/80 text-right">{fmtNum(totals.results)}</span>
                <span className="text-body tabular-nums text-foreground/80 text-right">{totals.results > 0 ? fmtUSD(totals.spend / totals.results, 2) : "—"}</span>
                <span className="text-body tabular-nums text-muted-foreground/75 text-right">{fmtNum(totals.link_clicks)}</span>
              </div>
            ))}
            <ShowMoreButton total={rows.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="event" />
          </div>
        </div>
      )}
    </DataModule>
  );
}

// ── Spend-by-concept rows (folded) ────────────────────────────────────

function ConceptRowsList({ rows, maxConcept }: { rows: [string, number][]; maxConcept: number }) {
  const fold = useShowMore(rows, 8);
  return (
    <div className="space-y-2.5">
      {fold.visible.map(([name, spend]) => (
        <div key={name}>
          <div className="flex items-center justify-between text-caption mb-1">
            <span className="text-foreground/85 font-medium">{name}</span>
            <span className="text-muted-foreground/75 tabular-nums">{fmtUSD(spend, 0)}</span>
          </div>
          <ProgressMeter
            value={spend}
            total={maxConcept}
            label={`${name} spend vs top concept`}
            size="md"
            fillClassName="bg-primary/50"
          />
        </div>
      ))}
      <ShowMoreButton total={rows.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="concepts" />
    </div>
  );
}

export function BudgetView() {
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [preset, setPreset] = useState<ViewPreset>("all");
  const [showPlacements, setShowPlacements] = useState(false);

  // KPI tile drill-down modal (one shared modal for all tiles).
  const [drillMetricId, setDrillMetricId] = useState<string | null>(null);

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
              <ModuleHeader section={SECTION} title="Budget" accountName={acct.name} tabs="analysis" />
              <PendingState
                title="No budget data"
                message="Campaign spend totals appear once analysis is available."
                icon={Wallet}
                action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
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
              accountName={acct.name}
              subtitle="Spend allocation · by metric selection"
              tabs="analysis"
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
                <KpiTileRow
                  viewKey="budget"
                  catalog={buildMetricCatalog(
                    preset !== "all" && presetData
                      ? metricSourceFromApiTotals(presetData.totals)
                      : metricSourceFromCampaignSummary(summary),
                  )}
                  onTileClick={setDrillMetricId}
                />
              </div>
            )}

            <KpiDrilldownModal
              open={drillMetricId != null}
              onClose={() => setDrillMetricId(null)}
              scope="account"
              metricId={drillMetricId}
              catalog={buildMetricCatalog(
                preset !== "all" && presetData
                  ? metricSourceFromApiTotals(presetData.totals)
                  : metricSourceFromCampaignSummary(summary),
              )}
              analysis={a}
              // Seed cell rows have no daily grain, so under a date preset we
              // pass no cell rows rather than full-flight rows mislabeled as
              // preset-scoped.
              scopedCellRows={preset !== "all" ? [] : undefined}
              scopeNarrowed={preset !== "all"}
              windowLabel={
                preset !== "all" && presetData?.available_window
                  ? `${presetData.available_window.start} → ${presetData.available_window.end} (${preset})`
                  : preset !== "all"
                    ? `${preset} preset`
                    : "all data (full flight)"
              }
            />

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

              {/* No SectionCard here: DataModule IS the card, and it carries
                  the title, the view switcher and the scope chips itself.
                  Nesting the two gives the panel two titles and two borders —
                  the commonest way a refaced module ends up heavier than the
                  one it replaced. The empty state keeps its card, because
                  there is no module to render. */}
              {eventRows.length === 0 ? (
                <SectionCard
                  title="Efficiency by result event"
                  desc="Spend · results · CPA per event type"
                  right={<SectionInfoIcon tip="Breaks down spend, results, and CPA by each tracked result event so you can see which conversion goals are running efficiently." />}
                >
                  <PendingState title="No events selected" message="Select at least one result event above." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />
                </SectionCard>
              ) : (
                <EventRowsList rows={eventRows} />
              )}

              <SectionCard
                title="Spend by concept"
                desc="Current metric selection"
                right={<SectionInfoIcon tip="Shows how ad spend is distributed across creative concepts so you can see which ideas are consuming the most budget." />}
                >
                {conceptRows.length === 0 ? (
                  <PendingState title="No concept spend" message="No cell rows match the current metric selection." action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />} />
                ) : (
                  <ConceptRowsList rows={conceptRows} maxConcept={maxConcept} />
                )}
              </SectionCard>

              {a && (a.v3_placement_signal.length > 0 || a.c4e_placement_signal.length > 0) && (
                <div className="rounded-xl border border-border/30 bg-foreground/[0.01] overflow-hidden">
                  {/* The "Full breakdown" link used to live INSIDE this
                      button. A <button> inside a <button> is invalid HTML —
                      the browser keeps one and drops the other, so one of the
                      two actions silently stopped working and nothing said
                      so. check:interaction looks for this, but it could not
                      see it: the outer button is written here and the inner
                      one comes out of CrossLink, so no single file contains
                      the nesting. Found by walking the live DOM instead.

                      The disclosure control and the link are now siblings in
                      a row, which is also what they are conceptually: one
                      opens this section, the other leaves the page. */}
                  <div className="flex items-center gap-2 pr-4">
                    <button
                      onClick={() => setShowPlacements((v) => !v)}
                      className="pressable-lg flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 hover:bg-foreground/[0.02] transition-colors group"
                      aria-expanded={showPlacements}
                    >
                      <div className="text-left">
                        <span className={TYPE.title}>Placement spend</span>
                        <span className="text-label text-muted-foreground/75 ml-2">
                          {a.v3_placement_signal.length + a.c4e_placement_signal.length} rows
                        </span>
                      </div>
                      {showPlacements
                        ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground/75 group-hover:text-foreground/70 transition-colors" />
                        : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground/75 group-hover:text-foreground/70 transition-colors" />
                      }
                    </button>
                    <div className="shrink-0">
                      <CrossLink to="/app/analysis/placements" label="Full breakdown →" />
                    </div>
                  </div>
                  {showPlacements && (
                    <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-4">
                      {a.v3_placement_signal.length > 0 && (
                        <div>
                          <h4 className={cn(HEADING.h5, "mb-2")}>V3 signal</h4>
                          <PlacementTable rows={a.v3_placement_signal} />
                        </div>
                      )}
                      {a.c4e_placement_signal.length > 0 && (
                        <div>
                          <h4 className={cn(HEADING.h5, "mb-2")}>C4E signal</h4>
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
