// ─── Analysis · Placements ────────────────────────────────────────────
// Placement delivery signal across the account's analysis runs, with
// per-placement rollups. Click a placement bar to open a detail dialog
// showing the full V3 + C4E rows for that placement.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CaveatNote, fmtUSD, fmtNum, resultTerm,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LayoutGrid, ChevronRight, BarChart2 } from "lucide-react";
import type { ConversionTrackingSignal, PlacementRow } from "@/lib/data/seedTypes";
import { ConversionFunnelTable } from "./tables";
import { cn } from "@/lib/utils";

const SECTION = "Analysis · 03";

// ─── Placement detail dialog ──────────────────────────────────────────

interface PlacementDetailDialogProps {
  placement: string | null;
  v3Rows: PlacementRow[];
  c4eRows: PlacementRow[];
  onClose: () => void;
}

function PlacementDetailDialog({ placement, v3Rows, c4eRows, onClose }: PlacementDetailDialogProps) {
  if (!placement) return null;
  const v3 = v3Rows.filter((r) => r.Placement === placement);
  const c4e = c4eRows.filter((r) => r.Placement === placement);
  const allRows = [...v3, ...c4e];
  const totalSpend = allRows.reduce((n, r) => n + r["Amount spent (USD)"], 0);
  const totalResults = allRows.reduce((n, r) => n + r.Results, 0);
  const totalImpressions = allRows.reduce((n, r) => n + r.Impressions, 0);
  const cpa = totalResults > 0 ? totalSpend / totalResults : null;

  function PlacementRowGroup({ rows, label }: { rows: PlacementRow[]; label: string }) {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</p>
        <div className="rounded-lg border border-border/40 overflow-hidden">
          {rows.sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0 bg-white/[0.01]">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-foreground truncate">{r.Placement}</div>
                <div className="text-[9px] font-mono text-muted-foreground/50 mt-0.5">
                  {fmtNum(r.Impressions)} impr · {fmtNum(r["Link clicks"] ?? 0)} clicks
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] font-semibold text-foreground tabular-nums">{fmtUSD(r["Amount spent (USD)"], 0)}</div>
                <div className="text-[9px] text-muted-foreground/60">{fmtNum(r.Results)} results</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={placement != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-[hsl(222_61%_6%)] border-border/50 max-h-[82vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1">
          <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
            Placement detail
          </div>
          <DialogTitle className="text-[15px] font-semibold text-foreground">{placement}</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground/70 leading-relaxed">
            {v3.length > 0 && `${v3.length} V3 row${v3.length !== 1 ? "s" : ""}`}
            {v3.length > 0 && c4e.length > 0 && " · "}
            {c4e.length > 0 && `${c4e.length} C4E row${c4e.length !== 1 ? "s" : ""}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top-line */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Spend", value: fmtUSD(totalSpend, 0) },
              { label: "Results", value: fmtNum(totalResults) },
              { label: "Impressions", value: fmtNum(totalImpressions) },
              { label: "CPA", value: cpa != null ? fmtUSD(cpa) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2.5">
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-0.5">{label}</div>
                <div className="text-[18px] font-bold text-foreground tabular-nums leading-none">{value}</div>
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

// ─── Conversion sections (unchanged from original) ────────────────────

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
          table="placement_performance (tracking_basis=conversion)"
        >
          <ConversionFunnelTable rows={cts.placements.map((r) => ({ ...r, label: r.placement }))} labelHeader="Placement" />
        </SectionCard>
      )}
      {cts.platforms.length > 0 && (
        <SectionCard
          title="Conversion-attributed platforms"
          desc="Funnel actions attributed to the converting platform."
          table="platform_performance (tracking_basis=conversion)"
        >
          <ConversionFunnelTable rows={cts.platforms.map((r) => ({ ...r, label: r.platform }))} labelHeader="Platform" />
        </SectionCard>
      )}
      {cts.devices.length > 0 && (
        <SectionCard
          title="Conversion-attributed devices"
          desc="Funnel actions attributed to the converting device."
          table="device_performance (tracking_basis=conversion)"
        >
          <ConversionFunnelTable rows={cts.devices.map((r) => ({ ...r, label: r.device }))} labelHeader="Device" />
        </SectionCard>
      )}
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function PlacementsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const { rangeHasData } = useDateRange();

  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);

  const rollup = useMemo(() => {
    const all = [...(analysis?.v3_placement_signal ?? []), ...(analysis?.c4e_placement_signal ?? [])];
    const byPlacement = new Map<string, { placement: string; spend: number; results: number; impressions: number }>();
    for (const r of all) {
      const s = byPlacement.get(r.Placement) ?? { placement: r.Placement, spend: 0, results: 0, impressions: 0 };
      s.spend += r["Amount spent (USD)"];
      s.results += r.Results;
      s.impressions += r.Impressions;
      byPlacement.set(r.Placement, s);
    }
    return [...byPlacement.values()].sort((a, b) => b.spend - a.spend);
  }, [analysis]);

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Placements" account={account}>
        {() => {
          const acct = account!;
          const term = resultTerm(acct);
          const v3 = analysis?.v3_placement_signal ?? [];
          const c4e = analysis?.c4e_placement_signal ?? [];
          const cts = analysis?.conversion_tracking_signal ?? null;
          const hasDelivery = v3.length > 0 || c4e.length > 0;
          const hasConversion =
            !!cts && cts.placements.length + cts.platforms.length + cts.devices.length > 0;

          if (!hasDelivery && !hasConversion) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Placements" />
                <ScopeBanner account={acct} />
                <PendingState title="No placement signal" message="Placement reads appear once delivery data exists for this account." icon={LayoutGrid} />
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
                  subtitle="Conversion-attributed placement signal for this account. Delivery-based placement runs have not been produced yet."
                  table="placement_performance, platform_performance, device_performance"
                />
                <ScopeBanner account={acct} />
                <RangeScopeBar grainNote="Conversion signal aggregates the export's full window — this import has no daily grain." />
                {!rangeHasData ? (
                  <NoDataInRangeState what="placement data" />
                ) : (
                  <>
                    <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MetricTile label="Placements" value={fmtNum(pls.length)} />
                      <MetricTile label="Link clicks" value={fmtNum(totalClicks)} />
                      <MetricTile label="Purchases" value={fmtNum(totalPurchases)} />
                      <MetricTile
                        label="Top placement"
                        value={top?.placement ?? "—"}
                        sub={top ? `${fmtNum(top.purchases ?? 0)} purchases · ${fmtNum(top.link_clicks ?? 0)} link clicks` : undefined}
                      />
                    </div>
                    <div className="px-6 py-5 space-y-4 max-w-5xl">
                      <ConversionTrackingSections cts={cts} />
                    </div>
                  </>
                )}
              </div>
            );
          }

          // ── Delivery-based (V3 / C4E) ────────────────────────────────
          const totalSpend = rollup.reduce((n, s) => n + s.spend, 0);
          const totalResults = rollup.reduce((n, s) => n + s.results, 0);
          const top = rollup[0];
          const maxSpend = Math.max(...rollup.map((s) => s.spend), 1);

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Placements"
                subtitle="Where delivery happened and what each placement produced. Click a bar to inspect V3 + C4E rows."
                table="v3_placement_signal, c4e_placement_signal"
              />
              <ScopeBanner account={acct} />
              <RangeScopeBar grainNote="Placement signal aggregates each run's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="placement data" />
              ) : (
              <>
              <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricTile label="Placements" value={fmtNum(rollup.length)} />
                <MetricTile label="Placement spend" value={fmtUSD(totalSpend, 0)} />
                <MetricTile label="Results" value={fmtNum(totalResults)} />
                <MetricTile label="Top placement" value={top?.placement ?? "—"} sub={top ? `${fmtUSD(top.spend, 0)} spend` : undefined} />
              </div>

              <div className="px-6 py-5 space-y-4 max-w-5xl">
                <SectionCard
                  title="Spend by placement"
                  desc="Combined across the V3 and C4E signals. Click any row to inspect the underlying data."
                >
                  <div className="space-y-1.5">
                    {rollup.map((s) => (
                      <button
                        key={s.placement}
                        onClick={() => setSelectedPlacement(s.placement)}
                        className={cn(
                          "w-full text-left rounded-lg px-3 py-2.5 border border-border/30 bg-white/[0.01]",
                          "hover:border-primary/25 hover:bg-primary/[0.03] active:scale-[0.995]",
                          "transition-all duration-100 group"
                        )}
                      >
                        <div className="flex items-center justify-between text-[12px] mb-1.5 gap-3">
                          <span className="text-foreground/90 font-medium">{s.placement}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground/70 tabular-nums text-[11px]">
                              {fmtUSD(s.spend, 0)} · {fmtNum(s.results)} results · {fmtNum(s.impressions)} impr
                            </span>
                            <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div
                            className="h-full bg-primary/50 rounded-full group-hover:bg-primary/70 transition-colors"
                            style={{ width: `${Math.max((s.spend / maxSpend) * 100, 3)}%` }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <BarChart2 className="w-3 h-3" />
                    {v3.length} V3 rows + {c4e.length} C4E rows · click any bar for the full breakdown
                  </p>
                </SectionCard>

                {hasConversion && cts && <ConversionTrackingSections cts={cts} />}
              </div>
              </>
              )}
            </div>
          );
        }}
      </ModuleScopeGate>

      <PlacementDetailDialog
        placement={selectedPlacement}
        v3Rows={analysis?.v3_placement_signal ?? []}
        c4eRows={analysis?.c4e_placement_signal ?? []}
        onClose={() => setSelectedPlacement(null)}
      />
    </>
  );
}
