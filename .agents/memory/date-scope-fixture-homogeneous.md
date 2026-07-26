---
name: Date-scope fixture tests with homogeneous windows
description: When a full-period analysis run assigns all concepts the same date window, fixture-dependent date-scope tests that need differential concept windows must switch to synthetic rollup data.
---

## Rule
Tests in `date-scope.test.ts` and `date-range-scoping.test.tsx` that verify "concept A ends before concept B → scoping drops A but keeps B" cannot pass when the fixture has all concepts sharing the same flight window.

This happens when the bookster analysis is run with `date_range: "all"` over CSVs where all ads span the same period — every concept gets `date_start: MIN`, `date_end: MAX` of the account's data.

**Why:** These tests were written when the bookster fixture had concepts with different date ranges. After a full re-analysis, all concepts share 2026-05-02 → 2026-07-12.

**How to apply:**
- For pure-helper tests (`cellInRange`, `sumInRange`): construct synthetic rollup/window data within the test instead of reading from the fixture. The fixture is still used for tests that don't require date diversity (e.g. "null range includes everything", union window arithmetic).
- For UI integration tests (`date-range-scoping.test.tsx`): use a `POST_DATA_RANGE` that falls entirely after all concept windows end; verify ALL concepts drop rather than testing selective exclusion.
- Raise the `beforeAll` timeout in API server tests that call `getMetrixSeedFromSupabase()` to at least 30s — the full seed assembly (including bookster's 2960 analysis rows) takes ~25s.
