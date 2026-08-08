---
name: Shared-Supabase test collisions
description: Why api-server integration tests flake when multiple task environments run them concurrently
---

**Rule:** api-server integration tests run against the ONE shared dev Supabase from every task environment simultaneously. Any test that inserts rows with constant natural keys (fixed ad_name, fixed dates in tables whose unique constraints include date_start/date_end) or asserts "my run is the latest run" will collide with other environments' in-flight copies of the same suite.

**Why:** During task validation, the same suite ran in parallel environments and produced duplicate-key errors (`ad_performance`, `demographic_performance`) and latest-run mismatches that looked like code bugs.

**How to apply:** Give inserted test rows per-run-unique identity (`${Date.now()}-${process.pid}` in names, a unique synthetic date). Treat statement timeouts / Cloudflare 522s as shared-instance load or outage, not code failure — retry in a quiet window instead of debugging. Validation runs from other tasks are a common load source.
