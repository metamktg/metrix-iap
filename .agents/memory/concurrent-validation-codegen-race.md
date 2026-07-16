---
name: Concurrent validation codegen race
description: Validation scripts that touch the shared generated API libs must hold the shared validation lock; the codegen-drift check deletes/rewrites them mid-run.
---

The api-codegen-drift check regenerates `lib/*/src/generated/**` with orval `clean: true` — files are deleted and rewritten mid-run. Any concurrent validation running `typecheck:libs` (or an esbuild/Vite build importing those sources) in that window used to fail with a wall of bogus TS6053 "file not found" errors.

**Fix in place (two layers):**
1. A cross-process mkdir-based mutex (`scripts/src/lib/validation-lock.ts`, `withValidationLock`) serializes the lib-touching phases of the drift check and the build smokes. Stale locks (dead pid or >20 min old) are taken over automatically, so a killed run never wedges the next batch.
2. The drift check no longer regenerates in place at all: it generates into a temp sandbox (`ORVAL_DRIFT_OUT` env var honored by `lib/api-spec/orval.config.ts`) and content-compares against the committed trees. The lock alone was NOT enough — it serialized validations against each other but not against the live Vite dev servers, which watch `lib/*/src/generated/**` and crashed user sessions with mass HMR invalidations every time the files were rewritten (even byte-identical rewrites churn watchers). Sandbox gotcha: copy `custom-fetch.ts` into the sandbox's `api-client-react/src` so the generated `../custom-fetch` import path comes out identical.

**How to apply:** any NEW validation script that regenerates, rebuilds (`typecheck:libs`), or bundles the shared generated API libs must wrap that phase in `withValidationLock` — otherwise concurrent batches race again. If TS6053 errors on generated files ever reappear in a batch, check for a lock-less validation first.

**E2E variant of the same race:** validation batches that rewrite generated lib files also churn the running Vite dev servers (mass HMR "hot updated" floods and even full dev-server reconnects) while an e2e browser session is live. Symptom: false runtime crashes from broken React context identity — e.g. "useAuth must be used within an AuthProvider" / "Invalid hook call" at a timestamp exactly matching an HMR flood of files nobody edited. Before debugging such a crash as a regression, check the browser console for a coincident HMR batch, wait for validations to finish, and re-run the e2e test on a quiet server.
