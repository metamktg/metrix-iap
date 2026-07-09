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
