---
name: Metrix objectives replace cohort
description: Account "objectives" set replaces the scalar cohort; how resolution, analysis coverage, and the lead_gen/service column overlap work.
---

- An ad account's business model is now a SET of objectives (`ad_accounts.objectives` jsonb, same four keys as the old scalar `cohort`). Legacy scalar column is kept in lockstep (first objective) and read as fallback by `resolveAccountObjectives()` — never a silent ecommerce default; empty set is valid.
- Objectives are configured ONLY in Settings → General (multi-select); the Analysis Hub shows a read-only summary and never blocks a run.
- Analysis runs are data-aware: parser exposes `objectiveColumnGroupsPresent`; `computeObjectiveCoverage()` decides assessed vs skipped-with-flag vs suggest-enable (never auto-enable). Flags/assessed persist on `manual_analysis_runs.objective_flags` / `objectives_assessed` (JSON text, like csv_warnings).
- **Why**: configured-before-run objectives are what analysis assesses; data can only suggest, never change config.
- Known nuance: only three real CSV column groups exist — `SERVICE_METRICS` is shared by `lead_gen` and `service` (`service_or_lead_gen` group). Either configured is satisfied by its presence; do NOT invent a column split to force 1:1.
- Display fallback for 0/many objectives: generic "cost per result", lower_is_better (`resolveObjectivesMeta`, `terminalMetricLabelFor`).
- **Shared-DB test flake**: `analysisCompleteness.test.ts` scopes to the account's latest run; parallel task sessions inserting runs for the same shared account make it fail with a foreign run_id — rerun alone, don't debug code.
