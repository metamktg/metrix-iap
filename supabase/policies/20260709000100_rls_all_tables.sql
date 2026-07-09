-- METRIX IAP — RLS policies for all 22 official tables (Blueprint v2.0 §12,
-- Master Prompt Phase 0).
--
-- Minimum bar (Master Prompt): an authenticated client user can only
-- read/write rows scoped to client_id values they hold a client_memberships
-- row for. service_role bypasses RLS (backend jobs only — never reachable
-- from apps/web).
--
-- Conventions in this file:
--   * Idempotent: drop policy if exists / create or replace function /
--     drop trigger if exists. Safe to re-apply on every migrate run.
--   * Config-as-data tables (cohort_definitions, global_variable_registry)
--     are readable by any authenticated user, writable only by service role.
--   * Audit tables (review_events, human_edits, approval_events) are
--     append-only for authenticated users — no update/delete policies.
--   * client_viewer role is read-only; owner/operator can write.
--   * The learning_registry approval gate is a BEFORE INSERT trigger, NOT
--     just an RLS policy — service_role has BYPASSRLS, so a policy alone
--     would not bind backend jobs. The trigger binds every role.

-- ---------------------------------------------------------------------------
-- Tenancy helper functions (security definer so they can read
-- client_memberships / org_members without tripping RLS recursion).
-- ---------------------------------------------------------------------------

create or replace function public.metrix_user_is_client_member(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from client_memberships cm
    where cm.client_id = cid and cm.user_id = auth.uid()
  );
$$;

create or replace function public.metrix_user_is_client_writer(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from client_memberships cm
    where cm.client_id = cid
      and cm.user_id = auth.uid()
      and cm.role in ('owner','operator')
  );
$$;

create or replace function public.metrix_user_in_org(oid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from org_members om
    where om.org_id = oid and om.user_id = auth.uid()
  )
  or exists (
    select 1 from client_memberships cm
    where cm.org_id = oid and cm.user_id = auth.uid()
  );
$$;

create or replace function public.metrix_client_id_of_run(run_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select client_id from analysis_runs where id = run_id;
$$;

-- Lock the helpers down: only roles that go through RLS need to execute them.
revoke all on function public.metrix_user_is_client_member(uuid) from public;
revoke all on function public.metrix_user_is_client_writer(uuid) from public;
revoke all on function public.metrix_user_in_org(uuid) from public;
revoke all on function public.metrix_client_id_of_run(uuid) from public;
grant execute on function public.metrix_user_is_client_member(uuid) to authenticated, service_role;
grant execute on function public.metrix_user_is_client_writer(uuid) to authenticated, service_role;
grant execute on function public.metrix_user_in_org(uuid) to authenticated, service_role;
grant execute on function public.metrix_client_id_of_run(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS on all 22 tables. Default Supabase grants give `authenticated`
-- full DML — RLS is what actually gates access, so every table MUST have it.
-- ---------------------------------------------------------------------------

alter table organizations              enable row level security;
alter table org_members                enable row level security;
alter table clients                    enable row level security;
alter table client_memberships         enable row level security;
alter table cohort_definitions         enable row level security;
alter table client_enabled_cohorts     enable row level security;
alter table analysis_runs              enable row level security;
alter table analysis_run_cohorts       enable row level security;
alter table analysis_run_inputs        enable row level security;
alter table analysis_run_stages        enable row level security;
alter table intelligence_cards         enable row level security;
alter table creative_briefs            enable row level security;
alter table reports                    enable row level security;
alter table onboarding_creative_intake enable row level security;
alter table creative_alignment_checks  enable row level security;
alter table alert_rules                enable row level security;
alter table bsil_suggestions           enable row level security;
alter table review_events              enable row level security;
alter table human_edits                enable row level security;
alter table approval_events            enable row level security;
alter table learning_registry          enable row level security;
alter table global_variable_registry   enable row level security;

-- ---------------------------------------------------------------------------
-- Identity & access (Migration 0001)
-- ---------------------------------------------------------------------------

-- organizations: visible to org members (via org_members or any client
-- membership in the org). No authenticated writes — provisioning is backend.
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations
  for select to authenticated
  using (public.metrix_user_in_org(id));

-- org_members: a user sees their own membership rows only.
drop policy if exists org_members_select on org_members;
create policy org_members_select on org_members
  for select to authenticated
  using (user_id = auth.uid());

-- clients: visible to client members and org members. No authenticated writes.
drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select to authenticated
  using (
    public.metrix_user_is_client_member(id)
    or public.metrix_user_in_org(org_id)
  );

-- client_memberships: a user sees their own membership rows only.
-- Membership management is backend-only (service role).
drop policy if exists client_memberships_select on client_memberships;
create policy client_memberships_select on client_memberships
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Config-as-data (Migrations 0002 + 0009): global read, service-role write.
-- ---------------------------------------------------------------------------

drop policy if exists cohort_definitions_select on cohort_definitions;
create policy cohort_definitions_select on cohort_definitions
  for select to authenticated
  using (true);

drop policy if exists global_variable_registry_select on global_variable_registry;
create policy global_variable_registry_select on global_variable_registry
  for select to authenticated
  using (true);

-- client_enabled_cohorts: the Settings checklist reads/writes this directly.
drop policy if exists client_enabled_cohorts_select on client_enabled_cohorts;
create policy client_enabled_cohorts_select on client_enabled_cohorts
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists client_enabled_cohorts_write on client_enabled_cohorts;
create policy client_enabled_cohorts_write on client_enabled_cohorts
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

-- ---------------------------------------------------------------------------
-- Analysis runs (Migration 0003): client_id direct, children scope via run.
-- ---------------------------------------------------------------------------

drop policy if exists analysis_runs_select on analysis_runs;
create policy analysis_runs_select on analysis_runs
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists analysis_runs_write on analysis_runs;
create policy analysis_runs_write on analysis_runs
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

drop policy if exists analysis_run_cohorts_select on analysis_run_cohorts;
create policy analysis_run_cohorts_select on analysis_run_cohorts
  for select to authenticated
  using (public.metrix_user_is_client_member(public.metrix_client_id_of_run(analysis_run_id)));

drop policy if exists analysis_run_cohorts_write on analysis_run_cohorts;
create policy analysis_run_cohorts_write on analysis_run_cohorts
  for all to authenticated
  using (public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id)))
  with check (public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id)));

drop policy if exists analysis_run_inputs_select on analysis_run_inputs;
create policy analysis_run_inputs_select on analysis_run_inputs
  for select to authenticated
  using (public.metrix_user_is_client_member(public.metrix_client_id_of_run(analysis_run_id)));

drop policy if exists analysis_run_inputs_write on analysis_run_inputs;
create policy analysis_run_inputs_write on analysis_run_inputs
  for all to authenticated
  using (public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id)))
  with check (public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id)));

drop policy if exists analysis_run_stages_select on analysis_run_stages;
create policy analysis_run_stages_select on analysis_run_stages
  for select to authenticated
  using (public.metrix_user_is_client_member(public.metrix_client_id_of_run(analysis_run_id)));

drop policy if exists analysis_run_stages_write on analysis_run_stages;
create policy analysis_run_stages_write on analysis_run_stages
  for all to authenticated
  using (public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id)))
  with check (public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id)));

-- ---------------------------------------------------------------------------
-- Outputs (Migration 0004) + creative intake (0005): client_id direct.
-- ---------------------------------------------------------------------------

drop policy if exists intelligence_cards_select on intelligence_cards;
create policy intelligence_cards_select on intelligence_cards
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists intelligence_cards_write on intelligence_cards;
create policy intelligence_cards_write on intelligence_cards
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

drop policy if exists creative_briefs_select on creative_briefs;
create policy creative_briefs_select on creative_briefs
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists creative_briefs_write on creative_briefs;
create policy creative_briefs_write on creative_briefs
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

drop policy if exists reports_select on reports;
create policy reports_select on reports
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists reports_write on reports;
create policy reports_write on reports
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

drop policy if exists onboarding_creative_intake_select on onboarding_creative_intake;
create policy onboarding_creative_intake_select on onboarding_creative_intake
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists onboarding_creative_intake_write on onboarding_creative_intake;
create policy onboarding_creative_intake_write on onboarding_creative_intake
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

drop policy if exists creative_alignment_checks_select on creative_alignment_checks;
create policy creative_alignment_checks_select on creative_alignment_checks
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists creative_alignment_checks_write on creative_alignment_checks;
create policy creative_alignment_checks_write on creative_alignment_checks
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

-- ---------------------------------------------------------------------------
-- Alerts + BSIL (Migration 0006)
-- ---------------------------------------------------------------------------

-- alert_rules: client_id is nullable — null rows are global defaults,
-- readable by everyone authenticated, writable only by service role.
drop policy if exists alert_rules_select on alert_rules;
create policy alert_rules_select on alert_rules
  for select to authenticated
  using (client_id is null or public.metrix_user_is_client_member(client_id));

drop policy if exists alert_rules_write on alert_rules;
create policy alert_rules_write on alert_rules
  for all to authenticated
  using (client_id is not null and public.metrix_user_is_client_writer(client_id))
  with check (client_id is not null and public.metrix_user_is_client_writer(client_id));

drop policy if exists bsil_suggestions_select on bsil_suggestions;
create policy bsil_suggestions_select on bsil_suggestions
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists bsil_suggestions_write on bsil_suggestions;
create policy bsil_suggestions_write on bsil_suggestions
  for all to authenticated
  using (public.metrix_user_is_client_writer(client_id))
  with check (public.metrix_user_is_client_writer(client_id));

-- ---------------------------------------------------------------------------
-- Review / approval / learning (Migration 0007)
-- Audit events are APPEND-ONLY for authenticated users: select + insert only.
-- ---------------------------------------------------------------------------

drop policy if exists review_events_select on review_events;
create policy review_events_select on review_events
  for select to authenticated
  using (
    (analysis_run_id is not null
      and public.metrix_user_is_client_member(public.metrix_client_id_of_run(analysis_run_id)))
    or reviewer_id = auth.uid()
  );

drop policy if exists review_events_insert on review_events;
create policy review_events_insert on review_events
  for insert to authenticated
  with check (
    analysis_run_id is not null
    and public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id))
    and (reviewer_id is null or reviewer_id = auth.uid())
  );

drop policy if exists human_edits_select on human_edits;
create policy human_edits_select on human_edits
  for select to authenticated
  using (
    (analysis_run_id is not null
      and public.metrix_user_is_client_member(public.metrix_client_id_of_run(analysis_run_id)))
    or editor_id = auth.uid()
  );

drop policy if exists human_edits_insert on human_edits;
create policy human_edits_insert on human_edits
  for insert to authenticated
  with check (
    analysis_run_id is not null
    and public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id))
    and (editor_id is null or editor_id = auth.uid())
  );

drop policy if exists approval_events_select on approval_events;
create policy approval_events_select on approval_events
  for select to authenticated
  using (
    (analysis_run_id is not null
      and public.metrix_user_is_client_member(public.metrix_client_id_of_run(analysis_run_id)))
    or approver_id = auth.uid()
  );

drop policy if exists approval_events_insert on approval_events;
create policy approval_events_insert on approval_events
  for insert to authenticated
  with check (
    analysis_run_id is not null
    and public.metrix_user_is_client_writer(public.metrix_client_id_of_run(analysis_run_id))
    and (approver_id is null or approver_id = auth.uid())
  );

-- learning_registry: reads for members, inserts for writers — but ALL inserts
-- (including service_role) must additionally pass the approval-gate trigger
-- below. No update/delete for authenticated (append-only learning log).
drop policy if exists learning_registry_select on learning_registry;
create policy learning_registry_select on learning_registry
  for select to authenticated
  using (public.metrix_user_is_client_member(client_id));

drop policy if exists learning_registry_insert on learning_registry;
create policy learning_registry_insert on learning_registry
  for insert to authenticated
  with check (public.metrix_user_is_client_writer(client_id));

-- ---------------------------------------------------------------------------
-- Learning-registry approval gate (Master Prompt §2, Blueprint §11.4).
-- BEFORE INSERT trigger — binds service_role too (BYPASSRLS skips policies,
-- it does NOT skip triggers). learning_registry writes only happen through
-- an approval_events row with approved_for = 'learning_registry' for the
-- exact source object being registered.
-- ---------------------------------------------------------------------------

create or replace function public.metrix_enforce_learning_gate()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  gate approval_events%rowtype;
begin
  if new.approval_event_id is not null then
    select * into gate from approval_events where id = new.approval_event_id;
    if not found then
      raise exception 'learning_registry: approval_event_id % does not exist', new.approval_event_id;
    end if;
    if gate.approved_for <> 'learning_registry' then
      raise exception 'learning_registry: approval event % has approved_for=%, expected learning_registry',
        new.approval_event_id, gate.approved_for;
    end if;
    if gate.object_type <> new.source_object_type or gate.object_id <> new.source_object_id then
      raise exception 'learning_registry: approval event % is for %/%, not %/%',
        new.approval_event_id, gate.object_type, gate.object_id,
        new.source_object_type, new.source_object_id;
    end if;
  else
    select * into gate
    from approval_events ae
    where ae.approved_for = 'learning_registry'
      and ae.object_type = new.source_object_type
      and ae.object_id = new.source_object_id
      and ae.analysis_run_id is not null
      and public.metrix_client_id_of_run(ae.analysis_run_id) = new.client_id
    order by ae.created_at desc
    limit 1;

    if not found then
      raise exception
        'learning_registry write blocked: no run-scoped approval_events row with approved_for=learning_registry for %/% in client % — explicit human approval is required before anything feeds IAP_OPTIMIZATION_LOOP',
        new.source_object_type, new.source_object_id, new.client_id;
    end if;

    new.approval_event_id := gate.id;
  end if;

  -- Tenant-match check (learning is tenant-only in v1, Blueprint §11.4):
  -- the approval must be run-scoped so its client can be verified, and that
  -- client must match the learning row's client.
  if gate.analysis_run_id is null then
    raise exception
      'learning_registry: approval event % is not run-scoped (analysis_run_id is null) — its tenant cannot be verified',
      gate.id;
  end if;
  if public.metrix_client_id_of_run(gate.analysis_run_id) is distinct from new.client_id then
    raise exception
      'learning_registry: approval event % belongs to a different client than % — cross-client learning writes are not allowed in v1',
      gate.id, new.client_id;
  end if;

  return new;
end;
$$;

-- Fires on UPDATE as well: roles with BYPASSRLS skip policies but not
-- triggers, so a post-insert mutation of the gated columns re-validates.
drop trigger if exists trg_learning_registry_gate on learning_registry;
create trigger trg_learning_registry_gate
  before insert or update on learning_registry
  for each row execute function public.metrix_enforce_learning_gate();
