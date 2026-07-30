# METRIX Pricing — Cost Diligence v1

**Date:** 2026-07-30
**Purpose:** Ground "what should we charge for Metrix" in what the backend actually costs to run, rather than a guess. Context for *why* a price is defensible — not a specification for what to build.

---

## 1. The headline finding

**AI compute is not the cost driver.** Per full IAP cycle on one ad account, raw Claude API spend is on the order of **$1–5**, even generously padded for retries and large accounts. Infra (Supabase, hosting, email) is fixed monthly overhead in the tens of dollars, shared across every account, not a per-client variable cost. The real cost of running Metrix today is **human time** — review, QA, and the parts of the IAP loop that are still run by hand — not tokens or servers.

This matters because it means: **don't price off COGS.** Cost-plus math here rounds to "charge basically nothing," which would leave enormous value on the table. Price off what the output is worth to an agency (faster testing cycles, structured creative intelligence, defensible reporting), with a cost floor this document establishes so you know your margin is safe at any reasonable price point.

---

## 2. What's actually automated today (and what isn't)

Checked directly against the code, not assumed:

- **Only 2 of the 6 IAP stages run through the Claude API today**: Strategy generation and Brief generation (`artifacts/api-server/src/lib/generationEngine.ts`), triggered on-demand from the app (`POST /api/metrix/accounts/:id/generate/{strategy,briefs}`).
- **Data Bundle Prep, Analysis Core, Report Summary, MST Test Engine, and Optimization Loop are not wired into the app as automated API calls.** They exist as prompt documents (`docs/prompts/`) and — per `docs/resources/METRIX_Conversation_Synthesis_and_Handoff.md` — currently run as **Claude.ai Skills**, invoked by hand. That's consistent with what you said: the full loop hasn't actually been run end-to-end yet.
- The model in use is `claude-sonnet-4-6` ($3/$15 per million input/output tokens), hardcoded as `GENERATION_MODEL` in `generationEngine.ts`.
- **There is no usage/cost tracking anywhere.** `generation_runs` (the table that records every generation call) has no token-count or cost column — only `status`, `model`, timestamps. Every number below is therefore a model-based estimate, not a measurement. **Recommendation: add `input_tokens`/`output_tokens`/`estimated_cost_usd` to `generation_runs` before scaling** — that turns this whole document from an estimate into a fact within a week of real usage.

---

## 3. What the two live stages cost today

Each call does one shot + up to one repair retry (`generateValidated` in `generationEngine.ts`) if the model's JSON fails schema validation.

| Stage | Prompt input (taxonomy + methodology + evidence pack) | Output cap | Real cost per call* |
|---|---|---|---|
| Strategy (`startStrategyGeneration`) | ~4–8K tokens (top 30 cells, top 60 variables, demographic/placement/device/platform signals, ICP profiles) | 8,192 tokens | **$0.03–$0.08** |
| Briefs (`startBriefsGeneration`) | ~6–10K tokens (pillars + evidence, full 4×4 matrix rules) | 16,384 tokens | **$0.05–$0.15** |

*Estimated from `claude-sonnet-4-6` pricing and prompt structure in code; a repair retry roughly doubles a single call's cost, so worst case per stage is ~$0.15–$0.30.

**One click of "generate strategy" or "generate briefs" today costs single-digit cents to about fifteen cents, worst case.** Even a client who regenerates both five times in a session is under a dollar.

---

## 4. What a *full* IAP loop would cost, once automated

Using the actual sample data files checked into this repo (`scripts/data/metrix/`) as size anchors — these are real outputs from the pipeline, not invented numbers — and the real prompt-doc lengths in `docs/prompts/`:

| Stage | Anchor file (real, in repo) | Approx. tokens (in / out) |
|---|---|---|
| Data Bundle Prep | `normalized_data_bundle.json` — 62.9 KB output | raw CSV export (variable, likely the largest input) → ~15,700 out |
| Analysis Core | `campaign_intelligence.json` — 40.3 KB output | ~18,000 in → ~10,000 out |
| Report Summary | (report doc) | ~13,000 in → ~5,000–8,000 out |
| Strategy Map | `strategic_map.json` — 11.7 KB output | ~13,500 in → ~2,900 out |
| Brief Builder | `creative_briefs.json` — 12.7 KB output (full 16-cell matrix) | ~18,000 in → ~3,200 out |
| MST Test Engine | (test analysis) | ~16,000 in → ~5,000 out |
| Optimization Loop | (updated weights/recs) | ~15,000–18,000 in → ~3,000–5,000 out |

Rolling up (excluding the unknown size of raw Meta Ads CSV exports for stage 1, which is the one genuinely open variable):

- **~100–150K input tokens, ~35–48K output tokens per full cycle**
- At `claude-sonnet-4-6` rates: **≈ $0.40 input + ≈ $0.60–0.70 output ≈ $1–1.50 per complete IAP loop run**, per account, per cycle.
- Padding generously for large accounts, repair retries, and the unknown raw-export size: **call it $2–5 as a safe ceiling per full run.**

This is the number to use when someone asks "what does it cost us to run the whole thing for a client." It is not $50, not $500 — it's low single digits.

---

## 5. Infra — fixed, not variable

- **Supabase Postgres**: all Metrix data (18–22 tables, RLS-scoped) for one client account is a trivial row count. This scales on the Supabase *project* tier (a Pro plan, ~$25/mo base), not per account — you can run dozens of client accounts on one project before tier pressure matters.
- **Resend email**: free tier (3,000 sends/month) covers admin approvals/password resets for a long time; irrelevant to per-client cost.
- **API server hosting** (Replit deployment): a fixed monthly compute cost regardless of how many accounts are active — this is the same bucket that runs the whole app, not something that scales per client the way tokens do.

None of this moves the needle vs. the $1–5/run AI number above. **Total realistic COGS per client per billing cycle, today, is: single-digit dollars of AI + an amortized sliver of fixed infra.** Call it under $10/month/account even under pessimistic assumptions, until volume gets large enough to need a Supabase tier bump — and that's an org-wide fixed cost, not a per-client one.

---

## 6. What this means for what to charge

Cost-plus off ~$5–10/account/month would price Metrix absurdly cheap for what it delivers (a structured Meta Ads creative-testing and reporting system). That leaves margin on the table and — worse — signals "cheap tool" rather than "the system that runs your testing program." **Price on value, with this cost analysis as your floor, not your target:**

- **If this is an internal capability you use to justify/upsell retainers**: the "cost" question barely matters — Metrix's job is to make the deliverable faster/better, and its value shows up in your retainer pricing, not as a line item. The $1–5/run number tells you the capability doesn't materially eat your margin even at high usage.
- **If you plan to sell Metrix as software to other agencies**: comparable creative-intelligence / ad-reporting SaaS tools price per ad account or per spend tier, commonly in the $150–$1,500/month range depending on account complexity and reporting depth — largely because the buyer is paying for the *analysis and time saved*, not raw compute. At near-zero marginal cost, a $200–$500/account/month price point (tiered by spend or account count) would carry >95% gross margin even before the infra is fully amortized.
- **Either way**, the finding that should change your negotiating posture: **you have enormous room.** The thing you were worried about — mispricing because you didn't know the backend cost — resolves in your favor. The risk isn't "we'll lose money on compute," it's "we'll underprice the strategic value because we anchored on a cost number that turned out to be tiny."

## 7. Open question before locking a number

This document can't answer this for you — it changes the pricing model entirely:

**Is Metrix (a) an internal tool that powers your agency's own service delivery, or (b) a product you intend to license/sell to other agencies or in-house teams?**

(a) → price is really about internal cost-to-serve (now known to be trivial) informing your retainer/service pricing.
(b) → price is a SaaS pricing exercise (per-account, per-seat, or spend-tiered), and the $1–5/run COGS is your margin floor, not your price.

## 8. Before the next pricing conversation

1. **Instrument real usage.** Add token/cost columns to `generation_runs` (5 tables, no code risk) so the next version of this document is measured, not modeled.
2. **Run one real full-loop cycle end-to-end** (even manually via the Claude.ai Skills today) on a real account and note the actual token counts Claude reports — that converts every estimate above into a confirmed number.
3. **Decide (a) vs (b) above** — it's the actual fork in this decision, not the cost math.
