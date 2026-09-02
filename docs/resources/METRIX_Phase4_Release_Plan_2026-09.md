# METRIX IAP — Phase 4: Release. Revised plan (v2, 2026-09-02)

**Supersedes v1 of the same day.** v1 was audited line by line against what the
owner actually tasked and what the registers already record, and reassessed from
three disciplines. Everything below is in one of two tiers:

- **Tier 1 — tasked or on record.** In the owner's brief, or already recorded as
  a decision or open item in `CARRY_FORWARD_REGISTER.md`, `README_HANDOFF.md` or the
  reface register. This is the roadmap.
- **Tier 2 — proposed, awaiting approval.** Raised by the assessment, not by the
  brief. Nothing in this tier is built unless the owner says so.

Billing is excluded by instruction.

**Clarification acknowledged.** "Map" in the visualisation suite means non-geographic
relationship structures only: **cross-maps** (concept × avatar, avatar × placement),
**cluster maps** (segments grouped by cost and conversion), and **positioning maps**
(ICP and concept positioning on the IAP's own axes). Never a geographic map. The
app already carries the vocabulary — `HeatMatrix` renders four grids (cross map,
avatar × concept, age × gender, ICP positioning) and `audience-clusters.ts` computes
k-means clusters on CPA × CVR — so the work is completing and unifying it.

---

## 1. Audit of v1 — what was removed, corrected, or reclassified

| v1 item | Verdict | Reason |
|---|---|---|
| Geographic map / choropleth, "geography as an ingestion decision" | **Removed** | Misread the brief. Map = cross / cluster / positioning. |
| "No module offers a chart/table switch" (state §1) | **Corrected — false** | `components/data-module/{DataModule,ViewSwitcher,BreakdownControl}` and `lib/data-module/viewSupport.ts` exist (Phase 3 §02, the Universal Data Module: trend · compare · breakdown · funnel · map · table, each offered only when the data shape can back it). Adopted by **one** page (`BudgetView`). The work is adoption, not invention. |
| Saved views per module | **Tier 2** | Configurable views were tasked; a persisted saved-views list was not. |
| Server-sent "seed changed" events (B5) | **Tier 2** | Not tasked. The 5-minute cache with explicit invalidation is on record as the design. |
| Daily scheduled live pulls (B1) | **Needs confirmation** | The brief says no additional user steps to seed data; `replit.md` says ingestion never triggers a loop run and the loop is execute-on-command. Whether "no steps" includes unattended pulls is the owner's call — question 1. |
| Per-account "run after new data" policy (B2) | **Needs confirmation** | Same conflict, on the loop itself — question 1. |
| Seed re-architecture (A4 / A12) | **Needs confirmation** | Recorded as the target shape, explicitly *not* attempted, "belongs in a scoped session" — question 3. |
| Optimize producer (A1 / F-e) | **Needs confirmation** | Handoff R1 calls it the one true blocker; register §6 says "explicit-request-only, do not build speculatively". The brief's "fully operable, full IAP output surfaced" covers it, but the register asks for the words — question 2. |
| "Under 300 ms p95" seed budget | **Removed** | A number nobody set. Replaced by the recorded `seedBudget` thresholds (5 MB log, 12 MB escalate). |
| Treemap, small multiples | **Tier 2** | "Other visualisations" was tasked open-endedly; these two were my picks, not the owner's. |
| Visual-regression screenshot baseline | **Tier 2** | Supports the recorded browser review, but is a new instrument. |
| Folding the Findings page into a lead block | **Tier 2** | Already listed as open in the navigation audit §3; not decided. |
| Rewriting the blueprint's cohort section (D10) | **Needs confirmation** | Closeout §3.7: the blueprint is canonical, changing it is an owner call — question 4. |
| New gates `run-scope`, `loop-producers`, `tenancy-helpers`; one generated check list for CI and `.replit` | **Kept, Tier 1** | The CI/`.replit` divergence is a recorded trap (closeout §2.3) and the cumulative-table defect is recorded four times; the brief asks for integrity that is measured. These are instruments for recorded problems, not new features. |
| Everything else in v1 (A2, A3, A5, A6 fixtures, C1 catalog, C2 switcher, C3 lead, C4, C5, D) | **Kept, Tier 1** | Each traces to the brief or to a register/handoff line, cited inline below. |

---

## 2. Expert reassessment — three lenses, and what each changed

### 2.1 Product strategy

**What makes this category-defining is the loop closing, not the chart count.** Every
comparable tool stops at analysis. The IAP's defensible claim is Listen → Analysis →
Strategy → Creative → MST → Act, with each output traceable to the rows that produced
it. Today the act stage renders and nothing fills it. Until it does, the interface is a
beautiful report. **Verdict:** the producer stays first in sequence (subject to
question 2), and every visualisation in C1 is chosen for what it lets a reader *decide*,
not for variety.

**The value proposition is a decision, surfaced.** "Highlight the most informative
data throughout" (brief, message 1) is met by leading every command center with the
account's top finding, its terminal metric on the derived objective, the confidence
grade and the single next action — all from rows, never prose. **Verdict:** C3 stays,
and it is the design that lets the strategy weighting engine (R4, awaiting a go) slot
in later without a UI change.

**Cut what does not move a decision.** v1's treemaps and small multiples were
variety. The positioning map is not: the IAP method already classifies every concept
into `scale_now | optimize | validate | explore | avoid` (`lib/data/scalingBuckets.ts`),
and a positioning map is that classification drawn on its two axes. **Verdict:** the
catalog is cross-map, cluster map, positioning map, funnel breakdown, and the existing
trend / compare / breakdown / table — nothing else without approval.

### 2.2 Data engineering

**Automation multiplies runs, and two open items become load-bearing the moment it
does.** `concept_rollup` and `v3_variable_performance` are cumulative per run; an
unattended run per day per account writes a row set per day. (a) **S1 retention**
(staged files were 363 MB of a 437 MB database; the reclaim exists, the sweep is
manual) must run on a schedule *before* pulls do. (b) **Run scoping** must be a
gate, not a convention: the unscoped-sum defect has shipped four times and surfaced
only through a React key warning. **Verdict:** if question 1 is "yes", the retention
sweep and `check:run-scope` are prerequisites in the same sprint, not follow-ups.

**The seed document is the ceiling, and automation lowers it.** A12 is honest that
one document per user holding every account's nested analysis is fine at 11 accounts.
Unattended runs invalidate that document more often, and `coalescedCache` (A5) only
prevents the stampede, not the rebuild. **Verdict:** the seed split is the right
architecture and the wrong time to do it *speculatively*; it is a scoped session
(question 3), and if deferred, `seedBudget`'s thresholds are the tripwire.

**Honesty invariants must survive automation.** A user-triggered run that fails is
seen; an unattended one is not. The three failure states already separated in
`MetrixDataContext` (stale / failed / dead session) and the `[Re-run] Replaced N…`
warnings are the right primitives; the requirement is that an unattended failure
lands in the task tray and on the account overview as a *state*, never as an
unchanged dashboard. **Verdict:** added as an exit criterion under D1.

**Security work is a policy migration, not a patch.** The four SECURITY DEFINER
helpers are referenced inside six run-scoped RLS policies; revoking EXECUTE breaks
tenant reads outright (closeout §3.4). **Verdict:** A5 is sequenced last, behind the
test pass, with `check:tenancy-helpers` written *first* so the change is proven
rather than believed.

### 2.3 UI / UX

**One module, not one chart per page.** The Universal Data Module already exists and
is used once. Every bespoke chart wrapper on the other analysis and strategy pages is
a second implementation of a question `viewSupport.ts` already answers. **Verdict:**
C2 is adoption of `DataModule` on every AnalysisData / StrategyData / MST surface,
view state in the URL by the `?tab=` convention that already exists, and the table
view as the floor under every chart (every chart has a table twin with the same
rows — this is also the accessibility floor).

**Maps need stable axes or they lie.** A cluster map re-laid-out on each run reads as
movement that never happened. **Verdict:** cluster and positioning maps pin their
axes to the IAP's own definitions (cost per result × result volume; the scaling
bucket boundaries), encode spend as size and confidence as fill, and never animate
position between runs.

**Density is the product; disclosure is the craft.** The rulebook atop `shared.tsx`
holds: first layer labels and marks, prose behind `DetailReveal`, no half-pixel
sizes, and every dash explained (C6). **Verdict:** every new visualisation ships with
its `DetailReveal` evidence and passes the existing gates before it is called done.

**Look at it.** The register records that the lifted type ramp and the light/dark
palettes have never been reviewed in a browser at the type level, and calls that the
highest-value human action outstanding. **Verdict:** C4 is that review, done once on
the finished surfaces, and the four module states (empty · loading · error · stale)
designed as one family so a reader learns them once.

---

## 3. Exit criteria (Tier 1)

| # | Done means | Proven by | Source |
|---|---|---|---|
| D1 | After the ingestion event the owner chooses (question 1), data and the IAP outputs it enables appear with **no further user step**, and an unattended failure is visible as a state, never as a stale dashboard. | e2e `zero-touch` spec on both paths; failure-injection spec extended | brief §2 |
| D2 | Every loop stage has a producer, optimize included; no real account shows "No actions yet" after a run. | `check:loop-producers`; integration test on AAFE | handoff R1 (question 2) |
| D3 | Every declared seed field is read on a screen or removed from the contract (billing excluded). | `check:field-coverage` at 0 unread outside an allowlist, in CI | reface §7.3 |
| D4 | No persisted zero stands in for unknown; every dash has a reason; a measured zero is 0. | S5 closed; `check:unexplained-dashes` in CI; C6 at 0 | register S5, C6, C7 |
| D5 | Every analysis, strategy and MST module renders through the Universal Data Module; each offers every view its data shape can back and no view it cannot; the chosen view survives reload and a copied link. | per-module contract test; e2e URL round-trip | brief §1; Phase 3 §02 |
| D6 | Every command center opens on the account's top finding, terminal metric on the derived objective, confidence and next action, from its own run-scoped rows. | snapshot per command center on the AAFE fixture; `check:cohort-reach` unchanged | brief §1 (UVP) |
| D7 | Cross-map, cluster map, positioning map and funnel breakdown exist as views in the catalog, each with a table twin, each passing `chart-palette` and `chart-geometry`. | `chart-geometry` promoted to CI at 0 | brief §1 (clarified) |
| D8 | Tenancy helpers unreachable over PostgREST; all aggregate views `security_invoker`; RLS enforcement array generated from the schema; leaked-password protection on. | `check:tenancy-helpers`, `check:ad-performance-views` in CI with a read-only credential | brief §3; closeout §3.4 |
| D9 | CI and `.replit` run one generated check list; the e2e suite runs on the merge path. | `ci.yml` and `.replit` both consume `scripts/src/validation-list.ts` | closeout §2.3 |
| D10 | The type ramp and both palettes reviewed once in a browser on every route; findings fixed. | review record in the reface register with screenshots | reface §7.2 |

---

## 4. Roadmap (Tier 1)

### Sprint 1 — Producer and truth
- **A1 · Optimize producer** (F-e, handoff R1; *subject to question 2*). Fourth
  `GenerationKind`; evidence pack from run-scoped rows; output in the official schema's
  shape (confidence grades, severity, campaign/ad-set-only budget scope) written to the
  importer schema (F-f recommendation on record). Exit: D2.
- **A2 · Creative intelligence surfaced** (F-a, F-b; handoff R2). Body, headline, CTA,
  destination, caption; reach and all-clicks into per-ad stats and the Creative
  dialog. Exit: `check:field-coverage` shows them read.
- **A3 · Honesty debt** (S5, S3/S4, C9, C6). Exit: D4. Owner decisions on S5 backfill
  and S4 canonical-or-dropped are already flagged in register §6; recommendations:
  normalise once, logged; drop.
- **D · Gates onto the merge path.** `chart-geometry`, `unexplained-dashes`,
  `field-coverage`, `run-scope` (new), `loop-producers` (new) into one generated list
  for CI and `.replit`. Exit: D9.

### Sprint 2 — Views and value
- **C1 · The map catalog, completed.** Cross-map (concept × avatar, avatar ×
  placement) on `HeatMatrix`; cluster map over `audience-clusters.ts` output with
  pinned axes; positioning map drawing `scalingBuckets` on its two axes; funnel
  breakdown per segment on the derived terminal metric. Each with a table twin and
  `DetailReveal` evidence. Exit: D7.
- **C2 · Universal Data Module everywhere.** Adopt `DataModule` on every
  AnalysisData / StrategyData / MST surface; view state in the URL. Exit: D5.
- **C3 · Intelligence lead** on every command center and analysis view, from
  run-scoped adapters. Exit: D6.
- **A6 · Fixtures.** A lead-gen and a service account in the seed fixture (closeout
  §3.7 blind spot). Exit: fixture-backed suites exercise all three cohorts.

### Sprint 3 — Zero-step seeding (shape set by question 1)
- **B3 · One-command loop** on the Analysis command center: analysis → strategy →
  briefs → optimize in sequence, one chain in the tray, each stage keeping its own
  status row and gate (`buildLoopStages`). Exit: D1 on the manual path.
- **B4 · Staging without a review gate.** Both exports and creatives in one gesture;
  validation on arrival with persisted warnings; the confirmation becomes a
  correctable summary. Creative-name mapping under 0.74 stays explicit. Exit: two
  files in, staged and validated, zero further clicks.
- **B1 · Scheduled live pulls** and **B2 · run-after-new-data policy** — *only if
  question 1 is yes*, and then with the **S1 retention sweep scheduled** and
  `check:run-scope` live as prerequisites in the same sprint.

### Sprint 4 — Security, review, close
- **A5 · Security migration** (closeout §3.4). `check:tenancy-helpers` written first;
  helpers relocated to an unexposed schema; six policies repointed; RLS array
  generated; leaked-password protection on; both checks in CI with a read-only
  credential the owner provides. Exit: D8.
- **C4 · Browser review and states** (reface §7.2). The one type-level review; the
  four module states as a family; `ConnectAccountDialogs` split into the stack it is
  (handoff R5). Exit: D10.
- **C5 · Accessibility and responsive floor.** 24–40 px control tier reviewed by
  surface; compact shell walked on a phone per module. Exit: zero AA failures.
- **A4 · Seed split** — *only if question 3 is yes*; otherwise `seedBudget` remains the
  tripwire.
- **Docs close.** Register items closed or carried with reasons; handoff regenerated;
  blueprint cohort section rewritten *only if question 4 is yes*.

---

## 5. Tier 2 — proposed, awaiting approval

Each of these came from the assessment, not the brief. None is built without a yes.

1. **Saved views per module** (name + URL state), for the agency's recurring reads.
2. **Live freshness without reload** — a server-sent "seed changed" event from the
   existing invalidation sites.
3. **Visual-regression baseline** — 70 routes × 3 shapes × 2 themes, pinned after C4.
4. **Fold the Findings page** into the C3 lead block and retire its hidden route.
5. **Treemap for spend share past five slices; small multiples for trend by segment.**
6. **Collapsed-rail icon navigates** to the command center instead of reopening the
   rail (navigation audit §3).

---

## 6. Questions for the owner

1. **Zero-step seeding vs execute-on-command.** Does "no additional user steps" mean
   (a) unattended daily Meta pulls, and (b) the loop running automatically after new
   data lands (overriding the recorded rule that ingestion never triggers a run)?
   Options: both; pulls only; neither (one-command chain after a user-chosen event).
2. **Optimize producer.** Explicit go to build it, in the importer schema with the
   official schema's shape?
3. **Seed split (A12).** In this phase as sprint 4's scoped session, or deferred?
4. **Blueprint.** May the canonical blueprint's cohort section be rewritten to the
   2026-09-01 derived-objective decision?
5. **Tier 2.** Which of the six proposals, if any, are approved?
