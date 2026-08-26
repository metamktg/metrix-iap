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

-- Objectives set (multi-value replacement for the scalar cohort): jsonb
-- array of one-or-more cohort keys, configured only during account setup
-- (Settings → General). The analysis run consults this set to decide which
-- optional CSV column groups it assesses. The legacy `cohort` column is
-- kept in lockstep (first objective) for any not-yet-migrated reader.
alter table ad_accounts add column if not exists objectives jsonb;

-- One-time idempotent backfill: an existing single-cohort account becomes
-- an account with exactly that one objective — no re-configuration needed.
update ad_accounts
  set objectives = jsonb_build_array(cohort)
  where objectives is null and cohort is not null;

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

-- Distinguishes the two device_performance row families sharing the same
-- (account_id, device, date_start, date_end) shape: 'impression' = legacy
-- delivery-based device breakdown rows, 'conversion' = conversion-device
-- export rows (tracking_basis='conversion'). Defaults to 'impression' so
-- pre-existing rows read correctly without a backfill.
alter table device_performance add column if not exists device_kind text not null default 'impression';

alter table placement_performance add column if not exists adds_to_cart bigint;
alter table placement_performance add column if not exists checkouts_initiated bigint;
alter table placement_performance add column if not exists purchases bigint;
alter table placement_performance add column if not exists tracking_basis text;
alter table platform_performance add column if not exists adds_to_cart bigint;
alter table platform_performance add column if not exists checkouts_initiated bigint;
alter table platform_performance add column if not exists purchases bigint;
alter table platform_performance add column if not exists tracking_basis text;

-- Demographic (age/gender) breakdown never got these funnel-stage columns
-- when device/placement/platform did, even though the ecommerce CSV/Graph
-- ingestion path parses "Adds to cart" / "Checkouts initiated" / "Purchases"
-- for the demographic pivot export too — they were silently dropped into
-- extra_metrics with nothing downstream reading them. This backfills parity
-- so audience-segment analysis (e.g. "does this age band show downstream
-- intent") isn't blind to funnel data the account's own export already carries.
alter table demographic_performance add column if not exists adds_to_cart bigint;
alter table demographic_performance add column if not exists checkouts_initiated bigint;
alter table demographic_performance add column if not exists purchases bigint;
-- "Adds to cart conversion value" — a $ total some newer exports carry directly;
-- additive across rows (unlike Meta's own "Cost per add to cart", which is a
-- per-row ratio and must never be summed — the correct blended cost-per-ATC is
-- always derived client-side as spend ÷ adds_to_cart from the raw counts above).
alter table demographic_performance add column if not exists adds_to_cart_value numeric;

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
-- Regeneration RETAINS prior generated rows rather than deleting them
-- (GAP-01): ids are run-scoped, so each run's set coexists under the
-- existing unique constraints and `generation_run_id` says which run wrote
-- which. Exactly one set per kind is current — resolved on read, never by
-- destroying the alternatives. Imported rows are never touched by the engine.

alter table message_pillars add column if not exists source text not null default 'imported';
alter table message_pillars add column if not exists generation_run_id uuid;
alter table icp_profiles add column if not exists source text not null default 'imported';
alter table icp_profiles add column if not exists generation_run_id uuid;
alter table testing_hypotheses add column if not exists source text not null default 'imported';
alter table testing_hypotheses add column if not exists generation_run_id uuid;
-- Explicit pillar linkage: which message pillar this hypothesis tests.
-- Nullable — imported rows without a link stay honestly unattached.
alter table testing_hypotheses add column if not exists pillar_id text;
alter table imported_creative_briefs add column if not exists source text not null default 'imported';
alter table imported_creative_briefs add column if not exists generation_run_id uuid;

-- ── Structured signal fields (E1) ────────────────────────────────────────
-- Signal cards carry their analysis as PROSE (`title` + `rationale`), so the
-- UI can only render sentences. These columns let a producer state the parts
-- a card face actually needs — the number, what it is measured against, the
-- one-line reading, and a short headline — ALONGSIDE the prose rather than
-- instead of it: `rationale` remains the disclosure-layer body.
--
-- Every column is nullable and every one stays NULL for rows whose producer
-- does not supply it. That is deliberate. A card face with no structured
-- fields falls back to rendering `title`/`rationale` exactly as it does
-- today; nothing derives a headline or a metric by pattern-matching the
-- prose, because a headline inferred from a sentence is a fabricated one.
alter table signal_cards add column if not exists headline text;
alter table signal_cards add column if not exists metric_value text;
alter table signal_cards add column if not exists metric_context text;
alter table signal_cards add column if not exists delta_pct numeric;
alter table signal_cards add column if not exists implication text;

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

-- Widen kind to the two CSV kinds ConnectAccountDialogs/Zod/analysisEngine
-- already expect (Ad Summary, Conversion & Device) but this constraint
-- never allowed — uploading either failed the INSERT despite passing every
-- other validation layer. (Re)applied idempotently, same pattern as the
-- match_method check below.
do $$
declare cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'manual_imports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind = ANY%'
  loop
    execute format('alter table manual_imports drop constraint %I', cname);
  end loop;
  alter table manual_imports
    add constraint manual_imports_kind_check
    check (kind in (
      'performance_demo_csv',
      'performance_placement_csv',
      'performance_ad_summary_csv',
      'performance_conversion_device_csv',
      'creative_asset'
    ));
end $$;

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

-- ── Chunked large-file uploads ──────────────────────────────────────────
-- Files too large for a single request (the deployment proxy rejects big
-- bodies before Express sees them, and the single-request path's own
-- memory profile caps it at 75 MB) upload as per-chunk rows here and keep
-- manual_imports.content NULL. Chunks cascade-delete with their import.
-- Rows in status 'uploading' are in-flight sessions: excluded from every
-- listing/staging query and swept after 24h by the init endpoint.
alter table manual_imports alter column content drop not null;

do $$
declare cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'manual_imports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status = ANY%'
  loop
    execute format('alter table manual_imports drop constraint %I', cname);
  end loop;
  alter table manual_imports
    add constraint manual_imports_status_check
    check (status in ('uploading', 'staged', 'processed', 'rejected'));
end $$;

-- The authenticator role ships with statement_timeout=8s, which applies to
-- every PostgREST request — including service_role ones, since service_role
-- had no override of its own. Large bytea writes/reads (chunk upserts,
-- chunk-wise content reads, the historical 15-20s single-request inserts)
-- legitimately exceed 8s. service_role is server-only; the browser-embedded
-- anon key keeps its own 3s cap.
alter role service_role set statement_timeout = '120s';

create table if not exists manual_import_chunks (
  import_id uuid not null references manual_imports(id) on delete cascade,
  chunk_index integer not null,
  content bytea not null,
  primary key (import_id, chunk_index)
);

alter table manual_import_chunks enable row level security;
revoke all on manual_import_chunks from anon, authenticated;

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

-- Ad Summary export's creative-content columns (body text, headline, CTA
-- type, link destination/caption) — string-valued, not performance metrics,
-- so they're kept out of the numeric extra_metrics bucket. See
-- CREATIVE_METADATA_COLUMNS in iapCsvSpec.ts. Null when the account's Ad
-- Summary upload didn't carry creative columns for that ad.
alter table ad_performance add column if not exists ad_creative_metadata jsonb;

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

-- Objective coverage recorded per run (JSON-encoded string arrays, nullable):
-- objectives_assessed = configured objectives whose column groups were present;
-- objective_flags = non-blocking skip/suggestion notices. Null on legacy runs.
alter table if exists manual_analysis_runs add column if not exists objectives_assessed text;
alter table if exists manual_analysis_runs add column if not exists objective_flags text;

-- Join-coverage measured per report class at analysis time (jsonb, nullable —
-- null on legacy runs that predate coverage measurement). Shape:
-- AnalysisDataCoverage in analysisEngine.ts: { window, baseline_spend,
-- baseline_distinct_ads, threshold_pct, classes: [{ report_class,
-- rows_scoped, distinct_ads, spend, spend_coverage_pct, ad_coverage_pct,
-- aggregate_shape, below_threshold, note }] }. The degraded-data honesty
-- layer: served with analysis summaries so UI surfaces can warn and
-- downgrade signal classification on under-covered report classes.
alter table if exists manual_analysis_runs add column if not exists coverage jsonb;

-- Content hash for staged uploads (hex md5, nullable on legacy rows).
-- Staging the byte-identical file twice into the same slot while both are
-- status='staged' is always an error (analysis would double-count its rows)
-- and is rejected at upload with 409; different-bytes files per slot stay
-- legal (multi-file-per-slot covers disjoint windows), and re-staging a
-- 'processed' file for a re-run stays legal.
alter table if exists manual_imports add column if not exists content_md5 text;

-- ─────────────────────────────────────────────────────────────────────
-- Run-tagged history for analysis rollups (analysis-run scoping).
--
-- concept_performance and variable_performance were previously wiped in
-- full (delete .eq("account_id", ...) with NO date/run scoping) on every
-- manual analysis run — only the latest run's rollup ever existed in
-- storage, all history destroyed on each re-run. demographic_performance/
-- placement_performance/platform_performance/device_performance already
-- retained history implicitly (their delete is date-window-scoped, not
-- account-wide), but had no explicit run identity — a run's rows could
-- only be reconstructed by joining back through manual_analysis_runs'
-- date_start/date_end. This column makes run membership explicit and
-- uniform across all 6 rollup tables, so evidence for strategy generation
-- (and any other analysis-derived view) can be scoped to one run, several,
-- or all of them without indirecting through date arithmetic.
--
-- Existing rows get manual_analysis_run_id = null (pre-migration history
-- with no run tag, and for concept/variable_performance specifically:
-- history already destroyed by the old wipe-on-every-run behavior, not
-- recoverable). Null rows must always be included regardless of which
-- run(s) are selected — never silently dropped.
-- ─────────────────────────────────────────────────────────────────────
alter table concept_performance add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade;
alter table variable_performance add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade;
alter table demographic_performance add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade;
alter table placement_performance add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade;
alter table platform_performance add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade;
alter table device_performance add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete cascade;

create index if not exists concept_performance_run_idx on concept_performance (manual_analysis_run_id);
create index if not exists variable_performance_run_idx on variable_performance (manual_analysis_run_id);
create index if not exists demographic_performance_run_idx on demographic_performance (manual_analysis_run_id);
create index if not exists placement_performance_run_idx on placement_performance (manual_analysis_run_id);
create index if not exists platform_performance_run_idx on platform_performance (manual_analysis_run_id);
create index if not exists device_performance_run_idx on device_performance (manual_analysis_run_id);

-- Links a staged import to the manual_analysis_run that consumed it. A
-- successful run flips its consumed manual_imports rows from 'staged' to
-- 'processed' and tags them here, so an Import History panel can show
-- "which files fed which run" and offer a "restage" action (flip back to
-- 'staged', clear this column) to redrive a new run from the same files
-- without re-uploading. on delete set null (not cascade): deleting a run
-- must never delete the underlying uploaded file.
alter table manual_imports
  add column if not exists manual_analysis_run_id uuid references manual_analysis_runs(id) on delete set null;

create index if not exists manual_imports_run_idx on manual_imports (manual_analysis_run_id);

-- concept_performance/variable_performance's old unique keys had no run
-- component — that was safe only because the full-account wipe above
-- guaranteed at most one row per key at any time. Now that the wipe is
-- removed (analysisEngine.ts), the same concept/variable recurring across
-- multiple retained runs would collide on insert without widening the
-- key to include the run. Idempotent drop-by-lookup, matching the
-- match_method_check pattern above (~L682-697) rather than hardcoding a
-- constraint name that may differ across environments.
do $$
declare cname text;
begin
  for cname in
    select conname from pg_constraint
    where conrelid = 'concept_performance'::regclass and contype = 'u'
  loop
    execute format('alter table concept_performance drop constraint %I', cname);
  end loop;
  alter table concept_performance
    add constraint concept_performance_account_book_concept_run_key
    unique (account_id, book, concept, manual_analysis_run_id);
end $$;

do $$
declare cname text;
begin
  for cname in
    select conname from pg_constraint
    where conrelid = 'variable_performance'::regclass and contype = 'u'
  loop
    execute format('alter table variable_performance drop constraint %I', cname);
  end loop;
  alter table variable_performance
    add constraint variable_performance_account_family_id_type_run_key
    unique (account_id, variable_family, variable_id, result_type, manual_analysis_run_id);
end $$;

-- Multi-run / all-time provenance for strategy generation (replaces the
-- never-actually-created source_analysis_run_id reference in
-- generationEngine.ts — that column was never added to this schema, so
-- selecting any specific run in the old picker made the generation_runs
-- insert fail outright with an undefined-column error). New columns
-- instead of repurposing anything, since the shape is now plural.
alter table generation_runs add column if not exists source_analysis_run_ids jsonb;
alter table generation_runs add column if not exists source_analysis_all_time boolean not null default false;

-- Per-item progress for multi-item runs (deconstruct backfills): done/total
-- updated after each item commits. Null total = single-shot run (no meter).
alter table generation_runs add column if not exists progress_done integer not null default 0;
alter table generation_runs add column if not exists progress_total integer;

-- Real pipeline progress for strategy / briefs runs (Task 616).
-- progress_pct: 0–100 updated at each engine phase; 0 = just started, 100 = complete.
-- progress_stage: human-readable label for the current phase (e.g. "Calling strategy model…").
alter table generation_runs add column if not exists progress_pct integer not null default 0;
alter table generation_runs add column if not exists progress_stage text not null default '';

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
    'cell_creative_overrides', 'manual_import_chunks',
    'import_metric_reconciliation', 'creative_deconstructions'
  ];
begin
  foreach t in array importer_tables loop
    execute format('alter table if exists public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Creative deconstruction (Task: deconstruct uploaded creatives) ─────
-- One row per (account, manual creative_asset import): the LLM classification
-- of the uploaded creative against the IAP variable registry. Statuses:
--   unsupported   — video/non-image file; never sent to the model
--   auto_filed    — overall confidence ≥ gate; filed into library_cells
--   needs_review  — below gate; sits in the review queue
--   user_overridden — user explicitly bypassed the gate (or accepted after
--                     edits) and the entry was filed into library_cells
--   discarded     — user rejected the classification; nothing filed
-- Re-deconstructing the same import replaces its row (unique constraint)
-- and its derived library_cells rows — never duplicates.
create table if not exists creative_deconstructions (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references ad_accounts(id),
  manual_import_id uuid not null references manual_imports(id) on delete cascade,
  generation_run_id uuid,
  filename text not null,
  ad_names text[] not null default '{}',
  status text not null check (status in ('unsupported', 'auto_filed', 'needs_review', 'user_overridden', 'discarded')),
  variables jsonb not null default '[]',      -- [{family, code, confidence, evidence?, user_edited?}]
  overall_confidence numeric,                 -- 0..1; null for unsupported
  detected_copy jsonb,                        -- {primary_message?, secondary_message?, cta?, visual_system?}
  brief_ref text,                             -- linked brief_id when the mapped ad traces to a brief
  brief_variables jsonb,                      -- intended variables from the linked brief; null when brief-less
  cell_id text,                               -- library cell id once filed
  overridden_by text,                         -- who bypassed the confidence gate
  overridden_at timestamptz,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, manual_import_id)
);

create index if not exists creative_deconstructions_account_idx
  on creative_deconstructions (account_id, status);

-- Allow the 'deconstruct' generation kind (constraint predates it).
do $$
begin
  alter table generation_runs drop constraint if exists generation_runs_kind_check;
  alter table generation_runs
    add constraint generation_runs_kind_check
    check (kind in ('strategy', 'briefs', 'deconstruct'));
end $$;

-- RLS for the new table (importer_tables list above predates it; keep the
-- table service-role-only like every other importer table).
alter table if exists creative_deconstructions enable row level security;
revoke all on creative_deconstructions from anon, authenticated;

-- Atomic per-import replacement of a creative deconstruction and its derived
-- library filing. Everything runs in ONE transaction: upsert the
-- classification (unique on account_id + manual_import_id), swap the derived
-- library_cells row(s), and stamp cell_id — so a failure at any point rolls
-- the whole replacement back and the prior successful result survives.
create or replace function metrix_replace_deconstruction_filing(
  p_account_id text,
  p_import_id uuid,
  p_classification jsonb,
  p_cell_id text,
  p_library_row jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row creative_deconstructions;
  v_next_index integer;
begin
  insert into creative_deconstructions (
    account_id, manual_import_id, generation_run_id, filename, ad_names, model,
    status, variables, overall_confidence, detected_copy, brief_ref,
    brief_variables, cell_id, overridden_by, overridden_at, updated_at
  ) values (
    p_account_id,
    p_import_id,
    (p_classification->>'generation_run_id')::uuid,
    p_classification->>'filename',
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(p_classification->'ad_names', '[]'::jsonb)) x),
      '{}'::text[]
    ),
    p_classification->>'model',
    p_classification->>'status',
    coalesce(p_classification->'variables', '[]'::jsonb),
    (p_classification->>'overall_confidence')::numeric,
    p_classification->'detected_copy',
    p_classification->>'brief_ref',
    p_classification->'brief_variables',
    p_cell_id,
    p_classification->>'overridden_by',
    (p_classification->>'overridden_at')::timestamptz,
    now()
  )
  on conflict (account_id, manual_import_id) do update set
    generation_run_id  = excluded.generation_run_id,
    filename           = excluded.filename,
    ad_names           = excluded.ad_names,
    model              = excluded.model,
    status             = excluded.status,
    variables          = excluded.variables,
    overall_confidence = excluded.overall_confidence,
    detected_copy      = excluded.detected_copy,
    brief_ref          = excluded.brief_ref,
    brief_variables    = excluded.brief_variables,
    cell_id            = excluded.cell_id,
    overridden_by      = excluded.overridden_by,
    overridden_at      = excluded.overridden_at,
    updated_at         = now()
  returning * into v_row;

  delete from library_cells
   where account_id = p_account_id
     and payload->>'deconstruction_of' = p_import_id::text;

  if p_library_row is not null then
    select coalesce(max(row_index), -1) + 1 into v_next_index
      from library_cells where account_id = p_account_id;
    insert into library_cells (
      account_id, cell_id, concept_id, asset_filename,
      qa_mapping_status, mapping_confidence, row_index, payload
    ) values (
      p_account_id,
      p_library_row->>'cell_id',
      p_library_row->>'concept_id',
      p_library_row->>'asset_filename',
      p_library_row->>'qa_mapping_status',
      p_library_row->>'mapping_confidence',
      v_next_index,
      jsonb_set(coalesce(p_library_row->'payload', '{}'::jsonb), '{deconstruction_id}', to_jsonb(v_row.id::text))
    );
    update creative_deconstructions set cell_id = p_cell_id, updated_at = now()
      where id = v_row.id;
    v_row.cell_id := p_cell_id;
  end if;

  return to_jsonb(v_row);
end;
$fn$;

revoke all on function metrix_replace_deconstruction_filing(text, uuid, jsonb, text, jsonb)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Foreign-key index coverage (live-DB audit, 2026-08-25)
--
-- A production audit of the live project found 42 single-column foreign
-- keys with no supporting index. Postgres does NOT create one for a FK
-- automatically, and an unindexed FK costs twice: every lookup by that
-- column seq-scans, and every DELETE on the PARENT must scan the whole
-- child table to enforce the constraint (taking a lock while it does).
--
-- The most consequential omission: ad_performance is the only run-scoped
-- rollup WITHOUT a manual_analysis_run_id index. Its six siblings all got
-- one in the run-tagging block above (~L902-907) and ad_performance was
-- missed — despite being the largest of them (9,647 rows live, roughly 2x
-- the next biggest) and the one the engine deletes run-scoped on every
-- re-ingestion. The idempotent-rebuild path (delete-adjacent-to-insert,
-- scoped per run/window) was doing that against no index at all.
--
-- Everything below is `create index if not exists` — additive, idempotent,
-- safe to re-run, and consistent with this file's contract.
-- ─────────────────────────────────────────────────────────────────────

create index if not exists ad_performance_run_idx
  on ad_performance (manual_analysis_run_id);

-- Per-account lookups the seed assembly performs on every seed build.
create index if not exists data_quality_flags_account_idx
  on data_quality_flags (account_id);
create index if not exists signal_cards_account_idx
  on signal_cards (account_id);
create index if not exists ad_traffic_quality_account_idx
  on ad_traffic_quality (account_id);
create index if not exists failure_patterns_account_idx
  on failure_patterns (account_id);
create index if not exists import_metric_reconciliation_account_idx
  on import_metric_reconciliation (account_id);

-- creative_deconstructions.manual_import_id: parent manual_imports rows are
-- deleted routinely (staging cleanup, retention); without this every such
-- delete scans creative_deconstructions to enforce the FK.
create index if not exists creative_deconstructions_import_idx
  on creative_deconstructions (manual_import_id);

-- ─────────────────────────────────────────────────────────────────────
-- content_md5 backfill (live-DB audit, 2026-08-25)
--
-- content_md5 was added with the BUG-09 same-bytes staging guard but never
-- backfilled, so 172 of 185 existing rows (93%) carried NULL. The guard
-- compares an incoming file's md5 against currently-staged rows via an
-- equality filter — and `= NULL` never matches, so for those rows the guard
-- was silently inert. The live audit found 25 groups of byte-identical files
-- staged into the same slot that the guard should have rejected with a 409,
-- three of them performance exports (the kind that double-count spend; the
-- BUG-19 parse-time cross-file dedupe is what actually caught those, which is
-- the second layer doing the first layer's job).
--
-- Postgres md5(bytea) is byte-for-byte identical to the app's
-- createHash("md5").update(content).digest("hex") over the same decoded
-- bytes. Verified against all 13 rows that already had an app-written value
-- (11 inline + 2 chunked): 13/13 exact match, 0 mismatches — checked BEFORE
-- writing anything, because a wrong backfill is worse than a NULL one (it
-- would 409-reject legitimate uploads).
--
-- Chunked uploads keep content NULL and store bytes in manual_import_chunks;
-- their hash is taken over the chunks reassembled in chunk_index order, which
-- is exactly what the complete-step hashes.
--
-- Idempotent: both statements are no-ops once content_md5 is populated.
-- ─────────────────────────────────────────────────────────────────────

update manual_imports mi
   set content_md5 = md5(mi.content)
 where mi.content_md5 is null
   and mi.content is not null;

update manual_imports mi
   set content_md5 = a.asm_md5
  from (
    select c.import_id,
           md5(string_agg(c.content, ''::bytea order by c.chunk_index)) as asm_md5
      from manual_import_chunks c
     group by c.import_id
  ) a
 where a.import_id = mi.id
   and mi.content_md5 is null
   and mi.content is null;

-- ─────────────────────────────────────────────────────────────────────
-- BUG-39 — run liveness heartbeat
--
-- A dead 'running' row is reclaimed (flipped to error, its partial
-- outputs deleted) once it has been running longer than STALE_RUN_MS.
-- That staleness was measured from `started_at`, which never advances,
-- so the rule really said "any run older than 10 minutes is dead" —
-- including one still legitimately working. The longest phase of a
-- generation run is a single model call that writes no progress for
-- minutes at a time, and a large analysis run can spend just as long
-- inside one parse, so the two engines cannot signal liveness through
-- their existing phase writes alone.
--
-- `heartbeat_at` is touched every 30s for as long as the run is alive
-- (see lib/runHeartbeat.ts). The ticker dies with the process, so a
-- genuinely dead run stops heartbeating and is reclaimed exactly as
-- before; a slow-but-alive run is not. NULL on rows written before
-- this column existed — readers fall back to `started_at`, i.e. the
-- old behaviour, which is correct for runs that are long since over.
-- ─────────────────────────────────────────────────────────────────────

alter table if exists generation_runs      add column if not exists heartbeat_at timestamptz;
alter table if exists manual_analysis_runs add column if not exists heartbeat_at timestamptz;
