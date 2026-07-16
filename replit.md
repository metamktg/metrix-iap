# Metrix

Metrix IAP is an ad-performance analysis platform: agencies connect Meta ad accounts (live OAuth or manual CSV/creative upload), run analysis, and get AI-generated strategy/briefs plus reporting — all backed by Supabase.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run test` — API server tests (vitest; includes password-reset cleanup against dev Replit Postgres)
- `pnpm --filter @workspace/scripts run test` — scripts unit tests (vitest, no DB needed): meta-ads-export backfill rules, LittleData CSV parsing/aggregation/reconciliation
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/scripts run check:api-codegen-drift` — build-safety gate (validation step `api-codegen-drift`): regenerates codegen into a throwaway sandbox (`ORVAL_DRIFT_OUT`, honored by `lib/api-spec/orval.config.ts`), fails loudly if committed generated types (`lib/api-zod`, `lib/api-client-react`) drifted from `openapi.yaml`, then runs the full `pnpm run typecheck` (rebuilds composite libs first). Catches stale generated API types that pass an isolated per-artifact typecheck but break the real build. NEVER regenerate the live `lib/*/src/generated/**` from a validation: orval's `clean: true` deletes/rewrites files the Vite dev servers watch, crashing live browser sessions with mass HMR invalidations. Validations that rebuild the shared libs (drift check's typecheck phase + build smokes) still serialize through a cross-process lock (`scripts/src/lib/validation-lock.ts`); new lib-touching validation scripts must wrap that phase in `withValidationLock`.
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run import:metrix` — (re)apply Metrix Supabase schema and (re)import source data packages (`scripts/data/metrix/`); idempotent. Asserts CSV internal consistency and aborts loudly on drift. Backfills `ads.meta_ad_id`/`creative_asset_url` from a per-account `meta_ads_export.json` when present.
- `pnpm --filter @workspace/scripts run create:user x@y.com [password]` — create/reset a Metrix IAP user account (prints temp password if none given; forces password change on first login)
- `pnpm --filter @workspace/scripts run migrate:metrix-official` — apply the official METRIX 22-table schema to Supabase (migrations immutable/checksummed; policies re-applied every run)
- `pnpm --filter @workspace/scripts run mirror:auth-users` — backfill Replit Postgres users into Supabase Auth (idempotent)
- Required env: `DATABASE_URL` (Replit Postgres, waitlist), `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (API server reads Metrix data)
- Required secret: `SUPABASE_DB_URL` (Metrix data importer)
- Optional secret: `ADMIN_API_KEY` — gates `GET /api/metrix/agent-waitlist`; fails closed (401) when unset
- Optional secret: `RESEND_API_KEY` — enables outbound email; without it, actions still complete and the server logs an explicit "skipped" warning. Optional `REQUEST_ACCESS_FROM_EMAIL` overrides the Resend sender
- Optional secret: `DEMO_ACCOUNT_PASSWORD` — enables the self-healing demo login (`demoAccountSafeguard.ts`): on every API-server boot the demo account (`demo@metrix.app` by default, override with `DEMO_ACCOUNT_EMAIL`) is created/repaired with this exact password — admin role, enabled, never `must_change_password` — so it survives DB resets, rollbacks, and the dev/prod split. When unset, nothing is provisioned (logged as skipped).

## Auth (Metrix IAP)

- Custom auth: bcryptjs + DB-backed sessions (`user_sessions`, sha256-hashed tokens, 30-day expiry) in an httpOnly `metrix_session` cookie. Routes: `/api/metrix/auth/{login,logout,me,change-password}`.
- Unauthenticated visitors see a login page with "Request access" (→ marketing sign-up form, Supabase `request_access`) and "Learn more" links. All sign-ups go through that form; the `agent-waitlist` endpoint remains only for admin flows.
- Admin approval (Settings → Metrix Agent waitlist, gated by `ADMIN_API_KEY`; or standalone `/admin` console gated by `ADMIN_PANEL_PASSWORD` with a signed `metrix_admin` cookie) provisions a user with a temp password, emails it via Resend, and falls back to an on-screen copy button if email fails. Strict lifecycle: only `pending` entries transition (approve/reject after the other → 409).
- Email delivery goes through `artifacts/api-server/src/lib/email.ts` (`sendEmail` → sent/skipped/failed + reason; detects Resend sandbox 403s). `GET /api/metrix/admin/email-status` reports mode + environment for the admin console banner.
- Admin user management (`requireAdmin`): resend temp password, send password-reset link, revoke/restore accounts. Disabled users are rejected everywhere with generic (non-enumerating) messages.
- First login with a temp password forces a password-change screen; changing password revokes other sessions.
- Self-service reset: "Forgot password?" → `/forgot-password` (neutral response) → Resend link → `/reset-password?token=...` (single-use, 1h expiry, revokes all sessions).
- Brand: shared logo components in `src/components/brand/BrandMark.tsx` (IAP) and marketing equivalent; auth screens/Topbar/emails all use the real `metrix-logo.png`.
- All `/api/metrix/seed` and `/api/metrix/workspaces/:workspaceId/*` routes require a session; workspace routes verify `workspaceId` matches the seed's manager account id (single-workspace deployment).
- Settings → Team & Access shows real provisioned accounts merged over the seed roster. Sign out lives in Topbar + Settings → Account (also has a "Password" card). Login rate limit: 20 attempts / 10 min per IP+email.
- Per-user account authorization: `users.role` (admin|member) + `user_ad_accounts` grants. Admins see everything; members see only granted accounts and their own generated reports. Members/invites endpoints are admin-only.
- Agency admin safeguard (`agencyAccessSafeguard.ts`): designated agency emails (`AGENCY_ADMIN_EMAILS`, default `meta@metamktgagency.com`) are always reconciled to `role: admin` on boot and on provisioning, never scoped by grants — prevents the agency's own login from ending up as a scopeless member.

## METRIX official schema

- The official 22-table METRIX schema (identity/cohorts/runs/outputs/intake/alerts/review/learning + registries) is deployed via `migrate:metrix-official`. Migrations are immutable once applied (checksum drift aborts); policies (`supabase/policies/`) are idempotent and re-applied every run — evolve security there.
- Legacy importer table `creative_briefs` was renamed `imported_creative_briefs` (official schema owns the `creative_briefs` name).
- RLS on all 22 tables via security-definer tenancy helpers: members read their clients, owner/operator write, viewer read-only; audit tables append-only; config-as-data tables read-only to authenticated; `anon` fully denied.
- Learning gate: `learning_registry` writes require a matching, run-scoped `approval_events` row, enforced by a BEFORE INSERT/UPDATE trigger (fires even for BYPASSRLS roles).
- Hard DB constraints: no ROAS alert rules, BSIL suggestions campaign/ad_set scope only, manual creative intake ≥ 5 assets.
- Approving a user also provisions a Supabase Auth user via `@workspace/auth-mirror` (idempotent, non-fatal on failure) for FK targets only — login stays custom session auth.
- Security tests: `artifacts/api-server/src/lib/__tests__/metrixOfficialSecurity.test.ts` (rolled-back transactions, role impersonation) — fail loudly if the official schema isn't deployed.
- Importer schema RLS: the importer tables (`scripts/src/metrix-supabase/schema.sql`, ad data + `request_access` PII) are reached only by the API server's service_role key, but PostgREST still exposes `public` tables to the browser-embedded anon key. An idempotent RLS block at the end of `schema.sql` enables RLS (deny-by-default) and revokes anon/authenticated grants on every importer table so the anon key gets a hard 401; service_role/superuser (BYPASSRLS) are unaffected.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5; DB: PostgreSQL + Drizzle ORM; Validation: Zod (`zod/v4`) + `drizzle-zod`
- API codegen: Orval (from OpenAPI spec); Build: esbuild (CJS bundle)

## Where things live

- `artifacts/metrix-iap/` — Metrix IAP web app (React + Vite); seed types in `src/lib/data/seedTypes.ts`, adapter in `src/lib/data/metrixSeedAdapter.ts`
- `artifacts/api-server/` — Express API; Metrix seed assembly in `src/lib/metrixSeedAssembly.ts` (Supabase → seed bundle), routes in `src/routes/metrix.ts`
- `artifacts/marketing/` — public marketing site (React + Vite, served at `/www/`); copy centralized in `src/content.ts`
- `scripts/src/metrix-supabase/` — `schema.sql` + `import.ts` (idempotent importer)
- `lib/api-spec/openapi.yaml` — API contract; regenerate hooks/schemas with codegen after editing

## Architecture decisions

- Metrix data lives in Supabase Postgres; the API server assembles a seed bundle at request time (30s cache) and returns 503 if Supabase is down — no static fallback by design.
- Seed assembly is fully account-aware (no hardcoded ids): `buildAccountObject()` builds any account generically, honest pending shape until it has real data. Manager totals sum across accounts. `invalidateMetrixSeedCache()` busts the cache.
- Selecting a live Meta ad account registers it in Supabase `ad_accounts` (insert-only, `status: "unconfigured"`) so it appears immediately with an honest "analysis not run yet" state; promotion to `configured` happens only when real analysis data lands.
- `optimization_loop`/Creative Scan stay empty/pending until those stages actually run — UI never fabricates data. Same principle applies to account-level totals overrides (e.g. LittleData): authoritative totals are stated separately from ad-level coverage gaps, never blended dishonestly.
- `ads.creative_asset_url`/`meta_ad_id` are nullable, backfilled via a per-account `meta_ads_export.json`. The client resolves the primary ad per creative cell (`primaryAdForCell` in `creative-assembly.ts`); "View in Ads Manager" enables only when both the numeric Meta account id and `meta_ad_id` exist (never the internal account id).
- Manual accounts: `POST /api/metrix/accounts` creates an unconfigured account and grants the creator; `POST /api/metrix/accounts/:id/manual-imports` stages raw uploads (bytea, 8 MB decoded limit) — never parsed at upload time. `AddAccountDialog` is the single real entry point (Meta OAuth or manual + uploads).
- Manual performance requires two exact Meta pivot CSV exports (`performance_demo_csv`, `performance_placement_csv`), spec'd in `iapCsvSpec.ts` and parsed by `iapCsvParser.ts`. Creative uploads are staged individually (no ZIP) with an editable, correctable `ad_names` mapping per file.
- The manual upload dialog requires both CSVs staged plus an explicit "Review" confirmation before closing — nothing silently finalized. Date-range selection lives only in the separate "Run analysis" step, never in the upload dialog.
- Manual analysis is never automatic: a signed-in user with account access must pick a date range and press "Run analysis" (`POST /api/metrix/accounts/:id/analysis-runs`, 202 + `run_id`). Follows the running/success/error honesty pattern (partial unique index blocks concurrent runs; stale `running` rows flip to `error`). Date window anchors to the latest date found in the data, not wall-clock time.
- Waitlist + request-access stay on Replit Postgres (Drizzle); Supabase is only for Metrix IAP data.
- Live Meta connection (pilot): OAuth via Meta Graph v23.0, `ads_read` scope only. Tokens AES-256-GCM encrypted (`TOKEN_ENCRYPTION_KEY`); OAuth state HMAC-signed (`SESSION_SECRET`, 15-min expiry). Report pulls insert as `running`, flip to `success` only after all rows commit (partial rows deleted on failure). Once a live connection exists, demo/seed integration panels are hidden — live and demo data never mix.
- In-app Strategy/Briefs generation: `POST /api/metrix/accounts/:id/generate/{strategy,briefs}` (202 + `run_id`, background job) via `generationEngine.ts` — claude-sonnet-4-6 through the Replit AI integration, evidence packs from real Supabase analysis rows, zod validation + one repair retry, hallucinated refs dropped. Generated rows (`source='generated'`) fully replace imported rows for that kind (never merged); same running/success/error honesty pattern; only one running run per account+kind.
- Generated reports (`workspace_reports`, Replit Postgres) store a full document snapshot at generate time so History/Exports reproduce it exactly; deletable from Report History (workspace-scoped).

## Product

- Customizable overview metric tiles: catalog-driven tile rows (`src/lib/data/metricsCatalog.ts`) with a picker (`MetricPicker.tsx`) to toggle/reorder metrics, persisted per-browser (localStorage). Tapping a tile opens `MetricDiagnosticModal` (blended stat, avatar × placement breakdown, top library concepts). Out of scope by design: ROAS/purchase value/unique clicks (no underlying data fields).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Resend sandbox sender (`onboarding@resend.dev`) only delivers to the Resend account owner's inbox — sends to other recipients get rejected with 403 until a domain is verified and `REQUEST_ACCESS_FROM_EMAIL` is set. The admin console banner and `email_error` fields surface this live.
- Dev and prod have SEPARATE Replit Postgres user databases: approving someone in dev does NOT create their account in production. Approve in the environment where the user will log in.
- If password reset requests 503 with `relation "password_reset_tokens" does not exist`, run `pnpm --filter @workspace/db run push` in that environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
