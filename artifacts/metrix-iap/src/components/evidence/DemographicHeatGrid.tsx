// ─── Demographic heat grid with inline drill ────────────────────────────
// Spec §15: age × gender HeatMatrix for a creative's mapped Ad IDs, an
// evidence chip and a coverage strip above it, and the inline-table-control
// mechanic below — tapping a segment opens its detail row in place while
// sibling rows dim to 0.4 (the AdPerformanceView pattern, verified in
// §0). The detail row is a sibling of the button, never inside it.

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { HeatMatrix, type HeatCell } from "@/components/charts/HeatMatrix";
import { RevealPanel } from "@/components/widgets/LayeredDisclosure";
import { fmtMetric } from "@/lib/normalize";
import type { AdBreakdownRow } from "@/lib/data/seedTypes";
import {
  type DemographicMeasure,
  type SegmentTotals,
  demographicGridFor,
  evidenceSummaryFor,
  measureValue,
} from "@/lib/creative-evidence";
import { CoverageStrip, EvidenceChip, EvidenceExplainer } from "./EvidenceChip";

const MEASURES: { id: DemographicMeasure; label: string }[] = [
  { id: "spend", label: "Spend" },
  { id: "cost_per_result", label: "Cost per result" },
  { id: "results", label: "Results" },
];

function MeasureToggle({ value, onChange }: { value: DemographicMeasure; onChange: (m: DemographicMeasure) => void }) {
  return (
    <div className="flex rounded border border-border/30 overflow-hidden" role="group" aria-label="Measure">
      {MEASURES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={cn(
            "pressable px-2.5 py-1.5 uppercase tracking-wide transition-colors",
            TYPE.microLabel,
            value === m.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground/75 hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

const fmtFor = (measure: DemographicMeasure) => (n: number): string =>
  measure === "results" ? fmtMetric("count", n) : measure === "spend" ? fmtMetric("usd_total", n) : fmtMetric("usd_unit", n);

export function DemographicHeatGrid({
  rows,
  resultLabel = "results",
  className,
}: {
  rows: AdBreakdownRow[];
  resultLabel?: string;
  className?: string;
}) {
  const [measure, setMeasure] = useState<DemographicMeasure>("spend");
  const [open, setOpen] = useState<string | null>(null);
  const grid = useMemo(() => demographicGridFor(rows), [rows]);
  const summary = useMemo(() => evidenceSummaryFor(rows), [rows]);
  const format = fmtFor(measure);

  const cells = useMemo<HeatCell[]>(
    () =>
      grid.segments.map((s) => ({
        row: s.age,
        col: s.gender,
        value: measureValue(s, measure),
        sub: s.ads > 1 ? `${s.ads} ads` : undefined,
        hint: `${fmtMetric("usd_total", s.spend)} · ${fmtMetric("count", s.results)} ${resultLabel} · ${fmtMetric("count", s.impressions)} impressions`,
        meta: s,
      })),
    [grid, measure, resultLabel],
  );

  const segKey = (s: SegmentTotals): string => `${s.age}${s.gender}`;
  const ordered = useMemo(() => [...grid.segments].sort((a, b) => b.spend - a.spend), [grid]);

  return (
    <div className={cn("space-y-4", className)} data-testid="demographic-heat-grid">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>Age × Gender</p>
          <EvidenceChip state={summary.state} />
        </div>
        <MeasureToggle value={measure} onChange={setMeasure} />
      </div>

      <CoverageStrip coveragePct={summary.coverage_pct} metricLabel="spend" />

      <HeatMatrix
        rows={grid.ages}
        cols={grid.genders}
        cells={cells}
        scale={measure === "cost_per_result" ? "verdict" : "magnitude"}
        lowerIsBetter={measure === "cost_per_result"}
        format={format}
        measureLabel={MEASURES.find((m) => m.id === measure)!.label}
        rowHeaderLabel="Age"
        onSelect={(cell) => {
          const s = cell.meta as SegmentTotals | undefined;
          if (s) setOpen((cur) => (cur === segKey(s) ? null : segKey(s)));
        }}
      />

      {grid.unattributed_spend !== null && grid.unattributed_spend > 0 && (
        <div className={cn("flex items-center justify-between rounded-lg border border-dashed border-border/50 px-3 py-2", TYPE.caption)} data-testid="unattributed-row">
          <span className="text-muted-foreground/75">Unattributed by this breakdown</span>
          <span className="tabular-nums text-muted-foreground">{fmtMetric("usd_total", grid.unattributed_spend)}</span>
        </div>
      )}

      {/* Inline drill: segment rows; the open one's detail arrives in place, siblings recede. */}
      <div className="space-y-1" data-testid="segment-drill">
        {ordered.map((s) => {
          const k = segKey(s);
          const isOpen = open === k;
          return (
            <div key={k} className={cn("transition-opacity duration-300", open !== null && !isOpen && "opacity-40")}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : k)}
                aria-expanded={isOpen}
                className={cn(
                  "pressable w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  isOpen ? "border-primary/40 bg-primary/[0.06]" : "border-border/30 bg-foreground/[0.015] hover:border-border/50",
                )}
              >
                <span className={cn(TYPE.body, "font-medium text-foreground")}>
                  {s.age} · {s.gender}
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn(TYPE.caption, "tabular-nums text-muted-foreground")}>{measureValue(s, measure) === null ? "–" : format(measureValue(s, measure)!)}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/75 transition-transform", isOpen && "rotate-180")} aria-hidden />
                </span>
              </button>
              <RevealPanel open={isOpen}>
                <div className="pl-3 pt-2 pb-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: "Spend", value: fmtMetric("usd_total", s.spend) },
                    { label: resultLabel, value: fmtMetric("count", s.results) },
                    { label: "Cost per result", value: s.results > 0 ? fmtMetric("usd_unit", s.spend / s.results) : "–" },
                    { label: "Impressions", value: fmtMetric("count", s.impressions) },
                    { label: "Link CTR", value: s.impressions > 0 ? fmtMetric("pct", (s.link_clicks / s.impressions) * 100) : "–" },
                    { label: "Reach", value: s.reach_exact && s.reach !== null ? fmtMetric("count", s.reach) : "not additive" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/40 bg-foreground/[0.02] px-3 py-2">
                      <div className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{item.label}</div>
                      <div className={cn(TYPE.body, "font-semibold tabular-nums text-foreground")}>{item.value}</div>
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-3 flex items-center gap-2 flex-wrap pt-1">
                    <EvidenceChip state={s.evidence_state} testId="segment-evidence-chip" />
                    <span className={cn(TYPE.caption, "text-muted-foreground/75")}>
                      {s.coverage_pct === null ? "no per-ad control" : `${s.coverage_pct}% of this ad's spend`} · {s.ads} ad{s.ads === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </RevealPanel>
            </div>
          );
        })}
      </div>

      <EvidenceExplainer state={summary.state} coveragePct={summary.coverage_pct} nonAdditive />
    </div>
  );
}
