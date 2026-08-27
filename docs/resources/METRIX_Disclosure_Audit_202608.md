# METRIX — Disclosure audit: what is hidden behind a hover

**Audit only. No code was changed for this document.**

## The rule being audited

> Info tooltips and hovers are for **descriptors** — what a thing is, where a number
> came from, why a value is absent, and warning triggers. They are **not** for the
> IAP loop's own outputs: the analysis, strategy, brief and recommendation content a
> run produces for the user to read.

Applied to every hover-gated surface in `artifacts/metrix-iap/src`: 56 tooltip strings
across `SectionInfoIcon` / `InfoTooltip`, and 25 `DetailReveal` instances.

## Verdict in one line

**The tooltips are almost entirely correct. The `DetailReveal` popovers are where the
rule is broken** — they gate run output, not descriptions of it.

| Primitive | Count | Verdict |
|---|---|---|
| `SectionInfoIcon` / `InfoTooltip` | 56 strings | Correct use. These describe metrics, lineage, and why a value is null. Leave them. |
| `DetailReveal` | 25 instances | 14 gate IAP run output. This is the violation. |

---

## Tier 1 — output that is entirely invisible until clicked

Nothing of the content appears on the face. The reveal's label is either a static
string or a *different* field.

| # | Site | What is hidden | Why it matters |
|---|---|---|---|
| T1.1 | `components/deck/NextBestActionCard.tsx:131` | **`recommendedAction`** | The label is the literal string "Why this action", so the recommended action itself never appears on the card. Worse, the card already renders `card.rationale` in full above it — so the reveal shows the rationale **twice** and the action **once, hidden**. The output is behind the click; the supporting detail is on the face. Exactly inverted. |
| T1.2 | `pages/metrix/strategy/StrategyMapView.tsx:671` | **`why_it_matters`** | The label shows `plain_descriptor` instead, so a pillar's strategic justification — the reason the pillar exists — is only reachable by clicking. On the page whose entire job is explaining strategy. |
| T1.3 | `pages/metrix/strategy/HypothesisQueueView.tsx:287` | **`why_it_matters`** | Same pattern, same field, second page. |

## Tier 2 — output truncated to ~72 characters, remainder behind a click

These use `deriveLabel(text, 72)` as the visible label. The reader gets the first clause,
cut at a word boundary, and must click to finish the sentence.

| # | Site | Field |
|---|---|---|
| T2.1 | `strategy/AvatarsView.tsx:482` | `profile.strategic_recommendation` — sits under a "Recommendation" header, truncated |
| T2.2 | `strategy/AvatarsView.tsx:414` | `profile.psychographic_profile` |
| T2.3 | `strategy/AvatarsView.tsx:274` | `messageResonance` |
| T2.4 | `strategy/StrategyOverview.tsx:307` | `playbook.budget_reallocation_note` |
| T2.5 | `strategy/strategyShared.tsx:529` | `playbook.budget_reallocation_note` (2nd site) |
| T2.6 | `mst/MstDirectionView.tsx:173` | `playbook.budget_reallocation_note` (3rd site) |
| T2.7 | `strategy/strategyShared.tsx:384` | `pillar[key]` — pillar prose fields |
| T2.8 | `AdAccountOverview.tsx:353` | Control read |
| T2.9 | `AdAccountOverview.tsx:380` | Control read |
| T2.10 | `analysis/AnalysisOverview.tsx:1241` | Control read |
| T2.11 | `analysis/AnalysisOverview.tsx:1265` | Control read |

`budget_reallocation_note` appearing at three separate sites with the same treatment is
worth noting on its own: it is not a local decision, it is a pattern that spread.

## Tier 3 — correct, leave alone

The 56 tooltip strings, and the `DetailReveal` uses that genuinely gate *descriptions*:
`settings/UsersPermissionsView.tsx:1017` (access policy), `ManualAnalysisControls.tsx:1278`,
`settings/GeneralView.tsx:490`. These answer "what is this", which is the rule's intent.

---

## Why this happened

It is not carelessness — it is a documented standard applied one level too broadly.
`replit.md` states the platform's cognitive-descaling rule:

> "Primary dashboard surfaces show concise labels only — `deriveLabel(text, max)`
> truncates mechanically at a word boundary, and full prose lives behind `DetailReveal`."

That rule is right for a **dashboard tile**, where the user is scanning. It was then
applied to **strategy and recommendation surfaces**, where the user is not scanning —
they arrived specifically to read the output. `deriveLabel` cannot tell the difference,
so every prose field got the same treatment.

The distinction the codebase is missing is not length. It is **what the text is**:

- **A descriptor** explains the product to the user. Hover is correct.
- **An output** is what the user paid the product to produce. It belongs on the page.

## Recommended resolution (not implemented)

1. **Split the primitive.** `DetailReveal` keeps its current behaviour for descriptors.
   A second component — an inline, expandable block rather than a popover — carries run
   output: first paragraph visible at the 14px body floor, "Show more" for the rest.
   Nothing is truncated mid-clause and nothing requires a click to begin reading.
2. **Fix T1.1 first regardless.** A recommended action that only exists inside a popover,
   on a card whose purpose is to recommend an action, is the single clearest instance —
   and the duplicated rationale means the fix also removes a repetition.
3. **Consolidate `budget_reallocation_note`** into one component while changing it, since
   it has already drifted across three sites.
4. **Leave every tooltip alone.** They are doing their job.

## Scope estimate

14 sites, 8 files. Tier 1 is three small, self-contained changes. Tier 2 is mechanical
once the inline-disclosure component exists. The risk is not technical — it is that
surfacing this much prose fights the Phase 3 brief's "reduce visible text 30–50%"
mandate, which is why the split by content *kind* matters more than any per-site call.
