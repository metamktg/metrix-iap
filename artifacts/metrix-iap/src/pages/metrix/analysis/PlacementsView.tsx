// ─── Analysis · Placements ────────────────────────────────────────────
// Placement delivery signal across both analysis runs (V3 registrations
// and C4E checkout events), with per-placement rollups.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, fmtUSD, fmtNum,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { PlacementTable } from "./tables";
import { LayoutGrid } from "lucide-react";

const SECTION = "Analysis · 03";

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
        const v3 = analysis?.v3_placement_signal ?? [];
        const c4e = analysis?.c4e_placement_signal ?? [];

        if (v3.length === 0 && c4e.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Placements" />
              <ScopeBanner account={acct} />
              <PendingState title="No placement signal" message="Placement reads appear once delivery data exists for this account." icon={LayoutGrid} />
            </div>
          );
        }

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

              <SectionCard title="V3 placement signal" desc="Placement performance for the registration-focused run." table="v3_placement_signal">
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
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
