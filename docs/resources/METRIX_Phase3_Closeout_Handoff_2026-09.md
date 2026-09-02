# METRIX IAP — Environment closeout and handoff

**Cut 2026-09-01.** `main` at `882fc708`. Live at https://app.metrix.ad serving
`index-DnnumY9p.js`, verified to be a build of that commit (§4.3).

This document exists so the next environment does not have to reconstruct any of
this by reading back through a transcript. Everything below is either a fact
produced by a command that is named here, or an owner decision recorded with its
date. Where something is an estimate or unverified, it says so.

**Read `CARRY_FORWARD_REGISTER.md` and `METRIX_UI_REFACE_REGISTER_2026-08.md` §7
first.** This document does not restate them; it records what changed after them,
what the environment is now, and what is left.

---

## 1. The one architectural decision that changed since the last handoff

### The objective is derived from the data. It is not configuration.

**Owner decision, 2026-09-01, verbatim intent:** the objective is *"strictly for
pertaining to analysis focus"*, *"should only be a configuration point when it
comes to running the analysis"*, *"should be determined itself not even by a user
toggle"*, and the system *"should be smart enough to know from the data it
receives"*.

This supersedes the 2026-08-29 decision recorded in `check-cohort-reach.ts`, which
bounded the objective's *reach* but still allowed an operator to *set* it in
Settings. The reach bound still stands. The setting does not.

**What that means in code, as of `882fc708`:**

| | |
|---|---|
| Source of truth | each ad's Meta `Result type`, already parsed into `base.result_type` |
| Deriver | `inferObjectives()` in `artifacts/api-server/src/lib/cohortConfig.ts` |
| When | during the analysis run, written to `ad_accounts.objectives` at finalize |
| Readers | unchanged — `generationEngine`, seed assembly, exports all still read `account.objectives` |
| Operator control | **none.** The Settings toggle, `PATCH …/objectives`, its OpenAPI path, both schemas and the generated hook are all deleted |
| Settings surface | read-only report of what was derived, with an honest "Not yet determined" state |

**How the derivation works, and why:**

- **One ad is one vote.** Meta assigns one result type per ad from its optimisation
  event. Counting *rows* would over-weight ads that ran longer or carry more
  breakdown splits; counting *result volume* would let a single high-converting ad
  outvote a whole campaign pointed elsewhere.
- **10% materiality threshold** (`OBJECTIVE_MATERIALITY_SHARE`), calibrated against
  real accounts rather than picked round: Fresh Import runs 50 lead ads and 3
  purchase ads (5.7% — one campaign leaking); NEW AAFE runs 363 and 48 (11.7% —
  genuinely both). Any cut between those separates them.
- **No classified signal returns empty — undetermined.** Never a silent ecommerce
  default. This is a real case, not a defensive branch: Crossval and BELT carry
  nothing but `unknown` result types.
- **Ambiguous result types map to nothing rather than being guessed.** `Website
  trials started` is the live example — it reads as a lead for SaaS and an
  activation for an app, so it is deliberately absent from `OBJECTIVE_SIGNALS`.

**Verified against the real seed. It corrects the old hand-configuration:**

| Account | Was configured | Derived |
|---|---|---|
| Bookster | ecommerce+app | **app** — ecommerce was 1 ad (2%) |
| Fresh Import | ecommerce+lead_gen | **lead_gen** — purchases were 3 ads (6%) |
| Gabri / skov / SKOV Pet | *unset* | **ecommerce** |
| Crossval / BELT | *unset* | **undetermined** |
| East Coast Art Studio / NEW AAFE | — | unchanged, agree exactly |

Two accounts were configured **wrong** and five were never configured at all.

### ⚠️ Consequence the next environment will hit first

**Accounts keep their stale stored value until each is re-analysed.** Bookster
still reads `ecommerce+app` in the UI until a run happens, then corrects itself to
`app`. This is correct — the data has not been re-read — but it means the table
above describes what the derivation *will* produce, not what the UI shows today.

To see it working immediately, run analysis on **Bookster** or **Fresh Import**;
those are the two where the derived answer differs from what is stored.

### Language rule for anyone writing about this

Do not treat the objective as a core concept of the platform, and do not use it to
describe an account to a reader. It may decide which terminal metric a run reports
and which optional column groups it assesses — nothing else. `check:cohort-reach`
enforces the bound; `CLAUDE.md` carries the rule.

---

## 2. Environment traps — the expensive things to rediscover

Every one of these cost real time in the session that produced this document.
They are not in `replit.md` because most only bite an agent working from a fresh
cloud checkout.

### 2.1 The e2e browser is a version behind, and the failure is misleading

`playwright-core` (pinned `^1.61.1`) looks for
`/opt/pw-browsers/chromium_headless_shell-1228`, which **is not installed**. What
*is* installed is `chromium-1194` and `chromium_headless_shell-1194`.

Every spec in `tests/e2e/` reads `process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`
and passes it as `executablePath`. So the whole e2e suite runs fine if you set it:

```sh
export REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

**Why this matters beyond e2e:** `smoke:metrix-iap-build` runs a post-build login
render check through Playwright. Without the variable it prints

```
BUILD OK  artifacts/metrix-iap/dist/public/index.html present with bundle script
FAIL  Login page render check failed on production build
```

and exits 1. **The build succeeded.** Only the browser check failed. Read the
`BUILD OK` line before concluding the build is broken. CI installs the matching
browser as its own step, so CI never sees this.

### 2.2 Do not run the client build directly

`pnpm --filter @workspace/metrix-iap run build` fails with
`PORT environment variable is required but was not provided` — `vite.config.ts`
demands it. Use `pnpm --filter @workspace/scripts run smoke:metrix-iap-build`,
which is also what CI runs.

### 2.3 CI and `.replit` run DIFFERENT check sets

`.replit`'s validation list and `.github/workflows/ci.yml` are **not** the same
set. A change can pass every local validation and still fail CI. This actually
happened: `check:token-colors` is in CI and was not in the local set, so a merge
went in and main went red.

**Before pushing, run the checks from `ci.yml`, not from `.replit`.** The CI list
as of this commit:

```
typecheck · disclosure-rulebook · unused-exports · text-primary-contrast
css-token-contrast · locator-ambiguity · interaction · token-colors
stray-shell-output · payload-legibility · type-scale · chart-palette
cohort-reach · api-codegen-drift · scripts tests · api-server pure unit list · api-server smoke
metrix-iap vitest · metrix-iap build · marketing build · marketing e2e
```

`check:cohort-reach` joined this list on 2026-09-01 (§4.1). It was `.replit`-only
before that, which meant it protected nothing on the merge path.

### 2.4 The api-server CI test list is append-only, and it is easy to miss

`ci.yml` runs a hand-maintained list of api-server test files that pass with **no
environment set** (the full suite needs live secrets). A new pure test file that
is not added to that list **gates nothing**. Verify with:

```sh
env -u DATABASE_URL -u SUPABASE_DB_URL pnpm --filter @workspace/api-server exec vitest run <file>
```

then append it. `objectiveInference.test.ts` was added this way.

### 2.5 Regenerate codegen AFTER the last OpenAPI edit

`check:api-codegen-drift` compares committed generated types against a fresh
generation. OpenAPI **descriptions** become JSDoc in the generated output, so
editing a description after running codegen leaves the tree drifted and the gate
fails. Run `pnpm --filter @workspace/api-spec run codegen` as the final step.

Never regenerate from inside a validation script — orval's `clean: true` deletes
and rewrites files the Vite dev servers watch.

### 2.6 Publishing ships the Replit workspace's files, NOT GitHub's

This is the single most important deployment fact. `publish_app` deploys whatever
is in the Replit workspace. If the workspace has not pulled, **the publish
succeeds and serves stale code.**

Sequence that works:

1. Merge to `main` on GitHub, confirm CI green on the merge commit.
2. Get the workspace to fetch and merge `origin/main`.
3. Publish.
4. Verify (§2.7) — do not trust the publish status.

**The workspace can carry its own commits.** Replit writes an empty
`"Published your App"` commit on each publish, so the workspace is routinely
*ahead* of origin and a fast-forward will fail. **Merge, never reset** — a reset
discards those markers. Confirm what is in a local commit before deciding: on
2026-09-01 the marker was verified to change zero files, which is what made the
merge safe to do blind.

**The workspace will always read "N commits to sync" after a publish, and that
is normal.** Replit writes an empty marker commit on every publish, so the panel
shows the workspace ahead of origin even when the code is identical. Before
treating it as a divergence, check whether it is content:

```
# from the workspace: is there any actual file difference?
git diff --stat origin/main     # empty output = bookkeeping only, nothing to reconcile
```

Pushing those markers to `main` is optional — it clears the indicator and matches
what `main`'s history already contains, at the cost of a no-op CI run. Leaving
them is equally safe; the next pull just merges around them.

### 2.7 A publish status of `success` is not evidence

Two things must both be true, and neither is the status field:

```sh
sh scripts/src/verify-deployed-build.sh https://app.metrix.ad
```

matches the live entry bundle against a local production build **and** checks the
asset's `content-type` (a 200 proves nothing — the SPA fallback returns 200 +
`text/html` for any path).

Then confirm **which** build it is with a content marker — a string that exists
only in the new code — because two builds can share a hash for environment
reasons and a hash tells you a deploy happened, not that it was yours:

```sh
curl -sS https://app.metrix.ad/assets/<entry>.js | grep -oE '<Chunk>-[A-Za-z0-9_-]+\.js'
curl -sS https://app.metrix.ad/assets/<chunk>.js  | grep -c "<marker string>"
```

For an API change, probe the endpoint and compare against a control route:
a removed route returning **404** while a live route returns **401** proves the
server-side change shipped. Status alone cannot distinguish "gone" from
"unauthenticated".

---

## 3. What is left

Ordered by what actually blocks a platform release. Nothing here is a rediscovery
task — each item names the file or the command.

### 3.1 The largest functional hole — no producer for the optimize/act stage

**`F-e` in `CARRY_FORWARD_REGISTER.md`, and `§7.3 Missed` in the reface register.**

`optimization_loop` and `recommendation_cards` are read by six UI surfaces and
written by nothing except the static importer, which writes `"pending"` with a
null payload. **Every real account renders "No actions yet" forever.**

This is the biggest gap between the current build and a releasable platform, and
no amount of UI work closes it. The IAP loop is execute-on-command by design
(`replit.md`), so this needs a producer stage, not an automation.

### 3.2 Owner-specified: data shown in coherence with the UVP

Raised 2026-09-01 against five live-app screenshots. What was found and fixed in
that pass (all now on `main`):

| Defect | Fix |
|---|---|
| Creative DNA showed $60,704 for a token that spent $26,869 | `scopeToRun` — cumulative tables summed across runs |
| Two report charts ranked the wrong rows (C2B $675.81 vs $1,228.43) | `sumByLabel` in `reportExport.ts` |
| "Cost per unknown" rendered as a metric label | `eventLabel` snake_case fallback |
| Raw platform/device keys shown to users | `platformLabel` / `deviceLabel` |
| Token rows offered metrics a token cannot have | `TOKEN_UNMEASURABLE` + explanation |
| Seed refresh silently blanked the app | three failure states separated in `MetrixDataContext` |
| Revoked session soft-locked the UI | 401 invalidates the auth query |
| `app_defaults` typed as present when it isn't | type corrected |
| Nested `<button>` — one action silently dead | restructured |

**Still open in this category:** the 22 declared-but-unread fields
(`check:field-coverage`). The concentration is the story — `WorkspaceBilling` 7 of
8 unread means **there is no billing surface at all**, which a paid release
requires. `AppDefaults` 5 of 6 means the server directs an initial view and active
account that the client ignores.

### 3.3 Owner-specified: further UI platform revisions

The reface phase closed at `38cea8a6` and its reconciliation is reface register
§7. Two things there are explicitly *not* finished:

- **Panel MOTION sits at 31%** against a ≥60% exit criterion. Recorded as a
  deliberate revision, not a miss — the remainder is chart-hosting and progress
  panels whose motion lives in recharts marks and CSS meter fills. **It needs an
  owner to agree it is a revision.** Until then it is an open criterion.
- **`C6` — two placeholder vocabularies coexist**: ~158 `"—"` sites vs ~30 `"n/a"`
  sites. A breadth sweep, not a defect. The high-visibility surfaces are done.

### 3.4 Deferred by explicit decision — do not "fix" these casually

**Security: four SECURITY DEFINER tenancy helpers are callable over PostgREST**
(`METRIX_Backend_Supabase_Audit_202608.md` §1). Three answer only about the
caller. The fourth, `metrix_client_id_of_run(run_id uuid)`, resolves **any** run
UUID to its owning client, bypassing RLS, for any authenticated caller. Practical
risk is bounded by run ids being unguessable v4 UUIDs.

> **Do NOT simply revoke EXECUTE.** RLS policy expressions evaluate with the
> querying user's privileges, and all six run-scoped tables call this function
> inside their policies. Revoking from `authenticated` breaks tenant reads
> outright. The correct fix is to relocate the helpers into a schema PostgREST
> does not expose and repoint the policy references — a deliberate change with a
> test pass, not a pre-deploy patch.

**Also deferred, and acting on either would undo a fix:** the `unused_index`
linter INFOs, and the 42 `rls_enabled_no_policy` notices.

**Low impact, open:** Supabase Auth leaked-password protection is off. The product
uses custom bcrypt auth and Supabase Auth users exist only as FK targets, so this
affects nothing today.

### 3.5 Storage and efficacy carry-forward

Full detail in `CARRY_FORWARD_REGISTER.md`; not restated here. The one that is
worse than it looks:

**`S5` — `variable_performance.payload` Reach / Impressions / Clicks are
hardcoded zeros.** The code's own comment says these are "not available at the
token level — set to 0 so numeric consumers don't receive undefined". That is a
**fabricated measurement, persisted**, against the platform's own honesty
invariant. Fixing it means making three fields nullable and threading that through
`variable-drilldown.ts`, `reportExport.ts`, `dataExport.ts`, `kpiBreakdown.ts` and
`VariableDrilldownModal.tsx` — **and normalising the zeros already stored**, since
changing the writer does not fix persisted rows.

`S1` (run the BUG-45 upload reclaim before ANY live verification — stale staging
silently changes run output), `S2`, `S3`, `F-a`, `F-b`, `F-d` are unchanged.

`F-a` remains the best value-per-effort item on the register: `ad_creative_metadata`
carries each ad's **body text, headline, CTA type, link destination and link
caption**, is written every run, and is read by nothing.

### 3.6 Owner tasks — these need the operator, not an agent

These cannot be done from a cloud checkout. They are not blocked on analysis;
they are blocked on credentials or on a decision.

| Task | Why it needs you |
|---|---|
| `check:seed-fixture-drift` | needs a running API server **and** `DEMO_ACCOUNT_PASSWORD`. A stale fixture lets IAP tests pass against a snapshot that no longer matches the seed — the failure mode is silent. |
| `check:ad-performance-views` | **Verified PASS on 2026-09-02** via the Supabase connector (register §11). Needs a live DB credential. Asserts the three aggregate views carry `security_invoker = on`. Without it a superuser-created view reads the base table with the OWNER's privileges and hands every account's rows to anyone who can select it — one word of DDL, invisible to an "do the views exist?" check. |
| Run analysis on Bookster / Fresh Import | the only way to see the derived objective replace the stale stored one (§1). |
| Delete `archive/phase2-pre-rebase` | safe — verified it holds nothing unique. Both files recovered from it (`verify-deployed-build.sh`, `seedFixtureShape.test.ts`) are on `main`. Branch deletion is destructive and outward-facing, so it was left to you. |
| Agree or reject the Panel MOTION revision (§3.3) | it is an exit criterion currently unmet by decision, not by accident. |

### 3.7 Two known blind spots in the test data

- **The seed fixture contains no `lead_gen` or `service` account.** Those objective
  paths are exercised by unit tests but never by any fixture-backed suite. This is
  the most likely place for an ecommerce-hardcoding regression to hide during the
  rearchitecting.
- **`docs/` still describes the cohort as account architecture.** The blueprint and
  `METRIX_Cohort_Architecture_v1.md` predate the 2026-09-01 decision and were
  deliberately **not** rewritten — the blueprint is canonical per `CLAUDE.md`, so
  changing it is an owner call. `CLAUDE.md`'s operating rule and the reach gate's
  allowlist reasons *were* updated, so code guidance is correct while the
  reference docs lag. **Anyone reading `docs/` for the objective's role will get
  the pre-decision framing.**

---

## 4. Verification record — what was actually run

Every figure below is from a command run on `882fc708` in this environment. Nothing
is carried over from an earlier session.

### 4.1 Gates

All CI gates pass. CI run **#357** on the merge commit `882fc708`: `success`,
21/21 steps.

`check:cohort-reach` was `.replit`-only until 2026-09-01 — the gate enforcing the
objective's containment never ran on the merge path, so a violation could have
merged unchallenged. It is now in CI's design-gate block. Proven to still fire:
reintroducing a cohort read in `Topbar.tsx` fails it at that line, and it passes
again once restored.

### 4.2 Test suites

| Suite | Result |
|---|---|
| Metrix IAP vitest | **179 files, 2273 tests, 0 failures** |
| api-server pure unit list (CI's set) | **22 files, 372 tests, 0 failures** |
| scripts unit tests | **7 files, 119 tests, 0 failures** |
| api-server boot smoke | `GET /api/healthz` → 200 |

### 4.3 Full e2e sweep — 18/18 pass, 0 failures

Run on `882fc708` with `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` set (§2.1).
Without that variable **none** of these can run at all in this environment.

| Spec | Result | Spec | Result |
|---|---|---|---|
| forgot-password | 4/4 | metrix-iap-manual-import | 4/4 |
| login-page-layout | 10/10 | metrix-iap-review-queue | pass |
| marketing-e2e | 3/3 | metrix-iap-route-crawl | **210/210 visits clean** |
| metrix-iap-ad-account-overview | 4/4 | metrix-iap-section-info-icons | 8/8 |
| metrix-iap-avatars-tooltips | 5/5 | metrix-iap-section-info-tooltips | 6/6 |
| metrix-iap-dom-validity | pass | metrix-iap-shared-layout | pass |
| metrix-iap-engagement-funnel | 10/10 | metrix-iap-slider-persistence | 2/2 |
| metrix-iap-failure-injection | 6/6 | register-session-persistence | 2/2 |
| metrix-iap-funnel-filter | 5/5 | | |

`metrix-iap-route-crawl` is the broad one: **70 routes × 3 account shapes = 210
visits**, each asserting no uncaught exception, no console error, and that the
page rendered its own content rather than the seed-error screen, a route-level
404, or nothing. The three account shapes are a configured account, an
iap-is-null account, and the mixed unconfigured-with-data account.

Its number above is from an **isolated re-run** — the sweep's own crawl was
contaminated by a concurrent source edit (§6.4) and was discarded rather than
reported.

### 4.4 Deployment

| Check | Result |
|---|---|
| `verify-deployed-build.sh` | `MATCH` — live `index-DnnumY9p.js` = local build of `882fc708`, exit 0 |
| Asset content-type | `text/javascript` (not the SPA fallback) |
| New code live | marker `"Not yet determined"` present in `GeneralView-DyCZaZ-N.js` |
| Old toggle gone | `"running ads towards"` → **0 matches** in the live chunk |
| Removed endpoint | `PATCH …/objectives` → **404** |
| Control route | `PATCH …/name` → **401** (proves 404 means gone, not unauthenticated) |
| Publish status / health | `success`; 200 on `/`, fail-closed 401 on `auth/me` |

---

## 5. Runbook for the next environment

### 5.1 First five minutes

```sh
# 1. Confirm where you are
git log --oneline -1                      # expect 882fc708 or later

# 2. Make e2e possible (see §2.1 — without this the browser specs cannot run)
export REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome

# 3. Sanity: full typecheck
pnpm run typecheck
```

### 5.2 Before any push

Run the **CI** set (§2.3), not the `.replit` set. `cohort-reach` is in both as of
2026-09-01; everything else in this loop is CI's:

```sh
pnpm run typecheck
for c in disclosure-rulebook unused-exports text-primary-contrast css-token-contrast \
         locator-ambiguity interaction token-colors stray-shell-output \
         payload-legibility type-scale chart-palette cohort-reach; do
  pnpm --filter @workspace/scripts run "check:$c" || echo "FAILED: $c"
done
pnpm --filter @workspace/scripts run check:api-codegen-drift
pnpm --filter @workspace/scripts run test
timeout 900 pnpm --filter @workspace/metrix-iap exec vitest run
```

### 5.3 Full e2e sweep

```sh
export REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
for s in forgot-password login-page-layout marketing-e2e \
         metrix-iap-ad-account-overview metrix-iap-avatars-tooltips \
         metrix-iap-dom-validity metrix-iap-engagement-funnel \
         metrix-iap-failure-injection metrix-iap-funnel-filter \
         metrix-iap-hover-popover metrix-iap-manual-import \
         metrix-iap-review-queue metrix-iap-route-crawl \
         metrix-iap-section-info-icons metrix-iap-section-info-tooltips \
         metrix-iap-shared-layout metrix-iap-slider-persistence \
         register-session-persistence; do
  timeout 600 pnpm --filter @workspace/scripts run "smoke:$s" || echo "FAILED: $s"
done
```

Each spec boots its own Vite dev server on a dedicated port and mocks API
responses in-spec, so **no API server or database is required**. Budget ~40 min
for the full sweep; `metrix-iap-route-crawl` alone walks 69 routes × 3 account
shapes.

### 5.4 Deploy

Full sequence and the reasoning in §2.6–2.7. Short form: merge → CI green on the
merge commit → workspace fetches and **merges** `origin/main` → publish → verify
with `verify-deployed-build.sh` **plus** a content marker.

---

## 6. Method notes that changed outcomes

Not process ceremony — each of these caught something real in the session that
produced this document.

### 6.1 Mutation-test anything you are about to trust

A test passing does not mean it can fail. Five mutations were run against
`inferObjectives()`; four were caught. **The fifth exposed unreachable code**: the
"strongest objective always survives" guard could never fire, because shares sum
to 1 across at most four objectives so the top share is always ≥ 0.25, far above
the 0.1 threshold. The test written to cover it was passing through a different
branch entirely.

The fix was to delete the dead branch and assert the real invariant
(`OBJECTIVE_MATERIALITY_SHARE_MAX`), so raising the threshold past the point where
the property breaks now fails loudly. **Without the mutation pass, dead code and a
test that proved nothing would both have shipped.**

### 6.2 Validate against real data, not only fixtures

`inferObjectives()` was checked by replaying every account in the real seed. That
run is what showed the derivation *corrects* two hand-configured accounts rather
than merely reproducing them — the unit tests alone would never have shown it.

It also caught a bug **in the validation script** (wrong field names: `id`/`name`
instead of `ad_name`/`meta_ad_id`), which first reported every account as
"undetermined". A checking tool can be wrong; when a check reports something
surprising and uniform, suspect the check.

### 6.3 Cumulative tables must be scoped before aggregation

Repeating because it caused four separate defects and only surfaced when React
warned about colliding keys:

`concept_rollup` and `v3_variable_performance` are **run-keyed and cumulative** —
one row per run. Summing them unscoped counts the same spend once per run. Use
`scopeToRun(rows, analysis.latest_analysis_run_id)` from `lib/run-supersede.ts`,
or the page's own `runSelection`. Rows with a null run id are pre-migration
history and must always be kept.

`performance_by_cell` and `placement_signal` are **not** run-keyed — folding those
is a different and safe operation.

### 6.4 Do not edit source while a browser sweep is running

The e2e specs boot **Vite dev servers with HMR**. Editing any file under
`artifacts/metrix-iap/src` while a sweep is in flight pushes a hot update into
the running crawl.

This happened while producing this document: a one-line probe was appended to
`Topbar.tsx` to prove `check:cohort-reach` fires, and the route-crawl's dev
server logged `hmr update /src/components/layout/Topbar.tsx` mid-run. The crawl
walks 69 routes × 3 account shapes, so an invalidation part-way through makes the
result untrustworthy **whether it passes or fails**. It was re-run in isolation.

Either finish the sweep first, or make the edit in a separate worktree.

### 6.5 "No defect found" is not "no defect"

Where this document says something was verified, it names the command. Where a
figure is an estimate or a judgement, it says so. A summary line that is not
regenerated is worse than no summary — the reface register carries its own lesson
about exactly that (§7.3), where a stale "not started" line contradicted the
audit notes above it and misled a reader into thinking six ports were outstanding
when all six were closed.

---

## 7. Reading order for a fresh session

1. **This document** — current state, traps, what is left.
2. `CARRY_FORWARD_REGISTER.md` — the E6 register with per-item verdicts. Update
   status in place as you work an item; never drop one silently.
3. `METRIX_UI_REFACE_REGISTER_2026-08.md` **§0 before trusting any figure in it**,
   then §7 for the phase-close reconciliation.
4. `README_HANDOFF.md` — the older bundle index; still accurate for Phase 1/2
   provenance.
5. `../../CLAUDE.md` + `../../replit.md` — operating rules. `replit.md` is the
   source of truth for commands, auth model, stack and gotchas.
6. `docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md` — canonical product
   spec, **with §3.7's caveat**: its treatment of the cohort predates the
   2026-09-01 decision.

### Repository state at cut

| | |
|---|---|
| `main` | `882fc708` — CI #357 green. The closeout commits described in §4.1/§4.3 land on top of this. |
| Working branch | `claude/metrix-iap-phase-2-1n4gi2` (merged via PR #172) |
| Open PRs | none |
| Live | https://app.metrix.ad — `index-DnnumY9p.js`, verified a build of `882fc708` |
| Replit workspace | tree **identical to `main`**; ahead only by empty `"Published your App"` markers + the merge that brought main in. Verified 2026-09-01: diff against `origin/main` is empty, 0 changed files. |
| `archive/phase2-pre-rebase` | safe to delete — holds nothing unique (§3.6) |

