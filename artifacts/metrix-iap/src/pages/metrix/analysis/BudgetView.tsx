// ─── Analysis · Budget ────────────────────────────────────────────────
// Spend allocation for the active ad account: campaign totals, per-event
// efficiency (metric selection), spend by concept (click to inspect),
// and placement spend. Dense tables live behind click-to-expand dialogs.

import { useMemo, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, MetricSelectionBar, SectionCard, fmtUSD, fmtNum, fmtPct, eventLabel,
  RangeScopeBar, NoDataInRangeState
} from "../shared";
import { SegmentCard } from "@/components/ui/SegmentCard";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope } from "@/lib/date-scope";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Wallet, ChevronRight, BarChart2 } from "lucide-react";
import type { CellPerformanceRow } from "@/lib/data/seedTypes";
import { cn } from "@/lib/utils";

const SECTION = "Analysis · 03";

// ─── Concept detail dialog ────────────────────────────────────────────

interface ConceptDetailDialogProps {
  concept: string | null;
  rows: CellPerformanceRow[];
  onClose: () => void;
}

function ConceptDetailDialog({ concept, rows, onClose }: ConceptDetailDialogProps) {
  if (!concept) return null;
  const conceptRows = rows
    .filter((r) => r.book2_concept_name === concept)
    .sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]);
  const totalSpend = conceptRows.reduce((n, r) => n + r["Amount spent (USD)"], 0);
  const totalResults = conceptRows.reduce((n, r) => n + r.Results, 0);
  const totalImpressions = conceptRows.reduce((n, r) => n + r.Impressions, 0);
  const cpa = totalResults > 0 ? totalSpend / totalResults : null;

  return (
    <Dialog open={concept != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-[hsl(222_61%_6%)] border-border/50 max-h-[82vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1">
          <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
            Concept budget breakdown
          </div>
          <DialogTitle className="text-[15px] font-semibold text-foreground">{concept}</DialogTitle>
          <DialogDescription className="text-label text-muted-foreground/70 leading-relaxed">
            {conceptRows.length} cell row{conceptRows.length !== 1 ? "s" : ""} across all result events
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top-line stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total spend", value: fmtUSD(totalSpend, 0) },
              { label: "Results", value: fmtNum(totalResults) },
              { label: "Impressions", value: fmtNum(totalImpressions) },
              { label: "CPA", value: cpa != null ? fmtUSD(cpa) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="mx-card-nested px-3 py-2.5">
                <div className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-0.5">{label}</div>
                <div className="text-body-lg font-bold text-foreground tabular-nums leading-none">{value}</div>
              </div>
            ))}
          </div>

          {/* Per-cell rows */}
          <div className="space-y-1">
            <p className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              By creative cell
            </p>
            <div className="rounded-lg border border-border/40 overflow-hidden bg-white/[0.015]">
              {conceptRows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/20 last:border-b-0 hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <div className="text-body font-medium text-foreground truncate">{r.cell_id}</div>
                    <div className="text-label-xs font-mono text-muted-foreground/60 mt-0.5">
                      {r["Result type"]} · {fmtNum(r.Impressions)} impr
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-body font-semibold text-foreground tabular-nums">
                      {fmtUSD(r["Amount spent (USD)"], 0)}
                    </div>
                    <div className="text-label-xs text-muted-foreground/70">{fmtNum(r.Results)} results</div>
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

// ─── Placement spend dialog ───────────────────────────────────────────

interface PlacementSpendDialogProps {
  open: boolean;
  v3Rows: { Placement: string; "Amount spent (USD)": number; Results: number; Impressions: number; "Link clicks"?: number }[];
  c4eRows: { Placement: string; "Amount spent (USD)": number; Results: number; Impressions: number; "Link clicks"?: number }[];
  onClose: () => void;
}

function PlacementSpendDialog({ open, v3Rows, c4eRows, onClose }: PlacementSpendDialogProps) {
  function PlacementSection({ rows, label }: { rows: typeof v3Rows; label: string }) {
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]);
    const max = Math.max(...sorted.map((r) => r["Amount spent (USD)"]), 1);
    return (
      <div className="space-y-1.5">
        <p className="text-label-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{label}</p>
        {sorted.map((r, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-body gap-3">
              <span className="text-foreground/90 font-medium truncate">{r.Placement}</span>
              <span className="text-muted-foreground/70 tabular-nums shrink-0">
                {fmtUSD(r["Amount spent (USD)"], 0)} · {fmtNum(r.Results)} results
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full"
                style={{ width: `${Math.max((r["Amount spent (USD)"] / max) * 100, 3)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-[hsl(222_61%_6%)] border-border/50 max-h-[82vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1">
          <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
            Placement spend
          </div>
          <DialogTitle className="text-[15px] font-semibold text-foreground">Spend by placement</DialogTitle>
          <DialogDescription className="text-label text-muted-foreground/70 leading-relaxed">
            {v3Rows.length} V3 rows · {c4eRows.length} C4E rows
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <PlacementSection rows={v3Rows} label="V3 placement signal" />
          <PlacementSection rows={c4eRows} label="C4E placement signal" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function BudgetView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);

  const summary = getCampaignSummary(seed, adAccountId);
  const allEvents = useMemo(
    () => Object.keys(summary?.bottom_line_totals ?? {}),
    [summary]
  );
  const { selected, toggle, isSelected } = useMetricSelection(adAccountId ?? "none", allEvents);
  const { rangeHasData } = useDateRange();
  const { inRangeCell } = useCellRangeScope(analysis);

  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Budget" account={account}>
        {() => {
          const acct = account!;
          const a = analysis;

          if (!summary) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Budget" />
                <ScopeBanner account={acct} />
                <PendingState title="No budget data" message="Campaign spend totals appear once analysis is available." icon={Wallet} />
              </div>
            );
          }

          const eventRows = selected
            .map((e) => ({ event: e, totals: summary.bottom_line_totals[e] }))
            .filter((r) => r.totals != null);

          const conceptSpend = new Map<string, number>();
          for (const r of a?.performance_by_cell ?? []) {
            if (!selected.includes(r["Result type"])) continue;
            if (!inRangeCell(r.cell_id)) continue;
            conceptSpend.set(r.book2_concept_name, (conceptSpend.get(r.book2_concept_name) ?? 0) + r["Amount spent (USD)"]);
          }
          const conceptRows = Array.from(conceptSpend.entries()).sort((x, y) => y[1] - x[1]);
          const maxConcept = Math.max(...conceptRows.map(([, v]) => v), 1);

          const v3Rows = a?.v3_placement_signal ?? [];
          const c4eRows = a?.c4e_placement_signal ?? [];
          const hasPlacement = v3Rows.length > 0 || c4eRows.length > 0;

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Budget"
                subtitle="Where spend went and what it produced. Click concepts to inspect cell-level breakdown."
                table="campaign_summary, performance_by_cell"
              />
              <ScopeBanner account={acct} />
              <MetricSelectionBar events={allEvents} isSelected={isSelected} onToggle={toggle} />
              <RangeScopeBar grainNote="Budget figures aggregate the account's full flight window — this import has no daily grain." />

              {!rangeHasData ? (
                <NoDataInRangeState what="budget data" />
              ) : (
              <>
              <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricTile label="Total spend" value={fmtUSD(summary.total_spend_usd, 0)} />
                <MetricTile label="Impressions" value={fmtNum(summary.total_impressions)} />
                <MetricTile label="Link clicks" value={fmtNum(summary.total_link_clicks)} />
                <MetricTile label="Link CTR" value={fmtPct(summary.overall_link_ctr_pct)} />
              </div>

              <div className="px-6 py-5 space-y-4 max-w-5xl">
                {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

                <SectionCard
                  title="Efficiency by result event"
                  desc="Spend and outcome for each selected result event."
                  table="bottom_line_totals"
                >
                  {eventRows.length === 0 ? (
                    <PendingState title="No events selected" message="Select at least one result event above." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {eventRows.map(({ event, totals }) => (
                        <SegmentCard
                          key={event}
                          name={eventLabel(event)}
                          metrics={[
                            { label: "Spend", value: fmtUSD(totals.spend, 0) },
                            { label: "Results", value: fmtNum(totals.results) },
                            { label: "CPA", value: totals.results > 0 ? fmtUSD(totals.spend / totals.results) : "—" },
                            { label: "Link clicks", value: fmtNum(totals.link_clicks) }
                          ]}
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Spend by concept"
                  desc="Reported spend across creative concepts. Click a bar to inspect its cell-level breakdown."
                  table="performance_by_cell"
                >
                  {conceptRows.length === 0 ? (
                    <PendingState title="No concept spend" message="No cell rows match the current metric selection." />
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {conceptRows.map(([name, spend]) => (
                          <SegmentCard
                            key={name}
                            onClick={() => setSelectedConcept(name)}
                            name={name}
                            metrics={[
                              { label: "Spend", value: fmtUSD(spend, 0) }
                            ]}
                            footer={
                              <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden mt-1">
                                <div
                                  className="h-full bg-primary/60 rounded-full transition-colors group-hover:bg-primary/80"
                                  style={{ width: `${Math.max((spend / maxConcept) * 100, 3)}%` }}
                                />
                              </div>
                            }
                          />
                        ))}
                      </div>
                      <p className="mt-4 text-label text-muted-foreground flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5" />
                        {conceptRows.length} concept{conceptRows.length !== 1 ? "s" : ""} · click any card for the cell-level breakdown
                      </p>
                    </>
                  )}
                </SectionCard>

                {hasPlacement && (
                  <SectionCard
                    title="Placement spend"
                    desc="Spend and results by placement across analysis runs."
                    table="v3_placement_signal, c4e_placement_signal"
                  >
                    <button
                      onClick={() => setPlacementOpen(true)}
                      className="w-full flex items-center justify-between p-4 mx-card-nested hover-elevate active-elevate text-left group"
                    >
                      <div>
                        <p className="text-body-lg font-semibold text-foreground">View placement breakdown</p>
                        <p className="text-body text-muted-foreground mt-0.5">
                          {v3Rows.length} V3 rows · {c4eRows.length} C4E rows
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </button>
                  </SectionCard>
                )}
              </div>
              </>
              )}
            </div>
          );
        }}
      </ModuleScopeGate>

      <ConceptDetailDialog
        concept={selectedConcept}
        rows={analysis?.performance_by_cell ?? []}
        onClose={() => setSelectedConcept(null)}
      />

      <PlacementSpendDialog
        open={placementOpen}
        v3Rows={analysis?.v3_placement_signal ?? []}
        c4eRows={analysis?.c4e_placement_signal ?? []}
        onClose={() => setPlacementOpen(false)}
      />
    </>
  );
}
