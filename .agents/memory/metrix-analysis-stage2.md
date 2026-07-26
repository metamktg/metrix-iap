---
name: Metrix IAP Analysis Core (Stage 2)
description: Stage 2 intelligence fields now computed by analysisEngine.ts — tiers, scores, confidence, lift, variable performance.
---

## What Stage 2 adds (computed after Stage 1 ingestion)

All deterministic math — no LLM, no extra network calls.

### concept_performance enrichment
Fields computed per-concept at the end of each analysis run:
- `buying_intent_score` = results × 10 + link_clicks
- `performance_lift_vs_baseline` = (book_blended_cpa − concept_cpa) / book_blended_cpa (stored as 4-decimal string)
- `performance_tier`: "1 - Scale Winners" (lift ≥ 0.10), "2 - Optimize" (≥ 0), "3 - Hold" (≥ −0.20), "4 - Eliminate" (< −0.20)
- `confidence_level`: "high" (spend ≥ $500 AND results ≥ 30), "medium" (≥ $100 AND ≥ 5), "low" (any spend + ≥ 1 result), "validation_required"
- `mapped_in_library`: resolved from library_cells for the account (cell_id and concept_id columns); non-fatal if query fails

### variable_performance population
- Tokens extracted from ad names by splitting on `_` and skipping: cell/concept codes (`C2`, `C2E`), BOOK labels, test-round suffixes (`T1`, `T2`), pure-numeric tokens.
- Aggregated: spend, results, link_clicks, cpa, cvr_link_pct, ad_count per token.
- Written as `variable_family = "raw_token"`, `variable_id = <TOKEN>`.
- Full-replace per account (DELETE + INSERT) on every run.
- `result_type` = most common result_type across the account's adRows.

**Why:** The generation engine reads variable_performance before building Claude's strategy/brief prompt. Without it, Claude has no variable-level evidence and reasons from raw totals only.

## blended CPA baseline scope
Lift is computed **per book** (BOOK0, BOOK2, etc.), not cross-book. A concept in BOOK0 is compared to the BOOK0 blended CPA. This matches the campaign_intelligence.json methodology.

## Progress checkpoints added
- 78%: Writing concept performance (existing — now includes Stage 2 fields inline)
- 82%: Computing variable performance (new)

## Test guard
reportsListCreate.test.ts beforeAll raises to 30 s (getMetrixSeedFromSupabase can exceed 10 s cold); afterAll guards `typeof close === "function"` before calling it.
