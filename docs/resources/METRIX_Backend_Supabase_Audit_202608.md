# METRIX — Live Supabase / backend audit (pre-deploy, 2026-08-25)

Verification pass against the **live** project (`lqryrmaipryeqtjbxjdh`, "Metrix",
Postgres 17.6, us-east-2, ACTIVE_HEALTHY) before deployment. Everything below was
measured on production data, not inferred from the schema files.

Read alongside `METRIX_Phase1_Validation_Audit_202608.md` (the code-side pass) and
`METRIX_RLS_and_Service_Role_Security.md` (the security contract this checks).

## 0. Credential handling

The audit was requested with a production superuser connection string pasted into
chat. That contradicts the standing rule in the Phase 1 work order §3 and the Phase 2
kickoff prompt ("No chat-pasted DB credentials"). **That password must be rotated.**
It was never written to a file, a commit, or any artifact in this repo.

It also could not have been used from the session sandbox: `db.<ref>.supabase.co`
resolves to IPv6 only (Supabase has retired IPv4 on direct connections) and the
sandbox has no IPv6 egress. All work below went through the Supabase MCP server,
which authenticates independently and needs no pasted secret.

## 1. Security — verified sound, empirically

`replit.md` claims anon is denied everywhere and tenant data is isolated. Both were
tested by impersonating the roles, not by reading policy text.

| Probe | Result |
|---|---|
| `anon` SELECT against all 64 public tables | **0 tables returned any row.** 41 hard-denied at grant level ("permission denied"), 22 RLS-filtered to zero, 1 migration table denied |
| `authenticated` with a UID belonging to no org and no client | **0 tenant rows.** Exactly 2 tables visible: `cohort_definitions` (4) and `global_variable_registry` (51) — both config-as-data, read-only to authenticated by design |

The importer's deny-by-default block and the official schema's 43 policies both do
what they claim. Every policy is scoped `to authenticated`; none grants `anon`, so
the retained `anon` GRANT on official tables is inert — protected by policy absence
rather than by revocation. That is one layer where the importer tables have two;
revoking those grants would make the two halves consistent. Not urgent, not a
vulnerability today.

The Supabase linter's 45 `rls_enabled_no_policy` INFO entries are **expected**, not
defects: on importer tables "RLS on, no policy, no grants" is precisely the intended
hard-deny.

### Open security item — SECURITY DEFINER helpers reachable over PostgREST

Four tenancy helpers are callable by any signed-in user via `/rest/v1/rpc/...`:
`metrix_user_in_org`, `metrix_user_is_client_member`, `metrix_user_is_client_writer`,
`metrix_client_id_of_run`.

The first three answer only about the caller, so exposure is close to harmless. The
fourth is different:

```sql
metrix_client_id_of_run(run_id uuid) -- STABLE SECURITY DEFINER
  select client_id from analysis_runs where id = run_id;
```

It resolves **any** run UUID to its owning client, bypassing RLS, for any
authenticated caller — a cross-tenant mapping primitive. Practical risk is limited by
run ids being unguessable v4 UUIDs.

**Do not simply revoke EXECUTE.** RLS policy expressions are evaluated with the
querying user's privileges, and all six run-scoped tables call this function inside
their policies, so revoking from `authenticated` would break tenant reads outright.
The correct remediation is to relocate the helpers into a schema PostgREST does not
expose and repoint the policy references — a deliberate change with a test pass, not
a pre-deploy patch. Left open on purpose.

Also open, low impact: Supabase Auth leaked-password protection is off. The product
uses custom bcrypt auth and Supabase Auth users exist only as FK targets, so this
affects nothing today.

## 2. Data integrity — clean, and one closeout warning retired

| Check | Result |
|---|---|
| Duplicate natural keys across `demographic_/placement_/device_/platform_performance` | **0**, all accounts |
| Orphaned `ad_performance` rows (run deleted) | 0 |
| Orphaned `manual_import_chunks` (no parent) | 0 |
| Runs stuck in `running` > 2h | 0 |
| AAFE `ad_performance` total | 3,962 rows / **$42,290.67** — matches the B0-verified figure to the cent |

**The Phase 1 closeout's outstanding warning does not survive contact with the data.**
It records that AAFE's Jul 1–16 demographic rows "still carry the pre-dedupe doubled
lineage". They do not: there are no duplicate natural keys anywhere in the rollups.
Those rows are *thin* (106 rows / ~$109 across 16 days, from the old 2%-coverage
export) but they are single-counted. The BUG-19 doubling is fully retired. The
recommended full-range re-run is still worth doing to lift Jul 1–16 onto the corrected
export — but it is a data-quality improvement, not a correction of double-counted spend.

## 3. Fixed in this pass

### 3a. `ad_performance` had no run index — the only rollup missing one

The run-tagging block in `schema.sql` indexes `manual_analysis_run_id` on six rollup
tables. `ad_performance` was left out — despite being the **largest** (9,647 rows,
roughly 2× the next) and the one the idempotent-rebuild path deletes run-scoped on
every re-ingestion. That delete was running against no index at all.

### 3b. 42 unindexed foreign keys → 7

Postgres creates no index for a FK. Unindexed FKs cost twice: lookups seq-scan, and
every parent DELETE scans the whole child table while holding a lock. On the official
schema the cost is sharper than row counts suggest, because these columns are
evaluated **inside RLS policy predicates** — once per candidate row, on every read by
every signed-in user.

Applied live and committed as reproducible DDL (`schema.sql` for importer tables,
migration `20260825000100_fk_index_coverage.sql` for the official schema). Index count
118 → 156.

The 7 remaining are deliberate and documented in the migration: `cohort_key` FKs point
at a 4-row config table whose rows are never deleted, and `global_variable_registry
.superseded_by` is a self-reference followed one row at a time. Indexing them would be
pure write overhead.

### 3c. 17 tables had never been analyzed → 0

`reltuples = -1` means the planner had no statistics at all for those tables,
including `cell_creative_overrides` (6.8 MB). Ran `ANALYZE`; all 64 tables now have
stats.

### 3d. `content_md5` was NULL on 93% of rows — the BUG-09 guard was inert

The column shipped with the same-bytes staging guard but was never backfilled: 172 of
185 rows carried NULL, and the guard compares by equality, so `= NULL` never matched.
For those rows the guard did nothing.

What that let through, found in the live data: **25 groups of byte-identical files
staged into the same slot**, every one of which should have been a 409. Three are
performance exports — the kind that double-count spend:

- `ecas` · `IAP-DEVICE-MAIN-ECAS.csv` × 2
- `manual_BwsYjC5ZRk0i` · `real_20mb.csv` × 2 (17 MB each)
- `manual_QmjeK52K5QiQ` · `king-DEVi.csv` × 2 (6.8 MB each)

The remaining 22 groups are bookster/skov_pet creative assets (storage waste and
duplicate library rows, no spend impact).

Spend was **not** corrupted by these: the BUG-19 parse-time cross-file dedupe catches
identical rows and drops them with a `[Duplicate data]` warning. Defence in depth
held — but the second layer was doing the first layer's job.

Backfilled all 185 rows, in code as an idempotent block in `schema.sql`. Correctness
was established **before** writing: Postgres `md5(bytea)` was checked against all 13
rows that already carried an app-written value (11 inline, 2 chunked) — 13/13 exact,
0 mismatches — because a wrong backfill is worse than a NULL one, it would 409-reject
legitimate uploads. All 185 rows verified correct afterwards.

### 3e. RLS policies re-evaluated `auth.uid()` per row

The Supabase **performance** linter (which the first pass of this audit did not run —
a genuine gap) flagged `auth_rls_initplan` on seven policies: `org_members_select`,
`client_memberships_select`, and the select/insert pairs on `review_events`,
`human_edits` and `approval_events`. Each called `auth.uid()` bare in the policy
expression, so Postgres re-evaluated it **once per candidate row** instead of hoisting
it to a one-time InitPlan.

Rewritten to `(select auth.uid())` — semantically identical, no behavioural change.
The four `auth.uid()` calls inside the SECURITY DEFINER helper bodies were left alone
on purpose: those are evaluated once per function call, not per row, and the functions
are `STABLE`.

Applied live and to `supabase/policies/` (idempotent, re-applied on every run). The
full anon + authenticated isolation probe was re-run afterwards and returned results
**identical to the pre-change baseline** — anon 42 denied / 22 zero / 0 visible;
authenticated 42 denied / 20 zero / 2 visible. Behaviour preserved, proven not assumed.

## 4. Deliberately deferred — with reasons

### Storage reclaim: NOT recommended before this deployment

Assessed on request and judged the wrong move right now. Four reasons:

1. **No disk pressure.** 533 MB. The project is past the 500 MB free-tier ceiling so
   it is on a paid plan (8 GB included) — roughly 7% utilisation. Nothing is at risk.
2. **Sequencing is backwards.** Deleting uploaded source files immediately *before* a
   deploy removes the restage capability at exactly the moment it is most likely to be
   needed — right after the deploy, if a re-run is required.
3. **The bleeding has already stopped.** `uploading` rows are excluded from runs by
   design; exact duplicates are caught by the BUG-19 parse-time dedupe; and with
   `content_md5` now backfilled, *new* duplicates are rejected with a 409 at the door.
   The duplicates that exist are inert, not accumulating.
4. **The deletion costs more than it looks.** Auditing the prepared script against live
   data found three hazards it did not originally handle:
   - `creative_deconstructions.manual_import_id` is **ON DELETE CASCADE** — deleting a
     duplicate destroys its AI deconstruction. All 12 happened to sit on rows the
     original ordering kept, but by luck, not construction.
   - **40 of the 62 duplicate rows carry a non-empty `ad_names` array** — the
     user-editable creative→ad mapping. A byte-identical sibling can carry a different
     or empty mapping, so deleting silently discards hand-corrected work.
   - **18 are `status='processed'`** and carry run lineage that Import History displays
     and `restage` depends on.

The script has been hardened accordingly: the ranking now prefers rows carrying a
deconstruction, then `ad_names`, then processed, then oldest; and the delete refuses
outright to touch any row still carrying a deconstruction or a mapping. Under those
guards the safe set drops from 62 files / 270 MB to **22 files / 189 MB**, with 40
files / 81 MB explicitly held back for a human decision. That is the correct trade.

Recommended sequence: deploy first, confirm stable, then reclaim.

### Multiple permissive policies — deferred on purpose

The linter flags 12 tables where a `_select` (SELECT) and a `_write` (ALL) policy both
evaluate on every SELECT, since ALL includes SELECT. Fixing it means splitting each
`_write` into separate INSERT/UPDATE/DELETE policies — Postgres allows only one command
per policy — turning 12 policies into 36 on the tenancy path, immediately before a
deploy, for a saving that is unmeasurable at current table sizes (most under 10 rows).
Not worth the regression risk now. Worth doing when these tables have real volume.

### `unused_index` linter INFOs — do NOT act on these

The linter reports ~40 unused indexes, **including every index created in this pass**.
That is expected and must not be treated as a cleanup list: `pg_stat_user_indexes`
counters start at zero for a newly built index, and these tables carry almost no
traffic yet. Judging an index built minutes ago as "unused" would undo the fix. Revisit
after the schema has seen real production load.

### Auth connection strategy

`auth_db_connections_absolute`: the Auth server is pinned to at most 10 connections
rather than a percentage allocation, so scaling the instance will not scale Auth. A
one-line dashboard change, worth making before scaling, harmless today.

## 5. Not fixed — needs your decision

### Storage: 3 copies of one 138 MB CSV are 78% of the chunk table

533 MB database; 794 MB of *logical* upload bytes across 185 files (logical exceeds
physical because bytea is TOAST-compressed, so reclaim will be smaller than these
numbers).

| Category | Logical | Files |
|---|---|---|
| Abandoned `uploading` session | 138 MB | 1 |
| Exact duplicate copies (beyond first) | 270 MB | 62 |
| Processed — retention candidates | 333 MB | 39 |
| Staged, unique, still needed | 215 MB | 101 |

The single largest item: three copies of the same 138 MB `IAP-DEMO-NEW.csv`
(identical md5) — one abandoned `uploading` row on AAFE, and two `processed` copies on
`manual_kisg7_8qaRG_` consumed by two different runs.

`docs/resources/sql/2026-08-25_upload_storage_reclaim.sql` is prepared and
**deliberately not executed** — every statement destroys uploaded source files, which
is the owner's call. It leads with SELECTs, keeps the DELETEs commented, and explains
why processed-file retention needs a policy decision (keep last N per slot) before
anything is purged.

### Staged-file merge risk

145 files are staged, and a run merges every staged file per slot. Three accounts
carry more than one staged file in the same slot. With md5 now backfilled the exact
duplicates are visible; the closeout runbook's "review the staged-imports list before
running" step still stands, and the reclaim script's STEP 2 lists precisely what to
remove.

## 6. Verification state

Repo unchanged in behaviour: full typecheck green across all 8 packages, 89 scripts
tests green. The DDL applied live is byte-identical to what the committed
`schema.sql` and migration will reapply — both are `create index if not exists`, so
re-running the importer is a no-op rather than a conflict.
