// ─── Cohort configuration ──────────────────────────────────────────────
// Sourced verbatim from docs/data-model/METRIX_Cohort_Architecture_v1.md
// §2.1-2.4. This is the fix for the systemic defect CLAUDE.md flags:
// "the known systemic defect is ROAS/CPA/purchase-funnel assumptions
// baked in as if every client sells physical products." Every stage that
// needs a client's terminal metric resolves it through here instead of
// hardcoding ecommerce language.
//
// All four cohorts are terminal_metric_direction "lower_is_better" in v1
// — there is no "higher is better" cohort yet, so callers that only need
// direction-generic logic (e.g. cost-vs-baseline tiering) don't need to
// branch on cohort at all. What DOES vary per cohort, and matters for
// anything user-facing (generated copy, labels): terminal_metric identity.

export type CohortKey = "ecommerce" | "lead_gen" | "service" | "app";

export const COHORT_KEYS: readonly CohortKey[] = ["ecommerce", "lead_gen", "service", "app"];

export interface CohortDefinition {
  cohort_key: CohortKey;
  label: string;
  funnel_stages: string[];
  intent_score_weights: Record<string, number>;
  terminal_metric: string;
  /** Human-readable form of terminal_metric for prompts/UI, e.g. "cost per qualified lead". */
  terminal_metric_label: string;
  terminal_metric_direction: "lower_is_better" | "higher_is_better";
  secondary_metrics: string[];
}

export const COHORT_DEFINITIONS: Record<CohortKey, CohortDefinition> = {
  ecommerce: {
    cohort_key: "ecommerce",
    label: "Ecommerce",
    funnel_stages: ["click", "add_to_cart", "initiate_checkout", "purchase"],
    intent_score_weights: { click: 1, add_to_cart: 2, initiate_checkout: 5, purchase: 10 },
    terminal_metric: "cost_per_purchase",
    terminal_metric_label: "cost per purchase",
    terminal_metric_direction: "lower_is_better",
    secondary_metrics: ["roas", "conversion_rate", "aov"],
  },
  lead_gen: {
    cohort_key: "lead_gen",
    label: "Lead Generation",
    funnel_stages: ["click", "lead_submit", "qualified", "close"],
    intent_score_weights: { click: 1, lead_submit: 5, qualified: 8, close: 10 },
    terminal_metric: "cost_per_qualified_lead",
    terminal_metric_label: "cost per qualified lead",
    terminal_metric_direction: "lower_is_better",
    secondary_metrics: ["lead_to_close_rate", "cost_per_lead"],
  },
  service: {
    cohort_key: "service",
    label: "Service",
    funnel_stages: ["click", "inquiry", "consult_booked", "close"],
    intent_score_weights: { click: 1, inquiry: 4, consult_booked: 7, close: 10 },
    terminal_metric: "cost_per_booking",
    terminal_metric_label: "cost per booking",
    terminal_metric_direction: "lower_is_better",
    secondary_metrics: ["cost_per_registration", "booking_show_rate"],
  },
  app: {
    cohort_key: "app",
    label: "App",
    funnel_stages: ["click", "install", "activation", "retained"],
    intent_score_weights: { click: 1, install: 3, activation: 6, retained: 10 },
    terminal_metric: "cost_per_activation",
    terminal_metric_label: "cost per activation",
    terminal_metric_direction: "lower_is_better",
    secondary_metrics: ["cost_per_install", "d7_retention_rate"],
  },
};

/**
 * Resolve a cohort string to its definition. Returns null (never a silent
 * ecommerce default) when the value is unset or unrecognized — callers
 * must handle "cohort not configured" honestly rather than guessing.
 */
export function resolveCohort(cohort: string | null | undefined): CohortDefinition | null {
  if (!cohort) return null;
  return Object.prototype.hasOwnProperty.call(COHORT_DEFINITIONS, cohort)
    ? COHORT_DEFINITIONS[cohort as CohortKey]
    : null;
}
