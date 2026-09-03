// ─── Reconciliation panel: per-ad truth · observed · coverage · unattributed ─
// Spec §15: a RevealPanel that opens from a one-line summary, a metric and
// breakdown selector, the account row, then every ad with a static coverage
// meter. Unreconciled rows say which export field is missing. Nothing here
// is scaled; the residual is shown as its own column, signed.

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { RevealPanel } from "@/components/widgets/LayeredDisclosure";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { SegmentedToggle } from "@/pages/metrix/shared";
import { fmtMetric } from "@/lib/normalize";
import type { BreakdownKind, ReconciliationData } from "@/lib/data/seedTypes";
import { ledgerMetricsFor, metricLabel, reconciliationRowsFor } from "@/lib/creative-evidence";
import { CoverageStrip, EvidenceChip, EvidenceExplainer } from "./EvidenceChip";

const BREAKDOWN_LABEL: Record<BreakdownKind, string> = {
  demographic: "Demographics",
  placement: "Placements",
  asset: "Assets",
  demographic_asset: "Demo × asset",
  placement_asset: "Placement × asset",
  demographic_placement: "Demo × placement",
};

const fmtValue = (metric: string, n: number | null): string => (n === null ? "—" : metric === "amount_spent" || /value/.test(metric) ? fmtMetric("usd_total", n) : fmtMetric("count", n));

export function ReconciliationPanel({ reconciliation, defaultOpen = false, className }: { reconciliation: ReconciliationData | null | undefined; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const breakdowns = useMemo(() => (reconciliation?.summary?.breakdowns ?? []).map((b) => b.report_class), [reconciliation]);
  const [breakdown, setBreakdown] = useState<BreakdownKind | null>(null);
  const active: BreakdownKind | null = breakdown && breakdowns.includes(breakdown) ? breakdown : breakdowns[0] ?? null;
  const metrics = useMemo(() => (active ? ledgerMetricsFor(reconciliation?.ledger, active) : []), [reconciliation, active]);
  const [metric, setMetric] = useState<string | null>(null);
  const activeMetric = metric && metrics.includes(metric) ? metric : metrics[0] ?? null;
  const table = useMemo(() => (active && activeMetric ? reconciliationRowsFor(reconciliation?.ledger, active, activeMetric) : null), [reconciliation, active, activeMetric]);
  const summary = reconciliation?.summary ?? null;
  const breakdownSummary = summary?.breakdowns.find((b) => b.report_class === active) ?? null;

  // Null only when there is no reconciliation at all. A summary with no
  // breakdown class reconciled (an Ad Summary staged alone, say) still
  // carries the truth source, and the reader deserves to see which control
  // was found and that nothing was reconciled against it — silence read as
  // "this feature does not exist here".
  if (!reconciliation || !summary) return null;
  const noBreakdown = breakdowns.length === 0;
  const spend = breakdownSummary?.by_metric.find((m) => m.metric === "amount_spent") ?? null;
  // A rejected control names itself: "no compatible control source for this window".
  const truthLabel = summary.truth_source === "ad_summary" ? (summary.truth_identity_kind === "ad_id" ? "Ad Summary per Ad ID" : "Ad Summary per ad name") : summary.truth_source === "totals_row" ? "Meta's totals row" : summary.truth_precedence || "no control source";

  return (
    <div className={cn("rounded-lg border border-border/40 bg-foreground/[0.02]", className)} data-testid="reconciliation-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>Reconciliation</span>
          <EvidenceChip state={spend?.evidence_state ?? null} testId="reconciliation-state" />
          <span className={cn(TYPE.caption, "text-muted-foreground/75 truncate")} data-testid="reconciliation-summary-line">
            {noBreakdown ? "no breakdown class reconciled" : spend?.coverage_pct !== null && spend?.coverage_pct !== undefined ? `${spend.coverage_pct}% of spend` : "not reconciled"} · control: {truthLabel}
          </span>
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground/75 transition-transform shrink-0", open && "rotate-180")} aria-hidden />
      </button>
      <RevealPanel open={open}>
        <div className="px-4 pb-4 space-y-4">
          {noBreakdown && (
            <p className={cn(TYPE.caption, "text-muted-foreground/75")}>
              No demographic, placement or asset breakdown was staged for this window, so there is nothing to reconcile against the control. Stage a breakdown export to see per-ad coverage here.
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {breakdowns.length > 1 && (
              <SegmentedToggle
                options={breakdowns.map((b) => ({ id: b, label: BREAKDOWN_LABEL[b] }))}
                active={active!}
                onChange={(id) => setBreakdown(id)}
                ariaLabel="Report class"
              />
            )}
            {metrics.length > 1 && (
              <SegmentedToggle
                options={metrics.map((m) => ({ id: m, label: metricLabel(m) }))}
                active={activeMetric!}
                onChange={(id) => setMetric(id)}
                ariaLabel="Metric"
                responsiveLabels
              />
            )}
          </div>

          {table?.account && (
            <div className="rounded-lg border border-border/40 bg-foreground/[0.02] px-3 py-2.5 space-y-2" data-testid="reconciliation-account-row">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className={cn(TYPE.body, "font-medium text-foreground")}>Account · {metricLabel(activeMetric!)}</span>
                <span className={cn(TYPE.caption, "tabular-nums text-muted-foreground")}>
                  {fmtValue(activeMetric!, table.account.observed_value)} observed · {fmtValue(activeMetric!, table.account.truth_value)} control ·{" "}
                  <span className={table.account.residual !== null && table.account.residual < 0 ? "text-status-danger" : ""}>
                    {table.account.residual === null ? "—" : `${table.account.residual < 0 ? "−" : ""}${fmtValue(activeMetric!, Math.abs(table.account.residual))}`} unattributed
                  </span>
                </span>
              </div>
              <CoverageStrip coveragePct={table.account.coverage_pct} metricLabel={metricLabel(activeMetric!).toLowerCase()} />
              {table.account.compatibility_failures[0] && (
                <p className={cn(TYPE.caption, "text-status-warning/90")}>{table.account.compatibility_failures[0].detail}</p>
              )}
            </div>
          )}

          {breakdownSummary && (
            <div className={cn("flex items-center gap-3 flex-wrap", TYPE.caption, "text-muted-foreground/75")} data-testid="reconciliation-ad-counts">
              <span>{breakdownSummary.ads_total} ads</span>
              <span className="text-status-success">{breakdownSummary.ads_reconciled} reconciled</span>
              <span className="text-status-warning">{breakdownSummary.ads_partial} partial</span>
              {breakdownSummary.ads_overcounted > 0 && <span className="text-status-danger">{breakdownSummary.ads_overcounted} over-counted</span>}
              {breakdownSummary.ads_unreconciled > 0 && <span>{breakdownSummary.ads_unreconciled} unreconciled</span>}
              {breakdownSummary.ads_missing_from_breakdown > 0 && <span>{breakdownSummary.ads_missing_from_breakdown} absent from this breakdown</span>}
            </div>
          )}

          {table && table.ads.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className={cn(TYPE.microLabel, "text-muted-foreground/75 text-left")}>
                    <th className="font-medium py-1.5 pr-3">Ad</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Control</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Observed</th>
                    <th className="font-medium py-1.5 pr-3 w-[160px]">Coverage</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Unattributed</th>
                    <th className="font-medium py-1.5">State</th>
                  </tr>
                </thead>
                <tbody>
                  {table.ads.map((r) => (
                    <tr key={`${r.ad_identity}`} className="border-t border-border/20 align-top" data-testid="reconciliation-ad-row">
                      <td className="py-2 pr-3">
                        <div className={cn(TYPE.caption, "text-foreground font-medium truncate max-w-[220px]")} title={r.ad_name ?? r.ad_identity}>
                          {r.ad_name ?? r.ad_identity}
                        </div>
                        {r.meta_ad_id && <div className={cn(TYPE.microLabel, "text-muted-foreground/75 tabular-nums normal-case tracking-normal")}>{r.meta_ad_id}</div>}
                        {r.failure && r.truth_value === null && <div className={cn(TYPE.microLabel, "text-status-warning/90 normal-case tracking-normal")}>{r.failure}</div>}
                      </td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", TYPE.caption)}>{fmtValue(activeMetric!, r.truth_value)}</td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", TYPE.caption)}>{fmtValue(activeMetric!, r.observed_value)}</td>
                      <td className="py-2 pr-3">
                        <ProgressMeter
                          value={r.coverage_pct === null ? null : Math.max(0, Math.min(100, Math.round(r.coverage_pct)))}
                          total={100}
                          label={`${r.ad_name ?? r.ad_identity} coverage`}
                          size="sm"
                          fillClassName={r.coverage_pct !== null && r.coverage_pct >= 99 ? "bg-status-success/60" : "bg-primary/50"}
                        />
                        <div className={cn(TYPE.microLabel, "text-muted-foreground/75 normal-case tracking-normal tabular-nums")}>{r.coverage_pct === null ? "—" : `${r.coverage_pct}%`}</div>
                      </td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", TYPE.caption, r.residual !== null && r.residual < 0 && "text-status-danger")}>
                        {r.residual === null ? "—" : `${r.residual < 0 ? "−" : ""}${fmtValue(activeMetric!, Math.abs(r.residual))}`}
                      </td>
                      <td className="py-2">
                        <EvidenceChip state={r.evidence_state} testId="reconciliation-ad-state" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <EvidenceExplainer state={spend?.evidence_state ?? null} coveragePct={spend?.coverage_pct ?? null} />
        </div>
      </RevealPanel>
    </div>
  );
}
