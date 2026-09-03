// ─── Funnel stage configuration ───────────────────────────────────────
// Defines two named funnel stages for the IAP Library view:
//   UPPER_FUNNEL — delivery / awareness metrics (CTR, CPM, reach)
//   LOWER_FUNNEL — the scope's result metrics (cost per result, CVR) plus
//                  one tile per funnel step the ACCOUNT actually carries
// Each stage carries a tile ID list and a default primary sort config.
//
// The lower-funnel preset used to list ATC rate and checkout rate for every
// account — an ecommerce funnel assumed for every vertical. It is now built
// from the result events present (`lowerFunnelTileIds`): a lead-gen account
// gets no add-to-cart tile because it has no add-to-cart event, and an
// awareness scope leads with the event's own rate and CPM rather than a
// cost per result it is never judged on.

import { classifyResultEvent, type EvaluationScale } from "@/lib/resultEvents";

export type FunnelStage = "upper" | "lower" | "custom";

export interface FunnelStageConfig {
  label: string;
  badge: string;
  /** IDs from buildLibraryMetricCatalog to show in the KPI tile row. */
  tileIds: string[];
  /** Metric key to sort cells by when the stage is applied. */
  sortKey: SortKey;
  /** Sort direction: "asc" is lower-better (CPA), "desc" is higher-better (CTR). */
  sortDir: "asc" | "desc";
}

/** Sortable fields on CellPerformanceRow. */
export type SortKey =
  | "spend"
  | "results"
  | "cpa"
  | "ctr"
  | "impressions"
  | "reach"
  | "link_clicks"
  | "cvr"
  | "none";

/** What the account carries, so a preset can be built from it. */
export interface FunnelStageContext {
  /** The result types the account's ads ran under (seed `result_events[].raw`, else the rows' distinct types). */
  events?: readonly string[];
  /** The active result scope's scale; communication never ranks on cost. */
  scale?: EvaluationScale | null;
}

/**
 * The base of the lower-funnel preset: the scope's result metrics. Per-event
 * funnel steps are appended by `lowerFunnelTileIds` from what is present.
 */
const LOWER_BASE_COST: string[] = ["lib_spend", "lib_results", "lib_cpa", "lib_cvr"];
const LOWER_BASE_COMMUNICATION: string[] = ["lib_spend", "lib_results", "lib_result_rate", "lib_cpm"];

/** The tile a funnel step maps to, when the account carries that event. */
const EVENT_TILE: Record<string, string> = {
  add_to_cart: "lib_atc_rate",
  initiate_checkout: "lib_checkout_rate",
};

/**
 * Lower-funnel tile IDs for one account: the scale's base tiles plus one
 * funnel-step tile per event the account carries (events classified through
 * the taxonomy, so "onb_initiate_checkout" and "Checkouts initiated" both
 * map to the checkout tile). Never a fixed ATC → checkout list.
 */
export function lowerFunnelTileIds(ctx: FunnelStageContext = {}): string[] {
  const ids = ctx.scale === "communication" ? [...LOWER_BASE_COMMUNICATION] : [...LOWER_BASE_COST];
  const seen = new Set<string>();
  for (const rt of ctx.events ?? []) {
    const tile = EVENT_TILE[classifyResultEvent(rt).key];
    if (tile && !seen.has(tile)) {
      seen.add(tile);
      ids.push(tile);
    }
  }
  return ids;
}

export const FUNNEL_STAGE_CONFIGS: Record<Exclude<FunnelStage, "custom">, FunnelStageConfig> = {
  upper: {
    label: "Upper Funnel",
    badge: "UPPER FUNNEL",
    tileIds: ["lib_reach", "lib_impressions", "lib_link_clicks", "lib_link_ctr"],
    sortKey: "ctr",
    sortDir: "desc",
  },
  lower: {
    label: "Lower Funnel",
    badge: "LOWER FUNNEL",
    // The context-free base; getFunnelStageConfig(stage, ctx) appends the
    // account's own funnel steps.
    tileIds: [...LOWER_BASE_COST],
    sortKey: "cpa",
    sortDir: "asc",
  },
};

/**
 * The stage's config for one account. The lower stage is built from the
 * context: its tiles from the events present, its sort from the scale (an
 * awareness scope sorts on link CTR, descending — cost is not its verdict).
 */
export function getFunnelStageConfig(stage: FunnelStage, ctx: FunnelStageContext = {}): FunnelStageConfig | null {
  if (stage === "custom") return null;
  if (stage === "upper") return FUNNEL_STAGE_CONFIGS.upper;
  const communication = ctx.scale === "communication";
  return {
    ...FUNNEL_STAGE_CONFIGS.lower,
    tileIds: lowerFunnelTileIds(ctx),
    sortKey: communication ? "ctr" : "cpa",
    sortDir: communication ? "desc" : "asc",
  };
}
