# Supabase database password rotation — runbook

Written 2026-08-25 after a production connection string was pasted into a chat
session. The rule it broke is the Phase 1 work order §3 / Phase 2 kickoff standing
rule: **no chat-pasted DB credentials.**

## Who can do what

**Nobody but you can perform this rotation.** Worth stating plainly, because it is
easy to assume otherwise:

- **Claude cannot.** The Supabase MCP server exposes project, schema, migration,
  advisor and SQL tools. It has no credential-rotation tool. There is no API path to
  reset a Postgres password.
- **The Replit agent cannot.** The password lives in Supabase, not Replit. The Replit
  tooling can create, update and publish apps from natural-language prompts, but it
  has no secrets-management capability — and routing a new password through an agent
  prompt would put the secret straight back into a chat transcript, which is the exact
  failure being corrected.
- **The new password must never be pasted into any chat, prompt, issue, or commit.**
  Type it directly into the two secret stores below. If you ever need it verified,
  verification is running a command that uses it — never showing it.

## Blast radius: smaller than it looks

The live application does **not** use the database password. `artifacts/api-server/src/
lib/supabase.ts` builds its client with `createClient(NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY)` — PostgREST over HTTPS with the service-role JWT. It never
opens a Postgres connection.

**Consequence: rotating causes zero runtime downtime.** The app keeps serving
throughout. `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are API
credentials and are NOT affected by a database password change. `DATABASE_URL` points
at Replit Postgres — a different database entirely — and is also unaffected.

What does break until the secret is updated:

| Consumer | What stops working |
|---|---|
| `pnpm --filter @workspace/scripts run import:metrix` | schema apply + data import |
| `... run migrate:metrix-official` | official 22-table migrations |
| `... run enforce:importer-rls` | standalone RLS re-enforcement |
| `... run check:generation-runs-migration` | reports SKIP instead of verifying |
| `metrixOfficialSecurity.test.ts`, `metrixImporterRls.test.ts` | fail loudly (by design) |
| GitHub Actions `supabase-policies.yml` | both jobs fail loudly |

All admin/CI tooling. Nothing user-facing.

## The one secret that matters

`scripts/src/lib/supabase-db-connection.ts` already anticipated this. It resolves a
connection in this order:

1. An explicit `SUPABASE_DB_URL` / `SUPABASE_DEV_DB_URL` / `SUPABASE_PROD_DB_URL`,
   **unless** it points at the direct host (`db.<ref>.supabase.co`), which is IPv6-only
   and unreachable from these containers.
2. Otherwise `SUPABASE_DB_PASSWORD` — a **bare password, not a URL** — combined with
   the known project ref and IPv4 session-pooler host.

Its own comment: *"Rotating the password later only ever requires updating the single
`SUPABASE_DB_PASSWORD` secret."*

So prefer setting `SUPABASE_DB_PASSWORD` and leaving `SUPABASE_DB_URL` unset. One bare
value, no URL-encoding traps, no hostname to get wrong.

## Steps

**1. Rotate in Supabase.**
Dashboard → your project → Project Settings → Database → *Reset database password*.
Generate a strong password and copy it to your clipboard. Do not paste it into a chat.

**2. Update the Replit secret.**
Replit workspace → Secrets (padlock icon). Set `SUPABASE_DB_PASSWORD` to the new bare
password. If a `SUPABASE_DB_URL` secret exists carrying the old password, **delete it**
so the resolver falls through to the password path — or update it in full if you
prefer to keep an explicit URL.

**3. Update the GitHub Actions secret — a SEPARATE store.**
Repo → Settings → Secrets and variables → Actions. GitHub Actions secrets are distinct
from Replit secrets even when they share a name; `supabase/policies/README.md` already
flags this. `supabase-policies.yml` passes `secrets.SUPABASE_DB_URL` straight to `psql`,
so this one needs a full connection URL, not a bare password.

Do **not** hand-assemble it. On Supabase → Project Settings → Database → Connection
string, switch the mode selector to **Session pooler** and copy that URI — it already
has the right host, the `postgres.<ref>` username form and the right port. Substitute
the new password into it. Hand-building this string means URL-encoding the password
yourself, which is the single most common way this step goes wrong.

Never use the **Direct connection** string (`db.<ref>.supabase.co`). It is IPv6-only
and unreachable from Replit and CI, and because the resolver silently falls through
when it sees that host, the resulting failure names a secret you believe you just set.

**3b. Open a FRESH shell before verifying. This is not optional.**
Replit injects secrets into a process at start, so any shell or workflow opened
before you saved the secret is still holding the OLD value. During the 2026-08-25
rotation this cost four rounds of debugging: the password was correct in the secrets
UI from the first attempt, but the verifying shell predated it and reported
`password authentication failed`, which reads exactly like a wrong password. Close
the shell and open a new one — or restart the Repl — before concluding anything.

**4. Verify — without revealing anything.**

Run this first. It reports which secret resolved, which host it reached, and whether
the credential authenticated — and prints no credential material, so its output is
safe to paste anywhere:

```
pnpm --filter @workspace/scripts run check:db-credentials
```

It distinguishes the two failures that look identical in a raw driver error:
*rejected credential* (wrong password stored) versus *unreachable host* (the IPv6
direct-host trap). Then confirm the real tooling works:

```
pnpm --filter @workspace/scripts run check:generation-runs-migration
pnpm --filter @workspace/scripts run enforce:importer-rls
```

The second is idempotent and re-asserts the deny-by-default RLS posture as a side
effect. Green on all three means the rotation landed everywhere it needed to.

**5. Confirm the old credential is dead.**
Any tool still holding the old password should now fail to authenticate. That failure
is the success signal.

## After rotating

Tell Claude only that the rotation is done — never the value. Post-rotation checks
Claude can run without the credential: project health, RLS posture, schema drift, and
the anon/authenticated isolation probes, all through the Supabase MCP server, which
authenticates independently of this password.
