# Result events and intent classes

Status: implemented 2026-09-03. Owner direction: awareness campaigns and purchase-intent events
serve different strategic purposes and are never weighted against each other. Awareness is read
on communication signals and gap analysis; a purchase-intent event is read on its own
cost-per-result scale. The reader gets both blended results and each event on its own.

This document is the contract. The change log (`docs/resources/ARCHITECTURE_CHANGE_LOG.md`)
records what was done and when; `CARRY_FORWARD_REGISTER.md` §14 records the decisions.

## 1. Vocabulary

**Result type.** Meta's own string, per ad, naming the event the ad was optimised towards
("Website purchases", "Leads (form)", "ThruPlays", "Link clicks", "onb_initiate_checkout").
It arrives on every export row and is never rewritten. Rows with no result type fold under
`unknown`, the engine's long-standing name for that data-quality gap; they are kept visible
everywhere, never dropped.

**Event key.** The taxonomy's canonical name for a result type: `purchase`, `add_to_cart`,
`initiate_checkout`, `add_payment_info`, `add_to_wishlist`, `lead`, `registration`,
`subscription`, `trial`, `app_install`, `app_activation`, `appointment`,
`messaging_conversation`, `contact`, `application`, `donation`, `call`, `store_visit`,
`landing_page_view`, `link_click`, `content_view`, `search`, `click`, `thruplay`,
`video_view`, `post_engagement`, `page_like`, `profile_visit`, `event_response`, `ad_recall`,
`reach`, `impressions`, plus `custom` (recognised as an event but not placeable) and `unknown`.

**Intent class.** `conversion` (purchase-intent events), `consideration` (traffic events),
`awareness` (reach and attention events). `unknown` and `custom` have no class.

**Scale.** `cost_per_result` for conversion and consideration; `communication` for awareness.
An event with no class has no scale and receives no verdict.

**Stage.** Within conversion: `terminal` (purchase, lead, registration, subscription, trial,
install, activation, appointment, conversation, contact, application, donation, call, store
visit) or `intermediate` (add to cart, checkout initiated, payment info, wishlist).

The classification is a first-match regex table over the result type with underscores read
as spaces (`resultEvents.ts`). Order is load-bearing where one Meta name contains another.

## 2. Rules

1. **Derived from data only.** Nothing is asked of an operator, nothing is a toggle, nothing
   becomes a property of the account — the same bound as the derived objective (owner decision
   2026-09-01). The objective decides which terminal metric a run reports; the intent class
   decides which scale a row is judged on and which rows may be ranked beside it.
2. **Every aggregate is one event.** Every rollup the engine writes carries the result type in
   its key. Rows written before the split carry null and are read as "not split", never as
   "another event".
3. **Comparability is the same event.** Two rows may be ranked against each other only when
   they carry the same result type. Unplaced rows never compare, even with each other.
4. **Blending is terminal conversions only, two or more.** "All conversions" sums purchases and
   leads; it never sums a checkout into the purchase it precedes, and it never sums reach,
   impressions or ThruPlays, which overlap by construction. Delivery (spend, impressions,
   clicks) is event-agnostic and sums across every ad.
5. **Awareness is judged on communication signals.** CPM, link click-through, CTR (all),
   frequency, cost per reach and the event's own rate (results ÷ impressions). A gap is a signal
   trailing the awareness class's own median by more than 20%, direction-aware; a class of one
   has no gap. Cost per result is a fact of an awareness row (stored) but never its verdict.
6. **Baselines match the row.** A concept's lift is against its book's baseline for the SAME
   event: cost-per-result classes on CPA, awareness on link click-through (`lift_basis`).
   `buying_intent_score` is null for awareness rows.
7. **The reader gets both.** The account's KPI catalogs carry per-event tiles (count, and cost
   per result or own rate by scale) and one blended conversion pair (count, cost) that follows
   rule 4. The analysis surfaces read one account-level result scope at a time.

## 3. Where it lives

| Layer | Module | What it holds |
|---|---|---|
| Taxonomy | `artifacts/api-server/src/lib/resultEvents.ts` (canonical) and the byte-identical `artifacts/metrix-iap/src/lib/resultEvents.ts` (`scripts/src/result-events-drift.test.ts`) | Classification, intent classes, comparability, partition, blendable events, communication signals, gap analysis |
| Schema | `scripts/src/metrix-supabase/schema.sql` (result-event grain block) | `result_type` / `intent_class` on `concept_`, `demographic_`, `placement_`, `platform_`, `device_performance`, the two signal tables and `variable_performance`; `impressions` and `lift_basis` on `concept_performance`; unique keys widened |
| Engine | `analysisEngine.ts` — `rowResultType`, bucket keys, `buildConceptPerformanceRows`, `buildVariablePerformanceRows`, summary builders, `aggregateDailySeries` | Rule 2, rule 6 |
| Components | `creativeComponents.ts` (`scope`) | Result math over the dominant class only; delivery over every ad |
| Evidence | `variableEvidence.ts` | Interaction-index denominator per result type |
| Seed | `metrixSeedAssembly.ts` — `buildResultEventSummary` | `result_events[]`, `intent_summary`, grain fields on `concept_rollup[]` |
| API | `lib/api-spec/openapi.yaml` | `result_type` + `intent_class` on summary rows; `results_by_event` on day rows and daily points |
| Client scope | `lib/result-scope.ts`, `hooks/useResultScope.ts`, `components/analysis/ResultScopeBar.tsx` | Rule 4 and rule 7's one lens; `collapseCellRows`, `scopeRollupRows` |
| Catalogs | `lib/data/metricsCatalog.ts` | Blended conversions, own-rate tiles, scale-aware Library and variable catalogs |

## 4. What a re-run changes

Rows from before this change carry null `result_type`. A re-run writes the account's rollups
at event grain; until then the surfaces read the pre-split rows as they always did, with the
scope bar offering the events the account's ad rows carry.

## 5. Open

- Report export and the deep-dive "Cost / result" still print one blended figure with a
  multi-type caption; they should print per event. Register §14.
- `creative-evidence.ts` synthesises a cell row from ads and stamps the first ad's result type
  on a total summed over all of them. It should partition by event. Register §14.
