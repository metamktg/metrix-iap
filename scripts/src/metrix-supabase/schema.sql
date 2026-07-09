-- ═══════════════════════════════════════════════════════════════════════
-- Metrix IAP — Supabase schema
-- Normalized, date-stamped tables for IAP loop outputs per ad account.
-- Idempotent: CREATE TABLE IF NOT EXISTS throughout. Executed by the
-- importer (scripts/src/metrix-supabase/import.ts) over SUPABASE_DB_URL.
-- Designed so tenant/account-level RLS can be layered on later (every
-- data table carries account_id).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Core registry ─────────────────────────────────────────────────────

create table if not exists ad_accounts (
  id text primary key,
  name text not null,
  status text not null default 'unconfigured',
  platform text,
  source_status text,
  facebook_page_dp_url text,
  overview_state jsonb,
  -- Numeric Meta ad account id (no "act_" prefix) for Ads Manager deep
  -- links. Nullable until a raw Meta export supplies it.
  meta_ad_account_id text,
  created_at timestamptz not null default now()
);

-- Idempotent backfill for databases created before meta_ad_account_id existed.
alter table ad_accounts add column if not exists meta_ad_account_id text;

-- Ad-level registry. `meta_ad_id` and `creative_asset_url` are nullable by
-- design: no Meta ad_id exists anywhere in the current package (only
-- ad_name), and asset_path values are non-servable local paths. When real
-- Meta exports arrive, filling these columns is a data change, not a schema
-- change (Part B of the brief).
create table if not exists ads (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  ad_name text not null,
  book text,
  cell text,
  concept text,
  variation text,
  test_id text,
  meta_ad_id text,               -- known gap: not present in any source file
  creative_asset_url text,       -- nullable until a servable asset URL exists
  asset_filename text,
  asset_path text,               -- non-servable local path from the source run
  asset_servable boolean not null default false,
  unique (account_id, ad_name)
);

-- ── IAP loop run bookkeeping (which stages have real data) ────────────

create table if not exists iap_runs (
  account_id text not null references ad_accounts(id),
  stage text not null,           -- bundle_prep | analysis_core | strategy_map | brief_builder | creative_scan | optimization_loop
  status text not null,          -- complete | pending
  window_start date,
  window_end date,
  generated_at timestamptz,
  source_file text,
  note text,
  primary key (account_id, stage)
);

-- ── Normalized performance (Bundle Prep output) — all date-stamped ────

create table if not exists ad_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  book text,
  campaign_name text,
  ad_set_name text,
  ad_name text not null,
  cell text,
  concept text,
  variation text,
  test_id text,
  result_type text not null,
  date_start date not null,
  date_end date not null,
  spend numeric,
  impressions bigint,
  reach bigint,
  clicks_all bigint,
  link_clicks bigint,
  results numeric,
  cpa numeric,
  ctr_link_pct numeric,
  cvr_link_pct numeric,
  cpm numeric,
  confidence text,
  unique (account_id, ad_name, campaign_name, result_type, date_start, date_end)
);

create table if not exists demographic_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  gender text not null,
  age text not null,
  date_start date not null,      -- stamped from the bundle window (rows carry no own dates)
  date_end date not null,
  spend numeric,
  link_clicks bigint,
  results numeric,
  cpa numeric,
  cvr_link_pct numeric,
  confidence text,
  unique (account_id, gender, age, date_start, date_end)
);

create table if not exists placement_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  placement text not null,
  date_start date not null,
  date_end date not null,
  spend numeric,
  impressions bigint,
  link_clicks bigint,
  results numeric,
  cpa numeric,
  cvr_link_pct numeric,
  confidence text,
  unique (account_id, placement, date_start, date_end)
);

create table if not exists platform_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  platform text not null,
  date_start date not null,
  date_end date not null,
  spend numeric,
  impressions bigint,
  link_clicks bigint,
  results numeric,
  cpa numeric,
  confidence text,
  unique (account_id, platform, date_start, date_end)
);

create table if not exists device_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  device text not null,
  date_start date not null,
  date_end date not null,
  spend numeric,
  impressions bigint,
  results numeric,
  cpa numeric,
  confidence text,
  unique (account_id, device, date_start, date_end)
);

create table if not exists concept_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  book text not null,
  concept text not null,
  date_start date not null,
  date_end date not null,
  spend numeric,
  link_clicks bigint,
  results numeric,
  cpa numeric,
  cvr_link_pct numeric,
  confidence text,
  mapped_in_library boolean not null default false,  -- C5/C6/C7 stay false: unmapped, not validated MST cells
  unique (account_id, book, concept)
);

create table if not exists campaign_windows (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  campaign_name text not null,
  book text,
  os text,
  date_start date,
  date_end date,
  result_type text,
  spend numeric,
  unique (account_id, campaign_name)
);

-- Honest data-gap surface: anomalies, quality flags, attribution notes.
create table if not exists data_quality_flags (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  kind text not null,            -- anomaly | quality_flag | attribution_window | data_quality_score
  payload jsonb not null
);

-- ── Analysis Core output (campaign_intelligence.json) ─────────────────

create table if not exists concept_intelligence (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  book text not null,
  concept_code text not null,
  mapped_in_library boolean not null default false,
  spend numeric,
  link_clicks bigint,
  results numeric,
  cpa numeric,
  buying_intent_score numeric,
  performance_lift_vs_baseline text,
  performance_tier text,
  confidence_level text,
  what text,
  why text,
  so_what text,
  now_what text,
  unique (account_id, book, concept_code)
);

create table if not exists ad_traffic_quality (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  book text,
  ad_name text not null,
  ctr_link_pct numeric,
  cvr_link_pct numeric,
  classification text,
  confidence text
);

create table if not exists failure_patterns (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  segment_type text,
  campaign text,
  spend numeric,
  engagement_present boolean,
  diagnosis text,
  wasted_spend numeric,
  payload jsonb
);

-- ── Strategy Map output (strategic_map.json) ──────────────────────────

create table if not exists icp_profiles (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  profile_id text not null,
  profile_name text,
  confidence_level text,
  payload jsonb not null,
  unique (account_id, profile_id)
);

create table if not exists message_pillars (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  pillar_id text not null,
  pillar_name text,
  payload jsonb not null,
  unique (account_id, pillar_id)
);

create table if not exists variable_combinations (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  combination text not null,
  context text,
  cpa numeric,
  cvr_pct numeric,
  confidence text,
  recommendation text,
  unique (account_id, combination)
);

create table if not exists testing_hypotheses (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  hypothesis_id text not null,
  statement text,
  control_ref text,
  test_variant text,
  isolated_variable text,
  sample_requirement text,
  duration text,
  success_criteria text,
  risk text,
  expected_impact text,
  failure_plan text,
  priority text,
  unique (account_id, hypothesis_id)
);

-- ── Brief Builder output (creative_briefs.json) ───────────────────────
-- NOTE: named imported_creative_briefs (renamed July 2026) — the name
-- creative_briefs belongs to the official METRIX schema (supabase/migrations).

create table if not exists imported_creative_briefs (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  brief_id text not null,
  mode text,                     -- matrix | general
  book text,
  asset_type text,
  priority text,
  confidence text,
  payload jsonb not null,        -- full brief document
  unique (account_id, brief_id)
);

-- ── Local client library (Book2 augmented JSON + copy library CSV) ────

create table if not exists library_cells (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  cell_id text not null,
  concept_id text,
  asset_filename text,
  asset_path text,               -- non-servable local path; see ads.creative_asset_url
  qa_mapping_status text,
  mapping_confidence text,
  row_index int not null,        -- preserve source ordering (cell_id repeats per variant)
  payload jsonb not null,        -- original row, verbatim
  unique (account_id, row_index)
);

create table if not exists library_cell_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  cell_id text not null,
  result_type text not null,
  date_start date,
  date_end date,
  payload jsonb not null,        -- original row, verbatim (keys like "Amount spent (USD)")
  unique (account_id, cell_id, result_type)
);

create table if not exists variable_performance (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  variable_family text not null,
  variable_id text not null,
  result_type text not null,
  date_start date,
  date_end date,
  payload jsonb not null,
  unique (account_id, variable_family, variable_id, result_type)
);

create table if not exists demographic_signal (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  cell_id text,
  ad_name text,
  age text,
  gender text,
  date_start date,
  date_end date,
  row_index int not null,
  payload jsonb not null,
  unique (account_id, row_index)
);

create table if not exists placement_signal (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  signal_scope text not null,    -- v3 | c4e
  placement text,
  platform text,
  date_start date,
  date_end date,
  row_index int not null,
  payload jsonb not null,
  unique (account_id, signal_scope, row_index)
);

create table if not exists copy_library (
  id bigint generated always as identity primary key,
  account_id text not null references ad_accounts(id),
  code text not null,
  scope text,
  copy_type text,
  copy text,
  char_count int,
  usage text,
  notes text,
  unique (account_id, code)
);

-- ── Variable registry (data-layer truth about variable families) ──────
-- ST_/AW_/CTA_ are a confirmed known gap: no registry definition backs
-- them in the client library. status='registry_missing' represents that
-- explicitly — the UI must not invent meanings for those families.
create table if not exists variable_registry (
  prefix text primary key,
  family text not null,
  status text not null,          -- active | registry_missing
  note text
);

-- ── Cards & app documents ─────────────────────────────────────────────

create table if not exists signal_cards (
  id bigint generated always as identity primary key,
  card_id text not null,
  account_id text not null references ad_accounts(id),
  surface text not null,         -- listen | manager_overview
  scope text,
  title text,
  rationale text,
  impact text,
  confidence text,
  source_path text,
  recommended_action text,
  manager_card_descriptor text,
  unique (card_id, surface)
);

-- Document-shaped loop outputs and app configuration (kept verbatim).
create table if not exists account_modules (
  account_id text not null references ad_accounts(id),
  module text not null,          -- iap_metadata | core_reanalysis_read | report_builder | mst | analysis_core_summary | scaling_playbook | app_defaults(manager)
  payload jsonb not null,
  primary key (account_id, module)
);

create table if not exists app_config (
  key text primary key,
  value jsonb not null
);

-- ── Request access (marketing site, Part D5 — table only for now) ─────

create table if not exists request_access (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  business_type text check (business_type in ('Agency', 'Consultant', 'Freelancer')),
  industry text,
  avg_monthly_ad_spend text,
  website text,
  linkedin text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create unique index if not exists request_access_email_idx on request_access (lower(email));

-- ── Helpful indexes for date-filtered reads (Part A5 groundwork) ──────
create index if not exists ad_performance_account_dates_idx on ad_performance (account_id, date_start, date_end);
create index if not exists ad_performance_result_type_idx on ad_performance (account_id, result_type);
create index if not exists concept_performance_account_idx on concept_performance (account_id, book);

-- ═══════════════════════════════════════════════════════════════════════
-- Meta ad account connection + IAP report pulls (pilot onboarding flow).
-- user_id is text: Metrix auth users live in Replit Postgres with integer
-- ids; we store them stringified here (cross-database reference, no FK).
-- access_token_encrypted is AES-256-GCM ciphertext (TOKEN_ENCRYPTION_KEY,
-- server-side only). Raw Meta responses are token-sanitized before storage.
-- ═══════════════════════════════════════════════════════════════════════

-- Staging row holding the encrypted long-lived user token between the OAuth
-- callback and the user's ad-account selection. Deleted on select/disconnect.
create table if not exists meta_oauth_pending (
  user_id text primary key,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists connected_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ad_account_id text not null,
  account_name text,
  currency text,
  timezone text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  status text not null default 'active',
  unique (user_id, ad_account_id)
);

create table if not exists report_pulls (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ad_account_id text not null,
  report_class text not null check (report_class in ('IAP_DEMOGRAPHIC_TEXT_SIGNAL', 'IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL')),
  date_range_start date not null,
  date_range_end date not null,
  raw_response jsonb,
  raw_pages jsonb,
  fetched_at timestamptz not null default now(),
  status text not null default 'success',
  error_message text,
  metric_mapping_status jsonb
);

alter table report_pulls add column if not exists metric_mapping_status jsonb;

create index if not exists report_pulls_user_account_idx on report_pulls (user_id, ad_account_id, report_class, fetched_at desc);

create table if not exists report_rows (
  id uuid primary key default gen_random_uuid(),
  report_pull_id uuid not null references report_pulls(id) on delete cascade,
  user_id text not null,
  ad_account_id text not null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  date date,
  dimensions jsonb not null,
  metrics jsonb not null,
  report_class text not null check (report_class in ('IAP_DEMOGRAPHIC_TEXT_SIGNAL', 'IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL')),
  created_at timestamptz not null default now()
);

create index if not exists report_rows_pull_idx on report_rows (report_pull_id);
create index if not exists report_rows_user_account_class_date_idx on report_rows (user_id, ad_account_id, report_class, date);
