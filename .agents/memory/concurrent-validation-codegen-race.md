---
name: Concurrent validation codegen race
description: Validation scripts that touch the shared generated API libs must hold the shared validation lock; the codegen-drift check deletes/rewrites them mid-run.
---

The api-codegen-drift check regenerates `lib/*/src/generated/**` with orval `clean: true` — files are deleted and rewritten mid-run. Any concurrent validation running `typecheck:libs` (or an esbuild/Vite build importing those sources) in that window used to fail with a wall of bogus TS6053 "file not found" errors.

**Fix in place:** a cross-process mkdir-based mutex (`scripts/src/lib/validation-lock.ts`, `withValidationLock`) serializes the lib-touching phases of the drift check and the build smokes. Stale locks (dead pid or >20 min old) are taken over automatically, so a killed run never wedges the next batch.

**How to apply:** any NEW validation script that regenerates, rebuilds (`typecheck:libs`), or bundles the shared generated API libs must wrap that phase in `withValidationLock` — otherwise concurrent batches race again. If TS6053 errors on generated files ever reappear in a batch, check for a lock-less validation first.

**Also poisons running Vite dev servers.** The lock only serializes validations against each other — the dev servers importing `lib/api-client-react/src/**` still watch those files and hot-reload while codegen deletes/rewrites them. Browser tests run during a validation batch fail with phantom errors: "useMetrixSeed must be used within MetrixDataProvider", "Invalid hook call" (duplicate module/React instances), or raw parse errors ("Unexpected token '{'") from half-written files. Validation batches auto-trigger after checkpoints, so this hits right after making edits.

**Before any browser test / e2e run:** wait until no `check-api-codegen-drift` / `smoke-*-build` processes are running (`pgrep -f`), then restart the target web workflow to rebuild a clean module graph, then test. A failure with provider/hook-call/parse errors during a validation window is environmental — re-run instead of debugging the app.
