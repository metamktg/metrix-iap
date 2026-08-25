-- METRIX IAP — Migration 0010: Foreign-key index coverage
--
-- Source: audit of the live project (2026-08-25), which found 42 single-column
-- foreign keys across the schema with no supporting index. Postgres does not
-- create one for a FK automatically. An unindexed FK costs twice: lookups by
-- that column seq-scan, and every DELETE on the PARENT row must scan the whole
-- child table to enforce the constraint, holding a lock while it does.
--
-- On the official schema the cost is sharper than it looks from row counts,
-- because these columns are not merely queried — they are evaluated INSIDE RLS
-- POLICY PREDICATES, once per candidate row, on every read by every signed-in
-- user. `metrix_client_id_of_run(analysis_run_id)` and
-- `metrix_user_is_client_member(client_id)` are the two hot shapes; both sit on
-- the tenancy path, so their cost is paid on every authenticated query rather
-- than only on joins the application happens to write.
--
-- These tables are small today (most under 10 rows). That is exactly why this
-- is cheap to land now: index builds are instant at this size, and the access
-- pattern is already fixed by the policies. Waiting until the tables are large
-- means building them under load on the tenancy path.
--
-- Indexes are additive and idempotent; this migration creates no objects other
-- than indexes and changes no data, no policy and no grant.

-- ── analysis_run_id: evaluated by metrix_client_id_of_run() in the SELECT and
--    WRITE policy of every run-scoped table ──────────────────────────────────
create index if not exists analysis_run_cohorts_run_idx    on analysis_run_cohorts (analysis_run_id);
create index if not exists analysis_run_inputs_run_idx     on analysis_run_inputs (analysis_run_id);
create index if not exists analysis_run_stages_run_idx     on analysis_run_stages (analysis_run_id);
create index if not exists intelligence_cards_run_idx      on intelligence_cards (analysis_run_id);
create index if not exists review_events_run_idx           on review_events (analysis_run_id);
create index if not exists human_edits_run_idx             on human_edits (analysis_run_id);
create index if not exists approval_events_run_idx         on approval_events (analysis_run_id);
create index if not exists creative_briefs_run_idx         on creative_briefs (analysis_run_id);
create index if not exists reports_run_idx                 on reports (analysis_run_id);
create index if not exists bsil_suggestions_run_idx        on bsil_suggestions (analysis_run_id);

-- ── client_id: evaluated by metrix_user_is_client_member/_writer() ──────────
create index if not exists analysis_runs_client_idx            on analysis_runs (client_id);
create index if not exists intelligence_cards_client_idx       on intelligence_cards (client_id);
create index if not exists creative_briefs_client_idx          on creative_briefs (client_id);
create index if not exists reports_client_idx                  on reports (client_id);
create index if not exists alert_rules_client_idx              on alert_rules (client_id);
create index if not exists bsil_suggestions_client_idx         on bsil_suggestions (client_id);
create index if not exists learning_registry_client_idx        on learning_registry (client_id);
create index if not exists client_enabled_cohorts_client_idx   on client_enabled_cohorts (client_id);
create index if not exists onboarding_creative_intake_client_idx on onboarding_creative_intake (client_id);
create index if not exists creative_alignment_checks_client_idx  on creative_alignment_checks (client_id);

-- ── identity: auth.uid() lookups in the membership policies ────────────────
create index if not exists client_memberships_user_idx on client_memberships (user_id);
create index if not exists client_memberships_org_idx  on client_memberships (org_id);
create index if not exists org_members_user_idx        on org_members (user_id);
create index if not exists clients_org_idx             on clients (org_id);

-- ── remaining FKs: parent-delete enforcement, not policy predicates ────────
create index if not exists analysis_runs_triggered_by_idx        on analysis_runs (triggered_by);
create index if not exists review_events_reviewer_idx            on review_events (reviewer_id);
create index if not exists human_edits_editor_idx                on human_edits (editor_id);
create index if not exists approval_events_approver_idx          on approval_events (approver_id);
create index if not exists learning_registry_approval_idx        on learning_registry (approval_event_id);
create index if not exists onboarding_creative_intake_brief_idx  on onboarding_creative_intake (output_brief_id);
create index if not exists creative_alignment_checks_brief_idx   on creative_alignment_checks (source_brief_id);

-- ── Deliberately NOT indexed ───────────────────────────────────────────────
-- cohort_key FKs (analysis_run_cohorts, client_enabled_cohorts,
-- intelligence_cards, alert_rules, bsil_suggestions, learning_registry) point
-- at cohort_definitions — a 4-row, config-as-data table whose rows are never
-- deleted by design (same contract as global_variable_registry: "a new code is
-- a new row, never a schema change"). There is no parent-delete to enforce and
-- no selective lookup by cohort_key, so an index there would be pure write
-- overhead. Same reasoning for global_variable_registry.superseded_by, which is
-- a self-reference followed one row at a time from an already-fetched row.
-- Revisit only if cohort_definitions ever gains a delete path.
