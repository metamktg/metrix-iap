---
name: metrix-iap vitest parallel runs get killed
description: Full metrix-iap test suite dies silently (exit -1, no output) when vitest runs multiple jsdom files in parallel; run serially.
---

Running several jsdom test files at once in `artifacts/metrix-iap` (plain `npx vitest run`, or even a multi-file subset) gets the process killed with exit code -1 and zero output — no vitest error, no stack.

**Why:** container memory limits; parallel jsdom workers exhaust RAM and the process is OOM-killed before printing anything.

**How to apply:** run suites serially with `npx vitest run --pool=forks --maxWorkers=1 <paths>` (single-file runs are fine without flags). Don't interpret a silent -1 exit as broken tests. A follow-up task exists to pin this in `vitest.config.ts`.

**Update (Jul 2026):** even `--pool=forks --maxWorkers=1` on the *whole* suite dies silently (exit -1, no output, extra heap doesn't help). Run the suite in chunks of ~3-7 test files per invocation — each chunk completes fine.
