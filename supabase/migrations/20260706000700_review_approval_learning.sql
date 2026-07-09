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
