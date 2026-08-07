// ─── Funnel stage configuration ───────────────────────────────────────
// Defines two named funnel stages for the IAP Library view:
//   UPPER_FUNNEL — delivery / awareness metrics (CTR, CPM, reach)
//   LOWER_FUNNEL — conversion metrics (CPA, CVR, ATC rate, checkout rate)
// Each stage carries a tile ID list and a default primary sort config.

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
    tileIds: ["lib_spend", "lib_results", "lib_cpa", "lib_cvr", "lib_atc_rate", "lib_checkout_rate"],
    sortKey: "cpa",
    sortDir: "asc",
  },
};

export function getFunnelStageConfig(stage: FunnelStage): FunnelStageConfig | null {
  if (stage === "custom") return null;
  return FUNNEL_STAGE_CONFIGS[stage];
}
