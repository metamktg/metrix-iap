# METRIX IAP — Bug-Fix & Polish Phase Handoff
**Date:** August 23, 2026
**Purpose:** Full-context handoff for a new environment/session picking up this project immediately after infrastructure work closed out. Read this before touching code — it states precisely what's already verified working, what "done" means for each of the next two phases, and what's still genuinely open. This is a snapshot, not a spec to build from scratch: the canonical architecture is still `docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md`, and `CLAUDE.md`/`replit.md` remain the operating source of truth — read those first if this is your first time in the repo.

---

## 1. What just happened (context, not instructions)

The prior session closed out an "infrastructure settled" milestone: a long-running effort to reconcile a set of stale GitHub PRs, fix a stale Replit deployment branch, discover and evaluate a 974-commit parallel branch (`origin/replit-agent`) produced by Replit's own built-in agent, and fix a cluster of manual-CSV-import bugs that were blocking real data from loading. That work is finished and merged — see §3. Following that, the repo owner ran the **full IAP loop against a real client (AAFE) end-to-end, successfully, through to the generated user brief.** That is the single most important fact in this document: the platform's core pipeline works on real data, today, on `main`.

This document exists because the next phase is different in kind from the last one — reactive bug-fixing against a now-functioning app, then a visual-polish pass — and deserves a clean context window and (per the repo owner's choice) a more thorough model, rather than continuing in a session whose history is dominated by git archaeology that's now irrelevant.

## 2. What "done" looks like — read this section first

### Phase 1 — Bug-fix / stabilization (do this first)

Done means:
- **The full IAP loop** (`IAP_DATA_BUNDLE_PREP` → `IAP_ANALYSIS_CORE` → `IAP_REPORT_SUMMARY`/`IAP_STRATEGY_MAP` → `IAP_BRIEF_BUILDER` → `MST_TEST_ENGINE` → `IAP_OPTIMIZATION_LOOP`) runs clean end-to-end for AAFE and at least one other real account, with no thrown errors, no silently-fabricated data (the platform's own honesty invariant — see `replit.md` "Architecture decisions"), and no manual workarounds required.
- **Manual CSV/XLSX import** stages and parses correctly for all four report classes (`demographic`, `device_placement`, `ad_summary`, `conversion_device`) against real Meta exports, including the messy real-world shapes already proven to occur: duplicate headers, totals rows, Google Sheets round-trip ID corruption, aliased column names. Warnings surface but don't block unless the file is genuinely unusable (no spend/impressions at all, a critical breakdown column truly absent).
- **Creative mapping** (`ad_names` → creative assets → cell library) resolves correctly for real accounts, not just the seed fixture.
- **Every bug the repo owner found during the AAFE run is either fixed or explicitly triaged** (see §4 — this document does NOT enumerate them, because they weren't reported to the session that wrote this handoff; the new session needs to get that list from the repo owner directly as the first step).
- **CI is green on `main`** and stays green — no re-introducing the flaky-test class of bug (see §3.4).
- No open `P0`/`P1` item from `docs/resources/IAP_INFRASTRUCTURE_AUDIT_2026-07.md` or `docs/resources/METRIX_Platform_Gap_Audit_Phase1.md` that blocks a real client from running the loop unattended.

This phase is **not** done when the code merely "looks right" — it's done when it's been run against real data and the output was verified against what a human expects (the same discipline used to catch the manual-import bugs last session: read the actual uploaded file, run the actual parser, don't guess).

### Phase 2 — UI/UX polish to standard SaaS visual quality (only after Phase 1)

The repo already has a deliberate design system (Nocturne: flat dark tokens, no glow/gradient/blur, a formal typography scale, a disclosure rulebook for information density — see `replit.md` "Product" and the rulebook comment atop `artifacts/metrix-iap/src/pages/metrix/shared.tsx`). Multiple fidelity-sweep passes already happened (PRs #107–#113). "Polish to SaaS standard" in this phase means the **final layer above that foundation**, concretely:

- **Motion & interaction polish**: consistent transition timing/easing across hovers, panel opens, tab switches, drawer slides — currently functional but not systematically tuned. No jank, no missing transitions on state changes that have them elsewhere.
- **Loading & empty states**: every data-bearing surface has a real loading state (not a blank flash) and a real empty state (not a broken-looking blank card) — audit against the "honest data" principle: an empty state should say *why* it's empty (not run yet, no data in range, etc.), never fabricate placeholder content.
- **Error states**: every mutation/fetch that can fail has a user-visible, non-generic error state. Check this systematically — it's easy to have handled the happy path everywhere and missed error UI in a few corners.
- **Responsive behavior**: verify at realistic agency-user viewport widths (this is a dense B2B dashboard, not a marketing site — laptop-width is the primary target, but confirm nothing breaks at common external-monitor and smaller-laptop widths).
- **Accessibility floor**: focus states visible and consistent, sufficient contrast (there's already `check:text-primary-contrast`/`check:css-token-contrast`/`check:text-muted-contrast` CI gates — Phase 2 should get these to zero violations, not just passing the current baseline), keyboard navigability of primary flows.
- **Micro-consistency sweep**: icon sizing/weight, spacing rhythm, corner radii, border treatment — one more pass specifically hunting for the last few places that drifted from the Nocturne conventions, the way PRs #107–#113 did for typography/tables/glow.
- **Information density**: continue paying down the `docs/resources/METRIX_UI_Disclosure_Audit_Phase1.md` backlog (tracked via `check:disclosure-rulebook`, currently advisory/non-blocking in CI — see `.github/workflows/ci.yml`'s comment on that step). Phase 2 is a reasonable point to consider flipping it to a hard gate once the backlog is near zero.
- **First-impression surfaces**: login, onboarding wizard, empty manager overview — these are what a new user or prospect sees first and deserve the highest polish bar even though they're visited least.

Done for Phase 2 means: a design-literate person unfamiliar with the build history looks at the app and doesn't clock it as "clearly AI-built" or "clearly a work-in-progress" — it reads as a shipped product in its category (performance-marketing analytics SaaS, dense-data dashboard genre — think the visual bar of Linear, Vercel dashboard, or similar flat-dark B2B tools, not a generic admin template).

## 3. What changed in the immediately-prior session (condensed)

Full detail is in git history (`git log --oneline main`) and the PRs below; this is the condensed version so the new session isn't flying blind on recent changes.

1. **Stale-PR reconciliation.** Three long-open PRs (#2, #3, #14) predated ~100 commits of subsequent work and couldn't be merged as-is. Their *intent* was rebuilt fresh against current `main`: manual-analysis signal-table writes (PR #117), onboarding wizard (PR #119), docs landed as historical record (PR #118), code-splitting/tab-state/CORS (PR #121). The three original PRs are now closed as superseded.
2. **Deployment branch fixed.** Replit's deployment was tracking a stale branch frozen days behind `main`. Repointed to track `main` directly; the repo owner now keeps it in sync via ordinary pull/push in the Replit Git pane, then republishes.
3. **`origin/replit-agent` fully evaluated and closed out.** A separate, ~2-month, 974-commit branch produced by Replit's own built-in agent was discovered mid-session. Every piece of it was checked for unique value against current `main`: the one genuinely useful file (`xlsxToCsv.ts`) turned out to already be on `main` (merged earlier, unrelated PR). Institutional-knowledge memory docs (`.agents/memory/metrix-conversion-device-tracking.md`, Supabase outage notes) were already ported and identical. Backend logic (`analysisEngine.ts` etc.) on `main` is a strict superset of that branch's version. **Conclusion: nothing left to port. Do not re-open this investigation** unless new evidence surfaces.
4. **Manual-import bug cluster fixed** (PRs #122, #123, #124 — this is the bulk of the session and the reason the AAFE run succeeded):
   - Meta's grand-totals row (blank "Day") used to hard-reject the whole file; now excluded from data rows and cross-validated against the parser's own computed sums, surfacing a mismatch as a warning instead of a block.
   - Duplicate staged files per import slot (e.g. two demographic exports covering different weeks — a legitimate, intentional multi-file-per-kind design in `analysisEngine.ts`) used to be silently hidden by the UI (`.find()` picked one, discarding visibility into the rest); now all staged files per slot are shown with individual remove buttons.
   - `ad_summary` exports missing "Campaign name" were hard-rejected even though that column is genuinely optional for that report class (`requiredBreakdownColumns` didn't list it, but a separate fixed cross-class set did) — fixed to key off each class's own required-column list.
   - A pre-existing, unrelated CI failure (`SectionInfoIcon` smoke test) was root-caused and fixed: the test's wait-for logic matched the sidebar's permanent "Hypothesis Queue" nav label instead of the actual page content, racing against the code-split route load.
5. **Verified against the repo owner's real uploaded files** (not synthetic fixtures) — both a Placements (22,015 rows) and a Demographics (500 rows) export parsed cleanly with the fixes in place. One **real, still-open data-quality issue** was surfaced this way, not a code bug: the Demographics file lost ID precision on ~500 of 501 rows because it was round-tripped through Google Sheets before being saved as `.xlsx` (Sheets silently rounds long Meta IDs stored as numbers). The parser already handles this safely (blanks the cell rather than risk a wrong join, with a clear warning) — the fix, if the repo owner wants one pursued, is export hygiene (CSV direct from Meta, or format ID columns as Text before saving), not code.

## 4. What's still genuinely open

- **The repo owner's list of minor bugs found during the AAFE run.** Not enumerated anywhere in this repo or its history — get this list directly as the first action of the new phase. Don't assume any of §3's fixes are what they meant.
- **Tasks tracked as pending in the prior session's task list**: "verify manual import + creative mapping end-to-end" and "run the full IAP loop end-to-end" — functionally superseded by the successful AAFE run, but that verification happened in the repo owner's own environment, not observed directly by the session that did the code fixes. Worth a quick sanity confirmation early in the new phase rather than assuming.
- **Product-level tracking-basis decisions** (F-02 row-level tracking basis, F-08 re-upload dedup from an earlier manual-upload audit) — flagged as open in `docs/resources/METRIX_Manual_Upload_Ingestion_Audit_Phase1.md`, informed by the design already documented in `.agents/memory/metrix-conversion-device-tracking.md` (the `tracking_basis` column / `conversion_tracking_signal` design is already implemented in `analysisEngine.ts`/`metrixSeedAssembly.ts` — these two items are about remaining edge cases, not a missing feature).
- **Optimization Loop** — per `docs/resources/METRIX_IAP_Loop_Execution_Audit_Phase1.md`, this stage was a complete stub as of that audit. Confirm current state before assuming it's still unimplemented; if it still is, it's the largest functional gap in the loop and should be scoped explicitly rather than folded silently into "bug fixing."
- **No live DB/Supabase access from a sandboxed Claude Code session.** This blocked direct verification of live-data behavior in the prior session (pasted credentials get auto-blocked by this environment's safety classifier). If the new session runs in the same kind of sandbox, this constraint still applies — live verification needs to happen in Replit directly, or the new session needs a real credential channel, not chat-pasted secrets.

## 5. Operating conventions (pointers, not duplicated here)

- **`CLAUDE.md`** — documentation map, working rules for `docs/`, variable-code registry protocol.
- **`replit.md`** — the actual operational source of truth: run commands, auth model, full architecture-decisions log, gotchas (75MB upload limit history, Resend sandbox behavior, dev/prod DB split), product conventions (typography scale, disclosure rulebook, normalization framework).
- **`docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md`** — canonical schema/architecture. Supersedes everything else if there's a conflict.
- **`.agents/memory/MEMORY.md`** — index of ~60 sharp, specific institutional-knowledge notes (one-line-each index, full file per topic). Read the index before debugging anything that feels like it should have a known gotcha — it probably does.
- **This session's git convention**: feature branch → PR → CI → merge, even for small fixes (established and followed consistently across PRs #115–#125). Don't push directly to `main`. Attribution footer required on any GitHub comment/PR body per the harness's standing instruction.

## 6. How to resume, mechanically

- `main` is fully synced as of this handoff — local, `origin/main`, and the repo owner's Replit workspace all match (confirmed via the Replit Git pane showing a clean `main` with no pending sync arrows).
- `pnpm run typecheck` and `pnpm --filter @workspace/scripts run smoke:metrix-iap-tests` both pass clean on `main` right now — that's the baseline; don't let it regress.
- Deployment: Replit tracks `main` directly. A GitHub merge does **not** auto-deploy — the repo owner still needs to Pull (if their local workspace is behind) and Republish from Replit's UI after any merge that should go live.
- No open PRs as of this handoff.
