---
name: Shared-Supabase test fixture hygiene
description: Why api-server tests that insert real Supabase rows flake, and how to write them safely
---

Rule: tests that insert rows into the shared dev Supabase must (a) use per-run unique values for every column that participates in a natural unique key WITHOUT date columns (e.g. ad_performance's key is account_id+ad_name+campaign_name+result_type — no dates), and (b) sweep leftovers by a recognizable prefix before inserting, because afterAll cleanup only deletes by run_id and is skipped entirely when the vitest process dies early.

**Why:** piping vitest output through `| head` (or any early-closing pipe) SIGPIPE-kills the process mid-run, skipping afterAll — stale rows then collide on unique keys in every later run. Also, "latest run" endpoints scope to MAX(started_at), so a leftover manual_analysis_runs row silently redirects completeness checks to the wrong run.

**How to apply:** run vitest with `> /tmp/x.log 2>&1` then grep the file, never pipe live output; give test rows unique names like `foo-test-${Date.now()}`; add prefix-scoped delete sweeps in the test before insert; poll (3-4 attempts) endpoints that read counts right after PostgREST writes under load.
