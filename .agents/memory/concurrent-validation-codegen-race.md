---
name: Concurrent validation codegen race
description: Build validations can fail transiently when they overlap with the codegen-drift check regenerating lib/api-zod / lib/api-client-react.
---

When all validation workflows fire at once, the api-codegen-drift check deletes and regenerates `lib/*/src/generated/**` mid-run. Any other validation running `typecheck:libs` at that moment (e.g. marketing-build) can fail with a wall of TS6053 "file not found" errors for generated types — while codegen-drift itself passes.

**Why:** the generated files briefly don't exist on disk during regeneration; the failure is a scheduling race, not real drift or a broken build.

**How to apply:** if a build validation fails with many TS6053 errors on `lib/api-zod`/`lib/api-client-react` generated files but api-codegen-drift passed in the same batch, just re-run the failed workflow alone before debugging anything.
