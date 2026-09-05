# Reference Package: Screenshot Audit Batch — Sep 5 2026

**Status:** Draft — ready for Claude Code implementation planning
**Origin:** 9 screenshots with embedded filenames-as-notes (batch 1) + 5 Execution Layer screenshots (batch 2, item 10), cross-referenced against live `metamktg/metrix-iap` @ `main`
**Companion spec:** Item 1 below extends `SPEC_ad_id_anchored_creative_mapping.md` (same conversation, Aug 29) — read that first for the ad_id/concept_id architecture this builds on.

Each item states what's confirmed from source vs. what's a judgment call needing your input, per the standing accuracy bar on this project.

---

## 1. Naming-convention pattern recognition → variable library population

**Your note (elaborated):** the system already infers something useful from ad names on import — Strategy Map screenshots earlier in this thread showed concept codes like `H1`, `H2`, `C2` appearing without you manually typing them in. You want to formalize this: recognize a client's *own pre-existing* naming convention (their habits before they ever touched Metrix) as a distinct, first-class signal — separate from Metrix's standard preset IAP variable taxonomy — and use it to populate the variable library more intelligently. Critically, you flagged that ad copy (primary text, headline, description) is *also* always auto-deconstructed into variables, so this reconciliation has to be aware of the whole pipeline, not just the visual-asset side.

### 1.1 What's confirmed from source

- Concept identity currently gets derived once, at first `ad_id` encounter, via `primaryPerfRow()` in `creative-assembly.ts:45` — this is the exact mechanism the prior spec (Aug 29) proposed anchoring to `ad_id_concept_map` instead of re-parsing every time. That architecture is the right foundation for what you're describing now: a *persisted* first-assignment event is exactly where "recognize the client's own naming pattern" would hook in.
- Ad copy deconstruction is real and separate: `deconstructionEngine.ts` classifies uploaded creative assets (images, and video via extracted keyframes) against the IAP variable registry — this is the visual-asset side. Copy-side deconstruction (primary text/headline/description → variables) is a distinct pipeline that also writes into the same library, confirmed by the Creative Overview tab's "Copy" section (`CreativeExpandDialog.tsx:204-215`) rendering `primaryText`/`secondaryText`/`cta` as first-class fields alongside the variable stack.

### 1.2 The distinction you're asking to formalize

Per your Local Client Library architecture (already canonical, per project memory): **Global Master Variables** (`CN_`, `FW_`, `TN_`, `HK_`, `ST_`, `AW_`, `HP_`, `PR_`, `CTA_`) are universal and immutable. **Local Client Master Library codes** are client-specific. What you're describing now is a *third* category sitting between these two: patterns a client already had baked into their ad names before Metrix existed — not a Global preset, not yet a formalized Local Client code, but a recognizable, recurring signal in their raw naming habits (e.g., they always suffix video variants with `_v2`, or always name a hook concept starting with a product SKU).

**This needs a decision, not an assumption on my part:** should a naming-convention pattern recognized this way (a) auto-promote into the Local Client Master Library once seen with enough consistency/confidence, (b) stay in a separate "discovered pattern" holding area for human review before promotion, or (c) something else? Given the 95%-confidence standing rule on this project and that this touches the variable taxonomy directly, I don't want to guess which of these you want — this is the single most consequential open decision in this whole batch.

### 1.3 What needs to be true end-to-end (per your explicit flag)

Any reconciliation design has to account for all three deconstruction sources landing in the same library, not just the visual one:
1. Visual asset classification (image/keyframe → IAP variable registry match)
2. Copy deconstruction (primary text/headline/description → variables)
3. Naming-convention pattern recognition (this new item) — operating on the `ad_id`'s name string itself, independent of the asset's visual or copy content

A pattern recognized from naming convention could describe the *same* underlying concept a copy or visual deconstruction also independently identifies — the reconciliation has to de-duplicate/cross-validate across all three sources rather than let naming-pattern-derived variables silently conflict with copy-derived or visual-derived ones for the same cell.

### 1.4 Resolved design direction (per your answer)

**Confirmed mechanism: threshold-gated alert, not auto-promotion.** A candidate pattern only becomes a real Local Client Library variable after a human approves it from a flagged queue — never silently written in. This reuses the existing Deck/Task Tray/Dismissed swipeable-card UI convention already live on this platform (`Optimization loop`, see Item 5) rather than inventing a new review mechanism — same interaction model, new content type.

**Pattern Miner — three recognizable classes, per your framing:**
1. **Version/variant markers** — `v1`, `v2`, `v3` and equivalents. Sequential, low-cardinality, near-universal across advertisers — these are almost certainly safe to recognize with a lighter confidence bar than the other two classes.
2. **Media-type markers** — `vid`, `stc`, `ugc` and equivalents. A small, closed, recognizable vocabulary (short abbreviations for format/production-type).
3. **Free-form recurring tags** — seasonality (`bfcm`, `q4`, `holiday`), offer/promo names (`50off`, `flashsale`). Open-ended, higher variance, needs frequency + positional consistency across many ad names before it's confidence-worthy — this is the class most likely to produce false positives if the threshold is set loose.

**Reconciliation ("what makes one, one and two, two") — normalization before dedup.** Before a candidate pattern gets flagged, it needs the same normalization discipline already established in the Aug 29 filename-matching spec: case-fold, strip separators, collapse common synonym variants (`v2` / `ver2` / `V.2` should resolve to the same candidate, not three). Skipping this step would flood the review queue with near-duplicate alerts for what a human would immediately recognize as one pattern.

**Hard boundary — standard IAP concept codes are never touched.** The existing concept-code pattern (`\bC\d+[A-Z]\b` — e.g. `C2B`, `C4E`, confirmed in `tokenizeConceptCodes.ts:7`) is Metrix's own canonical ID space. The pattern miner must exclude any token matching this regex from consideration entirely — it's already a first-class Metrix identifier, not a candidate for "discovery." This needs to be an explicit exclusion rule in the miner, not an assumption that the two namespaces just happen not to collide.

**End-to-end requirement — discovered patterns still resolve to standard variables.** Per your instruction, a discovered/approved pattern can't become an orphaned, disconnected client-only tag. It must cross-reference the standard Global Master Variable taxonomy so it sits correctly in the IAP Library. Concretely: the registry confirms real prefixes are `HK` (Hook), `TN` (Tone), `FW` (Framework), `CN` (Concept), `PR` (Proof type), `CTA`, `AW` (Awareness — registry_missing, a documented gap), `ST` (Structure — registry_missing), `HP` (Pain proof, **not** "Hook position" — corrected in `variable-registry.ts:26-27`), `ICP` (persona reference) — confirmed exact set from `variable-registry.ts:6-17`. None of these currently cover a "media type" or "version/variant" axis, which means a discovered pattern in classes 1–2 above may need either a new registry family (a real product decision, not mine to make unilaterally) or a documented mapping to the nearest existing family. This is worth a short design pass with you once the miner itself is built, rather than guessing the taxonomy fit now.

---

## 2. "V3" / "C4E" placement signal labels are unexplained internal schema names

**Confirmed from source, and an honest dead end:** `V3` and `C4E` are literal field-name fragments from the data-bundle schema (`v3_placement_signal`, `c4e_placement_signal` — `scripts/src/metrix-supabase/import.ts:1689-1703`, `artifacts/api-server/src/lib/metrixSeedAssembly.ts:445-446`), carried straight through to the UI (`PlacementsView.tsx:246`, `BudgetView.tsx:405`) with no renaming or explanation layer. I searched the repo, the `.agents/memory` notes, and the `metrix-data-bundle-prep` skill doc for what these names actually denote (a data-source/version distinction, most likely — two different placement-breakdown pathways) and could not find an authoritative definition anywhere. This means the label reaching your screen was never meant to be end-user-facing — it's an internal bundle-schema artifact that leaked through.

**Root cause, traced through actual git history — this confirms your hunch exactly.** I cloned the repo with full history and pickaxe-searched for the literal string. It first enters the codebase in the app's very first foundational commit (`7dceabe`, Jul 4 2026, "Add foundation for Metrix IAP web application") — not written by hand, but present inside an attached reference file from that commit: `attached_assets/bookster_book2_iap_local_client_library_augmented_(1)_1783159850508.json`. That file's own `source_map` says explicitly:

> `"IAP-Device-SIGNAL-BOOK (4).csv"` — *"Device/placement/ad performance, including **V3 checkout event**."*

So **"V3" is Bookster's own name for a specific custom checkout conversion event in their Meta setup** — not a Metrix versioning concept at all. "C4E" is very likely a reference to concept code `C4E` (a real, valid concept code format elsewhere in the registry) — meaning the two placement-signal buckets were probably just "placement data associated with the V3 checkout event" and "placement data associated with concept C4E," two client-specific slices from Bookster's own file, not two general-purpose data pathways.

**What happened, mechanically:** the ingestion schema (`import.ts`, `metrixSeedAssembly.ts`) was built by taking Bookster's own JSON field names directly as the universal schema's column/key names, instead of abstracting them into client-agnostic labels at ingestion time. That's how one client's internal event-naming shorthand ended up hardcoded into every account's UI, Bookster or not.

**Recommendation:** rename `v3_placement_signal` / `c4e_placement_signal` to something that describes what the data actually *is* structurally (e.g. by its real distinguishing property — source export type, or whatever the two CSVs Bookster provided actually differed by), not what Bookster happened to call it. This touches the DB column names (`placement_signal.signal_scope` values `'v3'`/`'c4e'`), the seed assembly, and every UI surface listed in the original audit — worth scoping as its own small, self-contained rename PR rather than folding into a larger one, since it's schema-wide but mechanically simple once the new names are agreed.

---

## 3. Ad Performance page needs richer, more configurable visualizations

**What's already there, confirmed:** the page already has real infrastructure — `KpiTileRow` with per-tile metric dropdowns (Section 1 of the prior spec covers this primitive in depth), a "Buyer-intent funnel" widget, a "What moved cost per result" delta card, and a Performance Tiers table with per-column sorting (`SORT BY Spend ↓`).

**What's missing, per your note:** more robust breakdowns/filters/segment-breakdowns/sorting across the page as a whole, not just the tiers table. This is a broader ask than a single component fix — it's asking for the same configurability `KpiTile`'s dropdown gives individual metrics to also apply to the page's breakdown/filter dimensions (by segment, by variable, by date grain).

**Resolved scope (per your answer): demographic segment breakdown is the priority.** Right now, demographic/segment data lives entirely on the separate Audience tab (`AudienceView.tsx`) — Ad Performance has none. The segment-computation logic there (`buildAudienceClusters`, `groupSegmentsByAge`) is already a standalone, reusable library function (`lib/audience-clusters.ts:99, 180`), not locked inside the Audience view component — meaning Ad Performance can embed a demographic-segment module by calling the same functions rather than duplicating clustering logic in two places. This also matters for consistency: the same account-level-only demographic-export limitation flagged in Item 1's screenshot (Image 1 — "This import's demographic export is account-level only... concept and variable attribution can't be honestly computed") applies here too, so whatever gets built on Ad Performance needs to surface that same honest limitation rather than re-introduce it as a fresh bug on a second page.

---

## 4. Action-card titles get visually clipped with no way to read the rest

**Confirmed from source:** `NextBestActionCard.tsx:110-111` renders `{card.title}` directly with no `line-clamp`, no truncation-with-disclosure treatment (`DetailReveal` is used elsewhere in the same file for the rationale/recommended-action detail, but not wrapped around the title itself). Two of your screenshots show titles ending mid-phrase with "…" (e.g. "framing ('50…", "...comparison will sustain ≤$24.50 CPP when…").

**One thing I can't confirm without checking the specific multi-card grid render path further:** whether that trailing "…" is (a) a CSS truncation Claude Code needs to pair with a click-to-expand affordance (same fix pattern as the Strategy Map disclosure spec from this thread), or (b) already baked into the stored recommendation text at generation time, in which case the fix is on the generation side (store/display full text, don't pre-truncate the string itself) rather than the rendering side. These need different fixes — worth Claude Code checking which one it is against a real long-title example before patching blindly.

---

## 5. "Optimization Loop" and "Next Best Actions" — swap names, reposition

**Confirmed from source, both on `AdAccountOverview.tsx`:**
- `NextBestActionCard` renders at line 241, **above** `SectionCard title="Account Totals"` (line 245) — this is the section currently showing as "Next best actions" in your screenshot.
- A separate, later section is titled `"Optimization loop"` at line 424 — this is the Deck/Task Tray/Dismissed swipeable card component.

**Your requested change, restated precisely:** rename the component at line 241 (currently surfacing as "Next best actions") to "Optimization Loop," move it to render after `Account Totals` instead of before it; rename the component at line 424 (currently "Optimization loop") to "Next Best Actions." This is a straightforward title-swap-plus-reorder — no ambiguity here, ready to build as stated.

---

## 6. IAP Library — "No cells in selection" is a dead end, not a diagnosis

**What the screenshot shows:** Result Scope locked to "Purchases," every headline tile at zero (`0` cells, `$0` spend, `0` purchases), a warning that "Purchases results were not populated by age/gender," and a large empty region reading "No cells in selection — Adjust the metric selection to see cell performance" — while directly below, "Ads without creative cells (970)" lists hundreds of real, unmapped ad placeholders.

This isn't a data-absence problem — there's clearly a lot of data (970 ads) sitting one section down. The page just isn't telling the reader *why* the Purchases scope returns zero cells when there are visibly hundreds of ads in the account. This is the same class of issue as the Strategy Map disclosure problem from earlier in this thread: the substance exists, but the page's default state doesn't surface the actual reason (e.g., "these 970 ads haven't been deconstructed into creative cells yet — that's a separate step from having performance data").

**Recommendation:** the empty state should name the real cause instead of just offering a filter-adjustment suggestion that won't help — something like surfacing the "Ads without creative cells" count *in* the empty-state message itself ("0 cells for Purchases because none of your 970 ads have been mapped to a creative cell yet — map assets below or via Upload & Run Analysis"), turning a dead end into a next action.

---

## 7. Upload format rejection — real per-file failure, not a blanket format gap

**Confirmed from source, and this is good news:** `.mp4` is explicitly supported — it's in `VIDEO_EXTENSIONS` (`deconstructionEngine.ts:242`) and goes through real `ffmpeg`/`ffprobe`-based keyframe extraction (`videoKeyframes.ts`), not a hardcoded allow/deny list that's missing mp4. The "Unsupported format" status only fires when `ffmpeg` genuinely fails to decode **any** frame across all three sampled timestamps (opening/middle/closing) — this throws a real, already-logged error (`logger.warn(..., "Video keyframe extraction failed")` in `deconstructionEngine.ts:1139`).

**What this means for "yomi rip 1 - 26.mp4" specifically:** this is very likely a genuine per-file decode failure — an unusual codec inside the `.mp4` container, a corrupted or partial file, or something ffmpeg on the Replit runtime can't handle — not a systemic "mp4 isn't supported" policy. The real diagnosis requires the actual logged `frameErr` for this specific upload, which I don't have visibility into from a static code read.

**What's worth fixing regardless:** right now, a genuinely-corrupt-or-exotic-codec file and a truly-unrecognized-extension file both surface as the identical "Unsupported format" label. Distinguishing "we don't recognize this file type at all" from "we tried to decode this specific file and ffmpeg failed" would make the message actually diagnostic instead of a dead end — the second case might be fixable by the user (re-export the file) while the first genuinely isn't supported.

**Open item:** if this keeps happening across multiple uploads (not just this one file), that's a different, more systemic signal — worth checking server logs for a pattern across the actual `frameErr` messages before assuming either "one bad file" or "we need broader codec support."

---

## 8. Performance Tiers showing "Unclassified" — this is accurate, not a bug

**Confirmed from source, and this changes the fix entirely:** tier assignment (`AdPerformanceView.tsx:337-376`) pulls from a `ScalingPlaybook` — the Strategy phase's output. The code comment is explicit: *"Rows the playbook doesn't name stay unclassified — never guessed."* CPA, Link CVR, and CPA-Lift-vs-baseline are all computed independently and correctly (they don't depend on the playbook) — only the tier *bucket* (Scale/Optimize/Validate/Explore/Avoid) depends on Strategy having run for this account.

**This means:** "Pure Path - Yusif" showing all 26 concepts as Unclassified isn't a classification bug — it's the honest, correct state of an account whose Strategy phase hasn't produced a scaling playbook yet. This is consistent with the Strategy Map screenshots from earlier in this thread (same account showed "0 CELLS" on every pillar, no hypotheses linked yet).

**Recommendation:** don't touch the classification logic — it's working as designed. If this is confusing to look at, the fix is a clearer empty-state message ("no scaling playbook yet — run Strategy for this account to populate tiers") rather than any change to how "Unclassified" gets assigned.

---

## 9. "Results by event" should include down-funnel events — real gap, correctly scoped

**Confirmed from source:** the table at `AdAccountOverview.tsx:310-339` renders whatever event types exist in the account's top-level result-event totals (`bottom_line_totals`) — it's already generic, not hardcoded to "Purchases" only. Your screenshot shows only "Purchases" and "Unclassified result type" because that's genuinely all this account's top-level conversion-event data contains today — not a code limitation on this table.

**The real, addable gap:** down-funnel funnel-stage data (adds-to-cart, checkout-initiated) is structurally different from top-level result events — it lives on `CellPerformanceRow.adds_to_cart` / `.checkouts_initiated`, aggregated elsewhere in the codebase already (`buildLibraryMetricCatalog`'s ATC rate / Checkout rate / Cost-per-ATC tiles, `lib/data/metricsCatalog.ts:284-305`). That aggregation logic already exists and is already trustworthy (it uses the strict-coverage `sumStrictWithCoverage` pattern, not a naive sum) — it's just not surfaced in *this particular table*.

**Recommendation:** extend "Results by event" with additional rows for ATC / Checkout-initiated (reusing the existing aggregation from `metricsCatalog.ts`, not rebuilding it), clearly distinguished from the top-level conversion-event rows above them since they represent funnel stages within a purchase journey, not separate Meta conversion events. Leads/Registrations as *additional top-level event types* would require nothing beyond what this table already supports — if an account's Meta data reports those event types, they'd already show up here; if a specific account doesn't have them, that's an ingestion/account-configuration question, not something this table needs to be changed for.

---

## 10. "Execution Layer" (formerly "Command Center") pages — consistency, friction, and navigation

**Scope:** the five stage-landing pages — `AnalysisCommandCenter.tsx`, `StrategyCommandCenter.tsx`, `CreativeCommandCenter.tsx`, `MstCommandCenter.tsx`, plus their `Listen`/`Reports`/`Exports` siblings — the pages your 5 new screenshots show (Strategy, Analysis, Strategy again mid-hover, Creative, MST).

**On the naming itself:** "Command Center" is internal-only — it shows up in file names (`StrategyCommandCenter.tsx`) and code comments, but I couldn't find it rendered anywhere as user-facing text (the actual page titles users see are "Strategy," "Analysis," "Creative," "MST"). That means renaming to "Execution Layer" is a naming-convention decision for the team and codebase (file names, comments, how we all refer to this page type when talking to Claude Code), not a UI copy change — worth confirming that's the scope you want before Claude Code renames 6+ files.

### 10.1 Inconsistency is structural, not just visual — confirmed

There's no shared layout component across these pages — each was built independently. Line counts alone show it: `StrategyCommandCenter.tsx` is 154 lines, `AnalysisCommandCenter.tsx` is 302, `CreativeCommandCenter.tsx` is 237, `MstCommandCenter.tsx` is 717 — nearly 5x the size of Strategy's for what should be a structurally parallel "stage landing hub." They share the same data hooks (`useScopedAdAccountId`, `useMetrixSeed`, `useStageStatus`) but no shared section/layout template. This is exactly why they don't look or feel consistent — there's nothing enforcing consistency at the code level.

**Recommendation:** build one shared `StageLayout`/`ExecutionLayerPage` component that every one of these pages composes from — a real primitive analogous to how `KpiTile` unified metric tiles platform-wide. Each stage supplies its own content, but the header, sub-tab row, and metric-tile-row treatment should render through one shared shell, not five independent implementations.

### 10.2 Warning-banner overuse — confirmed real duplication, not just a visual impression

The "2 staged creatives have not been deconstructed" banner (yellow, with a "Deconstruct 2 creatives" button) appears **identically, verbatim** on both the Analysis Command Center (Image 2) and the Creative Command Center (Image 4) — same account state surfaced as a full-width alert on two separate pages. This is a real, confirmed instance of exactly the friction pattern you're describing: the same non-urgent nudge repeating across the user's path rather than appearing once, contextually, where it's actually actionable.

**Recommendation:** audit every yellow/warning-style banner across these five pages with the question you posed — does it need to be *here*, and does it need to be a full-width interruption rather than a smaller, dismissible or contextual affordance? The staged-creatives banner specifically is a good first case: it likely belongs once, prominently, on the page where deconstruction actually happens (Creative), not repeated as a blocking-style banner on Analysis too.

### 10.3 Parent-nav click behavior — the actual cause of "click before hover expands"

**Confirmed, and this fully explains the frustration:** the sidebar's nav click model (`Sidebar.tsx:130-155`, explicitly documented as a "Metrix v1 design handoff") makes a **single click** on an expandable section toggle its child list open/closed — it does **not** navigate. Only a **double-click within 220ms** navigates directly to that section's Command Center page. A 220ms window is very tight and this behavior isn't discoverable — most people have no reason to know a double-click does something different from a single click in a sidebar.

This is precisely your scenario: a user clicks the parent ("Strategy") expecting to land somewhere, gets an accordion toggle instead (or nothing visibly useful if they've already moved on), and has no idea a hidden double-click shortcut exists.

**Recommendation — this directly resolves itself once §10.1 is done:** since a real, designed Command Center/landing page already exists for every stage, there's no reason single-click shouldn't navigate directly to it. Make single click on a parent nav item navigate to its stage landing page (exactly the "highly aesthetically navigable interface... that brings the user to the desired subpage" you described) — move child-list expansion to an explicit disclosure affordance (a chevron/caret) instead of overloading the primary click target. This removes the double-click shortcut entirely rather than trying to make it more discoverable, since the landing page itself becomes the resolution.

### 10.4 Hover-flyout dismissal is too sensitive — confirmed as a currently-live behavior, not the one already removed

One important distinction worth being precise about: `Sidebar.tsx:208-211` documents that flyout/hover behavior was already tried and **deliberately removed** once — but specifically for the **collapsed rail** mode, because it was "unreliable on a scrolling rail." Your screenshot (Image 3) shows a *different* hover-preview flyout still active in the **expanded** sidebar (hovering "Account Overview" while on the Strategy page pops a small "Updates" preview). This is a separate, currently-live code path from the one already known to have reliability problems — worth Claude Code confirming which mechanism is actually rendering what you're seeing before touching anything, so a fix doesn't accidentally resurrect the exact problem that was already fixed once elsewhere.

**Recommendation:** widen the effective hover hit-area between the trigger and the flyout (a "safe triangle"/bridge pattern — standard fix for exactly this complaint), and/or add a short close-delay (~200–300ms) after mouseleave before the flyout dismisses, rather than closing instantly the moment the cursor crosses the gap. Given the documented history of hover-reliability problems on this component, this should get real cross-browser/cross-viewport testing before shipping, not just a quick CSS padding tweak.

---


| Item | Ready to build as-is | Needs further decision |
|---|---|---|
| 1. Naming-convention → library | Design resolved — see §1.4 | Which registry family discovered patterns map to (defer to a short pass once miner exists) |
| 2. V3/C4E labeling | Root cause confirmed — see revised §2 | Agree on the actual replacement names before the rename PR |
| 3. Ad Performance demographic breakdown | Scope confirmed (demographic, reuse `audience-clusters.ts`) | — |
| 4. Title truncation | Partially — needs one check first (CSS vs. generated-text) | — |
| 5. Optimization Loop / Next Best Actions swap | Yes | — |
| 6. IAP Library empty state | Yes | — |
| 7. Upload format rejection | Partially — needs server log check for this file first | — |
| 8. Performance Tiers "Unclassified" | No code change — copy/empty-state only | Confirm this account's Strategy phase status |
| 9. Results by event down-funnel rows | Yes | — |
| 10. Execution Layer consistency/friction/nav | Design direction resolved — see §10 | Confirm naming-rename scope (file-level only vs. broader) |
