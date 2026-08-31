-- Stable, account-scoped mapping from Meta's exported Image name / Video name
-- to the manually uploaded creative Metrix deconstructed.

create table if not exists public.creative_asset_mappings (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.ad_accounts(id),
  media_type text not null check (media_type in ('image', 'video')),
  meta_asset_name text not null check (length(trim(meta_asset_name)) > 0),
  normalized_meta_asset_name text not null check (length(normalized_meta_asset_name) > 0),
  manual_import_id uuid not null references public.manual_imports(id) on delete restrict,
  match_method text not null check (match_method in ('filename_exact', 'filename_tolerant', 'manual')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  corrected_at timestamptz,
  corrected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, media_type, normalized_meta_asset_name)
);

create index if not exists creative_asset_mappings_import_idx
  on public.creative_asset_mappings (manual_import_id);

create table if not exists public.ad_instances (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.ad_accounts(id),
  meta_ad_id text not null check (length(trim(meta_ad_id)) > 0),
  ad_name text not null,
  image_name text,
  video_name text,
  creative_asset_mapping_id uuid references public.creative_asset_mappings(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (account_id, meta_ad_id)
);

create index if not exists ad_instances_mapping_idx
  on public.ad_instances (account_id, creative_asset_mapping_id);

alter table public.ads add column if not exists image_name text;
alter table public.ads add column if not exists video_name text;
alter table public.ads add column if not exists creative_asset_mapping_id uuid
  references public.creative_asset_mappings(id) on delete set null;

alter table public.ad_performance add column if not exists meta_ad_id text;
alter table public.ad_performance add column if not exists image_name text;
alter table public.ad_performance add column if not exists video_name text;
alter table public.ad_performance add column if not exists creative_asset_mapping_id uuid
  references public.creative_asset_mappings(id) on delete set null;

create index if not exists ad_performance_meta_ad_idx
  on public.ad_performance (account_id, meta_ad_id);
create index if not exists ad_performance_asset_mapping_idx
  on public.ad_performance (account_id, creative_asset_mapping_id);

alter table public.creative_asset_mappings enable row level security;
alter table public.ad_instances enable row level security;
revoke all on public.creative_asset_mappings from anon, authenticated;
revoke all on public.ad_instances from anon, authenticated;

-- Legacy rows do not contain authoritative Meta Image name / Video name
-- values, so this migration deliberately performs no filename inference.
-- New report imports populate the columns and first-map resolver safely.