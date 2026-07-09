-- METRIX IAP — COMBINED MIGRATIONS (Blueprint v2.0 §11) — July 6, 2026
-- Individual files remain GitHub-canonical; this combined file is for record + one-paste execution.

-- ============ migrations/20260706000100_identity_access.sql ============
-- METRIX IAP — Migration 0001: Identity and access (Blueprint v2.0 §11.1)
-- org_members = organization-level membership; client_memberships = the single
-- source of truth for client-level visibility. Never both (§11.1, non-negotiable).

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  created_at timestamptz default now(),
  unique (org_id, user_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  client_code text not null unique,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table client_memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('owner','operator','client_viewer')),
  created_at timestamptz default now(),
  unique (client_id, user_id)
);

-- ============ migrations/20260706000200_cohort_architecture.sql ============
-- METRIX IAP — Migration 0002: Cohort architecture (Blueprint v2.0 §6.2)
-- cohort_definitions is config-as-data: a new business model is a new row,
-- not a schema change. client_enabled_cohorts is the table the Settings
-- checklist (Plane 4) reads and writes directly.

create table cohort_definitions (
  cohort_key text primary key,
  label text not null,
  funnel_stages jsonb not null default '[]',
  intent_score_weights jsonb not null default '{}',
  terminal_metric text not null,
  terminal_metric_direction text not null check (terminal_metric_direction in ('lower_is_better','higher_is_better')),
  required_metric_block text not null,
  schema_version text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table client_enabled_cohorts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  cohort_key text not null references cohort_definitions(cohort_key),
  enabled boolean not null default true,
  priority int not null default 100,
  is_primary boolean not null default false,
  cohort_config jsonb not null default '{}',
  kpi_targets jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, cohort_key)
);

-- ============ migrations/20260706000300_analysis_runs.sql ============
-- METRIX IAP — Migration 0003: Analysis runs (Blueprint v2.0 §11.2 + §6.4)
-- analysis_run_cohorts is the per-run cohort snapshot: because
-- client_enabled_cohorts is reconfigurable, every run records which cohorts
-- were active for that run, so historical runs stay interpretable after a
-- client's business model changes.

create table analysis_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  triggered_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','running','complete','failed')),
  engine_version text not null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table analysis_run_cohorts (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  cohort_key text not null references cohort_definitions(cohort_key),
  was_enabled boolean not null default true,
  cohort_config_snapshot jsonb not null default '{}',
  created_at timestamptz default now(),
  unique (analysis_run_id, cohort_key)
);

create table analysis_run_inputs (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  input_type text not null check (input_type in (
    'upload','client_context','creative_asset','landing_page',
    'strategy_note','prior_report','api_snapshot'
  )),
  source_table text,
  source_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

create table analysis_run_stages (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  prompt_name text not null,
  prompt_version text not null,
  skill_name text,
  skill_version text,
  engine_version text not null,
  input_schema_version text not null,
  output_schema_version text not null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','running','complete','failed'))
);

-- ============ migrations/20260706000400_outputs.sql ============
-- METRIX IAP — Migration 0004: Outputs (Blueprint v2.0 §11.3)
-- intelligence_cards.entity_scope enforces the BSIL budget-scope constraint
-- surface (§10.1). Each card carries a single cohort_key — cross-cohort
-- scores are never blended (§6.5).

create table intelligence_cards (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references analysis_runs(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  card_type text not null,
  card_subtype text,
  title text not null,
  summary text not null,
  evidence_json jsonb not null default '{}',
  implication_json jsonb not null default '{}',
  recommendation_json jsonb not null default '{}',
  named_factors jsonb not null default '[]',
  confidence_grade text not null check (confidence_grade in ('HIGH','MODERATE','LOW','INSUFFICIENT')),
  confidence_score numeric,
  severity text check (severity in ('info','watch','warning','critical')),
  priority int default 100,
  cohort_key text references cohort_definitions(cohort_key),
  entity_scope text check (entity_scope in ('account','campaign','ad_set','ad','creative','landing_page','cohort')),
  entity_id uuid,
  budget_scope_object text,
  payload jsonb not null default '{}',
  contract_version text not null,
  schema_version text not null,
  status text not null default 'draft' check (status in ('draft','reviewed','approved','dismissed','archived')),
  created_at timestamptz default now()
);

create table creative_briefs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id),
  brief_type text not null check (brief_type in ('matrix','general')),
  voice text check (voice in ('ugc','brand','ai_ugc')),
  asset_type text check (asset_type in ('static','video','carousel','ai_video')),
  concept_code text,
  angle_stack jsonb not null default '[]',
  target_icp jsonb not null default '{}',
  message_pillar text,
  brief_payload jsonb not null default '{}',
  contract_version text not null,
  schema_version text not null,
  status text not null default 'draft' check (status in ('draft','approved','in_production','launched','archived')),
  created_at timestamptz default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id),
  report_type text not null check (report_type in ('internal','client_facing','executive_summary')),
  title text not null,
  content_json jsonb not null default '{}',
  contract_version text not null,
  schema_version text not null,
  status text not null default 'draft' check (status in ('draft','reviewed','approved','delivered')),
  created_at timestamptz default now()
);

-- ============ migrations/20260706000500_creative_intake_alignment.sql ============
-- METRIX IAP — Migration 0005: Creative intake + alignment (Blueprint v2.0 §8.1, §8.3)
-- Depends on creative_briefs (migration 0004) via output_brief_id /
-- source_brief_id. Manual-upload intake enforces the minimum-5-assets rule
-- at the schema level. alignment_score < 80 on copy/tonality/funnel-stage
-- flags either check stage.

create table onboarding_creative_intake (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  intake_method text not null check (intake_method in ('calculated_brief','manual_upload')),
  input_sources jsonb not null default '{}',
  uploaded_asset_count int,
  status text not null default 'pending' check (status in ('pending','processing','complete','failed')),
  output_brief_id uuid references creative_briefs(id),
  created_at timestamptz default now(),
  completed_at timestamptz,
  check (intake_method <> 'manual_upload' or uploaded_asset_count >= 5)
);

create table creative_alignment_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_id text not null,
  campaign_scope_key text not null,
  source_brief_id uuid references creative_briefs(id),
  check_stage text not null check (check_stage in ('pre_publish','post_hoc_reconciliation')),
  alignment_score numeric not null,
  copy_score numeric,
  tonality_score numeric,
  funnel_stage_score numeric,
  threshold_status text not null check (threshold_status in ('pass','flagged')),
  user_bypassed boolean not null default false,
  library_updated boolean not null default false,
  resolution_notes text,
  created_at timestamptz default now()
);

-- ============ migrations/20260706000600_alerts_bsil.sql ============
-- METRIX IAP — Migration 0006: Alert rules + BSIL (Blueprint v2.0 §10.2, §10.3)
-- Two hard, schema-enforced constraints:
--   1. No-ROAS-v1 alert constraint: metric <> 'roas'. ROAS remains a full
--      reporting metric; it is never an automated alert trigger in v1.
--   2. Budget-scope constraint: bsil_suggestions bind only to campaign or
--      ad_set — never creative, copy, angle, variable, or landing_page.
-- BSIL is suggestion-only. Nothing here executes against a live account.

create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  metric text not null check (metric <> 'roas'),
  cohort_key text references cohort_definitions(cohort_key),
  threshold_config jsonb not null default '{}',
  created_at timestamptz default now()
);

create table bsil_suggestions (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references analysis_runs(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  budget_scope_object text not null check (budget_scope_object in ('campaign','ad_set')),
  entity_id uuid not null,
  scope_key text not null,
  suggestion_type text not null check (suggestion_type in ('scale','reduce','pause','hold','reallocate')),
  suggested_change jsonb not null default '{}',
  confidence_grade text not null check (confidence_grade in ('HIGH','MODERATE','LOW','INSUFFICIENT')),
  rationale_json jsonb not null default '{}',
  cohort_key text references cohort_definitions(cohort_key),
  contract_version text not null,
  schema_version text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed_manually')),
  created_at timestamptz default now()
);

-- ============ migrations/20260706000700_review_approval_learning.sql ============
-- METRIX IAP — Migration 0007: Review, approval, learning (Blueprint v2.0 §11.4)
-- learning_registry writes only occur through an approval_events row with
-- approved_for = 'learning_registry' — no analysis output feeds
-- IAP_OPTIMIZATION_LOOP without explicit human approval first.
-- Learning scope is tenant-only in v1 (client_id required, no cross-client rows).

create table review_events (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references analysis_runs(id) on delete cascade,
  object_type text not null check (object_type in ('intelligence_card','report','brief','recommendation','bsil_suggestion')),
  object_id uuid not null,
  reviewer_id uuid references auth.users(id),
  review_status text not null check (review_status in ('needs_review','reviewed','changes_requested','approved','rejected')),
  notes text,
  created_at timestamptz default now()
);

create table human_edits (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references analysis_runs(id) on delete cascade,
  object_type text not null,
  object_id uuid not null,
  editor_id uuid references auth.users(id),
  before_json jsonb,
  after_json jsonb,
  edit_reason text,
  created_at timestamptz default now()
);

create table approval_events (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references analysis_runs(id) on delete cascade,
  object_type text not null,
  object_id uuid not null,
  approver_id uuid references auth.users(id),
  approved_for text not null check (approved_for in ('internal_use','client_report','creative_brief','strategy_export','learning_registry')),
  created_at timestamptz default now()
);

create table learning_registry (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source_object_type text not null,
  source_object_id uuid not null,
  cohort_key text references cohort_definitions(cohort_key),
  learning_summary text not null,
  variable_weight_deltas jsonb not null default '{}',
  approval_event_id uuid references approval_events(id),
  contract_version text not null,
  schema_version text not null,
  created_at timestamptz default now()
);

-- ============ seed/20260706000800_seed_cohort_definitions.sql ============
-- METRIX IAP — Seed 0008: cohort_definitions (canonical registry: METRIX_Cohort_Architecture_v1.md)
-- Illustrative seed set, not a fixed taxonomy — a new business model is a new
-- row, no schema change or deployment required.
-- lead_gen and service are two distinct cohort_definitions rows that both
-- point at required_metric_block = 'service_18' (decision resolved July 6, 2026
-- — Option 2; no lead_gen_18 block exists).

insert into cohort_definitions
  (cohort_key, label, funnel_stages, intent_score_weights, terminal_metric, terminal_metric_direction, required_metric_block, schema_version)
values
  (
    'ecommerce',
    'Ecommerce',
    '["click","add_to_cart","initiate_checkout","purchase"]',
    '{"click":1,"add_to_cart":2,"initiate_checkout":5,"purchase":10}',
    'cost_per_purchase',
    'lower_is_better',
    'ecommerce_24',
    'v1.0'
  ),
  (
    'lead_gen',
    'Lead Generation',
    '["click","lead_submit","qualified","close"]',
    '{"click":1,"lead_submit":5,"qualified":8,"close":10}',
    'cost_per_qualified_lead',
    'lower_is_better',
    'service_18',
    'v1.0'
  ),
  (
    'service',
    'Service / Booking',
    '["click","inquiry","consult_booked","close"]',
    '{"click":1,"inquiry":4,"consult_booked":7,"close":10}',
    'cost_per_booking',
    'lower_is_better',
    'service_18',
    'v1.0'
  ),
  (
    'app',
    'App',
    '["click","install","activation","retained"]',
    '{"click":1,"install":3,"activation":6,"retained":10}',
    'cost_per_activation',
    'lower_is_better',
    'app_22',
    'v1.0'
  );

