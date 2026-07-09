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
