Migration-order, RLS allow/deny, no-ROAS alert, BSIL scope, and learning-gate tests — implemented, not here.

These live as integration tests in `artifacts/api-server/src/lib/__tests__/metrixOfficialSecurity.test.ts` (runs against the real `SUPABASE_DB_URL` with rolled-back transactions and role impersonation; fails loudly if `SUPABASE_DB_URL` is unset or the official schema isn't deployed) rather than as standalone pgTAP files in this directory. This directory is intentionally empty — kept as a placeholder in case native pgTAP tests are added later.
