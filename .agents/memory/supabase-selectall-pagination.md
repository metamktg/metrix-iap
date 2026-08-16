---
name: Supabase selectAll 1000-row limit
description: Supabase PostgREST default max_rows silently truncates large table fetches; metrixSeedAssembly selectAll now paginates.
---

# Supabase selectAll 1000-row limit

**Rule:** Every unbounded Supabase query (`.from(table).select("*")` without `.range()`) is silently capped at 1000 rows by PostgREST's default `max_rows` setting. Tables that grow past 1000 rows return incomplete data with no error.

**Why:** The `device_performance` table grew to 1544 rows (across 6 accounts). Because `selectAll()` in `metrixSeedAssembly.ts` used a single `.select("*")` call, the rows for bookster and ecas (which happened to have the highest auto-increment IDs) were cut off. The assembler silently built an empty `conversion_tracking_signal` for ecas and skipped bookster's device data entirely. This caused 3 tests to fail after a fixture refresh.

**How to apply:**
- `selectAll()` in `artifacts/api-server/src/lib/metrixSeedAssembly.ts` now paginates in 1000-row pages using `.range(offset, offset + PAGE_SIZE - 1)` until a page returns fewer than PAGE_SIZE rows.
- Apply the same pattern to any new unbounded Supabase fetch that could grow beyond 1000 rows.
- Tables most at risk: `device_performance`, `demographic_performance`, `placement_performance`, `ad_performance` (which can exceed 1000 rows when many manual accounts exist).
- Do not assume a single `.select("*")` call returns all rows; always add pagination or a `.limit()` acknowledgment if the table is bounded in size.
