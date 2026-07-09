// ─── Analysis · Placements ────────────────────────────────────────────
// Placement delivery signal across the account's analysis runs, with
// per-placement rollups. Run copy derives from the account's result event.
// Accounts whose import carried a conversion-device export also surface
// the conversion-attributed placement/platform/device funnel here — a
// separate tracking basis with no spend/CPA by design, never mixed with
// delivery rows.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CaveatNote, fmtUSD, fmtNum, resultTerm,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { PlacementTable, ConversionFunnelTable } from "./tables";
import { LayoutGrid } from "lucide-react";
import type { ConversionTrackingSignal } from "@/lib/data/seedTypes";

const SECTION = "Analysis · 03";

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

export function PlacementsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const { rangeHasData } = useDateRange();

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

        // ── Conversion-only account (conversion-device export, no
        //    delivery-based placement runs) ──────────────────────────────
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

        // ── Delivery-based placement runs (V3 / C4E) ────────────────────
        const totalSpend = rollup.reduce((n, s) => n + s.spend, 0);
        const totalResults = rollup.reduce((n, s) => n + s.results, 0);
        const top = rollup[0];
        const maxSpend = Math.max(...rollup.map((s) => s.spend), 1);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Placements"
              subtitle="Where delivery happened and what each placement produced, across both analysis runs."
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
              <SectionCard title="Spend by placement" desc="Combined across the V3 and C4E signals.">
                <div className="space-y-2.5">
                  {rollup.map((s) => (
                    <div key={s.placement}>
                      <div className="flex items-center justify-between text-[12px] mb-1 gap-3">
                        <span className="text-foreground/90 font-medium">{s.placement}</span>
                        <span className="text-muted-foreground/80 tabular-nums shrink-0">
                          {fmtUSD(s.spend, 0)} · {fmtNum(s.results)} results · {fmtNum(s.impressions)} impressions
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.max((s.spend / maxSpend) * 100, 3)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="V3 placement signal" desc={`Placement performance for the ${term.singular}-focused run.`} table="v3_placement_signal">
                {v3.length === 0 ? (
                  <PendingState title="No V3 rows" message="This run produced no placement rows." icon={LayoutGrid} />
                ) : (
                  <PlacementTable rows={v3} />
                )}
              </SectionCard>

              <SectionCard title="C4E placement signal" desc="Placement performance for the checkout-event run." table="c4e_placement_signal">
                {c4e.length === 0 ? (
                  <PendingState title="No C4E rows" message="This run produced no placement rows." icon={LayoutGrid} />
                ) : (
                  <PlacementTable rows={c4e} />
                )}
              </SectionCard>

              {hasConversion && cts && <ConversionTrackingSections cts={cts} />}
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
