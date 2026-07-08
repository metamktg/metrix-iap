---
name: Metrix IAP data sources — Supabase-backed seed vs legacy scaffolding
description: Where Metrix IAP's rendered data actually comes from, and which bundled code is legacy
---

# Metrix IAP data flow: Supabase → API assembly → seed adapter

**Live/rendered data:** the frontend hydrates from `GET /api/metrix/seed`, which the API server assembles at request time from Supabase tables (supabase-js queries in the api-server's seed-assembly module, ~30s in-memory cache). The endpoint fails loudly with 503 if Supabase is unreachable — there is deliberately NO static fallback. The client still narrows the bundle with `src/lib/data/seedTypes.ts` + `metrixSeedAdapter.ts` getters; account status model is `"configured"` / `"unconfigured"` (Bookster configured, SKOV Pet unconfigured).

**Source of truth for content:** Supabase Postgres (secret `SUPABASE_DB_URL`, session-pooler URI). Schema + idempotent importer live in `scripts/src/metrix-supabase/`; raw Bookster IAP loop package files in `scripts/data/metrix/`. Re-run with `pnpm --filter @workspace/scripts run import:metrix`.

**Honest pending states:** `optimization_loop` is `null` (typed `OptimizationLoop | null`) and Creative Scan/Crossmap surfaces are empty until those loop stages run; `iap.loop_status` records per-stage complete/pending. UI renders PendingState for these — do not fabricate data to fill them.

**Legacy scaffolding — bundled but never rendered:** `src/lib/mock/generate.ts` → `mock-data.ts` → `WorkspaceContext.tsx` chain is transitively bundled but never reaches the DOM (workspace onboarding UI never mounts on live routes). Treat as removable legacy.

**How to apply:** To change rendered data, change the Supabase rows (importer/schema) or the api-server assembly — not seed JSON (the old static bundle now lives only as raw source data in `scripts/data/metrix/`) and not `generate.ts`.
