// ─── Analysis · Audience ──────────────────────────────────────────────
// Demographic registration signal: who converts, by age band and gender,
// with per-segment rollups and the full underlying rows.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, fmtUSD, fmtNum, fmtPct,
} from "../shared";
import { DemographicTable } from "./tables";
import { Users } from "lucide-react";

const SECTION = "Analysis · 03";

export function AudienceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);

  const segments = useMemo(() => {
    const rows = analysis?.demographic_registration_signal ?? [];
    const byKey = new Map<string, { age: string; gender: string; spend: number; results: number; linkClicks: number }>();
    for (const r of rows) {
      const key = `${r.Age}|${r.Gender}`;
      const s = byKey.get(key) ?? { age: r.Age, gender: r.Gender, spend: 0, results: 0, linkClicks: 0 };
      s.spend += r["Amount spent (USD)"];
      s.results += r.Results;
      s.linkClicks += r["Link clicks"];
      byKey.set(key, s);
    }
    return [...byKey.values()].sort((a, b) => b.results - a.results);
  }, [analysis]);

  return (
    <ModuleScopeGate section={SECTION} title="Audience" account={account}>
      {() => {
        const acct = account!;
        const rows = analysis?.demographic_registration_signal ?? [];

        if (rows.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Audience" />
              <ScopeBanner account={acct} />
              <PendingState title="No demographic signal" message="The audience read appears once demographic registration data exists." icon={Users} />
            </div>
          );
        }

        const totalSpend = segments.reduce((n, s) => n + s.spend, 0);
        const totalResults = segments.reduce((n, s) => n + s.results, 0);
        const top = segments[0];
        const maxResults = Math.max(...segments.map((s) => s.results), 1);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Audience"
              subtitle="Who registers: the demographic registration signal by age band and gender."
              table="demographic_registration_signal"
            />
            <ScopeBanner account={acct} />

            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Segments" value={fmtNum(segments.length)} />
              <MetricTile label="Signal spend" value={fmtUSD(totalSpend, 0)} />
              <MetricTile label="Registrations" value={fmtNum(totalResults)} />
              <MetricTile label="Top segment" value={top ? `${top.gender === "female" ? "F" : top.gender === "male" ? "M" : top.gender} ${top.age}` : "—"} sub={top ? `${fmtNum(top.results)} registrations` : undefined} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              <SectionCard title="Registrations by segment" desc="Aggregated across all creative cells in the signal." table="demographic_registration_signal">
                <div className="space-y-2.5">
                  {segments.map((s) => {
                    const cpa = s.results > 0 ? s.spend / s.results : null;
                    return (
                      <div key={s.age + s.gender}>
                        <div className="flex items-center justify-between text-[12px] mb-1 gap-3">
                          <span className="text-foreground/90 font-medium capitalize">{s.gender} · {s.age}</span>
                          <span className="text-muted-foreground/80 tabular-nums shrink-0">
                            {fmtNum(s.results)} results · {fmtUSD(s.spend, 0)} · CPA {cpa != null ? fmtUSD(cpa) : "—"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.max((s.results / maxResults) * 100, 3)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Underlying rows" desc="Every demographic registration row behind the rollup, by creative cell." table="demographic_registration_signal">
                <DemographicTable rows={rows} />
              </SectionCard>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
