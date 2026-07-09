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
