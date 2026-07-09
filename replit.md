# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run test` — API server tests (vitest; includes password-reset token cleanup tests against the dev Replit Postgres DB)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run import:metrix` — (re)apply Metrix Supabase schema and import the Bookster IAP loop package (idempotent). If `scripts/data/metrix/meta_ads_export.json` exists (`{meta_ad_account_id, ads: [{ad_name, meta_ad_id, creative_asset_url}]}`), it backfills `ad_accounts.meta_ad_account_id` + `ads.meta_ad_id`/`creative_asset_url` and logs unmatched ad names.
- Required env: `DATABASE_URL` — Replit Postgres connection string (waitlist)
- Required secret: `SUPABASE_DB_URL` — Supabase session-pooler Postgres URI (Metrix data importer)
- Required env: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — used by the API server to read Metrix data via supabase-js
- Optional secret: `ADMIN_API_KEY` — admin bearer key gating GET /api/metrix/agent-waitlist (waitlist emails). Endpoint fails closed (401) when unset; admins enter the key in Settings → Metrix Agent waitlist.
- Optional secret: `RESEND_API_KEY` — enables the request-access notification email to meta@metamktgagency.com (Resend REST API). When unset, submissions are still stored in Supabase and the server logs an explicit "notification skipped" warning. Optional: `REQUEST_ACCESS_FROM_EMAIL` to override the Resend from-address (defaults to onboarding@resend.dev sandbox sender).
- `pnpm --filter @workspace/scripts run create:user x@y.com [password]` — create or reset a Metrix IAP user account (positional args; prints a generated temp password if none given; always forces a password change on first login)

## Auth (Metrix IAP)

- Custom email/password auth: bcryptjs (12 rounds) + DB-backed sessions (`user_sessions`, sha256-hashed 32-byte tokens, 30-day expiry) in an httpOnly `metrix_session` cookie (SameSite=Lax). Routes: `/api/metrix/auth/{login,logout,me,change-password}`.
- Unauthenticated visitors to the IAP app see a login landing page with a "Request access" button linking to the marketing sign-up form (`/www/#request-access`) and a "Learn more" link to the marketing site (`/www/`). The old inline email-only waitlist form was removed from the login page (July 2026) — all new sign-ups go through the marketing Request Access form (Supabase `request_access`, shared across dev/prod). The `agent-waitlist` endpoint remains for admin flows. Marketing `Home.tsx` handles hash scroll on mount (React renders after the browser's native hash jump).
- Admin flow: Settings → Metrix Agent waitlist (gated by `ADMIN_API_KEY` bearer key entered in the UI) shows entries with status badges and an Approve button. Approving provisions a user with a temp password and `must_change_password=true`, then emails the password via Resend (`RESEND_API_KEY`). If email can't be sent, the temp password is returned in the approve response and shown to the admin with a copy button — share it manually.
- Admin console at `/admin` (standalone page, no user login needed): gated by the `ADMIN_PANEL_PASSWORD` secret. Login (`POST /api/metrix/admin/session`, rate-limited 10/10min, fails closed when secret unset) sets a stateless HMAC-signed 12h httpOnly `metrix_admin` cookie (signed with `SESSION_SECRET` — rotating either secret invalidates admin sessions). Shows BOTH lists: access-request form submissions (Supabase `request_access`, full form data) and waitlist emails (Replit Postgres `agent_waitlist`), each with Approve/Reject. Approve uses the same provisioning path as the Settings panel (temp password email; copy-button fallback when email undeliverable). Strict lifecycle: only `pending` entries transition; approve-after-reject and reject-after-approve return 409. `requireAdmin` accepts the admin cookie OR a Bearer `ADMIN_API_KEY`. Waitlist status enum now includes `rejected`.
- First login with a temp password forces a password-change screen; changing the password revokes all other sessions.
- Self-service password reset: "Forgot password?" on login → `/forgot-password` (neutral response, no account enumeration) → Resend email with `/reset-password?token=...` link (single-use sha256-hashed 32-byte token, 1h expiry, `password_reset_tokens` in Replit Postgres). Reset revokes ALL sessions and clears `must_change_password`. When `RESEND_API_KEY` unset, request is accepted but the server logs a "reset email skipped" warning (link not delivered).
- Brand: shared logo components — IAP `src/components/brand/BrandMark.tsx` (BrandLogo + AuthBrandHeader), marketing `src/components/BrandMark.tsx`; auth screens, Topbar, marketing header, and both email templates use the real `metrix-logo.png` (emails hot-link the hosted asset via app base URL).
- `/api/metrix/seed` and all `/api/metrix/workspaces/:workspaceId/*` routes require a session; workspace routes additionally verify `workspaceId` matches the seed's manager account id (single-workspace deployment) and return 403 otherwise.
- Settings → Team & Access shows real provisioned accounts (`GET /workspaces/:id/members` over the `users` table, single-workspace) merged over the seed roster; real accounts get Active/Invited badges and real last-login dates.
- Sign out lives in the Topbar and in Settings → Account ("Your session" card).
- Login rate limit: 20 attempts / 10 min per IP+email.

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
- `optimization_loop` is `null` and Creative Scan surfaces are empty until those IAP loop stages actually run; `loop_status` records per-stage complete/pending. UI shows honest pending states — never fabricate data.
- `ads.creative_asset_url` and `ads.meta_ad_id` are nullable, backfilled by dropping a `meta_ads_export.json` in `scripts/data/metrix/` and re-running the importer. The seed exposes the per-account ad registry (`ad_accounts[].ads`) + `meta_ad_account_id`; the client resolves the primary ad per creative cell (`primaryAdForCell` in `creative-assembly.ts`) so CreativeCard shows the real asset (placeholder fallback on error) and "View in Ads Manager" enables only when both `meta_ad_id` and the numeric Meta account id exist. Ads Manager deep links use the numeric Meta account id — never the internal account id.
- Waitlist + request-access stay on Replit Postgres (Drizzle); Supabase is only for Metrix IAP data.
- Live Meta connection (pilot): OAuth via Meta Graph v23.0 with `ads_read` scope only. Routes in `artifacts/api-server/src/routes/metaConnect.ts`; helpers `src/lib/metaCrypto.ts` (AES-256-GCM token encryption via `TOKEN_ENCRYPTION_KEY`; HMAC-signed OAuth state via `SESSION_SECRET`, 15-min expiry) and `src/lib/metaGraph.ts` (OAuth exchange, ad-account listing, insights pagination, payload sanitization, row normalization). Secrets: `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`; env `PILOT_MODE=true` + `PILOT_REQUIRED_AD_ACCOUNT_ID` (pilot account id comes only from env, never hardcoded). Flow: Settings → Integrations → `MetaLiveConnection.tsx` → oauth-url → `GET /api/auth/meta/callback` (exchanges code → long-lived token, encrypts, stores pending in Supabase) → account picker (pilot flagged/auto-selected) → select-account → run-reports. Two report classes (IAP_DEMOGRAPHIC_TEXT_SIGNAL: age/gender/body_asset; IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL: impression_device/publisher_platform/platform_position), same last_30d range, stored separately in Supabase (`meta_oauth_pending`, `connected_ad_accounts`, `report_pulls`, `report_rows`). Pulls insert as `running` and only flip to `success` after all row chunks commit; on failure partial rows are deleted and the pull is marked `error` — no dishonest success states. Stored raw pages are sanitized (tokens stripped from paging URLs); metric_mapping_status reports only observed fields. Once a live connection exists, the demo/seed integration panels in Settings → Integrations are hidden — live and demo data never mix. The Meta app must register both redirect URIs (prod `https://app.metrix.ad/api/auth/meta/callback` and the dev domain equivalent).
- Generated reports (`workspace_reports`, Replit Postgres) store a full `model_json` document snapshot at generate time; History/Exports downloads reproduce the snapshot exactly. Direct format-download buttons stay download-only (no persistence). Report window has no daily grain — it's labeling metadata only; sections summarize full flight. In-app generated reports can be deleted from Report History (confirmation dialog → `DELETE /metrix/workspaces/:id/reports/:reportId`, workspace-scoped, 404 if missing); seed history entries have no DB row and are not deletable.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Resend sandbox sender (`onboarding@resend.dev`, used when `REQUEST_ACCESS_FROM_EMAIL` is unset) only delivers to the Resend account owner's inbox (meta@metamktgagency.com). Sends to any other recipient are rejected with 403 — so approval emails and reset emails to other users will NOT arrive until a domain is verified at resend.com/domains and `REQUEST_ACCESS_FROM_EMAIL` is set to a sender on that domain.
- If password reset requests 503 with `relation "password_reset_tokens" does not exist`, run `pnpm --filter @workspace/db run push` — the Replit Postgres schema hasn't been pushed in that environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
