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
