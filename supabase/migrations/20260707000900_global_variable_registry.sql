-- METRIX IAP — Migration 0009: Global variable registry (closes Blueprint v2.0 §11.2 / §16 gap)
-- Source: VARIABLES_REGISTRY (Google Doc, live canonical source, last modified within the hour
-- this migration was built), cross-verified against Master Concept Variable Table.xlsx and
-- Master Angle Variable Table.xlsx (identical content, confirms no drift between sources).
--
-- Config-as-data, same pattern as cohort_definitions (Migration 0002): a new variable code is a
-- new row, never a schema change. variable_code is global and immutable across all clients —
-- this is distinct from client-local library codes (which live in per-client tables, not here).
--
-- Deprecation handling: rows are never deleted. A deprecated code gets status = 'deprecated' and
-- superseded_by pointing at its replacement, so historical creative tagged with the old code
-- stays resolvable. Confirmed real case: PR_SocialProof -> PR_MassProof (effective 2025-11-08).

create table global_variable_registry (
  variable_code text primary key,
  variable_family text not null check (variable_family in ('CN','FW','TN','ST','AW','HP','PR','HK','CTA')),
  label text not null,
  definition text not null,
  strategic_role text,
  -- true only for the four required-in-every-stack families: CN, FW, TN, HK (VARIABLES_REGISTRY,
  -- "Required Variables" section). ST/AW/HP/PR/CTA are optional, situational additions.
  is_required_in_stack boolean not null default false,
  typical_pairings jsonb not null default '[]',
  -- populated for angle variables (FW/TN/ST/AW/HP/PR/HK/CTA): which CN_ codes this pairs with.
  best_for_concepts jsonb not null default '[]',
  -- CN_-only fields. Empty array for every non-CN row.
  common_elements jsonb not null default '[]',
  typical_formats jsonb not null default '[]',
  best_funnel_stage jsonb not null default '[]',
  -- angle-variable-only field. Empty array for CN_ rows.
  performance_indicators jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'deprecated')),
  superseded_by text references global_variable_registry(variable_code),
  deprecation_note text,
  effective_date date not null default current_date,
  schema_version text not null default 'v1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (variable_code like variable_family || '_%'),
  check (status = 'active' or superseded_by is not null)
);

create index idx_global_variable_registry_family on global_variable_registry(variable_family);
create index idx_global_variable_registry_status on global_variable_registry(status);
