// ─── Cohort metadata (frontend) ────────────────────────────────────────
// Thin mirror of artifacts/api-server/src/lib/cohortConfig.ts — label and
// terminal-metric direction only, for client-side ranking/labeling (MST
// analysis, any future cohort-aware UI). Not the full weights/funnel-stage
// config; that stays server-side. Sourced from the same canonical registry
// (docs/data-model/METRIX_Cohort_Architecture_v1.md) so the two never drift
// on the fields they share.

export type CohortKey = "ecommerce" | "lead_gen" | "service" | "app";
export type TerminalDirection = "lower_is_better" | "higher_is_better";

export interface CohortMeta {
  label: string;
  terminalMetricLabel: string;
  terminalMetricDirection: TerminalDirection;
}

// All four cohorts are lower_is_better in v1 — see cohortConfig.ts's note.
export const COHORT_META: Record<CohortKey, CohortMeta> = {
  ecommerce: { label: "Ecommerce", terminalMetricLabel: "cost per purchase", terminalMetricDirection: "lower_is_better" },
  lead_gen: { label: "Lead Generation", terminalMetricLabel: "cost per qualified lead", terminalMetricDirection: "lower_is_better" },
  service: { label: "Service", terminalMetricLabel: "cost per booking", terminalMetricDirection: "lower_is_better" },
  app: { label: "App", terminalMetricLabel: "cost per activation", terminalMetricDirection: "lower_is_better" },
};

/** Falls back to a generic "cost per result" / lower_is_better reading when the account has no cohort set yet — never guesses ecommerce. */
export function resolveCohortMeta(cohort: string | null | undefined): CohortMeta {
  if (cohort && Object.prototype.hasOwnProperty.call(COHORT_META, cohort)) {
    return COHORT_META[cohort as CohortKey];
  }
  return { label: "Unassigned", terminalMetricLabel: "cost per result", terminalMetricDirection: "lower_is_better" };
}

/**
 * Resolve an account's configured objectives SET to a single display meta.
 * Exactly one objective → that objective's specific meta. Zero → the honest
 * "Unassigned" generic. Several → a generic "cost per result" reading with
 * a combined label, since collapsing multiple terminal metrics into one
 * specific label would mis-report at least one of them. Direction stays
 * lower_is_better in all cases (true for all four objectives in v1), so
 * ranking math remains correct for 0, 1, or many objectives.
 */
export function resolveObjectivesMeta(objectives: readonly string[] | null | undefined): CohortMeta {
  const known = (objectives ?? []).filter((o): o is CohortKey =>
    Object.prototype.hasOwnProperty.call(COHORT_META, o),
  );
  if (known.length === 1) return COHORT_META[known[0]!];
  if (known.length > 1) {
    return {
      label: known.map((k) => COHORT_META[k].label).join(" + "),
      terminalMetricLabel: "cost per result",
      terminalMetricDirection: "lower_is_better",
    };
  }
  return { label: "Unassigned", terminalMetricLabel: "cost per result", terminalMetricDirection: "lower_is_better" };
}
