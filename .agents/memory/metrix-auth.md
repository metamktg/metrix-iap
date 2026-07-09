---
name: Metrix IAP custom auth decisions
description: Durable decisions/constraints for the custom email/password auth in the Metrix IAP app
---

- Custom auth was an explicit user choice over Clerk/Replit Auth: bcryptjs + httpOnly cookie with DB-backed sessions (tokens stored sha256-hashed). Keep consistent — don't migrate to a hosted provider without asking.
  - **Why:** user wanted a self-contained login landing page + admin-approved waitlist flow with temp passwords.
- Approval email fallback is deliberate: when Resend is unconfigured or send fails, the approve endpoint returns the temp password to the admin (admin-key-gated) instead of failing. Never expose temp passwords on unauthenticated paths.
- Single-workspace authorization model: any `/metrix/workspaces/:id/*` route must verify `id` equals the seed bundle's `manager_account.id` (403 otherwise). "Authenticated" alone is not authorization — architect flagged this as IDOR once already.
  - **How to apply:** reuse `requireWorkspaceAccess` in the metrix routes for any new workspace-scoped endpoint; revisit if the app ever becomes multi-workspace.
- Contract-first discipline: whenever a route gains auth middleware, the OpenAPI spec must gain the matching `security` + 401/403 responses and codegen must be rerun — the review failed on this mismatch once.
- Express 5 quirk: adding middleware to a param route degrades `req.params.x` typing to `string | string[]`; coerce with `String(...)` at usage sites.
- 4 frontend test suites (navigation + account-scoping) have been broken since the static `metrix_seed_bundle.json` fallback was removed — they read that file from disk. Pre-existing, not auth-related; fix by pointing them at a fixture if ever revived.
- Master-level permissions (`manage_team`, `view_agency_rollups`) are explicit boolean flags on `users`/invites, separate from `role`/per-account grants; `role==="admin"` always implies both everywhere they're read (login/me, members list, route guards) rather than writing the flags for admins. Team invites now provision the account immediately (temp password + grants + permissions all set at invite time, since there's no separate "accept" step) instead of deferring to first login.
