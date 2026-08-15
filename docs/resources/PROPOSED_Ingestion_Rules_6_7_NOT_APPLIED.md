# PROPOSED — Ingestion Rules 5 (resolution), 6 and 7

> **STATUS: PROPOSAL. NOT APPLIED.**
> No source file has been changed. `iapCsvSpec.ts`, `iapCsvParser.ts` and the test suite are
> untouched on this branch. This document exists to be reviewed and argued with before any code is
> written. Nothing here ships without explicit sign-off.

**Companions:** `METRIX_Ingestion_Rule_Changes_v1.md` (Rules 1–5, already committed as advisory),
`METRIX_Manual_Import_Build_Spec_v1.md`.

**Measurement basis:** the Device+Placement export, 11,924 rows, 101 ads, 195 days
(2026-01-01 → 2026-08-15).

---

## Rule 5 — RESOLVED by decision

`Landing page views` is **added to the issued export recipe**, conditionally.

It is the only metric that measures *arrival* rather than *intent*, and it closes the funnel gap
between `Link clicks` and `Adds to cart`. `Link clicks − Landing page views` is click-to-load
drop-off — site speed, bounce, broken destination — a diagnosis currently impossible to make.

It is pixel-dependent and will return empty for accounts without one. Therefore:

- Requested in every recipe, **required in none**.
- When populated, it is the denominator for `purchases_rate_per_landing_page_views` and the arrival
  rung of the intent funnel.
- When empty, the funnel falls back to `link_clicks` as denominator and the capability ledger states
  **which denominator was used**. It never silently substitutes.

The contract rates depending on it stay in the bundle vocabulary as computed values, emitted as null
with a coverage note rather than dropped from the schema.

---

## Rule 6 — The click block is three columns, not seven

| Metric | Total | vs Link clicks | Row agreement with Link clicks |
| --- | ---: | ---: | --- |
| Clicks (all) | 47,984 | 236.2% | — |
| Unique clicks (all) | 43,375 | 213.5% | — |
| Link clicks | 20,312 | — | — |
| Unique link clicks | 18,949 | 93.3% | — |
| Outbound clicks | 18,500 | 91.1% | **83.9% exactly equal**, 90.6% within 2% |
| Unique outbound clicks | 17,186 | 84.6% | — |
| Landing page views | absent | — | — |

### Keep

**`Link clicks`** — the `click` stage in all four cohorts and the denominator in the bundle-prep
formulas (`overall_cvr = purchases / link_clicks`, `click_to_atc_rate = add_to_cart / link_clicks`).
Non-negotiable.

**`Clicks (all)`** — retained but reclassified. It is **not** a funnel metric: 57.7% of it is not
link clicks at all, but likes, comments, shares, profile taps and image expands. Its value is
diagnostic — high `Clicks (all)` against low `Link clicks` is the engagement-bait signature, a real
IAP finding that is unobtainable without it. It is the `CTR (all)` denominator and the
attention-breadth measure, and must never be used as a funnel rung.

**`Landing page views`** — per Rule 5.

### Drop

**`Outbound clicks`** — 91.1% of link clicks, identical on 83.9% of rows. It does not change a
decision, so it does not earn a column in a minimum set. The 8.9% divergence is real (clicks
resolving to Instant Experience, Shops or profile rather than the site) and is diagnosable from
placement data instead.

> **Cohort-conditional exception.** For accounts whose destinations are predominantly on-Meta
> (Instant Experience, Shops, Click-to-Message), `Link clicks − Outbound clicks` *is* the on-Meta
> leakage signal and `Outbound clicks` enters the recipe. Detected from `call_to_action_type` /
> destination, never asked of the user.

**`Unique clicks (all)`, `Unique link clicks`, `Unique outbound clicks`** — dropped on **correctness**
grounds, not economy. These are people, not events. Dividing a person-count into an event-count
(`purchases / unique_link_clicks`) mixes units and yields a figure with no defensible meaning. Their
only legitimate use is frequency-style analysis, which `Reach` and `Frequency` already serve.

### The governing rule

Redundancy is not "similar totals" — it is **"does it change a decision."** `Outbound clicks` at 91%
of link clicks never changes one. `Clicks (all)` at 236% changes one constantly. Correlation is not
the test; decision-impact is. This governs any future column proposed for the contract.

---

## Rule 7 — `BASE_METRICS` still contains four computable metrics

The P0 pass moved 22 derivable columns out of the objective groups but **did not audit
`BASE_METRICS` itself**. It still lists:

| Column | Formula |
| --- | --- |
| `Frequency` | impressions ÷ reach |
| `CPM (cost per 1,000 impressions)` | spend ÷ impressions × 1000 |
| `CTR (all)` | clicks_all ÷ impressions |
| `CTR (link click-through rate)` | link_clicks ÷ impressions |

All four reconcile to within 0.5% on 100% of rows, max error 0.00% (Rule 3). They are requested from
the user for no reason.

### Why the existing test never caught it

```ts
it("BASE_METRICS no longer contains derivable or ranking columns", () => {
  for (const col of DERIVED_OR_IRRELEVANT_METRICS) {
    expect(BASE_METRICS).not.toContain(col);
  }
  ...
});
```

This can only fail if a column is in **both** lists. `CTR (all)` was never added to
`DERIVED_OR_IRRELEVANT_METRICS`, so the assertion passed while four computable metrics sat in the
requested set. **The test asserts a weaker property than its name claims.**

---

## The exact code change (not applied)

### `iapCsvSpec.ts` — `BASE_METRICS`: 35 → 28 entries

Seven columns move to `DERIVED_OR_IRRELEVANT_METRICS`. **No parser change is required** — the parser
already treats that list as accept-transparently / never-expect.

```
REMOVED (computable — Rule 7)
  - Frequency
  - CPM (cost per 1,000 impressions)
  - CTR (all)
  - CTR (link click-through rate)

REMOVED (not requested — Rule 6)
  - Unique clicks (all)
  - Outbound clicks
  - Unique outbound clicks
```

`BASE_METRICS` after — the requested primitives:

```
Amount spent ({ACCOUNT_CURRENCY})   Page engagement
Reach                               Post engagements
Impressions                         Post comments
Result type                         Post reactions
Results                             Post saves
Result value type                   Post shares
Results value                       Instagram profile visits
Views                               Video average play time
Clicks (all)                        Video plays
Link clicks                         3-second video plays
Landing page views                  Unique 2-second continuous video plays
                                    Video plays at 25% / 50% / 75% / 95% / 100%
                                    ThruPlays
```

`Landing page views` is already present — Rule 5 changes the **recipe** (what the user is told to
tick), not this list.

### Replacement tests

```ts
/**
 * The old assertion compared BASE_METRICS against DERIVED_OR_IRRELEVANT_METRICS,
 * so it could only ever catch a column present in BOTH lists. It passed while
 * Frequency, CPM, CTR (all) and CTR (link click-through rate) sat in
 * BASE_METRICS — they were simply never added to the derived list. Assert the
 * property itself, not list membership, so the class cannot silently regrow.
 */
it("BASE_METRICS contains no computable metric", () => {
  const COMPUTABLE =
    /\bcost per\b|\brate\b|\broas\b|\bctr\b|\bcpc\b|\bcpm\b|^frequency$|^average\b/i;
  expect(BASE_METRICS.filter((c) => COMPUTABLE.test(c))).toEqual([]);
});

it("BASE_METRICS contains no person-scoped click metric", () => {
  // Unique* clicks are people, not events. Dividing them into event counts
  // mixes units. Reach and Frequency serve every legitimate person-scoped
  // question. NOTE the narrow pattern: "Unique 2-second continuous video
  // plays" is an event count Meta happens to label "unique" — it stays.
  expect(BASE_METRICS.filter((c) => /^unique .*clicks/i.test(c))).toEqual([]);
});
```

**Edge case caught while drafting:** a naive `/^unique /i` would wrongly strip
`Unique 2-second continuous video plays`, which is a video *event* count, not a person-scoped click
metric. The person-scoped rule needs the narrower blade.

---

## Verification plan before this is considered done

1. Full workspace typecheck clean.
2. Full api-server suite, failure profile diffed against baseline (currently 17 files / 2 tests, all
   gated on `SUPABASE_DB_URL`).
3. **Re-run both real exports through the parser and assert no behavioural drift:** identical row
   counts (17,116 / 11,924), identical spend ($17,805.35 / $22,379.94) and impressions
   (1,490,366 / 2,357,851), and **no new warnings** from the seven moved columns.

If any of those shift, the change is wrong and gets reverted rather than reconciled.

---

## Decision required

Each rule is independent and can be taken or left on its own:

- **Rule 5 resolution** — add `Landing page views` to the recipe, conditional.
- **Rule 6** — click block seven → three.
- **Rule 7** — move four computable metrics out of `BASE_METRICS`, replace the circular test.
