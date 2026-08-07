---
name: IAP smoke suite coverage guard
description: How new smoke:metrix-iap-* scripts get wired into the main suite, and the hover-popover exclusion.
---

The Metrix IAP smoke orchestrator runs a declarative step list (`scripts/src/lib/metrix-iap-smoke-steps.ts`). A vitest guard in the scripts package fails when a `smoke:metrix-iap-*` script exists in scripts/package.json but is neither a step nor in the explicit exclusion map (each exclusion needs a reason).

**Why:** steps used to be copy-pasted boilerplate; new smoke scripts were silently omitted (hover-popover was never run by anything).

**How to apply:** when adding a new IAP smoke script, add it to `IAP_SMOKE_STEPS` (or the exclusion map with a reason) — the scripts-tests workflow enforces this.

Known exclusion: `smoke:metrix-iap-hover-popover` fails 3/26 assertions because its drill-down/DNA tests assume fixture data (variable_family rows, C2B demographic rows) that no longer exists in the current seed fixture. Repair the spec against current data before promoting it to a step.
