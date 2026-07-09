# METRIX_Listen_Layer_125_Metric_Contract_v1.md

### Listen Layer Ingestion & Metric Contract

**Date:** July 6, 2026 **Status:** Complete document — built from
metrix_iap_ads_reporting_pivot_templates_v2, provided directly. All 125
metric names below are verbatim from that source, programmatically
counted, not estimated or paraphrased. **Supersedes:** Nothing — this
document did not previously exist in this form.

## 1. Purpose

This is the exact ingestion contract the Listen Layer (Blueprint v2.0
§9) validates every client export against. It replaces any prior
estimate or placeholder reference to "the 125-metric contract" with the
literal, verbatim source.

## 2. Source and Ingestion Structure

Two CSV exports are required per analysis run, both pulled from **Meta
Ads Reporting pivot tables specifically** — not Ads Manager table
exports. This is a hard distinction; the two interfaces do not expose
identical columns.

|                | **Export 1: Demographic + Text**                                                            | **Export 2: Device + Placement**                                                                                 |
|----------------|---------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Row breakdowns | Date, Campaign ID, Campaign name, Ad set ID, Ad set name, Ad ID, Ad name, Gender, Age, Text | Date, Campaign ID, Campaign name, Ad set ID, Ad set name, Ad ID, Ad name, Impression device, Platform, Placement |
| Metric set     | Identical consolidated metric set (Section 3) in both                                       | Identical consolidated metric set (Section 3) in both                                                            |

**Rules, verbatim from source:**

- Date may be mapped from Day if Meta labels it that way; both files
  > must use the exact same date range.

- Campaign ID, Ad set ID, and Ad ID are **required in both exports** —
  > this is the direct source confirmation for why ad_id (Blueprint v2.0
  > §7) is reliably available as the resolver's fallback key.

- Ads is a legacy alias for Ad name — not a separate required column.

- Do not substitute manually-pasted ad copy for the Text breakdown — it
  > must come from Meta's own Text breakdown field.

- Pivot rows must be **ungrouped** before export. Grouped or collapsed
  > rows corrupt the bundle-prep parser — this is a concrete, testable
  > validation check, not just an operator instruction.
  > IAP_DATA_BUNDLE_PREP's ingestion step should reject or flag any row
  > that represents a collapsed group rather than a unique breakdown
  > combination.

- No grand totals, subtotals, summary rows, or account-rollup rows
  > permitted.

- Export as CSV, not XLSX.

- Amount spent may export in any account currency (USD/CAD/GBP/etc.) —
  > the importer maps it to Amount spent ({ACCOUNT_CURRENCY}) rather
  > than assuming a fixed currency.

## 3. The 125-Metric Contract, Verbatim

### 3.1 Base — all business models (61 metrics, always required)

Amount spent ({ACCOUNT_CURRENCY})

Reach

Impressions

Frequency

CPM (cost per 1,000 impressions)

Cost per 1,000 Accounts Center accounts reached

Result type

Results

Cost per result

Result rate

Results rate per link clicks

Result value type

Results value

Views

Clicks (all)

CPC (all)

CTR (all)

Link clicks

CPC (cost per link click)

CTR (link click-through rate)

Unique CTR (link click-through rate)

Unique clicks (all)

Cost per unique click (all)

Cost per unique link click

Outbound clicks

Unique outbound clicks

Outbound CTR (click-through rate)

Unique outbound CTR (click-through rate)

Cost per outbound click

Cost per unique outbound click

Landing page views \*

Cost per landing page view \*

Landing page views rate per link clicks

Page engagement

Post engagements

Post comments

Post reactions

Post saves

Post shares \*

Cost per Page engagement

Cost per post engagement

Cost per post share \*

Cost per interaction

Instagram profile visits

Quality ranking \*

Engagement rate ranking

Conversion rate ranking \*

Ad recall lift rate

Video average play time

Video plays

3-second video plays

Unique 2-second continuous video plays

Video plays at 25%

Video plays at 50%

Video plays at 75%

Video plays at 95%

Video plays at 100%

ThruPlays

Cost per ThruPlay

Cost per 3-second video play

Cost per 2-second continuous video play

### 3.2 Ecommerce / DTC specific (24 metrics, required when ecommerce cohort enabled)

Adds to cart

Cost per add to cart

Adds to cart conversion value

Content views \*

Cost per content view \*

Content views conversion value \*

Checkouts initiated

Cost per checkout initiated

Purchases

Cost per purchase

Purchase ROAS (return on ad spend)

Website purchase ROAS (return on ad spend)

Website purchases

Website purchases conversion value \*

Direct website purchases \*

Direct website purchases conversion value \*

Shops-assisted purchases \*

Shops-assisted purchases conversion value \*

Meta purchases

Meta purchases conversion value \*

Purchases conversion value

Average purchases conversion value

Purchases rate per landing page views

Purchases rate per link clicks

### 3.3 Service business specific (18 metrics, required when service cohort enabled)

Leads

Cost per lead

Leads conversion value \*

Meta leads

Website leads

Contacts \*

Cost per contact \*

Contact conversion value \*

Appointments scheduled \*

Cost per appointment scheduled \*

Registrations completed \*

Cost per registration completed \*

Registrations completed conversion value \*

Calls placed \*

20-second calls \*

60-second calls \*

Estimated call confirmation clicks \*

Callback requests submitted \*

### 3.4 App promotion specific (22 metrics, required when app cohort enabled)

App installs

Cost per app install

Mobile app installs

Cost per mobile app install \*

Cost per app activation

App activations

App activations conversion value

In-app sessions

Cost per in-app session \*

In-app sessions conversion value

In-app purchases

Cost per in-app purchase \*

In-app registrations completed

Cost per in-app registration completed \*

In-app trials started

Cost per in-app trial started \*

In-app subscriptions \*

Cost per in-app subscription \*

In-app subscriptions conversion value

Ratings submitted

Cost per rating submitted \*

Ratings submitted conversion value \*



**\* = flagged "New in v2" by source — confirmed real and selectable via
Meta's own documentation or a provided export, but not yet reconfirmed
as selectable in every account's pivot table interface. The Listen
Layer's column-validation step should attempt these and flag-if-absent
rather than hard-require them; every unmarked metric above is fully
confirmed and should hard-require per its block's activation rule.**

**No lead_gen block exists in the source** — note this discrepancy
against Blueprint v2.0 §6.1's illustrative seed set, which lists
lead_gen as a fourth cohort alongside ecommerce/service/app. The source
file's four blocks are Base + Ecommerce + Service + App — lead_gen-type
outcomes (Leads, Cost per lead, etc.) live inside the **Service** block
here, not a separate one. This should be reconciled explicitly rather
than silently kept as two different four-block breakdowns across two
documents: either fold lead_gen into service as one cohort (matching
this source exactly), or keep them conceptually distinct in
cohort_definitions while both pointing at the same service_18 metric
block. Flagging this rather than picking silently — see clarifying note
below.

## 4. Validation Logic Summary

1. Reject exports not from Meta Ads Reporting pivot tables (Ads Manager
table

exports lack required columns and must not be accepted).

2\. Reject rows representing collapsed/grouped pivot output.

3\. Require: base-61 always. Require: cohort-specific block(s) per

client_enabled_cohorts (Blueprint v2.0 §6.2).

4\. For "New in v2" (\*) metrics: attempt, flag-if-absent, do not
hard-fail.

5\. For all other metrics in an active block: hard-require, flag as a

data-quality issue (not silent skip) if absent.



## 5. One clarifying question this document surfaces (genuinely below 95% — not proceeding past it silently)

Blueprint v2.0 §6.1 lists four illustrative cohorts: ecommerce,
lead_gen, service, app. This source file's four metric blocks are: Base,
Ecommerce, Service, App — no separate lead_gen block. Lead-generation
metrics (Leads, Cost per lead, Meta leads, Website leads) are inside the
**Service** block.

Two ways to reconcile, and I don't want to pick silently since it
affects cohort_definitions seed data directly:

1.  **Merge lead_gen into service as one cohort** in cohort_definitions
    > — they'd share required_metric_block: service_18 and be
    > differentiated only by funnel_stages/terminal_metric (lead-gen's
    > terminal metric being cost-per-qualified-lead, service's being
    > cost-per-booking) while pulling from the identical 18-metric
    > column set.

2.  **Keep lead_gen and service as two distinct cohort_definitions
    > rows**, both pointing at the same service_18
    > required_metric_block, since the column requirements happen to be
    > identical even though the business logic differs.

Functionally these produce the same ingestion behavior either way — the
difference is only in how many cohort_definitions rows exist and how the
Settings checklist labels them to the user.

**RESOLVED — July 6, 2026, decision by Alex: Option 2.** lead_gen and
service remain two distinct cohort_definitions rows, both pointing at
required_metric_block: service_18. Rationale: the Settings checklist
must present "Lead Generation" and "Service / Booking-Based" as
genuinely different choices to the user — a real estate agent generating
leads and a med-spa taking bookings are different businesses to the
person clicking the checkbox, even though Meta buckets their raw columns
identically. The two cohorts keep their distinct funnel stages
(lead_submit → qualified → close vs inquiry → consult_booked → close)
and terminal metrics (cost_per_qualified_lead vs cost_per_booking).
METRIX_Cohort_Architecture_v1.md has been updated accordingly: every
lead_gen_18 reference is now service_18; no other registry change. No
lead_gen_18 metric block exists anywhere — this contract's four blocks
(Base / Ecommerce / Service / App) are exhaustive and correct as
written.
