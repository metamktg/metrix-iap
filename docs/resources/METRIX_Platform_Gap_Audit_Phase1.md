# Metrix Platform Gap Audit — Phase 1

**Audit date:** August 5, 2026 **Scope:** everything that currently prevents the platform from being
fully operable, reviewed across the three systems it spans — Replit (runtime/deploy), GitHub (source
+ CI), Supabase (data + policy). **Method:** live inspection — `.replit`, git state, GitHub Actions
config, and direct queries against the production Supabase project (`lqryrmaipryeqtjbxjdh`) via the
Supabase MCP connection (schema introspection, security advisors, performance advisors, migration
history). Not a code-reading exercise — everything below was checked against the running system.

## Fixed this session

**`icp_profiles.source` / `icp_profiles.generation_run_id` were missing in production.**
`generationEngine.ts` (merged in PR #15) writes both columns the moment a user regenerates Strategy
for any account; `schema.sql` had the idempotent `alter table` already written, but it had never been
re-applied to the live database. Confirmed missing via direct query, applied via
`mcp__Supabase__apply_migration` (`add_icp_profiles_source_and_generation_run_id`), confirmed present
afterward with the correct types/defaults (`source text not null default 'imported'`,
`generation_run_id uuid`). This was a live outage waiting to happen — any Strategy regeneration before
this fix would have failed at the DB write. **Closed.**

No other schema drift was found: `ad_accounts.cohort` was checked and already exists in production
(this was drift the Initiative 6 migration correctly targets, not a new gap).

## Confirmed NOT gaps (advisor findings that are working as designed)

Supabase's advisors surface a lot of noise that looks alarming out of context. Each of these was
checked against what the codebase actually intends before being ruled out:

- **`rls_enabled_no_policy` (dozens, INFO)** — every importer table (`scripts/src/metrix-supabase/schema.sql`)
  has RLS enabled with zero policies attached. This is not an oversight: `enforce-importer-rls.ts`
  exists specifically to enable RLS and revoke `anon`/`authenticated` grants on every importer table,
  by design, so PostgREST returns a hard 401 to the browser-embedded anon key and only the
  service-role key (which bypasses RLS) can read — exactly the deny-by-default pattern replit.md
  documents. A policy-less RLS-enabled table is the intended end state here, not a bug.
- **4 `SECURITY DEFINER` function WARNs** (`metrix_client_id_of_run`, `metrix_user_in_org`,
  `metrix_user_is_client_member`, `metrix_user_is_client_writer`) — these are the documented
  "security-definer tenancy helpers" replit.md describes as the mechanism backing the 22-table
  official schema's RLS policies (members read their clients, owner/operator write). Being
  SECURITY DEFINER and callable by `authenticated` is the intended shape of that pattern, not
  privilege escalation.
- **70 performance advisories** (42 unindexed FKs, 12 multiple-permissive-policies, 8
  `auth_rls_initplan`, 8 unused indexes) — all on the official 22-table schema
  (`supabase/policies/`), all INFO/WARN-level query-optimization suggestions, none affect
  correctness. Real technical debt, but editing `supabase/policies/*.sql` needs
  `metrixOfficialSecurity.test.ts` re-verification per change — not a "simple, safe, apply now" fix.
  Carried into the higher-lift plan below rather than batch-applied blind.

## Open gaps, in priority order

### 1. No GitHub Actions CI runs the app's test/typecheck/build suite

`.github/workflows/` contains exactly one workflow, `supabase-policies.yml`, and it only validates
`supabase/policies/**` changes (dry-run on PR via rollback transaction, real-apply on push to `main`).
The extensive validation suite defined in `.replit`'s "Project" workflow — `api-smoke`,
`api-server-tests`, `api-codegen-drift`, `scripts-tests`, `metrix-iap-build`, `marketing-build`,
`metrix-iap-nav-routes`, `seed-fixture-drift`, `text-primary-contrast`, `css-token-contrast`,
`text-muted-contrast`, `marketing-form-e2e` — only runs when someone manually presses Run inside the
Replit workspace. **A PR can be merged into `main` on GitHub with zero automated verification**; the
only gate is whether a human happened to run the Replit workflow first. This is a real, structural gap
in "bug-free for all future accounts," since it means regressions can land silently.
Not fixed this session — needs GitHub Actions secrets (`DATABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `DEMO_ACCOUNT_PASSWORD`)
configured on the repo, which I can't do from here — flagged for the higher-lift plan.

### 2. Optimization Loop is a complete stub

Confirmed in the earlier IAP Loop execution audit (`METRIX_IAP_Loop_Execution_Audit_Phase1.md`):
`recommendation_cards`/`action_policy` are the only live fields; `visibility`,
`manager_overview_visibility`, `dismiss_policy`, `source_policy` have no code path on either side. No
generation-engine wiring exists at all for this stage (unlike Strategy/Briefs, which route through
`generationEngine.ts`). This is the largest remaining build in the IAP chain.

### 3. MST layers 2-7 are unimplemented

Layer 1 (the raw matrix grid) works. `docs/prompts/MST_TEST_ENGINE_v2.0.md`'s 7-layer spec
(column/row/diagonal analysis, variable isolation, synergy, crossmap, verdicts) is fully documented
but has no generation-engine code, no storage, and no UI. `seedTypes.ts`'s `MST` interface only models
layer 1.

### 4. Analysis Core target-shape decision still open

Two data-integrity questions flagged in the IAP Loop audit remain genuinely undecided (not simple
fixes — they're modeling decisions): whether `concept_performance`/`variable_performance` should be
full-replace or window-scoped per run, and closing the `deleteRunOutputs` rollback gap consistently
with whichever answer is chosen. Deferred pending a decision on intended semantics, not blocked on
information.

### 5. Onboarding "cold-start" spec (§8.1) is cited but missing

`docs/product/METRIX_Product_Loop.md` references an onboarding cold-start specification that isn't
present anywhere in the repo. Per CLAUDE.md's "do not invent content you cannot source" rule, this
can't be authored here — it needs to come from wherever the canonical Drive documents live.

### 6. Auth hardening: leaked-password protection disabled (Supabase Auth)

One WARN-level security advisory: `auth_leaked_password_protection` is off for the project's Supabase
Auth. Low real-world impact today — replit.md confirms Supabase Auth users are mirrored only as FK
targets (`@workspace/auth-mirror`), never used for actual login (that's custom bcrypt + DB sessions) —
but it's a one-click toggle in the Supabase dashboard (Authentication → Policies) worth flipping since
it's free defense-in-depth if that ever changes. Not something the available tools can toggle
programmatically; flagged for the user to flip directly.

## Higher-lift plan (for a dedicated build environment)

The two genuinely large builds — Optimization Loop and MST layers 2-7 — share a shape with the
Strategy/Briefs work already shipped, so the plan is to extend the same pattern rather than invent a
new one:

1. **Optimization Loop generation engine.** New `startOptimizationLoopGeneration` alongside
   `startStrategyGeneration`/`startBriefsGeneration` in `generationEngine.ts`: evidence pack from real
   performance data + existing recommendation cards, cohort-aware prompt (reusing
   `cohortContextBlock`/`resolveCohort` from Initiative 6), Zod schema for `visibility`,
   `manager_overview_visibility`, `dismiss_policy`, `source_policy`, `source='generated'` storage in
   `intelligence_cards` (or a dedicated table if the shape doesn't fit `intelligence_cards`'s existing
   generic contract — needs a schema-fit check first, same verification step that ruled out a new
   table for Strategy Map). Then wire the 4 dead UI fields identified in the Output Consistency audit
   (`ManagerOverview.tsx` for `manager_overview_visibility`, `ActionQueueView.tsx` for
   `dismiss_policy`/`source_policy` via `CaveatNote`).
2. **MST layers 2-7.** Extend `seedTypes.ts`'s `MST` interface with the layer 2-7 shapes per
   `MST_TEST_ENGINE_v2.0.md`, add a generation path in `generationEngine.ts` (or determine whether this
   should be a separate `mstEngine.ts` given the spec's size — column/row/diagonal analysis, variable
   isolation, synergy, crossmap, verdicts — before committing to co-locating it with Strategy/Briefs
   generation), storage decision (extend `local_book2_library`/`historical_matrix_4x4` vs. new table),
   then a UI pass reusing the disclosure primitives (`DetailReveal`, `ConfidenceBadge`) already
   established platform-wide.
3. **GitHub Actions CI for the full validation suite** — mirror the `.replit` "Project" workflow's
   task list (typecheck, both test suites, both builds, nav-routes, seed-fixture-drift, contrast
   checks) as a `.github/workflows/ci.yml` gating PRs into `main`, once the needed secrets are
   provisioned on the repo. This closes gap #1 above and should happen before the two builds above,
   not after — it's what keeps them from landing bugs silently.
4. **Analysis Core target-shape decision** (gap #4) — resolve full-replace-vs-window-scoped semantics
   for `concept_performance`/`variable_performance`, then fix `deleteRunOutputs` to match.
5. **Performance advisory cleanup** (the 70 INFO/WARN findings on the official schema) — batch as a
   dedicated `supabase/policies/` pass with `metrixOfficialSecurity.test.ts` re-run after each
   consolidation, since `multiple_permissive_policies` fixes involve merging `_select`/`_write`
   policies per table and `auth_rls_initplan` fixes involve wrapping `auth.<fn>()` calls in
   `(select ...)` — both are behavior-preserving in theory but need the security test suite to prove
   it per table, not applied as one blind sweep.

Items 1-2 are the actual "activate the full functional Metrix IAP app" work — everything else in this
audit is either already fixed, confirmed to not be a real gap, or scoped, low-risk cleanup that can
happen alongside them.
