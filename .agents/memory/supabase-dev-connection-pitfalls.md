---
name: Supabase dev-container connection pitfalls
description: Why direct Postgres connections to Supabase fail from this sandbox, and how to recover the right pooler host when a user can't produce a working connection string.
---

**Direct connection host is IPv6-only.** Supabase's "Direct connection" string (`db.<ref>.supabase.co`) resolves to an IPv6-only address. This workspace's container has no IPv6 route at all (`Address family not supported by protocol`), so this host is categorically unreachable regardless of credentials. Always use the **Session pooler** connection string (`postgres.<ref>@aws-<n>-<region>.pooler.supabase.com:5432`), which is IPv4.

**Users often can't produce the pooler string correctly on the first few tries** — common failure modes seen: pasting the Direct connection string instead, leaving `<placeholder>` brackets un-filled (region, password), or typing conversational text into a secret field. Expect several round trips; give an exact template and ask for a literal paste.

**Recovering the pooler region when the user is stuck:** if you already have the DB password (e.g. requested separately as its own secret) and the project ref, you can brute-force the region by attempting a `pg` connection to `aws-0-<region>.pooler.supabase.com` and `aws-1-<region>.pooler.supabase.com` for each candidate AWS region. A generic routing failure (Postgres error code `XX000`, "Tenant or user not found") means wrong region; a specific `28P01` (invalid password) means the region/host is correct but the password is wrong — that pinpoints the real host so you only need to re-ask for the password, not the whole URL.

**Never ask for a raw connection string / password via AskQuestion** — it renders as a plain chat field and leaks the credential into conversation history. Always use `requestSecrets`, even mid-troubleshooting when you think you just need "one more small value."
