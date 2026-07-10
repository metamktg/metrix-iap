---
name: Supabase importer-table RLS
description: Why the Metrix importer schema tables must have RLS enabled even though only the service role touches them.
---

# Supabase importer tables need RLS + revoked grants

The Metrix importer schema (`scripts/src/metrix-supabase/schema.sql`, ~37 tables:
ad data + `request_access` PII) is only ever queried by the API server using the
Supabase **service_role** key, and no frontend uses supabase-js or the anon key.
That is NOT enough on its own: Supabase's PostgREST exposes every table in the
`public` schema, and the **anon/publishable key is embedded in the browser**. With
RLS disabled, the public anon key could `GET /rest/v1/<table>` and read every row —
this was a live exposure (full names, emails, phone numbers via `request_access`).

**Rule:** every importer table must `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
(deny-by-default with no policies) **and** `REVOKE ALL ... FROM anon, authenticated`.
Enable-only returns a silent empty result; the revoke turns it into a hard 401
(`42501`). service_role and the direct superuser importer connection both have
BYPASSRLS, so nothing legitimate breaks.

**Why:** anon key is public; PostgREST default-exposes public tables; "only service
role reads them in app code" does not stop a direct REST call with the anon key.

**How to apply:** the RLS block lives at the end of `schema.sql` as an idempotent
`do $$ ... $$` loop, re-applied on every `import:metrix`. Verify by `fetch`-ing a
table with the publishable key — expect 401. This is separate from the official
22-table schema, which has its own policy-based RLS + `metrixOfficialSecurity.test.ts`.
