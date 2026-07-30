# METRIX IAP — Conversation Synthesis & Handoff
**Date:** July 6, 2026
**Purpose:** Full-context handoff for a new environment picking up this project. Read this before touching any of the other files — it explains *why* the architecture looks the way it does, including the mistakes that got corrected along the way, so they don't get quietly reintroduced.

---

## 1. What This Project Is

Metrix's Intelligent Ads Protocol (IAP) is an 11-prompt intelligence engine for Meta Ads performance marketing, currently running as Claude.ai Skills with no deployed backend. This conversation's job has been to produce the canonical backend architecture (Supabase) and scope out every document needed to repair the 11 IAP prompts and stand up the repo. All 15 required documents are now closed — 2 built in full, 13 scoped as build-ready briefs — and Alex has given explicit authorization to move from briefs to build.

## 2. Current State of Deliverables

| File | Status |
|---|---|
| `METRIX_IAP_MASTER_BLUEPRINT_v2.0.md` | **Canonical.** Supersedes v1.1 through v1.5 entirely. Full Supabase schema, naming convention, cohort architecture, creative resolution, confidence grading, BSIL. |
| `METRIX_Cohort_Architecture_v1.md` | **Complete document.** |
| `METRIX_Listen_Layer_125_Metric_Contract_v1.md` | **Complete document** — exact 125-metric list verbatim from `metrix_iap_ads_reporting_pivot_templates_v2`, provided directly. The lead_gen/service question is **resolved**: Option 2, two distinct cohorts sharing `service_18`. |
| `METRIX_Document_Briefs_Package.md` | Scoping briefs for the remaining 13 documents. All 15 of 15 items closed — 2 (A1, A4) are complete documents, 13 remain scoped briefs ready to build. |

## 3. Mistakes Made and Corrected — Read This Before Building Anything

This is the important part. Several wrong turns happened in this conversation, each one caught and fixed. A new environment without this context could easily repeat them by working from an earlier partial state.

**Client identity leaked into architecture, twice, in opposite directions.** First pass: the blueprint hardcoded a specific client's name and account details directly into the schema and prose. Corrected to fully platform-agnostic language. But the correction overcorrected — it also stripped out the *concept* of a client short-code naming convention as if it were incidental client data, when it's actually required platform architecture (every client gets a systematic acronym-style ID, same logic as a sports scoreboard abbreviation). Both errors are now resolved: no client is named anywhere, but `clients.client_code` is a formal required field.

**Sprint tracking was invented, then found to not exist.** An early pass reverse-engineered a `{client_code}{sprint_number}` naming mechanism from one account's ad names, built `creative_sprints` and `sprint_number` schema around it, and it turned out to be wrong — there is no sprint-version field in the real naming convention at all. Sprint/batch context is derived from database associations (which `analysis_run` an `ad_id` appears in), never encoded in the ad name. That schema was removed entirely in v2.0.

**Resolver priority was backwards for multiple versions.** `ad_id` was treated as primary and naming-convention parsing as a secondary signal. It's the reverse: naming convention (fixed, mandatory format) is primary; `ad_id` scoped to campaign/adset is the fallback. Corrected in v2.0 §7.

**A dollar-checkpoint MST gating system was nearly formalized as new schema** based on a legacy SOP document, before being corrected: real spend/impression data feeds the confidence-level classification `IAP_DATA_BUNDLE_PREP` already defines. No new gate table exists in the final schema.

**Cohort architecture was nearly collapsed to a config field**, then confirmed as genuinely first-class: cohort/business-model selection is user-facing (a Settings checklist), reconfigurable at any time, and snapshotted per analysis run so historical runs stay interpretable after a business pivots.

**Several foreign-keyed tables were never actually defined** (`clients`, `organizations`, `creative_briefs`, `reports`, `learning_registry`) across multiple blueprint versions before anyone noticed — every prior draft referenced them without a `create table` statement existing anywhere. Fixed in v2.0 §11, which is now the complete schema with nothing referenced-but-undefined.

**A connector outage happened mid-session** and several items were briefed from memory/fragments rather than verified complete source. Those have since been closed out — see Section 4.

## 4. What's Now Fully Verified (Complete Source Text Confirmed)

All 11 canonical IAP documents plus supporting docs were located as live Google Docs (not just project-knowledge fragments) and the following are now confirmed read in full: `IAP_DATA_BUNDLE_PREP`, `IAP_ANALYSIS_CORE`, `IAP_STRATEGY_MAP`, `MST_TEST_ENGINE`, `IAP_REPORT_SUMMARY`, plus the Meta Ads Naming Convention System (canonical source for all naming rules) and a Meta algorithm-behavior training document (source for the creative-diversity/broad-targeting principle underlying MST's design — never cite this by its internal name in platform documentation, per explicit instruction).

Every one of these is confirmed **fully generic** — no client names, no account-specific content in the actual prompt logic. The only hardcoding found anywhere is business-model hardcoding (ROAS/CPA/ecommerce-funnel assumptions baked in as if every client sells physical products), which is exactly what the Cohort Architecture document exists to fix.

**Still not fully verified:** nothing blocking. `IAP_OPTIMIZATION_LOOP`, `MST_CREATIVE_SCAN`, `VARIABLES_REGISTRY`, `MST_METHOD_REFERENCE`, and `IAP_BRIEF_BUILDER` retain good fragment coverage from earlier in this conversation rather than a fresh full-text refetch this session, but their briefs were rated build-ready on that basis and nothing contradicts it. `IAP_SYSTEM_COMPLETE_ARCHITECTURE` was fetched and verified in full — confirms the phase model reconciles cleanly with the blueprint's four-plane model.

**Correction to a claim made earlier this session:** the exact 125-metric column list was said not to exist anywhere after two Drive searches. That was wrong in framing, not in the search itself — the document existed, just not in Drive; it's a file Alex maintains directly (`metrix_iap_ads_reporting_pivot_templates_v2`) and was provided directly rather than found. The lesson: "I searched and didn't find it" should be reported as exactly that, not escalated to "it doesn't exist" — those are different claims, and only the first one was actually true.

## 5. Explicitly Out of Scope, Do Not Fold In

**"Metrix AI Agent: Complete Prompt Architecture & Learning Loop"** — describes autonomous execution (auto-executes optimizations above a confidence threshold, live 15-minute cycle). Confirmed by Alex as a future-phase feature, not part of the initial release. Suggestion-only remains the locked v1 constraint. This document was opened for review, not edited, during this session — its recent modification timestamp is not a signal that scope changed.

## 6. Reference — All Known Document IDs (Google Docs, live)

```
IAP_DATA_BUNDLE_PREP()      — 1jOoV9Dq2iLAPv7Hnkld4vdHuNT-Xqw6bKrfblGt7-dU
IAP_ANALYSIS_CORE()         — 16ydYtQSDGpPCgahnW-7n_5Kga3yL6DQ1pY_3DaDLxdU
IAP_REPORT_SUMMARY(mode)    — 1DHl3nNgzkKp99F_XI0FdVp3XxyWD0gWhH7MJ8hTX4RE
IAP_STRATEGY_MAP()          — 1wwkxNAF15PvWdneCS_7UI5VdzbgQ-6enecggMmxRdOw
IAP_BRIEF_BUILDER(...)      — 1KieN_UFnqKl-4EYn5oHk4HClcKYHeH82X0JH3jGpNg8
MST_METHOD_REFERENCE        — 1iJ7vo_OxtPEE1Vrjbq7hCpHeWjCJJp-71duswZa5RdM
MST_CREATIVE_SCAN()         — 1-598YvGK4L3FNSLxkUF7zg1Eid-tn8q2GmS4QKDGQDE
MST_TEST_ENGINE()           — 13OyklOB0ZGuKAiVA4bfIIVBfY5BdGg5fRqGxFRL-xK0
IAP_OPTIMIZATION_LOOP()     — 1FW4l-PxTPNBCAoYo5UCl1FwWVbWXTi_kxSadpt4ull4
VARIABLES_REGISTRY          — 1y_H1YHVF5szRFm-qMsdDVgToD63Sf8U1Qk3J37qCF2k
SYSTEM_CONTEXT_IAP_ANDROMEDA— 1_c7xEDOl5sYrYOVpLmXWDiJFbdtZBKBRGXq9KaJ4KQ8

Main project Drive folder — 1tJPAOxcVHWLjBhvNW52HjkDSoj-ardGu
Audits folder              — 1cPYtTeWD0WK1SGWmP-OZKRtn2nd6Kzml
Global IAP Library folder  — 1Sq7rfSVu1-d7rY54MjEzZo_4I6F4oiJa
```

## 7. Standing Rule (Now Also Saved to Memory)

If confidence in any requirement is below 95%, ask clarifying questions before proceeding — do not guess. This applies to every conversation on this project going forward, not just this session. Mistakes here are costly, per explicit instruction, and this rule is now saved as a persistent memory entry so it's active from the first message of a new conversation without needing to be restated.

## 8. Explicit Authorization

Alex has explicitly authorized proceeding from briefs to build. A new environment reading this document does not need to ask permission to begin the repair sequence — see `METRIX_New_Environment_Kickoff_Prompt.md` for the execution order.
