---
name: Supabase dev data-service outages
description: The shared dev Supabase can go hard-down (Cloudflare 522) for an hour+; how to write and run live-DB tests around it.
---

The shared dev Supabase project periodically returns Cloudflare 522 (origin timeout) for **every** REST request — even a one-row `select id limit 1` — for extended periods (observed 60+ min on 2026-08-07).

**Why:** it's a shared always-on instance; outages are environmental, not caused by the code under test.

**How to apply:**
- If a live-DB test or the api-server dev workflow fails with a Cloudflare 522 HTML page inside a Supabase error message, it's the outage — don't debug the code.
- Live route tests should NOT call the heavy `getMetrixSeedFromSupabase()` in setup just to find an account id; do a light `from("ad_accounts").select("id").limit(1)` instead (the seed assembly is the first thing to time out under load).
- Poll `rest/v1/ad_accounts?select=id&limit=1` with the service key; 200 = back, 522 = still down. If it stays down, note the skipped live validation and re-run the affected suites once it recovers.

## Validation flakiness under concurrent task sessions
The api-server integration suite intermittently fails during completion validation (statement timeouts, 30s test timeouts, duplicate-key errors) when other task sessions hammer the shared dev Supabase — each run fails on *different* tests, and the failing tests pass in isolation. **How to apply:** before debugging, rerun the failing test file alone; if it passes, it's contention, not a regression — retry validation or use an audited skip rather than chasing phantom bugs.
