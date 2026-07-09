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
