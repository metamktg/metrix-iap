// ─── Objective coverage for an analysis run ────────────────────────────
// Compares the account's CONFIGURED objectives (set in Settings → General,
// never here) against the objective column groups actually PRESENT in the
// staged CSVs for a run, and produces:
//   - assessed: configured objectives whose required column group is
//     present this run — these get assessed/reported exactly as the old
//     single-cohort path did.
//   - flags: non-blocking, human-readable notices for
//       (a) configured objectives whose columns are absent this run
//           (skipped, never fabricated), and
//       (b) detected column groups matching an objective that is NOT
//           configured (a suggestion — never auto-enabled).
// Pure function, unit-testable without a database.
//
// Known nuance: SERVICE_METRICS is shared by lead_gen and service — column
// presence cannot distinguish them. "Either is configured" is satisfied by
// the shared group's presence; a suggestion for that group names both.

import { COHORT_DEFINITIONS, type CohortKey } from "./cohortConfig";
import type { ObjectiveColumnGroup } from "./iapCsvSpec";

/** Which column group each objective needs in order to be assessed. */
export const OBJECTIVE_GROUP_FOR_KEY: Record<CohortKey, ObjectiveColumnGroup> = {
  ecommerce: "ecommerce",
  lead_gen: "service_or_lead_gen",
  service: "service_or_lead_gen",
  app: "app",
};

const GROUP_DATA_LABEL: Record<ObjectiveColumnGroup, string> = {
  ecommerce: "ecommerce (purchase/checkout)",
  service_or_lead_gen: "leads/bookings (Leads, Appointments, Registrations, Calls)",
  app: "app (installs/activations)",
};

export interface ObjectiveCoverage {
  /** Configured objectives whose column group is present this run (canonical order). */
  assessed: CohortKey[];
  /** Configured objectives skipped this run because their columns are absent (canonical order). */
  skipped: CohortKey[];
  /** Non-blocking human-readable flags: skipped-objective notices + enable-suggestions. */
  flags: string[];
}

export function computeObjectiveCoverage(
  configured: readonly CohortKey[],
  groupsPresent: ReadonlySet<ObjectiveColumnGroup> | readonly ObjectiveColumnGroup[],
): ObjectiveCoverage {
  const present = new Set(groupsPresent);
  const configuredSet = new Set(configured);

  const assessed: CohortKey[] = [];
  const skipped: CohortKey[] = [];
  const flags: string[] = [];

  for (const key of configured) {
    if (present.has(OBJECTIVE_GROUP_FOR_KEY[key])) assessed.push(key);
    else skipped.push(key);
  }

  for (const key of skipped) {
    const def = COHORT_DEFINITIONS[key];
    flags.push(
      `Objective "${def.label}" is configured for this account, but this run's uploads contain no ` +
        `${GROUP_DATA_LABEL[OBJECTIVE_GROUP_FOR_KEY[key]]} columns — it was skipped for this run ` +
        `(its ${def.terminal_metric_label} is not reported; nothing was fabricated).`,
    );
  }

  // Present-but-unconfigured groups → suggestion (never auto-enabled).
  for (const group of ["ecommerce", "service_or_lead_gen", "app"] as ObjectiveColumnGroup[]) {
    if (!present.has(group)) continue;
    const keysForGroup = (Object.keys(OBJECTIVE_GROUP_FOR_KEY) as CohortKey[]).filter(
      (k) => OBJECTIVE_GROUP_FOR_KEY[k] === group,
    );
    if (keysForGroup.some((k) => configuredSet.has(k))) continue;
    const labels = keysForGroup.map((k) => COHORT_DEFINITIONS[k].label).join(" or ");
    flags.push(
      `This run's uploads contain ${GROUP_DATA_LABEL[group]} columns, but no matching objective is ` +
        `configured. If this account runs towards that goal, enable the ${labels} objective in ` +
        `Settings → General — it was NOT enabled automatically, and those columns were ignored for ` +
        `objective reporting this run.`,
    );
  }

  return { assessed, skipped, flags };
}
