# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run test` — API server tests (vitest; includes password-reset token cleanup tests against the dev Replit Postgres DB)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run import:metrix` — (re)apply Metrix Supabase schema and import the Bookster IAP loop package AND the LittleData package (`scripts/data/metrix/littledata/`: 2 Meta re-export CSVs (July 2026, funnel columns: link clicks/clicks-all/ATC/IC/purchases/revenue + a conversion-device pivot) + analysis JSONs; account `littledata`, Meta id from bundle metadata; bundle_prep, analysis_core, strategy_map + brief_builder complete per the July 2026 full-loop run — creative_scan + optimization_loop stay honestly pending) (idempotent). The importer asserts CSV internal consistency (funnel sums vs account totals, device purchases vs demo purchases) and aborts loudly on drift. If `scripts/data/metrix/meta_ads_export.json` exists (`{meta_ad_account_id, ads: [{ad_name, meta_ad_id, creative_asset_url}]}`), it backfills `ad_accounts.meta_ad_account_id` + `ads.meta_ad_id`/`creative_asset_url` and logs unmatched ad names.
- Required env: `DATABASE_URL` — Replit Postgres connection string (waitlist)
- Required secret: `SUPABASE_DB_URL` — Supabase session-pooler Postgres URI (Metrix data importer)
- Required env: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — used by the API server to read Metrix data via supabase-js
- Optional secret: `ADMIN_API_KEY` — admin bearer key gating GET /api/metrix/agent-waitlist (waitlist emails). Endpoint fails closed (401) when unset; admins enter the key in Settings → Metrix Agent waitlist.
- Optional secret: `RESEND_API_KEY` — enables the request-access notification email to meta@metamktgagency.com (Resend REST API). When unset, submissions are still stored in Supabase and the server logs an explicit "notification skipped" warning. Optional: `REQUEST_ACCESS_FROM_EMAIL` to override the Resend from-address (defaults to onboarding@resend.dev sandbox sender).
- `pnpm --filter @workspace/scripts run create:user x@y.com [password]` — create or reset a Metrix IAP user account (positional args; prints a generated temp password if none given; always forces a password change on first login)
- `pnpm --filter @workspace/scripts run migrate:metrix-official` — apply the official METRIX 22-table schema to Supabase (`supabase/migrations/` + `supabase/seed/` apply-once with sha256 checksums tracked in `_metrix_migrations`, drift aborts; `supabase/policies/` re-applied every run). Preflight aborts if the legacy `creative_briefs` compat view still exists.
- `pnpm --filter @workspace/scripts run mirror:auth-users` — backfill all Replit Postgres users into Supabase Auth (idempotent; fills `users.supabase_user_id`)

## Auth (Metrix IAP)

- Custom email/password auth: bcryptjs (12 rounds) + DB-backed sessions (`user_sessions`, sha256-hashed 32-byte tokens, 30-day expiry) in an httpOnly `metrix_session` cookie (SameSite=Lax). Routes: `/api/metrix/auth/{login,logout,me,change-password}`.
- Unauthenticated visitors to the IAP app see a login landing page with a "Request access" button linking to the marketing sign-up form (`/www/#request-access`) and a "Learn more" link to the marketing site (`/www/`). The old inline email-only waitlist form was removed from the login page (July 2026) — all new sign-ups go through the marketing Request Access form (Supabase `request_access`, shared across dev/prod). The `agent-waitlist` endpoint remains for admin flows. Marketing `Home.tsx` handles hash scroll on mount (React renders after the browser's native hash jump).
- Admin flow: Settings → Metrix Agent waitlist (gated by `ADMIN_API_KEY` bearer key entered in the UI) shows entries with status badges and an Approve button. Approving provisions a user with a temp password and `must_change_password=true`, then emails the password via Resend (`RESEND_API_KEY`). If email can't be sent, the temp password is returned in the approve response and shown to the admin with a copy button — share it manually.
- Admin console at `/admin` (standalone page, no user login needed): gated by the `ADMIN_PANEL_PASSWORD` secret. Login (`POST /api/metrix/admin/session`, rate-limited 10/10min, fails closed when secret unset) sets a stateless HMAC-signed 12h httpOnly `metrix_admin` cookie (signed with `SESSION_SECRET` — rotating either secret invalidates admin sessions). Shows BOTH lists: access-request form submissions (Supabase `request_access`, full form data) and waitlist emails (Replit Postgres `agent_waitlist`), each with Approve/Reject. Approve uses the same provisioning path as the Settings panel (temp password email; copy-button fallback when email undeliverable). Strict lifecycle: only `pending` entries transition; approve-after-reject and reject-after-approve return 409. `requireAdmin` accepts the admin cookie OR a Bearer `ADMIN_API_KEY`. Waitlist status enum now includes `rejected`.
- Email delivery (July 2026): all outbound email goes through `artifacts/api-server/src/lib/email.ts` (`sendEmail` → `{status: sent|skipped|failed, reason}`; detects Resend sandbox 403s and produces an actionable fix hint). `getEmailConfig()` reports mode `missing_key` (no RESEND_API_KEY) / `sandbox` (default onboarding@resend.dev sender) / `configured` (custom REQUEST_ACCESS_FROM_EMAIL). `GET /api/metrix/admin/email-status` (requireAdmin) exposes mode+from+environment; the admin console shows a banner explaining delivery limits and that approvals only create accounts in the current environment. When any credential email fails, the response carries `email_error` plus the credential (temp password or reset link) for manual sharing.
- Admin user management (July 2026, all behind `requireAdmin`): `GET /api/metrix/admin/users` lists provisioned accounts (status: active/invited/disabled). Per-user actions: `POST .../users/:id/resend-temp-password` (rotates password, forces change, destroys sessions + reset tokens; 409 if disabled), `POST .../users/:id/send-password-reset` (1h single-use link; 409 if disabled), `POST .../users/:id/revoke` (sets `users.disabled_at`, destroys all sessions + reset tokens), `POST .../users/:id/restore` (clears `disabled_at`; old password still works). Disabled users: login/sessions/password-reset all rejected with generic messages (no enumeration); re-approval also clears `disabled_at`. The admin console has a "Provisioned users" section with these actions (revoke has an inline confirm).
- First login with a temp password forces a password-change screen; changing the password revokes all other sessions.
- Self-service password reset: "Forgot password?" on login → `/forgot-password` (neutral response, no account enumeration) → Resend email with `/reset-password?token=...` link (single-use sha256-hashed 32-byte token, 1h expiry, `password_reset_tokens` in Replit Postgres). Reset revokes ALL sessions and clears `must_change_password`. When `RESEND_API_KEY` unset, request is accepted but the server logs a "reset email skipped" warning (link not delivered).
- Brand: shared logo components — IAP `src/components/brand/BrandMark.tsx` (BrandLogo + AuthBrandHeader), marketing `src/components/BrandMark.tsx`; auth screens, Topbar, marketing header, and both email templates use the real `metrix-logo.png` (emails hot-link the hosted asset via app base URL).
- `/api/metrix/seed` and all `/api/metrix/workspaces/:workspaceId/*` routes require a session; workspace routes additionally verify `workspaceId` matches the seed's manager account id (single-workspace deployment) and return 403 otherwise.
- Settings → Team & Access shows real provisioned accounts (`GET /workspaces/:id/members` over the `users` table, single-workspace) merged over the seed roster; real accounts get Active/Invited badges and real last-login dates.
- Sign out lives in the Topbar and in Settings → Account ("Your session" card). Settings → Account also has a "Password" card (change password while signed in; revokes other sessions). A signed-in user hitting `/forgot-password` is redirected to `/app/settings/account?focus=password`, which scrolls to and briefly highlights that card (the `?focus=` deep-link convention; param is consumed on arrival).
- Login rate limit: 20 attempts / 10 min per IP+email.

## METRIX official schema (Phase 0, July 2026)

- The official 22-table METRIX schema (identity/cohorts/runs/outputs/intake/alerts/review/learning + registries) is deployed to live Supabase via `migrate:metrix-official`. Migrations are immutable once applied (checksum drift aborts); policies are idempotent and re-applied every run — evolve security by editing `supabase/policies/20260709000100_rls_all_tables.sql` and re-running the migrator.
- The legacy importer table `creative_briefs` was renamed `imported_creative_briefs` (official schema owns the `creative_briefs` name); all importer/seed-assembly code reads the new name.
- RLS on all 22 tables: security-definer tenancy helpers over `client_memberships`/`org_members`; members read their clients, owner/operator write, viewer read-only; audit tables (`review_events`, `human_edits`, `approval_events`) append-only; config-as-data tables (`cohort_definitions`, `global_variable_registry`, etc.) read-only to authenticated. `anon` is fully denied.
- Learning gate: `learning_registry` writes require an `approval_events` row with `approved_for='learning_registry'` for the exact source object, enforced by a BEFORE INSERT OR UPDATE trigger (fires even for BYPASSRLS roles like service_role). The approval must be run-scoped and its run's client must match the learning row's client (tenant-only learning in v1).
- Hard DB constraints: no ROAS alert rules, BSIL suggestions campaign/ad_set scope only, manual creative intake ≥ 5 assets.
- Auth mirroring: approving a user (admin panel or `create:user`) also provisions a Supabase Auth user via `@workspace/auth-mirror` (GoTrue admin API, idempotent, non-fatal on failure) and stores the id in `users.supabase_user_id` — these rows exist only as FK targets for `reviewer_id`/`editor_id`/`approver_id`; login remains the custom Replit-Postgres session auth.
- Security tests: `artifacts/api-server/src/lib/__tests__/metrixOfficialSecurity.test.ts` (17 tests, rolled-back transactions against live Supabase, role impersonation via `set local role` + `request.jwt.claims`). They fail loudly if the official schema isn't deployed.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/metrix-iap/` — Metrix IAP web app (React + Vite); seed types in `src/lib/data/seedTypes.ts`, adapter in `src/lib/data/metrixSeedAdapter.ts`
- `artifacts/api-server/` — Express API; Metrix seed assembly in `src/lib/metrixSeedAssembly.ts` (Supabase → seed bundle), route in `src/routes/metrix.ts`; request-access notification in `src/lib/requestAccessNotification.ts`
- `artifacts/marketing/` — public Metrix marketing site (React + Vite, served at `/www/`); all copy + `BOOK_DEMO_URL` Calendly placeholder centralized in `src/content.ts`
- `scripts/src/metrix-supabase/` — `schema.sql` (Supabase table definitions) + `import.ts` (idempotent importer)
- `scripts/data/metrix/` — raw Bookster IAP loop package files (source data for the importer)
- `lib/api-spec/openapi.yaml` — API contract; regenerate hooks/schemas with codegen after editing

## Architecture decisions

- Metrix app data lives in Supabase Postgres (per ad account, date-stamped rows); the API server assembles a seed-compatible bundle from ~28 tables at request time (30s cache) and returns 503 if Supabase is down — no static fallback by design.
- Seed assembly is account-aware (July 2026): no hardcoded account ids. Each per-account table is fetched once (no account filter) and grouped by `account_id` in memory; `buildAccountObject()` builds ANY account generically — full IAP object if the account has `ad_performance` rows, honest pending shape (`iap: null`, mst `not_available`, `overview_state` passthrough) otherwise. Manager totals sum across all accounts; the campaign-summary "across BOOK…" caveat is derived from distinct `book` values. `invalidateMetrixSeedCache()` busts the 30s cache. Unit tests in `artifacts/api-server/src/lib/__tests__/metrixSeedAssembly.test.ts`.
- Selecting a live Meta ad account (`POST /metrix/meta/select-account`) also registers it in Supabase `ad_accounts` (insert-only upsert, never clobbers importer-managed rows) with `status: "unconfigured"`, `source_status: "live_meta_connection"`, numeric `meta_ad_account_id`, and a pending `overview_state`, then invalidates the seed cache — so new accounts appear in the app switcher immediately with an honest "analysis not run yet" state. Promotion to `configured` is the future analysis pipeline's job (flip status once real per-account analysis data lands).
- `optimization_loop` is `null` and Creative Scan surfaces are empty until those IAP loop stages actually run; `loop_status` records per-stage complete/pending. UI shows honest pending states — never fabricate data.
- Account-level totals override: when an import package carries authoritative account totals exceeding the ad-level table (e.g. LittleData), the importer stores them as `iap_metadata.account_totals` (with `result_type`); seed assembly reports those as the account's campaign-summary totals and manager blend, states the ad-level coverage gap in `data_caveat`, and only rewrites per-event totals when the account has a single matching result_type (never double-counts, never fabricates rows).
- `ads.creative_asset_url` and `ads.meta_ad_id` are nullable, backfilled by dropping a `meta_ads_export.json` in `scripts/data/metrix/` and re-running the importer. The seed exposes the per-account ad registry (`ad_accounts[].ads`) + `meta_ad_account_id`; the client resolves the primary ad per creative cell (`primaryAdForCell` in `creative-assembly.ts`) so CreativeCard shows the real asset (placeholder fallback on error) and "View in Ads Manager" enables only when both `meta_ad_id` and the numeric Meta account id exist. Ads Manager deep links use the numeric Meta account id — never the internal account id.
- Waitlist + request-access stay on Replit Postgres (Drizzle); Supabase is only for Metrix IAP data.
- Live Meta connection (pilot): OAuth via Meta Graph v23.0 with `ads_read` scope only. Routes in `artifacts/api-server/src/routes/metaConnect.ts`; helpers `src/lib/metaCrypto.ts` (AES-256-GCM token encryption via `TOKEN_ENCRYPTION_KEY`; HMAC-signed OAuth state via `SESSION_SECRET`, 15-min expiry) and `src/lib/metaGraph.ts` (OAuth exchange, ad-account listing, insights pagination, payload sanitization, row normalization). Secrets: `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`; env `PILOT_MODE=true` + `PILOT_REQUIRED_AD_ACCOUNT_ID` (pilot account id comes only from env, never hardcoded). Flow: Settings → Integrations → `MetaLiveConnection.tsx` → oauth-url → `GET /api/auth/meta/callback` (exchanges code → long-lived token, encrypts, stores pending in Supabase) → account picker (pilot flagged/auto-selected) → select-account → run-reports. Two report classes (IAP_DEMOGRAPHIC_TEXT_SIGNAL: age/gender/body_asset; IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL: impression_device/publisher_platform/platform_position), same last_30d range, stored separately in Supabase (`meta_oauth_pending`, `connected_ad_accounts`, `report_pulls`, `report_rows`). Pulls insert as `running` and only flip to `success` after all row chunks commit; on failure partial rows are deleted and the pull is marked `error` — no dishonest success states. Stored raw pages are sanitized (tokens stripped from paging URLs); metric_mapping_status reports only observed fields. Once a live connection exists, the demo/seed integration panels in Settings → Integrations are hidden — live and demo data never mix. The Meta app must register both redirect URIs (prod `https://app.metrix.ad/api/auth/meta/callback` and the dev domain equivalent).
- Generated reports (`workspace_reports`, Replit Postgres) store a full `model_json` document snapshot at generate time; History/Exports downloads reproduce the snapshot exactly. Direct format-download buttons stay download-only (no persistence). Report window has no daily grain — it's labeling metadata only; sections summarize full flight. In-app generated reports can be deleted from Report History (confirmation dialog → `DELETE /metrix/workspaces/:id/reports/:reportId`, workspace-scoped, 404 if missing); seed history entries have no DB row and are not deletable.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Resend sandbox sender (`onboarding@resend.dev`, used when `REQUEST_ACCESS_FROM_EMAIL` is unset) only delivers to the Resend account owner's inbox (meta@metamktgagency.com). Sends to any other recipient are rejected with 403 — so approval emails and reset emails to other users will NOT arrive until a domain is verified at resend.com/domains and `REQUEST_ACCESS_FROM_EMAIL` is set to a sender on that domain. The admin console banner and `email_error` fields surface this live.
- Dev and prod have SEPARATE Replit Postgres user databases: approving someone in the dev admin console does NOT create their account on app.metrix.ad (production). Approve in the environment where the user will log in — the admin email-status banner shows which environment you're in.
- If password reset requests 503 with `relation "password_reset_tokens" does not exist`, run `pnpm --filter @workspace/db run push` — the Replit Postgres schema hasn't been pushed in that environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
