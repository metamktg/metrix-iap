> **Historical planning record (July 2026).** Read for context on why later decisions were made; this is not a specification of current state — verify any specific claim against the live codebase before treating it as current fact. The P0 items below (code splitting, tab-state URL param, localStorage account persistence, CORS tightening) were rebuilt against a much-later `main` in August 2026 rather than merged from the stale branch this brief originated on.

# METRIX IAP — Roadmap Specification Briefs (P0–P3)

**Companion to:** `IAP_INFRASTRUCTURE_AUDIT_2026-07.md` (same directory)
**Purpose:** per-item technical documentation, implementation requirements, and
architectural considerations sufficient to begin development immediately.
**How to use:** each brief is self-contained. Feed one brief plus
`docs/resources/IAP_SPEC_SYNTHESIS_v1.0.md` to a development agent (or engineer)
to produce the final production spec/PR.

Conventions used by every brief:

- **Codegen workflow** — any API change means: edit `lib/api-spec/openapi.yaml`
  → `pnpm --filter @workspace/api-spec run codegen` → commit regenerated
  `lib/api-zod` + `lib/api-client-react` → `check:api-codegen-drift` must pass.
  New top-level seed keys MUST be declared in the `MetrixSeedBundle` OpenAPI
  schema or the API will silently strip them (see
  `.agents/memory/metrix-seed-openapi-schema.md`).
- **Validation gates** — a change is done when `pnpm run typecheck`, the
  affected package's vitest suites, and the `.replit` validation workflows
  (api-smoke, api-server-tests, api-codegen-drift, scripts-tests,
  metrix-iap-build, marketing-build) pass.
- **Honesty invariant** — no UI surface may fabricate, blend, or silently
  default data. Empty/pending/error states are explicit. This invariant
  overrides convenience in every brief below.
- **DB split** — Supabase = Metrix IAP data; Replit Postgres (Drizzle,
  `lib/db`) = users/sessions/workspace state. Dev and prod Replit Postgres are
  SEPARATE databases; schema changes ship via
  `pnpm --filter @workspace/db run push` per environment.

---

## P0-1 — Route-level code splitting + deferred export libraries

### Objective
Cut initial JS payload substantially without any visible behavior change.

### Current state
`artifacts/metrix-iap/src/App.tsx` eagerly imports all ~30 view components;
`vite.config.ts` has no `manualChunks`; recharts, jspdf + jspdf-autotable,
framer-motion, embla-carousel, react-icons, papaparse all land in one chunk
served to every visitor, including the pre-auth login screen.

### Technical specification
1. Convert section-level view imports in `App.tsx` to `React.lazy()` grouped
   by sidebar section (Listen, Analysis, Strategy, Briefs, Reports, MST,
   Settings, Agent). One `Suspense` boundary inside `AppShell`'s content area
   with the existing `Loader2` spinner pattern (match
   `MetrixDataContext`'s loading style).
2. Keep `LoginPage`, `ChangePasswordPage`, `ForgotPasswordPage`,
   `ResetPasswordPage`, `AdminWaitlistPage` in the entry chunk (they are the
   pre-auth surface; splitting them adds a loading flash for no win).
3. Move jspdf/jspdf-autotable behind `await import()` inside the export
   actions in `src/lib/reportExport.ts` (and any deck/export callers). The
   export button shows its existing busy state while the chunk loads.
4. Optional: `build.rollupOptions.output.manualChunks` for
   `recharts`, `framer-motion` vendor grouping. Measure before adding more.

### Implementation requirements / acceptance criteria
- `pnpm --filter @workspace/scripts run smoke:metrix-iap-build` passes; record
  before/after gzip sizes of the entry chunk in the PR description.
- Navigating between sections shows either instant render (warm chunk) or the
  standard spinner — never a blank screen or layout jump.
- All navigation tests (`nav-routes`, `focus-deeplink`,
  `inpage-nav-targets`) pass unmodified. Lazy components must remain
  compatible with the memory-location test harness
  (`src/navigation/__tests__/harness.tsx`); if tests need eager resolution,
  export the underlying components unchanged and lazy-wrap only in `App.tsx`.
- PDF export works after a hard reload with cold cache (verifies dynamic
  import path in production build, `base: BASE_PATH` respected).

### Architectural considerations
- Vite/Babel JSX-generic gotcha (`.agents/memory/vite-babel-jsx-generics.md`):
  `tsc` passing does not guarantee the Babel build passes — run the build
  smoke, not just typecheck.
- Do not code-split below section level; per-view chunks multiply round-trips
  on Replit static hosting for negligible size gains.

---

## P0-2 — URL-visible tab state, durable account selection, run-completion toasts

### Objective
Close the three daily-use polish gaps: shareable in-module tabs, account
selection that survives new tabs, and visible completion of background runs.

### Technical specification

**A. `?tab=` URL state.**
- Add `useTabParam(tabs, defaultTab)` to `pages/metrix/shared.tsx` beside
  `useFocusParam()`: reads `?tab=` via wouter `useSearch()`, validates against
  the view's tab ids (invalid → default, no crash), and writes via
  `history.replaceState` URL-param update (same mechanism as
  `AccountContext.writeUrlAccountParam`).
- Convert every `ModuleTabs` consumer from local `useState` to the hook.
  Query params only — never `#hash` (breaks the memory-location test harness,
  `.agents/memory/wouter-hash-deeplinks.md`).
- Precedence when combined with `?focus=`: focus resolution may switch the
  active tab (existing behavior wins); explicit `?tab=` applies only when no
  focus override fires.

**B. Durable account selection.**
- In `contexts/AccountContext.tsx`, change `SESSION_KEY` storage from
  `sessionStorage` to `localStorage` (bump key to `metrix_active_account_v2`;
  migrate/ignore the old key). URL `?account=` param keeps precedence —
  unchanged. Unknown persisted id (revoked grant, deleted account) must fall
  back to manager mode exactly as the URL path does today.

**C. Run-completion toasts + badge.**
- The 2.5 s poll in `ManualAnalysisControls.AnalysisControls` and the
  generation polling in `GenerationControls.tsx` already observe the
  running→terminal transition. On transition, fire the existing toaster
  (`components/ui/toaster`): success → "Analysis complete — data refreshed"
  (with account name); error → the run's `error_message`.
- Surface an attention dot on the Task Tray trigger (`TaskTrayContext`) when a
  run completes while the tray is closed; clear on open.
- No new API surface. Notification emails are out of scope (future
  Notifications-settings work).

### Implementation requirements / acceptance criteria
- Copying a URL mid-workflow (account + tab + focus) reproduces the exact
  view in a fresh browser profile with the same grants.
- New tab retains the last selected account; a member whose grant was revoked
  falls back to manager view without an error screen.
- Tab state changes do not push history entries (Back never walks through tab
  clicks).
- Tests: extend `focus-deeplink.test.tsx` with `?tab=` cases (valid, invalid,
  focus-override precedence); AccountContext unit test for localStorage
  migration + unknown-id fallback; run-transition toast test using the
  in-page harness pattern.

### Architectural considerations
- Keep all tab ids kebab-case and stable — they become part of shareable URLs
  (a de facto public contract).
- Views live in sibling files; avoid circular imports when extracting the hook
  (silent HMR-only failure, `.agents/memory/metrix-manual-analysis-runs.md`).

---

## P0-3 — CORS tightening + seed transfer compression

### Objective
Close two hygiene findings with zero product impact.

### Technical specification
1. `artifacts/api-server/src/app.ts`: replace `app.use(cors())` with an
   explicit origin allowlist derived from `getAppBaseUrl()` (app origin +
   marketing origin), `credentials: false` (auth is httpOnly same-origin
   cookie; no cross-origin credentialed use exists). Keep permissive behavior
   in dev when `NODE_ENV !== "production"` to avoid breaking the Vite dev
   server ports.
2. Verify in production: `curl -H "Accept-Encoding: gzip" -I …/api/metrix/seed`
   → if `content-encoding` is absent, add the `compression` middleware
   (mounted before routes, default filter; skip for the bytea file-serving
   endpoint if it streams).

### Implementation requirements / acceptance criteria
- Marketing site and app both load and call the API in production after the
  change; OAuth redirect flow (`metaConnect.ts`) unaffected.
- api-smoke workflow passes; document the measured seed transfer size
  before/after in the PR.

### Architectural considerations
- This is a mitigation, not the fix, for seed payload size — P1-1 is the fix.
- Express 5: adding middleware with typed params can widen `req.params`
  (`.agents/memory/express5-params-middleware-typing.md`) — compression is
  param-free, but keep it mounted at app level, not per-route.

---

## P1-1 — Per-account seed API (manager rollup + account slices)

### Objective
Replace the O(all-accounts) monolithic seed with per-account slices so payload
and latency stay O(one account) regardless of tenant growth, and refresh
becomes targeted instead of all-or-nothing.

### Current state
`GET /api/metrix/seed` (`routes/metrix.ts:446`) → `metrixSeedAssembly.ts`
runs 26 unfiltered `selectAll()` queries, groups by `account_id` in memory,
caches the whole bundle 30 s per instance, then `composeSeedForUser()` filters
per user per request. Client: single `useGetMetrixSeed()` blocking the app in
`MetrixDataContext` with `staleTime: Infinity`.

### Technical specification

**API (additive; keep the legacy endpoint until cutover completes).**
1. `GET /metrix/seed/manager` — accounts list (id, name, platform, status,
   `overview_state`), manager totals, workspace/app-level keys
   (`workspace_settings`, `variable_registry`, global concept registry inputs).
   Member view: accounts filtered to grants; totals per
   `canViewAgencyRollups` (reuse `composeSeedForUser` logic, split into
   `composeManagerForUser`).
2. `GET /metrix/seed/accounts/:accountId` — one account's full object as built
   by `buildAccountObject()` today. Auth: `requireAuth` + admin-or-granted
   (reuse `userHasAccountAccess`); 403 on missing grant, 404 unknown id.
3. Assembly refactor: every `selectAll(table)` gains an
   `.eq("account_id", id)` variant; global tables (`app_config`,
   `variable_registry`, `concept_intelligence` if account-agnostic) load once
   for the manager payload. `groupByAccount` disappears from the hot path.
4. Caching: replace the whole-bundle cache with per-key cache entries
   (`manager`, `account:<id>`) with the same 30 s TTL;
   `invalidateMetrixSeedCache(accountId?)` becomes key-scoped. Add a weak
   `ETag` per key (hash of assembled JSON) and honor `If-None-Match` → 304.
5. OpenAPI: add `MetrixManagerSeed` and `MetrixAccountSeed` schemas (subset
   split of `MetrixSeedBundle`); run codegen. The account schema must carry
   every key currently under an account object or it will be stripped.

**Client.**
6. `MetrixDataContext` loads only the manager seed (app renders once the
   light payload lands). New `useAccountSeed(accountId)` hook (generated
   `useGetMetrixSeedAccount`) with query key per id; account-scoped views get
   the account object via a thin provider mounted by `ModuleScopeGate`'s
   configured branch — view code below the gate keeps its current props/shape
   (adapter functions in `metrixSeedAdapter.ts` re-pointed, signatures
   preserved where possible).
7. Refresh semantics: run completion invalidates `["metrix-seed-account", id]`
   + manager totals key only. Enable `refetchOnWindowFocus: true` (cheap
   under ETag/304). Keep `retry: false` honesty.
8. Loading states: switching to a cold account shows a module-area spinner
   (not full-screen); 503 keeps the existing "data layer unavailable" surface
   per-module.

**Cutover.**
9. Ship server first (legacy endpoint intact) → migrate client → delete
   legacy endpoint + `GetMetrixSeedResponse` in a final PR. Refresh the test
   fixture (`test-fixtures/metrix_seed_bundle.json`) into split fixtures from
   the live endpoints (`.agents/memory/metrix-iap-test-seed-fixture.md`).

### Implementation requirements / acceptance criteria
- Payload: manager seed ≤ ~30 KB for pilot data; account seed equals today's
  per-account subset; combined first-paint transfer strictly smaller than the
  current bundle.
- A member with one grant triggers zero queries for other accounts' rows
  (verify via query filters in code review + a service-role row-count test).
- Second navigation to the same account within a session performs no network
  fetch (staleTime) and window refocus produces a 304, not a body.
- All existing view tests pass against split fixtures; `account-scoping`
  suite unchanged in assertions (leakage guarantees preserved).
- Legacy endpoint removal lands only after the client PR is verified in
  production.

### Architectural considerations
- This preserves the honesty principle: pending/unconfigured accounts return
  their honest shape from the account endpoint; nothing changes about what is
  shown, only how much is transferred.
- Per-instance cache incoherence shrinks (30 s per account key) but only
  P2-1's single-instance/shared-cache step eliminates it — sequence P1-1
  first; it reduces what needs to be coherent.
- `iap_runs`, `ads`, `account_modules` are per-account; make sure the split
  doesn't orphan `signal_cards` (account-filtered today via
  `modulesFor`/scoping — confirm each table's owner during the refactor and
  document it in the assembly header comment).
- Watch Orval Params-name collisions with mixed path+query operations
  (`.agents/memory/orval-params-collision.md`): prefer pure path params.

---

## P1-2 — Explicit loop-status state machine + sidebar readiness cues + onboarding checklist

### Objective
Turn the honest empty states into a guided path: every account (current and
future) exposes an explicit per-stage state machine, and the UI uses it for
sidebar cues and a Connect → Upload → Run → Explore checklist.

### Technical specification

**Data contract.**
1. Extend the seed's `loop_status` (already typed as `LoopStageStatus[]` in
   `seedTypes.ts`) into the canonical stage state machine, assembled
   server-side in `buildAccountObject()`:
   `stage ∈ {connect, data_intake, analysis, listen, strategy, briefs, mst, optimization}`,
   `state ∈ {available, pending, ran, not_applicable}`, plus
   `ran_at?`, `reason?` (for `not_applicable`, e.g. "manual account without
   creative uploads"), `action?` (route for the next step, e.g.
   `/app/account?focus=run-analysis`).
   Derivation rules come from data already assembled: account status,
   presence of staged imports, latest `iap_runs`/analysis run, generated
   strategy/briefs rows, MST module payloads, `optimization_loop` null-ness.
2. Declare the extended shape in the OpenAPI account schema (P1-1's
   `MetrixAccountSeed` if landed; otherwise `MetrixSeedBundle`) — silent-strip
   gotcha applies.

**Sidebar readiness cues.**
3. `useNavBadges.ts` gains a readiness map derived from the active account's
   `loop_status`; `Sidebar.tsx` renders a subtle per-section state: dimmed +
   small "setup" dot for stages with no data, normal for `ran`/`available`.
   Manager view: no cues (aggregates only). Never hide or disable sections —
   the destination page's gate explains; cues are orientation, not gating.

**Onboarding checklist.**
4. `AdAccountOverview.tsx`: when any core stage (connect/data_intake/analysis)
   is not `ran`, render a checklist card above the fold listing the ordered
   stages with state icons and the `action` deep link per row (reuse
   `LoopAction`/`CrossLink` primitives). Fully derived from `loop_status` —
   no hardcoded per-account logic. Disappears (collapses to a compact "loop
   health" strip) once core stages have run.

### Implementation requirements / acceptance criteria
- A brand-new manual account walks the checklist end-to-end: create →
  upload CSVs → run analysis → checklist collapses; every link lands on the
  correct surface with correct focus.
- Live-OAuth accounts show `data_intake` as `not_applicable` with reason
  (report pulls replace CSV staging) — states must reflect each account
  type honestly.
- Unit tests for the derivation function (pure, table-driven: given rows →
  expected stage states); component tests for checklist rendering per state
  and sidebar cue mapping; `account-scoping` suite extended to assert cues
  follow the active account.
- No fabricated states: a stage is `ran` only when real rows exist (same
  sources `buildAccountObject` uses today).

### Architectural considerations
- This brief makes P2-2 (optimization stage) legible on day one: it ships as
  a `pending` stage row with `reason: "optimization engine not yet enabled"`,
  flipping states when P2-2 lands.
- Keep derivation server-side (single source of truth, testable, and the
  client never re-implements honesty rules).

---

## P2-1 — Durable background runs (reserved-VM step, then jobs-table queue)

### Objective
Generation/analysis runs survive deployment scaling events; in-memory state
(seed cache, login rate limits) becomes coherent.

### Technical specification

**Step 1 — deployment (no code).**
1. Move the API service from autoscale to a reserved/always-on single
   instance in the Replit deployment config. Frontend/marketing stay static.
   This alone removes: mid-run instance death, per-instance cache
   incoherence, rate-limit dilution.

**Step 2 — jobs-table queue (code; ship when generation volume grows).**
2. New Drizzle table `jobs` in `lib/db/src/schema/` (Replit Postgres):
   `id`, `kind` (`analysis | strategy | briefs | optimization`),
   `account_id`, `payload` (jsonb), `status`
   (`queued | running | success | error`), `attempts`, `max_attempts`,
   `run_id` (links to the domain run row), `locked_at`, `locked_by`,
   `created_by`, timestamps. Partial unique index on
   `(account_id, kind) WHERE status IN ('queued','running')` — mirrors the
   existing one-running-run guard.
3. Worker loop inside the API process (single instance from step 1): poll →
   claim via `UPDATE … SET locked_at, locked_by WHERE status='queued'
   … RETURNING` → execute the existing engine functions
   (`generationEngine`/`analysisEngine` bodies extracted from their
   `void (async …)` wrappers into exported `execute*` functions) → terminal
   status. Startup sweep: requeue rows with expired `locked_at` (lease
   timeout) up to `max_attempts`, else mark `error` — replaces today's
   stale-`running` flip and adds bounded retry with backoff for
   transport-level failures (validation failures still fail fast, one repair
   retry unchanged).
4. Route handlers (`metrixGeneration.ts`, `metrixAnalysis.ts`) change only
   the kickoff: insert domain run row + enqueue job; still 202 + `run_id`.
   Client polling contract unchanged.

### Implementation requirements / acceptance criteria
- Kill the API process mid-generation: on restart the job re-runs (attempts
  < max) or lands in honest `error` with message; never a permanent
  `running` row; UI reflects the outcome via existing polling.
- Concurrent duplicate kickoff still 409/no-ops via the unique index.
- `pnpm --filter @workspace/db run push` applied per environment (dev/prod
  are separate databases — deploy note required in the PR).
- Tests: in-process route tests (boot real app,
  `.agents/memory/in-process-route-testing.md`) covering enqueue, claim,
  lease-expiry requeue, max-attempts exhaustion; engine execute functions
  unit-tested exactly as today.

### Architectural considerations
- Keep the queue in Replit Postgres, not Supabase: jobs are operational
  workspace state, matching the established split; and the worker shares the
  API's DB connection/config.
- The worker stays in-process by design (one reserved instance). If the API
  later scales horizontally, `locked_by` + lease semantics already permit
  moving the worker to a dedicated process without schema change.
- Generation calls go through the Replit AI integration
  (`lib/integrations-anthropic-ai`, model `claude-sonnet-4-6` pinned in
  `generationEngine.ts`); backoff must respect its rate-limit errors
  distinctly from validation errors.

---

## P2-2 — Optimization loop engine (`kind: "optimization"`)

### Objective
Implement the runtime for `docs/prompts/IAP_OPTIMIZATION_LOOP_v2.0.md` —
cohort-aware variable re-weighting, lift detection, and feed-forward — closing
the compounding loop the platform promises.

### Technical specification
1. **Engine**: new `optimizationEngine.ts` in `artifacts/api-server/src/lib/`
   following `generationEngine.ts`'s exact lifecycle (run row `source:
   'generated'`, one running run per account+kind, Zod schema + one repair
   retry, sanitize, hallucinated-reference dropping, replace-not-merge).
2. **Evidence pack** (from real Supabase rows only): latest analysis run's
   `performance_by_cell` / `variable_performance` / `library_cell_performance`,
   prior `message_pillars` + `testing_hypotheses` (imported and generated),
   `iap_runs` history, account result terminology (server-side equivalent of
   `resultTerm`), and the cohort's terminal metric per the v2.0 spec
   (direction-normalized performance index — NOT roas-based; hard DB
   constraint already bans ROAS alert rules).
3. **Output contract** (Zod + OpenAPI): re-weighted variable scores with
   rationale and source refs; updated strategic priorities feeding
   `IAP_STRATEGY_MAP`/`IAP_BRIEF_BUILDER` inputs; recommendation cards for
   the seed's `optimization_loop` object (`recommendation_cards`,
   `action_policy`, `dismiss_policy` — types already exist in
   `seedTypes.ts`); explicit forecast fields generalized to the cohort's
   terminal metric.
4. **Learning-registry gating (non-negotiable)**: `learning_registry` writes
   require a matching run-scoped `approval_events` row — enforced by the
   existing BEFORE INSERT/UPDATE trigger. The engine therefore writes its
   outputs in two tiers: (a) proposals (recommendation cards, re-weighting
   suggestions) land immediately in engine-owned tables/modules; (b) durable
   learning entries are written ONLY through an explicit approval endpoint
   (`POST /metrix/accounts/:id/optimization-runs/:runId/approve`, admin-only)
   that records the approval event and then the registry rows. The UI never
   implies a learning was committed before approval.
5. **Trigger surface**: `POST /metrix/accounts/:id/generate/optimization`
   (202 + run_id) via the P2-1 queue if landed, else the existing
   fire-and-forget pattern. Gate availability on `loop_status`: requires
   `analysis: ran` and at least one strategy generation.
6. **UI**: `optimization_loop` stops being null after a successful run —
   `AdAccountOverview`'s existing loop section and
   `listen/RecommendationsView.tsx` render the real cards; approval action
   surfaces admin-only; P1-2's stage row flips `pending → ran`.

### Implementation requirements / acceptance criteria
- With no optimization run: `optimization_loop` remains null and all UI shows
  the honest pending state (unchanged).
- After a run: recommendations render with source references that resolve
  (cell ids validated against the account's real cells — dropped otherwise);
  approving as admin writes `approval_events` then `learning_registry`;
  attempting registry writes without approval fails at the trigger (add a
  security test alongside `metrixOfficialSecurity.test.ts`).
- Re-running replaces prior generated optimization output atomically (delete
  prior generated → insert), matching strategy/briefs semantics.
- Formula fidelity: implement scoring/lift thresholds exactly as
  `IAP_OPTIMIZATION_LOOP_v2.0.md` §scoring defines (direction-normalized
  index, percentage-based lift detection, change-rate limits); unit-test the
  scoring math table-driven, independent of the model call.
- Model output is advisory: all numeric scores are computed
  deterministically server-side from real rows; the model writes narrative,
  prioritization rationale, and recommendations — never the numbers the UI
  displays as measurements (honesty invariant).

### Architectural considerations
- Cell-code alignment: generated codes must align to the historical grid,
  not fetch order (`.agents/memory/metrix-mst-methodology.md`).
- Closed-loop back-references are filled at generation time
  (`linkClosedLoop()` pattern, `.agents/memory/metrix-iap-closed-loop.md`) —
  optimization outputs referencing pillars/briefs/cells follow the same
  IIFE-at-gen-time approach.
- Keep prompts in `docs/prompts/` as the spec of record; the engine's prompt
  builder cites the doc version it implements (as `generationEngine` does).

---

## P3-1 — Server-side per-user view preferences

### Objective
Metric-tile layout, metric selections, and sort preferences follow the user
across devices instead of living in one browser's `localStorage`.

### Technical specification
1. New Drizzle table `user_view_prefs` (Replit Postgres,
   `lib/db/src/schema/userViewPrefs.ts`): `user_id` FK, `pref_key` (e.g.
   `overview_metric_tiles`, `library_sort`, `metric_selection:<view>`),
   `value` jsonb, timestamps; unique `(user_id, pref_key)`. Model on
   `workspaceReportSettings.ts` (existing per-workspace override pattern —
   `.agents/memory/metrix-settings-persistence.md`: defaults stay in
   seed/catalog, DB rows are overrides merged client-side).
2. API: `GET /metrix/me/prefs` (all prefs for the session user, fetched once
   post-auth) and `PUT /metrix/me/prefs/:prefKey` (validated size cap ~8 KB,
   Zod per known key with passthrough for forward-compat). Session-scoped —
   no workspace/account authorization complexity.
3. Client: a `UserPrefsProvider` replacing direct `localStorage` reads in
   `MetricPicker`/`useMetricSelection`/`useSegmentMetricSelection`/
   `rankSort` with a read-through hook: server value → fallback to legacy
   localStorage value (one-time migration write-back) → catalog default.
   Writes are optimistic with debounce (~1 s) — preference saves must never
   block interaction.

### Implementation requirements / acceptance criteria
- Same account on two browsers converges (last-write-wins is acceptable and
  documented); logout/login on a fresh device restores tiles/sorts.
- Prefs are per-user, not per-workspace: two members see their own layouts.
- Legacy localStorage users keep their setup (migration path tested).
- API mirrors auth failure modes in the OpenAPI spec (401 declared —
  `.agents/memory/metrix-auth.md`); drift gate passes.

### Architectural considerations
- Keep the pref registry (known keys + their Zod shapes) in one module shared
  by client and spec to prevent key sprawl.
- Do not put prefs in the seed bundle — they are user state, fetched in
  parallel with (not blocking) the manager seed.

---

## P3-2 — Run-ledger UI

### Objective
Per-account, user-visible history of every analysis/generation/optimization
run: what ran, when, by whom, outcome, and what it replaced — the trust
surface agencies show clients.

### Technical specification
1. API: `GET /metrix/accounts/:id/runs?limit&cursor` merging domain run rows
   (manual analysis runs, generation runs incl. optimization, live Meta
   report pulls) into one reverse-chronological ledger:
   `{run_id, kind, status, model?, created_by, created_at, finished_at?,
   date_window?, rows_ingested?, replaced_prior?: boolean,
   error_message?}`. Admin-or-granted authorization (as P1-1).
2. UI: "Runs" tab (uses P0-2's `?tab=` hook) on `AnalysisOverview` —
   compact table (existing `tables.tsx` primitives + `StatusBadge` pattern),
   kind/status filters, empty state via `PendingState`. `?focus=<run_id>`
   deep-links a row (existing focus convention + `StaleFocusNotice`).
3. Generated-report snapshots (`workspace_reports`) already have History —
   link ledger rows of kind `strategy|briefs` to their report history entry
   where one exists.

### Implementation requirements / acceptance criteria
- Every run visible in the ledger corresponds to a real DB row; no synthetic
  entries; running rows update via the existing polling cadence when a run is
  active.
- Members see ledgers only for granted accounts (403 otherwise — spec
  mirrors auth).
- Cursor pagination tested with >1 page; ordering stable across kinds.

### Architectural considerations
- Read-only merge endpoint — no schema changes; keep the merge in the API
  (single place that knows all run sources).

---

## P3-3 — Accessibility contrast pass (10–11 px muted tier)

### Objective
Meet WCAG 2.1 AA contrast for all information-bearing text; establish a
minimum readable tier so future views can't regress.

### Technical specification
1. Inventory: grep the app for `text-[10px]`/`text-[11px]` combined with
   `muted-foreground/<60` and low-opacity foreground tints; classify each as
   information-bearing (data, labels users must read) vs decorative
   (section eyebrows, watermarks).
2. Define semantic utility tiers in `index.css` alongside `mx-card`:
   `mx-text-detail` (min 12px / ≥4.5:1 against `mx-app-bg` and card
   backgrounds) and `mx-text-decorative` (may stay smaller/dimmer; must not
   carry data). Replace raw utility stacks on information-bearing instances;
   leave decorative ones on the decorative tier.
3. Verify programmatically: a small script (or vitest with jsdom + computed
   styles on the shared primitives) asserting the tier tokens' contrast
   ratios against the app background tokens; add contrast values as comments
   next to the tokens.

### Implementation requirements / acceptance criteria
- All badge/label/table-cell text that conveys data measures ≥4.5:1
  (spot-check `ConfidenceBadge`, `ImpactBadge`, `CaveatNote`,
  `RangeScopeBar`, table secondary cells).
- No layout breakage: run the full view test suites + build smoke; visual
  spot-check the densest views (IAP Library, Matrix Builder).
- Add the tier rule to the UI conventions (module contract doc / design
  skill reference) so new views adopt it.

### Architectural considerations
- Change tokens/primitives, not 200 call sites, wherever a shared component
  (`shared.tsx`, badges) is the source — the audit found most low-contrast
  text flows through these primitives.

---

## P3-4 — Move `exports/` out of git

### Objective
Stop 34 MB (and growing) of generated exports from taxing every clone/CI
checkout; keep `attached_assets/` (61 MB) as frozen historical reference.

### Technical specification
1. Relocate generated export artifacts to Supabase Storage (private bucket,
   service-role writes; served through an authenticated API proxy route,
   consistent with the bytea file-serving pattern — mind the `\x` hex prefix
   gotcha if any content transits bytea).
2. Remove `exports/` from the working tree, add to `.gitignore`; leave git
   history rewrite OUT of scope (coordination cost > win); document that
   clones stay heavy until a future history cleanup.
3. Re-point anything that reads/writes `exports/` (scripts, export flows —
   inventory first; the PNG ad-export pipeline in
   `.agents/memory/exact-dim-ad-export.md` writes here).
4. `attached_assets/`: no relocation; add a README declaring it frozen
   (reference-only, no new files) — new source docs go to `docs/`.

### Implementation requirements / acceptance criteria
- Export generation and download still work end-to-end in dev and prod
  (authenticated route, correct content-type, non-owner denied).
- Fresh clone size reduction recorded in the PR; `.replitignore` reviewed so
  deploy bundles exclude any remaining local artifacts.
- No script references a deleted path (scripts-tests + api-smoke pass).

### Architectural considerations
- Storage choice keeps the two-database split clean: files are Metrix data →
  Supabase side; access control stays in the API (session auth), matching
  every other file surface.

---

## Cross-item sequencing and dependencies

```
P0-1, P0-3 ──────────────► independent, ship first
P0-2 ────────────────────► independent; ?tab= hook is a dependency of P3-2
P1-1 ────────────────────► before P1-2 (schema home) and before P2-1 step 2
P1-2 ────────────────────► exposes P2-2's stage from day one
P2-1 step 1 (reserved VM)► anytime; recommended alongside P1-1 cutover
P2-1 step 2 (queue) ─────► before or with P2-2 (optimization runs use it)
P2-2 ────────────────────► after P1-2; after P2-1 step 2 preferred
P3-* ────────────────────► independent of each other; P3-2 needs P0-2
```
