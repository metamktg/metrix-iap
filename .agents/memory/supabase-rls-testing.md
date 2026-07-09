---
name: Supabase RLS testing & schema migration technique
description: How to test RLS/triggers against live Supabase from vitest, and gotchas with drizzle push and vitest-via-bash.
---

## Testing RLS and triggers against the live Supabase DB

- Run every test inside a rolled-back transaction (`begin` … `rollback`) on a dedicated `pg` client so live data is never mutated.
- Impersonate a Supabase user with `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` followed by `set local role authenticated`; return with `reset role` (needed before doing owner-level seeding again).
- **Expected failures abort the whole transaction.** Any statement you expect to reject must be wrapped in a savepoint (`savepoint x` → expect rejects → `rollback to savepoint x`), or every subsequent statement fails with "current transaction is aborted". Use a shared `expectQueryRejects(sql, params, matcher)` helper.
- Updates blocked by RLS do NOT error — they silently affect 0 rows. Assert `rowCount === 0`, don't expect a throw.
- **Why:** first test run failed 3/35 exactly on this aborted-transaction cascade; the savepoint helper fixed all of them.

## Trigger vs RLS for mandatory gates

- `service_role` has BYPASSRLS, so RLS policies cannot enforce invariants against backend jobs. Use a BEFORE INSERT OR UPDATE trigger instead — triggers fire for every role. INSERT-only triggers leave an UPDATE bypass; always cover UPDATE for gate-style triggers.

## Schema-change gotchas in this project

- `drizzle-kit push` prompts interactively (even with `--force`) for some changes; when it hangs in a non-TTY, apply the DDL manually via `psql "$DATABASE_URL"` until drizzle reports no diff.
- Running vitest through bash flakes on output streaming: redirect to a file (`> /tmp/x.log 2>&1`) and `tail` it.
- Official-schema migrations are immutable once applied (sha256 checksum drift aborts the runner); security policy files are the mutable layer — edit and re-run the migrator to re-apply.
