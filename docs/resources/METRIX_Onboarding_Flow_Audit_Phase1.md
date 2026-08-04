# Metrix Onboarding Flow Audit — Phase 1

**Audit date:** August 4, 2026 **Scope:** the full new-user journey, invite through first data view.
**Method:** read-only trace of the actual code path, file by file — not a description of intended
behavior from docs.

## Headline finding

The onboarding mechanics (approval → password → first empty state → account connection → per-module
pending states) are unusually complete and consistent for a product this size. The real problems
found are narrow and fixable: one email-delivery limitation (already documented elsewhere), and a
nav-labeling bug that actively hid working features — fixed as part of this audit.

## Journey, step by step

**1. Admin approval** (`routes/metrix.ts:168-246,1671-1780`) — solid. Generates a 14-char temp
password, hashes it, sets `mustChangePassword: true`, mirrors into Supabase Auth, sends the approval
email. **Known limitation, not new:** Resend's sandbox sender only delivers to the account owner's
inbox until a domain is verified — every invite to a real new user currently 403s and falls back to
the on-screen temp-password copy button. Already documented in `replit.md`'s Gotchas section and
surfaced live via the admin console banner; not a silent gap.

**2. First login / forced password change** (`pages/auth/ChangePasswordPage.tsx`) — clean, no dead
ends: client-side validation, API error surfacing, a sign-out escape hatch.

**3. First view with zero ad accounts** (`ManagerOverview.tsx:52-80`) — good, deliberate empty state
with a clear CTA. One gap: the sidebar/nav itself isn't gated by `adAccounts.length`, so a fresh user
can click into Analysis/Strategy/etc. before adding anything (each of those pages does have its own
guard, per step 5 — so this isn't broken, just an extra click a user doesn't need).

**4. Adding the first account** (`AddAccountDialog.tsx`) — two real paths, no stubs:
- Meta OAuth: hands off to `/app/settings/integrations` for the real OAuth flow (a deliberate
  design choice per the file's own header comment) — a context switch worth keeping in mind, not a bug.
- Manual account + CSV: a proper 3-step flow with an unsaved-changes confirm guard; explicit that
  nothing is parsed at upload time.

**5. Post-account, pre-analysis states** — consistently implemented via the shared `ModuleScopeGate`
(`shared.tsx:936-968`) across Analysis/Strategy/MST/Reports/Creative: "choose an account" →
`UnconfiguredState` → each hub's own specific `PendingState` (e.g. Strategy Hub correctly points back
to Analysis rather than a generic dead end). Genuinely consistent quality across every page sampled.

**6. The one "getting started" resource that existed was mislabeled "Soon" — fixed.**
`OverviewUpdatesView.tsx` (`/app/overview/updates`) contains a real, complete 4-step getting-started
guide (Connect → Run analysis → Generate strategy → Generate briefs, then test). But
`navigation/navTree.ts` had it flagged `placeholder: true`, which renders a muted "Soon" badge in the
sidebar (`Sidebar.tsx:215-218`) — the link still worked, but the badge actively signals "not ready"
on the one page built to help a new user get oriented. **Fixed this pass**, along with four other nav
items carrying the same stale flag despite having real, working pages behind them
(`Strategy → Communications`, `Creative → Library`, `Creative → Import & Export`,
`MST → Performance` — all verified by reading the actual component, not just removing flags blindly).
`MST → Direction` keeps its `placeholder: true`: verified it's genuinely still a `PendingState` tied
to the Optimization Loop stub (Initiative 5), so the badge there is accurate.

**7. Docs vs. reality.** `docs/product/METRIX_Product_Loop.md` cites an "Onboarding cold-start"
section (§8.1) and a "cohort selection" step in a "master blueprint" that isn't present anywhere in
this repo — only the 37-line loop summary exists. No corresponding cohort-selection UI was found
either. Flagging per CLAUDE.md's rule against inventing content: this is a named, cited spec with no
discoverable source, not something to guess at or build from assumption.

## What's fixed this pass

- Removed the incorrect `placeholder: true` flag from 5 nav items with real, working pages behind
  them (`navigation/navTree.ts`), so the sidebar no longer shows a false "Soon" badge on working
  features — most importantly, the app's only getting-started guide.

## Open items, not yet actioned

- `overview_state.description`/`.primary_action`/`.secondary_action` — guided-setup copy the backend
  already assembles for empty ad accounts, never read by `UnconfiguredState` (see the companion
  IAP Output Consistency audit — top priority there).
- The referenced "Onboarding cold-start" (§8.1) spec has no located source — needs the actual
  document before anything can be built against it; cannot be inferred.
- Nav not gated by `adAccounts.length === 0` — minor, each downstream page already guards correctly,
  so this is a polish item, not a bug.
