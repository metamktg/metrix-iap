# METRIX IAP — MASTER BLUEPRINT v2.0

### Canonical Backend + Intelligence Architecture Blueprint

**Date:** July 6, 2026 **Owner:** Alex Jakma / Meta Marketing Agency **Status:** Build-ready **Supersedes:** v1.1, the v1.2 addendum, v1.3, v1.4, and the v1.5 amendment in full. This is the single authoritative document. Do not carry logic forward from any prior version without checking it against this one first.

**Export note (added at commit time, not part of the source doc):** the live Drive document currently contains this content twice under two tabs ("Tab 1" complete, "Tab 2" a partial duplicate of Sections 0–5.3). This file is exported from Tab 1, the complete version. The duplicate tab should be deleted at the source; flagged to Alex, not resolved here. Separately, this document's own Section 15 Gap Register still lists two items as "Open" that repo state as of this commit has closed (the funnel registry and 5/11 doc repairs) — that correction has been proposed to Alex for the Drive source but is not yet applied there, so it's reproduced below exactly as it reads in Drive rather than silently altered.

---

## 0. What Changed to Get Here

This version resolves every open item from prior drafts. For the record, since it explains why some earlier schema disappears below:

- **Naming convention is now the real, sourced-from-Drive canonical system**, not an inference built backward from one account's data. `creative_sprints`, `sprint_number`, and the `{client_code}{sprint_number}` label mechanism from v1.4/v1.5 are **removed** — there is no sprint-version field in the naming convention, full stop. Sprint/batch context is derived by IAP from database associations, not encoded in ad names.
- **The resolver's naming-convention-primary / ad_id-fallback priority (v1.5) stands and is now consistent** — with sprint tracking out of the name, there's no ambiguity left in the ad-level naming structure.
- **No new MST performance-gate table.** Real-time spend/impression data feeds the confidence-level mechanism `IAP_DATA_BUNDLE_PREP` already defines. The dollar-checkpoint SOP some legacy docs describe is not being formalized as new schema.
- **Cohort architecture is confirmed as first-class**, not collapsed into config. It's user-facing (a Settings checklist), reconfigurable, and selected before every run — which means a per-run snapshot is now required (Section 6.4) so a historical run stays interpretable after a client's business model changes.
- **`clients`, `organizations`, `creative_briefs`, `reports`, and `learning_registry`** were referenced by foreign key throughout every prior draft but never formally defined. Defined properly for the first time in Section 11.

---

## 1. Executive State

Metrix has a validated intelligence engine and zero deployed backend. The 11-prompt IAP system runs today as Claude.ai Skills and has been validated against real client accounts across ecommerce, app, and hybrid business models, producing structured JSON outputs. The UI is a mature single-file HTML prototype, not a componentized app. No database, API, OAuth flow, or job queue exists.

The July 5, 2026 documentation audit found the 11-document system carries a single-business-model funnel assumption into 5 of 11 documents (critical: `IAP_DATA_BUNDLE_PREP`, `IAP_ANALYSIS_CORE`, `MST_TEST_ENGINE`; high: `IAP_STRATEGY_MAP`, `IAP_BRIEF_BUILDER`, `IAP_REPORT_SUMMARY`, `IAP_OPTIMIZATION_LOOP`), carried forward unfixed into the May 2026 Claude Skills conversion. Three copies of the same system exist (Drive canonical docs, project-knowledge `.docx` mirrors, Claude Skills) with no declared source-of-truth hierarchy until now (Section 2).

Metrix remains suggestion-only. Nothing in this blueprint introduces autonomous Meta Ads execution. Every BSIL output, every IntelligenceCard recommendation, is a human/agent-reviewed suggestion, never a command.

No table, column, enum, or business rule in this document names or assumes any specific client, account, or vertical. Client-specific detail lives entirely in per-tenant data rows and config.

---

## 2. Source-of-Truth Hierarchy

This blueprint supersedes prior architecture drafts and stale implementation plans. It does not supersede audit documents, evidence documents, source chats, or validation artifacts — those remain the evidence trail.

```
SUPERSEDED — historical reference only, not deleted
- Developer Handoff Document for Metrix (April 2026, original)
- Developer Handoff for Metrix Platform (April 2026, reformatted pass)
- ENG+DEV BRIEF METRIX - 05/25/26
- 02_METRIX Gap Map + Build Plan
- METRIX IAP MASTER BLUEPRINT v1.1, v1.2 addendum, v1.3, v1.4, v1.5 amendment
```

Archive candidates (audit-identified pre-consolidation drafts):

```
Prompt Consolidation / Optimization
Prompt Consolidation, Optimization & Missing
IAP Prompt Library Blueprint
IAP DOCUMENTATION QUALITY & STATUS REVIEW
METRIX IAP PROMPT CHAIN MAP
Metrix AI Agent: Complete Prompt Architecture & Learning Loop
```

**Drive-first propagation rule:** Google Drive's `Metrix IAP` project folder is the Tier 0 canonical edit surface. Project-knowledge `.docx` mirrors and Claude.ai Skills are regenerated *from* Drive after Drive is confirmed correct — never edited independently, never the reverse.

**The Meta Ads Naming Convention System doc (Drive, live)** is canonical for everything in Section 5. This blueprint does not restate its full token tables verbatim; it references them as the literal source of truth and specifies only the structural rules that affect schema design.

---

## 3. Four-Plane Architecture

```
PLANE 1 — Master OS (IAP Engine)
  The 11-prompt / cohort-aware chain. Owns analysis, strategy, brief, MST,
  and optimization logic. Runs as versioned prompt/skill invocations.

PLANE 2 — Skill Bridge Interface Layer
  Translates Plane 1's JSON outputs into Plane 3's relational schema. Owns
  schema validation, versioning stamps, the creative-identity resolver
  (Section 7), and the deconstruction/confidence-grading pipeline (Section 8).

PLANE 3 — Application Backend
  Supabase Postgres + Edge Functions + Storage + Auth. Owns persistence,
  RLS, review/approval lifecycle, job orchestration.

PLANE 4 — Next.js Frontend
  Componentized version of the current single-file HTML prototype.
  Presentation only. Owns the cohort Settings checklist (Section 6.3).
```

---

## 4. Product Loop

```
ONBOARD    → cohort selection (Section 6), creative intake (Section 8.1)
INPUT      → structured upload / data ingestion (Listen Layer, Section 9)
STORE      → Supabase persists analysis_run_inputs + raw payload
VALIDATE   → Skill Bridge schema + cohort-column validation
ANALYZE    → IAP engine runs the analysis chain (Plane 1)
OUTPUT     → intelligence_cards → reports / creative_briefs
REVIEW     → review_events / human_edits
APPROVE    → approval_events, scoped by approved_for
REMEMBER   → learning_registry — approved signals feed the optimization loop
```

---

## 5. Naming Convention System

The canonical naming convention lives in the Drive doc "Meta Ads Naming Convention System" and is not re-derived or reinterpreted here — that doc is the literal source of truth for every token, code list, and slot definition. What follows is the structural summary needed to design against it correctly.

### 5.1 Three levels, each with a fixed token structure

```
CAMPAIGN — [CLIENT_CODE]_[CAMPAIGN_TYPE]_[MONTHYY]_[VERSION]_[OBJECTIVE] [free text]
AD SET   — [AUDIENCE]_[FUNNEL]_[DEMO]_[DEVICE]*_[PLATFORM]*_[GEO]_[CLIENT_CODE]_[VERSION]
AD       — [CONCEPT_VAR]_[TYPE]_[LANDING_PAGE]_[TEST_ID]
```

(`*` = conditional slots per the canonical doc's own rules.)

### 5.2 Governing principle: fixed slots, placeholders for inapplicable ones, no smuggled context

Two rules, both non-negotiable and both confirmed directly:

1. **The naming convention exists to do two things: keep ads identifiable in Ads Manager, and give IAP the data it needs to correlate a CSV row to a library concept.** Nothing else belongs in the string.
2. **Anything not strictly required by the naming string — sprint number, event details, campaign-batch context — is never embedded in the name.** When a slot doesn't apply to a given vertical (e.g. no landing page for an app-install ad), it takes a defined placeholder value from the canonical doc's own token list — it is never repurposed to carry different information (like a sprint counter) than what the slot is defined for.

**There is no sprint-version field anywhere in this naming system.** IAP derives sprint/batch context from database associations — which `analysis_run` or `analysis_run_inputs` a given `ad_id` shows up in — not from parsing it out of the ad name. A previously-considered design (`creative_sprints` table, `{client_code}{sprint_number}` label generation) assumed sprint tracking needed to live in the name string. It doesn't, and that table is removed from this schema.

### 5.3 `client_code` — still required, scope corrected

Every client gets a short, unique, acronym-style code at onboarding (same logic as a sports scoreboard abbreviation), used as the `[CLIENT_CODE]` token at both the campaign and ad-set levels per the canonical doc. It does **not** appear at the ad level — the ad-level structure is `[CONCEPT_VAR]_[TYPE]_[LANDING_PAGE]_[TEST_ID]` with no client code slot, and that's correct as specified, not a gap.

---

## 6. Cohort Architecture

Confirmed as first-class platform architecture: the system must identify which cohorts (business models) apply to a client **before any analysis run**, cohorts are defined at onboarding, and they are reconfigurable at any time — a lead-gen business pivoting to direct product sales is the explicit example. This is exposed to the user as a Settings checklist, not buried in a config file only an operator can touch.

### 6.1 Illustrative business-model definitions (seed data, not a fixed taxonomy)

```
ecommerce   — funnel: click → add_to_cart → checkout → purchase
lead_gen    — funnel: click → lead_submit → qualified → close
service     — funnel: click → inquiry → consult_booked → close
app         — funnel: click → install → activation → retained
```

Any client can be onboarded with a business model this seed set doesn't cover by adding a row to `cohort_definitions` — no schema change or deployment required.

### 6.2 Schema

```sql
create table cohort_definitions (
  cohort_key text primary key,
  label text not null,
  funnel_stages jsonb not null default '[]',
  intent_score_weights jsonb not null default '{}',
  terminal_metric text not null,
  terminal_metric_direction text not null check (terminal_metric_direction in ('lower_is_better','higher_is_better')),
  required_metric_block text not null,
  schema_version text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table client_enabled_cohorts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  cohort_key text not null references cohort_definitions(cohort_key),
  enabled boolean not null default true,
  priority int not null default 100,
  is_primary boolean not null default false,
  cohort_config jsonb not null default '{}',
  kpi_targets jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, cohort_key)
);
```

### 6.3 Settings-driven reconfiguration

`client_enabled_cohorts` is the table the Settings checklist (Plane 4) reads and writes directly — toggling a cohort on/off for a client is a row update, not a deployment. A client can have zero, one, or several cohorts enabled at once; multi-cohort clients are the native case, not a special one.

### 6.4 Per-run cohort snapshot (new — required because cohorts are reconfigurable)

Because `client_enabled_cohorts` can change between one analysis run and the next, every run needs to record which cohorts were actually active *for that run* — otherwise a run from before a business pivot becomes unexplainable after the pivot.

```sql
create table analysis_run_cohorts (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  cohort_key text not null references cohort_definitions(cohort_key),
  was_enabled boolean not null default true,
  cohort_config_snapshot jsonb not null default '{}',
  created_at timestamptz default now(),
  unique (analysis_run_id, cohort_key)
);
```

### 6.5 Multi-cohort clients

Multi-cohort clients get parallel per-cohort analysis sections. `analysis_runs` and `intelligence_cards` never blend a cross-cohort score — each card carries a single `cohort_key`.

### 6.6 Repair sequencing (unchanged from prior drafts, still the correct order)

```
1. Build the business-model funnel registry as an actual file, validated
   against a real multi-cohort client account.
2. Repair IAP_DATA_BUNDLE_PREP() and IAP_ANALYSIS_CORE() together.
3. Repair MST_TEST_ENGINE() only after step 2 is validated.
4. Propagate to IAP_STRATEGY_MAP / IAP_BRIEF_BUILDER / IAP_REPORT_SUMMARY /
   IAP_OPTIMIZATION_LOOP last.
5. Archive the six legacy drafts (Section 2).
6. Sync Skills and project-knowledge .docx copies from Drive only after
   Drive is confirmed correct.
```

---

## 7. Creative Identity Resolution

Meta's reporting/export layer does not expose a native `creative_id` breakdown. Resolution anchors on `ad_id` as the fallback key, with naming-convention parsing as the primary path — now unambiguous, since sprint context is no longer competing for a slot in the ad name (Section 5.2).

### 7.1 Key hierarchy

```
account_id:campaign_id:adset_id   — budget-bearing object key (BSIL scope, Section 10)
concept_code (from naming parse)  — PRIMARY resolution path
ad_id (scoped to adset/campaign)  — FALLBACK resolution path
relative_id                       — per-client crosswalk, used when neither above resolves
```

### 7.2 Resolution order

```
1. Naming convention parse — PRIMARY. Parse [CONCEPT_VAR]_[TYPE]_[LANDING_PAGE]_[TEST_ID]
   against the canonical structure. Resolves the large majority of rows under
   normal operation, since the naming convention is fixed and mandatory.
2. ad_id fallback — SECONDARY. Used when naming parsing fails or is flagged
   inaccurate. Looked up via ad_id, scoped within its adset_id/campaign_id,
   against the client's crosswalk (relative_id).
3. Unresolved — neither path matches. Triggers the deconstruction pipeline
   (Section 8). Does not block the run; produces an INSUFFICIENT-confidence
   card for that specific creative until reconciled.
```

```
resolveCreativeIdentity(record: NormalizedRecord, client_id: uuid) -> {
  ad_id: string,
  campaign_scope_key: string,
  concept_code: string | null,       // naming convention parse (PRIMARY)
  relative_id: string | null,        // ad_id+campaign_scope_key crosswalk (FALLBACK)
  resolution_path: 'naming_convention' | 'ad_id_fallback' | 'unresolved',
  confidence: 'high' | 'moderate' | 'low' | 'insufficient'
}
```

**Precondition principle:** the library registry must be populated and accurate before analysis is trusted — output integrity depends entirely on it. Enforced per-creative through the existing `confidence_grade` taxonomy rather than as an all-or-nothing gate: a run with some unresolved creatives still executes, but any card touching one is `INSUFFICIENT` by construction, and that gap must close before the next run trusts that creative.

---

## 8. Creative Deconstruction, Onboarding Intake & Confidence Grading

IAP does not generate creatives — that's human/designer work. What Metrix owns is turning a produced creative into a structured library entry and correlating it against live performance.

### 8.1 Onboarding cold-start — two paths

```sql
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
```

**Path A — calculated brief (default):** at onboarding, generate an initial brief from whatever signal exists — historical performance if any, demographic/device reports, and client onboarding data (e.g. website content) — producing initial concepts and angles as a starting hypothesis. This is `IAP_STRATEGY_MAP`/`IAP_BRIEF_BUILDER` applied to onboarding-only inputs, not a new engine.

**Path B — manual upload (opt-out):** client uploads existing creatives instead — **minimum 5 required** — and the system deconstructs them to classify concepts and identify distinct angles from the variation across that set.

### 8.2 Pre-publish alignment check — recommended default, not mandatory

Before an ad publishes, the client can (should) upload the creative for deconstruction and comparison against the brief that spawned it. Skippable, but not advised to skip — it's the only point to catch brief/execution misalignment before spend starts. This formalizes what `metrix-mst-creative-scan` already does conceptually, giving it a durable record and a numeric threshold.

### 8.3 Alignment scoring — against the brief, distinct from live-performance confidence

```sql
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
```

- **Pre-publish:** creative uploaded before publish → deconstructed → scored against `source_brief_id`. `check_stage = 'pre_publish'`.
- **Post-hoc:** an ad publishes and is later pulled via API with no prior manual upload → alignment computed retroactively. `check_stage = 'post_hoc_reconciliation'`.
- **Hard threshold:** `alignment_score < 80` on copy, tonality, or funnel-stage → `threshold_status = 'flagged'`, either stage.
- **Bypass behavior:** if the user proceeds anyway, the system automatically updates the library with the actual inputs (`library_updated = true`) — the library reflects what's really live, not the brief's original intent.

**This is distinct from live-performance confidence and does not get a separate gating table.** Alignment scoring answers "does the creative match its brief." Live-performance confidence — "is there enough spend/impression signal to trust this creative's data" — is answered by the confidence-level classification `IAP_DATA_BUNDLE_PREP` already defines (high: >100 conversions or >$1,000 spend with a consistent pattern; medium: 10–100 conversions or $100–1,000 spend directional; validation-required: <10 conversions or <$100 spend but promising; insufficient: below minimum thresholds). Real spend/impression data is ingested continuously as that confidence signal — there is no separate dollar-checkpoint gate table. Operationally, budget should be allocated proportionally across concepts/angles under test so each one accrues enough signal for valid hypothesis testing; that's a budget-setup practice, not schema.

### 8.4 Resolution flow, end to end

```
1. Library must be populated and accurate (Section 8.1) before a client's
   first real analysis run.
2. Per creative, before publish: optional-but-recommended alignment check
   (Section 8.2/8.3, pre_publish).
3. Per CSV row ingestion: naming convention parse → ad_id fallback →
   unresolved (Section 7.2).
4. If unresolved and the ad is already live: post-hoc reconciliation
   computes an alignment score; <80% flags it; user bypass triggers
   automatic library update.
5. Any creative still unresolved produces INSUFFICIENT-confidence cards
   until the library gap is closed.
```

---

## 9. Listen Layer — Metric Contract

A base metric block is required for every client regardless of business model; additional blocks (ecommerce, service, app, etc.) are conditionally required based on `client_enabled_cohorts`. Per the audit's repair brief, `IAP_DATA_BUNDLE_PREP()` currently hardcodes one business model's fields as unconditionally required — the fix is a base-always-required set plus conditionally-required blocks, with a data-quality flag (not a silent skip, not a hard failure) when an enabled cohort's expected columns are absent.

---

## 10. BSIL — Budget Scaling Intelligence Layer

Operates on budget-bearing objects only, keyed by `account_id:campaign_id:adset_id`. Issues confidence-graded suggestions, never commands.

### 10.1 Budget-scope constraint (hard, schema-enforced)

Budget suggestions bind only to `campaign` or `ad_set` — never `creative`, `copy`, `angle`, `variable`, or `landing_page`. Enforced via `intelligence_cards.entity_scope`.

### 10.2 No-ROAS-v1 alert constraint (hard, schema-enforced)

```sql
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  metric text not null check (metric <> 'roas'),
  cohort_key text references cohort_definitions(cohort_key),
  threshold_config jsonb not null default '{}',
  created_at timestamptz default now()
);
```

ROAS remains a full reporting metric; the constraint is scoped to v1 automated alert scanning, where attribution-backfill volatility makes it unreliable as a trigger.

### 10.3 Suggestion table

```sql
create table bsil_suggestions (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid references analysis_runs(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  budget_scope_object text not null check (budget_scope_object in ('campaign','ad_set')),
  entity_id uuid not null,
  scope_key text not null,
  suggestion_type text not null check (suggestion_type in ('scale','reduce','pause','hold','reallocate')),
  suggested_change jsonb not null default '{}',
  confidence_grade text not null check (confidence_grade in ('HIGH','MODERATE','LOW','INSUFFICIENT')),
  rationale_json jsonb not null default '{}',
  cohort_key text references cohort_definitions(cohort_key),
  contract_version text not null,
  schema_version text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed_manually')),
  created_at timestamptz default now()
);
```

---

## 11. Supabase Backend Blueprint — Full Schema

Every table referenced anywhere in this document, defined once, here.

### 11.1 Identity and access

```sql
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
```

`org_members` is organization-level membership; `client_memberships` is the single source of truth for client-level visibility — never both.

### 11.2 Analysis runs

```sql
create table analysis_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  triggered_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','running','complete','failed')),
  engine_version text not null,
  created_at timestamptz default now(),
  completed_at timestamptz
);
-- analysis_run_cohorts: Section 6.4

create table analysis_run_inputs (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  input_type text not null check (input_type in (
    'upload','client_context','creative_asset','landing_page',
    'strategy_note','prior_report','api_snapshot'
  )),
  source_table text,
  source_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

create table analysis_run_stages (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  prompt_name text not null,
  prompt_version text not null,
  skill_name text,
  skill_version text,
  engine_version text not null,
  input_schema_version text not null,
  output_schema_version text not null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','running','complete','failed'))
);
```

Versioning fields (`prompt_version`, `skill_version`, `engine_version`, `schema_version`, `contract_version`, `cohort_registry_version`, `bsil_version`, `report_template_version`) apply to `analysis_run_stages` and additionally to `intelligence_cards`, `reports`, `creative_briefs`, `bsil_suggestions`, `learning_registry`, `cohort_definitions`, `global_variable_registry` — if a report looks wrong three months later, the exact logic version that produced it must be reconstructable.

### 11.3 Outputs

```sql
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
```

### 11.4 Review, approval, learning

```sql
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
```

`learning_registry` writes only occur through an `approval_events` row with `approved_for = 'learning_registry'` — no analysis output feeds `IAP_OPTIMIZATION_LOOP` without explicit human approval first.

### 11.5 Migrations remain GitHub-canonical

```
All migrations must exist as ordered SQL files inside the repo. The Supabase
Dashboard SQL Editor is only the execution surface. No schema change is
canonical unless the exact SQL file is committed to GitHub.
```

```
supabase/migrations/
supabase/policies/
supabase/seed/
supabase/tests/
```

### 11.6 Queue strategy

Supabase Queues/pgmq approved for v1 (moderate, job-based, agency-scale workload). Revisit BullMQ/SQS/Pub-Sub if throughput, retry complexity, or concurrency exceed pgmq's comfort zone. `pg_net` acceptable for v1 but monitored.

---

## 12. RLS and Service-Role Security

Any Edge Function using the `service_role` key bypasses RLS and must manually enforce tenancy:

```
verify caller identity
verify org membership
verify client access
verify requested object belongs to client/org
only then write with service role
```

```
assertUserCanAccessClient(user_id, client_id)
assertUserCanAccessOrg(user_id, org_id)
assertObjectBelongsToClient(object_id, client_id)
```

Applied to: `validate-upload`, `run-pipeline`, `bridge-transform`, `resolve-creatives`, `export-report`, `severity-scheduler`. Scheduled jobs with no human caller use strict system-scoped job authorization plus the same client/org scoping.

---

## 13. Edge Functions and Config-as-Data

Cohort funnel registry, variable registry, BSIL calibration, MST thresholds, and the Listen Layer contract are queryable data, not hardcoded into prompt text — any client's configuration tunes through product/admin controls without a deployment.

---

## 14. Migration and Repo Rules

```
metrix/
├── apps/{web, api, worker}
├── packages/{iap-engine, metrix-core, schemas, db, connectors, ui}
├── supabase/{migrations, policies, functions, tests}
├── docs/{architecture, data-model, iap, prompts, product, security, resources}
└── tests/{integration, e2e, security}
```

---

## 15. Gap Register

*(Reproduced exactly as it reads in the live Drive document at export time — see export note above regarding items this repo's current state has since closed.)*

| Gap | Status |
| :---- | :---- |
| No deployed database, REST API, OAuth, job queue | Open — this blueprint is the spec to close it |
| Frontend not componentized, no state mgmt, no auth wiring | Open |
| No Meta API OAuth/ingestion/token/rate-limit handling | Open |
| No confirmed Meta API creative-asset read access (needed for auto-deconstruction path, Section 8) | Open — verify API permission scope before building that path; manual-upload fallback works regardless |
| 5 of 11 IAP docs hardcoded to one business-model shape | Open — repair order in Section 6.6 |
| Business-model funnel registry referenced but does not exist as a file | **Open — highest priority, blocks the cohort repair sequence** |
| Three unsynced copies of the 11-doc system (Drive / project-knowledge / Skills) | Resolved, Section 2 |
| `creative_id` not exposed by Meta's export layer | Resolved, Section 7 |
| Ad-level naming vs. sprint tracking | Resolved, Section 5 |
| Cohort as first-class vs. config-only | Resolved, Section 6 |
| MST performance gating mechanism | Resolved, Section 8.3 — no new table, existing confidence-level classification covers it |

---

## 16. Execution Roadmap

```
1. Supabase schema + RLS
2. Seed config-as-data (cohort_definitions, global_variable_registry, alert_rules)
3. Upload validation (Listen Layer, Section 9)
4. Creative resolution (Section 7)
5. Analysis run creation + cohort snapshot (Sections 6.4, 11.2)
6. Skill Bridge transform
7. IntelligenceCards
8. Report/brief generation
9. Review/approval lifecycle
10. Learning registry writes
```

---

## 17. Build-Readiness Checklist

```
1. Stage 0 documentation rescue complete:
   a. Business-model funnel registry exists as an actual, versioned file.
   b. Six legacy drafts archived (Section 2).
2. Schema in Section 11 applied via committed migration files.
3. Service-role tenancy rules written (Section 12).
4. Meta API creative-read access verified or manual-upload path confirmed
   as the primary route (Section 8, Gap Register).
5. One pilot account designated for end-to-end validation.
```

Non-negotiables:

- Suggestion-only; no autonomous Meta execution.
- Budget-scope constraint intact (Section 10.1).
- No-ROAS-v1 alert constraint intact (Section 10.2).
- No table, column, enum, or business rule names or assumes a specific client, account, or vertical.
- Every client gets a `client_code` at onboarding (Section 5.3) — required architecture, not incidental data.
- No sprint-version field anywhere in the naming convention (Section 5.2).
- Cohort selection is user-facing, reconfigurable, and snapshotted per run (Section 6).
- No duplicate client-access mechanisms (Section 11.1 — one table, not two).
- Service-role tenancy enforcement explicit, not implicit (Section 12).
- No historical evidence deleted — only marked superseded or archived (Section 2).
