# METRIX — Carry-Forward Register (E6)

**Status: reconciled against live code on 2026-08-26; re-reconciled 2026-08-31 at the UI-reface phase close (added F-e); re-verified 2026-09-02 at the release-readiness pass (§8).** The original register was written
on 2026-08-25 from `BUG_TRACKER.md` and `METRIX_Data_Consistency_Audit_Phase1.md`, and
travelled to this repo in the Phase 2/3 handoff zip. Between those two dates BUG-28 → BUG-46
landed, which closed several register items outright. Every line below carries a verdict from
reading the code as it stands today, not from re-reading the audit:

- **`[shipped]`** — fixed, with the commit or bug entry that did it.
- **`[open]`** — verified still present, with the file and line.
- **`[open — upgraded]`** — still present AND worse than the audit recorded; the correction
  is stated inline.
- **`[decision]`** — needs an owner call, not an implementation.

Anything reading `[open]` here was confirmed by opening the file. Nothing in this register is
inherited on trust.

---

## Where E6 stands

A second audit pass on 2026-08-27 added section **5b** — findings outside the original
register's scope (security, scale, and defects), 11 shipped and 1 recorded as architecture.

| Group | Shipped | Open |
|---|---|---|
| Scalability & storage (S) | — | S1, S2, S3, S4, S5 |
| Robustness / type-safety (R) | R1, R2, R3 | R4 (standing rule) |
| Efficiency / duplicate logic (E) | E-a, E-b, E-c, E-d | — |
| Efficacy (F) | F-c | F-a, F-b, F-d, F-e, F-f `[decision]` |
| UI honesty (C) | C1, C2, C3, C4, C5, C7, C8, C9, C10, C11 | C6 |

The honesty group — the one Phase 3 builds directly on top of — is closed except C6, which is
a breadth sweep rather than a defect. The open remainder is concentrated in **storage and
efficacy**: data the platform pays to write and never reads, and data it computes and then
discards before the UI layer.

---

## 1. Scalability & storage

| # | Verdict | Item |
|---|---|---|
| S1 | `[open]` | **Retention policy for processed/staged performance files.** `manual_imports` was 363 MB of a 437 MB database, ~77 MB of it stale staged files across ~20 rows. BUG-45 (`Reclaim abandoned and duplicate uploads`) landed the reclaim mechanism, so the *tool* now exists — the operational sweep against live data has not been run from here, and the register cannot verify live DB state from a repo checkout. **Run the reclaim before any live verification:** staged files are additive per slot, so stale staging silently changes run output. Source: Phase1 Closeout; BUG-45. |
| S2 | `[open]` | **`platform_performance` delivery-basis rows: written every run, zero read path.** Confirmed precisely. The table *is* read (`metrixSeedAssembly.ts:1007`), but only the `tracking_basis === 'conversion'` subset is consumed, at `metrixSeedAssembly.ts:400` → `conversion_tracking_signal.platforms`. Rows with `tracking_basis` NULL/`'delivery'` have no reader anywhere. Every run pays the write cost. Source: Audit §5.2. |
| S3 | `[open]` | **`ad_performance.confidence` (`schema.sql:112`) is never written on the manual path.** No writer found in `analysisEngine.ts` or `import.ts`. A column that looks meaningful in every query and is always null. Source: Audit §5.2. |
| S4 | `[open — partial]` | **`ad_performance.cpa/ctr_link_pct/cvr_link_pct/cpm`: persisted, consumers re-derive.** The audit said "never selected"; that is now half-true — `cvr_link_pct` IS read (`metrixSeedAssembly.ts:461`, `generationEngine.ts:403`) while the others are still write-only. The open decision is unchanged and now sharper: make the persisted values canonical or drop them, but do not keep a column that one reader trusts and every other re-derives. Source: Audit §5.2, §2a.3. |
| S5 | `[open — upgraded]` | **`variable_performance.payload` Reach / Impressions / Clicks (all) are hardcoded zeros** (`analysisEngine.ts:1390-1392`, `variablePerformancePayload`). The audit called this a rollup-deflation risk. It is more than that: the code's own comment says these are "not available at the token level — set to 0 so numeric consumers don't receive undefined", which is a **fabricated measurement by the platform's own invariant** — 0 standing in for unknown, in persisted data. `Result_per_link_click_pct: cvrLinkPct ?? 0` coalesces the same way. Fixing it means making those three fields nullable on `VariablePerformanceRow` and threading the change through `variable-drilldown.ts`, `reportExport.ts`, `dataExport.ts`, `kpiBreakdown.ts` and `VariableDrilldownModal.tsx` — **and** normalising the zeros already stored on every existing row, since changing the writer does not retroactively fix persisted data. Deliberately not attempted as a session-end change. Source: Audit §5.2, re-read 2026-08-26. |

## 2. Robustness / type-safety

| # | Verdict | Item |
|---|---|---|
| R1 | `[shipped]` | `KpiDrilldownModal.tsx` read typed event rows through four `as any` casts; a renamed key yielded `NaN`, which is not null, so the "no data" note never fired and the modal rendered a confident wrong number. Now typed against `AnalysisSummaryTotalsEventRow`. |
| R2 | `[shipped]` | `run-scope.ts` / `date-scope.ts` reached for the concept hint via `(r as Record<string, unknown>)`. Both now take a typed `ConceptScopedRow`, and `ConceptHint` is an indexed access into `CellPerformanceRow` so a rename fails the build — verified by renaming the field and watching the typecheck fail on that line. |
| R3 | `[shipped]` | `SegmentDrilldownModal.tsx` rendered the same "—" for a metric that honestly cannot be computed (tooltip reason attached) and for a catalog miss (a defect). The miss now says which one it is. `deepDive.ts:144` had already been fixed to the `"n/a"` + note pattern; the `KpiTile` path is unreachable in practice because `useKpiTileMetrics.resolveSlots` filters every stored id through the catalog. |
| R4 | `[open — standing rule]` | **Every new table must be added to the RLS enforcement array by hand.** Not a defect; a process risk that survives as long as the array is manual. Carry it in the DoD checklist of any task that adds a table. Source: replit.md. |

## 3. Efficiency / duplicate logic

| # | Verdict | Item |
|---|---|---|
| E-a | `[shipped]` | `ImportConfidenceReport` hand-mirrored `SIGNAL_WEIGHTS`, tied to the server only by a comment — and had already drifted (an extra `"Amount spent (USD)"` key). The mirror now lives in `lib/signalWeights.ts`, derives the currency-resolved spend key instead of hardcoding USD, and `check:signal-weights-drift` (wired into the validation list) fails the build on any disagreement. **Found while writing it:** the canonical table sums to **0.98**, not the 1.00 both its comments claimed. Nothing depends on the total — the grade self-normalises over the columns an import actually carries — so the numbers were left alone and the false claim corrected. See §6. |
| E-b | `[shipped]` | The run-warnings headline was chosen by `w.includes("Reduced confidence") \|\| w.includes("core metric")` — behaviour keyed on prose, one copy edit away from silently demoting the only line that tells a user their efficiency metrics are incomplete. Now `hasReducedConfidence()` in `lib/warningSeverity.ts`, beside the notice/attention patterns, with tests pinned to the producer's actual wording. |
| E-c | `[shipped]` | `rollupPlacements` existed twice (`PlacementsView`, `AnalysisOverview`) plus a third inline cpa/ctr derivation for run-API rows. One `lib/placement-rollup.ts` now, with `derivePlacementRollup` shared by both entry points. |
| E-d | `[shipped — guard-rail]` | The per-run import reader (fetch/decode/parse once) is unregressed; the new read paths added in E1–E6 do not re-read import bytes. |

## 4. Efficacy — computed intelligence not reaching the product

| # | Verdict | Item |
|---|---|---|
| F-a | `[shipped — copy half, 2026-09-02]` | **`ad_creative_metadata` now read:** `creativeComponents.ts` weights every headline / primary text / description / CTA against the ads that carried it; the seed exposes `creative_components` and `ads[].creative`; the Creative Library has a Copy components tab and the Creative dialog shows the ad's copy with its source. `extra_metrics` and the per-ad `reach` / `clicks_all` (F-b) remain unread. Original finding: **`ad_performance.extra_metrics` and `ad_creative_metadata` are written and read by nothing.** Confirmed: written at `analysisEngine.ts:1347-1348` (and five more sites for the breakdown tables), and the only other mentions in the entire repo are the `schema.sql` column definitions. `ad_creative_metadata` carries the ad's **body text, headline, CTA type, link destination and link caption** (`CREATIVE_METADATA_COLUMNS`, `iapCsvSpec.ts:17`). This is already-paid-for creative intelligence sitting unused, and it is the single best value-per-effort item on this register for the Phase 3 brief's "make the intelligence feel deeper" mandate — the Creative dialog's Overview tab is the obvious consumer. Source: Audit §5.2, re-confirmed 2026-08-26. |
| F-b | `[open]` | **`ad_performance.reach` / `clicks_all` are dropped from per-ad stats** (bottom-line event totals only), so no ad-level surface can show them. Same class as F-a. Source: Audit §5.2. |
| F-c | `[shipped]` | `CreativeExpandDialog` ASSIGNED `maleCpa`/`maleCtr` from each row's own rate inside a loop over the bucket's rows, so the last row won and which ad that was depended on iteration order. The bucket now accumulates impressions and link clicks alongside spend and results, and derives both rates once — null on a zero denominator rather than asserting $0.00. |
| F-d | `[open]` | **`ConceptFamilyView` re-derives concept CPA/CVR independently of `concept_performance`'s blends.** The rows[0] CTR defect shipped (BUG-13); the broader re-derivation is untouched. Consolidating onto one helper is what prevents the next rows[0]-class bug — `lib/placement-rollup.ts` is the shape to copy. Source: Audit §5.2. |
| F-e | `[open — new 2026-08-31]` | **The optimize/act stage of the IAP loop has a complete UI and no producer.** `optimization_loop` and `recommendation_cards` are READ by six surfaces (`RecommendationsView`, `ListenCommandCenter`, `ManagerOverview`, `ActionQueueView`, `AdAccountOverview`, `MstCommandCenter`) plus `reportExport.ts` and the seed adapter. Grepping `artifacts/api-server/src` and `scripts/src` for any insert/upsert/update against either name returns **nothing**: the only writer in the repo is the static importer (`scripts/src/metrix-supabase/import.ts:498,1138,1821`), which writes the literal `"pending"` with a null payload, and `import.ts:1761`, which copies `recommendation_cards` straight out of the checked-in `metrix_seed_bundle.json`. `generationEngine.ts` exposes exactly three kinds — `strategy`, `briefs`, `deconstruct` (`generationEngine.ts:34`) — and no route generates an optimization loop. **Consequence:** every real account renders "No actions yet" in Action Queue and a null optimization loop forever; only the demo seed shows cards, and those are fixture data, not analysis. This is the largest functional hole between the current build and a platform release, and it is a missing-producer problem, not a UI one — the UI is already built and honest about the emptiness. |
| F-f | `[decision — new 2026-08-31]` | **The official 22-table METRIX schema is deployed, secured, tested — and read by nothing.** Grepping `artifacts/api-server/src` for `intelligence_cards`, `bsil_suggestions`, `clients`, `analysis_runs`, `learning_registry` and `approval_events` returns **zero non-test references**. The live product runs entirely on the importer schema: `manual_analysis_runs` (22 refs), `generation_runs` (8), `iap_runs` (2). This matters for **F-e** because the optimize stage's destination tables already exist there and are a near field-for-field match: `intelligence_cards` carries title / summary / `evidence_json` / `implication_json` / `recommendation_json` / `named_factors` / `confidence_grade` (HIGH|MODERATE|LOW|INSUFFICIENT) / severity / priority / `entity_scope`, and `bsil_suggestions` carries `suggestion_type` (scale|reduce|pause|hold|reallocate) / `suggested_change` / `rationale_json` / a pending→approved→rejected→executed_manually `status` — the Action Queue's own lifecycle — under a hard campaign/ad_set-only budget-scope constraint. There is even a BEFORE INSERT/UPDATE trigger requiring a run-scoped `approval_events` row before any `learning_registry` write: the optimize→approve→learn loop, designed and unwired. **The blocker to using it is identity:** the official schema is keyed by `clients.id`, the product by `ad_accounts`, and no bridge exists. **Owner decision.** Recommendation on record: build F-e's producer in the importer schema so it ships, but give its output the official schema's SHAPE (same confidence grades, same severity levels, same campaign/ad_set budget rule) so the eventual move is a data migration rather than a redesign. |

## 5. UI honesty

| # | Verdict | Item |
|---|---|---|
| C1 | `[shipped]` | `AvatarsView`'s "Creative combos" promised a concept × placement × platform cross-tab and rendered two disjoint row sets under it. The join genuinely does not exist — `performance_by_cell` has no placement dimension and `placement_performance` is keyed (account, placement, window) with the ad dimension aggregated away. Now two separately-headed rankings with no "—" filler, and a disclosure saying why they are not combined. **Recorded for whoever builds the real thing:** the raw Meta device/placement export DOES carry `Ad name` per row (`DEVICE_PLACEMENT_BREAKDOWN_COLUMNS`), so the cross-tab is buildable — it needs an ad-level placement rollup that no ingestion path writes today. |
| C2 | `[shipped]` | BUG-33: `KpiTile` rendered the same "—" while refetching as for a missing value. Now a pulsing bar with `aria-busy`. |
| C3 | `[shipped]` | `KpiStat` had no disclosure slot; every dash on the Audience rows was structurally unexplainable. It now takes `unavailableReason`, and `AudienceView` passes the strings the segment metric catalog already computes rather than a second set that would drift. The affordance is a dotted underline + `title`, not a tooltip — these stats also render inside button-cards, where the rulebook forbids a nested interactive element. |
| C4 | `[shipped]` | `KpiTile` suppressed its ⓘ whenever a metric had no `sub`, so the six base hero metrics rendered bare dashes with no affordance. A null tile now always has something behind the ⓘ. |
| C5 | `[shipped]` | One aggregation-null policy. BUG-11's open half migrated `date-scope.sumInRange`; this pass finished the job — `metricsCatalog`'s lower-funnel totals used "ANY row carries it, sum the rest as `?? 0`", so three measured adds-to-cart cells out of eleven produced a total that rendered complete and was divided by a COMPLETE link-click denominator. The policy now has ONE implementation (`lib/strict-sum.ts`) that `segment-analytics` and `date-scope` both delegate to, plus per-metric coverage notes ("only 4 of 11 cells carry adds-to-cart"). `summaryTrends.ts` and `reportExport.ts`'s `?? 0` sites were checked and are dead defensive code on non-nullable fields, not live fabrications. |
| C6 | `[open]` | **Two placeholder vocabularies coexist**: ~158 `"—"` sites vs ~30 `"n/a"` sites in `artifacts/metrix-iap/src` (down from the audit's ~173/~29). Standardise on the `segmentMetricsCatalog` reason pattern and backfill by priority. This is a breadth sweep, not a defect — the highest-visibility surfaces (C1, C3, C4) are now done, which is the part Phase 3 depends on. Source: Audit §5.3. |
| C7 | `[shipped]` | The remainder of the 0-vs-unknown sweep. `date-scope.sumInRange` was fixed under BUG-11; this pass fixed `EngagementFunnelView`'s `ratio`, whose `if (!a \|\| !b)` nulled a **measured** zero numerator — an ad set with a real, recorded zero adds-to-cart reported "not measured" instead of 0%, the invariant inverted in the direction that hides a bad result. |
| C8 | `[shipped]` | BUG-32: `AlertsView` now renders `iap.data_quality[]`, the lineage `ListenCommandCenter` always documented. |
| C9 | `[shipped]` | BUG-30: `reconciliation` is declared optional in `openapi.yaml` with the reason stated, and `AnalysisHistoryView`'s block self-hides — kept rather than deleted so implementing the writer needs no UI work. |
| C10 | `[shipped]` | `csv_warnings` rendered only in `ManualAnalysisControls`, only for the latest run, so runs started from the Loop command chain or task tray surfaced warnings nowhere and the history screen showed none — despite the field already being on the `AnalysisRun` the list endpoint returns. Now a shared `CsvWarningsPanel` rendered in both places. |
| C11 | `[shipped]` | BUG-44: `upload_warnings` are persisted on the `manual_imports` row and returned in listings. |

## 5b. Platform audit (2026-08-27) — findings beyond the original register

A second pass swept for defects, scale ceilings, security and SaaS practice rather than
re-checking E6. Everything here was verified by reading the code, and every fix carries a test
that was confirmed to fail against the original defect.

### Shipped

| # | Verdict | Item |
|---|---|---|
| A1 | `[shipped]` | **Cross-tenant file disclosure.** The staged-file cache in front of `/manual-imports/:importId/file` was keyed by `importId` alone, and both its cache-hit and in-flight branches return bytes BEFORE the account-scoped query runs — so a member of account B who knew an importId from account A was served A's file. Uuids are not secrets: they travel in URLs, screenshots, support tickets and logs, and revoking a grant does not un-see them. Now `lib/creativeFileCache`, keyed by (account, import). |
| A2 | `[shipped]` | **Stored XSS → session-riding.** Both asset endpoints echoed the uploader's `content_type` (a bare `z.string()`, never validated) into the response header, so an authenticated user could upload HTML declared `text/html` and have the platform serve it as a live same-origin document. Script there runs with the session cookie on every fetch it makes. `lib/assetContentType` now serves only non-executable media inline; everything else is an opaque download. The cell endpoint was the worse of the two — its URL contains no unguessable id. |
| A3 | `[shipped]` | **No security headers at all.** Added `nosniff` (load-bearing: without it a browser can sniff the A2 downgrade back into HTML), `default-src 'none'; sandbox` CSP, `X-Frame-Options`, `Referrer-Policy: no-referrer` (asset URLs carry account and import ids), and HTTPS-only HSTS. |
| A4 | `[shipped]` | **Silent 1000-row truncation.** Ten reads across three engines had no `.range()`, so PostgREST returned a prefix and every total over it rendered as complete. Three pulled an account's ENTIRE history then filtered by date in JS, so the truncation landed before the window was applied. The rollups are per (entity × day) — demographic_performance passes 1000 within a month of ordinary delivery. One reader now (`lib/paginatedSelect`). |
| A5 | `[shipped]` | **Seed cache stampede.** No request coalescing, so every concurrent miss started its own ~29-table rebuild. Twenty mutation paths invalidate the cache and their clients refetch immediately, making concurrent misses the common case. Now `lib/coalescedCache`. |
| A6 | `[shipped]` | **Every analysis window labelled a day early outside UTC.** `date_start`/`date_end`/`window_start`/`window_end` are `date` columns rendered through `new Date(s).toLocaleDateString(...)` in four files — UTC midnight formatted in the browser's zone, so Aug 1–31 read "Jul 31 – Aug 30" for every viewer in the Americas. `fmtDay`/`fmtDayRange` in `lib/normalize` are now the one way to render a calendar day. Invisible to anyone developing in UTC, so the test runs under America/New_York. |
| A7 | `[shipped]` | **The metric picker was invisible everywhere.** `.mx-kpi-tile` sets `overflow: hidden`, and the dropdown was an in-flow absolute child positioned below the tile's bottom edge. Four tests asserted it rendered and all four passed, because jsdom applies no CSS. Now portalled to `document.body`. This is the customizable-tiles feature. |
| A8 | `[shipped]` | **Demographics had no `impressions` column** while placement/platform/device all did — and the engine read `b.impressions` to derive each row's rates, then dropped it. No demographic CTR or CPM was computable; the client hardcoded both to 0. Plumbed end to end through schema, engine, both summary paths, importer and contract (via codegen, not a hand-edit). |
| A9 | `[shipped]` | **A false empty state.** Cluster mode needs CPA and CVR, so an account spending without conversions got no clusters — and the cards said "No spend to allocate", the inverse of the truth. Now names the real reason and offers Age view. |
| A10 | `[shipped]` | **Rates assigned instead of derived.** `CreativeExpandDialog` set each age bucket's CPA/CTR from whichever row happened to be last in the loop. Now accumulates denominators and derives once. |
| A11 | `[shipped]` | **A measured zero read as unknown.** `EngagementFunnelView`'s `ratio` guarded with `if (!a || !b)`, so a real recorded zero adds-to-cart reported "not measured" instead of 0% — the honesty invariant inverted, in the direction that hides a bad result. |

### Open — the one structural item

| # | Verdict | Item |
|---|---|---|
| A12 | `[open — architecture]` | **The seed is O(every account) on both sides.** One document holds every account the user may see, with each account's full nested `iap`; it is fetched once at boot and held in a React context that 61 components read. That shape is deliberate and buys real things — instant account switching, client-side agency rollups, no per-page loading states, and one snapshot that makes "never fabricate" enforceable. The cost is that the server assembles every account on each cache miss and the browser parses every account to render one page. Today: 11 accounts, 1.2 MB, unnoticeable. The heavy part is not the account list but the nested analysis blobs — one account's `conversion_tracking_signal` is 172 KB, its `device_delivery_signal` 106 KB. **Target shape** (what comparable platforms do): a thin index at boot — ids, names, status, `campaign_summary` totals, which is all the switcher and the rollups actually need — plus per-account detail fetched on demand. The per-account endpoints already exist (`analysis-summary/:preset`, `analysis-data-windows`, `analysis-runs`), so the seed is duplicating data that already has a dedicated path. Not attempted here: it touches 61 components and belongs in a scoped session, not the end of an audit. **Interim shipped:** `lib/seedBudget` logs with per-account attribution once the payload passes 5 MB, and escalates at 12 MB — so the next approach to the ceiling is a log line naming the responsible account rather than a user watching a spinner, which is how BUG-25 was found. |

## 6. Decisions needed — flag, don't silently pick

- **`SIGNAL_WEIGHTS` totals 0.98, not 1.00.** *(New, found 2026-08-26.)* 17 entries, arithmetic
  checked; the doc comment and the trailing `// total = 1.00` were both simply wrong. Nothing
  depends on the figure — the Confidence Report grades present weight over the total weight of
  the columns an import actually carries, so it self-normalises — so the weights were left
  untouched and the false claim corrected. **Closing the 0.02 shifts every grade**, which makes
  it a product decision rather than a typo fix. `check:signal-weights-drift` pins 0.98 so the
  change has to be made deliberately, in both places.
- **S5's stored zeros** (above): fixing the writer does not fix the rows already written. Decide
  whether existing `variable_performance` payloads are normalised, re-derived, or left with a
  documented caveat.
- **S4**: persisted rates canonical, or dropped. Not both.
- **BUG-09's remaining half**: overlapping-window, different-bytes duplicate files need explicit
  product semantics (BUG-09 fixed only the same-bytes case).
- **`objectives_assessed` / `objective_flags`**: persisted and typed, never rendered. Surface
  them, or confirm they are intentionally internal-only.
- **Optimization Loop build** (3–4.5 days, explicit-request-only): still not started, confirmed
  empty/pending by design. Do not build speculatively.

## 6a. Decided — the objective label is a lens, never a wall *(owner decision, 2026-08-28)*

Verbatim principle, from the owner, on multi-objective accounts: analysis applies **no manual
emphasis** — "the data should speak for itself based on the specific campaign objectives
defined", and that objective-based integrity flows downstream undistorted. The **strategy layer**
is where algorithmic weighting lives: identify patterns, correlations and coincidences between
variables (avatars, Concept IDs, angles) **across objectives**, discern why outcomes occur and
how objectives interact, and curate direction from those signal relationships — without
distorting the source data.

Applied to code the same day: `AdPerformanceView`'s buyer-intent funnel dropped measured
intent/conversion stages for any account not labelled purely ecommerce (hiding a lead-gen
account's real purchases). Now a stage renders iff it carries measured data, whatever the label;
objectives only pick which *absence* explanation prints when the lower funnel is genuinely
unmeasured. Contract pinned by two tests in `ad-performance-canvas.test.tsx` ("keeps measured
lower-funnel stages under ANY objective label"). Verified the only other objective-label branches
(AccountSwitcher, AnalysisCommandCenter) are display-only, and EngagementFunnelView was already
data-first. The strategy-layer weighting engine (cross-objective correlation) is **spec'd here,
not yet built** — it belongs to the generation engine's prompt/weighting work, not the UI.

## 7. Already shipped — do not re-litigate

B0 and BUG-02 → BUG-46 are resolved for their stated scope in `BUG_TRACKER.md`. Re-read a bug's
own entry before touching its file: the Fix-Now portion is done and verified against live AAFE
data, and several entries carry corrections recorded *after* the original fix.

---

## Sequencing from here

1. **E1–E5 are merged** (structured signals, KPI period context, status semantics, account
   display names, route split). The enabler-sprint document records each one's landed status,
   including the two places the specification was corrected against live data.
2. **E6 is substantially merged** — the whole honesty group except C6, all three duplicate-logic
   sites, and all three type-safety holes.
3. **Phase 3 is unblocked.** What remains open is storage (S) and efficacy (F), neither of which
   gates the information-hierarchy pass. F-a is the one open item Phase 3 should *want*: real
   creative copy, already captured, currently reaching no screen.

## §6b — The cohort is an analysis lens, and its reach is now bounded (owner decision, 2026-08-29)

**The decision, verbatim:** "we need the system that curates the analysis views
only per business model, that's the only pertinent[ce]. the cohort business
model objective should not be on the interface. it is only pertinent to the
analysis interface view and we need to plan a system so that is the limit of
its reach." Followed by: "the objective is pertinent to specific and single
analysis runs, and does not need to be a highlight throughout the platform.
neither does the fact if it's manual imported or not. disregard the
specification of it on the interface."

**What that means in code.** The business-model cohort (ecommerce / lead_gen /
service / app, and any label derived from an account's `objectives`) decides
which terminal metric a run reads and which funnel stages an analysis view can
honestly show. It is NOT a property of the account as an entity and NOT a way
to describe an account to a reader. The same applies to how an account's data
arrived (live connection vs manual upload): a provenance fact, not an identity.

**Shipped:**

- `AccountSwitcher` printed the cohort under every account name ("Ecommerce",
  "Ecommerce + App", "Ecommerce + Lead Generation"), in the trigger and in
  every dropdown row — telling every reader the whole product was scoped by
  business model. Removed. A first replacement that showed the data source
  ("Manual uploads") was ALSO removed on the owner's follow-up: the chrome does
  not classify accounts at all. Only an actionable state earns the second line
  ("Needs setup"), and the manager keeps its scope line ("Agency Overview").
- The analysis run card demoted `Objectives` from a fourth stat tile — a long
  text value at stat size, outranking the three real run parameters beside it —
  to a quiet parameter line. It stays on the card because it is genuinely
  run-scoped, which is exactly where the owner said it is pertinent.
- **`check:cohort-reach`** (new gate, wired into `.replit`): fails if a cohort
  read reaches any file outside a reasoned allowlist — the cohort module, the
  analysis views, the settings surface where objectives are CONFIGURED, and the
  export payload. Verified to fire by reintroducing a violation in `Topbar`.
  A new exception must be added to that list WITH ITS REASON, so drift is on
  the record instead of one import away.

**Open for the owner:** Settings → General still renders the objectives
selector, because that is where objectives are set and the analysis cannot run
without them. It is allowlisted as configuration, not display. Say the word if
even that should move.

---

## 8. Release-readiness re-verification (2026-09-02)

Every open item above was re-read against the tree at this date, by the command
named beside it. Nothing changed verdict; the counts that drift are restated.

| Item | Verdict today | How verified |
|---|---|---|
| S1–S4 | `[open]`, unchanged | no writer/reader added since 2026-08-26 (`grep` of `analysisEngine.ts`, `metrixSeedAssembly.ts`) |
| S5 | `[open — upgraded]`, unchanged | `analysisEngine.ts:1425-1427` still writes `Reach: 0, Impressions: 0, "Clicks (all)": 0` |
| F-a / F-b | `[open]`, unchanged | `ad_creative_metadata` / `extra_metrics` referenced only by `iapCsvSpec.ts` and `analysisEngine.ts` (writers) — still no reader |
| F-d | `[open]`, unchanged | — |
| F-e | `[open]`, unchanged | `generationEngine.ts:34` still `"strategy" \| "briefs" \| "deconstruct"`; only `metrixSeedAssembly.ts` touches `optimization_loop` / `recommendation_cards` server-side, and it reads |
| F-f | `[decision]`, unchanged | — |
| C6 | `[open]` — **171** `"—"` / **28** `"n/a"` (was 167 / 27 on 2026-09-01) | the two `grep` lines in the reface register §7.3 |
| A12 | `[open — architecture]`, unchanged | — |
| Field coverage | 450 fields / 54 interfaces; `WorkspaceBilling` 7 of 8, `AppDefaults` 5 of 6, `CreativeDeconstruction` 3 of 15, `OptimizationLoop` 2 of 6 unread | `check:field-coverage` |

**What this pass did change** is navigation, recorded in
`METRIX_Navigation_Audit_2026-09.md` — nine findings, all shipped with tests.
One of them touches an item here: the **Action Queue** (`/app/act/queue`) is
now a visible section of the sidebar rather than an orphan route, which makes
**F-e**'s emptiness visible to every reader instead of only to the one who found
the overview button. That is the intended effect: an honest empty state in the
navigation is the loudest possible reminder that the producer is the release
blocker.

---

## 9. Decisions recorded at the Phase 4 planning pass (2026-09-02)

Owner answers to the four questions in `METRIX_Phase4_Release_Plan_2026-09.md` §0,
and two decisions taken under the owner's delegation:

- **F-e / optimize producer: explicit go.** Register §6's "explicit-request-only"
  condition is met. Build in the importer schema with the official schema's shape
  (F-f recommendation), grounded in a dated Meta-practice reference the producer
  must cite.
- **"No additional user steps" = source precedence, not automation.** Runs stay
  manual (`replit.md` rule unchanged). Where an optional input is absent, the most
  applicable stored source stands in, named on the module. F-a's unread
  `ad_creative_metadata` becomes the first fallback for creative intelligence.
- **A12 seed split: deferred.** Triggers, each observable today: `seedBudget` logs
  5 MB; account count > 30; any per-account nested blob > 500 KB.
- **Blueprint cohort section: rewrite approved** under delegation — a canonical
  document contradicting the code is an integrity defect. Scope limited to the
  §3.7-flagged sections, citing the 2026-09-01 decision.
- **Approved additions:** saved views per module; visual-regression baseline;
  Findings folded into the command-center lead. **Declined:** live freshness
  without reload; treemap / small multiples; collapsed-rail icon navigation.

## 10. Owner brief 2026-09-02 — creative components, shipped

Four asks, all landed on `claude/pre-release-reconciliation-ux-cznjbz`:

1. **Weighting algorithm** — `creativeComponents.ts` (pure, 15 unit tests, in the CI pure list). Weight = result share × efficiency index, normalised to the family's best. Baseline is the covered set's own cost per result.
2. **Confidence-based analysis** — `concept_performance.creative_coverage_pct` / `evidence_grade` / `confidence_score` written by the engine; the volume tier (`confidence_level`) is shared with the weighting through `volumeConfidence` so the two cannot drift. Decision on record: the tier is not relabelled by evidence; the numeric score is.
3. **Non-intrusive, persistent suggestion** — `CreativeSourceNudge` on the Creative command center and Library; per-account per-browser dismissal; self-hides once a servable creative or a deconstruction exists.
4. **Data continuity** — one input shape for all creative sources with per-field precedence (uploaded asset > Meta API > export); the Meta API producer is a future module of that shape, not a rewrite. Copy reaches the Creative dialog through `cardFromLibraryCell`'s fallback, so a card built from an export-only ad shows its real copy, named by source.

Schema: three additive `alter table … add column if not exists` lines on `concept_performance` in `schema.sql`. **Applied to the live project on 2026-09-02** as Supabase migration `concept_performance_creative_evidence_columns` (verified: all three columns present, nullable). Runs from this point write them; rows from earlier runs stay "not graded" unless backfilled (§11).

## 11. Live-environment reconciliation (2026-09-02, from the cloud session)

Verified against the live Supabase project by read-only SQL, not from a checkout:

| Check | Result |
|---|---|
| `check:ad-performance-views` (closeout §3.6 owner task) | **PASS** — all three `ad_performance_*` views carry `security_invoker=on`; `anon` and `authenticated` hold no SELECT |
| RLS on `ad_performance`, `concept_performance`, `manual_analysis_runs` | enabled, zero policies — deny-by-default as `schema.sql`'s RLS block intends; service role bypasses |
| Security advisors | 42 × `rls_enabled_no_policy` INFO (deliberate, per closeout §3.4); 4 × SECURITY DEFINER helpers callable by `authenticated` WARN (deferred by decision — **do not revoke EXECUTE**, the six run-scoped policies depend on them; plan A5); leaked-password protection off WARN (Auth dashboard toggle, not SQL — owner) |
| `concept_performance` evidence columns | present after migration `concept_performance_creative_evidence_columns`; **one** run-keyed row graded by backfill with the engine's exact formula (the only ungraded row with a run id); the 28 importer-era rows (no run id) stay "not graded" by design |

Still owner-only from a cloud checkout (no secrets here): `check:seed-fixture-drift`,
`refresh:seed-fixture`, running analysis on Bookster / Fresh Import, and the Auth
leaked-password toggle. (`archive/phase2-pre-rebase` was deleted at the ship, §12.)

**Schema ↔ live database drift check (2026-09-02).** Every table (43) and column (500) that
`schema.sql` declares exists on the live project, and every column the live project carries on
those tables is declared in `schema.sql` (nine of them via `alter table if exists … add column`,
which a first parse missed and a second confirmed). No drift in either direction. Method: the
declared set parsed from `schema.sql`, compared against `information_schema.columns` through the
Supabase connector. PR #174 opened for the branch; its CI is the merge-path verification.

## 12. Ship record (2026-09-02)

| Step | Result |
|---|---|
| PR #174 | CI run 362 green; merged as a merge commit → `main` `5cdaaa5` |
| CI on `main` | run 363 on `5cdaaa5` (push event) — **success**, concluded 10:59Z |
| `archive/phase2-pre-rebase` | deleted on origin (`git ls-remote --heads` returns nothing). The cloud git proxy refuses branch deletes; the workspace did it |
| Replit workspace | fetched and **merged** `origin/main` (never a reset); `legacyRoutes.ts` confirmed present in the workspace afterwards |
| Publish | deployment `329ef7e0` from the merged workspace; verified from outside by entry-bundle hash against a local production build of `5cdaaa5`, plus the `Copy components` content marker in the live `CreativeLibraryView` chunk, whose md5 matched the local build (`verify-deployed-build.sh`; a `success` status alone is not evidence). Publish status: `success` at 10:57Z |
| Manual-import validation | `METRIX_Manual_Import_Validation_Runbook_2026-09.md` — fresh account, new user, nothing touches Bookster |

Owner-only, still: approve the tester (users live in Replit Postgres), the Auth
leaked-password toggle, and `check:seed-fixture-drift` / `refresh:seed-fixture`.

## 13. First fresh-account validation run — findings and fixes (2026-09-02, 11:26–12:15Z)

The tester's run went through the new-account manual upload end to end. Four findings, and
one incident the logs explain.

### 13.1 The incident: the database wedged during the run

Reconstructed from the Supabase unified logs (edge, PostgREST, Postgres):

| Time (UTC) | What the logs show |
|---|---|
| 11:26–11:47 | ~20 creative assets staged, every request 200/201 |
| ~11:47 | Analysis run started; its first read was `manual_imports?select=id,filename,content,kind` for **every staged performance file at once** |
| 09:49 (earlier, AAFE) | The same shape of read for ONE file: a 13 s query — PostgREST hex-encodes the bytea (2×), `json_agg`s it in one backend, and Node parses the doubled string |
| 11:44 | Last Postgres log line: a checkpoint that took 36 s to write 360 buffers — the disk was starved |
| 11:48 → | Every REST request 522/525 ("Warp server error: Thread killed by timeout manager"), including the seed's 30 table reads and the run's own file read at 11:57 |
| 11:58 → 12:15+ | No Postgres, PgBouncer or PostgREST log line at all; direct SQL through the connector times out on `select 1` |

**Diagnosis.** Reading four staged files' full bytes through PostgREST as hex-in-JSON in one
query exhausted the instance; it never recovered on its own. The seed could not load, so
every reload sat on the boot splash — the "platform stalls in the loading interface when
reloaded during a run" report is this incident seen from the browser. **The database needs a
restart from the Supabase dashboard (owner).** No data is at risk: the run had committed
nothing yet (it failed on its first read) and the staged rows were written before 11:48.

### 13.2 Fixes shipped on `claude/pre-release-reconciliation-ux-cznjbz`

| # | Finding | Fix |
|---|---|---|
| 1a | Bulk bytea reads through PostgREST JSON | `supabaseBinary.ts`: one bytea cell per request as `Accept: application/octet-stream` (raw bytes, no hex, no `json_agg`). `loadImportContentBuffer` reads one file at a time, inline or chunked, and checks the byte count against the row's `size_bytes`. The run and the `/file` route select metadata only — **no code path selects `content` for more than one row.** |
| 1b | Boot splash had no deadline | `MetrixDataProvider` measures the first load; past 20 s the splash says the data service has not answered and offers a retry that cancels the hung request first (`MetrixBootLoader` `slow` state, tested). |
| 2 | Ad Summary export warned about columns it does not need | Metric expectations are per class (`expectedBaseMetricsFor` / `coreBaseMetricsFor` in `iapCsvSpec.ts`): the summary is a ledger, judged on Amount spent · Impressions · Reach · Results · Result type. Engagement/video columns are accepted when present and never reported missing, never enter `mapping_summary` as "missing", and no longer cut the confidence grade. The Required-format panel groups them as optional. Pivots keep the full base list. BUG-27 had only restyled this list. |
| 3 | Run analysis click showed nothing | The POST does not answer until every staged file has been validated, and the run row exists only after that. `AnalysisControls` now renders the progress bar from the click ("Validating staged files before the run starts"), scrolls it into view, and hands over to the server's own progress when the row appears. The stage strip pulses on the current node too; the run list and stage status poll while a run is in flight. |
| 4a | Creative upload dialog blocked and deleted | Both dialogs (`ManualImportDialog`, `CreativeLibraryDialog`) close freely; the "discard unmapped files" guard that offered to DELETE creatives is gone. Filename → ad-name matching moved to the server (`creativeAutoMap.ts`, `adNameMatch.ts` copied byte-for-byte with a drift test): at staging against known ads, after every successful run against the registry it just wrote, and on "sync creative links". The client sends no mapping; the editor stays for corrections. |
| 4b | No suggestion to deconstruct and re-analyze | `CreativeNextStepNudge` on the Analysis and Creative command centers: "Deconstruct N creatives" (runs the manual backfill) when staged creatives are not deconstructed; "Re-run analysis with the full IAP variable library" when the newest deconstruction postdates the last successful run. Dismissible per account per browser. Runs stay manual. |

Not changed, on record: the run's pre-flight still parses every staged file before the
row exists. The optimistic progress covers the wait; moving the row earlier would mean the
conversion-export confirmation (a 409 before any run) has to become a run-time state.

### 13.3 Shipped (2026-09-02, 12:45–12:57Z)

| Step | Result |
|---|---|
| Database | restarted by the owner; answered `select 1` again at 12:48Z; no run row stuck in `running` (none was ever created — the run failed before `startRun`) |
| Tester's account | all staged rows intact after the restart: 3 performance CSVs (~13 MB) and 23 creatives (~54 MB), creatives unmapped as expected before a first run |
| PR #176 | CI run 367 green; merged as a merge commit → `main` `2a7ff45` |
| Replit workspace | fetched and merged `origin/main`; `creativeAutoMap.ts` confirmed present afterwards |
| Publish | deployment `329ef7e0`, status `success`; verified from outside — live entry bundle `index-Dk4ETgw9.js` matches the local production build of `2a7ff45`, md5-identical, and carries the "Validating staged files before the run starts" marker; `/api/healthz` ok |

The tester can now re-run the analysis on the same account with its staged files. The first
read is one file at a time as binary, so the run cannot repeat §13.1.

### 13.4 Follow-up: the binary read was refused (2026-09-02, 13:30Z)

The tester's first re-run on the fixed build failed on its first read with "Import … does not
exist". The edge logs show why: every `Accept: application/octet-stream` read of
`manual_imports?select=content` returned **406** — PostgREST on this project (12+) does not
serve raw bytes for a table column, and a function returning plain `bytea` is refused the same
way (PGRST107 "None of these media types are available"). The reader had mapped 406 to "no
row". Three runs errored honestly; the staged files were untouched.

**Fix.** PostgREST 12's documented mechanism: a domain named after the media type
(`create domain "application/octet-stream" as bytea`) and functions that RETURN it —
`manual_import_content(uuid)` and `manual_import_chunk_content(uuid, integer)`, invoker
security, executable by the service role only. Applied live as migrations
`manual_import_bytea_readers` + `manual_import_bytea_readers_octet_domain`, mirrored in
`schema.sql`; the anon probe now gets "permission denied" (401), not 406. `supabaseBinary.ts`
calls those RPCs; if binary output is ever refused again it falls back to the one thing that
was always safe — ONE row's `content` as JSON, one file at a time — and logs that it did. Unit
tests pin both paths and that a non-406 failure is raised, never read as "missing".

### 13.5 Deconstruction start timeout, wrong guess mappings, progress assurance (2026-09-02, 14:20Z)

Re-run on the fixed build: the analysis run **succeeded** (every byte read through the RPCs
answered 200). Then "Couldn't start deconstruction — HTTP 502: canceling statement due to
statement timeout". Postgres logs: the start path selected `content` for every selected
creative in one statement (the account now holds 91 creatives, ~2.3 MB each — ~210 MB as
hex JSON) and the database cancelled it on its statement timeout, before the run row
existed. The same class as §13.1, one code path over; the six parallel `/file` reads for
thumbnails took 10–27 s each while that statement ran.

The mappings the server had written were wrong in the way the owner described: the
low-confidence "guess" tier attached 17 unrelated "ChatGPT Image …" files to one ad and six
"SKOV 03 (n)" files to another. The identifier that should have decided — the cell code
(C1A, C2B) the IAP convention puts in both the ad name and the file name — was not one the
matcher recognised (its code pattern needed three or more digits). This account's export
carries no image or video names (`ad_creative_metadata` is null on all 491 rows), so ad names
are the only signal there.

**Fixes.**
- `startCreativeDeconstruction` selects metadata only; each import's bytes are read inside
  the loop through `loadImportBytes` (one cell per request, size-checked). No code path
  selects `content` for a list of rows anywhere in the server now.
- `adNameMatch.ts` (both copies, drift-tested): cell codes are identifiers; a code owned by
  exactly one candidate decides the match, and a code shared by several restricts the
  similarity pass to those owners, so two files that differ only by code land on two ads.
- `creativeAutoMap.ts`: candidates are the ad name plus the Meta image / video names the
  export recorded for it; only an identifier or a confident similarity match is applied — a
  guess is a suggestion for the editor, never a link. Pure `decideAdForFile`, unit-tested.
- Progress: deconstruction shows the run's stage ("Classifying creative n of m"), the measured
  elapsed time and a remaining estimate derived from the measured rate (never before the
  first unit is done); the analysis run shows elapsed time and that the banner follows it.
  A toast confirms the start with the queued count.

**Data fix — none needed after all.** By the time the fix was live the tester had already
re-mapped by hand: no `guess` rows remained on the account (44 mappings set through the editor,
20 confident server matches). Human decisions are never rescored, so nothing was touched.

**Recurrence at 14:30–14:37Z, before the fix shipped.** The tester pressed "Deconstruct all"
on the live build (91 creatives); the same bulk `content` statement ran again and the origin
went unreachable for seven minutes (Cloudflare 525, "SSL handshake failed" — the origin
restarting). It recovered on its own this time. Two more protections went into the same PR:
byte reads are capped at three in flight on the server (the edge logs showed six parallel
2.3 MB thumbnail reads taking 10–27 s each), and creative thumbnails load lazily so a
91-creative library asks only for what is on screen.

**Shipped** as PR #179 → `main` `e46fe01` (CI run 375 green); workspace merged; published
(deployment `329ef7e0`); verified by entry-bundle hash against a local build of `e46fe01`.

## 14. Reconciliation-first evidence layer (2026-09-02, owner go-ahead)

**Specification:** `docs/specs/iap-multi-report-reconciliation.md` — the first file under
`docs/specs/` (the repository had no spec/ADR convention; register sections were the decision
record until now). Its §0 is the verification of the brief against the code and the live tester
account; every correction the implementation follows is recorded there.

**Why.** The tester's demographic export carried 60.05% of the account's spend (2,645.74 of
4,405.61) because its grain was Day × Ad ID × Age × Gender × Text; the engine then dropped Ad ID
at the demographic bucket (`analysisEngine.ts:2059`) and wrote every demographic signal at
account grain, so no creative could ever show a demographic breakdown; the Funnel tab joined a
table manual runs never write; and "8 of 19 ads" counted ad names (44 Ad IDs share 19 names).

**What ships** (one PR, three commits — see the spec's §16–§18 and the PR): ordinal-preserving
duplicate-header verification; report-grain detection recorded on each import; Account ID +
Ad ID identity with no blind name fallback; `ad_breakdown_performance` at ad grain beside the
existing tables; the per-ad × per-metric `reconciliation_ledger` with signed residuals;
`creative_assets` (instance + content identity), `variable_evidence` (many-to-many, no spend
duplication) and `variable_segment_performance`; evidence states in storage, seed and UI;
creative dialogs joining through mapped Ad IDs first; the Demographics heat grid, Placements
drill, Evidence tab, Reconciliation panel and Audience coverage tile on the existing Watermelon
mechanics. The modelled tier ships as a pure, tested balancing function and nothing emits its
output (spec §19).

**Supersedes:** the unwritten `import_metric_reconciliation` table and the reserved
`AnalysisRun.reconciliation` API field (both left in place, documented as superseded). C1's
"ad-level placement rollup that no ingestion path writes today" is now written.

**Amendment (same day).** The owner's follow-up replaced the four-file contract with an adaptive
multi-report engine: no report class mandatory (a run needs one delivery report with spend),
capability detection per file (spec §3a), a compatibility key (account · Ad ID · period · currency ·
attribution · result definition, §6a), source precedence with recorded alternatives and surfaced
conflicts, asset-column roles and copy signatures (§10a), per-metric independence with
`overcoverage` (§7a), the evidence cube with `attribution` (§12a), and the canonical confidence bands.

**`[decision]` — concept confidence tier deviates from the documented bands.**
`creativeComponents.volumeConfidence` (high ≥ $500 and ≥ 30 results; medium ≥ $100 and ≥ 5; low;
validation_required) drives `concept_performance.confidence_level` and the Copy components surface.
The canonical classification (`IAP_DATA_BUNDLE_PREP_v2.0` "confidence_level", blueprint §8.3) is
high > 100 conversions or > $1,000 spend; medium 10–100 or $100–1,000; validation_required below
that but promising; insufficient below the floor. The new evidence layer implements the canonical
bands (`reconciliation.ts` `confidenceLevel`, spec §20); the shipped tier was left untouched because
it feeds shipped surfaces and tests. Owner call: migrate the concept tier to the canonical bands
(a data migration re-grading existing rows) or amend the blueprint to the shipped one.

**Ship record (2026-09-02 18:53–19:03Z).** PR #181 merged as `d0e0de0` (CI run 382 green on
`e26bb0d`; run 381 had failed on a hook the 66 seed-context test mocks did not define — fixed by
reading through `useMetrixSeed` and mocking it in the two tests that had not). Additive DDL applied
first as Supabase migration `reconciliation_evidence_layer` and verified by catalog query (both
`manual_imports` columns, `reconciliation_summary`, the five evidence tables with RLS on and zero
anon/authenticated grants, the kind check admitting `performance_asset_csv`). Replit workspace
merged `origin/main` as `5ffb472` (`git diff --stat origin/main HEAD` empty; the two commits beyond
main are the workspace's own earlier merge and "Published your App"). Deployment
`329ef7e0-2399-4f97-aed0-e2bfa4373002` → success; live entry bundle `index-B9p9BO2o.js` equals the
local `smoke:metrix-iap-build` output, `CreativeCard-BLa4YjUi.js` md5 `6bc1f80a…` identical live and
local, `/api/healthz` 200.

**Still open after the ship:** the live cross-check needs a run on the validated account
(`manual_AHXANj6Vjozp`) made by the new build — its latest successful run (`ce0d8f6d`, 15:41Z,
window 2026-08-01 → 08-30) predates the layer and carries no `reconciliation_summary`. The staged
files (Ad Summary Jul 1–Sep 2, demographic and placement 30-day pivots, each staged twice) have
`report_grain` null because they were staged before the column existed; the run classifies them
itself (`detectReportGrain` at `recordReport`), so no re-staging is needed. The cloud session holds
no login credential, so the owner presses Run analysis; then
`check:reconciliation-ledger -- manual_AHXANj6Vjozp` (or the equivalent SQL) reports the exact
totals, residuals and coverage. Expected from the validated structures: the Ad Summary has no Ad ID
column, so the control is name-keyed and only registry-unique names reconcile per ad; the twice-
staged pivots exercise overlap superseding, not double counting.

**Workspace preview crash after the ship (2026-09-02, ~15:00 ET).** The "Metrix IAP" workflow
died loading `vite.config.ts` with `spawn …/@esbuild/linux-x64/bin/esbuild EAGAIN`: the container
could not fork esbuild's helper at that moment. Not a code or dependency change (PR #181 touched no
lockfile; `node_modules/.modules.yaml` predates the merge and needed no install) and not a sync
problem (`git diff --stat origin/main HEAD` empty). A plain workflow restart brought Vite up
(ready in 2.8 s, HTTP 200); no stale processes were found to kill. If it recurs, look at the
process table before assuming the build broke — the published app was serving the new bundle
throughout.

**`[shipped]` Coverage is context, never a wall (owner direction 2026-09-02, ~15:30 ET).** The tester's
first look at the published build met a "Low signal. Demographic data covers only 59.3% …" banner in
the segment drill-down and an amber coverage box on Audience and Avatars — prose on the first layer,
which the disclosure rulebook forbids, and a gate that downgraded EVERY segment to
"insufficient join coverage" whatever its own volume. The owner's rule: Metrix surfaces objective
truths from subjective media; the signal is the product. Emphasise HIGH signal, say nothing about an
ordinary read, mark a thin read or a partial source with the smallest tag that still reads, and keep
the sentences behind a reveal. Implemented as `assessSegmentSignal` → `high | ok | low` on the
segment's OWN volume against the documented bands (`confidenceBand`, the client mirror of
`confidenceLevel`, spec §20) with the source's measured coverage carried BESIDE the classification
(`SegmentSignal.coverage`); `SignalTag` / `CoverageTag` (`components/evidence/SignalTag.tsx`);
`DataCoverageBanner` is now one caption line with the measured note behind "Why"; the run panel files
`[Coverage]` lines with the notices; the server note is one neutral sentence plus how to widen it;
the export names coverage once and states a high read. The former `insufficient_coverage` state is
gone — a strong segment stays high under partial coverage, and the coverage figure is on the surface
for the reader. What partial coverage still changes is what it always changed: the completeness of a
ranking ACROSS segments, which is what the tag and the reveal say.

**`[shipped]` Variable drill-down joins through the evidence layer (same look).** "C3A SKOV2" showed
$1,350 across 30 unique ads and, beneath it, "No creative cell in this import carries this variable":
manual runs never write `performance_by_cell`, so the cell-only join found nothing. The drill-down
now takes carrier ADS from `variable_evidence` (Ad ID first, name second; the server's own raw-token
rule as the fallback for a run older than the layer), reads segments from the most specific real
source (cell grain → the run's variable × segment rows → the carrier ads' ad-grain demographic rows),
shows the carrier ads' placement rows through `PlacementDrill` instead of the "account-level" sentence,
and carries the relationship on the header as an evidence chip — ad-name tokens and deconstructed
variables are `ad_context`, never upgraded. When a stale run has no evidence to join, the empty state
says exactly that and names the remedy (re-run analysis).

**`[shipped]` Sweep of the touched surfaces (2026-09-02, later).** Page-level screenshots of Audience,
the segment drill-down, Avatars, the IAP Library variable drill-down and the Creative dialog, served
from the checked-in seed fixture with synthetic ad-grain evidence (scratch harness, not committed).
Fixed from what they showed: the Audience coverage tile was an amber strip (chip + three amber
meters) — now one compact neutral row, with `evidenceTone` reserving colour for reconciled/direct
(success) and over-count/incompatible (danger) and treating partial as quiet context; the Creative
dialog's fifth tab clipped to "Evi…" beside the media pane — the rail is labels-only now; the
Creative Library's dialog said "No demographic data for this cell" for a cell whose rows the empty-
state derivation could see, because that call site never passed them — the dialog now reads the
account's cell rows itself (`useCreativeEvidence.cellDemographic`); the variable drill-down's segment
rows lost their label to the signal tag — the tag sits by the CPA column. Pre-existing and left
alone: the amber "V3 checkout results were not populated by age/gender…" notice on the IAP Library.

**`[shipped]` One metric-header pattern (owner direction, same session).** The IAP Library's
catalog-driven, per-view-persisted `KpiTileRow` is the pattern for every variable / metric header.
Applied to the variable drill-down (`buildVariableMetricCatalog` over the import's own variable
totals — impression-based entries hide themselves at token grain, where the engine writes no
impressions). Already on it: Audience, the Creative dialog Overview, Analysis Overview. `[open]`
candidates that still carry a fixed stat trio: Avatars segment cards (Spend · CPA · Link CVR) and the
DNA family cards (Spend · Results · CPA); the segment drill-down has its own picker and should align
to the same primitive.

**Shipped to app.metrix.ad (2026-09-02, ~18:45 ET).** PR #182 (signal tags instead of coverage
warnings; variable drill-down through the evidence layer; one configurable metric-header pattern;
sweep fixes) merged by the owner on CI run 387 (green on `d460a0f`). The CI round before it failed on
`smoke:metrix-iap-avatars-tooltips`, which pins the segment badge's accessibility contract (plain
non-focusable span, sr-only rationale, hover tooltip) — the tag now honours that contract and the spec
reads the new labels. Workspace merged main (`153daf4`, empty diff), deployment `329ef7e0` succeeded,
live entry bundle `index-BEARo3NI.js` equals the local build of the same tree, the `CreativeCard`
chunk md5 matches, healthz 200. The one live check still waiting on the owner: an analysis run on
`manual_AHXANj6Vjozp` on this build, then `check:reconciliation-ledger`.
