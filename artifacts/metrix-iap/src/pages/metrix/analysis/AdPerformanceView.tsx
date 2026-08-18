// ─── Analysis · Ad Performance ──────────────────────────────────────────
// The charts/tiles read surface for Analysis (formerly "Overview"):
// campaign totals, the core control reads, and jump-offs into each
// analysis subpage. The Analysis command center (AnalysisCommandCenter,
// mounted at the parent /app/analysis route) owns execution + run
// history — this page is read-only.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import { getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls, getMST, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CaveatNote, SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState, SectionInfoIcon,
  ConfidenceBadge, useShowMore, ShowMoreButton,
} from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import { LineChart, Library, Users, LayoutGrid, Wallet, TrendingUp, AlertTriangle, Eye } from "lucide-react";
import { KpiTileRow } from "@/components/metrics/KpiTile";
import { buildMetricCatalog, metricSourceFromCampaignSummary } from "@/lib/data/metricsCatalog";
import { bucketForConcept, BUCKET_LABEL } from "@/lib/data/scalingBuckets";
import type { DataQualityFlag, ConceptRollupRow, ScalingPlaybook } from "@/lib/data/seedTypes";

const SECTION = "Analysis · 03";

// ─── Signal cards — the canvas's analysis signal strip ────────────────
// Renders the account's real data_quality flags (raised by the last
// analysis run): anomalies read as "Investigate", quality flags as
// "Watch", everything else (attribution window, quality score) as
// neutral notes. First surface in the app to render these flags.

function flagHeadline(f: DataQualityFlag): string {
  const type = typeof f["type"] === "string" ? (f["type"] as string) : null;
  if (type) return type.replace(/_/g, " ");
  return f.kind === "attribution_window" ? "Attribution window" : f.kind.replace(/_/g, " ");
}

function flagBody(f: DataQualityFlag): string {
  const note = typeof f["note"] === "string" ? (f["note"] as string) : null;
  if (note) return note;
  const campaign = typeof f["campaign"] === "string" ? (f["campaign"] as string) : null;
  const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
  const parts = [campaign, spend != null ? `${fmtUSD(spend)} affected` : null].filter(Boolean);
  return parts.join(" · ") || "Raised by the last analysis run.";
}

function SignalCards({ flags }: { flags: DataQualityFlag[] }) {
  const fold = useShowMore(flags, 4);
  if (flags.length === 0) return null;
  return (
    <SectionCard
      title="Signals"
      desc="Data-quality flags from the last analysis run"
      right={<SectionInfoIcon tip="Anomalies and quality flags the analysis raised against this window — tracking gaps, zero-conversion campaigns, coverage caveats. Investigate before treating affected reads as final." />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5" data-testid="signal-cards">
        {fold.visible.map((f, i) => {
          const isAnomaly = f.kind === "anomaly";
          const severity = isAnomaly ? "Investigate" : f.kind === "quality_flag" ? "Watch" : "Note";
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border px-3.5 py-3",
                isAnomaly ? "border-amber-400/30 bg-amber-400/[0.04]" : "border-border/40 bg-white/[0.015]",
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {isAnomaly
                  ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                  : <Eye className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                <span className={cn(TYPE.label, "font-mono uppercase tracking-widest", isAnomaly ? "text-amber-400/85" : "text-muted-foreground/60")}>
                  {severity}
                </span>
                <span className={cn(TYPE.caption, "font-semibold text-foreground/90 capitalize truncate")}>
                  {flagHeadline(f)}
                </span>
              </div>
              <p className={cn(TYPE.body, "text-foreground/70 leading-relaxed")}>{flagBody(f)}</p>
            </div>
          );
        })}
      </div>
      <ShowMoreButton
        total={flags.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun="signals"
      />
    </SectionCard>
  );
}

// ─── Concept tier table — the canvas's performance tier register ──────
// One row per concept_rollup entry: real spend / CPA / CVR / confidence,
// with the strategy map's scaling-playbook bucket as the tier tag. Rows
// the playbook doesn't name stay unclassified — never guessed.

const BUCKET_TAG_CLS: Record<string, string> = {
  scale_now: "border-primary/40 bg-primary/15 text-interactive",
  optimize: "border-border/40 bg-white/[0.04] text-foreground/75",
  validate: "border-border/40 bg-white/[0.04] text-muted-foreground/70",
  explore: "border-border/40 bg-white/[0.04] text-muted-foreground/70",
  avoid: "border-red-400/30 bg-red-400/10 text-red-300",
};

function ConceptTierTable({ rollup, playbook, resultNoun }: {
  rollup: ConceptRollupRow[];
  playbook: ScalingPlaybook | null;
  resultNoun: string;
}) {
  if (rollup.length === 0) return null;
  const rows = [...rollup].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
  return (
    <SectionCard
      title="Performance tiers"
      desc="Concept rollup · playbook classification"
      table="concept_rollup"
      right={<SectionInfoIcon tip="Each concept's measured rollup with the strategy map's scaling-playbook classification. Unclassified concepts are position-only in the local library — no playbook entry names them yet." />}
    >
      <div className="overflow-x-auto">
        <table className="nc-table" data-testid="concept-tier-table">
          <thead>
            <tr>
              <th>Concept</th>
              <th className="text-right">Spend</th>
              <th className="text-right">CPA</th>
              <th className="text-right">Link CVR</th>
              <th>Confidence</th>
              <th className="text-right">Tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bucket = bucketForConcept(r.book, r.concept, playbook);
              const zero = (r.results ?? 0) === 0;
              return (
                <tr key={`${r.book}:${r.concept}`} className={cn(zero && "opacity-50")}>
                  <td>
                    <span className="font-medium text-foreground/90">{r.book} · {r.concept}</span>
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground/75">{r.spend != null ? fmtUSD(r.spend, 0) : "n/a"}</td>
                  <td className="text-right tabular-nums text-foreground/80">{r.cpa != null ? fmtUSD(r.cpa) : zero ? `no ${resultNoun}` : "n/a"}</td>
                  <td className="text-right tabular-nums text-muted-foreground/75">{r.cvr_link_pct != null ? fmtPct(r.cvr_link_pct) : "n/a"}</td>
                  <td>{r.confidence ? <ConfidenceBadge value={r.confidence} /> : <span className={cn(TYPE.label, "text-muted-foreground/35")}>—</span>}</td>
                  <td className="text-right">
                    {bucket ? (
                      <span className={cn(TYPE.label, "inline-flex border rounded-full px-2 py-0.5 font-semibold normal-case", BUCKET_TAG_CLS[bucket])}>
                        {BUCKET_LABEL[bucket]}
                      </span>
                    ) : (
                      <span className={cn(TYPE.label, "text-muted-foreground/35")}>unclassified</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function AdPerformanceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const analysis = getAnalysisData(seed, adAccountId);
  const { range, narrowed, filterCells } = useCellRangeScope(analysis);

  // KPI tile drill-down modal (one shared modal for all tiles).
  const [drillMetricId, setDrillMetricId] = useState<string | null>(null);

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

        // Featured modules get a full card (icon, description, stat); the
        // rest collapse into a subordinate chip row — progressive disclosure
        // instead of five identical tiles.
        const featuredModules = [
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
            to: "/app/analysis/funnel",
            label: "Engagement Funnel",
            Icon: TrendingUp,
            desc: "Frequency, CTR all vs link, and the full conversion waterfall.",
            stat: `${fmtNum(summary.total_impressions)} impressions · ${fmtNum(summary.total_link_clicks)} link clicks`,
          },
        ];
        const secondaryModules = [
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
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Ad Performance"
              subtitle="What the account's performance data says, and where to drill in."
              table="campaign_summary, performance_by_cell"
            />
            <RangeScopeBar grainNote="Campaign totals cover the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="analysis data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {scoped ? (
                <KpiTileRow
                  viewKey="ad-performance:in-range"
                  onTileClick={setDrillMetricId}
                  catalog={buildMetricCatalog({
                    spend: scoped.spend,
                    impressions: null,
                    reach: null,
                    clicksAll: null,
                    linkClicks: scoped.linkClicks,
                    linkCtrPct: null,
                    resultEvents: [{ key: "in_range_results", label: "Results (in range)", results: scoped.results }],
                    isMultiEvent: false,
                  })}
                  tileCount={3}
                  disclosures={{
                    spend: <span>Range-scoped: {scoped.concepts} concept flight{scoped.concepts === 1 ? "" : "s"} overlapping the selected range — whole flights, no per-day interpolation.</span>,
                  }}
                />
              ) : (
                <KpiTileRow
                  viewKey="ad-performance"
                  catalog={buildMetricCatalog(metricSourceFromCampaignSummary(summary))}
                  onTileClick={setDrillMetricId}
                />
              )}
            </div>

            <KpiDrilldownModal
              open={drillMetricId != null}
              onClose={() => setDrillMetricId(null)}
              scope="account"
              metricId={drillMetricId}
              catalog={buildMetricCatalog(
                scoped
                  ? {
                      spend: scoped.spend,
                      impressions: null,
                      reach: null,
                      clicksAll: null,
                      linkClicks: scoped.linkClicks,
                      linkCtrPct: null,
                      resultEvents: [{ key: "in_range_results", label: "Results (in range)", results: scoped.results }],
                      isMultiEvent: false,
                    }
                  : metricSourceFromCampaignSummary(summary),
              )}
              analysis={a}
              scopedCellRows={filterCells(a.performance_by_cell)}
              scopeNarrowed={narrowed}
              windowLabel={narrowed && range ? `${range.start} → ${range.end} (range-scoped)` : "full flight window"}
            />

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

              <SignalCards flags={acct.iap?.data_quality ?? []} />

              {controls && (
                <SectionCard title="Core control reads" desc="Control creative · per funnel depth" table="core_reanalysis_read" right={<SectionInfoIcon tip="The winning concept at each funnel stage as determined by the most recent re-analysis run — the benchmark every new test is measured against." />}>
                  {/* Primary control dominates (accent card, 3/5 width);
                      the secondary control read sits subordinate beside it. */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {(() => {
                      const primaryName = resolveConceptName(controls.primary_control);
                      const primaryResolved = primaryName !== controls.primary_control;
                      return (
                        <div className="relative rounded-xl border border-primary/35 bg-primary/[0.03] p-4 md:col-span-3">
                          <div data-testid="primary-control-accent" className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />
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
                        <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4 md:col-span-2">
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

              <ConceptTierTable
                rollup={
                  narrowed && range
                    ? rollup.filter((r) => r.date_start && r.date_end && !(r.date_end < range.start || r.date_start > range.end))
                    : rollup
                }
                playbook={getStrategyData(seed, adAccountId)?.scaling_playbook ?? null}
                resultNoun={term.plural}
              />

              {/* Reference strip only — these 5 destinations are already reachable
                  via the Analysis section tab bar in ModuleHeader above; this is
                  a compact index (label + a live stat), not a second nav. Each
                  module's full description lives in the title attr, not as
                  always-visible first-layer prose. */}
              <SectionCard title="Analysis modules" desc="Same data · different slices" right={<SectionInfoIcon tip="Each module drills into a different dimension of the same import — Library (cell/variable performance), Audience, Placements, Budget, and Engagement Funnel." />}>
                {/* Progressive disclosure: the two data-heavy modules get full
                    cards; the remaining slices sit as a subordinate chip row. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {featuredModules.map((s) => (
                    <div
                      key={s.to}
                      data-testid={`featured-module-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-white/[0.02] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-4 h-4 text-interactive shrink-0" />
                        <span className={TYPE.title}>{s.label}</span>
                        <div className="ml-auto"><CrossLink to={s.to} label="Open" /></div>
                      </div>
                      <p className={cn(TYPE.caption, "text-muted-foreground/70")}>{s.desc}</p>
                      <span className={cn(TYPE.microLabel, "text-muted-foreground/50")}>{s.stat}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {secondaryModules.map((s) => (
                    <div
                      key={s.to}
                      title={s.desc}
                      className="flex items-center gap-2 rounded-lg border border-border/30 bg-white/[0.015] pl-3 pr-1.5 py-1.5"
                    >
                      <s.Icon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className={cn(TYPE.caption, "font-semibold text-foreground/90")}>{s.label}</span>
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
