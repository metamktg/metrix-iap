// ─── Account totals and coverage shares ────────────────────────────────
// Three surfaces summed the wrong rows for an account-level figure
// (audit round 5, 2026-09-05):
//
//   · Creative DNA's tiles summed the VARIABLE rows: one row per token an ad
//     carries, so an ad counted once per token. Total spend read $68,535 on
//     an account that spent $42,290, and impressions read 0 because the
//     variable rows do not carry them.
//   · Analysis Overview's "By result type" donut read the cell rows, which
//     an engine-analysed account does not have, and on an importer account
//     cover the cell library's events only (Bookster's installs and
//     checkouts live on ad rows the donut never saw).
//   · The demographic and placement exports cover a SHARE of an account's
//     spend, and the surfaces built on them said "this result scope" where
//     the difference from the account total was coverage.
//
// The campaign summary's `bottom_line_totals` is the per-event account total
// the seed already derives from the ad rows (one entry per raw Meta result
// type: spend, results, impressions, reach, clicks). Everything here reads
// that, restricted to a result scope when one applies, and says where a
// share came from. Pure, unit-tested.

import type { AnalysisData, BreakdownKind, CampaignSummary, SeedResultEventTotals } from "@/lib/data/seedTypes";
import type { MetricSource } from "@/lib/data/metricsCatalog";
import { eventLabel } from "@/pages/metrix/shared";

/**
 * Account totals from the campaign summary, restricted to the given raw
 * result types (null or empty means every event). Null when there is no
 * summary or no event survives the restriction, so a caller renders
 * nothing rather than a zero.
 */
export function scopedAccountTotals(
  summary: CampaignSummary | null | undefined,
  resultTypes: readonly string[] | null | undefined,
): MetricSource | null {
  if (!summary) return null;
  const wanted = resultTypes && resultTypes.length > 0 ? new Set(resultTypes) : null;
  const events = Object.entries(summary.bottom_line_totals ?? {}).filter(([raw]) => !wanted || wanted.has(raw));
  if (events.length === 0) return null;
  const sum = (pick: (e: SeedResultEventTotals) => number | null | undefined): number =>
    events.reduce((n, [, e]) => n + (pick(e) ?? 0), 0);
  const spend = sum((e) => e.spend);
  const impressions = sum((e) => e.impressions);
  const linkClicks = sum((e) => e.link_clicks);
  return {
    spend,
    impressions,
    reach: sum((e) => e.reach),
    clicksAll: sum((e) => e.clicks_all),
    linkClicks,
    linkCtrPct: impressions > 0 ? (linkClicks / impressions) * 100 : null,
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend, impressions: e.impressions })),
    isMultiEvent: events.length > 1,
  };
}

/** Spend per result type, largest first, for a share chart. Events with no spend are left out. */
export function resultTypeSpendSplit(
  totals: Record<string, SeedResultEventTotals> | null | undefined,
): { name: string; value: number }[] {
  return Object.entries(totals ?? {})
    .filter(([, e]) => (e.spend ?? 0) > 0)
    .map(([raw, e]) => ({ name: eventLabel(raw), value: e.spend }))
    .sort((a, b) => b.value - a.value);
}

export interface SpendShare {
  /** 0..100. */
  pct: number;
  /** Where the share was read: the run's reconciliation ledger, or the rows' spend against the summary total. */
  basis: "reconciliation" | "rows";
}

/**
 * The share of the account's spend a breakdown export covers. The run's
 * reconciliation summary states it per class (amount spent against the
 * control); a run without one falls back to the rows' own spend against
 * the campaign summary's total. Null when neither can say.
 */
export function breakdownSpendShare(
  analysis: Pick<AnalysisData, "reconciliation" | "demographic_registration_signal" | "v3_placement_signal" | "c4e_placement_signal"> | null | undefined,
  summary: Pick<CampaignSummary, "total_spend_usd"> | null | undefined,
  reportClass: Extract<BreakdownKind, "demographic" | "placement">,
): SpendShare | null {
  const reconciled = analysis?.reconciliation?.summary?.breakdowns
    .find((b) => b.report_class === reportClass)
    ?.by_metric.find((m) => m.metric === "amount_spent")?.coverage_pct;
  if (reconciled != null && Number.isFinite(reconciled)) {
    return { pct: Math.min(100, Math.max(0, reconciled)), basis: "reconciliation" };
  }
  const total = summary?.total_spend_usd;
  if (!total || total <= 0 || !analysis) return null;
  const rows: readonly { "Amount spent (USD)": number }[] =
    reportClass === "demographic"
      ? analysis.demographic_registration_signal ?? []
      : [...(analysis.v3_placement_signal ?? []), ...(analysis.c4e_placement_signal ?? [])];
  if (rows.length === 0) return null;
  const spend = rows.reduce((n, r) => n + (r["Amount spent (USD)"] ?? 0), 0);
  const pct = (spend / total) * 100;
  // Rows that exceed the account total by more than rounding are the
  // duplicate-ingestion signature the engine flags, not a share: say nothing
  // rather than "100%".
  if (pct > 101) return null;
  return { pct: Math.min(100, Math.max(0, pct)), basis: "rows" };
}

/** "63% of spend", for a stat or a caption. */
export function spendShareLabel(share: SpendShare | null): string | null {
  return share ? `${Math.round(share.pct)}% of spend` : null;
}

/** Distinct creative cells among cell rows (one row per cell × result event, so rows over-count cells). */
export function countCells(rows: readonly { cell_id: string }[] | null | undefined): number {
  return new Set((rows ?? []).map((r) => r.cell_id)).size;
}
