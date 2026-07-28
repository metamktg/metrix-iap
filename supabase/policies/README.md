RLS policy files (Blueprint v2.0 §12) — deployed.

`20260709000100_rls_all_tables.sql` is applied by `pnpm --filter @workspace/scripts run migrate:metrix-official` and re-applied on every run (idempotent, unlike `supabase/migrations/` which is checksummed/immutable). It enables RLS on all 22 official tables and defines the security-definer tenancy helpers (`metrix_user_is_client_member`, `metrix_user_is_client_writer`, `metrix_user_in_org`, `metrix_client_id_of_run`) plus the `learning_registry` gate trigger. Coverage is asserted by `artifacts/api-server/src/lib/__tests__/metrixOfficialSecurity.test.ts`.

## CI (`.github/workflows/supabase-policies.yml`)

Files in this directory are validated and deployed automatically — no manual `migrate:metrix-official` run needed to keep policy changes live:

- **On every PR touching `supabase/policies/**`:** every `*.sql` file in this directory is applied inside a transaction against the live Metrix Supabase project, then rolled back. This proves the files still apply cleanly (new function/policy/trigger definitions, no drift against current table shapes) without mutating anything. This is the automated version of the manual re-run-the-whole-file check used when the `_metrix_migrations` RLS gap was closed.
- **On merge to `main`:** the same files are applied for real, unconditionally. Safe because every file here is written idempotently (`drop policy if exists`, `create or replace function`, `alter table ... enable row level security`, etc.) — re-applying is always a no-op if nothing changed.

Only this directory is wired into CI this way. `supabase/migrations/` is intentionally excluded — those files are checksum-guarded and immutable, and stay on the manual `migrate:metrix-official` path.

Requires a `SUPABASE_DB_URL` repository secret (GitHub Actions secrets are separate from Replit secrets — this needs to be added under repo Settings → Secrets and variables → Actions even though the same-named secret already exists in the app's runtime env). Until that secret is added, both jobs fail loudly rather than silently skipping.

Not yet automated: a Supabase security-advisor pass (`get_advisors(type: "security")`) after apply, to catch new lint findings the same way the manual review after the `_metrix_migrations` fix did. That needs a `SUPABASE_ACCESS_TOKEN` + project ref wired in as a further secret — worth adding if this workflow catches real drift often enough to justify it.
