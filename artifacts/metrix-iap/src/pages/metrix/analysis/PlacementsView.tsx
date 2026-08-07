// ─── Analysis · Placements ────────────────────────────────────────────
// Placement delivery signal across the account's analysis runs. Each
// placement gets a data-rich row (spend, results, CPA, CTR, CPM) that
// can be re-ranked by any KPI, plus paired spend-share vs result-share
// bars that make efficiency mismatches visible at a glance. Click a
// placement to open a detail dialog benchmarked against the account
// average with the full V3 + C4E rows.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CaveatNote, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  SkeletonTileRow, DatePresetBar, type ViewPreset,
} from "../shared";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SharePieChart } from "@/components/charts/SharePieChart";
import { LayoutGrid, ChevronRight, BarChart2, PieChart } from "lucide-react";
import type { ConversionTrackingSignal, PlacementRow } from "@/lib/data/seedTypes";
import { ConversionFunnelTable } from "./tables";
import { cn } from "@/lib/utils";
import { RankSortBar, KpiStat, sortByRankMetric, useRankMetric, type RankMetric } from "./rankSort";

const SECTION = "Analysis · 03";
const RANK_STORAGE_KEY = "metrix.placements.rank.v1";

// ─── Rollup ───────────────────────────────────────────────────────────

interface PlacementRollup {
  placement: string;
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  cpa: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
}

function rollupPlacements(rows: PlacementRow[]): PlacementRollup[] {
  const byPlacement = new Map<string, { spend: number; results: number; impressions: number; linkClicks: number }>();
  for (const r of rows) {
    const s = byPlacement.get(r.Placement) ?? { spend: 0, results: 0, impressions: 0, linkClicks: 0 };
    s.spend += r["Amount spent (USD)"];
    s.results += r.Results;
    s.impressions += r.Impressions;
    s.linkClicks += r["Link clicks"];
    byPlacement.set(r.Placement, s);
  }
  return [...byPlacement.entries()].map(([placement, s]) => ({
    placement,
    ...s,
    cpa: s.results > 0 ? s.spend / s.results : null,
    ctr: s.impressions > 0 ? (s.linkClicks / s.impressions) * 100 : null,
    cpm: s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null,
    cpc: s.linkClicks > 0 ? s.spend / s.linkClicks : null,
  }));
}

function buildRankMetrics(resultPlural: string): RankMetric<PlacementRollup>[] {
  return [
    { id: "spend", label: "Spend", direction: "desc", value: (p) => p.spend, format: (v) => fmtUSD(v, 0) },
    { id: "results", label: resultPlural, direction: "desc", value: (p) => (p.results > 0 ? p.results : null), format: (v) => fmtNum(v) },
    { id: "cpa", label: "CPA", direction: "asc", value: (p) => p.cpa, format: (v) => fmtUSD(v) },
    { id: "ctr", label: "Link CTR", direction: "desc", value: (p) => p.ctr, format: (v) => fmtPct(v) },
    { id: "cpm", label: "CPM", direction: "asc", value: (p) => p.cpm, format: (v) => fmtUSD(v) },
    { id: "cpc", label: "CPC", direction: "asc", value: (p) => p.cpc, format: (v) => fmtUSD(v) },
    { id: "impressions", label: "Impressions", direction: "desc", value: (p) => p.impressions, format: (v) => fmtNum(v) },
  ];
}

// ─── Placement detail dialog ──────────────────────────────────────────

interface PlacementDetailDialogProps {
  placement: string | null;
  v3Rows: PlacementRow[];
  c4eRows: PlacementRow[];
  /** Account-level rollup across all placements, for benchmarking. */
  accountRollup: PlacementRollup[];
  onClose: () => void;
}

function deltaLabel(value: number | null, benchmark: number | null, lowerIsBetter: boolean): { text: string; good: boolean } | null {
  if (value == null || benchmark == null || benchmark <= 0) return null;
  const pct = ((value - benchmark) / benchmark) * 100;
  if (!Number.isFinite(pct)) return null;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(0)}% vs account avg`, good };
}

function PlacementDetailDialog({ placement, v3Rows, c4eRows, accountRollup, onClose }: PlacementDetailDialogProps) {
  if (!placement) return null;
  const v3 = v3Rows.filter((r) => r.Placement === placement);
  const c4e = c4eRows.filter((r) => r.Placement === placement);
  const own = rollupPlacements([...v3, ...c4e])[0] ?? null;

  // Account-average benchmark across all placements.
  const accSpend = accountRollup.reduce((n, p) => n + p.spend, 0);
  const accResults = accountRollup.reduce((n, p) => n + p.results, 0);
  const accImpr = accountRollup.reduce((n, p) => n + p.impressions, 0);
  const accClicks = accountRollup.reduce((n, p) => n + p.linkClicks, 0);
  const accCpa = accResults > 0 ? accSpend / accResults : null;
  const accCtr = accImpr > 0 ? (accClicks / accImpr) * 100 : null;
  const accCpm = accImpr > 0 ? (accSpend / accImpr) * 1000 : null;

  const tiles: { label: string; value: string; delta: { text: string; good: boolean } | null }[] = own
    ? [
        { label: "Spend", value: fmtUSD(own.spend, 0), delta: null },
        { label: "Results", value: fmtNum(own.results), delta: null },
        { label: "Impressions", value: fmtNum(own.impressions), delta: null },
        { label: "Link clicks", value: fmtNum(own.linkClicks), delta: null },
        { label: "CPA", value: own.cpa != null ? fmtUSD(own.cpa) : "—", delta: deltaLabel(own.cpa, accCpa, true) },
        { label: "Link CTR", value: own.ctr != null ? fmtPct(own.ctr) : "—", delta: deltaLabel(own.ctr, accCtr, false) },
        { label: "CPM", value: own.cpm != null ? fmtUSD(own.cpm) : "—", delta: deltaLabel(own.cpm, accCpm, true) },
        { label: "CPC", value: own.cpc != null ? fmtUSD(own.cpc) : "—", delta: null },
      ]
    : [];

  function PlacementRowGroup({ rows, label }: { rows: PlacementRow[]; label: string }) {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">{label}</p>
        <div className="rounded-lg border border-border/40 overflow-hidden">
          {[...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0 bg-white/[0.01]">
              <div className="min-w-0">
                <div className="text-caption font-medium text-foreground truncate">{r.Placement}</div>
                <div className="text-label font-mono text-muted-foreground/50 mt-0.5">
                  {fmtNum(r.Impressions)} impr · {fmtNum(r["Link clicks"] ?? 0)} clicks
                  {r.CPA != null && ` · CPA ${fmtUSD(r.CPA)}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-caption font-semibold text-foreground tabular-nums">{fmtUSD(r["Amount spent (USD)"], 0)}</div>
                <div className="text-label text-muted-foreground/60">{fmtNum(r.Results)} results</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={placement != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-surface-deep border-border/50 max-h-[82vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1">
          <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
            Placement detail
          </div>
          <DialogTitle className="text-callout font-semibold text-foreground">{placement}</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground/70 leading-relaxed">
            {v3.length > 0 && `${v3.length} V3 row${v3.length !== 1 ? "s" : ""}`}
            {v3.length > 0 && c4e.length > 0 && " · "}
            {c4e.length > 0 && `${c4e.length} C4E row${c4e.length !== 1 ? "s" : ""}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top-line with account-average benchmarks */}
          <div className="grid grid-cols-dashboard-4-sm gap-2">
            {tiles.map(({ label, value, delta }) => (
              <div key={label} className="mx-kpi-tile px-3 py-2.5">
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-0.5">{label}</div>
                <div className="text-stat metric-num leading-none">{value}</div>
                {delta && (
                  <div className={cn("text-label mt-1 leading-none", delta.good ? "text-accent" : "text-amber-300/80")}>
                    {delta.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          <PlacementRowGroup rows={v3} label="V3 signal rows" />
          <PlacementRowGroup rows={c4e} label="C4E signal rows" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Conversion sections (unchanged) ──────────────────────────────────

function ConversionTrackingSections({ cts }: { cts: ConversionTrackingSignal }) {
  const windowLabel =
    cts.window_start && cts.window_end ? `Export window ${cts.window_start} → ${cts.window_end}.` : undefined;
  return (
    <>
      <CaveatNote text={cts.note} />
      {cts.placements.length > 0 && (
        <SectionCard
          title="Conversion-attributed placements"
          desc={`Funnel actions attributed to the converting placement. ${windowLabel ?? ""}`.trim()}
        >
          <CaveatNote text="Conversion-attributed rows — delivery spend not applicable for this tracking basis." />
          <ConversionFunnelTable rows={cts.placements.map((r) => ({ ...r, label: r.placement }))} labelHeader="Placement" />
        </SectionCard>
      )}
      {cts.platforms.length > 0 && (
        <SectionCard
          title="Conversion-attributed platforms"
          desc="Funnel actions · by converting platform"
        >
          <CaveatNote text="Conversion-attributed rows — delivery spend not applicable for this tracking basis." />
          <ConversionFunnelTable rows={cts.platforms.map((r) => ({ ...r, label: r.platform }))} labelHeader="Platform" />
        </SectionCard>
      )}
      {cts.devices.length > 0 && (
        <SectionCard
          title="Conversion-attributed devices"
          desc="Funnel actions · by converting device"
        >
          <CaveatNote text="Conversion-attributed rows — delivery spend not applicable for this tracking basis." />
          <ConversionFunnelTable rows={cts.devices.map((r) => ({ ...r, label: r.device }))} labelHeader="Device" />
        </SectionCard>
      )}
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

/** Build PlacementRollup[] directly from the preset API rows (already aggregated). */
function rollupFromApiRows(rows: { placement: string; spend: number; impressions: number; link_clicks: number; results: number }[]): PlacementRollup[] {
  return rows.map((r) => ({
    placement: r.placement,
    spend: r.spend,
    results: r.results,
    impressions: r.impressions,
    linkClicks: r.link_clicks,
    cpa: r.results > 0 ? r.spend / r.results : null,
    ctr: r.impressions > 0 ? (r.link_clicks / r.impressions) * 100 : null,
    cpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : null,
    cpc: r.link_clicks > 0 ? r.spend / r.link_clicks : null,
  }));
}

export function PlacementsView() {
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);
  const [preset, setPreset] = useState<ViewPreset>("all");
  const [showShareChart, setShowShareChart] = useState(false);

  const { data: presetData, isFetching: presetFetching } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", preset),
    enabled: preset !== "all" && !!adAccountId,
  });

  const rollup = useMemo(
    () => {
      if (preset !== "all" && presetData) return rollupFromApiRows(presetData.placement_rows);
      return rollupPlacements([
        ...(analysis?.v3_placement_signal ?? []),
        ...(analysis?.c4e_placement_signal ?? []),
      ]);
    },
    [preset, presetData, analysis]
  );

  const term = account ? resultTerm(account) : { singular: "result", plural: "results", Plural: "Results" };
  const rankMetrics = useMemo(() => buildRankMetrics(term.Plural), [term.Plural]);
  const { activeId, select } = useRankMetric(
    RANK_STORAGE_KEY,
    rankMetrics.map((m) => m.id),
    "spend"
  );
  const activeMetric = rankMetrics.find((m) => m.id === activeId) ?? rankMetrics[0];
  const ranked = useMemo(() => sortByRankMetric(rollup, activeMetric), [rollup, activeMetric]);

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Placements" account={account}>
        {() => {
          const acct = account!;
          const v3 = analysis?.v3_placement_signal ?? [];
          const c4e = analysis?.c4e_placement_signal ?? [];
          const cts = analysis?.conversion_tracking_signal ?? null;
          const hasDelivery = v3.length > 0 || c4e.length > 0;
          const hasConversion =
            !!cts && cts.placements.length + cts.platforms.length + cts.devices.length > 0;

          if (!hasDelivery && !hasConversion) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Placements" tabs="analysis" account={acct} />
                <PendingState
                  title="No placement signal"
                  message="Placement reads appear once delivery data exists for this account."
                  icon={LayoutGrid}
                  action={<CrossLink to="/app/analysis/overview" label="Return to Analysis Overview" />}
                />
              </div>
            );
          }

          // ── Conversion-only account ──────────────────────────────────
          if (!hasDelivery && cts) {
            const pls = cts.placements;
            const totalClicks = pls.reduce((n, r) => n + (r.link_clicks ?? 0), 0);
            const totalPurchases = pls.reduce((n, r) => n + (r.purchases ?? 0), 0);
            const top = [...pls].sort(
              (a, b) => (b.purchases ?? 0) - (a.purchases ?? 0) || (b.link_clicks ?? 0) - (a.link_clicks ?? 0),
            )[0];
            return (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                <ModuleHeader
                  section={SECTION}
                  title="Placements"
                  subtitle="Conversion-attributed placement signal · no delivery-based runs yet"
                  tabs="analysis"
                  account={acct}
                />
                  <>
                    {isRefetching ? (
                      <div className="px-6 pt-5">
                        <SkeletonTileRow count={4} />
                      </div>
                    ) : (
                      <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                        <MetricTile label="Placements" value={fmtNum(pls.length)} />
                        <MetricTile label="Link clicks" value={fmtNum(totalClicks)} />
                        <MetricTile label="Purchases" value={fmtNum(totalPurchases)} />
                        <MetricTile
                          label="Top placement"
                          value={top?.placement ?? "—"}
                          sub={top ? `${fmtNum(top.purchases ?? 0)} purchases · ${fmtNum(top.link_clicks ?? 0)} link clicks` : undefined}
                        />
                      </div>
                    )}
                    <div className="px-6 py-5 space-y-4 max-w-5xl">
                      <ConversionTrackingSections cts={cts} />
                    </div>
                  </>
              </div>
            );
          }

          // ── Delivery-based (V3 / C4E) ────────────────────────────────
          const totalSpend = rollup.reduce((n, s) => n + s.spend, 0);
          const totalResults = rollup.reduce((n, s) => n + s.results, 0);
          const best = ranked[0];

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Placements"
                subtitle="Delivery by placement · re-rank by KPI · click for breakdown"
                tabs="analysis"
                account={acct}
              />
              <>
              <DatePresetBar
                value={preset}
                onChange={setPreset}
                availableWindow={presetData?.available_window}
                isFetching={presetFetching}
              />
              {(isRefetching || (preset !== "all" && presetFetching)) ? (
                <div className="px-6 pt-5">
                  <SkeletonTileRow count={4} />
                </div>
              ) : (
                <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                  <MetricTile label="Placements" value={fmtNum(rollup.length)} />
                  <MetricTile label="Placement spend" value={fmtUSD(totalSpend, 0)} />
                  <MetricTile label={term.Plural} value={fmtNum(totalResults)} />
                  <MetricTile
                    label={`Best · ${activeMetric.label}`}
                    value={best?.placement ?? "—"}
                    sub={
                      best && activeMetric.value(best) != null
                        ? `${activeMetric.format(activeMetric.value(best)!)} ${activeMetric.label.toLowerCase()}`
                        : undefined
                    }
                  />
                </div>
              )}

              <div className="px-6 py-5 space-y-4 max-w-5xl">
                <SectionCard
                  title="Spend by placement"
                  desc="V3 + C4E combined · spend vs result share · click for breakdown"
                  right={
                    <div className="flex items-center gap-2">
                      {rollup.length > 1 && (
                        <button
                          onClick={() => setShowShareChart((v) => !v)}
                          className={cn(
                            "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-label font-medium transition-colors border",
                            showShareChart
                              ? "border-primary/30 bg-primary/10 text-interactive"
                              : "border-border/30 bg-white/[0.02] text-muted-foreground/55 hover:text-foreground/80"
                          )}
                          aria-pressed={showShareChart}
                          title="Toggle spend share chart"
                        >
                          <PieChart className="w-3 h-3" />
                          Share
                        </button>
                      )}
                      <RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={select} />
                    </div>
                  }
                >
                  {/* Spend share pie — disclosed on demand */}
                  {showShareChart && rollup.length > 1 && (
                    <div className="mb-4 pb-4 border-b border-border/20">
                      <SharePieChart
                        data={rollup.map((s) => ({ name: s.placement, value: s.spend }))}
                        unit="usd"
                        height={180}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {ranked.map((s, idx) => {
                      const spendShare = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0;
                      const resultShare = totalResults > 0 ? (s.results / totalResults) * 100 : 0;
                      const efficiency =
                        spendShare > 0 && totalResults > 0 ? resultShare / spendShare : null;
                      return (
                        <button
                          key={s.placement}
                          onClick={() => setSelectedPlacement(s.placement)}
                          data-testid={`row-placement-${s.placement}`}
                          className={cn(
                            "w-full text-left rounded-lg px-3 py-2.5 border border-border/30 bg-white/[0.01]",
                            "hover:border-primary/25 hover:bg-primary/[0.03] active:scale-[0.995]",
                            "transition-all duration-100 group"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-5 shrink-0 text-label font-mono text-muted-foreground/40 tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 w-44 shrink-0">
                              <div className="text-body font-medium text-foreground/90 truncate">{s.placement}</div>
                              {efficiency != null && (
                                <div
                                  className={cn(
                                    "text-label font-mono mt-0.5",
                                    efficiency >= 1 ? "text-emerald-300/70" : "text-muted-foreground/40"
                                  )}
                                  title="Share of results ÷ share of spend"
                                >
                                  {efficiency.toFixed(1)}× efficiency
                                </div>
                              )}
                            </div>
                            <div className="flex-1 grid grid-cols-dashboard-5-kpi gap-x-3 gap-y-1 min-w-0">
                              <KpiStat label="Spend" value={fmtUSD(s.spend, 0)} highlight={activeMetric.id === "spend"} />
                              <KpiStat label={term.Plural} value={fmtNum(s.results)} highlight={activeMetric.id === "results"} />
                              <KpiStat label="CPA" value={s.cpa != null ? fmtUSD(s.cpa) : "—"} highlight={activeMetric.id === "cpa"} />
                              <KpiStat label="CTR" value={s.ctr != null ? fmtPct(s.ctr) : "—"} highlight={activeMetric.id === "ctr"} />
                              <KpiStat label="CPM" value={s.cpm != null ? fmtUSD(s.cpm) : "—"} highlight={activeMetric.id === "cpm"} />
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                          </div>
                          {/* Compact dual-bar — spend blue, results green */}
                          <div className="mt-2 ml-8 space-y-0.5">
                            <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                              <div className="h-full bg-primary/45 rounded-full" style={{ width: `${Math.max(spendShare, s.spend > 0 ? 2 : 0)}%` }} />
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                              <div className="h-full bg-emerald-400/55 rounded-full" style={{ width: `${Math.max(resultShare, s.results > 0 ? 2 : 0)}%` }} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-label text-muted-foreground/45 flex items-center gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5 shrink-0" />
                    {v3.length} V3 + {c4e.length} C4E rows · blue bar = spend share · green = result share · click for detail
                  </p>
                </SectionCard>

                {hasConversion && cts && <ConversionTrackingSections cts={cts} />}
              </div>
              </>
            </div>
          );
        }}
      </ModuleScopeGate>

      <PlacementDetailDialog
        placement={selectedPlacement}
        v3Rows={analysis?.v3_placement_signal ?? []}
        c4eRows={analysis?.c4e_placement_signal ?? []}
        accountRollup={rollup}
        onClose={() => setSelectedPlacement(null)}
      />
    </>
  );
}
