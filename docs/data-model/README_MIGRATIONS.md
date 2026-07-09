# METRIX IAP — Supabase Migrations (Blueprint v2.0 §11)

**Date:** July 6, 2026
**Source:** METRIX_IAP_MASTER_BLUEPRINT_v2_0.md — every `create table` statement reproduced verbatim, ordered so a top-to-bottom run never hits a missing foreign key.
**Canonical home:** these files are GitHub-canonical per Blueprint §11.5. The Supabase Dashboard SQL Editor is only the execution surface — commit these to the repo under `supabase/migrations/` and `supabase/seed/` before or at the same time as running them.

## Run order (browser: Supabase Dashboard → SQL Editor → New query → paste → Run)

| # | File | Tables |
|---|------|--------|
| 1 | 20260706000100_identity_access.sql | organizations, org_members, clients, client_memberships |
| 2 | 20260706000200_cohort_architecture.sql | cohort_definitions, client_enabled_cohorts |
| 3 | 20260706000300_analysis_runs.sql | analysis_runs, analysis_run_cohorts, analysis_run_inputs, analysis_run_stages |
| 4 | 20260706000400_outputs.sql | intelligence_cards, creative_briefs, reports |
| 5 | 20260706000500_creative_intake_alignment.sql | onboarding_creative_intake, creative_alignment_checks |
| 6 | 20260706000600_alerts_bsil.sql | alert_rules, bsil_suggestions |
| 7 | 20260706000700_review_approval_learning.sql | review_events, human_edits, approval_events, learning_registry |
| 8 | seed/20260706000800_seed_cohort_definitions.sql | seed rows: ecommerce, lead_gen, service, app |
| 9 | 20260707000900_global_variable_registry.sql | global_variable_registry |
| 10 | seed/20260707001000_seed_global_variable_registry.sql | seed rows: 51 variable codes (49 active + 2 deprecated) |

22 tables total. File 5 must run after file 4 (onboarding_creative_intake and creative_alignment_checks both reference creative_briefs). File 8 runs any time after file 2.

## Hard constraints baked into the schema (do not relax)

- **Suggestion-only:** bsil_suggestions carries status pending/approved/rejected/executed_manually — nothing auto-executes.
- **Budget scope:** bsil_suggestions.budget_scope_object is check-constrained to campaign/ad_set only.
- **No-ROAS-v1 alerts:** alert_rules.metric has `check (metric <> 'roas')`.
- **Learning gating:** learning_registry links to approval_events; writes only through approved_for = 'learning_registry'.
- **Manual intake minimum:** onboarding_creative_intake enforces >= 5 uploaded assets for manual_upload.
- **One client-access mechanism:** client_memberships is the single source of truth for client-level visibility; org_members is org-level only.

## Known gap — CLOSED (July 7, 2026)

`global_variable_registry` was referenced in Blueprint v2.0 §11.2 and §16 without a `create table` definition. That gap is now closed: migration `20260707000900_global_variable_registry.sql` defines the table (config-as-data, same pattern as cohort_definitions; deprecated codes keep status='deprecated' + superseded_by, never deleted) and seed `20260707001000_seed_global_variable_registry.sql` loads all 51 variable codes (49 active across CN/FW/TN/ST/AW/HP/PR/HK/CTA + 2 deprecated: CN_PainFirst→HK_Problem, PR_SocialProof→PR_MassProof), compiled from VARIABLES_REGISTRY and cross-verified against the Master Concept and Master Angle Variable Tables. Blueprint §16 seed roadmap step 2 is now fully satisfied.

## Not included (by design)

- **RLS policies** (Blueprint §12) belong in `supabase/policies/` as a separate pass — service-role tenancy enforcement is Edge Function logic plus policy files, not table DDL.
- **pgmq queues** (§11.6) are enabled via the Supabase Integrations UI, not migration SQL.
