// ─── Analysis · Audience ──────────────────────────────────────────────
// Demographic conversion signal: who converts, by age band and gender,
// with per-segment rollups. Click any segment bar to open a detail
// dialog showing stats + the underlying rows for that segment.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, fmtUSD, fmtNum, resultTerm,
  RangeScopeBar, NoDataInRangeState
} from "../shared";
import { SegmentCard } from "@/components/ui/SegmentCard";
import { useDateRange } from "@/contexts/DateRangeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Users, ChevronRight, BarChart2 } from "lucide-react";
import type { DemographicRow } from "@/lib/data/seedTypes";
// DemographicRow fields: cell_id, "Ad name", Age, Gender, "Amount spent (USD)", Results, "Link clicks" etc.
import { cn } from "@/lib/utils";

const SECTION = "Analysis · 03";

// ─── Segment detail dialog ────────────────────────────────────────────

interface SegmentDetailDialogProps {
  segment: { age: string; gender: string } | null;
  rows: DemographicRow[];
  totalResults: number;
  onClose: () => void;
}

function SegmentDetailDialog({ segment, rows, totalResults, onClose }: SegmentDetailDialogProps) {
  if (!segment) return null;
  const segRows = rows.filter(
    (r) => r.Age === segment.age && r.Gender === segment.gender
  );
  const spend = segRows.reduce((n, r) => n + r["Amount spent (USD)"], 0);
  const results = segRows.reduce((n, r) => n + r.Results, 0);
  const linkClicks = segRows.reduce((n, r) => n + r["Link clicks"], 0);
  const cpa = results > 0 ? spend / results : null;
  const sharePct = totalResults > 0 ? (results / totalResults) * 100 : 0;
  const genderLabel = segment.gender === "female" ? "Female" : segment.gender === "male" ? "Male" : segment.gender;

  return (
    <Dialog open={segment != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-[hsl(222_61%_6%)] border-border/50 max-h-[82vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1">
          <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
            Audience segment
          </div>
          <DialogTitle className="text-[15px] font-semibold text-foreground">
            {genderLabel} · {segment.age}
          </DialogTitle>
          <DialogDescription className="text-label text-muted-foreground/70 leading-relaxed">
            {segRows.length} creative cell{segRows.length !== 1 ? "s" : ""} in this segment ·{" "}
            {sharePct.toFixed(1)}% of total results
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top-line stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Results", value: fmtNum(results) },
              { label: "Spend", value: fmtUSD(spend, 0) },
              { label: "CPA", value: cpa != null ? fmtUSD(cpa) : "—" },
              { label: "Link clicks", value: fmtNum(linkClicks) },
            ].map(({ label, value }) => (
              <div key={label} className="mx-card-nested px-3 py-2.5">
                <div className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-0.5">{label}</div>
                <div className="text-body-lg font-bold text-foreground tabular-nums leading-none">{value}</div>
              </div>
            ))}
          </div>

          {/* Per-cell breakdown */}
          <div className="space-y-1">
            <p className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              Results by creative cell
            </p>
            <div className="rounded-lg border border-border/40 overflow-hidden bg-white/[0.015]">
              {segRows
                .sort((a, b) => b.Results - a.Results)
                .map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="text-body font-medium text-foreground truncate">{r["Ad name"]}</div>
                      <div className="text-label-xs font-mono text-muted-foreground/60 mt-0.5">{r.cell_id}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-body font-semibold text-foreground tabular-nums">{fmtNum(r.Results)} results</div>
                      <div className="text-label-xs text-muted-foreground/70">{fmtUSD(r["Amount spent (USD)"], 0)}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function AudienceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const { rangeHasData } = useDateRange();

  const [selectedSeg, setSelectedSeg] = useState<{ age: string; gender: string } | null>(null);

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
    <>
      <ModuleScopeGate section={SECTION} title="Audience" account={account}>
        {() => {
          const acct = account!;
          const term = resultTerm(acct);
          const rows = analysis?.demographic_registration_signal ?? [];

          if (rows.length === 0) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Audience" />
                <ScopeBanner account={acct} />
                <PendingState title="No demographic signal" message="The audience read appears once demographic result data exists." icon={Users} />
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
                subtitle={`Who converts: the demographic ${term.singular} signal by age band and gender. Click any segment to inspect it.`}
                table="demographic_registration_signal"
              />
              <ScopeBanner account={acct} />
              <RangeScopeBar grainNote="Demographic signal aggregates each cell's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="audience data" />
              ) : (
              <>
              <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricTile label="Segments" value={fmtNum(segments.length)} />
                <MetricTile label="Signal spend" value={fmtUSD(totalSpend, 0)} />
                <MetricTile label={term.Plural} value={fmtNum(totalResults)} />
                <MetricTile
                  label="Top segment"
                  value={top ? `${top.gender === "female" ? "F" : top.gender === "male" ? "M" : top.gender} ${top.age}` : "—"}
                  sub={top ? `${fmtNum(top.results)} ${term.plural}` : undefined}
                />
              </div>

              <div className="px-6 py-5 space-y-4 max-w-5xl">
                <SectionCard
                  title={`${term.Plural} by segment`}
                  desc="Aggregated across all creative cells. Click a segment bar to inspect its breakdown."
                  table="demographic_registration_signal"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {segments.map((s) => {
                      const cpa = s.results > 0 ? s.spend / s.results : null;
                      const genderLabel = s.gender === "female" ? "F" : s.gender === "male" ? "M" : s.gender;
                      const pct = Math.max((s.results / maxResults) * 100, 3);
                      return (
                        <SegmentCard
                          key={s.age + s.gender}
                          onClick={() => setSelectedSeg({ age: s.age, gender: s.gender })}
                          name={`${s.gender} · ${s.age}`}
                          descriptor={`${fmtNum(s.results)} results`}
                          metrics={[
                            { label: "Spend", value: fmtUSD(s.spend, 0) },
                            { label: "CPA", value: cpa != null ? fmtUSD(cpa) : "—" },
                          ]}
                          footer={
                            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden mt-1">
                              <div
                                className="h-full bg-primary/60 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                  <p className="mt-4 text-label text-muted-foreground flex items-center gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5" />
                    {rows.length} underlying rows · click any segment for the full cell-level breakdown
                  </p>
                </SectionCard>
              </div>
              </>
              )}
            </div>
          );
        }}
      </ModuleScopeGate>

      <SegmentDetailDialog
        segment={selectedSeg}
        rows={analysis?.demographic_registration_signal ?? []}
        totalResults={segments.reduce((n, s) => n + s.results, 0)}
        onClose={() => setSelectedSeg(null)}
      />
    </>
  );
}
