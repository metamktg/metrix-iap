-- METRIX IAP — Migration 0001: Identity and access (Blueprint v2.0 §11.1)
-- org_members = organization-level membership; client_memberships = the single
-- source of truth for client-level visibility. Never both (§11.1, non-negotiable).

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  created_at timestamptz default now(),
  unique (org_id, user_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  client_code text not null unique,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table client_memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('owner','operator','client_viewer')),
  created_at timestamptz default now(),
  unique (client_id, user_id)
);
