# Metrix IAP — Master Replit Build Brief
**Consolidates:** nav/IA rebuild, creative-asset visual context + Meta Ads Manager deep links, per-module avatar × placement data requirements, Foreplay-style creative card standard, Bookster historical data/IAP loop seeding, and access-gate/auth architecture into one document. Paste directly into Replit's agent or hand to the dev.

---

## PART A — Navigation & IA Rebuild

### A1. Confirmed bug
The current sidebar nav is not actually wired. Under Analysis, Creative Intel, Audience Intel, and Strategy, almost every child link calls the **same page function** regardless of label — e.g. "ICP Registry," "Platform Split," "Age×Gender Heatmap" all call the identical `showPg('audience')`. Relabeling without rewiring the router is the failure mode to avoid in the rebuild below.

### A2. Required navigation structure (final, per Alex's corrected mapping)
```
1. Overview

2. Listen
   2.1 Alerts
   2.2 Signal
   2.3 Recommendations

3. Analysis
   3.1 Overview
   3.2 IAP Library
   3.3 Audience
   3.4 Placements
   3.5 Budget Insight

4. Strategy
   4.1 Overview
   4.2 Strategy Map
   4.3 Avatars / ICP
   4.4 Hypothesis Queue

5. Creative Briefs
   5.1 Brief Builder
   5.2 History

6. Report Builder
   6.1 New Report
   6.2 Report History
   6.3 Exports

7. MST
   7.1 Concept Map
   7.2 Matrix Builder     [filled in — see A2a]
   7.3 Creative Scan      [filled in — see A2a]
   7.4 Crossmap Results   [filled in — see A2a]

8. Metrix Agent — Coming Soon (waitlist capture)

9. Settings
   9.1 Account            [filled in — see A2b]
   9.2 Integrations       [filled in — see A2b]
   9.3 Team & Access      [filled in — see A2b]
   9.4 Notifications      [filled in — see A2b]
   9.5 Billing            [filled in — see A2b]
```

### A2a. Gaps filled — MST subpages
Alex's list only specified Concept Map under MST. MST is a full methodology layer with three documented components beyond concept mapping (`MST_METHOD_REFERENCE`, `MST_CREATIVE_SCAN`, `MST_TEST_ENGINE`), so I've added the other two pages MST actually needs to function: **Matrix Builder** (setting up the sprint test grid/variable stacks before launch) and **Crossmap Results** (the `MST_TEST_ENGINE` output — universal vs. avatar-specific winners, variable isolation, next-sprint priorities). Concept Map alone doesn't cover the loop MST is supposed to run. Confirm the naming/split, or fold differently if you'd rather group it another way.

### A2b. Gaps filled — Settings subpages
Nothing was specified under Settings, so I've defaulted to the standard set a platform like this needs on day one: Account (profile), Integrations (Meta Ads connection status, Supabase/data source config), Team & Access (who has logins, tied directly into the access-gate work in Part C), Notifications, Billing. Trim what's not needed yet.

### A2c. Flagged inconsistencies — need your call
- **"Settings" also appeared as a child under Report Builder** in your list (alongside New Report / Report History / Exports). I've treated that as a stray line (same pattern as the earlier Creative Briefs misclick) and kept Settings only as top-level item 9. Confirm that's right — if Report Builder genuinely needs its own local settings (e.g. default report template, scheduled sends), that's a different, smaller thing than the account-level Settings tab, worth naming separately if so.
- **MST no longer carries a "Coming Soon" flag in this pass**, while Metrix Agent still does. Previously both were flagged as gated/waitlist features. Confirm whether that's intentional — i.e., MST is now considered ready to expose (client opt-in, not fully locked), while only the Agent stays behind a waitlist.
- **Concept Map moved from Analysis to MST.** Architecturally, this creates a real gap: `IAP_ANALYSIS_CORE()` generates concept/creative-level performance data for *every* client regardless of whether they've opted into MST (MST is explicitly optional, client opt-in per the architecture docs). If Concept Map only exists under MST, any client who hasn't opted into Matrix Sprint Testing loses visibility into concept-level performance entirely — even though that data is generated for them either way. Recommend either: (a) Analysis keeps a lightweight "Concept Performance" view fed by `IAP_ANALYSIS_CORE()` for all clients, while MST's Concept Map is the test-matrix-specific version (grid positions, isolated variables) for opted-in clients, or (b) confirm every client is expected to be on MST eventually and this gap is acceptable short-term. Don't build this one without picking (a) or (b) first.
- **Audit Log has no home in this mapping.** It existed in the prior build under Report Builder. Recommend folding it into Report History (6.2) rather than dropping it — confirm.

### A3. Other structural notes
- **Avatars / ICP sits under Strategy, not Analysis** — `IAP_ANALYSIS_CORE()` produces raw demographic performance; `IAP_STRATEGY_MAP()` synthesizes that into actual ICP/Avatar profiles. Avatar is a strategy-layer artifact.
- **Strategy Map (4.2)** absorbs the old Map/Audience/Creative/Communication/KPI Forecast sub-views as tabs within it, rather than reinstating them as separate top-level slots.
- **Metrix Agent**: nav item visible, click opens a locked/waitlist state (headline, one-line description, email capture, submit) — no access to underlying page content.
- **Creative Briefs → History**: pulls in every genuine output of `IAP_BRIEF_BUILDER()` so brief data isn't scattered. The old "Static/Video/UGC Brief" nav children are brief *types*, not destinations — make them filters inside Brief Builder; History shows the full generated-brief log, searchable/filterable by type.
- **Analysis and Strategy both now get a dedicated "Overview" sub-landing page (3.1, 4.1).** Worth considering the same pattern for Listen, Report Builder, and MST for consistency — flagging as optional, not assuming you want it everywhere.

### A4. Cross-cutting UX requirements (apply to every subpage above)
- **Stat tiles per subpage, scoped to that layer** — not the same global spend/CPA tiles repeated everywhere.
- **Keep the popup/modal drill-down pattern** (`openM('m-xxx')`) — it's the strongest UX element in the current build. Every new subpage should use it for any list/table row.
- **Variable descriptors always carry live performance data inline** (CPA/CVR, lift vs. baseline, confidence, sample size) — wherever a CN_/FW_/TN_/ST_/AW_/HP_/PR_/HK_/CTA_ code or descriptor is shown. Flag: ST_, AW_, and CTA_ families never appear anywhere in the current build — confirm whether that's a data gap or expected for this account.
- **Navigable end-to-end flow, Analysis → Strategy → Briefs** — a user should be able to go from a Concept Map finding straight to the Hypothesis Queue/Avatar it informed, straight to any Brief generated from it, via direct links — not just shared sidebar presence.

### A5. Global date-range filter system (new requirement)
Every row in the underlying data carries a date, so this needs to be a real, global control — not a per-page afterthought. The current build already has the UI real estate for this: the topbar shows a static, hardcoded date string (`Dec 22 – Mar 30, 2026`). That needs to become a live, interactive date-range picker that actually filters every data-driven module against the selected window.

**Required presets:**
- Today
- Yesterday
- Last 7 days
- Last 14 days
- Last 28 days
- Last 30 days
- Last 90 days
- Last 120 days
- Last 365 days
- This week / Last week
- This month / Last month
- This quarter / Last quarter
- This year / Last year
- **Custom range** — a start/end date picker. Presets alone always run out; every dashboard like this ends up needing an arbitrary range eventually, build it now rather than retrofitting it later.

**Recommended addition, not explicitly requested — flagging for your call:** a "compare to previous period" toggle alongside the range picker (e.g. this-28-days vs. prior-28-days), since most of what makes a date window useful is seeing whether a number moved. Cheap to add now, expensive to retrofit into every module's stat tiles later if skipped.

**Scope of what the date picker controls:**
- Applies globally to Overview, Listen, Analysis, Strategy, MST, and any performance references inside Creative Briefs — one control, not a separate picker per page.
- Report Builder should inherit the globally selected range as its default when generating a new report, but allow overriding it per-report (a report often needs its own fixed window regardless of what someone's currently browsing).
- Settings is the one section that shouldn't be affected by it — that's account configuration, not a data view.
- **Scoped per active account** — different accounts (KOV, Bookster, others) will have different data start dates. The picker needs to respect each account's actual available range, not offer a "last 365 days" preset that's mostly empty for a newer account.

**Interaction with MST (ties to Part C4):** if a selected date range predates when MST/matrix testing began for that account, Concept Map/Creative Scan/Crossmap Results should show an explicit "no MST data in this range" state rather than an empty or broken module — this is the same pre-MST-data gap flagged in C4, surfaced here as a UI state rather than a silent blank page.

---

## PART B — Creative Visual Context + Meta Ads Manager Deep Links (new requirement)

This is the fix for the platform's biggest intuitiveness gap: right now every insight is a number and a sentence, with no visual tie back to the actual ad. Two additions, everywhere a specific ad or concept is referenced — MST's Concept Map (7.1), Analysis's IAP Library/Audience/Placements views, Strategy's Hypothesis Queue and Avatars/ICP, Creative Briefs/History, MST's Creative Scan and Crossmap Results, and Listen's Recommendations. **Note:** this depends on resolving the Concept Map / MST-optionality flag in A2c first — if concept-level data needs to exist outside MST too, this visual/deep-link treatment applies to that non-MST view as well, not just the MST one.

### B1. Visual thumbnail, inline with the performance data
- Show the actual creative asset (image, or first-frame for video) directly next to its stats — not just the concept_code and a number.
- **If no asset image is available yet, show a clear placeholder** (labeled with the concept_code) — never a broken-image icon. This keeps the UI asset-aware architecturally even before real creative storage is wired in.
- **Schema flag:** I don't see a stored asset/thumbnail URL field anywhere in the current schema documentation. This needs to be added — likely a `creative_asset_url` (or similar) field at the ad level, tied to `ad_id` rather than `concept_code`, since one concept can span multiple ad_id variations with different actual assets. Confirm with whoever owns the Supabase schema before building this.

### B2. Deep link to Meta Ads Manager
- Every ad-level row/card/modal gets a **"View in Ads Manager ↗"** button that opens the specific ad directly in Meta Ads Manager.
- This resolves off **`ad_id`**, not `concept_code` — Meta's systems don't recognize your naming convention, only their own ad IDs. This is consistent with the existing architecture decision that `ad_id` is the fallback join key.
- Deep link needs both the client's `ad_account_id` and the specific `ad_id`. Meta's URL structure for this changes periodically — have the dev verify the current deep-link syntax against Meta's Ads Manager / Business Suite documentation at build time rather than hardcoding a format from this brief.

### B3. Where this changes the flow
Combine B1/B2 with A4's "navigable end-to-end flow" requirement: a user looking at a Concept Map entry should see the actual creative, be able to jump straight into Ads Manager to look at it live, and follow the same thread into the Strategy layer it informed and the Brief it produced — all without losing visual context of *which specific ad* they're looking at the whole way through.

### B4. Every module ships with real per-segment variable data — not just top-line numbers
This is a build standard, not a suggestion: **no module ships with only aggregate/account-level numbers.** Every module listed in Part A's nav (A2) needs its data cut down to the segment level so winners and losers are visible *for that specific segment*, not just for the account overall. **All of this respects the global date-range picker in A5** — a segment breakdown is only correct for the window currently selected, so this data layer and the date picker are effectively one dependency, not two separate features. Concretely, for every module that touches performance data:

- **By Avatar/ICP** — whichever avatar profiles exist for the account (e.g. the Male 45–54 / Male 35–44 / Male 25–34 segments already validated in the current KOV data), each module's tables/tiles need a way to filter or break out by avatar, showing that avatar's own winners, losers, and confidence — not just the blended account number.
- **By Placement** — same requirement for placement (Feed vs. Stories, Facebook vs. Instagram, etc.). A variable that wins on IG Feed and loses on FB Stories needs to show that split, not get averaged into a single misleading number.
- **This applies especially hard to**: IAP Library, Audience, Placements, Budget Insight (Analysis), Strategy Map, Avatars/ICP, Hypothesis Queue (Strategy), Concept Map, Creative Scan, Crossmap Results (MST), and Recommendations (Listen) — anywhere a variable code or concept is evaluated, the avatar × placement breakdown needs to be reachable from that same view (modal drill-down per A4, not a separate page).
- **Practical shape**: each variable/concept row shows its blended top-line stat by default, with a clear way to expand into the avatar × placement grid behind it — this is what turns "PR_ProductFeel is working" into "PR_ProductFeel is winning for the 45–54 avatar on IG Feed specifically, and losing for 25–34 on FB Stories" — which is the actual decision-useful version of the same data point.

### B5. Creative/copy modules — pull the real asset, Foreplay-style
Every module tied to a specific creative or copy line (Concept Map, Creative Scan, Brief Builder/History, Crossmap Results, and any Recommendations card referencing a specific ad) needs its visual placeholder built to a **Foreplay.co-style creative card**, not a generic thumbnail box:
- Actual creative image/video-first-frame as the dominant visual, card-based grid layout (not a data table row with a tiny icon).
- Hover or click reveals the full asset (video plays inline or expands; static enlarges).
- Copy/headline text overlaid or shown directly beneath the asset, not detached in a separate column.
- Performance stats (CPA, CVR, confidence, lift) shown as a compact stat strip attached to the card — same data as B4's breakdown, surfaced at the card level with the full avatar × placement cut one click deeper.
- Tag/label chips on the card for concept_code, framework, tonality (CN_/FW_/TN_ etc.) so a user scanning a grid of cards can visually pattern-match winners without opening each one — this is Foreplay's actual UX advantage (fast visual scanning of a library), replicate that, not just the card shape.
- **This depends on B1's asset-storage schema fix** (`creative_asset_url` or equivalent) actually pulling real Meta creative assets via API — until that's wired, use the labeled placeholder from B1, but design the card layout now so swapping in real assets later is a data change, not a rebuild.

---

## PART C — Bookster Historical Data & IAP Loop Seed Generation — STATUS: DATA PROVIDED

Real Bookster data has now been supplied and is packaged with this brief (see the attached zip). This is not a placeholder or synthetic run — it's an actual IAP loop output plus the source client library it was built from.

### C0. What's actually in the attached package
**IAP loop output (4 of 6 stages), covering both Bookster products, window 2026-05-02 to 2026-07-07:**
- `normalized_data_bundle.json` — Bundle Prep output: ad/copy-level, demographic, placement, platform, device, and concept-level performance, each row carrying `date_start`/`date_end`.
- `campaign_intelligence.json` — Analysis Core output: performance tiers, buying-intent scores, traffic-quality classification, failure patterns, winning variable stack.
- `strategic_map.json` — Strategy Map output: ICP profiles, message pillars, variable combinations, 4 prioritized testing hypotheses, scaling playbook.
- `creative_briefs.json` — Brief Builder output: 4 execution-ready briefs (3 matrix-mode for BOOK0, 1 general-mode for BOOK2).

**Source client library (the canonical reference these outputs were built from):**
- `Bookster_IAP_Local_Client_Library_v1_2_COPY_LIBRARY.csv` — the copy bank: headlines/descriptions/primary text by concept (C1–C4 + Universal), with char counts and rationale.
- `bookster_book2_iap_local_client_library_augmented.json` — cell-level variable stacks (hook/tone/framework/concept/pain-proof/proof/CTA variables) for Book2, plus `asset_filename`/`asset_path` references per creative cell.

### C0a. Gaps in this package the dev needs to know about — don't build past these silently
- **Only 4 of 6 loop stages are present.** No Creative Scan / Test Engine (MST crossmap) output and no Optimization Loop output exist yet. Anything in the nav spec expecting Crossmap Results (7.4) or a golden-formula view doesn't have real data behind it yet from this package alone.
- **No Meta `ad_id` anywhere in these files** — only `ad_name` (the naming-convention identifier). The Meta Ads Manager deep-link feature (Part B2) cannot be built from this package alone; it needs a separate raw export or API pull that carries Meta's actual numeric ad ID.
- **`asset_path` values point to a local path** (`/mnt/data/...`) from wherever this file was originally generated — not a live, servable URL. This confirms the creative assets exist and are already tagged with variable stacks, but it does not hand Replit a working image link. Part B1's schema fix (a real, servable `creative_asset_url`) is still a separate task.
- **3 BOOK0 concepts (C5 partial, C6, C7)** are live in the account but undefined in the Local Client Library — present in the bundle/intelligence files as position-only data (`mapped_in_library: false`), independently flagged in the Book2 library too (C5 specifically, as low-confidence "naming drift" — recommend remap to C4 or create a new concept). Confirm with Alex before treating these as validated MST cells.
- **3 campaigns show spend with zero terminal conversions** (BOOK0 iOS MST V1, BOOK2 Quiz V1, BOOK2 Quiz V3), labeled `validation_required`, not failures — confirm MMP/pixel postback health before acting on them.
- **Schema note**: these files follow the Metrix IAP skill I/O schemas, not a confirmed Supabase DDL dump. Reconcile field names (e.g. `cell_id`, `concept_id`, `ad_name`) against the actual migration files before writing the importer — don't assume a 1:1 column match.
- **The Book2 library note is worth reading literally**: it states the base Local Client Library is Book0/current-state based and contains no BOOK2 references — the Book2 creative cells in this file were added by mapping filename/ad-name and visual deconstruction, not pulled from a pre-existing Book2-specific library. Treat Book2 mappings as a documented best-effort reconstruction, not an original source record.

### C1. What's needed for the two remaining loop stages (Creative Scan / Test Engine, Optimization Loop)
Per the data-bundle-prep process this pipeline runs on, closing the C0a gap on MST crossmap/optimization output would need, from Meta Ads Manager, all covering the same date range:
- Copy/ad-level performance export (with real `ad_id`, to also close the deep-link gap)
- Demographic breakdown export
- Placement breakdown export
- Date range and attribution window stated explicitly
- Any known tracking issues (pixel gaps, iOS attribution loss, etc.)

A single flat export with a date column isn't enough on its own — demographic and placement breakdowns are separate pivot exports in Meta Ads Manager and both are required to do the avatar × placement breakdown work in B4.

### C2. What actually runs, once the remaining data is in
1. **Data Bundle Prep** — normalizes the raw exports into one validated JSON bundle, flags low-sample segments, checks for tracking anomalies. *(done — see C0)*
2. **Analysis Core** — runs the 7-layer analysis (demographic, creative, placement, cross-correlation, etc.) on the normalized bundle. *(done — see C0)*
3. **Strategy Map** — synthesizes Analysis Core's output into ICP/Avatar profiles, message pillars, the hypothesis testing queue. *(done — see C0)*
4. **Creative Scan + Test Engine** (MST layer) — only runs on the portion of the data that's actually structured as MST matrix tests (isolated variables, control variants) — see C4 below on why this doesn't apply to all historical data. *(not yet run — needs C1)*
5. **Brief Builder** — generates brief-ready output from the Strategy Map's winning combinations, where applicable. *(done — see C0)*
6. **Optimization Loop** — re-weights variables based on performance, produces the golden-formula output. *(not yet run — needs C1)*

Each stage's JSON output is a real deliverable — these get attached alongside this brief so every module spec above (B4, B5) has actual Bookster data to build and test against, not synthetic placeholder numbers.

### C3. Remaining step
Data Bundle Prep, Analysis Core, Strategy Map, and Brief Builder are done (C0). Creative Scan/Test Engine and Optimization Loop are not — those run as soon as the raw exports in C1 (with real `ad_id` included) are provided.

### C4. Advisory — should this run on Bookster's full historical data, or just since MST started?
**Run the full historical range for Analysis Core, Strategy Map, and Optimization Loop.** More history means larger samples, real trend lines, and a Strategy Map that isn't starting cold — there's no reason to throw away pre-MST data for these three stages.

**But MST's Creative Scan and Test Engine can only run on data that's actually structured as an MST matrix test** — isolated variables, a control variant, the matrix positions the methodology requires. Data collected before MST began almost certainly isn't shaped that way, so it can inform Analysis/Strategy/Optimization but won't produce real Crossmap Results. Don't expect pre-MST history to retroactively populate MST outputs — flag this to whoever's expecting a full Crossmap Results backfill.

**One more flag on comparability**: if Bookster's historical range crosses Meta's 2026 attribution window change (already a locked reason ROAS is excluded from v1 abnormality scanning), pre- and post-change data isn't strictly apples-to-apples. Analysis Core should be told the attribution window per period so it can flag that boundary rather than blending it silently.

**On creative libraries specifically**: pulling the full creative library is worth doing for the same reason — more real assets to populate B5's Foreplay-style cards with. But this is gated on B1's schema fix (a real `creative_asset_url` field) and an actual Meta API pull, not something the IAP prompt loop itself produces — the loop analyzes performance, it doesn't fetch images. Treat "backfill all creative assets" as a parallel, separate task from the data pipeline in C1–C3, not a blocking dependency of it.

---

## PART D — Access Gate & Auth Architecture

### D1. Two surfaces
- **www.metrix.ad** — public marketing site. Converts an anonymous visitor into a qualified access request. No real login here.
- **app.metrix.ad** — the platform. Authenticates an *approved* user into their tenant-scoped dashboard.

Keep strictly separate. The marketing site exposes a **request-access form**, not a login form — nobody self-serves into the platform right now.

### D2. Full flow
```
Visitor → www.metrix.ad (CRO page, CTA = "Request Access")
   → Request-access form: email + qualifying fields (see D5)
   → Writes to a request-access table (Supabase) + adds to newsletter list (see D6)
   → Thank You page: confirms receipt, sets expectation on review time, CTA = "Book a Demo"
   → [Manual review, off-platform]
   → On approval: Supabase sends invite/magic-link email
   → User sets up login → lands in app.metrix.ad, scoped via existing RLS
```
Two gates, not one: the **content gate** (email capture) and the **access gate** (manual approval → real login). A captured email is a lead, not a credentialed user, until approved.

### D3. CRO strategy for the gate page
One dominant promise, not a feature dump. Strongest available pillar right now: a real, specific proof point (e.g. the KOV account's validated CPA finding) over a generic "AI-powered ads platform" claim any competitor could paste onto their own site. Page structure: hero (concrete promise) → proof strip (falsifiable numbers, evidence-status tagged) → what access gets them → request-access form → secondary "Book a Demo" CTA. Copy itself comes later, run through `copywriting-website-pages` when ready.

### D4. Thank-you page
Confirmation + 2–3 step "what happens next" + **Book a Demo as the primary action** (not an afterthought link) + no login field here.

### D5. Request-access form fields
Recommend beyond just email: company/brand name, business type (mapped to the four cohort types), current monthly ad spend. Lets manual review pre-sort by cohort and starts onboarding into the right `required_metric_block` immediately on approval. Confirm the exact field set wanted.

### D6. Newsletter
Need to know the ESP (Mailchimp/Klaviyo/ConvertKit/none yet). If none, the email still lands in the Supabase table and send-out is manual until an ESP is chosen.

### D7. Auth mechanism — recommendation
**Supabase Auth**, invite-based, magic link or email/password on first login. Matches the manual-approval model, reuses the existing Supabase backend and RLS policies — no new vendor.

**Dependency:** the frontend currently has zero live Supabase connectivity (fully static, hardcoded single-account build per the earlier audit). Wiring real auth requires the frontend to talk to Supabase at all — this is a prerequisite, not a follow-on to auth. Don't sequence "add login screen" after a nav-only rebuild, or it logs people into a demo with no real data behind it.

---

## PART E — Open items needed before build
0. The four flagged items in A2c (Report Builder's stray "Settings," MST's dropped Coming-Soon flag, Concept Map/MST-optionality conflict, Audit Log's missing home) — these are structural, resolve before the dev starts on nav.
1. Booking link (Calendly or equivalent) for "Book a Demo."
2. ESP for newsletter, or confirmation none exists yet.
3. Who reviews access requests, and how often — simplest MVP is a filtered Supabase view, no admin UI needed day one.
4. Internal/team accounts (Alex, developer) — seeded directly in Supabase, bypassing the request-access flow. Confirm.
5. Confirm whether `creative_asset_url` (or equivalent) already exists in the schema or needs adding (Part B1).
6. Confirm current Meta Ads Manager deep-link URL format with the dev before hardcoding anything (Part B2).
7. Confirm ST_/AW_/CTA_ variable families' absence from the current build is a data gap, not by design (Part A4).
8. Raw Meta exports with real `ad_id` included (Part C1) — still needed to close the deep-link gap (B2) and to run Creative Scan/Test Engine + Optimization Loop (C0a).
9. Confirm whether the "compare to previous period" toggle (A5) is wanted now or deferred.

## Suggested build order
1. Frontend ↔ Supabase real wiring (prerequisite for everything else).
2. Bookster data pipeline (Part C) run in parallel — doesn't block nav/UI work, but should finish before final QA so modules are tested against real data, not placeholders.
3. Nav/IA rebuild (Part A, including the date-range picker in A5) + creative visual/deep-link additions (Part B) — this is the core intuitiveness fix, prioritize together since B and the date picker both ride on the same pages A rebuilds.
4. Supabase Auth invite flow + RLS-scoped login (Part D7).
5. www.metrix.ad request-access + thank-you pages, wired to the request-access table and approval flow (Part D2–D6). Copy pass separate, on Alex's signal.
