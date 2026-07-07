# Metrix Replit Surgical Redesign Brief - Bookster Data Hydration + Final Platform QA

## Objective

Complete the current Metrix Replit application as a source-backed, agency-manager style platform. This is a surgical revision, not a rebuild.

The immediate goal is to make the app load correctly, use the correct account hierarchy, hydrate Bookster from real seeded IAP/MST data, repair the swipe mechanism, remove all agency sales pipeline language, and finish the final UI/UX pass without inventing unsupported data.

## Non-negotiable constraints

1. Do not rewrite the app architecture from scratch.
2. Do not add unrelated new features.
3. Do not create an agency sales pipeline, CRM, prospect list, proposal tracker, lead status, or fake deal-flow UI.
4. Do not use fake phone numbers, fake emails, fake contacts, placeholder customers, or generic client-management filler.
5. Do not show empty demo dashboards for Bookster once source data exists.
6. Do not cross-contaminate account data. Analysis, Strategy, Report Builder, MST, Optimization Loop, and Briefs must always be scoped to the active `adAccountId`.
7. Only the Agency/Manager overview may aggregate bottom-line performance totals across configured ad accounts.
8. Do not show source JSON/debug labels in the release UI unless they are behind an engineering-only dev flag.
9. Do not hallucinate missing metrics, MST results, validation grades, or remapping logic.
10. Do not mark this complete until the Bookster seed fully hydrates the platform without manual navigation hacks.

## Data source priority

Use the provided seed bundle as the primary Replit hydration source:

`metrix_bookster_seed_bundle_v1.json`

Recommended repo placement:

`src/data/seeds/metrix_bookster_seed_bundle_v1.json`

Recommended adapter:

`src/lib/data/metrixSeedAdapter.ts`

The generated seed bundle was built from:

- Primary source: `bookster_book2_iap_local_client_library_augmented (1).json`
- Fallback artifact source: `BOOK0_Client_Facing_Metrix_IAP_Report_v2.zip`
- Confirmation / product constraints: `Pasted text.txt`

The primary JSON already contains:

- Bookster metadata
- Core reanalysis read
- Book2 local creative library
- Cell-level performance
- V3 variable performance
- Demographic registration signals
- V3 placement signals
- C4E placement signals
- Source map referencing IAP-Device and IAP-DEMO manual imports

The ZIP contains fallback HTML artifacts, including:

- BOOK0 reports
- BOOK1 matrix and creative briefs
- BOOK2 strategy layers
- BOOK3 creative plan and briefs
- Bookster MST crossmap
- Bookster MST 4x4 matrix
- Bookster MST brief engine

## Fallback generation protocol

If the primary Bookster JSON cannot be located or fails schema validation, rebuild the missing seed using the official IAP architecture rather than making up data.

Fallback order:

1. Extract available structured data from the Bookster HTML artifacts in the uploaded ZIP.
2. Prioritize these artifacts:
   - `BOOK2_IAP_Strategy_Layer.html`
   - `BOOK2_IAP_Strategy_Layer (1).html`
   - `BOOK3_Creative_Plan_and_Briefs.html`
   - `BOOK3_Creative_Plan_and_Briefs (1).html`
   - `bookster_mst_crossmap_metrix.html`
   - `bookster_mst_crossmap.html`
   - `bookster_mst_4x4_matrix.html`
   - `bookster_mst_brief_engine.html`
   - `BOOK0_Month1_IAP_Analysis_v2.html`
   - `BOOK0_Strategy_Layer.html`
3. If HTML extraction is insufficient, locate the manual imports referenced in the source map:
   - `IAP-Device-SIGNAL-BOOK (4).csv`
   - `IAP-DEMO-SIGNAL-BOOK (2).csv`
4. Run the official architecture path:
   - `IAP_DATA_BUNDLE_PREP`
   - `IAP_ANALYSIS_CORE`
   - `IAP_REPORT_SUMMARY(mode)`
   - `IAP_STRATEGY_MAP`
   - `IAP_BRIEF_BUILDER`
   - MST local library generation if MST is active
   - `MST_TEST_ENGINE` only if actual post-matrix performance exists
   - `IAP_OPTIMIZATION_LOOP` only from real source-backed performance
5. If a value cannot be sourced, render a pending/unconfigured state. Do not invent it.

## Account model

Implement a standard manager-account hierarchy.

### Manager account

Label: `Metrix Manager` or `Agency Overview`

Purpose: high-level view of all ad accounts.

The Manager overview should:

- Load first by default.
- Show bottom-line blended totals only.
- Show account-level recommendations where each card clearly identifies the relevant ad account.
- Include Bookster as configured.
- Include SKOV Pet as unconfigured.
- Include an `Add Ad Account` / `Connect Meta Ad Account` entry in the account dropdown.
- Never show Bookster-specific Analysis, Strategy, Report Builder, MST, or Optimization Loop inside the manager overview.

### Ad accounts

Use the label `Ad Account` / `Ad Accounts`.

Configured seeded account:

- `Bookster`
- Status: configured
- Hydrated from `metrix_bookster_seed_bundle_v1.json`

Unconfigured account:

- `SKOV Pet`
- Status: unconfigured
- Shows setup state only
- No fake metrics
- No fake reports
- No fake MST
- No fake analysis

## Final primary navigation

Use this structure:

1. Ad Account
2. Listen
3. Analysis
4. Strategy
5. Report Builder
6. MST
7. Metrix Agent
8. Settings

Notes:

- Brief Builder lives under Strategy.
- Optimization Loop lives inside the selected Ad Account overview only.
- Optimization Loop must not appear as a standalone manager-level layer.
- Audit Log should live inside Settings unless its current data clearly belongs under Analysis.
- Remove duplicate or generic modules that do not support the confirmed app structure.

## Hydration map

All modules should read from one active state source:

`activeManagerAccountId`
`activeAdAccountId`
`selectedAccountType: "manager" | "ad_account"`

Do not let modules independently select or cache a different account context.

### Manager Overview

Use:

`manager_account.bottom_line_totals`
`manager_account.recommendation_cards`

Render:

- Configured account count
- Unconfigured account count
- Total spend
- Impressions
- Link clicks
- Link CTR
- Event totals by result type
- Recommendation swipe cards with account descriptor

### Bookster Overview

Use:

`ad_accounts[].id === "bookster"`
`iap.campaign_summary`
`iap.core_reanalysis_read`
`iap.optimization_loop.recommendation_cards`

Render:

- Bookster account health
- Core controls:
  - C4E = checkout-depth control
  - C2B = registration control
- Data caveat:
  - Demographic export is reliable for completed registrations.
  - V3 checkout demographic results are not populated by age/gender, so checkout demographic claims must remain directional.
- Optimization Loop panel
- Task Tray
- Dismissed Log

### SKOV Pet Overview

Use:

`ad_accounts[].id === "skov_pet"`

Render:

- Connect Meta Ad Account state
- Add Manual Import option
- No performance cards
- No analysis pretending
- No MST pretending
- No report pretending

### Listen

Use:

`bookster.listen.signal_cards`

Render source-backed signal cards only.

Required signals from seed:

- C4E is the current checkout-depth control.
- C2B unlocks registration but weakens at checkout depth.
- Facebook Reels shows the strongest checkout CPA signal.
- C2F shows commercial clarity on limited spend and should remain validation-stage.

### Analysis

Use:

`bookster.iap.analysis.performance_by_cell`
`bookster.iap.analysis.v3_variable_performance`
`bookster.iap.analysis.demographic_registration_signal`
`bookster.iap.analysis.v3_placement_signal`
`bookster.iap.analysis.c4e_placement_signal`

Render:

- Cell performance table
- Variable performance leaderboard
- Demographic registration table
- Placement signal table
- C4E placement read
- Confidence/caveat badges
- Clear distinction between proven, directional, validation-required, and insufficient data

Do not overstate low-sample data.

### Strategy

Use:

`bookster.iap.strategy.message_pillars`
`bookster.iap.strategy.active_hypotheses`

Render:

- Authority / identity pillar from C4E
- Time-saving product demo pillar from C2B
- Value-stack comparison pillar from C2F/C2G
- Active hypotheses
- Strategy-to-brief handoff

Brief Builder should be nested here.

### Brief Builder

Use:

`bookster.iap.brief_builder.draft_briefs`

Render:

- C4E authority challenger brief
- C2F value comparison validation brief
- C2B registration-control refresh brief

Do not create live campaign actions.

Brief outputs are draft states only.

### Report Builder

Use:

`bookster.iap.report_builder`

Requirements:

- Default to Metrix-branded report on first load.
- Support white-label configuration.
- Replace empty client logo area with Facebook page display picture when available.
- If no Facebook page DP exists, show a clean fallback, not an empty logo placeholder.
- Export formats should be functional:
  - PDF
  - Google Doc
  - HTML

Report Builder should render from latest IAP analysis/strategy JSON. It should not do its own heavy analysis.

### MST

Use:

`bookster.mst.local_book2_library`
`bookster.mst.historical_matrix_4x4`

Render MST as active for Bookster.

Required behavior:

- Show the Book2 local client library.
- Show the historical 4x4 matrix from the MST crossmap.
- Render concept and angle names in readable human language.
- Keep raw variable codes as secondary chips only.
- Show performance data only where present.
- Do not show Pass / Conditional / Fail statuses in the UI.
- Do not remap variables in this build.
- Do not claim completed MST performance where only brief/matrix setup exists.
- If a matrix cell lacks performance, mark it as pending, setup, or historical, not as a winner/loser.

### Metrix Agent

Render a premium coming-soon state unless a real source-backed agent layer already exists.

Do not show fake chat messages or fake agent outputs.

Suggested copy:

`Metrix Agent is coming soon. Your source-backed operator layer for summarizing account state, surfacing next actions, and explaining why each recommendation exists.`

### Settings

Include:

- White-label configuration
- Account settings
- Activity / Audit Log if not placed under Analysis
- Data connection status
- Manual import state

No sales pipeline settings.

## Swipe mechanism repair

Swipe is currently static/non-functional. Repair it.

Locations:

- Manager Overview
- Individual Ad Account Overview

Required actions:

- Swipe right: Add to Tray / Approve
- Swipe left: Skip / Reject
- Tap / Space: Open Details
- Undo: Restore last card

Supported inputs:

- Mouse drag
- Touch drag
- Keyboard arrows after card focus/click
- Visible buttons

Required destinations:

- Approved suggestions go to Task Tray.
- Rejected suggestions go to Dismissed Log.
- Dismissed cards must be restorable.
- Approved cards must not auto-edit campaigns.
- Approved cards become manual implementation tasks.

Do not require swipe state to survive refresh separately if the card has already been routed to Task Tray or Dismissed Log.

## Task Tray

Add or repair the Task Tray pattern.

Task Tray should:

- Aggregate approved suggestions.
- Group by implementation type:
  - Budget actions
  - Creative actions
  - Strategy updates
  - Brief updates
  - MST setup actions
- Show manual action required.
- Preserve source reference internally.
- Allow mark as done.
- Allow restore/remove.
- Never auto-apply Meta campaign changes.

## Dismissed Log

Add or repair the Dismissed Log.

Dismissed Log should:

- Show rejected suggestions.
- Preserve source reference internally.
- Allow restore.
- Allow permanent archive if supported.
- Never delete the reasoning trail by default.

## Branding and visual polish

Use the latest Metrix wordmark from the brand guide.

Brand direction:

- Use `metrix.ad` / Metrix branding.
- Keep the dark UI.
- Improve text contrast and readability.
- Refine typography hierarchy.
- Use sharp, restrained, performance-oriented UI.
- Avoid generic gradients, noisy icons, emoji UI, cheap badges, or placeholder SaaS clutter.
- Use blue active states, dark navy surfaces, restrained yellow/watch states, and premium card contrast.

Every page should be readable and polished on:

- Desktop
- Tablet width
- Mobile width
- Small laptop viewport

## Content rules

Use readable descriptors first.

Examples:

- Product Demo
- Authority Hook
- Aspirational Tone
- Visual Demo Proof
- Problem-Agitate-Solve
- Founder Story
- Comparison
- Value Stack

Raw codes like `CN_ProductDemo`, `HK_Benefit`, `FW_AIDA`, and `TN_Aspirational` can appear as secondary chips, not as the main label.

## Engineering implementation sequence

1. Add the seed JSON to the repo.
2. Create TypeScript types or Zod schemas for the seed structure.
3. Create a seed adapter that exposes:
   - `getManagerOverview()`
   - `getAdAccounts()`
   - `getAdAccountOverview(adAccountId)`
   - `getListenSignals(adAccountId)`
   - `getAnalysisData(adAccountId)`
   - `getStrategyData(adAccountId)`
   - `getBriefBuilderData(adAccountId)`
   - `getReportBuilderData(adAccountId)`
   - `getMstData(adAccountId)`
   - `getOptimizationLoopData(adAccountId)`
4. Wire global account state.
5. Remove/rename all UI labels that conflict with the manager/ad-account model.
6. Hydrate every route from the same active account context.
7. Repair the swipe component.
8. Add Task Tray and Dismissed Log routing.
9. Polish visual contrast, spacing, typography, and responsive behavior.
10. Run final QA against the acceptance checklist.

## Acceptance checklist

Do not mark complete until all of these pass.

### Data and architecture

- [ ] App loads to Manager Overview first.
- [ ] Bookster exists as configured.
- [ ] SKOV Pet exists as unconfigured.
- [ ] Bookster data fully hydrates Overview, Listen, Analysis, Strategy, Report Builder, MST, and Brief Builder.
- [ ] No Bookster analysis appears inside SKOV Pet.
- [ ] No SKOV Pet data appears inside Bookster.
- [ ] Manager Overview only aggregates bottom-line totals.
- [ ] Optimization Loop appears only on the selected Bookster Ad Account overview.
- [ ] No user-facing source JSON/debug labels in release UI.
- [ ] No unsupported metrics are invented.

### Navigation and naming

- [ ] Primary nav is exactly: Ad Account, Listen, Analysis, Strategy, Report Builder, MST, Metrix Agent, Settings.
- [ ] Brief Builder is under Strategy.
- [ ] No sales pipeline language exists anywhere.
- [ ] No Prospect, Proposal, Lead, CRM, Deal, or fake contact module remains.
- [ ] Ad account terminology is consistent.

### Swipe

- [ ] Swipe cards move with mouse drag.
- [ ] Swipe cards move with touch drag.
- [ ] Keyboard arrows work after focus.
- [ ] Visible buttons work.
- [ ] Space opens details.
- [ ] Undo restores last card.
- [ ] Right swipe sends to Task Tray.
- [ ] Left swipe sends to Dismissed Log.
- [ ] Dismissed cards can be restored.

### MST

- [ ] Bookster MST renders active.
- [ ] Book2 local library appears.
- [ ] Historical 4x4 matrix appears.
- [ ] Human-readable descriptors lead.
- [ ] Raw variable codes are secondary.
- [ ] No Pass / Conditional / Fail statuses are shown.
- [ ] No remapping is performed.
- [ ] Missing performance is shown as pending/unavailable, not fabricated.

### Report Builder

- [ ] Metrix-branded report loads by default.
- [ ] White-label configuration exists.
- [ ] Facebook page DP replaces empty client logo area where available.
- [ ] PDF export works.
- [ ] Google Doc export works or has a real connected/export-ready implementation path.
- [ ] HTML export works.
- [ ] Report Builder renders from existing IAP output, not independent analysis.

### UI / UX

- [ ] Correct Metrix logo is used throughout.
- [ ] Text contrast is improved.
- [ ] Cards, sidebars, nav, badges, tables, and headers feel consistent.
- [ ] Mobile layout does not break.
- [ ] No broken links.
- [ ] No console errors.
- [ ] No duplicate placeholder modules.

## Final instruction to implementer

This pass is about making Metrix feel like a real loaded operating system for an agency managing ad accounts, not a mock dashboard.

Use the provided seed JSON first. Use the official IAP architecture to regenerate missing structures only if the JSON cannot be located or validated. Never make up data. Preserve account isolation. Fix swipe. Clean the UI. Remove every trace of pipeline/CRM language. Do not ship until Bookster hydrates the full loop cleanly.
