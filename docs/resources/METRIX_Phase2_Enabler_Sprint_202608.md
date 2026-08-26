# METRIX Phase 2 Enabler Sprint — Work Order (pre-design backend contracts)

> Written 2026-08-25 at Phase 1 close (see `METRIX_Phase1_Closeout_202608.md`). This is
> the execution work order for the sprint that must land BEFORE the Phase 3 design pass
> (`METRIX_Phase3_Design_Brief_202608.md`): roughly a third of that brief depends on data
> contracts that do not exist yet, and doing the visual pass first forces the UI to fake
> structure the server doesn't provide.

## Read these before touching code (in order)

1. This document.
2. `METRIX_Phase3_Design_Brief_202608.md` — the consumer of everything built here.
3. `CLAUDE.md` + `replit.md` — operating rules, commands, architecture decisions, gotchas.
4. `BUG_TRACKER.md` (B0 + BUG-02…BUG-26) and `METRIX_Phase1_Closeout_202608.md`.
5. `.agents/memory/MEMORY.md` index — check it before debugging anything from scratch.

## Standing rules (unchanged from Phase 1 — they worked)

- Feature branch → PR → CI → merge. Never push to main.
- `pnpm run typecheck` and the metrix suites stay green; run the owning suite after each change.
- Verify against the real AAFE account (`manual_9JGXU_AQJjxJ`), not fixtures.
- The honesty invariant is non-negotiable: never fabricate data, never suppress a
  true-positive warning; empty/pending states stay honest.
- OpenAPI (`lib/api-spec/openapi.yaml`) is the contract: edit spec → `pnpm --filter
  @workspace/api-spec run codegen` → never hand-edit `lib/*/src/generated/**`.
- The seed bundle is `additionalProperties: true` for nested payloads, but new TOP-LEVEL
  keys and new endpoints need spec declarations.
- Schema changes: idempotent additive DDL in `scripts/src/metrix-supabase/schema.sql`
  (and add any new table to the RLS enforcement array).

## E1 — Structured signals (brief §2, §4, §14, §18) · the critical path

**Current state:** signal cards live in Supabase `signal_cards`, flow through
`metrixSeedAssembly.ts` (`listen.signal_cards`) into `SignalView.tsx` (Listen) and
`AdPerformanceView.tsx` ("Signals worth acting on" / "All Signals"). Their analytical
content is PROSE — e.g. "underspend (critical): Spend recorded ($57.97) is 5.8% of the
committed ~$1,000 pilot budget…". The UI can only render sentences.

**Target contract** — each signal carries structured fields alongside (not instead of)
the existing prose, which becomes the disclosure-layer body:

```
headline        "Underspend"                     ← card face title
metric_value    "$57.97"                          ← the number that matters
metric_context  "of $1,000 committed"             ← its denominator/baseline
delta_pct       -94.2                             ← signed, when meaningful
implication     one sentence, ≤120 chars          ← card face interpretation
action          one imperative clause              ← "Restore delivery before optimizing"
evidence_ref    existing evidence link structure   ← unchanged
body            the current full prose             ← drawer/disclosure only
```

Emit from wherever cards are produced (importer rows keep `body`-only with a derivation
fallback; generation engine emits the full shape for new cards — extend its zod schema +
prompt). Type in `seedTypes.ts`; UI teams consume in Phase 3. Do NOT redesign the cards
here — contract only, with the card face falling back to today's rendering when
structured fields are absent (honesty: no fabricated headlines from regex-mangled prose).

**Status: landed, with one correction to the above.** The contract is in the schema
(`signal_cards`: `headline`, `metric_value`, `metric_context`, `delta_pct`, `implication`,
all nullable), in `cardShape` (which also exposes `action`, `evidence_ref` and `body` as the
contract's names for the existing `recommended_action`, `source_path` and `rationale`), and in
`seedTypes.ts`.

The correction: **there is no generation-engine producer of signal cards to extend.** The only
writer of `signal_cards` is the source-data importer (`import.ts`) — no analysis or generation
run emits one. So "generation engine emits the full shape for new cards" had no code to attach
to, and the zod schema and prompt were left alone rather than given a card shape that nothing
would ever call. The importer now passes structured fields through when a source package states
them; today's packages state prose only, so all five land NULL on all 8 live cards.

Also worth recording, because it shaped the contract: the worked example above
("underspend (critical): Spend recorded ($57.97) is 5.8% of the committed ~$1,000 pilot
budget…") is not a real signal — it comes from the design mockup
(`artifacts/mockup-sandbox/src/components/mockups/analysis-overview/SignalFeed.tsx`). Real cards
read like "C4E is the current checkout-depth control". The contract was built against the real
rows, and the mockup's shape remains what a future producer should aim at.

Nothing derives structure from prose, in either the importer or the seed. That is the whole
point of the `derivation fallback` phrasing above and is pinned by tests: a card with no
structured fields renders from `title`/`rationale` exactly as it does today.

## E2 — KPI analytical context (brief §9, §10)

**Current state:** `KpiTile.tsx` + `metricsCatalog.ts` render point-in-time values; the
summary endpoints return window totals with no comparison series. Per-day rollup rows
(`ad_performance` et al., date_start=date_end grain) already hold everything needed.

**Target:** the date-range summary response gains, per metric: `previous_period` value
(same-length window immediately preceding), `delta_pct`, and a `daily_series` (date,
value) for sparklines. Compute in `metrixSeedAssembly.ts`/summary assembly from existing
rows — no schema change. OpenAPI + codegen. Client stores them on the tile model;
rendering is Phase 3's job. Honesty rule: when the preceding window has no rows, the
fields are null — never zero.

**Status: already satisfied — no new work. The "Current state" above is stale.** It was written
at Phase 1 close; the Nocturne trend layer landed afterwards and covers all three asks:

- `previous_period` → `AnalysisSummaryResult.prior_totals`, computed by a real query over the
  equal-length preceding window and left `null` when that window holds no rows — the date-range
  path included (`analysisEngine.ts`, the `priorRows` block).
- `delta_pct` → `trendForMetric()` in `artifacts/metrix-iap/src/lib/data/summaryTrends.ts`.
- `daily_series` → `AnalysisSummaryResult.daily` plus `sparkSeriesForMetric()`.

Rendered today by `KpiTile.tsx` for `AdAccountOverview` and `AdPerformanceView`; 12 tests in
`summaryTrends.test.ts`. The honesty rule this section asks for is already the module's stated
contract: a delta exists only when both windows carry a real value (and, for ratios, a non-zero
prior), and a sparkline only where a metric has an exact per-day mapping — cost metrics get a
delta but no sparkline, because a day with zero results has no real CPA.

**One deliberate divergence, kept on purpose.** This section specifies computing `delta_pct` and
`daily_series` server-side and having the client "store them on the tile model". The
implementation derives both CLIENT-side from the totals the server already returns. That shape
stays: deriving at the point of use is the standing rule from handoff §3, and threading a
precomputed per-metric delta from the boundary out to every tile is exactly the distribution
pattern that rule exists to prevent. Nothing is lost — the server still owns the measured
values; only the arithmetic sits next to the component that renders it.

## E3 — Status-semantics normalization (brief §15)

**Current state:** at least four vocabularies reach the UI: signal severity
(act_now/watch/investigate + critical/medium), engine `confidence_level`
(incl. `validation_required`), reporting-cell statuses (`partial_reporting_cell`,
`zero_conversions`), tray workflow states.

**Target:** one mapping module (server-side, e.g. `lib/statusSemantics.ts`, mirrored in
the client) that projects every legacy value into the brief's three axes —
`priority: critical|important|informational`, `confidence: high|medium|low` (with
`validation_required` → low + a `needs_validation` boolean, so the honesty distinction
survives), `workflow: new|reviewed|saved|actioned`. Serve the normalized triple ALONGSIDE
the raw values (raw moves to the diagnostic layer in Phase 3). Do not rewrite stored
data; normalize at the read boundary.

**Status: landed, with the vocabulary corrected against live data.** The mapping is
`artifacts/api-server/src/lib/statusSemantics.ts`, normalizing at the READ boundary and served
alongside the raw values: signal cards gain `priority` / `confidence_level` / `needs_validation`
beside an untouched `impact` / `confidence`, and `iap.data_quality[]` gains `priority` beside its
`kind` so the act_now/watch/investigate split `AdPerformanceView` derives locally has one
definition to read instead of re-deriving. No stored data is rewritten.

The correction: the vocabulary above is not the live one. Read from the database, the real
values are `impact` = high | medium | **setup**; `confidence` = high | medium | directional |
**system** | validation_required plus free-text **compounds** ("high for registration,
directional for checkout"); `confidence_level` = high | medium | low | **hypothesis** |
**insufficient** | validation_required; flag `kind` = anomaly | quality_flag |
attribution_window | data_quality_score. `critical` never occurs as a stored value, and
`partial_reporting_cell` / `zero_conversions` are data fields in the bundles, not typed code.
A coverage test enumerates the real set and fails if any member stops resolving.

Three judgement calls worth stating, since each could have gone the dishonest way:

- **An unrecognized value normalizes to `null`, never to a default bucket.** Bucketing an
  unknown status as "informational" asserts a priority nobody measured, and a surface reading
  null can fall back to the raw string while one reading a guess cannot tell it was guessed.
- **A compound resolves to its WEAKEST component.** Overstating confidence is the failure that
  costs a user money; understating it costs them a second look.
- **`system` is not forced onto the confidence scale** — it is a provenance marker on setup
  cards, not a confidence claim — and reporting-cell flags resolve on the confidence axis with
  priority left null, because calling `zero_conversions` "critical" would invent an urgency the
  product has never assigned it.

The brief's `workflow: new|reviewed|saved|actioned` axis was NOT added. The live tray vocabulary
is `open | done | archived` (`trayStore.ts`), it is client-only and localStorage-backed, and it
never crosses the read boundary this module sits on — so there is nothing for the server to
normalize. Mapping it here would have been a mapping with no caller.

## E4 — Account display names (brief §6)

**Current state:** manual accounts are created with names like "Fresh Import
1786839868960" and `ad_accounts.name` has no edit path; page titles inherit it.

**Target:** `PATCH /api/metrix/accounts/:id` accepting `{ name }` (admin or granted
user; validate non-empty ≤80 chars; invalidate seed cache), plus an inline rename
affordance where the account name renders (Settings and/or account header — minimal UI,
Phase 3 restyles it). Generated IDs remain in metadata. Also sweep title surfaces to
prefer the display name (the `GEN_ICP_*` equivalent for ICP titles already has
`compactIcpName` — extend its use to page/drawer titles).

**Status: landed.** `PATCH /metrix/accounts/{accountId}/name` (declared in `openapi.yaml`,
codegen clean), admin-or-granted, trims and validates non-empty ≤80, invalidates the seed cache —
a rename that does not bust the cache reads as a rename that failed, since the seed carries the
name onto every page title. The inline affordance is an "Account name" card in Settings →
General, which shows the account's generated id beside the field: only the DISPLAY name moves,
and the id stays the stable key every other table joins on. Component-tested at the rendered
surface (not just the validation arithmetic) and regression-proven.

## E5 — Structural (do here, before Phase 3 multiplies contact surface)

- Split `routes/metrix.ts` (~2.7K lines) into routers: uploads/imports, creatives,
  accounts, admin. Pure move — no behavior change, route tests stay green.

  **Status: landed.** Seven routers behind `routes/metrix/index.ts` (admin, seed, accounts,
  uploads, creatives, waitlist, workspaces), each a contiguous run of the original file, mounted
  in the original order — several paths depend on that order (`…/manual-imports/uploads` must
  still be tried before `…/manual-imports/:importId`). Verified as a move rather than a rewrite
  two ways: the mounted route table is IDENTICAL before and after (all 58 routes, same methods,
  paths, registration order and per-route handler counts, enumerated from the real Express stack),
  and the non-import code lines match as a multiset (2,983 in, 2,983 out). Only 10 of the 41
  module-level helpers are reached by more than one router and stayed in `shared.ts`; the other
  31 moved to their single owner, resolved by transitive reachability.
- Retention policy for processed performance files (product decision required first:
  suggested keep-last-N-per-slot with an explicit purge action, never silent deletion).

## What Phase 3 then inherits (already built, do not rebuild)

- Progressive-disclosure primitives: `DetailReveal`, `DenseText`, `deriveLabel`
  (`shared.tsx` — its rulebook comment is authoritative), `InfoTooltip`.
- Typography roles (`typography.ts` TYPE.*) enforced by the ratcheting
  `check:disclosure-rulebook` CI gate — the brief's §11 is executed by tightening this.
- `warningSeverity.ts` classifier (staging popup + run-history panel).
- 3-state signal badges, coverage banners, honest empty-reason plumbing.
- `normalize.ts` (splitTitle, parseHierarchyRef, fmtMetric, normalizeConfidence,
  extractVariableCodes, compactIcpName).

## Definition of done

E1–E4 merged with OpenAPI/codegen clean, typecheck + full suites green, verified against
live AAFE data (structured fields visible in the seed payload; KPI deltas match hand
computation for one window; every legacy status value maps; an account renamed
end-to-end). E5 route split merged with zero route-behavior diffs. Then — and only
then — open the Phase 3 design pass against `METRIX_Phase3_Design_Brief_202608.md`.
