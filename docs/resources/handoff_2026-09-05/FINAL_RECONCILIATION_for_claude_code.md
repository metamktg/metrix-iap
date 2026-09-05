# Final Reconciliation — Answers for Claude Code

**Status:** Final — supersedes any prior verbal answers on these items where noted
**Origin:** Reconciliation session, Sep 5 2026, following Claude Code's pre-execution questions on the assessment round (F10, F11, H1, Task 22/23) and the UI/UX overhaul pass (O2, O5)
**Companion files:** `SPEC_ad_id_anchored_creative_mapping.md`, `SPEC_strategy_map_disclosure_optimization.md`, `SPEC_creative_analysis_module_upgrades.md`, `REFERENCE_screenshot_audit_batch_sep5.md`, `watermelon-ui-claude-code-reference-sheet.md`

---

## Revised execution order (supersedes the order stated in the original Claude Code message)

**Spec the UI sweep comprehensively first — with full knowledge of every backend-driven requirement below — then implement feature-by-feature, UI and backend together per feature. Not a strict two-phase waterfall in either direction.**

Two risks are in tension here, and the resolution has to address both:

- **Backend-first, then redesign** risks the sweep not knowing about (and dropping) whatever new UI surfaces the backend fixes required — the run-selection control (item 2), the per-page status/progress hub (item 4), ROAS in metric dropdowns and tiles (item 8).
- **Pure UI-first** risks the opposite: designing the run-selector, the status hub, or ROAS placement against assumptions about backend behavior — what a run-picker needs to show with dozens of past runs, real loading/error states, what "combine multiple past runs" actually requires — before that logic exists to design against. If the backend reality doesn't match the design once built, the "finished" UI needs revising anyway.

**Resolution:** the UI sweep spec (§11) is written with full knowledge of every feature below *before design starts* — nothing here is a cosmetic-only pass done in ignorance of the backend work. But implementation proceeds feature-by-feature (e.g., build the run-selector's UI and its real backend query together, then the status hub and its real run-state data together), not as two fully sequential phases. This avoids both regression risks at once: the sweep is never blindsided by an unplanned-for backend feature, and no UI element gets locked in around a guess about backend behavior that turns out wrong.

---

## 1. Tenancy shape — resolved, unrelated to the UI work

This is a plan/permission-tier decision, not a UI/UX concern: "Agency view" is the top-level plan tier that can see multiple ad accounts, distinct from a client-level or individual-user-with-roles view. Confirmed as the target shape. This does not intersect with the Execution Layer sweep in §11 — keep it scoped as a backend access-control decision.

## 2. Evidence retention + run selection — resolved, with an added feature requirement

Confirmed: retain every run's evidence rows, never delete, default reads scope to "latest successful run of that kind" with the existing currency rule (a briefs run only counts as current if it started after the latest successful strategy run).

**Added requirement:** every stage's run interface needs an explicit "base this run on which prior run" control — Strategy needs to let the user pick which Analysis run to base a new Strategy run on (defaulting to the latest, but selectable, including combining multiple past runs where that's meaningful), and the same pattern applies to Briefs being generated from a specific past Strategy run. This is a real feature to build, not just a data-retention policy — it needs its own UI control on each stage's Command Center page, which is why it belongs in the UI sweep spec (§11) as a first-class element, not an afterthought.

## 3. Direct Postgres/COPY credential — resolved: grant now, scoped; scale is a separate initiative

Grant the credential now so Task 23 and F11 aren't blocked — but scoped narrowly (a role that can only `COPY` into the specific tables involved, not a broad/superuser credential).

**Separately flagged, not blocking:** this account crossing 1M+ imported rows for the first time is what surfaced this performance problem, and that's a real signal, not a one-off. The platform needs a deliberate scale-readiness pass — partitioning, indexing strategy, connection pooling, cold-data archival policy, multi-tenant isolation — designed at the standard of an enterprise SaaS database, for the actual future shape (many agencies, many ad accounts, many end users, growing data volume). This is its own initiative, not something to resolve as a side effect of approving one credential. Flag it to Claude Code as a required follow-up scoping conversation, not a blocking dependency for the current batch.

## 4. No autonomous cross-stage runs — confirmed, ever, as of today

Every IAP Loop stage requires an explicit, manually-triggered run from its own Command Center page. Nothing runs automatically between stages. That page is the *only* place a run can be triggered, and it must show a clear, user-friendly progress/status indicator for the currently staged or in-flight run (see §5 — this is a UI sweep requirement, not a separate status page).

**The one confirmed exception:** when a creative asset is deconstructed, it can automatically slot into that account's IAP local library. This does **not** trigger or imply any re-run of Analysis or Strategy — it only affects the *next* manually-triggered run. It has zero retroactive effect on any past or in-flight run.

## 5. Status/progress surfacing — folded into the UI sweep, not a standalone Activity page

Withdraw the standalone "Activity" nav row concept from the original question. Per item 4 above, every Command Center page needs its own built-in, user-friendly progress/status hub for that stage's runs (staged, in-flight, completed, with the run-selection control from item 2 visible there too). This is not a separate page — it's a core element of every Execution Layer page in the §11 redesign.

## 6. Spend reconciliation — revised and substantially more precise than the original F10 tie-break

This supersedes the earlier "confirmed, daily wins" answer — that was based on an incomplete read of what "daily" meant. Here is the corrected waterfall, as clarified:

**Two structurally different file types are in play, and they must not be conflated:**
- **Ad Manager Summary CSV** (not a pivot table — a direct per-Ad-ID summary export from Ads Manager) is the master source of truth for spend, full stop, when present.
- **Pivot table CSV exports** (demographic × age/gender, placement, copy/text breakdowns, day-level views) are a *separate* import stream that feeds detail *into* the master total — they never compete with it or override it.

**Confirmed finding, new to this session:** the existing "two-export system" (documented as demographic/copy + device/placement) is no longer accurate — Meta's pivot-table export can't reliably combine certain breakdown dimensions (e.g., gender × age × copy-text together, or day-level columns with certain placements) into just two files without losing coverage (previously only capturing a partial share of the true demographic/placement picture). Getting full, accurate coverage now requires **more than two** pivot exports. This needs its own documentation update whereever the two-export system is currently described (project memory, `metrix-data-bundle-prep` skill, onboarding docs) — it is not a minor tweak.

**The reconciliation waterfall, precisely:**
1. If an Ad Manager Summary CSV is present for the period, it is the master spend total per Ad ID. Full stop — no pivot-table source competes with it.
2. Prefer full-period totals over splitting by individual days. Only fall back to day-level granularity when genuinely necessary (e.g., a partial period, an ad that started mid-window). If a whole-period total needs a minor adjustment (e.g., excluding one day with a data-quality issue), do it quietly — no user-facing alarm or friction over a one-day shave.
3. If no Ad Manager Summary CSV is provided, do **not** apply a hardcoded "daily always wins over whole-period" rule (this is the correction to the original F10 answer). Instead, reconcile toward whichever available pivot-table source is **most internally consistent and complete** — the specific ranking logic is not "one file type always wins," it's a reconciliation judgment made per-account based on what's actually present.
4. Because more-than-two pivot exports are now required for full demographic/placement/copy coverage, and multiple imports covering overlapping data carry real double-counting risk, every pivot row must anchor to `ad_id` (consistent with the ad_id-anchoring architecture in `SPEC_ad_id_anchored_creative_mapping.md`) so demographic/placement/copy detail reconciles *into* the master total rather than being independently summed.
5. **User-facing display stays separate even though the backend reconciliation is unified:** demographic breakdowns, placement breakdowns, and copy breakdowns should still render as their own distinct sections in the UI — reconciling them into one master total internally does not mean flattening them together for the user.

**Filename independence — explicit requirement, new to this session:** none of the above should depend on the user naming their uploaded CSV files any particular way. The standardized manual-import staging protocol must detect file *type* (Ad Manager Summary vs. a specific pivot-table breakdown) from the file's actual columns/content, not from its filename — the user cannot be expected to know or follow a naming convention for raw Meta exports.

## 7. Reports hub page (O2) — confirmed, no delete

Keep `/app/reports` as a deep link, matching the original recorded disposition. No reversal.

## 8. ROAS (O5) — confirmed, full restore, additive-only

Restore ROAS and purchase value as a real reporting metric across the platform, correcting the gap where the alert-only exclusion (`alert_rules.metric <> 'roas'`, which only ever governed automated alerting) mistakenly resulted in the underlying data never being captured at all.

**Explicit implementation constraints, as clarified:**
- Fully additive. No disruptive effect on the current interface, past strategy documentation, or past runs.
- Confirm purchase value is actually capturable from both the Meta API and manual CSV exports before building the ingestion side.
- Once captured, ROAS/purchase-value slots into existing machinery that already supports exactly this pattern: the metric-picker dropdowns (`KpiTile`'s categorized dropdown), existing data visualizations and charts in Analysis, recommendation tile schemas, and KPI tiles — not new parallel UI.
- For past Strategy-phase documentation and outputs: do not assume no impact — check whether existing documentation should be revised or rewritten now that ROAS is available again, then implement to the actual Metrix IAP standard for algorithmic/ML-driven strategy output (the IAP Brain's proprietary intelligence and learning-loop standard), not just a bolt-on metric.
- The only implied changes from this addition: new values in the seeded/dynamic data slots, and ROAS/purchase-value appearing in the visualizations, charts, breakdowns, dropdowns, filtered metrics, and KPI tiles that already exist.

## 9. Data Provenance / Bookster leak — fix now for all current accounts, not an audit-and-report

Confirmed root cause: a hardcoded fallback string in `metrixSeedAssembly.ts` ("Assembled from Supabase tables imported from the real Bookster IAP loop package") fires whenever an account's own `integrity_note` config is missing.

**Scope, as clarified:** this is not a "flag it and audit later" item — fix it now, for every current account (there is currently one real user of the platform, so "every account" is a small, bounded set today, but the fix itself must be structural, not account-by-account patching). Concretely:
1. Replace the Bookster-specific fallback with a generic, account-agnostic default.
2. Ensure every current account has its own correct `integrity_note` seeded, so none of them are silently hitting the fallback.
3. Search for other instances of the same pattern — hardcoded, client-specific dev-time content used as a "generic" fallback — beyond the two already found (V3/C4E placement-signal labels, this Data Provenance string). Both known instances trace back to the same root habit (Bookster's early onboarding data getting baked in as if it were universal), so there is real reason to expect more.

## 10. Blanket authorization — confirmed, apply everything end-to-end

Given items 1–9 above are now resolved (not open), blanket end-to-end authorization is confirmed. Rationale for why this is safe now: the UI-sweep-first execution order means these backend/data changes get implemented into the *already-redesigned* interface rather than into the current one — removing the regression risk that would come from building against a UI that's about to be replaced.

## 11. Execution Layer UI sweep — full redesign, explicit non-regression list, Watermelon UI as interaction reference

**This is a full redesign, not a light consistency pass.** Interface layout, style, responsiveness, the specific modules/cards currently offered, and overall aesthetic are all in scope for change, in service of achieving a genuinely better, unified Execution Layer across all five Command Center pages (Analysis, Strategy, Creative, MST, plus Listen/Reports/Exports).

**What must be preserved — explicit non-regression list:**
- Each Command Center page remains the **sole place** a stage's run can be manually triggered (per item 4). This functional role is not to be diluted, hidden, or moved during the redesign.
- Every CSS/table change already implemented and validated elsewhere in the platform (design tokens, typography scale, the disclosure-rulebook pattern, the `KpiTile` dropdown primitive, etc.) must be preserved and built upon, not reinvented or regressed.
- Accessibility work already done (focus trapping, reduced-motion support, keyboard navigation, `aria` labeling) carries forward.

**What must change:**
- Parent-nav click behavior: clicking a parent nav item (whether by accident or intentionally, before or instead of using the hover flyout) must land the user on a well-designed, navigable hub — not an accordion toggle with a hidden double-click shortcut to actually navigate (see the sidebar finding in Item 10 of the reference package for the exact current mechanism being replaced).
- Structural consistency across all five pages via a shared layout component, not five independently-built pages of wildly different size and shape.
- Reduction of scattered, redundant warning/alert banners (the duplicated "staged creatives" banner is the confirmed example) down to placement that's actually useful and non-repetitive.
- The hover-flyout dismissal sensitivity fix (wider hit-area / short close-delay), tested carefully given a similar flyout was already removed once elsewhere for reliability problems.
- Full incorporation of the new features from items 2, 4, and 5 above (run-selection control, per-page status/progress hub) as first-class, well-designed elements of each page — not retrofitted afterward.

**Design/interaction reference: Watermelon UI** (`watermelon-ui-claude-code-reference-sheet.md`, included in this package). Use the specific components already mapped to Metrix use cases in that file — most directly relevant to this sweep: `layered-progressive-disclosure` (dense analysis modules), `card-split-accordian` (expandable strategy/insight cards), `filter-disclosure` (compact filters), `fluid-tabs`/`continuous-tabs` (the sub-tab consistency requirement), `morphing-sidebar-controls` (the nav/hover-flyout fix), `labeled-progress-indicator` (the per-page status/progress hub from item 4/5), `inline-toast` (low-friction status feedback, replacing some of the current full-width warning banners). Per that file's own reference rule: reproduce the interaction model, state transitions, and timing character — not Watermelon's visual branding — translated into Metrix's existing design system, and never at the expense of dense-data readability or accessibility.
