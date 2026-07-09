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
