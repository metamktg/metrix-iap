---
name: Supabase full-project outages under heavy load
description: What a total Supabase outage looks like and how to react when live tests hang.
---

The shared Supabase project can go FULLY down (PostgREST returns Cloudflare 522/timeouts AND the
pooler refuses direct psql connections with `{:error, :timeout}`) for multiple hours, observed
while a bulk vision-classification run was hammering it.

**Why:** heavy concurrent bytea reads + model-driven writes can saturate the instance; once the
pooler stops accepting connections nothing in the project works (dev API, tests, seed assembly).

**How to apply:** when live/e2e tests time out in `beforeAll` on simple inserts, curl the REST
endpoint and psql the pooler first — if both fail it's an outage, not a test bug. Don't burn
retries or debug code; wait for recovery or hand off verification. Distinguish transient 522s
(retry-once pattern in tests works) from a full outage (nothing works).

**Pooler-only outage variant (Aug 2026):** REST can flap back to 401 (alive) while the pooler (aws-1-us-east-2.pooler.supabase.com, both 5432 and 6543) keeps returning `Failed to connect to database: {:error, :timeout}` for 15+ min. DDL/schema applies need the pooler, so post-merge `apply-supabase-schema` stays blocked even after REST recovers — retry the script later rather than debugging it. Direct host `db.<ref>.supabase.co` is IPv6-only (ENOTFOUND from Replit), not a workaround.

**Recovery path:** the project owner restarting the Supabase project from the Supabase dashboard resolves prolonged 522 flaps (seen Aug 2026 — hour-plus flap ended immediately after a project restart; full test suite green on next run). If 522s persist beyond ~30 min, ask the user to restart the project rather than waiting. After recovery, restart the api-server dev workflow too — it can hold hung connections.
