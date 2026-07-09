# METRIX IAP — Master Implementation Prompt (Replit Agent)

## 0. Read This Before Touching Anything

This is not a greenfield build. `app.metrix.ad` is a live Replit project with a working waitlist → admin-approval → login flow, and the 22-table schema in this repo is **already deployed** to its connected Supabase instance. You are not creating a new project, not re-running migrations that already exist, and not replacing the login/admin panel. You are filling in `apps/` and `packages/`, which are currently empty skeletons (`.gitkeep` only), plus writing the RLS policies and Edge Functions this repo's own docs flag as pending.

**First action, before writing any code:** inspect the live Supabase instance and the live Replit app code directly. Confirm and report back on these three things before proceeding to Phase 1:

1. Do the 22 tables in `supabase/migrations/` match what's actually deployed, table-for-table? Flag any drift.
2. When the admin panel approves a waitlist request, does that action create a row in `auth.users`? Several tables (`review_events.reviewer_id`, `human_edits.editor_id`, `approval_events.approver_id`) foreign-key to `auth.users(id)`. If approved users are not provisioned into `auth.users`, those columns will never populate correctly and this is a Phase 0 blocker — stop and report rather than building around it.
3. Where does the existing login/session code live in the current Replit file tree? Map it before writing anything in `apps/web` so nothing gets overwritten.

Do not proceed past Phase 0 until these three are answered.

## 1. Confirmed Current State (do not re-verify, do not re-derive)

- Meta Developer App: **Metrix IAP**, App ID `2225854528231550`, currently in **Development mode** (unpublished). Any Facebook user completing OAuth must already be added under App Roles (admin/developer/tester) with access to the target ad account — the app cannot authorize arbitrary outside users yet.
- Pilot ad account: `act_1202182091204847`, currency USD, timezone America/New_York. Readable via `ads_read`, confirmed through Graph API Explorer (not yet through the app's own OAuth flow).
- Two IAP report routes are validated against the Marketing API and return correctly with pagination: `IAP_DEMOGRAPHIC_TEXT_SIGNAL` (age/gender/`body_asset.text`) and `IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL` (device/`publisher_platform`/`platform_position`).
- Supabase connection strings and the Meta App ID are already set as Replit environment secrets. Do not prompt the user for them, do not hardcode them, reference `process.env` per `.env.example`.
- Onboarding flow already specced (waitlist → approve → login → Connect Meta Ad Account → OAuth with `ads_read` → select account → save to Supabase → run the two report pulls) — this repo's job is to give that flow somewhere real to write its output.

## 2. Hard Constraints — Non-Negotiable, Do Not Relax For Convenience

These come directly from the schema and are enforced at the DB level. Any application code that works around them instead of respecting them is wrong.

- **Read-only against Meta.** `ads_read` only. No `ads_management`. No campaign create/edit/pause/mutate, anywhere, ever, including "just for testing."
- **BSIL is suggestion-only.** `bsil_suggestions.budget_scope_object` is check-constrained to `campaign` / `ad_set`. Nothing in this system executes a budget change against a live account. It writes a suggestion row. A human acts on it outside this system.
- **No ROAS alerts.** `alert_rules.metric` is check-constrained `<> 'roas'`. ROAS stays a reporting metric only. Do not add a ROAS alert path even if a future ticket asks for it — that requires a schema change and a deliberate decision, not an app-layer bypass.
- **Learning registry requires explicit human approval.** `learning_registry` writes only happen through an `approval_events` row with `approved_for = 'learning_registry'`. No analysis output feeds `IAP_OPTIMIZATION_LOOP` automatically. If your worker code writes to `learning_registry` without checking for that approval row first, it's wrong.
- **Manual creative intake requires ≥ 5 assets.** Enforce this at the API layer before it ever reaches the DB constraint.
- **Creative identity resolves through `concept_code` first, `ad_id` as fallback.** There is no `creative_id` field. Don't invent one.
- **Cohorts are first-class and never blended.** Every `analysis_runs` row snapshots against one cohort. `lead_gen` and `service` are distinct cohort rows that intentionally share `required_metric_block = 'service_18'` — this is a resolved design decision (July 6, 2026), not a bug to "fix" by merging them.

## 3. Build Order

Work in this order. Each phase has an explicit acceptance gate — do not start the next phase until the current one's gate is met and reported back.

### Phase 0 — RLS + Verification (blocking, see Section 0)
- Write RLS policies for all 22 tables per `supabase/policies/README.md` (currently a stub — this is the actual work item).
- Minimum bar: a client can only read/write rows scoped to `client_id` values they have a `client_memberships` row for. Service-role bypasses RLS for backend jobs only, never for anything reachable from `apps/web`.
- Write the security tests this repo's `tests/security/README.md` and `supabase/tests/README.md` describe as pending: RLS allow/deny per table, no-ROAS-alert constraint, BSIL scope constraint, learning-registry approval gate.
- **Gate:** all security tests pass, and you've answered the three verification questions in Section 0.

### Phase 1 — `packages/connectors` (Meta Marketing API, read-only)
- Build the connector against the two already-validated report routes only. Do not build additional report types speculatively.
- OAuth flow must request `ads_read` only. Store and refresh tokens; do not assume they're long-lived.
- Target account for pilot testing: `act_1202182091204847`.
- Write to `analysis_run_inputs`, not directly to `analysis_runs` — inputs are raw, runs are the processed record.
- **Gate:** a manual trigger pulls both report types against the pilot account and lands rows in `analysis_run_inputs` with correct pagination handling.

### Phase 2 — `packages/schemas` + `packages/db`
- Typed models for all 22 tables, matching the migrations exactly. Generate from the live schema, don't hand-write and risk drift.
- **Gate:** typed client compiles against the actual deployed schema with zero manual overrides.

### Phase 3 — `packages/iap-engine`
- This wraps the 7 v2.0 prompt documents in `docs/prompts/` (`IAP_ANALYSIS_CORE`, `IAP_DATA_BUNDLE_PREP`, `IAP_STRATEGY_MAP`, `IAP_BRIEF_BUILDER`, `IAP_REPORT_SUMMARY`, `IAP_OPTIMIZATION_LOOP`, `MST_TEST_ENGINE`) as callable functions. These prompt docs are the source of truth for behavior — do not paraphrase or "improve" their logic while wiring them up. If something in a prompt doc looks wrong or ambiguous, stop and flag it rather than silently reinterpreting it.
- Each function takes the cohort-resolved input (via `cohort_definitions`), calls the model, and validates the output shape against `packages/schemas` before it's allowed to write anywhere.
- **Gate:** `IAP_DATA_BUNDLE_PREP` → `IAP_ANALYSIS_CORE` runs end to end against a real pull from Phase 1 and produces a schema-valid `intelligence_cards` row.

### Phase 4 — `apps/worker`
- Orchestrates: trigger → connector pull → data bundle prep → analysis core → downstream prompt chain → write to `analysis_runs` / `analysis_run_stages` / `intelligence_cards` / `reports`.
- Every write that touches `learning_registry` must check for the required `approval_events` row first — see Section 2.
- **Gate:** one full pilot run, triggered manually, completes every stage in `analysis_run_stages` without a human touching intermediate steps.

### Phase 5 — `apps/api`
- Thin layer over the worker + connectors for `apps/web` to call. No business logic here beyond auth/validation — logic lives in `iap-engine` and `worker`.
- **Gate:** every route has an integration test per `tests/integration/README.md`.

### Phase 6 — `apps/web`
- This is the phase most likely to collide with existing code. Map new UI onto the existing login/session/admin-panel code identified in Section 0 — do not scaffold a parallel auth system.
- Minimum surface: Connect Meta Ad Account → OAuth → account picker → trigger pull → view `intelligence_cards` / `reports` for the connected account.
- **Gate:** a real user, approved through the existing admin panel, can log in, connect `act_1202182091204847`, and see a completed analysis run without any manual DB intervention.

## 4. Explicit "Do Not" List

- Do not touch `ads_management` scope anywhere in the OAuth request or token usage.
- Do not write application code that pauses, edits, or creates Meta campaigns, ad sets, or ads.
- Do not rebuild or replace the existing waitlist/admin-approval/login flow. Extend it.
- Do not merge `lead_gen` and `service` cohorts, and do not add a `creative_id` field.
- Do not add a ROAS alert path or relax the BSIL scope constraint.
- Do not let `learning_registry` writes skip the approval-event check.
- Do not build additional Meta report routes beyond the two validated ones without an explicit go-ahead — scope creep here is how "pilot" turns into an unshippable build.
- Do not treat this document's Phase gates as optional or reorderable. If Phase 0's questions come back with a real blocker (e.g., approved users aren't landing in `auth.users`), stop and report it before writing Phase 1 code.

## 5. What "Done" Looks Like For This Pass

A test user goes through the existing waitlist, gets approved through the existing admin panel, logs in, connects `act_1202182091204847` through Meta OAuth with `ads_read` only, and the platform runs both validated report pulls, processes them through the IAP prompt chain, and shows a real `intelligence_card` on screen — with RLS enforced the entire way, and every hard constraint in Section 2 intact and tested, not just assumed.
