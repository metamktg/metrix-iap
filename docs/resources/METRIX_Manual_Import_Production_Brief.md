# METRIX Manual Import — Production Brief

**Branch:** `claude/manual-upload-metrics-vk8mei`
**State:** synced with `origin/main` (0 behind), clean tree, typecheck clean, suite 193 passing
**Purpose:** hand-off. What is safe to ship, what is blocked, in what order, and what must not be
touched without a decision.

---

## 1. Ship state

| | |
| --- | --- |
| Commits ahead of `main` | 9 (2 runtime, 7 documentation) |
| Runtime files changed | `iapCsvParser.ts`, `iapCsvSpec.ts`, `deconstructionEngine.ts` + 2 test files |
| Schema changes | **none** |
| API contract changes | **none** |
| Migrations | **none** |
| Typecheck | clean across all 7 workspace projects |
| Suite | 193 passing · failure profile unchanged from baseline (17 files / 2 tests, all gated on `SUPABASE_DB_URL`) |
| Real-export regression | asserted, zero drift — see §5 |

**This branch is deployable as-is.** It contains no schema change, no contract change and no
migration. Everything in it either fixes a defect in the running import path or is documentation.

---

## 2. What ships (runtime)

### 2.1 Delivery coverage gate — `iapCsvParser.ts`

`parseIapCsv` measures per-column fill and sum across parsed rows and exposes `coverage`
(`filledRows`, `sum`, `present`) plus `emptyColumns`.

A blocking delivery primitive (`Amount spent`, `Impressions`) that is **absent OR empty** now hard-
errors, with the message branching three ways so it names the correct fix:

| Cause | Message names |
| --- | --- |
| Column absent from export | "Add that column in the Ads Reporting column picker" |
| Every delivery metric blank | The conversion/action breakdown (most commonly `Conversion device`) |
| Some blank | Row count with no values |

Prior behaviour: a $0-spend export imported successfully with one cosmetic warning, producing an
analysis of zeroes that read as real.

### 2.2 Honest column-vs-row errors — `iapCsvParser.ts`

A required breakdown column that never resolves is diagnosed once, before the row loop, and names the
closest header in the file. Previously it surfaced as `Row 2: … must not include totals/subtotals
rows`, sending users to change an export setting that was already correct.

### 2.3 Spec corrections — `iapCsvSpec.ts`

- 22 derivable columns moved out of `ECOMMERCE_METRICS` / `SERVICE_METRICS` / `APP_METRICS` into
  `DERIVED_OR_IRRELEVANT_METRICS` — accepted transparently, never requested.
- `device platform` / `impression device platform` aliases added. Real Ads Reporting exports emit
  `Device platform`; Jaccard overlap with `Impression device` is 0.33, below the 0.5 threshold, so it
  never resolved without the alias.
- `Adds of payment info` added to `ECOMMERCE_METRICS` — absent from the spec entirely, silently
  dropped (216 events on the test account).

### 2.4 Deconstruction resilience — `deconstructionEngine.ts`

- `isTransientInfraError()` classifies retryable infrastructure failures: gateway status codes
  (502/503/504/520–530, 429, 408), socket and DNS errors, and the HTML-error-page-where-JSON-was-
  expected shape that a Cloudflare 525 produces through supabase-js. Conservative by design —
  anything unrecognised is treated as a real data error and is not retried.
- `withTransientRetry()` retries that class at 1s / 3s / 8s.
- Per-import isolation: one failure records the filename and continues instead of abandoning the
  remaining files. Prior behaviour aborted a 65-file batch on the first transient blip.
- Partial outcomes report honestly: *"61 of 65 creatives classified. 4 failed: … The successful
  classifications were saved — re-run deconstruction on the failed files only."*
- `noteDone()` double-count guarded by a per-import `counted` flag.

---

## 3. What does NOT ship

Documentation only. No code implements any of it.

| Item | Status | Blocker |
| --- | --- | --- |
| Rules 1–4 (authoritative ledger, `Results` polymorphism, derived proof, video facet) | Advisory, measured | No enforcement written |
| Rules 5–7 (`Landing page views`, click block, `BASE_METRICS`) | Proposal | **Awaiting decision** + §4 blocker |
| Rules 8–9 (engagement metrics, date window) | Proposal | Not implementable as written — §4 |
| ID identity, copy/asset libraries, swipe queue, recipes, onboarding tour | Specified | Unbuilt |
| Meta creative fetch | Not built | No `/adcreatives` call exists in the codebase |

---

## 4. Known blockers — read before scheduling any of §3

Found during the UI/UX and stream-consistency audit. These are stated, not fixed.

### 4.1 `coverage` has no transport

`parseIapCsv` produces `coverage`; nothing consumes it. The route persists `mapping_summary` and
`upload_warnings`; the OpenAPI contract exposes those two; `ImportConfidenceReport` reads
`imp.mapping_summary`. **The capability ledger described in the build spec has no data source.** The
measurement was added without a pipe — route → contract → client all need the field.

### 4.2 The A–F grade must be deleted BEFORE Rules 5–7 land

`ImportConfidenceReport` computes a letter grade from weighted `mapping_summary` presence. Rules 5–7
move seven columns out of `BASE_METRICS`, so **every account's grade improves with no change in data
quality**. A number that moves for the wrong reason is worse than no number. Delete
`GradeBadge` / `computeGrade` first, or Rules 5–7 ship a silent regression.

### 4.3 Engagement metrics have no path to the client

`seedTypes.ts` contains **zero** engagement or video fields. Rule 8 is not "add two columns" — it
needs a path through the analysis engine, seed assembly, API contract and client types. Scope it
accordingly.

### 4.4 The date window is baked into runs

`ManualAnalysisControls.tsx:960` holds `useState<"7d"|"14d"|"30d"|"all">` and passes it to
`startMutation` as `date_range`. Rule 9's view-state model is a migration, not a UI change: every
existing run carries a stamped window and needs a story.

### 4.5 Unverified claim

The Rule 9 document cites `RunScopePicker` as an existing pattern to reuse. It could not be located
by filename during the audit. `replit.md` references a run-scope picker so something exists — treat
that line as unconfirmed until found.

---

## 5. Verification performed

- **Typecheck:** clean, all 7 workspace projects, after merging `origin/main`.
- **Suite:** 193 passing. Failure profile identical to baseline (17 files / 2 tests, all failing on
  missing `SUPABASE_DB_URL`), diffed rather than assumed.
- **Real-export regression, asserted not eyeballed:**

| Export | Rows | Spend | Impressions | Warnings |
| --- | ---: | ---: | ---: | ---: |
| `king.csv` (Demo+Text) | 17,116 | $17,805.35 | 1,490,366 | 1 |
| `kingDEVi.csv` (Device+Placement) | 11,924 | $22,379.94 | 2,357,851 | 2 |

  Exact match before and after every change in this branch.

- **Derived-column reconciliation:** CPM, both CPCs, both CTRs, Frequency, Cost per purchase, ROAS
  and Cost per add to cart recomputed from primitives and diffed against Meta's own values across
  11,924 rows — 100% within 0.5%, max error 0.00%. Every mismatch is Meta's 2-decimal display
  rounding.

- **Trial merge:** this branch against `claude/open-issues-synthesis-5ludoz` (both edit
  `iapCsvSpec.ts`) — auto-merged clean, typecheck green, 139 tests passing. Trial branch deleted.

---

## 6. Landing sequence

The repository has two disjoint histories. `main` was replaced on 2026-08-08 with a Replit snapshot
rooted at `238c064`; the original lineage roots at `185439b`. **23 of 28 branches have no common
ancestor with `main` and cannot be merged** — forcing one reverts `main` wholesale (545–855 files,
~127k deletions). Four `merge-*-aug8` branches are abandoned attempts at exactly that.

Four branches are mergeable. Land in this order, each as its own PR with CI green between:

1. `claude/open-issues-synthesis-5ludoz` — six re-landed manual-import defects + closeout register
2. **`claude/manual-upload-metrics-vk8mei`** — this branch
3. `claude/new-session-d9skbh` — blended-CPA and creative-assembly resolver fixes
4. `claude/onboarding-analysis-workflow-hkz02o` — guided onboarding tour

> **Conflict warning.** Item 4 already contains a guided onboarding tour. It collides with the tour
> specified in the build spec and must be read and reconciled **before** that work starts.

Then delete the 23 pre-rewrite branches once the closeout register confirms disposition. Deploy from
`main` after all four land — never from a combined merge of everything at once.

---

## 7. Replit sync

Branch is pushed and current with `origin/main`. To bring it into a Replit workspace:

```bash
git fetch origin
git checkout claude/manual-upload-metrics-vk8mei
git pull origin claude/manual-upload-metrics-vk8mei
pnpm install
pnpm run typecheck
pnpm --filter @workspace/api-server run test
```

No environment variable changes are required by this branch. The 17 failing test files need
`SUPABASE_DB_URL`; `deconstructionEngine.test.ts` additionally needs
`AI_INTEGRATIONS_ANTHROPIC_BASE_URL` to collect at all (pre-existing — 25 tests are invisible in CI
until a lazy client init lands).
