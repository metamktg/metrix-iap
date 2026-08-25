# METRIX Phase 1 → Phase 2 Entry Handoff (2026-08-25)

**Hand this to the next environment together with the two originals**
(`METRIX_Phase1_Bug_Triage_and_Audit_Prompt.md`, the Phase 2 handoff zip). This document is
the *third* in that chain and supersedes them wherever they disagree, because it was written
against the merged code and the live database rather than against a plan.

---

## 0. What this session was

A deliberate **buffer** between Phase 1 (stabilization, completed in a prior environment) and
Phase 2/3 (enabler sprint + design pass). Its three objectives, in the operator's words:

1. Validate the changes made in the previous environment.
2. Determine how many of the promised fixes actually landed, and how fully.
3. Mend the Phase 1 → Phase 2 handoff and fix the bugs surfaced along the way.

It then widened twice on request: an independent double-pass for lingering bugs, warnings and
UI/UX blockers; and a full backend/Supabase validation for data integrity and audit-readiness.

**The single most useful finding is a pattern, not a bug** — see §3. Carry it into Phase 3.

---

## 1. Verification state at close

Every gate below was run **in this session, on the merged tree**, not inferred.

| Gate | Result |
|---|---|
| `pnpm run typecheck` (all packages) | green |
| Metrix IAP vitest | **117 files / 1,691 tests** green |
| API server (CI-gated set) | **19 files / 298 tests** green, scrubbed env |
| Scripts unit tests | green |
| `check:api-codegen-drift` | green |
| `check:disclosure-rulebook` (**now blocking**) | 0 violations |
| Three contrast gates | green |
| `smoke:api-server` | green |
| `smoke:metrix-iap-build` (build + 5 auth forms in preview) | green |
| `smoke:marketing-build` | green |
| `smoke:marketing-e2e` (3 tests) | green |
| `smoke:login-page-layout` (10 tests) | green |

**This is a stronger pass than Phase 1 closed on.** That audit had to record the build smoke as
unverified, attributing it to a sandbox limitation. It is recoverable — see §7.

Not runnable here, unchanged from Phase 1: `check:seed-fixture-drift` and the full api-server
vitest suite (both need live secrets — `DEMO_ACCOUNT_PASSWORD`, `DATABASE_URL`, a running API
server).

---

## 2. What this session found and fixed

Thirteen defects, `BUG-28` … `BUG-40` in `BUG_TRACKER.md`, which carries the full evidence for
each. Grouped by what they actually were:

### 2a. Propagation gaps — the primitive was right, the distribution wasn't

Four cases where Phase 1 built an honesty primitive correctly at the boundary and then threaded
it to the UI **by hand**, so call sites silently missed it.

- **BUG-28** — measured demographic join coverage gates segment signal classification (a
  "signal ✓" over a 2%-coverage export is fabricated confidence). It reached 2 of 5
  `SegmentDrilldownModal` call sites. The *same modal* suppressed the warning when opened from
  Audience and rendered an unqualified read from anywhere else.
- **BUG-29** — cause-specific empty states for creative tabs reached 3 of 10 `CreativeCard`
  sites, and **no** site passed a funnel reason at all, so most popups told users to import a
  file they had already imported.
- **BUG-32** — the Alerts page never surfaced the data-quality flags its own copy documents as
  its source.
- **BUG-33 / BUG-11** — a refetching KPI tile rendered the same "—" as a missing value, and
  null-coalescing rendered `$0` / `0.00%` for genuinely unknown numbers.

**Both structural fixes moved derivation to where the value is USED** (`useDemographicCoverage`,
`useCreativeEmptyReasons`), so a new call site cannot forget what it never has to pass. Explicit
props still win, because two callers legitimately hold better-scoped data.

### 2b. Backend and data integrity

- **BUG-34/35** — 42 unindexed foreign keys, including every RLS policy predicate column, and
  `ad_performance` as the only run-scoped rollup without a run index.
- **BUG-36** — `content_md5` NULL on 93% of rows left the BUG-09 duplicate guard inert.
- **BUG-37** — RLS policies re-evaluated `auth.uid()` once per row.
- **BUG-38** — the storage-reclaim script *I had prepared* would have destroyed user work.
  Auditing it against live data before recommending it found that `creative_deconstructions`
  cascades on delete, 40 of 62 candidate rows carried user-edited `ad_names` mappings and 18
  carried run lineage. Hardened; the safe set dropped from 62 files to 22. **The script remains
  deliberately unexecuted** — see §5.
- **BUG-39** — *(highest severity found this session)* a slow run was indistinguishable from a
  dead one. Both engines reclaim a dead `running` row by flipping it to `error` **and deleting
  the partial outputs it wrote**. Staleness was `now - started_at > 10 min`, and `started_at`
  never advances — so the rule really said *"any run older than ten minutes is dead"*, working
  or not, and the delete would race a live writer. Neither engine could signal otherwise: a
  generation run spends most of its clock inside **one model call**. Measured headroom against
  live history: longest successful strategy run **5.44 min against a 10-minute window**.
  Fixed with a 30s heartbeat (`lib/runHeartbeat.ts`) that dies with the process.

### 2c. Warning noise

- **BUG-31** — the creative-metadata cascade bypassed the warning-fold policy and ran after
  header claiming.
- **BUG-40** — the duplicate-header notice fired once **per column**. Meta's pivot exporter
  duplicates a fixed *set* of headers together, so on the latest live AAFE run **6 of 15
  warnings were that one message**, crowding out the 2.9% coverage warning and three ID columns
  blanked by a Sheets round-trip.

### 2d. Contract and CI

- **BUG-30** — `reconciliation` was declared REQUIRED in the API contract with zero writers.
- **CI gated 59 of 288 available secret-free server tests.** Expanded 5 → 19 files. This left
  the column-mapping cascade, the seed-assembly fix that resolved a production outage, and
  objective coverage with **no automated gate at all**.
- The disclosure rulebook was flipped from advisory to **blocking**, deliberately *before* the
  Phase 3 UI pass: it is a ratchet, and a ratchet is worth most immediately before the churn it
  exists to contain.

### 2e. Test coverage for the above

The four UI fixes shipped with pure-function coverage only; nothing asserted the **rendered**
surface, which is where the bug was. Four component test files now cover them. **Each was
regression-proven** — the fix was reverted, the failure observed, the file restored clean. Do
this for new honesty guarantees; a test that has never been seen to fail is not yet evidence.

---

## 3. The pattern worth carrying into Phase 3

> **An honesty primitive built correctly at the boundary and then distributed to the UI by hand
> will reliably miss call sites.**

Every propagation gap in §2a has this shape, and they were introduced *by the phase whose entire
purpose was honesty*. Phase 3 multiplies UI contact surface, which is exactly the condition that
turns one missed call site into five.

The defence is structural, not diligence: **derive at the point of use.** If a component needs a
guarantee, it should read the guarantee itself and accept an override, rather than depend on
every caller remembering to pass it.

A second, quieter version of the same lesson from BUG-39 and the progress-field bug beside it:
**"nothing renders it today" is not a fix.** The stale progress fields were harmless only because
the progress view happened to be gated on `isRunning` — an accident that stops protecting anyone
after one refactor.

---

## 4. The one open defect

**SECURITY DEFINER tenancy helpers are exposed over PostgREST.** Four helpers are callable by any
signed-in user at `/rest/v1/rpc/…`. `metrix_client_id_of_run(run_id)` resolves **any** run UUID
to its owning `client_id`, bypassing RLS — a cross-tenant mapping primitive, limited in practice
only by run ids being unguessable v4 UUIDs. The other three answer only about the caller.

**Do not simply revoke EXECUTE.** RLS policy expressions evaluate with the querying user's
privileges and all six run-scoped tables call this function inside their policies, so revoking
from `authenticated` breaks tenant reads outright. Correct remediation is relocating the helpers
to a schema PostgREST does not expose and repointing the policy references — a deliberate change
with a test pass.

This is open **by explicit operator decision**, not oversight: the security register was parked
in favour of operable implementation fixes. It is the first item of the security phase.

---

## 5. Deferred, with reasons (not defects)

- **Storage reclaim — recommended against for now.** 533 MB total, ~7% of the plan's 8 GB. No
  disk pressure; deleting source files immediately before a deploy removes restage capability
  exactly when it is most likely needed; and duplicates are inert now that `content_md5` is
  backfilled. Script is written and hardened at `docs/resources/sql/2026-08-25_upload_storage_reclaim.sql`.
  Deploy, confirm stable, then reclaim.
- **`multiple_permissive_policies` on 12 tables** — fixing turns 12 policies into 36 on the
  tenancy path for a saving unmeasurable at current sizes (most tables under 10 rows).
- **`unused_index` linter INFOs — do NOT act on them.** ~40 reported, including every index
  created in this pass. Counters start at zero for a new index; treating that list as a cleanup
  list would undo the fix.
- **Postgres patch** 17.6.1.141 → .180.
- **`auth_db_connections_absolute`** — Auth pinned to 10 connections rather than a percentage
  allocation, so scaling the instance will not scale Auth. Dashboard one-liner, worth doing
  before scaling.

---

## 6. Live system state at handoff

Verified by direct query, not inferred.

| | |
|---|---|
| Database | 533 MB (`manual_imports` 375 MB) |
| Ad accounts | 31 total — 23 configured, 8 unconfigured **with genuinely zero data** |
| Runs in flight | 0 analysis, 0 generation |
| Orphaned outputs | **0** — every output row in all four tables joins to a `success` run |

**Two corrections applied to live data this session:**

1. One `generation_runs` row was still advertising `progress_pct: 10`,
   `progress_stage: "Calling strategy model…"` on a run that had errored 80 minutes earlier.
   Corrected, and both reclaim paths now clear progress.
2. **`skov_pet`** held 33 `ad_performance` and 194 `demographic_performance` rows from two
   successful runs, but read `status: 'unconfigured'` with the overview *"Connect Meta Ad
   Account"* — the honesty invariant inverted: denying data it actually had. This is a **legacy
   row, not a live bug**: the status-promotion code landed 2026-08-20 and that account's last
   successful run was 2026-07-18. Corrected to match exactly what the current code writes.

**Per-account generation state** (the operator runbook's real status):

| Account | Analysis | Strategy | Briefs |
|---|---|---|---|
| NEW AAFE | Jul 1–Aug 18, Aug 25 ✓ | Aug 25, fresh ✓ | **missing** |
| Fresh Import …960 | Aug 25 ✓ | Aug 23 — stale vs analysis | Aug 23 |
| Bookster | Aug 18 | Aug 6 — stale vs analysis | Aug 23 |
| BELT / Gabri / ECAS / SKOV Pet | older | present | missing |
| skov | Jul 19 | Jul 18 — stale vs analysis | Aug 24 |

**Outstanding operator action:** regenerate **briefs for NEW AAFE**. Its full-range analysis and
strategy are both current; briefs were never generated. Note that a strategy run calls
`deletePriorGenerated(account, "briefs")` at 92%, so regenerating strategy always leaves briefs
missing until they are re-run — that is by design (briefs would reference pillars that no longer
exist), not a defect.

The 8 empty unconfigured accounts (`aaaa`, `aaaadf`, `Test`, `AAFE`, `AAFE 2`, `Clean Import …`,
`Failure Path …`, `Reupload Isolation Test …`) are test leftovers. They clutter the account list
but hold no data. Removing them is an operator decision, deliberately not taken here.

---

## 7. Gotchas for the next environment

Each of these cost real time in this session. None is a code defect.

- **Playwright browser revision.** The sandbox image carries Chromium **1194**; `playwright-core`
  1.61.1 pins **1228**, so every browser-dependent gate fails with *"Executable doesn't exist"*.
  Phase 1 recorded this as an unavoidable sandbox limitation. **It is recoverable:** the smoke
  scripts honour `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Every browser gate in §1 passed with
  `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Do not run `playwright install`.
- **The vite configs require `PORT` and `BASE_PATH` at config-load time.** Running
  `pnpm --filter @workspace/metrix-iap run build` from a clean shell fails with a config error
  that looks like a build break. Run the smoke script instead — it sets both.
- **A failed smoke can leave a `vite preview` process holding port 15195**, and the next run
  fails with *"Port already in use"*, which reads like a different bug. The process is
  `vite.js preview`, so `pkill -f "vite preview"` does **not** match it.
- **Replit injects secrets at process start.** After rotating a credential, an already-open shell
  keeps the old value. Two wrong diagnoses in this session (a direct-host routing theory, then a
  pooler-hostname theory) were both actually a stale shell. Open a new shell first.
- **Supabase direct host is IPv6-only and unreachable** from these environments. Use the session
  pooler: `aws-1-us-east-2.pooler.supabase.com:5432`.
- **Adding a `check:*` script obligates you to register it.** `workflow-check-coverage.test.ts`
  asserts every `check:*` script is either wired into a workflow or listed in
  `MANUAL_ONLY_CHECK_SCRIPTS`. Missing this turned CI red on main in this session.
- **Never paste DB credentials into chat.** The repo's own standing rule, and it was breached once
  in this session; the credential was rotated. It never reached a file or a commit (verified with
  `git grep` across all commits).

---

## 8. Standing rules that carried over and worked

Keep these. They are why the audit trail in `BUG_TRACKER.md` is usable.

- **The honesty invariant.** Never fabricate data; null stays null; a true-positive warning is
  never suppressed. Every fix in §2a is an application of it.
- **Verify empirically, not by reading.** The RLS audit probed the live database as `anon` and as
  a membership-less `authenticated` user across all 64 tables rather than reading policy text.
  A retired closeout warning (AAFE's Jul 1–16 rows being "doubled") turned out to be false —
  zero duplicate natural keys, totals matching the verified figure exactly.
- **Audit your own proposed change against live data before recommending it.** BUG-38 exists only
  because that was done.
- **Prove a test can fail before trusting it.**
- **State corrections plainly and move on.** Several diagnoses in this session were wrong before
  they were right; the record says so.

---

## 9. What Phase 2 and Phase 3 inherit

Unchanged and still authoritative — read them in this order:

1. `docs/resources/METRIX_Phase2_Enabler_Sprint_202608.md` — the work order (E1–E5). E5
   (`routes/metrix.ts` split, now ~3,636 lines) is structural and should be done **before**
   Phase 3 multiplies contact surface.
2. `docs/resources/METRIX_Phase3_Design_Brief_202608.md` — the design pass.
3. `docs/resources/METRIX_Phase1_Validation_Audit_202608.md` — this session's first two passes in
   full detail.
4. `docs/resources/METRIX_Backend_Supabase_Audit_202608.md` — the backend/RLS audit.
5. `BUG_TRACKER.md` — evidence for all 39 tracked defects (`BUG-02` … `BUG-40`;
   there is no `BUG-01` — the numbering starts at 02).
6. `docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md` — canonical when anything disagrees.

Still-live Phase 2 backlog beyond the work order: BUG-08 (restage discoverability), retention
policy for processed performance files, the ephemeral-upload-warning surfacing gap, and the
Optimization Loop build (3–4.5 days, on explicit request only).

The honest-data primitives — severity-split warning surfaces, coverage banners, 3-state signal
badges, the typography/density rulebook, `normalize.ts` — are the foundation Phase 3 presentation
should **build on, not replace**.

---

## 10. Known systemic defect (still true, still worth stating)

**Ecommerce hardcoding.** ROAS / CPA / purchase-funnel assumptions baked in as if every client
sells physical products. New code and docs must read the terminal metric from cohort
configuration rather than assuming ROAS. `docs/iap/` is deliberately exempt (it sits below
business-model logic). This predates every phase above and is not yet fully retired.
