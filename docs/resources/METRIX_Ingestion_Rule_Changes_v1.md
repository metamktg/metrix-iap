# METRIX Manual Import — Required Ingestion Rule Changes

**Status:** advisory, derived from a correctly-formed export pair. Five rules change what the
importer and the IAP contract expect.

**Evidence basis:** a matched Meta Ads Reporting pivot pair for one account, same window
(2026-01-01 → 2026-08-15, 195 days):

| File | Class | Rows | Ads | Campaigns | Spend | Impressions |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `king.csv` | Demographic + Text (`Gender`, `Age`, `Text`) | 17,116 | 69 | 7 | $17,805.35 | 1,490,366 |
| `kingDEVi.csv` | Device + Placement | 11,924 | 101 | 10 | $22,379.94 | 2,357,851 |

Both carry an identical 104-column metric set and no `Conversion device`. Both parse cleanly under
the current parser; the `Device platform` → `Impression device` alias fires as intended and the
delivery coverage gate passes.

---

## Rule 1 — The two exports are not peers. Designate one authoritative ledger.

The demographic export is a **strict subset** of the device export (every demo `Ad ID` appears in the
device file; 32 ads and 3 campaigns appear only in device). It carries **79.6% of account spend**.

| Campaign | Demo | Device | Coverage |
| --- | ---: | ---: | ---: |
| KOV1_ASC_DEC25_SCALE_V2 - Copy | 14,457 | 17,509 | 82.6% |
| KOV1_ASC_DEC25_SCALE_V2 | 2,212 | 2,467 | 89.7% |
| ENGAGEMENT - JAN26 | 946 | 1,114 | 84.9% |
| AWARENESS - DEC25 | 0 | 433 | **0.0%** |
| CATALOG T SHIRTS | 0 | 264 | **0.0%** |
| New Awareness Campaign | 94 | 195 | 48.1% |
| KOV \| Prospecting \| DTC \| Aug. 2026 | 43 | 182 | 23.9% |
| New Sales Campaign | 0 | 160 | **0.0%** |
| KOV2_ASC_JAN26_CUS_V1 | 53 | 56 | 93.6% |
| **Total** | **17,805** | **22,380** | **79.6%** |

This is Meta's demographic-breakdown suppression (privacy thresholds on small segments) plus
campaign types that do not support the breakdown at all — catalog and awareness campaigns return
nothing.

**Rule:** account totals come from a single designated source, never from a demographic breakdown.
Preference order: ad-summary export > device/placement export > demographic export. A demographic
facet is a **lens**, not a ledger. Summing the two files together yields $40,185 against an account
that spent $22,380 — 180% of reality.

**Implication for the capability ledger:** coverage is a per-facet property. The demographic facet
must state its own coverage against the authoritative total ("audience analysis covers 79.6% of
spend; 3 campaigns excluded by Meta") rather than being presented as complete.

---

## Rule 2 — `Results` must never be summed.

`Results` is polymorphic: its unit is defined by `Result type` on the same row. In the device export:

| Result type | Rows | `Results` sum |
| --- | ---: | ---: |
| Reach | 1,012 | 536,817 |
| Post engagements | 1,871 | 226,839 |
| Website purchases | 260 | 325 |

The column total of 763,981 is three incompatible units added together. Any aggregate over `Results`
without partitioning by `Result type` is meaningless, and applying cohort intent-score weights to it
compounds the error.

**Rule:** partition `Results` by `Result type` before any aggregation, and prefer the explicit event
columns (`Purchases`, `Adds to cart`, `Checkouts initiated`, `Link clicks`) as the primary funnel
source. `Results`/`Result type` become a documented fallback for objectives whose event is not
otherwise exposed — never the primary path for a cohort whose events are.

---

## Rule 3 — Every derived column can be dropped, with a gain in precision.

Recomputing each derived column from primitives and comparing against Meta's own values, across all
11,924 device rows:

| Derived column | Rows compared | Within 0.5% | Max error |
| --- | ---: | ---: | ---: |
| CPM | 11,915 | 100.0% | 0.00% |
| CPC (cost per link click) | 3,004 | 100.0% | 0.00% |
| CPC (all) | 4,026 | 100.0% | 0.00% |
| CTR (all) | 11,915 | 100.0% | 0.00% |
| CTR (link) | 3,004 | 100.0% | 0.00% |
| Frequency | 11,915 | 100.0% | 0.00% |
| Cost per purchase | 261 | 100.0% | 0.00% |
| Purchase ROAS | 259 | 100.0% | 0.00% |
| Cost per add to cart | 570 | 100.0% | 0.00% |

Exact-match rates run 41–100%, and every mismatch is Meta's own 2-decimal display rounding. Our
computation is strictly more precise than the exported value.

**Rule:** derived columns are never ingested as truth and never requested from the user. This is
proven, not assumed — the reconciliation above is the evidence, and it should ship as a regression
test so the claim stays true.

---

## Rule 4 — Video metrics are unavailable in the demographic facet.

The demographic export reports 13 columns present-but-empty on every row, including the entire video
block: `Video plays`, `ThruPlays`, `Video average play time`, and all five quartiles. Only
`3-second video plays` carries data (52.3%). The device export has all of them populated
(`Video plays` 1,233,667; `ThruPlays` 129,994).

**Rule:** video and view-through creative signal sources from the device/placement facet only. The
deconstruction and creative-scan layers must not treat a demographic-only account as having video
data, and the capability ledger must say so rather than reporting zeroes.

---

## Rule 5 — `Landing page views` is absent from both exports.

Both files lack it, and it is a `BASE_METRICS` member. It matters because the bundle-prep workflow
defines `atc_to_checkout_rate` and `purchases_rate_per_landing_page_views` against it, and the
lead_gen/service funnels lean on it as the click-to-site bridge.

**Rule:** either add `Landing page views` to the issued export recipe (it is available in Meta
Reporting), or formally drop the landing-page-based funnel rates from the contract and compute the
funnel from `Link clicks` alone. Currently the contract asks for a rate whose denominator the
standard export does not supply — that gap should be closed by decision, not left to a null.

---

## What does not change

- The delivery coverage gate, the honest column-vs-row errors, and the derived-column policy shipped
  in P0 all behave correctly against this pair.
- The `Device platform` → `Impression device` alias resolves as intended.
- `Adds of payment info` is now captured (216 events were previously dropped silently).
- Facets are already held in separate buckets by the analysis engine (`demoRows`, `placementRows`,
  `summaryRows`) and written to separate tables, so Rule 1 is a presentation-layer and
  totals-selection rule rather than an aggregation bug in the engine.

## Open item

Whether the presentation layer sources account totals from a single designated facet has not been
traced end to end. Rule 1 must be enforced wherever "account spend" is computed for display; that
path needs verification before P3 ships.
