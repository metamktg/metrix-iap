# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run import:metrix` — (re)apply Metrix Supabase schema and import the Bookster IAP loop package (idempotent)
- Required env: `DATABASE_URL` — Replit Postgres connection string (waitlist)
- Required secret: `SUPABASE_DB_URL` — Supabase session-pooler Postgres URI (Metrix data importer)
- Required env: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — used by the API server to read Metrix data via supabase-js
- Optional secret: `ADMIN_API_KEY` — admin bearer key gating GET /api/metrix/agent-waitlist (waitlist emails). Endpoint fails closed (401) when unset; admins enter the key in Settings → Metrix Agent waitlist.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/metrix-iap/` — Metrix IAP web app (React + Vite); seed types in `src/lib/data/seedTypes.ts`, adapter in `src/lib/data/metrixSeedAdapter.ts`
- `artifacts/api-server/` — Express API; Metrix seed assembly in `src/lib/metrixSeedAssembly.ts` (Supabase → seed bundle), route in `src/routes/metrix.ts`
- `scripts/src/metrix-supabase/` — `schema.sql` (Supabase table definitions) + `import.ts` (idempotent importer)
- `scripts/data/metrix/` — raw Bookster IAP loop package files (source data for the importer)
- `lib/api-spec/openapi.yaml` — API contract; regenerate hooks/schemas with codegen after editing

## Architecture decisions

- Metrix app data lives in Supabase Postgres (per ad account, date-stamped rows); the API server assembles a seed-compatible bundle from ~28 tables at request time (30s cache) and returns 503 if Supabase is down — no static fallback by design.
- `optimization_loop` is `null` and Creative Scan surfaces are empty until those IAP loop stages actually run; `loop_status` records per-stage complete/pending. UI shows honest pending states — never fabricate data.
- `ads.creative_asset_url` and `ads.meta_ad_id` are nullable, keyed for future asset backfill.
- Waitlist + request-access stay on Replit Postgres (Drizzle); Supabase is only for Metrix IAP data.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
