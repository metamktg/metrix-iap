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

// ─── Objectives (multi-value replacement for the scalar cohort) ────────
// An account's "objectives" are a SET of one-or-more cohort keys. "Cohort"
// remains the internal vocabulary (ecommerce/lead_gen/service/app); the
// objectives set simply allows an account to run towards more than one at
// once (e.g. a retailer doing both purchase and lead-capture campaigns).
// WRITTEN BY THE ANALYSIS RUN, which derives it from ad result types (see
// inferObjectives below) — never configured by an operator. The readers
// here just parse the stored value back out.

/**
 * Parse/validate an arbitrary stored value (jsonb array, string[], etc.)
 * into a deduplicated, canonically-ordered list of objective keys.
 * Unknown values are dropped, never guessed.
 */
export function normalizeObjectives(raw: unknown): CohortKey[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<CohortKey>();
  for (const v of raw) {
    if (typeof v === "string" && Object.prototype.hasOwnProperty.call(COHORT_DEFINITIONS, v)) {
      set.add(v as CohortKey);
    }
  }
  return COHORT_KEYS.filter((k) => set.has(k));
}

/**
 * Resolve an ad_accounts row to its stored objectives — the set the last
 * analysis run DERIVED from the data. Reads the `objectives` set first;
 * falls back to the legacy scalar `cohort` column for rows written before
 * the migration. Returns [] (never a silent ecommerce default) when the
 * account has not been analysed yet or nothing could be determined.
 */
export function resolveAccountObjectives(row: Record<string, unknown> | null | undefined): CohortKey[] {
  if (!row) return [];
  const fromSet = normalizeObjectives(row["objectives"]);
  if (fromSet.length > 0) return fromSet;
  const legacy = resolveCohort(row["cohort"] as string | null | undefined);
  return legacy ? [legacy.cohort_key] : [];
}

/** Resolve objective keys to their full definitions (canonical order, unknowns dropped). */
export function resolveObjectiveDefinitions(objectives: readonly string[] | null | undefined): CohortDefinition[] {
  return normalizeObjectives(objectives ? [...objectives] : []).map((k) => COHORT_DEFINITIONS[k]);
}

// ─── Objective inference (DERIVED FROM DATA, never configured) ─────────
// OWNER DECISION (2026-09-01): the objective is not a property an operator
// asserts about an account, and it is not a toggle. It is read from the
// data the account actually receives. Meta already states it: every ad
// carries a "Result type" naming the event it was optimised towards
// ("Website purchases", "Leads (form)", "Mobile app installs"), which
// arrives on the demographic export and is parsed into base.result_type.
//
// This narrows the reach rule in check-cohort-reach.ts further. The
// objective stays an ANALYSIS LENS — it decides which optional column
// groups a run assesses and which terminal metric it reports — but it is
// now derived by the run rather than declared in Settings.
//
// WHY DISTINCT ADS, NOT ROWS OR RESULT VOLUME
// Meta assigns ONE result type per ad, from that ad's optimisation event.
// So "how many ads are optimised towards X" is the question, and one ad
// is one vote. Counting rows would over-weight ads that ran longer or
// carry more breakdown splits; counting result VOLUME would let a single
// high-converting ad outvote a whole campaign pointed elsewhere.

/**
 * Result-type → objective signals, first match wins. Deliberately narrow:
 * a result type that does not clearly name a business outcome contributes
 * NOTHING rather than being guessed at. "Website trials started" is the
 * live example — a trial start reads as a lead for a SaaS account and as
 * an activation for an app account, so it is intentionally absent here.
 */
const OBJECTIVE_SIGNALS: readonly { pattern: RegExp; objective: CohortKey }[] = [
  { pattern: /\bpurchase/i, objective: "ecommerce" },
  { pattern: /checkout/i, objective: "ecommerce" },
  { pattern: /\badds? to cart\b/i, objective: "ecommerce" },
  { pattern: /\bsubscription/i, objective: "ecommerce" },
  { pattern: /\blead/i, objective: "lead_gen" },
  { pattern: /\bregistrations? completed\b/i, objective: "lead_gen" },
  { pattern: /\bapp installs?\b/i, objective: "app" },
  { pattern: /\bapp activations?\b/i, objective: "app" },
  { pattern: /\bappointments?\b/i, objective: "service" },
  { pattern: /\bbookings?\b/i, objective: "service" },
  { pattern: /\bmessaging conversations?\b/i, objective: "service" },
];

/**
 * Minimum share of CLASSIFIED ads an objective needs before it counts as
 * one this account genuinely runs towards, rather than stray spillover.
 *
 * Calibrated against real accounts, not picked round: "Fresh Import" runs
 * 50 lead ads and 3 purchase ads (5.7%) — one campaign leaking, not an
 * ecommerce operation. "NEW AAFE" runs 363 lead ads and 48 purchase ads
 * (11.7%) — genuinely both. Any cut between those two separates them; 10%
 * sits between them with room either side.
 */
export const OBJECTIVE_MATERIALITY_SHARE = 0.1;

/**
 * The highest threshold at which "the dominant objective always survives"
 * still holds. Shares sum to 1 across at most COHORT_KEYS.length objectives,
 * so the largest share is always >= 1 / COHORT_KEYS.length. Above this an
 * account with real, unambiguous signal could infer to [] — undetermined —
 * which would be a silent regression, so it is asserted in the tests.
 */
export const OBJECTIVE_MATERIALITY_SHARE_MAX = 1 / COHORT_KEYS.length;

export interface ObjectiveInference {
  /** Objectives this account runs towards. Empty = undetermined, never guessed. */
  objectives: CohortKey[];
  /** Per-objective support, strongest first. Includes objectives below the threshold. */
  evidence: { objective: CohortKey; ads: number; share: number; material: boolean }[];
  /** Ads whose result type named a business outcome. */
  classifiedAds: number;
  /** Ads whose result type was "unknown", upper-funnel, or unrecognised. */
  unclassifiedAds: number;
  /** Distinct result-type strings that carried no objective signal, for operator visibility. */
  unclassifiedResultTypes: string[];
}

/** Classify a single Meta "Result type" string. Returns null when it names no business outcome. */
export function classifyResultType(resultType: string | null | undefined): CohortKey | null {
  if (typeof resultType !== "string") return null;
  const s = resultType.trim();
  if (s === "" || s.toLowerCase() === "unknown") return null;
  for (const { pattern, objective } of OBJECTIVE_SIGNALS) {
    if (pattern.test(s)) return objective;
  }
  return null;
}

/**
 * Infer an account's objectives from the ads in a run's ingested data.
 *
 * One ad is one vote (see the note above). An objective is returned when
 * it clears OBJECTIVE_MATERIALITY_SHARE of classified ads; the strongest
 * objective is always returned when there is ANY classified signal, so a
 * genuine single-objective account can never fall below its own threshold.
 *
 * With no classified signal at all the result is EMPTY — undetermined.
 * That is a real case, not a defensive branch: two live accounts
 * ("Crossval", "BELT") carry nothing but "unknown" result types. Returning
 * [] makes downstream read "objective not determined" instead of silently
 * defaulting to ecommerce, which is the systemic defect CLAUDE.md flags.
 */
export function inferObjectives(
  ads: Iterable<{ adKey: string; resultType: string | null | undefined }>,
): ObjectiveInference {
  // One result type per ad: first non-empty wins, so repeated rows for the
  // same ad (per date, per breakdown) collapse to a single vote.
  const perAd = new Map<string, string | null>();
  for (const { adKey, resultType } of ads) {
    if (!adKey) continue;
    const existing = perAd.get(adKey);
    if (existing === undefined || existing === null) {
      perAd.set(adKey, typeof resultType === "string" && resultType.trim() !== "" ? resultType.trim() : null);
    }
  }

  const counts = new Map<CohortKey, number>();
  const unclassifiedSet = new Set<string>();
  let classifiedAds = 0;
  let unclassifiedAds = 0;

  for (const resultType of perAd.values()) {
    const objective = classifyResultType(resultType);
    if (objective === null) {
      unclassifiedAds += 1;
      if (resultType !== null) unclassifiedSet.add(resultType);
      continue;
    }
    classifiedAds += 1;
    counts.set(objective, (counts.get(objective) ?? 0) + 1);
  }

  const evidence = [...counts.entries()]
    .map(([objective, adsCount]) => ({
      objective,
      ads: adsCount,
      share: classifiedAds === 0 ? 0 : adsCount / classifiedAds,
      material: classifiedAds > 0 && adsCount / classifiedAds >= OBJECTIVE_MATERIALITY_SHARE,
    }))
    // Strongest first; tie-break on canonical order so the result is stable.
    .sort((a, b) => b.ads - a.ads || COHORT_KEYS.indexOf(a.objective) - COHORT_KEYS.indexOf(b.objective));

  // The strongest objective always survives, BY CONSTRUCTION rather than by
  // a fallback branch: shares sum to 1 across at most COHORT_KEYS.length
  // objectives, so the largest is always >= 1/4 = 0.25, comfortably above
  // the 0.1 threshold. OBJECTIVE_MATERIALITY_SHARE_MAX pins that reasoning
  // so raising the threshold past it fails a test rather than silently
  // making it possible to return [] for an account with real signal.
  const kept = new Set<CohortKey>();
  for (const e of evidence) if (e.material) kept.add(e.objective);

  return {
    objectives: COHORT_KEYS.filter((k) => kept.has(k)),
    evidence,
    classifiedAds,
    unclassifiedAds,
    unclassifiedResultTypes: [...unclassifiedSet].sort(),
  };
}
