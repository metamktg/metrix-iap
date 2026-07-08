---
name: Metrix IAP test seed fixture
description: Vitest suites render against a checked-in seed snapshot, not live Supabase — refresh it when the seed schema changes.
---

The metrix-iap vitest suites (nav routes, account scoping) render views against a checked-in seed snapshot at `artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json`, loaded by the shared test seed helper which mocks MetrixDataContext.

**Why:** the original static seed JSON was deleted during the Supabase migration (no static fallback by design), which silently broke the whole test suite. Tests cannot hit Supabase, so they need a snapshot.

**How to apply:** if the seed bundle schema changes (new top-level keys, renamed tables), refresh the fixture from the live endpoint: `curl localhost:80/api/metrix/seed` (API server workflow must be running) and overwrite the fixture file. Also: any view using `useDateRange` requires `DateRangeProvider` in test render wrappers (harness.tsx and per-test renderView helpers), nested inside AccountProvider with MetrixDataContext mocked.
