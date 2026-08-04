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

-- Idempotent backfill for databases created before cohort existed. Business-
-- model cohort (docs/data-model/METRIX_Cohort_Architecture_v1.md); null until
-- the agency sets it via PATCH /metrix/accounts/:id/cohort. This column was
-- previously written to by that route without ever being defined here —
-- the route would fail at runtime until this backfill exists.
alter table ad_accounts add column if not exists cohort text
  check (cohort in ('ecommerce', 'lead_gen', 'service', 'app'));

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
  manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade,
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

-- ── Conversion-based tracking columns (July 2026 Meta export change) ──
-- Meta's device breakdown switched from impression-based delivery
-- reporting to conversion-based tracking: device/platform/placement rows
-- can now carry funnel actions (link clicks, adds to cart, checkouts
-- initiated, purchases) with NO spend/impressions — delivery metrics are
-- not device-attributable under conversion tracking. tracking_basis
-- distinguishes row semantics: 'delivery' = legacy impression-based rows
-- (spend/impressions per segment), 'conversion' = conversion-based rows
-- (funnel actions per conversion device/placement/platform). NULL is
-- read as 'delivery' (all pre-change rows).
alter table device_performance add column if not exists link_clicks bigint;
alter table device_performance add column if not exists adds_to_cart bigint;
alter table device_performance add column if not exists checkouts_initiated bigint;
alter table device_performance add column if not exists purchases bigint;
alter table device_performance add column if not exists tracking_basis text;
alter table placement_performance add column if not exists adds_to_cart bigint;
alter table placement_performance add column if not exists checkouts_initiated bigint;
alter table placement_performance add column if not exists purchases bigint;
alter table placement_performance add column if not exists tracking_basis text;
alter table platform_performance add column if not exists adds_to_cart bigint;
alter table platform_performance add column if not exists checkouts_initiated bigint;
alter table platform_performance add column if not exists purchases bigint;
alter table platform_performance add column if not exists tracking_basis text;

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

-- LittleData (single-book DTC account) has no book dimension on concepts;
-- book stays NULL for its rows. Idempotent: drop not null is a no-op if
-- already nullable.
alter table concept_performance alter column book drop not null;

-- Stage 2 Analysis Core fields — added after initial table creation.
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op when already present.
alter table concept_performance add column if not exists buying_intent_score numeric;
alter table concept_performance add column if not exists performance_lift_vs_baseline text;
alter table concept_performance add column if not exists performance_tier text;
alter table concept_performance add column if not exists confidence_level text;

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

-- Same LittleData single-book relaxation as concept_performance.
alter table concept_intelligence alter column book drop not null;

-- Human-readable descriptor for this concept (e.g. "Authority · Static × Checkout Depth").
-- Nullable: the seed assembly derives a descriptor from existing fields when absent.
-- Per-account override: a non-null value here takes precedence over the global derivation.
alter table concept_intelligence add column if not exists concept_descriptor text;

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

-- ── In-app generation (strategy from analysis, briefs from strategy) ──
-- Provenance: importer rows keep source='imported'; rows written by the
-- in-app Metrix generation engine carry source='generated' plus the run id.
-- Regeneration replaces only prior generated rows — imported rows are
-- never touched by the engine.

alter table message_pillars add column if not exists source text not null default 'imported';
alter table message_pillars add column if not exists generation_run_id uuid;
alter table testing_hypotheses add column if not exists source text not null default 'imported';
alter table testing_hypotheses add column if not exists generation_run_id uuid;
-- Explicit pillar linkage: which message pillar this hypothesis tests.
-- Nullable — imported rows without a link stay honestly unattached.
alter table testing_hypotheses add column if not exists pillar_id text;
alter table imported_creative_briefs add column if not exists source text not null default 'imported';
alter table imported_creative_briefs add column if not exists generation_run_id uuid;

-- One row per in-app generation attempt. Inserted as 'running'; flips to
-- 'success' only after every output row has committed (report-pull
-- pattern — no dishonest success states). Failures delete partial output
-- rows and record the error. Runs stuck 'running' past a staleness cutoff
-- are treated as errors (in-process jobs die with the server).
create table if not exists generation_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references ad_accounts(id),
  kind text not null check (kind in ('strategy', 'briefs')),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  error_message text,
  model text,
  created_by text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists generation_runs_account_idx on generation_runs (account_id, kind, started_at desc);

-- At most one running run per account+kind: closes the read-then-insert
-- race between simultaneous generate POSTs (insert fails 23505 → 409).
create unique index if not exists generation_runs_one_running
  on generation_runs (account_id, kind) where status = 'running';

-- Staged raw manual-upload files (July 2026 rework): two required CSVs
-- matching the exact IAP_DEMOGRAPHIC_TEXT_SIGNAL / IAP_DEVICE_PLACEMENT_
-- PLATFORM_SIGNAL Meta pivot export templates (same classes the live Meta
-- OAuth report pulls use — see iapCsvSpec.ts), plus individually-staged
-- creative asset files (never a ZIP). Content is stored raw; nothing is
-- parsed into performance data at upload time. `ad_names` holds the
-- user-edited ad-name mapping for creative_asset rows (multiple names
-- allowed per creative).
create table if not exists manual_imports (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references ad_accounts(id),
  kind text not null check (kind in ('performance_demo_csv', 'performance_placement_csv', 'creative_asset')),
  filename text not null,
  content_type text,
  content bytea not null,
  size_bytes integer not null,
  ad_names text[] not null default '{}',
  uploaded_by_user_id integer,
  uploaded_by_email text,
  status text not null default 'staged' check (status in ('staged', 'processed', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists manual_imports_account_kind_idx on manual_imports (account_id, kind);

-- Idempotent backfill for databases created before this rework.
alter table manual_imports add column if not exists content_type text;
alter table manual_imports add column if not exists ad_names text[] not null default '{}';

-- Persists how the ad-name mapping was auto-suggested at stage time (id
-- code, confident filename similarity "fuzzy", or low-confidence closest
-- "guess") so the "Matched by…" badge survives reload instead of only
-- living in client component state. Cleared whenever the mapping is
-- overridden (dropdown or free-text), so it never lies about a
-- manually-picked mapping.
alter table manual_imports add column if not exists match_method text;

-- Persists the CSV column-mapping report produced at upload time so the
-- CsvMappingPanel can be re-hydrated from the GET /manual-imports response
-- on any subsequent visit (dialog re-open, page refresh) without requiring
-- the user to re-upload. Only present for performance_demo_csv and
-- performance_placement_csv kinds; null for creative_asset rows.
alter table manual_imports add column if not exists mapping_summary jsonb;

-- (Re)apply the check idempotently. `add column if not exists` above won't
-- widen a pre-existing id/fuzzy-only constraint, so drop any existing
-- match_method check and re-add the current allowed set. This lets the new
-- low-confidence "guess" tier persist on DBs provisioned before it existed.
do $$
declare cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'manual_imports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%match_method%'
  loop
    execute format('alter table manual_imports drop constraint %I', cname);
  end loop;
  alter table manual_imports
    add constraint manual_imports_match_method_check
    check (match_method in ('id', 'fuzzy', 'guess'));
end $$;

-- Column mapping summary for performance CSV uploads. Stored at upload time
-- so the "Run analysis" step can surface any missing/low-confidence columns
-- without re-parsing the raw file. Null for creative_asset imports.
alter table manual_imports add column if not exists mapping_summary jsonb;

-- Generic bucket for Ecommerce/Service/App-specific metrics observed in a
-- manual CSV upload. Keyed by slugified Meta column name; absent metrics
-- are simply missing keys — never fabricated as 0/null.
alter table ad_performance add column if not exists extra_metrics jsonb;
alter table demographic_performance add column if not exists extra_metrics jsonb;
alter table placement_performance add column if not exists extra_metrics jsonb;
alter table platform_performance add column if not exists extra_metrics jsonb;
alter table device_performance add column if not exists extra_metrics jsonb;

-- Manual-upload analysis runs (July 2026): parses staged manual_imports
-- performance CSVs into ad_performance rows for a MANUALLY selected date
-- window. Never triggered automatically by an upload — only by an explicit
-- POST from the user. Mirrors the generation_runs honesty pattern: insert
-- 'running', flip to 'success' only after all rows commit; failures delete
-- partial ad_performance rows for the run and record 'error'.
create table if not exists manual_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references ad_accounts(id),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  date_range text not null check (date_range in ('7d', '14d', '30d', 'all')),
  date_start date,
  date_end date,
  rows_ingested integer,
  imports_used integer,
  error_message text,
  created_by text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists manual_analysis_runs_account_idx
  on manual_analysis_runs (account_id, started_at desc);

create unique index if not exists manual_analysis_runs_one_running
  on manual_analysis_runs (account_id) where status = 'running';

-- CSV column warnings from tolerant parsing (JSON-encoded string array, nullable).
alter table if exists manual_analysis_runs add column if not exists csv_warnings text;

-- Real-time per-stage progress tracking for in-flight runs.
-- progress_pct: 0–100 updated at each pipeline stage; 0 = idle/just started, 100 = complete.
-- progress_stage: human-readable label for the active stage ("Parsing demographics export", etc.).
alter table if exists manual_analysis_runs add column if not exists progress_pct integer not null default 0;
alter table if exists manual_analysis_runs add column if not exists progress_stage text not null default '';

-- ─────────────────────────────────────────────────────────────────────
-- Cell-level creative overrides (July 2026).
--
-- Stores a directly-uploaded creative asset keyed to a specific IAP cell
-- (e.g. "C2B"), bypassing the ad-name matching flow. One row per
-- (account_id, cell_id) pair — upsert on conflict replaces the asset.
-- The seed assembly injects a servable URL for every override so the
-- Library shows the uploaded image/video immediately after upload.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists cell_creative_overrides (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references ad_accounts(id),
  cell_id text not null,
  asset_bytes bytea not null,
  content_type text not null,
  filename text not null default '',
  uploaded_at timestamptz not null default now(),
  constraint cell_creative_overrides_account_cell_unique unique (account_id, cell_id)
);

create index if not exists cell_creative_overrides_account_idx
  on cell_creative_overrides (account_id);

-- Cross-checks the two required manual CSVs against each other for the
-- same run: the demographic export and the device/placement export are
-- both pivot slices of the SAME underlying campaign performance, so their
-- account-level spend/results totals for the scoped window should match.
-- A mismatch flags a real data-integrity problem (mismatched date ranges,
-- partial exports, wrong file uploaded) rather than silently rendering
-- two internally-inconsistent halves of the same account.
create table if not exists import_metric_reconciliation (
  id uuid primary key default gen_random_uuid(),
  manual_analysis_run_id uuid not null references manual_analysis_runs(id) on delete cascade,
  account_id text not null references ad_accounts(id),
  metric_key text not null check (metric_key in ('spend', 'results')),
  demographic_total numeric,
  placement_total numeric,
  delta_pct numeric,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists import_metric_reconciliation_run_idx
  on import_metric_reconciliation (manual_analysis_run_id);

-- ─────────────────────────────────────────────────────────────────────
-- Row Level Security (platform integrity).
--
-- Every table in this importer schema holds either real ad-performance data
-- or request-access PII (names, emails, phone numbers). They are ONLY ever
-- reached by the API server using the Supabase SERVICE_ROLE key (which has
-- BYPASSRLS) — the app frontends never talk to Supabase directly. The
-- browser-exposed anon / publishable key must therefore never be able to
-- read a single row.
--
-- Enabling RLS with NO policies denies every non-BYPASSRLS role (anon,
-- authenticated) by default, and REVOKE strips the default PostgREST grants
-- so those roles get a hard "permission denied" rather than a silent empty
-- result. service_role and the direct superuser importer connection are
-- unaffected. Idempotent — safe to re-run on every import.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  importer_tables text[] := array[
    'ad_accounts', 'ads', 'iap_runs', 'ad_performance', 'demographic_performance',
    'placement_performance', 'platform_performance', 'device_performance',
    'concept_performance', 'campaign_windows', 'data_quality_flags',
    'concept_intelligence', 'ad_traffic_quality', 'failure_patterns',
    'icp_profiles', 'message_pillars', 'variable_combinations', 'testing_hypotheses',
    'imported_creative_briefs', 'library_cells', 'library_cell_performance',
    'variable_performance', 'demographic_signal', 'placement_signal', 'copy_library',
    'variable_registry', 'signal_cards', 'account_modules', 'app_config',
    'request_access', 'meta_oauth_pending', 'connected_ad_accounts', 'report_pulls',
    'report_rows', 'generation_runs', 'manual_imports', 'manual_analysis_runs',
    'cell_creative_overrides',
    'import_metric_reconciliation'
  ];
begin
  foreach t in array importer_tables loop
    execute format('alter table if exists public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
