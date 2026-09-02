# METRIX IAP — Phase 4: Release. Plan v3 (2026-09-02, owner-answered)

**Supersedes v1 and v2 of the same day.** v2 audited v1 against the brief and put
four conflicts to the owner as questions. This version records the answers and the
plan they produce. Billing is excluded by instruction.

## 0. Owner answers, recorded verbatim in effect

1. **Zero-step seeding means source fallback, not automation.** "No additional
   steps" pertains to a user having to upload creatives for deconstruction before
   modules that depend on them show anything. Where an input is not provided, the
   most applicable *other* schema already in the system stands in for it, so no
   module is blank pending an extra step. Existing schema need not change; a
   fallback may override the primary when the primary is absent. **Executable runs
   (analysis, generation) remain manual.** → Scheduled pulls and run-after-new-data
   are **out**. Sprint 3 is rebuilt around source precedence (§4).
2. **Optimize producer: explicit go**, on the recommended route (importer schema,
   official schema's shape), engineered to current Meta documentation and the
   practitioner narrative rather than a frozen rule set. → A1 in Tier 1, with a
   versioned Meta-practice reference it must cite (§4, sprint 1).
3. **Seed split and blueprint rewrite:** decide by a deliberate, validated process
   grounded in scope. → Decisions recorded in §2: **blueprint rewrite proceeds;
   seed split is deferred with named triggers.**
4. **Tier 2 approved:** saved views per module; visual-regression baseline; fold
   Findings into the lead block. **Not approved:** live freshness without reload;
   treemap and small multiples; collapsed-rail icon navigation.

**Clarification standing from v2.** "Map" means cross-map, cluster map and
positioning map over the IAP's own relationships. Never geography.

---

## 1. Audit trail (v1 → v3)

| Item | v1 | v3 |
|---|---|---|
| Geographic map | proposed | removed (misread) |
| "No module offers a chart/table switch" | claimed | **false**; the Universal Data Module exists (`DataModule`, `ViewSwitcher`, `viewSupport.ts`), used by one page. Work is adoption. |
| Scheduled Meta pulls, run-after-new-data policy | proposed | **removed** (answer 1: runs stay manual) |
| One-command loop chain, drop-both-files staging | proposed | **Tier 2, unapproved** — still user steps around a run; not what "no steps" meant |
| Source precedence so no module is blank | absent | **Tier 1, sprint 3** (answer 1) |
| Optimize producer | needs go | **Tier 1, sprint 1** (answer 2) |
| Seed split (A12) | proposed | **deferred, triggers recorded** (§2) |
| Blueprint cohort rewrite | needs go | **Tier 1, sprint 4** (§2) |
| Saved views, visual baseline, fold Findings | Tier 2 | **Tier 1** (answer 4) |
| Live freshness, treemap/small multiples, rail icon | Tier 2 | **not approved; dropped** |
| "300 ms p95" | invented | removed |

---

## 2. Decisions taken under the owner's delegation (question 3)

**Blueprint cohort section: rewrite.** The blueprint is canonical by `CLAUDE.md`, and
canonical documents that contradict the code are an integrity defect, not a
preference. The 2026-09-01 derived-objective decision is recorded with its reasoning
and verified against real accounts; the rewrite carries that record into the
document readers are told wins. Scope: §3.7-flagged sections only, with the decision
date and the verifying commands cited. No other blueprint section moves.

**Seed split (A12): deferred, with triggers.** The case for splitting was load under
automation. Answer 1 removes automation: cache invalidations stay bounded by user
actions, and the coalesced cache already absorbs the concurrent-miss case. Against
that, the migration touches 61 components on a UI that sprints 2 and 3 are still
changing. Validated decision: **do not split in this phase.** Revisit when any one of
these fires, each already observable: `seedBudget` logs the 5 MB threshold; account
count exceeds 30; any per-account nested blob exceeds 500 KB. The two largest today
(`conversion_tracking_signal` 172 KB, `device_delivery_signal` 106 KB) are the
ones to watch. Recorded in `CARRY_FORWARD_REGISTER.md` §9.

---

## 3. Exit criteria (Tier 1)

| # | Done means | Proven by | Source |
|---|---|---|---|
| D1 | **No module is blank because an optional input was not provided.** Each module resolves its data from a declared precedence of sources; the source in use is named on the module; runs remain manual. | `check:source-precedence` (new): every module's required data has a declared chain; contract test per module with the primary source absent | answer 1 |
| D2 | Every loop stage has a producer, optimize included; no real account shows "No actions yet" after a run. | `check:loop-producers`; AAFE integration test | answer 2; handoff R1 |
| D3 | Every declared seed field is read on a screen or removed from the contract. | `check:field-coverage` at 0 unread outside an allowlist, in CI | reface §7.3 |
| D4 | No persisted zero stands in for unknown; every dash has a reason; a measured zero is 0. | S5 closed; `check:unexplained-dashes` in CI; C6 at 0 | register S5, C6, C7 |
| D5 | Every analysis, strategy and MST module renders through the Universal Data Module; each offers every view its data shape can back and none it cannot; the view survives reload and a copied link; saved views per module. | per-module contract test; e2e URL round-trip | brief §1; Phase 3 §02; answer 4 |
| D6 | Every command center opens on the account's top finding, terminal metric on the derived objective, confidence and next action, from run-scoped rows; the Findings page is folded into this lead and its hidden route retired. | snapshot per command center on AAFE; `check:cohort-reach` | brief §1; answer 4 |
| D7 | Cross-map, cluster map, positioning map and funnel breakdown exist as views, each with a table twin, on pinned axes. | `chart-geometry` in CI at 0 | brief §1, clarified |
| D8 | Tenancy helpers unreachable over PostgREST; aggregate views `security_invoker`; RLS array generated from the schema; leaked-password protection on. | `check:tenancy-helpers`, `check:ad-performance-views` in CI with a read-only credential | brief §3; closeout §3.4 |
| D9 | CI and `.replit` run one generated check list; e2e on the merge path; visual-regression baseline pinned. | both consume `validation-list.ts`; Playwright baseline | closeout §2.3; answer 4 |
| D10 | Type ramp and both palettes reviewed once in a browser on every route; findings fixed; blueprint cohort section rewritten; register closed or carried. | review record; blueprint diff cites the decision | reface §7.2; §2 |

---

## 4. Roadmap

### Sprint 1 — Producer and truth
- **A1 · Optimize producer.** Fourth `GenerationKind`; evidence pack from run-scoped
  `ad_performance`, `concept_rollup`, `v3_variable_performance`, `placement_signal`
  and the scaling-bucket classification (`scale_now | optimize | validate | explore
  | avoid`) the method already defines; output in the official schema's shape
  (confidence `HIGH|MODERATE|LOW|INSUFFICIENT`, severity, campaign/ad-set-only budget
  scope) written to the importer schema. **Grounding requirement from answer 2:**
  the producer's rules and prompt cite `docs/iap/META_PRACTICE_REFERENCE.md`, a
  dated, versioned digest of current Meta Ads documentation and practitioner
  consensus, reviewed each release; a recommendation that depends on a Meta
  behaviour names the reference line it rests on. Same running/success/error
  pattern; one running run per account+kind. Exit: D2.
- **A2 · Creative intelligence surfaced** (F-a, F-b). Exit: fields read.
- **A3 · Honesty debt** (S5 with backfill, S3/S4 dropped, C9 written, C6 to 0). Exit: D4.
- **D · Gates onto the merge path.** One generated list for CI and `.replit`;
  `chart-geometry`, `unexplained-dashes`, `field-coverage`, `run-scope`,
  `loop-producers` join it. Exit: D9 (list half).

### Sprint 2 — Views and value
- **C1 · Map catalog** on `HeatMatrix` and `audience-clusters.ts`: cross-map,
  cluster map, positioning map (scaling buckets on their two axes), funnel breakdown
  per segment on the derived terminal metric. Pinned axes; spend as size; confidence
  as fill; no positional animation between runs; table twin and `DetailReveal`
  evidence for each. Exit: D7.
- **C2 · Universal Data Module everywhere**, view state in the URL, **saved views
  per module** (name + URL state, per browser like the metric tiles). Exit: D5.
- **C3 · Intelligence lead** on every command center and analysis view; **Findings
  folded in**, hidden route retired. Exit: D6.
- **A6 · Fixtures**: lead-gen and service accounts in the seed fixture.

### Sprint 3 — No blank modules (source precedence)
- **B1 · Declare the chain.** A table in `api-server`, the shape `viewSupport.ts`
  already uses for views: for each module's data need, the sources that can satisfy
  it, in order. First cut, from what the system already stores:
  - *Creative intelligence* (Creative Library, Creative Scan, Deconstruction):
    uploaded creative assets (`manual_imports.creative_asset`, deconstruction runs) →
    `ad_creative_metadata` (body, headline, CTA, destination, caption, image/video
    name — captured on every run, read by nothing today) → `meta_ads_export`
    (`creative_asset_url`, `meta_ad_id`) → the Ads Manager link.
  - *MST cross-map*: MST matrix positions → `performance_by_cell` concept × avatar
    (the cross-map already partly does this).
  - *Audience clusters*: CPA × CVR clusters → Age view (A9 already did this once).
  - *Placements / devices*: placement report → platform-level signal.
- **B2 · Resolve at assembly.** `metrixSeedAssembly` resolves each need down the
  chain and stamps the chosen source into the provenance layer that already exists
  (`lib/data/provenance.ts`, the Data Provenance settings page). The module names its
  source on the face ("From ad copy in the performance export") and, where the
  primary would add more, says what it would add and how to provide it — a
  disclosure, not a gate.
- **B3 · Honesty preserved.** A fallback never *claims* the primary: a
  copy-derived creative card is labelled as copy-derived; a platform-level placement
  signal never renders as placement rows. `check:source-precedence` fails a module
  with an undeclared need or a fallback without a provenance stamp. Exit: D1.
- **Not in this sprint (Tier 2, unapproved):** reading creatives from the Meta Graph
  for live accounts. It is the natural third source but widens the API footprint
  (`adcreatives` fields under `ads_read`); listed in §5 for a yes.

### Sprint 4 — Security, review, close
- **A5 · Security migration**, check written first. Exit: D8.
- **C4 · Browser review**; the four module states as a family; `ConnectAccountDialogs`
  split. **Visual-regression baseline** pinned after the review. Exit: D10, D9.
- **C5 · Accessibility and phone walk.**
- **Docs close.** Blueprint cohort section rewritten (§2); register items closed or
  carried; handoff regenerated.

---

## 5. Tier 2 — unapproved, not built

1. One-command loop chain (analysis → strategy → briefs → optimize from one click).
2. Drop-both-files staging without a review gate.
3. Live Meta creative read (`adcreatives`) as a third creative source.
4. Live freshness without reload (declined).
5. Treemap, small multiples (declined).
6. Collapsed-rail icon navigates (declined).

Items 1–3 were not asked; 4–6 were declined. Any of 1–3 joins Tier 1 on a yes.
