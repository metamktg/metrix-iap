# METRIX — Carry-Forward Register (E6)

**Status: reconciled against live code on 2026-08-26.** The original register was written
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
| Efficacy (F) | F-c | F-a, F-b, F-d |
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
| F-a | `[open]` | **`ad_performance.extra_metrics` and `ad_creative_metadata` are written and read by nothing.** Confirmed: written at `analysisEngine.ts:1347-1348` (and five more sites for the breakdown tables), and the only other mentions in the entire repo are the `schema.sql` column definitions. `ad_creative_metadata` carries the ad's **body text, headline, CTA type, link destination and link caption** (`CREATIVE_METADATA_COLUMNS`, `iapCsvSpec.ts:17`). This is already-paid-for creative intelligence sitting unused, and it is the single best value-per-effort item on this register for the Phase 3 brief's "make the intelligence feel deeper" mandate — the Creative dialog's Overview tab is the obvious consumer. Source: Audit §5.2, re-confirmed 2026-08-26. |
| F-b | `[open]` | **`ad_performance.reach` / `clicks_all` are dropped from per-ad stats** (bottom-line event totals only), so no ad-level surface can show them. Same class as F-a. Source: Audit §5.2. |
| F-c | `[shipped]` | `CreativeExpandDialog` ASSIGNED `maleCpa`/`maleCtr` from each row's own rate inside a loop over the bucket's rows, so the last row won and which ad that was depended on iteration order. The bucket now accumulates impressions and link clicks alongside spend and results, and derives both rates once — null on a zero denominator rather than asserting $0.00. |
| F-d | `[open]` | **`ConceptFamilyView` re-derives concept CPA/CVR independently of `concept_performance`'s blends.** The rows[0] CTR defect shipped (BUG-13); the broader re-derivation is untouched. Consolidating onto one helper is what prevents the next rows[0]-class bug — `lib/placement-rollup.ts` is the shape to copy. Source: Audit §5.2. |

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
