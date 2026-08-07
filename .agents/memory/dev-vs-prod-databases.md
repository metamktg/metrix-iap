---
name: Dev vs prod database split
description: Which datastores are shared vs separate between the dev workspace and the published app — key to diagnosing "missing data" reports.
---

# Dev vs prod database split

- **Replit Postgres is NOT shared**: the dev workspace and the published deployment (app.metrix.ad) each have their own Replit Postgres database. Tables like `agent_waitlist`, `users`, `user_sessions`, `workspace_reports` have independent contents per environment.
- **Supabase IS shared**: both environments point at the same Supabase project (`request_access`, Metrix IAP data, Meta connection tables).

**Why:** User reported waitlist emails "not entering the database" — submissions on prod were fine; they were checking the dev environment's admin console, which reads the dev Replit Postgres DB.

**How to apply:** When data "isn't saving," first ask which environment the submission happened in vs. where it's being checked. Verify prod Replit Postgres rows with the database skill's `executeSql({ environment: "production" })` read-only query before assuming a bug. Supabase-backed data never has this split.

**Supabase outage symptom:** when the shared Supabase project is unreachable (Cloudflare 522 / pooler timeouts), Metrix IAP hangs on the boot loader for every authenticated route — the seed endpoint 503s after ~90 s. Auth still works (users/sessions live in Replit Postgres). For visual/e2e audits during an outage, the seed endpoint can be temporarily env-gated to serve the checked-in seed fixture (`artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json`); other Supabase-backed endpoints will still hang, so limit checks to seed-rendered UI.
