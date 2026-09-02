# METRIX IAP — Phase 4: Release. What done looks like, and the plan to get there

**Cut 2026-09-02** on `claude/pre-release-reconciliation-ux-cznjbz`, after the
navigation audit. Billing is out of scope by the owner's instruction and is not
mentioned again. Every claim about the current state below was checked against
the tree at this commit; where a figure is an estimate it says so.

Read `README_HANDOFF.md` (R1–R5), `CARRY_FORWARD_REGISTER.md` §8 and
`METRIX_Navigation_Audit_2026-09.md` first. This document does not restate them;
it turns them into a release plan.

---

## 0. What "done" looks like — the exit criteria

A release is done when every line below is true and each is proven by the
command or test named beside it. Nothing here is a feeling.

| # | Done means | Proven by |
|---|---|---|
| D1 | A new account goes from **connect** to **first populated dashboard** with no step after "Connect" (live) or after dropping the two exports (manual). | e2e `onboarding-zero-touch` spec: connect → pull → analysis → outputs, asserting no additional click |
| D2 | Every IAP stage has a **producer**: analysis, strategy, briefs, deconstruct **and optimize**. No real account shows "No actions yet" after a run. | `check:loop-producers` (new): every `optimization_loop` / `recommendation_cards` reader has a writer; integration test on AAFE |
| D3 | Every field the seed carries is **read on a screen or removed from the contract**. | `check:field-coverage` = 0 unread outside a reasoned allowlist, in CI |
| D4 | **Nothing fabricated, nothing hidden.** No persisted zero stands in for unknown; every dash has a reason; a measured zero is 0. | S5 closed with backfill; `check:unexplained-dashes` in CI; C6 count 0 |
| D5 | Every module has a **view switcher** (at least two of chart / table / matrix / funnel) whose state survives reload and a copied link. | `view-switcher` contract test per module; e2e URL round-trip |
| D6 | Every command center opens on an **intelligence lead**: top finding, terminal metric, confidence, next action — sourced from that account's own rows. | `check:cohort-reach` unchanged; snapshot test per command center against the AAFE fixture |
| D7 | The seed loads in **under 300 ms p95 for the index** and each account's detail on demand; no page waits on another account's data. | `lib/seedBudget` p95 in CI perf step; A12 closed |
| D8 | **Security posture measured, not asserted.** Tenancy helpers not callable over PostgREST; all views `security_invoker`; RLS array generated from the schema. | `check:ad-performance-views` and a new `check:tenancy-helpers` run in CI with a read-only credential |
| D9 | **Both themes, every route, no regressions.** Light and dark screenshots of all 70 routes × 3 account shapes reviewed once by a human and pinned. | Playwright visual baseline; `smoke:metrix-iap-route-crawl` 210/210 |
| D10 | The **docs agree with the code**: the blueprint's cohort section rewritten to the 2026-09-01 decision; every register item closed or carried with a reason. | `README_HANDOFF.md` "where things stand" regenerated at cut |

---

## 1. Where the tree actually is (the facts the plan stands on)

- **Ingestion.** Two paths. Manual: two exact Meta pivot CSVs plus creatives, staged
  then run by hand (`ManualAnalysisControls`). Live: Meta OAuth (`ads_read`), report
  pulls for two report classes (`metaGraph.ts:REPORT_CLASSES`), started by the user.
  **There is no scheduler anywhere in `api-server`** — no cron, no interval — so
  nothing arrives without a click.
- **The loop.** `generationEngine.ts:34` exposes `strategy | briefs | deconstruct`.
  The optimize / act stage is read by six surfaces and written by nothing (**F-e**).
  Analysis is execute-on-command by rule (`replit.md`).
- **The seed.** One document, every account the user may see, 5-minute cache,
  61 components read it (**A12**). Fine at 11 accounts; the ceiling is logged, not
  removed.
- **Visualisation.** Nine chart components (`components/charts`: trend, ranked bars,
  metric bars, share pie, funnel, heat matrix, dumbbell rows, variable stack,
  metric table) on one token file, guarded by `chart-palette` in CI and
  `chart-geometry` **not** in CI. Configurability today is the overview metric-tile
  picker and the segment drill-downs; no module offers a chart/table switch.
- **Honesty debt.** S5 persists zeros for unknown Reach/Impressions/Clicks; S3/S4
  columns nobody trusts; C6 at 171 / 28; `reconciliation` declared and never written
  (C9). 450 declared fields, 22 unread outside billing.
- **Security.** RLS enforced and tested. Deferred by decision: four SECURITY DEFINER
  tenancy helpers callable over PostgREST (one resolves any run id); leaked-password
  protection off; the RLS enforcement array is maintained by hand (R4).
- **Verification.** 13 design gates + drift check in CI; 182 vitest files; 18 e2e
  specs runnable locally, **not** in CI; four gates (`chart-geometry`,
  `unexplained-dashes`, `field-coverage`, `ui-inventory`) run nowhere automatically.
- **Navigation.** Closed 2026-09-02 (audit). One tree, Back, palette, no legacy links.

---

## 2. The plan — four workstreams, one sequence

Each item names its exit. Items marked **[owner]** need a decision before build;
they are listed again in §4 so nothing is silently picked.

### Workstream A — Pipeline integrity (backend → frontend)

**A1 · The optimize producer (F-e).** The one true blocker. Add `optimize` as the
fourth `GenerationKind`; evidence pack from real `ad_performance`,
`concept_rollup` (run-scoped), `v3_variable_performance` (run-scoped),
`placement_signal`; output rows in the official schema's *shape* — confidence
`HIGH|MODERATE|LOW|INSUFFICIENT`, severity, campaign/ad_set-only budget scope —
written to the importer schema so it ships (F-f recommendation on record). Same
running/success/error pattern, one running run per account+kind.
*Exit:* AAFE shows populated Action Queue cards from its own rows; the six readers
render real data; D2 passes.

**A2 · Surface the creative intelligence already written (F-a, F-b).**
`ad_creative_metadata` (body, headline, CTA, destination, caption) and
`extra_metrics`, `reach`, `clicks_all` into the seed's per-ad stats and the
Creative dialog's Overview tab. Cheapest value on the register.
*Exit:* `check:field-coverage` shows the fields read; the dialog shows copy beside
performance.

**A3 · Honesty debt, closed for good.** S5: three fields nullable end to end
(`variable-drilldown`, `reportExport`, `dataExport`, `kpiBreakdown`,
`VariableDrilldownModal`) **and** a one-shot backfill that nulls the stored zeros
**[owner: normalise vs caveat]**. S3/S4: persisted rates either canonical or dropped
**[owner]**. C9: write `reconciliation` from `computeDataCoverage` so the block
`AnalysisHistoryView` already renders lights up. C6: finish the 171 / 28 sweep
with `check:unexplained-dashes` promoted to CI at 0.
*Exit:* D4.

**A4 · Seed re-architecture (A12).** Thin index at boot (ids, names, status,
`campaign_summary` totals — what the switcher and rollups need); per-account
detail on demand through the endpoints that already exist
(`analysis-summary/:preset`, `analysis-data-windows`, `analysis-runs`). Migrate
the 61 readers behind one `useAccountDetail(id)` hook so the shape change lands
once. Keep the "one snapshot makes never-fabricate enforceable" property by
versioning the detail with the run id it came from.
*Exit:* D7; `seedBudget` p95 in CI.

**A5 · Security, measured.** Relocate the four tenancy helpers to a schema PostgREST
does not expose and repoint the six run-scoped policies (a test pass, never a
pre-deploy patch — the closeout's warning). Turn on leaked-password protection.
Generate the RLS enforcement array from `schema.sql` so a new table cannot be
forgotten (R4 retired). Run `check:ad-performance-views` and a new
`check:tenancy-helpers` in CI against a read-only credential stored as a CI
secret **[owner: provide the credential]**.
*Exit:* D8.

**A6 · Run-scoping made structural.** The cumulative-table defect surfaced four
times and only because React warned about keys. Add `check:run-scope`: any read
of `concept_rollup` / `v3_variable_performance` not passing through
`scopeToRun` or a `runSelection` fails. Add a **lead_gen** and a **service** account
to the seed fixture so the non-ecommerce paths are exercised by fixture-backed
suites, not only unit tests.
*Exit:* the gate fires on a reintroduced unscoped read; the fixture carries three
cohorts.

### Workstream B — Data flow automation (zero user steps to a seeded interface)

**B1 · Scheduled live pulls.** A daily pull per connected account
(`runHeartbeat` pattern, one running pull per account, partial rows deleted on
failure as today), with a visible "last pulled · next pull" on the account
overview. Manual "Pull now" stays.
*Exit:* an account connected on day 0 has day-1 data without a visit.

**B2 · Arrival triggers the loop — by policy, not by accident.** The rule that the
loop is execute-on-command stands as the *default*. Add a per-account run policy
**[owner: default on or off]**: `manual` (today) or `after new data`, under which a
completed pull or a completed manual staging queues an analysis run, then — if
analysis validates — strategy, briefs and optimize in sequence, each keeping its
own running/success/error row and its own gate (`buildLoopStages`). The user sees
one chain in the task tray, never five buttons.
*Exit:* D1 for the live path; a stale stage never silently re-runs.

**B3 · One-command loop for the manual path.** "Run the loop" on the Analysis
command center runs the same chain from a chosen window. The window defaults to
the latest data (already the rule) and the dialog no longer asks anything the
data already answers.
*Exit:* D1 for the manual path; the onboarding checklist checks itself off.

**B4 · Manual staging that needs no review step.** Drop both exports (and
creatives) in one gesture; class detection by header (already
`iapCsvSpec`-driven); duplicate and window checks run on arrival with the
`upload_warnings` already persisted (C11); the explicit "Review" confirmation
becomes a summary the user can *correct* rather than a gate they must *pass*.
The corrections that matter (creative name mapping below 0.74 confidence) stay
explicit — that is a judgement, not a step.
*Exit:* two files in, staged and validated, zero further clicks to a run.

**B5 · Live freshness without reload.** Replace the 5-minute TTL as the *only*
bound on out-of-band writes with a server-sent "seed changed" event (the
`invalidateMetrixSeedCache()` call sites already know when). The client refetches
the thin index and the affected account's detail (A4).
*Exit:* a run finishing in one tab appears in another within a second.

### Workstream C — Visual and UI excellence

**C1 · The visualisation system, completed.** Extend `components/charts` on the
same token file, each mark with a stated question it answers, each gated by
`chart-palette` and `chart-geometry` (promoted to CI):

- **Funnel breakdowns** per stage with the objective-derived terminal metric
  (never a purchase default), side-by-side across avatars and placements.
- **Cluster / scatter** for avatar × concept × spend (CPA vs volume, size = spend,
  colour = confidence) — the "clusters" the brief asks for, over the rows Audience
  already computes.
- **Treemap** for spend share by concept / placement / platform, replacing pie
  where there are more than five slices (pie stays for two-to-five).
- **Small multiples** for trend by segment; **dumbbell** for period comparison
  (`compareRange` already exists in `DateRangeContext`).
- **Maps:** the exports carry **no geography** (Meta pivot classes here are
  demographic and device/placement). "Map" in this product means the Strategy
  Map and the MST cross-map heat matrix; a geographic map would be fabricated. If
  a country/region breakdown is added to the ingestion contract later
  **[owner]**, a choropleth joins the catalog; not before.

*Exit:* every module has at least one chart from the catalog answering its lead
question; `chart-geometry` in CI at 0 defects.

**C2 · Configurable views.** A `ViewSwitcher` primitive (chart / table / matrix /
funnel where each applies) on every data module; state in the URL by the existing
`?tab=` convention so a copied link reproduces the view; persisted per browser
like the metric tiles; a "saved views" list per module (name + URL state) for the
agency's recurring reads. Table view everywhere is the accessibility floor: every
chart has a table twin with the same rows.
*Exit:* D5.

**C3 · The value proposition, first on every screen.** An **Intelligence lead**
block at the top of each command center and each analysis view: the top finding
(from `intelligence` / signal cards), the terminal metric and its period delta
(`campaign_summary`), the confidence grade, and the single next action (from A1's
cards). All from that account's rows, all through the run-scoped adapters, none
of it prose that could be stale. The Findings page folds into this block and
leaves the hidden route.
*Exit:* D6; "Cost per result" language everywhere the objective is undetermined.

**C4 · Brand, aesthetic, motion — finished, then looked at.** The register records
that the lifted type ramp and the light/dark palettes have **never been reviewed in
a browser at the type level**. Do that review once, on the visual baseline from
D9, and fix what it shows. Close the Panel MOTION revision either way
**[owner: agree the 31% is a revision, or fund the remainder]**. Design the four
states every module can be in (empty, loading, error, stale) as one family, not per
page. Split `ConnectAccountDialogs` (2,383 lines) into the stack it already is so
the first screen a customer touches can be reasoned about.
*Exit:* D9 baseline accepted; no raw pixel sizes; every state rendered from the
shared family.

**C5 · Accessibility and responsive floor.** `check:interaction` NOTE tier (24–40px
controls) reviewed by surface; the compact shell (drawer below 1024px) walked on
a phone for every module's lead task; reduced-motion honoured by every new
chart. *Exit:* zero AA failures; the phone walk documented with screenshots.

### Workstream D — Verification and release engineering

- Promote `chart-geometry`, `unexplained-dashes`, `field-coverage` (at an
  allowlisted 0) and the new `run-scope`, `loop-producers`, `tenancy-helpers`
  gates into `ci.yml`. **`.replit` and CI run one list**, generated from one file,
  so the "passes locally, fails on merge" trap closes for good.
- e2e in CI: the 18 specs nightly, the route crawl on every PR, the browser
  installed as its own step (the version mismatch is documented; CI already
  handles it).
- Visual regression: Playwright screenshots, 70 routes × 3 shapes × 2 themes,
  baseline reviewed once (C4), then pinned.
- `check:seed-fixture-drift` in CI with `DEMO_ACCOUNT_PASSWORD` as a secret
  **[owner]** — the silent-stale-fixture failure mode is the one nothing catches
  today.
- Release routine: merge → CI green → workspace **merges** `origin/main` →
  publish → `verify-deployed-build.sh` **plus** a content marker, scripted as one
  command so it cannot be half-done.

---

## 3. Sequence — four sprints, each with a demonstrable exit

| Sprint | Ships | Exit demonstrated on AAFE |
|---|---|---|
| **1 · Producer and truth** | A1 optimize producer · A2 creative intelligence · A3 S5/C9 · D gates into CI | Action Queue populated from real rows; Creative dialog shows copy; no persisted zeros; CI runs the full gate list |
| **2 · Automation** | B1 scheduled pulls · B2 run policy · B3 one-command loop · B4 arrival staging | Connect on day 0, populated on day 1 with no visit; two files in, loop out |
| **3 · Views and value** | C1 catalog · C2 view switcher · C3 intelligence lead · A6 fixtures and run-scope gate | Every module: lead block + switchable view + URL round-trip; lead_gen fixture green |
| **4 · Architecture, security, polish** | A4 seed index/detail · B5 live freshness · A5 security · C4 browser review + states · C5 floor · D9 visual baseline · D10 docs | p95 index < 300 ms; helpers unreachable over PostgREST; baseline accepted; blueprint rewritten |

Sprint 1 is first because nothing in sprints 2–4 has value on an account whose
act stage is empty. Sprint 4 is last because the seed re-architecture touches 61
components and should land on a UI that has stopped moving.

---

## 4. Owner decisions — flag, don't silently pick

1. **Run policy default** (B2): is "after new data" the default for connected
   accounts, or opt-in per account? The loop rule says execute-on-command; the
   brief says zero steps. Recommendation: **opt-in per account, on by default for
   live connections, off for manual** — a manual upload is already a command.
2. **S5 stored zeros** (A3): normalise existing `variable_performance` payloads to
   null, or leave with a documented caveat. Recommendation: normalise, once,
   logged.
3. **S4 persisted rates** (A3): canonical or dropped. Recommendation: dropped;
   readers already derive.
4. **Panel MOTION 31%** (C4): agree it is a revision. Recommendation: agree.
5. **Geography** (C1): add a region breakdown to the ingestion contract, or keep
   "map" meaning strategy/cross-map. Recommendation: keep, until a client asks.
6. **Credentials for CI** (A5, D): a read-only DB credential and the demo password
   as CI secrets. Without them two of the ten exits stay owner-run.
7. **F-f identity bridge**: build the optimize producer in the importer schema now
   (recommended), migrate to the official 22-table schema when a `clients` ↔
   `ad_accounts` bridge exists.
8. **Findings' home** (C3): fold into the intelligence lead (recommended) or keep
   as a page.

---

## 5. What this plan deliberately does not do

- It does not add a "Metrix Agent" surface or the `contextual-ai-bar`; the
  register's reason stands (a control for a feature that does not exist).
- It does not build the strategy weighting engine (R4 in the handoff). Its spec is
  `CARRY_FORWARD_REGISTER.md` §6a and it still awaits an explicit go; sprint 3's
  intelligence lead is designed so the engine's output slots in without a UI change.
- It does not touch billing.
- It does not rewrite `analysisEngine.ts` (3,544 lines). Every change there is
  additive and behind a test that fails against the original.
