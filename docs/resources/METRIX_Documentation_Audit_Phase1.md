# Metrix IAP Documentation Audit — Cohort-Aware Migration

### Phase 1: Identification, Gap Analysis & Repair Roadmap

**Audit date:** July 5, 2026 **Scope:** Google Drive (Metrix IAP project folder), Claude.ai Personal Skills, project knowledge files, prior audit history **Reference standard:** `METRIX_Cohort_Architecture_v1` (delivered previously) **Method:** I opened and read the actual documents — not just folder names — including the two documents where the hardcoded logic lives, and a prior audit you commissioned in October 2025 that used this exact same audit format for a different issue.

---

## The headline finding

You have **three copies of the same 11-prompt system**, all built from the same original documents, all carrying the identical hardcoded assumption:

| Layer | Where it lives | Current state |
| :---- | :---- | :---- |
| **Google Drive canonical docs** | `Metrix IAP` project folder, in `ANALYSIS`, `STRATEGY`, `BRIEFS`, `REPORTS`, `METRIX SPRINT TEST`, `MST OPTIMIZATION LOOP`, `DOCUMENT LIBRARY` subfolders | Original source. Ecommerce-hardcoded. |
| **Project knowledge files** | This Claude project's attached `.docx` files | Mirror of the Drive docs, same content, same gap. |
| **Claude.ai Personal Skills** | `/mnt/skills/user/metrix-*` (the operational layer you actually run work through today) | Repackaged into skill format in May 2026, but the repackaging **carried the same hardcoded logic forward untouched** — it fixed nothing structural. |

This matters for your rollout sequencing: **fixing only the Skills layer without also fixing the Drive canonical docs means the "official" documentation will contradict the tool you actually use.** The Skills are what executes; the Drive docs are what you and any future hire will read as the spec. Both need the same fix, applied once and propagated, not fixed independently (which is how you'd end up with the CN_PainFirst-style drift your October audit already had to clean up once).

---

## 1. Identification & Audit — what exists, and what's hardcoded

### The 11-document canonical system (confirmed present in all three layers)

| # | Document | Folder | Cohort-hardcoded? |
| :---- | :---- | :---- | :---- |
| 1 | `SYSTEM_CONTEXT_IAP_ANDROMEDA` | DOCUMENT LIBRARY | No direct funnel logic, but defines the variable system these fixes plug into |
| 2 | `IAP_SYSTEM_COMPLETE_ARCHITECTURE` | DOCUMENT LIBRARY | **Yes** — describes the pipeline in ecommerce terms throughout |
| 3 | `IAP_IMPLEMENTATION_GUIDE` | DOCUMENT LIBRARY | Indirect (references the hardcoded prompts) |
| 4 | `IAP_DATA_BUNDLE_PREP()` | ANALYSIS | **Yes — critical.** Expected columns list is: *"Add to Cart, Initiate Checkout, Purchase, Cost per Purchase, ROAS."* No lead/service/app columns exist in the ingestion contract at all. |
| 5 | `IAP_ANALYSIS_CORE()` | ANALYSIS | **Yes — critical.** Dimension 1 (Buyer Intent Funnel) is hardcoded to `click_to_atc_rate → atc_to_checkout_rate → checkout_to_purchase_rate`. Dimension 11 outputs `projected_combined_roas` as the terminal metric. |
| 6 | `IAP_REPORT_SUMMARY(mode)` | REPORTS | Indirect — templates inherit ROAS/AOV-shaped hero metrics from Analysis Core's output |
| 7 | `IAP_STRATEGY_MAP()` | STRATEGY | Indirect — ICP budget allocation logic implicitly assumes purchase-value ROI |
| 8 | `IAP_BRIEF_BUILDER(mode, voice, asset_type)` | BRIEFS | Indirect — proof-type defaults skew toward ecommerce creative patterns (UGC, product demo) |
| 9 | `MST_METHOD_REFERENCE` | METRIX SPRINT TEST | No — this one is genuinely cohort-agnostic (matrix mechanics, not funnel logic). **Keep as-is.** |
| 10 | `MST_CREATIVE_SCAN()` | METRIX SPRINT TEST | No — validates naming/tagging, not funnel metrics. **Keep as-is.** |
| 11 | `MST_TEST_ENGINE()` | METRIX SPRINT TEST | **Yes — critical.** Performance data explicitly lists *"Funnel metrics (Add to Cart, Initiate Checkout, Purchase)"* as required input, and matrix verdict thresholds (Scale/Optimize/Retire) are tuned to ROAS/CPA. |
| — | `VARIABLES_REGISTRY` | STRATEGY | No — this is the creative-language layer (concepts, hooks, tones), completely orthogonal to funnel/cohort logic. **Keep as-is.** |
| — | `IAP_OPTIMIZATION_LOOP()` | MST OPTIMIZATION LOOP | **Yes** — re-weighting formulas reference ROAS lift specifically. |

**Bottom line: 5 of 11 documents need direct repair. 4 more need a one-line propagation of the same fix. 2 (MST_METHOD_REFERENCE, MST_CREATIVE_SCAN) and the VARIABLES_REGISTRY need nothing — they're already correctly cohort-agnostic.** This is a narrow, surgical fix, not a rebuild — consistent with what I found when I first read the skill files.

### Legacy / superseded documents found (predate the Oct 25, 2025 "Final Phase" consolidation)

These sit at the top level of the Metrix IAP folder, dated Sept 29 – Oct 25, 2025, all created *before* the 11-document system was finalized:

- `Prompt Consolidation / Optimization`
- `Prompt Consolidation, Optimization & Missing`
- `🧠 IAP Prompt Library Blueprint`
- `🧠 IAP DOCUMENTATION QUALITY & STATUS REVIEW`
- `🧠 METRIX IAP PROMPT CHAIN MAP – STRUCTURE OVERVIEW`
- `Metrix AI Agent: Complete Prompt Architecture & Learning Loop`

These are early drafts that were explicitly superseded — the 11-doc system's own completion summary calls them out as "consolidated" *from* these documents. They contain earlier, rougher versions of the same ecommerce-only logic (e.g., the Prompt Chain Map references only "ROAS drivers" with no mention of leads or installs). **They are not currently in use anywhere and are safe to archive** — keeping them live risks someone opening one during a future audit and mistaking it for current spec.

### Prior audit precedent found

A prior comprehensive audit exists (`IAP ECOSYSTEM: COMPREHENSIVE SYSTEM AUDIT`, Oct 26 2025, in the AUDITS folder) addressing a *different* problem — the CN_PainFirst variable misclassification, missing CTA variable type, and MST concept-context ambiguity. It resulted in a full "Critical Fixes Implementation Guide" that was executed. **This is directly useful precedent**: it establishes that your documents have been surgically patched once before without a rebuild, using exactly the find-and-update-in-place method this cohort fix also needs. I've mirrored its structure below since it's a format you've already validated works for your team.

---

## 2. Gap Analysis — what's inaccurate or incomplete under the cohort model

| Document | What it currently assumes | What breaks for a non-ecommerce account | Severity |
| :---- | :---- | :---- | :---- |
| `IAP_DATA_BUNDLE_PREP()` | Every account has ATC/Checkout/Purchase/ROAS columns | A lead-gen or service account has none of these — the ingestion contract will either reject the file or silently accept zeros that read as total failure | **Critical** |
| `IAP_ANALYSIS_CORE()` | Buyer Intent Funnel is always Click→ATC→Checkout→Purchase; terminal metric is always ROAS | Service accounts have no ATC or ROAS at all; running this as-is either fabricates a funnel that doesn't exist or produces a false "underperforming" verdict on an account that's actually working fine on its real terminal metric (cost-per-registration) | **Critical** |
| `MST_TEST_ENGINE()` | Required performance data includes ATC/Checkout/Purchase; verdict thresholds tuned to CPA/ROAS bands | An MST sprint run on a service or app-only account produces Scale/Optimize/Retire verdicts using the wrong threshold bands entirely — a creative could be mislabeled "Retire" simply because it's being judged against ecommerce math | **Critical** |
| `IAP_STRATEGY_MAP()` | Budget allocation logic implicitly assumes purchase-value ROI | ICP prioritization for a lead-gen client would rank segments by a metric (ROAS) that doesn't exist for them | **High** |
| `IAP_BRIEF_BUILDER()` | Proof-type defaults skew ecommerce (UGC, product demo) | Service/lead-gen accounts need authority/credential/case-outcome proof as defaults, not product-demo proof — briefs generated today would recommend the wrong creative approach for these accounts | **High** |
| `IAP_REPORT_SUMMARY(mode)` | Hero metric tile assumes ROAS/AOV | A service-only client's report would either show a blank ROAS tile or, worse, a fabricated one | **High** |
| `IAP_OPTIMIZATION_LOOP()` | Re-weighting formulas reference "ROAS lift" specifically | Re-weighting a service account's variables against ROAS lift is re-weighting against a number that isn't there | **Medium** (only activates after MST sprints on non-ecommerce accounts begin) |
| `IAP_SYSTEM_COMPLETE_ARCHITECTURE` | Describes the whole pipeline in ecommerce terms as the running example | Not a functional bug (it's documentation, not executable), but it's what anyone reads first to understand the system — currently it teaches the wrong mental model | **Medium** |

**What does *not* need repair, and why that matters for scope control:**

`VARIABLES_REGISTRY`, `MST_METHOD_REFERENCE`, and `MST_CREATIVE_SCAN()` operate one layer below business-model logic — they're about creative language (concepts, hooks, tones) and matrix mechanics, not conversion funnels. This confirms the fix is genuinely narrow: **you are not rebuilding the IAP system, you are patching the funnel/terminal-metric assumption in 5 places and propagating it to 3 more.** Worth stating plainly so this doesn't balloon into a bigger project than it needs to be.

---

## 3. Official Documentation Roadmap — the Source of Truth hierarchy

Right now you have duplication risk: the same document exists as a Drive doc, a project-knowledge `.docx`, and a Claude Skill, and nothing declares which one wins if they disagree. Here's the structure I'd put in place:

### Tier 0 — Canonical source (edit here, nowhere else)

**Google Drive, `Metrix IAP` project folder.** This is the single place documents get edited. Every other copy is a **generated mirror**, not an independent source.

### Tier 1 — Core Logic (business-model-agnostic, never touched per-client)

- `SYSTEM_CONTEXT_IAP_ANDROMEDA`
- `VARIABLES_REGISTRY`
- `MST_METHOD_REFERENCE`
- **New addition needed:** `COHORT_FUNNEL_REGISTRY` — the reference file defining the four cohort funnels (ecommerce/lead_gen/service/app), stages, intent-score weights, and terminal metrics from the Cohort Architecture doc. This becomes a first-class Tier 1 document, not a footnote inside `IAP_ANALYSIS_CORE`.

### Tier 2 — The 11 Execution Prompts (cohort-aware after repair)

The full `IAP_DATA_BUNDLE_PREP → ANALYSIS_CORE → REPORT_SUMMARY / STRATEGY_MAP → BRIEF_BUILDER → MST_CREATIVE_SCAN → MST_TEST_ENGINE → OPTIMIZATION_LOOP` chain. All 11 read Tier 1 as shared context; none of them hardcode business-model assumptions once repaired.

### Tier 3 — Client-Specific Configuration (never touches Tier 1 or 2 logic)

- `account_config` per client — `enabled_cohorts`, `conversion_event_map`, `kpi_targets` (this is new; doesn't exist as a document yet, needs to be created per the Cohort Architecture spec)
- `local_client_library` per client — ICPs, local concept codes, design codes (KOV/Bookster/EDBIO notes already partially exist under `metrix-client-library`)

### Tier 4 — Navigation & Onboarding

- `00_PROJECT_COMPLETION_SUMMARY`, `01_FILE_NAVIGATION_INDEX`, `IAP_IMPLEMENTATION_GUIDE` — these point at Tier 1–3, they don't contain logic themselves. Update once Tier 1/2 changes land, not before.

### Tier 5 — Archive (read-only, historical reference only)

- The six pre-consolidation drafts listed in Section 1
- The October 2025 CN_PainFirst audit + implementation guide (historically important, not currently actionable — keep for precedent, label clearly as resolved/closed)

**The propagation rule going forward:** Drive is edited first. Project-knowledge `.docx` files and Claude Skills are re-synced from Drive after Drive is confirmed correct — never the reverse. This is exactly the sequencing gap that let the Skills conversion carry the ecommerce assumption forward silently in May; a one-directional sync rule prevents that recurring.

---

## 4. Remediation Strategy — Repair Briefs

### Repair Brief 1 — `IAP_DATA_BUNDLE_PREP()` (Critical)

**What's wrong:** Expected Columns list hardcodes `Add to Cart, Initiate Checkout, Purchase, Cost per Purchase, ROAS` as required. **What to do:** Add a new "Cohort Metric Blocks" subsection alongside Expected Columns. Base 61 stays required always. Ecom 24 / Service 18 / App 22 become conditionally required based on the client's `enabled_cohorts`. Add validation logic: if a cohort is enabled but its columns are absent from the export, flag as a data-quality issue — not a silent skip, not a hard failure. **Depends on:** `COHORT_FUNNEL_REGISTRY` existing first.

### Repair Brief 2 — `IAP_ANALYSIS_CORE()` (Critical)

**What's wrong:** Dimension 1 and Dimension 11 hardcode the ecommerce funnel and ROAS as terminal metric. **What to do:** Dimension 1 runs once per enabled cohort, pulling stage definitions and intent-score weights from `COHORT_FUNNEL_REGISTRY` instead of the fixed ATC/Checkout/Purchase list. Dimension 11's `winning_variable_stack` output gets a `terminal_metric` field whose name and meaning is cohort-specific. Multi-cohort accounts get parallel cohort sections, never a blended cross-cohort score. **Depends on:** Repair Brief 1 (needs cohort-tagged data from the bundle).

### Repair Brief 3 — `MST_TEST_ENGINE()` (Critical)

**What's wrong:** Required performance data list and verdict thresholds (Scale/Optimize/Retire) are ecommerce-tuned. **What to do:** Verdict thresholds become parametrized per cohort — cost-per-registration bands for service, cost-per-install bands for app, CPA/ROAS bands for ecommerce. The "Funnel metrics" input requirement becomes cohort-conditional, matching Repair Brief 1's logic. **Depends on:** Repair Brief 2 (needs the cohort-aware analysis output as input).

### Repair Brief 4 — `IAP_STRATEGY_MAP()`, `IAP_BRIEF_BUILDER()`, `IAP_REPORT_SUMMARY(mode)`, `IAP_OPTIMIZATION_LOOP()` (High/Medium)

**What's wrong:** Each inherits the ROAS-shaped terminal metric from Analysis Core, one level removed. **What to do:** Same one-line pattern repeated four times — each reads `enabled_cohorts` and swaps its terminal-metric variable name and threshold set accordingly. `IAP_BRIEF_BUILDER` additionally needs a service/lead-gen proof-type variant set added (authority/credential/case-outcome), since its current defaults assume ecommerce creative patterns. **Depends on:** Repair Brief 2 must be validated first — these four should not be touched until the upstream fix is proven on a real account.

### Repair Brief 5 — `IAP_SYSTEM_COMPLETE_ARCHITECTURE` (Medium, documentation-only)

**What's wrong:** Uses ecommerce as the sole running example throughout, teaching the wrong mental model to anyone onboarding. **What to do:** Add the cohort concept to the executive overview, and swap at least one example passage to a hybrid account (Doro-style) so new readers see the multi-cohort case immediately, not as an afterthought. **Depends on:** Nothing — can be done in parallel with the others, lowest risk.

### What does NOT get a repair brief

`VARIABLES_REGISTRY`, `MST_METHOD_REFERENCE`, `MST_CREATIVE_SCAN()`, `SYSTEM_CONTEXT_IAP_ANDROMEDA` — confirmed cohort-agnostic on read-through. Touching these would be scope creep against a problem they don't have.

---

## 5. Deliverable Standards — Must-Keep / Must-Repair / Must-Archive

### ✅ Must-Keep (no changes needed)

| Document | Why it's safe |
| :---- | :---- |
| `VARIABLES_REGISTRY` | Creative-language layer, orthogonal to funnel logic |
| `MST_METHOD_REFERENCE` | Matrix mechanics, not funnel-dependent |
| `MST_CREATIVE_SCAN()` | Naming/tagging validation, not funnel-dependent |
| `SYSTEM_CONTEXT_IAP_ANDROMEDA` | Andromeda platform principles, unrelated to business model |
| October 2025 CN_PainFirst audit + fix guide | Historically resolved, keep as precedent record only |

### 🔧 Must-Repair (in dependency order)

| Order | Document | Priority |
| :---- | :---- | :---- |
| 1 | *New:* `COHORT_FUNNEL_REGISTRY` (create, doesn't exist yet) | Prerequisite for everything below |
| 2 | `IAP_DATA_BUNDLE_PREP()` | Critical |
| 3 | `IAP_ANALYSIS_CORE()` | Critical |
| 4 | `MST_TEST_ENGINE()` | Critical |
| 5 | `IAP_STRATEGY_MAP()` | High |
| 6 | `IAP_BRIEF_BUILDER()` | High |
| 7 | `IAP_REPORT_SUMMARY(mode)` | High |
| 8 | `IAP_OPTIMIZATION_LOOP()` | Medium |
| 9 | `IAP_SYSTEM_COMPLETE_ARCHITECTURE` | Medium, documentation-only |

### 🗄️ Must-Archive (move to a labeled archive folder, stop treating as live reference)

- `Prompt Consolidation / Optimization`
- `Prompt Consolidation, Optimization & Missing`
- `🧠 IAP Prompt Library Blueprint`
- `🧠 IAP DOCUMENTATION QUALITY & STATUS REVIEW`
- `🧠 METRIX IAP PROMPT CHAIN MAP – STRUCTURE OVERVIEW`
- `Metrix AI Agent: Complete Prompt Architecture & Learning Loop`

None of these are referenced by the current 11-document system's file navigation index — they're dead weight that could confuse a future audit (yours or a developer's) into treating a superseded draft as current.

---

## Recommended next phase

Don't touch all five critical/high documents at once. The sequencing that actually de-risks this:

1. **Build `COHORT_FUNNEL_REGISTRY` first** and validate it against one real hybrid account (Doro — already running `app` + `lead_gen`) before touching anything else.
2. **Repair `IAP_DATA_BUNDLE_PREP()` and `IAP_ANALYSIS_CORE()` together** — they're a matched pair, test them as one unit against Doro's real data.
3. **Only then repair `MST_TEST_ENGINE()`**, since it consumes Analysis Core's output and any error there would otherwise get validated twice.
4. **Propagate to Strategy Map / Brief Builder / Report Summary / Optimization Loop last**, once the upstream pattern is proven, not theoretical.
5. **Archive the six legacy drafts** — this is zero-risk and can happen immediately, independent of everything else.
6. **Sync Skills and project-knowledge `.docx` copies from Drive only after Drive is confirmed correct** — never edit the three layers in parallel.

Want me to start on Step 1 — drafting the actual `COHORT_FUNNEL_REGISTRY` document in the exact format your other Tier 1 docs use, ready to drop into the `DOCUMENT LIBRARY` folder?
