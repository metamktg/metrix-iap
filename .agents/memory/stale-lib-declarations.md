---
name: Stale lib declarations symptoms
description: How stale @workspace lib .d.ts output shows up in leaf typechecks and how to clear it.
---

Stale composite-lib declaration output doesn't only show up as "missing export" errors. It can also surface as bogus type errors in files you never touched — e.g. `instanceof SomeClass` failing to narrow ("possibly null", "property does not exist on Error") because the leaf package is compiling against an old `.d.ts` where the symbol was an interface instead of a class.

**Why:** leaf artifacts typecheck against emitted lib declarations, not lib sources; those go stale whenever lib output lags source (e.g. after merges).

**How to apply:** when `pnpm --filter <artifact> run typecheck` errors in untouched files that import `@workspace/*`, run `pnpm run typecheck:libs` first, then re-run the leaf typecheck before investigating the errors themselves.
