# METRIX IAP — Document Briefs Package
### Scoping briefs for every outstanding document in Blueprint v2.0
**Date:** July 6, 2026
**Status:** Briefs only — no individual document is being built yet, per explicit instruction. Each brief below defines purpose, source, scope, and acceptance criteria so the actual build-out (whenever it starts) has zero ambiguity to resolve mid-write.
**Source-confidence key:** 🟢 = grounded in complete or near-complete verified text gathered earlier this session. 🟡 = grounded in partial fragments only — scope below is my best-supported read, but should get a quick verification pass against the full live doc before the actual rewrite starts. 🔴 = not yet sourced at all.

---

## A. Tier-1 Architecture Docs (Blueprint v2.0 §3.2)

### A1. METRIX_Cohort_Architecture_v1.md — 🟢 COMPLETE (not a brief; already built and delivered)
No brief needed — this is the one document that's already fully built, per your confirmation that it stands even though we're otherwise brief-only right now.

### A2. METRIX_Launch_Architecture_v1.md — 🟡
**Purpose:** Formalize the four-plane runtime model (Blueprint v2.0 §3) as its own standalone reference doc, since it currently only exists as a section inside the master blueprint.
**Scope:** Describe each plane's responsibilities, the data-flow contract between them (Plane 1→2→3→4 for generation, 4→3 for review/approval writes), and where version-stamping (prompt/skill/engine/schema versions) gets attached at each handoff.
**Dependencies:** None — self-contained extraction from the master blueprint.
**Acceptance criteria:** A build agent reading only this doc (not the master blueprint) can correctly place any given Edge Function or table into the right plane.
**Confidence note:** Structural content is solid (it's already fully specified in Blueprint §3-4). Marked 🟡 only because I haven't cross-checked it against `IAP_SYSTEM_COMPLETE_ARCHITECTURE.md` (the existing Drive doc describing the 8-phase system) to make sure the plane model and the phase model reconcile cleanly — that doc wasn't fetched in full this session.

### A3. METRIX_Creative_ID_Resolution_v1.md — 🟢
**Purpose:** Standalone doc for the resolver logic currently living in Blueprint v2.0 §7.
**Scope:** Key hierarchy (`account_id:campaign_id:adset_id` / `concept_code` primary / `ad_id` fallback / `relative_id` crosswalk), the `resolveCreativeIdentity` function contract, and the precondition principle tying resolution to the `INSUFFICIENT` confidence grade.
**Dependencies:** Naming Convention System (external Drive doc, already verified in full this session) — this doc should cite it as the literal source for the `[CONCEPT_VAR]_[TYPE]_[LANDING_PAGE]_[TEST_ID]` structure rather than restate it.
**Acceptance criteria:** Unambiguous enough that two different engineers implementing `resolveCreativeIdentity` independently would produce functionally identical resolution order.
**Confidence note:** High — this logic has been iterated and corrected multiple times this session (naming-convention-primary, ad_id-fallback, no sprint field) and is now internally consistent.

### A4. METRIX_Listen_Layer_Metric_Contract_v1.md — 🟡
**Purpose:** Formalize the 125-metric contract (base 61 + three conditional 18-24-metric blocks) as its own doc.
**Scope:** Full column list per block, the conditional-requirement logic keyed to `client_enabled_cohorts`, and the data-quality-flag-not-hard-failure rule for missing expected columns.
**Dependencies:** Cohort Architecture (A1, done) for which blocks map to which cohorts; `IAP_DATA_BUNDLE_PREP`'s actual "Expected Columns" section for the base-61 baseline.
**Acceptance criteria:** Every column referenced by any repaired IAP document (Section B below) traces back to a named block in this contract — no document should invent a column name not listed here.
**Confidence note:** 🟡 — I have the *structure* of the base-61/24/18/22 split from memory established earlier in this project, and I've verified `IAP_DATA_BUNDLE_PREP`'s hardcoded ecommerce columns directly, but I have not verified the complete literal column lists for the lead-gen/service/app blocks against a live source. This is the brief most worth a verification pass before proceeding to a build.

### A5. METRIX_Supabase_Final_Blueprint_v1.md — 🟢
**Purpose:** This is effectively Blueprint v2.0 §11 promoted to its own file — the full schema (18 tables across identity/access, analysis runs, outputs, review/approval/learning).
**Scope:** No new content — straight extraction of §11 with the accompanying RLS rules (§12) and migration/repo rules (§14) folded in as a single implementation-ready doc.
**Dependencies:** None — this is packaging, not new design.
**Acceptance criteria:** Every `create table` statement in Blueprint v2.0 appears here verbatim, in dependency order (so a migration script generated from this doc top-to-bottom never hits a missing foreign key).
**Confidence note:** High — this is the most-iterated, most-corrected part of the whole project. Straightforward extraction work.

### A6. BSIL_System_Spec_v1.md — 🟢
**Purpose:** Standalone doc for Blueprint v2.0 §10.
**Scope:** Budget-scope constraint (campaign/ad_set only, hard-enforced), the no-ROAS-v1 alert constraint, the `bsil_suggestions` table, and — new this session — the clarification that live spend/impression data feeds the *existing* `IAP_DATA_BUNDLE_PREP` confidence-level classification rather than a separate MST-specific gate table.
**Dependencies:** Cohort Architecture (A1) for `cohort_key` scoping on suggestions.
**Acceptance criteria:** Explicitly states what BSIL is *not* (never autonomous, never touches creative/copy/angle) as clearly as what it is — this is the constraint most likely to get quietly violated by a build agent optimizing for convenience.
**Confidence note:** High — locked and unchanged since the earliest version of this project's memory, never contested across any revision.

### A7. METRIX_Gap_Register_and_Roadmap_2026-07-05.md — 🟢
**Purpose:** Standalone version of Blueprint v2.0 §15's gap table plus §16-17 (roadmap, build-readiness checklist).
**Scope:** Same content as §15-17, reformatted as a living tracker rather than a static section — should be the doc that gets updated as gaps close, rather than requiring a new blueprint version each time.
**Dependencies:** All other briefs — this is the index, not a source.
**Acceptance criteria:** Every gap has a named owner-document (which brief/build closes it) — no orphaned gaps.
**Confidence note:** High — this is reorganization of already-confirmed content.

---

## B. IAP Layer Repairs (the 7 documents needing cohort-awareness)

All seven of these have the same core repair pattern: replace hardcoded ecommerce-only funnel/column assumptions with references to `cohort_definitions` (Registry A1). None of these briefs propose new algorithmic logic beyond that swap — variable stacks, CN_/FW_/TN_/HK_ taxonomy, MST matrix rules, and confidence-level thresholds all stay exactly as they are.

### B1. IAP_DATA_BUNDLE_PREP.md — 🟢
**Current state (verified):** "Expected Columns" section hardcodes `Add to Cart, Initiate Checkout, Purchase, Cost per Purchase, ROAS` as unconditionally required. Everything else — de-dup/normalization logic, copy consolidation, naming-convention parsing, anomaly detection, the high/medium/validation-required/insufficient confidence thresholds — is already cohort-agnostic and needs no change.
**Repair scope:** Replace the hardcoded column list with: base-61 always required (A4) + conditionally-required block per `client_enabled_cohorts` (A1), with a data-quality flag (not silent skip, not hard failure) when an enabled cohort's columns are missing.
**Repair order:** First, paired with B2.
**Acceptance criteria:** A lead-gen-only client's export, containing zero ecommerce columns, processes without triggering false anomaly flags for "missing" ATC/checkout/purchase data that was never expected in the first place.

### B2. IAP_ANALYSIS_CORE.md — 🟡
**Current state (partial):** Consumes the normalized bundle from B1, produces ICP-level performance data, winning-concept/angle/hook detection, and strategic recommendations. Uses `confidence_level` classification already defined in B1.
**Repair scope:** Same pattern as B1 — wherever funnel-stage logic or terminal-metric assumptions appear (e.g. buying-intent scoring), reference `cohort_definitions.funnel_stages` / `intent_score_weights` (A1) instead of an ecommerce-hardcoded formula.
**Repair order:** Paired with B1 — tested as one unit before moving to B3, per Blueprint §6.6.
**Confidence note:** 🟡 — I have solid fragment coverage of the ICP-profile schema and output structure, but not a complete pass on every internal formula. Needs a full fetch before the actual repair (not just the brief) is written.

### B3. MST_TEST_ENGINE.md — 🟡
**Current state (partial, verified structurally):** 7-layer performance analysis, crossmap leaderboard, variable verdicts (universal winner / avatar-specific / underperformer), win/loss thresholds currently framed around ROAS-adjacent scaling tiers (Critical Scale +20%, Scale +10-19%, Optimize 0-9%, Validate <5% allocation, Retire -20%).
**Repair scope:** Verdict thresholds themselves (the +20%/-20% lift tiers) are cohort-agnostic already — no change needed there. What needs repair: anywhere the engine assumes a specific terminal metric (e.g. ROAS) rather than pulling `terminal_metric`/`terminal_metric_direction` from A1 per the client's active cohort.
**Repair order:** After B1/B2 validated.
**Confidence note:** 🟡 — good structural coverage from this session's fragments, not a complete verified pass.

### B4. IAP_STRATEGY_MAP.md — 🟡
**Current state (partial):** Consumes `IAP_ANALYSIS_CORE` output, produces ICP profiles, message pillars, variable combination matrix, hypothesis testing queue.
**Repair scope:** ICP funnel-journey field (`fast_converter | needs_nurture | comparison_shopper` in the current schema) should map against `cohort_definitions.funnel_stages` rather than assume a purchase-style journey for every client.
**Repair order:** After B1/B2/B3.
**Confidence note:** 🟡 — fragment coverage of the schema is decent; full formula-level repair needs verified source.

### B5. IAP_BRIEF_BUILDER.md — 🟢
**Current state (verified, good coverage):** Mode (matrix/general) × voice (ugc/brand/ai_ugc) × asset_type (static/video/carousel/ai_video) brief generation. Already fully generic — no client-specific content found anywhere in this document.
**Repair scope:** Minimal — only the "Success Criteria" / "Scaling Criteria" template fields (currently phrased as `Maintain ROAS > X` / `Keep CPA < $X`) need to pull their metric name from `cohort_definitions.terminal_metric` rather than hardcoding ROAS/CPA language for every brief regardless of cohort.
**Repair order:** After B1-B4 (lowest-risk of the seven, since so little actually changes).
**Confidence note:** High — this is the document I have the most complete fragment coverage of by far.

### B6. IAP_REPORT_SUMMARY.md — 🔴
**Current state:** Not yet sourced this session beyond a passing reference in the integration-flow diagram.
**Repair scope (provisional):** Headline KPI selection should default to `cohort_definitions.terminal_metric` per active cohort rather than an assumed metric.
**Confidence note:** 🔴 — this brief is the least-grounded of the seven. Needs a full fetch before I'd trust the scope above as complete.

### B7. IAP_OPTIMIZATION_LOOP.md — 🟢
**Current state (verified, good coverage):** Consumes `MST_TEST_ENGINE` + `IAP_ANALYSIS_CORE` output, re-weights variable importance via lift detection, feeds updated parameters back to B4 and B5.
**Repair scope:** Variable re-weighting is already keyed to lift percentage (cohort-agnostic) — but the "performance forecast" section's language (`expected_roas_improvement`, `expected_cpa_reduction`) should generalize to whatever `terminal_metric` the active cohort defines.
**Repair order:** Last — depends on B2/B3 output shape being finalized first.
**Confidence note:** High fragment coverage from this session.

---

## C. Not a brief — explicitly out of scope for this build

**"Metrix AI Agent: Complete Prompt Architecture & Learning Loop"** and the autonomous-execution concept it describes — confirmed future-phase, not part of the initial release. No brief is being written for it. It stays noted in the Gap Register (A7) as a forward-looking item only, so it doesn't get accidentally folded into any of the seven repairs above by a build agent looking for "the optimization doc" and finding two candidates.

**Andromeda's underlying strategic principle** (creative-diversity/broad-targeting as the mechanism for surfacing ICP-PMF) belongs inside B4 (`IAP_STRATEGY_MAP`) and B3 (`MST_TEST_ENGINE`) once those get their full repair — it's about how creative diversity signals which ICP the algorithm is finding fit with, which is exactly what MST's multi-cell testing already measures. I have this at 🔴 confidence for now (only a very early fragment, from before the connector dropped) and want a full verified pass on that source doc before committing it to either brief's scope in more than this one-line placeholder.

---

## Summary — what's ready to build now vs. what needs a verification pass first

**🟢 Ready to move to actual document build whenever you say go:** A3, A5, A6, A7, B1, B5, B7 (7 of 15)
**🟡 Scoped, but want a verification fetch first:** A2, A4, B2, B3, B4 (5 of 15)
**🔴 Not yet sourced enough to trust the brief:** B6, and the Andromeda-into-B3/B4 placeholder (2 of 15)

A1 (Cohort Architecture) is done in full already.
