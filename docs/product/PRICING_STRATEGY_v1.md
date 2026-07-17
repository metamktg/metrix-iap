# Metrix IAP — Pricing Strategy v1 (Brainstorm)

_Working document, 2026-07-17. Grounded in the actual generation engine
(`artifacts/api-server/src/lib/generationEngine.ts`) and current Anthropic API
pricing. Numbers are planning estimates, not billing records — replace with
measured `usage` data once token logging is added (see §6)._

---

## 1. AI cost model (COGS per unit of work)

### What actually costs money per account

The in-app engine today runs two generation kinds on `claude-sonnet-4-6`
($3.00 / MTok input, $15.00 / MTok output):

| Run kind | Input (evidence + prompt) | Output cap | Est. real output | Est. cost/run |
|---|---|---|---|---|
| Strategy (pillars + hypotheses) | ~12–18K tokens (evidence pack: ≤30 cells, ≤60 variables, ≤25 signals ×2, funnel, ≤25 concepts, ≤8 ICPs) | 8,192 | ~4–7K | **$0.10–0.16** |
| Briefs | ~15–22K tokens (pillars + evidence + column spec) | 16,384 | ~8–13K | **$0.18–0.32** |

- Repair retry (zod validation failure → one re-prompt with errors appended)
  roughly doubles a run when it fires. Budget a **1.15× multiplier** (assume
  ~15% of runs need repair).
- **Full strategy + briefs cycle: ≈ $0.35–0.55 per account per cycle.**

### Forward-looking: the full 7-stage IAP pipeline

`docs/prompts/` defines 7 stages (data bundle prep, analysis core, strategy
map, brief builder, optimization loop, report summary, MST test engine) at
15–36KB of prompt each. If/when all stages run in-app per analysis cycle:

- ~7 model calls × similar shape → **≈ $1.50–3.00 per full analysis run per
  account** on Sonnet 4.6.

### Monthly COGS per active ad account (scenarios)

| Usage profile | Cadence | Est. AI cost / account / month |
|---|---|---|
| Light | Monthly strategy+briefs refresh | **$0.50–1** |
| Standard | Weekly cycle | **$2–5** |
| Heavy | 2× weekly full pipeline + regenerations | **$12–25** |

Fixed infra (Supabase, hosting, Resend) is small and mostly flat. **The
punchline: even heavy AI usage is single-digit dollars per account per month.
COGS should not drive pricing — value does. But COGS tells us we can safely
sell "unlimited generations" inside a fair-use policy and keep 90%+ gross
margin.**

### Margin levers held in reserve (do not spend yet)

- **Haiku 4.5** ($1/$5 per MTok) for mechanical stages (data bundle prep,
  report summary) → ~65–70% cost cut on those calls.
- **Batch API** (50% off) for non-interactive scheduled refreshes.
- **Prompt caching** (~90% off cached input) — the 15–36KB stage prompts are
  ideal cache prefixes if calls are restructured.
- These levers mean COGS can be pushed down ~60–75% later if a tier gets
  usage-heavy. Price for value now; optimize cost when volume demands it.

---

## 2. Pricing axis: charge per **ad account**, not per generation

Reasons grounded in the product:

1. The data model is already account-scoped (`user_ad_accounts` grants,
   per-account runs, per-account seeds). Billing per account maps 1:1 to code
   we already have.
2. Ad accounts track customer value directly — an agency's revenue scales
   with accounts under management, so our price scales with their success.
3. Metering AI runs would fight adoption (people ration usage of the thing
   that makes the product sticky) to protect a cost that is ~2–5% of revenue.
   Never meter the magic; meter the container it lives in.
4. Seats are a secondary axis (member grants already exist) but should be
   generous — collaboration spreads the product inside the agency.

---

## 3. Proposed tiers

| | **Starter** | **Agency** (anchor) | **Scale** | **Enterprise** |
|---|---|---|---|---|
| Price (monthly) | $149/mo | $449/mo | $949/mo | Custom ($2K+) |
| Price (annual, ~2 mo free) | $1,490/yr ($124/mo eff.) | $4,490/yr ($374/mo eff.) | $9,490/yr ($790/mo eff.) | Annual only |
| Ad accounts included | 3 | 10 | 30 | Unlimited/pooled |
| Extra accounts | $39/mo each | $35/mo each | $29/mo each | Volume |
| Seats | 3 | 10 | 25 | Unlimited |
| Data in | Manual CSV upload | + Live Meta OAuth sync | + Priority sync | + Custom pipelines |
| Analysis runs | Unlimited (fair use) | Unlimited | Unlimited | Unlimited |
| AI strategy + briefs | ✓ | ✓ | ✓ | ✓ |
| Optimization loop + Creative Scan | — | ✓ | ✓ | ✓ |
| Report history + exports | ✓ | ✓ + white-label | ✓ + white-label | ✓ + custom branding |
| Cohort configuration | Default | Standard cohorts | Custom cohorts | Custom + learning registry |
| Support | Community/email | Priority email | Slack channel | Dedicated CSM |
| Onboarding | Self-serve | Guided (see wedge) | White-glove | White-glove + training |

Worst-case COGS check: a Scale customer at 30 accounts, all heavy usage
(~$20/acct/mo) = ~$600 AI cost against $949 revenue — still positive, and
that scenario is implausible (heavy usage on every account) and fully
mitigable with the §1 margin levers. Typical Agency-tier COGS: ~$30–50/mo
against $449 → **~90% gross margin.**

### Why these numbers

- **$149 entry** is a credible "prosumer/freelancer" price that filters out
  tire-kickers without gating real solo media buyers. Comparable Meta-ads
  tooling (Madgicx, Foreplay, Motion) trains this market to $99–$500/mo.
- **$449 anchor** is where the sales conversation should start. 10 accounts ≈
  a boutique agency's whole book; $45/account/mo is trivially justified
  against one media buyer hour saved per account per month.
- **The 3× gap between tiers** makes upgrades feel like category changes, not
  nickel-and-diming, and leaves room for the per-account expansion path in
  between.

---

## 4. The strategic price wedge (onboarding + cash flow)

The wedge has three interlocking parts. Each one independently improves cash
flow; together they push customers toward annual prepay without discount-led
desperation.

### 4a. Paid onboarding, framed as a deliverable — "Account Intelligence Setup"

- **$750 one-time** (Starter: $250, Scale: $1,500) — historical data import,
  cohort configuration, first strategy + briefs generated live on the call.
- Why it works: it's cash **before** the first monthly invoice, it filters
  for serious buyers, it funds CAC, and — critically — it reframes onboarding
  from "setup friction" to "the first deliverable you paid for." The customer
  walks out of week 1 with a generated strategy doc, which is the product's
  aha-moment anyway.
- **The wedge move: waive it entirely on annual prepay.** "Pay annual, setup
  is free" converts a $750 objection into a 12-month commitment + upfront
  cash. The waived fee costs us margin we already priced into the annual
  number.

### 4b. Annual prepay as the default motion, not the discount fallback

- Annual ≈ 2 months free (~17%) **plus** waived setup **plus** a locked
  "founding rate" guarantee (price never increases while continuously
  subscribed). Three stacked reasons to prepay, only one of which is a
  discount.
- Quarterly prepay as the middle option (5% off, setup half-waived) for
  agencies that can't do annual POs.
- Cash-flow math: one Agency annual = $4,490 collected day one ≈ the cash of
  10 monthly customers' first month. At early stage, 10 annual deals ≈
  $45K runway added immediately.

### 4c. Land-and-expand via the per-account meter

- Entry price is deliberately low relative to the expansion path. An Agency
  customer who grows from 10 → 18 accounts pays $449 + 8×$35 = $729/mo with
  zero sales touch — expansion revenue that compounds as *their* business
  grows.
- Per-account overage should be **self-serve and instant** (they add an
  account in `AddAccountDialog`, we bill it). Never make growth ask
  permission.
- Nudge rule: when overage ≥ the next tier's delta for 2 consecutive months,
  auto-offer the upgrade ("you'd save $X on Scale"). Goodwill + upsell in one
  motion.

### 4d. Founding-member window (launch-phase only)

While in waitlist/approval mode (which the product literally already runs —
`request_access` → admin approval), exploit scarcity honestly:

- "Founding member" pricing: 30–40% off the target list price, **locked for
  life, annual prepay only.** E.g. Agency at $279/mo billed annually
  ($3,349/yr).
- This converts the waitlist into upfront cash at exactly the stage cash
  matters most, creates urgency ("rate disappears at GA"), and seeds
  reference customers. List prices in §3 stay the public anchor so the
  discount reads as real.

---

## 5. Trial design

- **14-day trial, card required, on Starter or Agency** — but the real trial
  is the **first account free forever** pattern: let anyone connect/upload
  ONE ad account and generate strategy+briefs indefinitely, gated from
  optimization loop and exports. The self-healing demo-account plumbing
  (`demoAccountSafeguard.ts`) shows the infrastructure temperament for this
  already exists.
- Free-single-account COGS: ~$1–5/mo worst case — cheap acquisition compared
  to paid CAC, and every free user is one connected Meta account away from an
  upgrade conversation.
- Alternative if free-forever feels too loose at launch: 14-day full-featured
  trial, and the trial's generated strategy doc is watermarked/locked to
  export until conversion ("your strategy is ready — activate to export").

---

## 6. Instrumentation before launch (do this first)

Pricing confidence requires measured usage. Cheap additions:

1. **Log token usage per run** — the Anthropic response `usage` object
   (input_tokens/output_tokens) should be persisted on `generation_runs`
   (add `input_tokens`, `output_tokens`, `repair_used` columns). This turns
   §1 from estimates into a live COGS dashboard.
2. Track runs/account/month and accounts/customer to validate the fair-use
   assumption and the tier boundaries (3/10/30).
3. Define fair use concretely in ToS: e.g. "up to 60 generation runs per
   account per month" — a ceiling ~10× normal usage that no honest customer
   hits, purely an abuse valve.

---

## 7. Open decisions

- [ ] Confirm the entry price ($99 vs $149) after 5–10 waitlist-customer
      interviews — willingness-to-pay, not cost, decides this.
- [ ] Setup-fee amounts vs. waiver — test on the next 5 approvals.
- [ ] Whether Creative Scan / optimization loop is the right Agency-tier
      differentiator once those stages ship in-app.
- [ ] Billing rails (Stripe) + entitlement enforcement (accounts/seats caps
      map cleanly onto existing `user_ad_accounts` grants + `users.role`).
- [ ] Revisit COGS when the 7-stage pipeline ships — decide then whether to
      move mechanical stages to Haiku 4.5 / Batch API (§1 levers).
