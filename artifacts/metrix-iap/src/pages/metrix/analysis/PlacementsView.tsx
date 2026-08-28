// ─── Analysis · Placements ────────────────────────────────────────────
// The canvas's analysis.placement composition: a placement breakdown of
// horizontal bars scaled to the top placement on the active KPI (fill
// graded against the account blend for cost metrics), plus the device
// delivery grid shaded against the account average. Click a placement
// to open a detail dialog benchmarked against the account average with
// the full V3 + C4E rows.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CaveatNote, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  SkeletonTileRow, DatePresetBar, type ViewPreset, SectionInfoIcon,
} from "../shared";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import { LayoutGrid, ChevronRight, BarChart2 } from "lucide-react";
import type { ConversionTrackingSignal, DeviceDeliveryRow, PlacementRow } from "@/lib/data/seedTypes";
import { rollupPlacements, type PlacementRollup } from "@/lib/placement-rollup";
import { ConversionFunnelTable } from "./tables";
import { cn } from "@workspace/command-deck/lib/utils";
import { RankSortBar, sortByRankMetric, useRankMetric, type RankMetric } from "./rankSort";
import { TYPE, DIALOG } from "../typography";

const SECTION = "Analysis · 03";
const RANK_STORAGE_KEY = "metrix.placements.rank.v1";

// ─── Rollup ───────────────────────────────────────────────────────────

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

// ─── Device delivery grid — the canvas's shaded device matrix ─────────
// Aggregates the real device_delivery_signal (delivery-based spend /
// impressions / results per device) and shades each row's cells by how
// its cost-per-result compares to the account blend — stronger accent =
// cheaper than blend. Rendered only when at least one row carries real
// numbers; the seed's per-device data covers the full flight window
// (no per-day grain), so preset narrowing does not apply here. Collapsed
// by default (canvas's dMatrix.open disclosure) — click the card to open.

interface DeviceRollup {
  device: string;
  spend: number;
  impressions: number;
  results: number;
  cpa: number | null;
}

function rollupDevices(rows: DeviceDeliveryRow[]): DeviceRollup[] {
  const byDevice = new Map<string, { spend: number; impressions: number; results: number }>();
  for (const r of rows) {
    if (r.spend == null && r.impressions == null && r.results == null) continue;
    const s = byDevice.get(r.device) ?? { spend: 0, impressions: 0, results: 0 };
    s.spend += r.spend ?? 0;
    s.impressions += r.impressions ?? 0;
    s.results += r.results ?? 0;
    byDevice.set(r.device, s);
  }
  return [...byDevice.entries()]
    .map(([device, s]) => ({ device, ...s, cpa: s.results > 0 ? s.spend / s.results : null }))
    .sort((a, b) => b.spend - a.spend);
}

function deviceLabel(device: string): string {
  const s = device.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function DeviceDeliveryCard({ rows }: { rows: DeviceDeliveryRow[] }) {
  const devices = useMemo(() => rollupDevices(rows), [rows]);
  if (devices.length === 0) return null;
  const totSpend = devices.reduce((n, d) => n + d.spend, 0);
  const totResults = devices.reduce((n, d) => n + d.results, 0);
  const blendCpa = totResults > 0 ? totSpend / totResults : null;

  // Canvas shading: strength grows as the device gets cheaper than the
  // account blend; devices with no conversions stay unshaded.
  const strengthFor = (d: DeviceRollup) => {
    if (blendCpa == null || d.cpa == null || d.cpa <= 0) return 0;
    const ratio = blendCpa / d.cpa;
    return Math.min(1, Math.max(0, (ratio - 0.6) / 0.7));
  };

  return (
    <SectionCard
      title="Device delivery"
      desc="Full window · shaded vs account blend"
      table="device_delivery_signal"
      defaultOpen={false}
      right={<SectionInfoIcon tip="Real delivery spend, results, and cost per result by device across the full flight window. Stronger shading marks devices converting cheaper than the account blend." />}
    >
      <div className="overflow-x-auto">
        <div className="grid gap-1 min-w-[620px]" style={{ gridTemplateColumns: "150px repeat(4, minmax(78px, 1fr))" }} data-testid="device-delivery-grid">
          <span />
          {["Cost / result", "Spend", "Results", "Impressions"].map((c) => (
            <span key={c} className={cn(TYPE.label, "text-muted-foreground/75 text-center pb-1")}>{c}</span>
          ))}
          {devices.map((d) => {
            const strength = strengthFor(d);
            const cellStyle = {
              background: `hsl(var(--primary) / ${(0.04 + strength * 0.22).toFixed(3)})`,
            };
            const cellCls = cn(
              "rounded-md border px-2 py-2.5 text-center tabular-nums",
              TYPE.body,
              strength > 0.7 ? "border-primary/50" : "border-border/30",
              strength > 0.5 ? "text-interactive font-medium" : "text-foreground/85",
            );
            return [
              <span key={`${d.device}-label`} className={cn(TYPE.body, "flex items-center text-foreground/85")} data-testid={`device-row-${d.device}`}>
                {deviceLabel(d.device)}
              </span>,
              <span key={`${d.device}-cpa`} className={cellCls} style={cellStyle} title={blendCpa != null && d.cpa != null ? `${((d.cpa / blendCpa - 1) * 100).toFixed(0)}% vs account blend` : undefined}>
                {d.cpa != null ? fmtUSD(d.cpa) : "—"}
              </span>,
              <span key={`${d.device}-spend`} className={cellCls} style={cellStyle}>{fmtUSD(d.spend, 0)}</span>,
              <span key={`${d.device}-results`} className={cellCls} style={cellStyle}>{fmtNum(d.results)}</span>,
              <span key={`${d.device}-impressions`} className={cellCls} style={cellStyle}>{fmtNum(d.impressions)}</span>,
            ];
          })}
        </div>
      </div>
    </SectionCard>
  );
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
        <p className="text-label uppercase tracking-widest text-muted-foreground/75">{label}</p>
        <div className="rounded-lg border border-border/40 overflow-hidden">
          {[...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0 bg-foreground/[0.01]">
              <div className="min-w-0">
                <div className="text-caption font-medium text-foreground truncate">{r.Placement}</div>
                <div className="text-label text-muted-foreground/75 mt-0.5">
                  {fmtNum(r.Impressions)} impr · {fmtNum(r["Link clicks"] ?? 0)} clicks
                  {r.CPA != null && ` · CPA ${fmtUSD(r.CPA)}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-caption font-semibold text-foreground tabular-nums">{fmtUSD(r["Amount spent (USD)"], 0)}</div>
                <div className="text-label text-muted-foreground/75">{fmtNum(r.Results)} results</div>
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
          <div className="text-label text-muted-foreground/75 uppercase tracking-widest">
            Placement detail
          </div>
          <DialogTitle className={DIALOG.title}>{placement}</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground/75 leading-relaxed">
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
                <div className="text-micro uppercase tracking-widest text-muted-foreground/75 mb-0.5">{label}</div>
                <div className="text-stat metric-num leading-none">{value}</div>
                {delta && (
                  <div className={cn("text-label mt-1 leading-none", delta.good ? "text-accent" : "text-status-warning/80")}>
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
          right={<SectionInfoIcon tip="Shows funnel actions (clicks, add-to-carts, purchases) attributed to each placement by the conversion tracking export." />}
        >
          <CaveatNote text="Conversion-attributed rows — delivery spend not applicable for this tracking basis." />
          <ConversionFunnelTable rows={cts.placements.map((r) => ({ ...r, label: r.placement }))} labelHeader="Placement" />
        </SectionCard>
      )}
      {cts.platforms.length > 0 && (
        <SectionCard
          title="Conversion-attributed platforms"
          desc="Funnel actions · by converting platform"
          right={<SectionInfoIcon tip="Breaks down conversion-tracked funnel actions by the platform where the conversion was recorded." />}
        >
          <CaveatNote text="Conversion-attributed rows — delivery spend not applicable for this tracking basis." />
          <ConversionFunnelTable rows={cts.platforms.map((r) => ({ ...r, label: r.platform }))} labelHeader="Platform" />
        </SectionCard>
      )}
      {cts.devices.length > 0 && (
        <SectionCard
          title="Conversion-attributed devices"
          desc="Funnel actions · by converting device"
          right={<SectionInfoIcon tip="Shows which device types are completing conversions so you can align creative formats to the highest-converting device." />}
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
                <ModuleHeader section={SECTION} title="Placements" accountName={acct.name} tabs="analysis" />
                <PendingState
                  title="No placement signal"
                  message="Placement reads appear once delivery data exists for this account."
                  icon={LayoutGrid}
                  action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
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
                  accountName={acct.name}
                  subtitle="Conversion-attributed placement signal · no delivery-based runs yet"
                  tabs="analysis"
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
                          variant="primary"
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
          const totalImpr = rollup.reduce((n, s) => n + s.impressions, 0);
          const totalClicks = rollup.reduce((n, s) => n + s.linkClicks, 0);
          const best = ranked[0];

          // Canvas bar grading: bars scale to the top placement on the
          // active KPI; cost-metric fills grade against the account blend
          // (accent = at-or-under blend, faded = under 2×, neutral above).
          const lowerIsBetter = activeMetric.direction === "asc";
          const blend =
            activeMetric.id === "cpa" ? (totalResults > 0 ? totalSpend / totalResults : null)
            : activeMetric.id === "cpm" ? (totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : null)
            : activeMetric.id === "cpc" ? (totalClicks > 0 ? totalSpend / totalClicks : null)
            : null;
          const metricValues = ranked.map((s) => activeMetric.value(s)).filter((v): v is number => v != null);
          const maxMetric = metricValues.length > 0 ? Math.max(...metricValues) : null;
          const barFill = (v: number) => {
            if (!lowerIsBetter) return "bg-primary/70";
            if (blend == null) return "bg-primary/70";
            if (v <= blend) return "bg-primary/80";
            if (v <= 2 * blend) return "bg-primary/40";
            return "bg-foreground/[0.12]";
          };

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Placements"
                accountName={acct.name}
                subtitle="Delivery by placement · re-rank by KPI · click for breakdown"
                tabs="analysis"
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
                    variant="primary"
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
                  title="Placement breakdown"
                  desc={`Ranked by ${activeMetric.label} · V3 + C4E combined`}
                  right={
                    <div className="flex items-center gap-2">
                      <SectionInfoIcon tip="Each placement's bar is scaled to the top placement on the active KPI. Cost-metric fills grade against the account blend — accent means at or under blend. Click a placement for the full breakdown." />
                      <RankSortBar metrics={rankMetrics} activeId={activeMetric.id} onSelect={select} />
                    </div>
                  }
                >
                  <div className="flex flex-col gap-3.5">
                    {ranked.map((s) => {
                      const v = activeMetric.value(s);
                      const spendShare = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0;
                      const width = v != null && maxMetric != null && maxMetric > 0 ? (v / maxMetric) * 100 : 0;
                      return (
                        <button
                          key={s.placement}
                          onClick={() => setSelectedPlacement(s.placement)}
                          data-testid={`row-placement-${s.placement}`}
                          className="pressable-lg w-full text-left grid grid-cols-[minmax(120px,170px)_1fr_minmax(80px,110px)] items-center gap-3.5 group"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className={cn(TYPE.body, "font-medium text-foreground/90 truncate group-hover:text-interactive transition-colors")}>
                              {s.placement}
                            </span>
                            <span className={cn(TYPE.label, "text-muted-foreground/75 tabular-nums")}>
                              {spendShare.toFixed(1)}% of spend
                            </span>
                          </div>
                          <div className="h-3 rounded bg-foreground/[0.04] overflow-hidden">
                            {v != null && (
                              <div
                                className={cn("h-full rounded transition-[color,background-color,border-color,box-shadow,opacity,transform]", barFill(v))}
                                style={{ width: `${Math.max(width, 1.5)}%` }}
                              />
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={cn(TYPE.body, "font-medium tabular-nums text-foreground")}>
                              {v != null ? activeMetric.format(v) : "—"}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/75 group-hover:text-primary/60 transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-label text-muted-foreground/75 flex items-center gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5 shrink-0" />
                    {v3.length} V3 + {c4e.length} C4E rows · bars scale to the top placement · click for detail
                  </p>
                </SectionCard>

                <DeviceDeliveryCard rows={analysis?.device_delivery_signal ?? []} />

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
