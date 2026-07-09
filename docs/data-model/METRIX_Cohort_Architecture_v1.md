# METRIX_Cohort_Architecture_v1.md

### Cohort / Business-Model Funnel Registry

**Date:** July 6, 2026 **Status:** Net new — no prior source document
existed anywhere across Drive, project knowledge, or Skills. Derived
entirely from Blueprint v2.0 Section 6, cross-referenced against
confirmed decisions. **Supersedes:** Nothing. This document did not
previously exist. It is cited as a reference standard in
METRIX_Documentation_Audit_Phase1.md without ever having been written —
this file closes that gap.

## 1. Purpose

This registry is the single source of truth for how Metrix defines,
stores, and applies business-model logic across clients. It exists
because the current 11-prompt IAP system hardcodes a single funnel shape
(click → add-to-cart → checkout → purchase) into 5 of 11 documents, and
every one of those repairs (Blueprint v2.0 §6.6) needs to reference the
same registry rather than reinventing funnel logic independently per
document.

**Governing principle, confirmed:** cohort/business-model selection is a
first-class, user-facing, pre-analysis requirement. It is defined at
onboarding, surfaced through a Settings checklist, and reconfigurable at
any time — a client pivoting from lead-gen to direct product sales is
the standing example, not an edge case.

## 2. Registry Entries

Each entry below is seed data — a starting definition, not a fixed
taxonomy. Any client can be onboarded against a business model this seed
set doesn't cover by adding a new entry; nothing here requires a schema
change or deployment to extend.

### 2.1 ecommerce

{

"cohort_key": "ecommerce",

"label": "Ecommerce / Direct Product Sales",

"funnel_stages": \["click", "add_to_cart", "initiate_checkout",
"purchase"\],

"intent_score_weights": {

"click": 1,

"add_to_cart": 2,

"initiate_checkout": 5,

"purchase": 10

},

"terminal_metric": "cost_per_purchase",

"terminal_metric_direction": "lower_is_better",

"secondary_metrics": \["roas", "conversion_rate", "aov"\],

"required_metric_block": "ecommerce_24",

"schema_version": "1.0"

}



**Note on ROAS:** ROAS remains a full reporting metric for this cohort
but is excluded from v1 automated abnormality/alert scanning
platform-wide (Blueprint v2.0 §10.2) — that exclusion is a v1-alerting
rule, not a cohort-definition rule, and applies regardless of which
cohort a client runs.

### 2.2 lead_gen

{

"cohort_key": "lead_gen",

"label": "Lead Generation",

"funnel_stages": \["click", "lead_submit", "qualified", "close"\],

"intent_score_weights": {

"click": 1,

"lead_submit": 5,

"qualified": 8,

"close": 10

},

"terminal_metric": "cost_per_qualified_lead",

"terminal_metric_direction": "lower_is_better",

"secondary_metrics": \["lead_to_close_rate", "cost_per_lead"\],

"required_metric_block": "service_18",

"schema_version": "1.0"

}

### 2.3 service

{

"cohort_key": "service",

"label": "Service / Booking-Based",

"funnel_stages": \["click", "inquiry", "consult_booked", "close"\],

"intent_score_weights": {

"click": 1,

"inquiry": 4,

"consult_booked": 7,

"close": 10

},

"terminal_metric": "cost_per_booking",

"terminal_metric_direction": "lower_is_better",

"secondary_metrics": \["cost_per_registration", "booking_show_rate"\],

"required_metric_block": "service_18",

"schema_version": "1.0"

}

### 2.4 app

{

"cohort_key": "app",

"label": "App / Install-Based",

"funnel_stages": \["click", "install", "activation", "retained"\],

"intent_score_weights": {

"click": 1,

"install": 3,

"activation": 6,

"retained": 10

},

"terminal_metric": "cost_per_activation",

"terminal_metric_direction": "lower_is_better",

"secondary_metrics": \["cost_per_install", "d7_retention_rate"\],

"required_metric_block": "app_22",

"schema_version": "1.0"

}



## 3. Multi-Cohort Clients (the native case, not a special case)

A client can have any number of these enabled simultaneously via
client_enabled_cohorts (Blueprint v2.0 §6.2). When more than one cohort
is enabled:

- Each cohort's analysis runs as its own section — analysis_runs and
  > intelligence_cards never blend a cross-cohort score.

- is_primary on client_enabled_cohorts marks which cohort the client's
  > dashboard defaults to, but does not suppress or subordinate the
  > others.

- The Listen Layer (Blueprint v2.0 §9) requires the base 61-metric block
  > always, plus the required_metric_block for every cohort the client
  > has enabled — not just the primary one.

## 4. Reconfiguration Over Time

Because cohorts are user-toggleable and can change between one analysis
run and the next, every run snapshots which cohorts were active at that
time (analysis_run_cohorts, Blueprint v2.0 §6.4). This registry's
definitions are stable; what changes per client over time is *which*
rows in client_enabled_cohorts are enabled = true, never the definitions
themselves. If a client's business genuinely changes shape in a way this
seed set doesn't capture, a new cohort_definitions row is added — the
registry grows, existing entries are not silently repurposed.

## 5. How This Registry Is Consumed

Every one of the 5 documents flagged in the audit's repair sequence
(Blueprint v2.0 §6.6) reads from this registry rather than hardcoding
funnel logic independently:

IAP_DATA_BUNDLE_PREP → required_metric_block per enabled cohort (column
validation)

IAP_ANALYSIS_CORE → funnel_stages + intent_score_weights (buying-intent
scoring)

MST_TEST_ENGINE → terminal_metric + terminal_metric_direction (win/loss
verdicts)

IAP_STRATEGY_MAP → funnel_stages (ICP funnel-position mapping)

IAP_BRIEF_BUILDER → terminal_metric (success-criteria defaults in
briefs)

IAP_REPORT_SUMMARY → terminal_metric + secondary_metrics (headline KPI
selection)

IAP_OPTIMIZATION_LOOP → intent_score_weights (variable re-weighting
basis)



No document repair should hardcode a cohort's funnel shape inline —
every repaired document should reference cohort_definitions by
cohort_key and pull stage/metric definitions from here.

## 6. Open Extension Points (not blockers, noted for completeness)

- required_metric_block names (ecommerce_24, service_18, app_22)
  > correspond to the cohort-specific metric blocks in the 125-metric
  > Listen Layer contract already on record. lead_gen and service
  > deliberately share service_18 — Meta's source structure has no
  > separate lead-gen block; lead-gen metrics (Leads, Cost per lead,
  > Meta leads, Website leads) live inside the Service block. This is a
  > confirmed decision (July 6, 2026), not a typo: the two cohorts
  > remain distinct cohort_definitions rows with distinct funnel stages
  > and terminal metrics, differing only in that they validate against
  > the same column set. If that contract's exact column lists need
  > restating here verbatim for the repair work, that's a Section 9
  > (Listen Layer) reference, not a Section 6 (Cohort) one — kept
  > separate deliberately so this registry doesn't duplicate the metric
  > contract.

- Additional cohort types beyond these four seed entries are added the
  > same way: a new cohort_definitions row with funnel_stages,
  > intent_score_weights, terminal_metric, and a required_metric_block —
  > no schema change required.
