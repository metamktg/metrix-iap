// ─── Where a funnel stage's count was read ────────────────────────────
// The lower funnel is staged from the account's own result events (audit
// round 5): the export's own cart / checkout / purchase columns, else the
// rows' Result type. A demographic export whose rows carry NO Result type
// (the importer's pre-split rows, Bookster's 62) can still name its event:
// when the campaign summary holds exactly one result event whose spend and
// impressions are the rows' own totals, the rows are that event's rows.
// Bookster's Audience page already read its 78 results as registrations
// this way while the funnel said "No result event below link clicks" off
// the same rows (design pass, round 8).

import type { CampaignSummary, DemographicRow } from "./data/seedTypes";

export type FunnelStageBasis = "column" | "result_type" | "summary";

/** The reader-facing note for a lower-funnel stage's basis. */
export const FUNNEL_BASIS_NOTE: Record<FunnelStageBasis, string> = {
  column: "Read from the export's own column",
  result_type: "Read from the rows' Result type",
  summary: "Read from the campaign summary's result type: the export names none",
};

/**
 * The one summary event an untyped export's rows belong to, or null: null
 * when any row carries a Result type, when the summary is absent, when the
 * totals are zero, when no event owns them or when more than one could.
 * "unknown" is never an event.
 */
export function summaryEventForRows(rows: readonly DemographicRow[], summary: CampaignSummary | null | undefined): string | null {
  if (!summary?.bottom_line_totals || rows.length === 0) return null;
  if (rows.some((r) => r["Result type"] != null && String(r["Result type"]).trim() !== "")) return null;
  const spend = rows.reduce((n, r) => n + (r["Amount spent (USD)"] ?? 0), 0);
  const impressions = rows.reduce((n, r) => n + (r.Impressions ?? 0), 0);
  if (spend <= 0 && impressions <= 0) return null;
  const close = (a: number, b: number) => (b === 0 ? a === 0 : Math.abs(a - b) / b <= 0.005);
  const matches = Object.entries(summary.bottom_line_totals).filter(([type, t]) =>
    type !== "unknown" && close(spend, t.spend) && close(impressions, t.impressions),
  );
  return matches.length === 1 ? matches[0]![0] : null;
}
