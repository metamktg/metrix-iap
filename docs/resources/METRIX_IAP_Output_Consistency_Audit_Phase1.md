# Metrix IAP Output Consistency Audit — Phase 1

**Audit date:** August 4, 2026 **Scope:** every seed-bundle field (`seedTypes.ts`) checked against
every page under `artifacts/metrix-iap/src/pages/metrix/`, for both Ad-Account-level and
Agency-level (Manager) views. **Method:** read-only trace of every getter in `metrixSeedAdapter.ts`
and its call sites. Excludes fields already documented dead in Initiative 1
(`variable_registry`, `IAPData.data_quality`, per-item `origin`, `AdRecord.meta_ad_id`/`test_id`/
`variation`) and the `CommunicationsView.tsx` fields already fixed (`funnel_application` etc.).

## Headline finding

Most data categories are well-wired. The real gaps cluster in three places: **BriefBuilder**
(several per-brief metadata fields silently dropped from the detail view), **OptimizationLoop**
(policy fields with no code path on either side — consistent with Initiative 5's finding that this
stage is mostly a stub), and **MST library-cell QA metadata** (never surfaced, so a mis-mapped or
low-confidence asset gives no visual signal). One finding ties directly to onboarding: the backend
already assembles guided-setup copy for empty ad accounts that the frontend ignores in favor of
hardcoded text.

## By category

**AnalysisData — fully wired.** Every field reaches the Ad Account analysis pages. No Agency-level
analysis surface exists by design (Manager scope is restricted to bottom-line totals only) — not a
gap, an intentional boundary.

**BriefBuilder — partially dead** (Ad Account only, no Agency surface):
| Field | Status |
| :--- | :--- |
| `provenance`, `source_policy` | wired |
| `draft_briefs[].book` | dead — not in `briefs/BriefBuilderView.tsx` or `creative/CreativeBriefBuilderView.tsx` detail drawers |
| `draft_briefs[].mode` | dead — same |
| `draft_briefs[].voice` | dead — same |
| `draft_briefs[].confidence` | dead — brief-level confidence never shown, unlike card-level confidence elsewhere |
| `draft_briefs[].full_brief` | dead as rendered content — deliberately stripped before JSON export (`exports/ExportsBriefView.tsx:38`), and never shown in either detail drawer either |

**ReportBuilder — fully wired.** Branding/format/history fields all reach `reports/*` and
`exports/ExportsReportsView.tsx`. No Agency-level report surface (reports are always account-scoped
by design).

**OptimizationLoop — mostly dead policy fields** (Ad Account only). Only `recommendation_cards` and
`action_policy` (single site: `listen/RecommendationsView.tsx:83`) are read anywhere.
- `visibility` — dead, never checked
- `manager_overview_visibility` — dead. This one sounds Agency-scoped (should it gate whether an
  account's cards surface at manager level?), but `ManagerOverview.tsx` doesn't read per-account
  `optimization_loop` at all — it reads a separate `ManagerAccount.recommendation_cards`. The flag
  has no code path on either side.
- `dismiss_policy` — dead. `act/ActionQueueView.tsx` has full dismiss/restore UI but never surfaces
  the policy text as a caveat.
- `source_policy` (distinct from `BriefBuilder.source_policy`) — dead, no `CaveatNote` renders it.

This cluster is consistent with Initiative 5's finding that Optimization Loop is mostly stubbed —
these aren't independent UI bugs so much as symptoms of the same underlying gap.

**MST — several dead fields** (Ad Account only):
- `status`, `render_policy`, and most `local_book2_library[]` fields (message/CTA/visual system/
  concept id) — wired via `lib/creative-assembly.ts:118-149`
- `local_book2_library[].asset_filename` — dead. `creative-assembly.ts:133` sources the displayed
  filename from `AdRecord.asset_filename` instead, so the MST library cell's own copy is never read
- `local_book2_library[].qa_mapping_status` — dead, zero references anywhere
- `local_book2_library[].mapping_confidence` — dead, zero references anywhere
- `historical_matrix_4x4.diagonal_down` / `.diagonal_up` (the matrix-level id arrays) — dead. Only
  the per-cell `diagonal_role` is read; the matrix-level path arrays are never used
- `source_artifacts` — dead, zero references

The two QA fields are the most worth prioritizing if MST work continues: an asset with low mapping
confidence or a flagged QA status currently displays identically to a fully-validated one — no visual
distinction anywhere in the Creative/MST UI.

**Manager/Agency-level.** `bottom_line_totals`, `configured_ad_accounts`, `unconfigured_ad_accounts`,
`recommendation_cards` — fully wired (`ManagerOverview.tsx`). `ManagerAccount.type` and
`.overview_mode` are dead (only `id`/`name` are pulled off the manager context) — low priority,
likely genuinely unused metadata rather than a UX gap.

**IAPData wrapper.** `intelligence` and `loop_status` wired; `metadata` is dead (zero references
anywhere) — newly confirmed this pass.

**AdAccount misc:**
- `facebook_page_dp_url` — dead, zero references
- `overview_state.description` / `.primary_action` / `.secondary_action` — **dead, and directly
  relevant to onboarding.** `shared.tsx`'s `UnconfiguredState` component only reads `overview_state.title`
  — the guided-setup copy and CTA labels the backend specifically assembles for an unconfigured
  account's empty state are dropped in favor of hardcoded strings. This is backend-authored onboarding
  guidance that never reaches the screen it was built for.
- `cohort` — wired (`analysis/AnalysisCommandCenter.tsx`)

**WorkspaceSettings.billing** — confirmed unused, but this is **intentional**, not a gap:
`settings/BillingView.tsx` was deliberately changed this session to show an honest "open beta, no
billing yet" state instead of rendering the mock plan/usage/invoice data the seed still assembles.
Flagging only so a future pass doesn't mistake the unused field for an oversight.

## Suggested priority

1. **`overview_state.description`/`.primary_action`/`.secondary_action`** — small, contained fix,
   directly improves the onboarding empty-state experience with copy the backend already wrote.
2. **MST QA fields** (`qa_mapping_status`, `mapping_confidence`) — gives creative ops a visual signal
   for asset mapping problems that's currently invisible.
3. **BriefBuilder per-brief metadata** (`book`/`mode`/`voice`/`confidence`) — straightforward
   additions to the existing detail drawers, no new data plumbing needed.
4. **OptimizationLoop policy fields** — hold until the broader Optimization Loop stub gets built
   (Initiative 5); fixing these in isolation would just be surfacing policy text for a feature that's
   mostly not there yet.
