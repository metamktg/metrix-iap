// ─── Ad-grain performance rows ───────────────────────────────────────────
// The IAP Library's tiles, breakdown and top sets read `performance_by_cell`,
// which only the importer writes (one row per creative cell × result event).
// A manual account analysed by the engine has no cell library at all, so
// those surfaces read 0 cells, $0 and 0 results for a run that had 586 ads
// and $1.4M behind it (Pure Path, 2026-09-05). The per-ad totals the seed
// already ships on `ads[].performance` are the same quantities one grain
// down: one row per AD, keyed by its name, in the cell row's shape, so every
// consumer of cell rows works unchanged and says "ads" where it said "cells".
//
// What the per-ad totals do NOT carry is reported, never zero-filled: reach
// and clicks (all) are absent from `ads[].performance` today, so the rows
// carry 0 there and `unmeasured` names the fields, and the tile catalog
// renders those tiles as a dash with the reason. Pure, unit-tested.

import type { AdRecord, CellPerformanceRow } from "@/lib/data/seedTypes";

export const NO_CONCEPT_CODE = "No concept code";

export type UnmeasuredField = "reach" | "clicks_all";

export interface AdGrainRows {
  rows: CellPerformanceRow[];
  /** Fields the per-ad totals did not carry for at least one ad; the rows hold 0 there. */
  unmeasured: UnmeasuredField[];
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** One cell-shaped row per ad with performance totals; cell overrides and ads without totals are skipped. */
export function adGrainPerformanceRows(ads: readonly AdRecord[] | undefined): AdGrainRows {
  const rows: CellPerformanceRow[] = [];
  const unmeasured = new Set<UnmeasuredField>();
  const seen = new Set<string>();
  for (const ad of ads ?? []) {
    const p = ad.performance;
    if (!p || !ad.ad_name || ad.ad_name.startsWith("__cell_override_")) continue;
    if (seen.has(ad.ad_name)) continue;
    seen.add(ad.ad_name);
    if (p.reach == null) unmeasured.add("reach");
    if (p.clicks_all == null) unmeasured.add("clicks_all");
    const spend = p.spend ?? 0;
    const results = p.results ?? 0;
    const impressions = p.impressions ?? 0;
    const linkClicks = p.link_clicks ?? 0;
    rows.push({
      cell_id: ad.ad_name,
      "Result type": p.result_type && p.result_type.trim() !== "" ? p.result_type : "unknown",
      "Amount spent (USD)": spend,
      Reach: p.reach ?? 0,
      Impressions: impressions,
      Results: results,
      "Clicks (all)": p.clicks_all ?? 0,
      "Link clicks": linkClicks,
      CPA_result: spend > 0 && results > 0 ? round(spend / results, 4) : null,
      CTR_link_pct: impressions > 0 ? round((linkClicks / impressions) * 100, 4) : 0,
      Result_per_link_click_pct: linkClicks > 0 ? round((results / linkClicks) * 100, 4) : 0,
      book2_concept_name: ad.concept ?? NO_CONCEPT_CODE,
      ...(ad.concept ? { concept_variable: ad.concept } : {}),
    });
  }
  return { rows, unmeasured: [...unmeasured] };
}
