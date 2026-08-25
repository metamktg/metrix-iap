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

### F-03 — `reconciliation` is declared **required** in the API contract with zero writers · **open, needs the BUG-14 product call**

Sharper than BUG-14 recorded it. `import_metric_reconciliation` exists in `schema.sql`
with no writer anywhere; `runShape` (`analysisEngine.ts:184`) omits the field; yet
`openapi.yaml:4463` documents it as an active cross-check ("Cross-checks the demographic
export's totals against the placement export's totals for this run") and lists it under
`required`, so generated Zod (`lib/api-zod`) and the generated client type both assert a
field that never arrives. `AnalysisHistoryView` survives only because it guards with
`run.reconciliation ?? []`; the type invites an unguarded `.map()` that would throw.

Not fixed here because the fix depends on the same product call BUG-14 already flagged, and
the two options diverge: implement the writer (the over-baseline check in
`computeDataCoverage` is most of the logic already) and the field stays required, or delete
the block and the field. **Either way the current spec is wrong** — it describes a check
that does not run. This should be settled in the E1–E4 sprint, where the OpenAPI contract is
already being edited.

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
- **`sumInRange` still coalesces.** `date-scope.ts:67` returns `number` and folds missing
  values with `?? 0`, so an all-null column sums to a measured-looking `0`. This is
  BUG-11's documented open half and remains the largest unresolved honesty-invariant gap;
  it needs the single aggregation-policy decision mapped in
  `METRIX_Data_Consistency_Audit_Phase1.md` §5.3, not another site-by-site patch.

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
