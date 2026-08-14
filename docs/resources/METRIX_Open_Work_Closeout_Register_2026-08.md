# Metrix Open-Work Closeout Register — 2026-08

Purpose: one pass over everything still open against `metamktg/metrix-iap`, with a verified status and
a single recommended disposition for each, so nothing is left as an ambiguous open-ended project.

Every status below was verified against `main` at `4f40231` on 2026-08-14 by checking whether the
work's actual code is present — not by reading PR descriptions.

---

## 1. Root cause: `main`'s history was replaced on 2026-08-08

This explains why four PRs have sat open for weeks and why nineteen branches are dangling.

- `main` today has **50 commits, all dated 2026-08-08**, rooted at `238c064` "Git commit prior to
  merge" — a Replit workspace snapshot committed as a fresh history.
- The original lineage rooted at `185439b` "Initial commit" (2026-06-25) still exists on every
  pre-08-08 branch.
- `git merge-base origin/main origin/<any pre-08-08 branch>` returns **nothing**. There is no common
  ancestor.

Consequences, and they are absolute:

- **No pre-08-08 branch can be merged into `main`.** GitHub will either refuse or, if forced, produce
  a diff that reverts `main` wholesale (measured: 545–855 files, ~127k deletions per branch).
- The four open PRs are therefore **structurally dead as PRs**, independent of whether their content
  is still wanted.
- Every branch is either post-rewrite (mergeable) or pre-rewrite (must be re-landed as fresh work).
  There is no third category and no partial fix.

The `merge-replit-aug8`, `merge-replit-aug8-v2`, `mergeaug8`, and `repo-cleanup-aug8` branches are
artifacts of that reconciliation attempt. They are also orphaned.

---

## 2. Unlanded work carrying live production defects — highest priority

### 2.1 `claude/manual-import-bugs-fix-e86i7q` (orphaned, no PR, 2026-08-08)

Three defects fixed on this branch, **all four verified still live on `main`**:

1. **Manual analysis re-ingests every CSV ever uploaded.**
   `startManualAnalysis` (`analysisEngine.ts:795`) selects from `manual_imports` filtered only by
   `account_id` and `kind` — there is no `status` filter. Files already consumed by a previous run
   (`status='processed'`) are re-fetched and re-summed into each new run, silently inflating spend,
   impressions, and results further with every re-run. This directly violates the honest-data
   invariant and corrupts every downstream surface: KPI tiles, analysis summaries, strategy evidence.

2. **`restageImportsForRun` double-counts.** (`analysisEngine.ts:526`) It restages a past run's files
   without superseding files currently staged for the same `kind`, leaving two `staged` rows of one
   kind side by side for the next run to consume together.

3. **Preset date windows anchor to wall-clock, contradicting documented behaviour.**
   `analysisEngine.ts:1693` reads "Anchor preset windows to today (wall-clock), not maxDate", while
   `analysisEngine.ts:1627` and `replit.md` both state the window anchors to the latest date found in
   the data. `main` is internally inconsistent here.

4. **Fuzzy CSV column matching can map a rate column onto a count canonical.** The `UNIT_MARKER_TOKENS`
   guard and the "cost per X vs cost per Y" object-token check are absent from `iapCsvSpec.ts`.
   `iapCsvMapping.test.ts` exists on `main` but without the four safety cases that cover this.

**Disposition: re-land as fresh work off `main`, ahead of everything else in this register.** These
are correctness bugs in the live manual-import path, not enhancements.

---

## 3. Unlanded work, cleanly mergeable, no PR open

Both branches are post-rewrite, share `main`'s history, and are **zero commits behind** — they
fast-forward with no conflict. They have no PR, which makes them the likeliest work to be lost.

| Branch | Date | Contents |
|---|---|---|
| `claude/new-session-d9skbh` | 08-10 → 08-11 | Stops reporting a blended CPA belonging to no real ad; keeps deep-funnel events in the strategy evidence pack; fixes `creative-assembly` silently collapsing multi-row cell performance. 9 files, +430/−64, tests included. |
| `claude/onboarding-analysis-workflow-hkz02o` | 08-08 | Guided onboarding tour: first analysis run through to Strategy. 11 files, +805/−44, context tests included. |

**Disposition: review and merge both.** No rebuild needed. `hkz02o` also supersedes open PR #14.

---

## 4. Business blocker: Meta App Review legal pages absent

`claude/meta-app-verification-wq36k9` (orphaned, no PR, 2026-07-28) adds `PrivacyPolicy.tsx`,
`TermsOfService.tsx`, and `DataDeletion.tsx` to the marketing site with routes.

`main`'s marketing site contains only `Home.tsx`, `Thanks.tsx`, `not-found.tsx`. There are no legal
pages and no routes to any.

Meta App Review requires a live Privacy Policy URL and a Data Deletion Instructions URL before an app
requesting `ads_read` can leave development mode. Per `replit.md` the live Meta connection is
currently a pilot. **This is the gate on taking it to production.**

**Disposition: re-land as fresh work off `main`.** Small, self-contained, unblocks the Meta integration.

---

## 5. The four open PRs — all four should be closed

None can be merged. The question for each is only whether its content is still wanted.

| PR | Title | Content on `main`? | Disposition |
|---|---|---|---|
| **#17** | GitHub Actions CI (secret-free validation suite) | **Absent.** `.github/workflows/` holds only `supabase-policies.yml`. | Close. **Re-land the 118-line `ci.yml` fresh** — highest value-per-line item in the register (see §6.1). |
| **#14** | Guided first-run onboarding wizard | **Absent** (`ManagerOverview.tsx:472` still shows the one-line empty state), but **superseded** by `claude/onboarding-analysis-workflow-hkz02o`. | Close as superseded. Land `hkz02o` instead. |
| **#3** | Signal tables for manual analysis | **Absent, and still a real gap.** `analysisEngine.ts` writes `*_performance` tables but nothing writes `demographic_signal`/`placement_signal` — which is exactly what `metrixSeedAssembly.ts:863-864` (Audience/Placements UI, via `v3_placement_signal`/`c4e_placement_signal` in `seedTypes.ts:180`) and `generationEngine.ts:260-261` (strategy evidence pack) read. Manual-upload accounts still render empty on those surfaces. | Close. Re-scope as fresh work — the target shape should be decided alongside §7 item 4 rather than ported verbatim. |
| **#2** | IAP roadmap spec briefs + infrastructure audit | Docs **absent**. Its CORS commit is also **unlanded**: `app.ts:31` is still bare `app.use(cors())`, unrestricted. | Close, then split: (a) re-land the docs only if the roadmap is still current — much of it predates the rewrite; (b) **CORS tightening is a separate small security change worth doing now.** |

---

## 6. Standing gaps — status re-verified today

Against `docs/resources/METRIX_Platform_Gap_Audit_Phase1.md`, which is itself pre-rewrite and stale in
one place.

| # | Gap | Verified status |
|---|---|---|
| 1 | No CI runs tests before merge to `main` | **Still open.** Only `supabase-policies.yml` exists. A PR can still merge with zero automated verification. |
| 2 | Optimization Loop is a complete stub | **Still open.** `metrixGeneration.ts` exposes `generate/strategy` and `generate/briefs` only. No optimization generation path exists. Largest remaining build in the IAP chain. |
| 3 | MST layers 2–7 unimplemented | **Closed — confirmed.** `artifacts/metrix-iap/src/lib/mst-analysis.ts` is present on `main`. |
| 4 | Analysis Core target-shape decision | **Still open, and it is a decision, not a task.** Full-replace vs window-scoped per run for `concept_performance`/`variable_performance`, plus the `deleteRunOutputs` rollback gap. Blocks a clean re-scope of PR #3. |
| 5 | Onboarding cold-start spec §8.1 cited but missing | **Still open.** Needs the canonical source document; cannot be authored in-repo per CLAUDE.md. |
| 6 | Supabase leaked-password protection disabled | **Still open — confirmed live** via Supabase advisor (`auth_leaked_password_protection`, WARN). One-click toggle. Low impact today (Auth users are FK targets only), free defence-in-depth. |

### 6.1 New finding: the API server cannot boot without the Anthropic integration

`lib/integrations-anthropic-ai/src/client.ts` throws at **module load** when
`AI_INTEGRATIONS_ANTHROPIC_BASE_URL` or `AI_INTEGRATIONS_ANTHROPIC_API_KEY` is unset. This is not a
degraded-generation path — any deployment without those variables provisioned fails to start
entirely, including `/api/healthz`, which never calls the client.

Flagged in PR #17's description and never actioned. **Worth an explicit decision:** lazy-initialise
the client, or accept a hard boot dependency and document it as required env in `replit.md`.

### 6.2 Supabase advisors — accept or act, then stop re-surfacing them

- **4× `SECURITY DEFINER` functions executable by `authenticated`** (WARN): `metrix_client_id_of_run`,
  `metrix_user_in_org`, `metrix_user_is_client_member`, `metrix_user_is_client_writer`. These are the
  documented tenancy helpers from `replit.md`, so this is likely by design — but it should be
  explicitly accepted in `docs/security/` so it stops reading as an unresolved finding.
- **~40× `rls_enabled_no_policy`** (INFO): this is the intended deny-by-default importer posture (RLS
  on, no policies, grants revoked). Working as designed; worth one line in the security doc.

---

## 7. Branch disposition — all 25 branches besides `main`

**Merge (2):** `claude/new-session-d9skbh`, `claude/onboarding-analysis-workflow-hkz02o`

**Re-land as fresh work off `main` (3, in priority order):**
1. `claude/manual-import-bugs-fix-e86i7q` — live data-integrity defects
2. `claude/meta-app-verification-wq36k9` — Meta App Review blocker
3. PR #17's `ci.yml` — stops the next regression landing silently

**Delete — work verified already present on `main` (3):**
- `claude/data-sorting-visual-hierarchy-i17xek` → `docs/performance/supabase-cpu-investigation.md` present
- `claude/metrix-downstream-events-7t2fjo` → ATC/checkout at demographic grain present in `import.ts`
- `claude/remove-manager-overview-account-pills` → pill row absent from `OverviewLoopHub.tsx`

**Delete — history-rewrite artifacts (4):** `merge-replit-aug8`, `merge-replit-aug8-v2`, `mergeaug8`,
`repo-cleanup-aug8`

**Decide, then delete (13).** All orphaned, all pre-rewrite, none mergeable. Confirmed **not** on
`main`: the ECAS Meta MCP scaffold (`ecas-meta-mcp-kickoff-04e45c`), the `/design-sync` skill
(`design-system-sync-g5w00t`), and both pricing documents (`metrix-pricing-analysis-zbrqtn`,
`pricing-service-tiers-xvdxi0`). The rest — `analysis-core-integration-kcvpa4`,
`github-settings-read-write-32wjre`, `metrics-platform-nav-b90zig`, `metrix-iap-data-integrity-bjgcex`,
`metrix-iap-docs-setup-ctaklf`, `uploads-date-filters-audit-1torz9`, plus the four open-PR branches —
are superseded by the 08-08 snapshot or by items above.

Each needs one call: **rebuild the idea fresh, or drop it.** Nothing on these branches can be merged,
so "leave it for later" is not a real option — it is what produced this register.

---

## 8. Suggested order

1. Merge the two clean branches (§3). Zero risk, recovers real work immediately.
2. Re-land the manual-import fixes (§2). Live data corruption.
3. Re-land `ci.yml` (§6.1 / PR #17). Everything after this is protected by it.
4. Re-land the Meta legal pages (§4). Unblocks the Meta integration.
5. Close all four PRs with a pointer to this register (§5).
6. Tighten CORS (§5, PR #2).
7. Flip leaked-password protection; write the two advisor acceptances into `docs/security/` (§6.2).
8. Decide the Anthropic boot dependency (§6.1).
9. Decide the Analysis Core target shape (§6 item 4), then re-scope the signal-table work (PR #3).
10. Sweep the branch list (§7) and delete everything dispositioned.

Items 1–7 are mechanical. Items 8–10 are genuine product/architecture decisions and are the only
things in this register that should still be open a week from now.
