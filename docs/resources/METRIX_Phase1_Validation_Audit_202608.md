# METRIX Phase 1 → Phase 2 Validation Audit (buffer session, 2026-08-25)

Independent verification of the Phase 1 stabilization work before the Phase 2 enabler
sprint begins. Context for *why*, not specification for *what* — per the `docs/resources`
convention. Companion to `METRIX_Phase1_Closeout_202608.md` (the outgoing claim) and
`METRIX_Phase2_Enabler_Sprint_202608.md` (the incoming work order).

**Purpose.** The Phase 1 → Phase 2 handoff asserts a long list of shipped fixes. This pass
asks a different question than the handoff answers: not "was it built" but "does it reach
every surface that needed it". Symbol presence proves a fix exists; it does not prove the
fix is applied wherever the defect could recur.

---

## 0. Baseline — the handoff's own claims hold

Verified from a clean clone of `main` at `5494381`:

| Check | Result |
|---|---|
| `pnpm run typecheck` (all packages) | green |
| Metrix IAP vitest suite | 114 files / 1,656 tests green |
| CI-gated api-server unit suites | 5 files / 59 tests green |
| `check:disclosure-rulebook` | **0 violations**, at baseline |
| Handoff bundle vs committed `docs/resources/` | identical except `BUG_TRACKER.md`, where the repo is one entry AHEAD (BUG-27) |

Every named artifact from B0 and BUG-02…BUG-27 was located in the tree and inspected —
`normalizeDayValues`, `buildAdPerformanceRows` guards, `computeDataCoverage`,
`COVERAGE_THRESHOLD_PCT`, `detectAggregateAdSummary`/`summaryMetadataOnly`,
`MIN_CONTAINMENT_LENGTH`, `appendRowsCrossFileDeduped`, `DERIVED_OR_IRRELEVANT`,
`CONFLICTING_CONCEPT_TOKENS`, `verifyAnalysisRunCompleteness`, `manual_import_chunks`,
`publicErrorMessage`, `selectWorksheet` scoring, `selectAll(columns)`, `forceStreaming`,
`findColumnInHeader` currency tolerance. The claimed integration tests
(`manualAnalysisRerunIdempotency`, `manualAnalysisReuploadIsolation`) exist under
`routes/__tests__/`. **No claim in the tracker was found to be fabricated, and no
regression was found in what was built.** The Phase 1 engine and parser work is sound.

Items the tracker itself carries as open were re-confirmed still open and correctly
triaged: BUG-08 (restage discoverability), BUG-11's aggregation-policy half, BUG-14
(dead integrity block), BUG-15 (Alerts lineage).

## 1. What this pass found — propagation, not construction

Three defects, all of the same shape: a Phase 1 fix was **threaded through call sites by
hand**, and the threading is incomplete. Each was correct where it was applied and absent
elsewhere, so the same data renders honestly on one screen and confidently on another.

### F-01 — Coverage gating reached 2 of 5 drill-down surfaces, and never the export · **fixed**

`SegmentDrilldownModal` takes `demoCoverage` as an optional prop that gates signal
classification (BUG-02's stated resolution: "suppresses Signal/Low Signal classification
whenever demographic joined-spend coverage < 90%"). Five call sites open that modal.
**Two passed coverage** (AudienceView, AvatarsView). **Three did not** — Analysis Overview
(`AnalysisOverview.tsx:606`), IAP Library creative-card demographics tab
(`IapLibraryView.tsx:1244`), and the variable drill-down
(`VariableDrilldownModal.tsx:262`) — so on AAFE, whose demographic export covers ~2% of
account spend, the *same segment* showed "insufficient join coverage" when opened from
Audience and an unqualified read when opened from anywhere else.

`lib/reportExport.ts` was worse: `buildSegmentComparisonSection` called
`computeSegmentDrilldown` with no coverage argument at all, so segment numbers could leave
the product in a client-facing document with no coverage caveat. (The section is currently
only reachable when a caller passes `segmentComparison`, which no UI does yet — the hole
was latent, not live. It would have gone live the moment the section got wired.)

**Fix:** `hooks/useDemographicCoverage.ts` resolves the scoped account's run-level coverage
once; `SegmentDrilldownModal` reads it itself and treats the prop as an override (AudienceView
still overrides with its tighter date-preset summary). `buildReportModel` gains an explicit
`demoCoverage` option threaded into the comparison section. Reading coverage where it is
*used* rather than passing it in removes the class: a new drill-down call site cannot omit
what it never has to supply. The export's warning prefix now also names the state it is
reporting — calling a 2%-coverage read "low signal" understated it.

### F-02 — Creative empty-state reasons reached 3 of 10 call sites · **fixed**

BUG-03 §1.4 gave each creative popup tab a cause-specific empty state (never imported vs
account-level grain vs no rows joined for this cell), replacing a generic message that told
users to import a file they had already imported. Of ten `<CreativeCard>` call sites, three
passed the reasons; the other seven — Concept family, Variable drill-down, Creative Scan,
Brief builder, and three further IAP Library rows — still rendered the original misleading
copy. **No call site passed `funnelEmptyReason`**, so the Funnel tab fell back to generic
text everywhere.

**Fix:** the derivation moved into `CreativeExpandDialog`, which computes all three reasons
from the scoped account's analysis data keyed on the card's cell code; explicit props still
win. The rules stay pure in `lib/creative-empty-reasons.ts`
(`creativeEmptyReasonsFor`), unit-tested without React.

### F-03 — `reconciliation` was declared **required** in the API contract with zero writers · **resolved**

Sharper than BUG-14 recorded it. `import_metric_reconciliation` exists in `schema.sql`
with no writer anywhere; `runShape` (`analysisEngine.ts:184`) omits the field; yet
`openapi.yaml:4463` documents it as an active cross-check ("Cross-checks the demographic
export's totals against the placement export's totals for this run") and lists it under
`required`, so generated Zod (`lib/api-zod`) and the generated client type both assert a
field that never arrives. `AnalysisHistoryView` survives only because it guards with
`run.reconciliation ?? []`; the type invites an unguarded `.map()` that would throw.

**Resolved** (owner decision, second pass): the contract was made honest rather than the
writer implemented or the block deleted — the smallest reversible change, and it does not
preempt building the check later. `reconciliation` left `required`, its description now
states plainly that nothing populates it and names the integrity check that DOES run today
(the over-baseline guard in `computeDataCoverage`). Codegen regenerated, so the client's
guard is type-correct rather than incidentally safe; the UI block is kept and self-hides.

A scripted sweep of all 139 OpenAPI schemas for required non-nullable fields with no server
writer confirmed `ReconciliationRow` was the **only genuine orphan in the entire contract** —
the other eleven hits were shorthand-property or client→server input false positives, each
checked by hand.

## 2. Handoff corrections for the Phase 2 sprint

- **E5's scope is understated.** The work order sizes the split off `routes/metrix.ts` at
  "~2.7K lines". It is now **3,636** — Phase 1's chunked-upload, dedup-guard and
  error-shaping work added ~900 lines to the exact file E5 wants split. (Analysis,
  generation and stage-status routers are already separate; the remainder is uploads,
  creatives, accounts and admin.)
- **E3 has no starting point.** No `statusSemantics` module exists in any form — E3 is
  greenfield, not a normalization of something already partly built.
- **The disclosure-rulebook gate is ready to harden.** CI still carries
  `continue-on-error: true` with a comment describing "~170 pre-existing violations"; the
  check now reports **zero** across 127 module page files. The comment is stale and the
  gate can be flipped to blocking — which is how the Phase 3 brief's §11 gets enforced
  rather than re-litigated per PR.
- **`sumInRange` coalescing — resolved.** It returned `number` and folded missing values
  with `?? 0`, so an all-null column summed to a measured-looking `0`. Owner decision:
  null unless every contributing row carries the value, matching `segment-analytics`'
  existing `sumStrict` rather than adding a second convention. The type change then did the
  auditing for us — it surfaced `MetricResultEvent.results`/`.spend` as non-nullable (so
  `cpa_blended` and `cvr` could be derived from a partial sum that looked complete) and two
  further `?? 0` fabrications in `AdPerformanceView`. All fixed.

## 3. The pattern worth carrying into Phase 3

All three findings share one mechanism: **an honesty primitive was built correctly, then
distributed by hand.** Phase 1's engine-side work does not have this problem — coverage,
dedup and normalization are computed once at the boundary and cannot be bypassed. The
client-side honesty layer was retrofitted onto existing call sites instead, and hand-threading
a prop through five or ten sites reliably misses some.

Phase 3 will multiply these call sites. The durable rule: **a surface that renders a number
should read its own qualifications, not receive them.** Both fixes here follow it — the
drill-down reads coverage, the dialog derives its own empty reasons — and both are now
pinned by tests that do not depend on any particular call site existing.


---

# Second pass (same session) — independent investigation

The first pass asked whether Phase 1's fixes reached every surface. This pass went after
everything else: the ingestion → warning → UI path end to end, the API contract as a whole,
and the verification apparatus itself. Four more defects, all now fixed.

## F-04 — The one column cascade that never got the warning-fold policy · **fixed**

`iapCsvParser` has four column-resolution cascades. Three fold deterministic matches
(slug / case-insensitive / curated alias / currency-suffix) into a single "matched
automatically — no action needed" line. The **creative-metadata cascade** — which runs only
for `ad_summary` exports, which is precisely why BUG-20 and BUG-27 both missed it — emitted
one warning per column unconditionally. Meta's own ad-level exports label those columns
"Body text", "Headline" and "CTA", all curated aliases, so **every real ad_summary import
carried three warnings the user could neither act on nor verify.**

The same cascade also ran ~200 lines after `unmappedHeaders` was computed, so its
successfully-mapped headers were still unclaimed when the unknown-column pass ran — eligible
to be reported as "Unrecognised column … may correspond to expected column X" — and any fold
it contributed would have incremented a counter already reported, dropping the mapping from
the summary rather than demoting it.

Moved beside the other cascades and given the same fold. Measured on the real AAFE Ad Summary
header shape: **6 warnings → 3**, fold count 1 → 4 with nothing dropped, both survivors
informational. `warningSeverity` also gained `(via currency match)`, which was missing from
the notice patterns.

## F-05 — Alerts never showed the flags it documents as its source · **fixed**

`ListenCommandCenter` advertises the Alerts lineage as `iap.data_quality[]`; `AlertsView`
rendered only `data_caveat`. Every analysis-run quality finding — including
`cross_export_mismatch`, the cross-export integrity trigger — reached the Ad Performance
signal tiers and nowhere else. **The page a user opens to see what needs attention showed
none of them**, and the "Active alerts" count excluded them. This was BUG-15, carried as open
since Phase 1. Flag presentation is now shared (`lib/dataQualityFlags.ts`) and Alerts has a
data-quality section that counts into the totals.

Worth noting: the repo's own `inpage-nav-targets` guard caught a wrong cross-link target on
the first attempt. The existing test apparatus is good, where it runs — which is the next
finding.

## F-06 — CI gated 59 of 288 available secret-free server tests · **fixed**

CI excluded the api-server suite wholesale as "needs live secrets" and hand-picked five files
back in. Running each of the 38 files individually with no environment set shows **16 pass
secret-free** (288 tests). Eleven were therefore completely unprotected, including
`iapCsvMapping` (73 tests — the column-mapping cascade behind the entire BUG-20/21/27 warning
class), `metrixSeedAssembly` (the BUG-25 fix that resolved a production outage),
`iapCsvParser`, `objectiveCoverage` and `analysisCsvClassCheck`.

This is why F-04 survived three warning-noise passes: the code that produces those warnings
had no gate. The CI step now runs all 16, with the inclusion criterion recorded in the
workflow so the list stays correct as suites are added.

## F-07 — Refetching KPI tiles rendered the same dash as a missing value · **fixed**

`KpiValue` rendered `—` at reduced opacity while a refetch was in flight — the same glyph a
null renders. A slow request and "this number does not exist" were the same picture, and the
honest-null convention loses its meaning when loading borrows its glyph. Now a pulsing
`aria-busy` bar; the dash means exactly one thing.

## Verification state at close

| Gate | Result |
|---|---|
| `pnpm run typecheck` (all packages) | green |
| Metrix IAP vitest | 114 files / **1,672** tests green |
| API server (CI-gated set) | 18 files / **288** tests green (was 59) |
| `check:api-codegen-drift` | green |
| Three contrast gates | green |
| `check:disclosure-rulebook` | 0 violations |
| Production build (`vite build`) | succeeds |

The **build smoke** fails in a sandboxed container only: it launches a pinned Chromium
revision (1228) the image does not carry (it has 1194). CI installs the pinned revision
explicitly, and the underlying `vite build` succeeds here. Not a code defect.

## What is left

Nothing from Phase 1 is now open. The remaining backlog is deliberate scope, not defects:
BUG-08 (restage discoverability, Phase 2 polish), the `routes/metrix.ts` split (E5 — now
3,636 lines), retention policy for processed performance files, and the Optimization Loop
build. The disclosure-rulebook gate can also be flipped from advisory to blocking: it has
been at zero for the whole session and CI's "~170 violations" comment is stale.
