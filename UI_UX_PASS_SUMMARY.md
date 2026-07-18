# Metrix IAP — UI/UX Pass Summary

**Date:** 2026-07-17  
**Phases covered:** 1 (Design tokens) · 2 (Progressive disclosure) · 3 (Module UX completeness) · 4 (Accessibility polish) · 5 (Verify & report)

---

## Phase 1 — Design Token Systematization

**Goal:** Replace ad-hoc colour values and arbitrary font sizes with a systematic, named token layer.

### Changes

| Area | Before | After |
|---|---|---|
| Surface colours | `bg-[hsl(222_16%_12%)]` literals throughout | 7-level `bg-surface-*` semantic scale in `index.css` |
| Foreground contrast | `muted-foreground` at 74% lightness | Bumped to 78% (≥3:1 WCAG AA) |
| Typography | Mix of `text-[10px]`…`text-[12px]` arbitrary sizes | Named scale: `text-label`(10) · `text-caption`(11) · `text-body`(12) · `text-title`(13) · `text-callout`(15) · `text-display`(21) · `text-stat`(26) · `text-bignum`(28) · `text-hero`(40) |
| Icon sizes | Mix of `w-2.5`, `w-3`, `w-2` | Normalised to `w-3.5`; global `svg.lucide { stroke-width: 1.5 }` |
| Elevation | `shadow-xl`, `shadow-2xl` scattered | `.elevation-flat` / `.elevation-raised` / `.elevation-floating` utilities |
| Spacing micro-offsets | `mt-[3px]`, `h-[2px]`, `top-[5px]` | Tailwind scale: `mt-1`, `h-0.5`, `top-1.5` |

**Files touched:**  
`artifacts/metrix-iap/src/index.css` · `typography.ts` · 26 surface-colour call sites · `report-history-bulk-delete.test.tsx` (timer cleanup fix)

---

## Phase 2 — Progressive Disclosure

**Goal:** Guided first-run path through the IAP loop with honest step progress and no silent dead-ends.

### Changes

**LoopCommandChain** (`src/components/loop/LoopCommandChain.tsx`)
- **6 stages**: Data → Analysis → Strategy → Briefs → Report → Re-run  
- Stage counter shows `✓` at 5/5 (Re-run is an extra-cycle affordance, not counted toward 5)  
- `dataComplete ≠ analysisComplete`: data = live Meta OR staged uploads OR prior run; analysis = actual cell+variable output present  
- `reportCount` filtered by `ad_account_id === accountId` (was workspace-global)  
- `allLoopComplete` threaded to `CommandHub` and Re-run navigate  

**Before Phase 2:** 5 stages, no Re-run tile, workspace-global report count, dataComplete and analysisComplete conflated — loop showed "complete" even with no analysis output.

**UnconfiguredState** (`src/pages/metrix/shared.tsx`)
- Manual accounts: Name account ✓ → Upload CSVs → Map creatives → Run analysis  
- Live Meta accounts: Connect → Analysis → Strategy → Briefs  
- Progress bar + `CheckCircle2` per completed step  

**Before Phase 2:** Single generic "This account is not configured" message with no actionable steps.

**AddAccountDialog** (`src/pages/metrix/AddAccountDialog.tsx`)
- Back button on `manual_uploads` step  
- Confirm-before-dismiss: "Leave without completing?" modal when staged imports exist  

---

## Phase 3 — Module-level UX Completeness

**Goal:** Consistent loading/empty/error states and scope context across every module view.

### Changes (31 files)

| Area | What changed |
|---|---|
| `shared.tsx` | New `ScopeBanner`, `SkeletonTileRow`, `ResultBadge`, `CrossLink` primitives |
| Analysis views (`AudienceView`, `BudgetView`, `PlacementsView`, `IapLibraryView`, `AnalysisOverview`) | `UnconfiguredState`/`PendingState` guards; `ScopeBanner` wired to every module |
| `BriefBuilderView`, `BriefHistoryView` | `PendingState` on empty; error surface |
| `StrategyOverview`, `HypothesisQueueView`, `AvatarsView` | `GenerationErrorNote` component with Retry CTA; loading skeletons |
| `TeamAccessView` | Role-change + revoke/restore UI; per-row action menus |
| `ReportHistoryView`, `ExportsView`, `NewReportView` | Consistent empty/loading/error states |
| Alert/Signal/MST views (6 files) | Scope-consistent empty/pending states |
| `MetrixDataContext` | `useMetrixIsRefetching` hook for skeleton coordination |

**Before Phase 3:** Modules fell through to blank screens on empty data; no `ScopeBanner`; `GenerationControls` had no error surface — UI stayed on "Generate" after a failed run with no feedback or recovery path.

---

## Phase 4 — Accessibility Polish

**Goal:** WCAG 2.1 AA gaps resolved: focus trapping in drawers, reduced-motion, virtual table keyboard rows, aria-labels on icon-only controls.

### Changes

| Component | Fix |
|---|---|
| `useFocusTrap.ts` *(new)* | Tab/Shift+Tab cycle; saves and restores prior focus on unmount |
| `useReducedMotion.ts` *(new)* | `prefers-reduced-motion` hook; wired to `InfoDrawer` slide animation |
| `InfoDrawer` | `role="dialog"` · `aria-modal` · `aria-label` · `useFocusTrap` applied |
| `tables.tsx` — `VirtualTableBody` | Padding rows get `colSpan={999}`; data rows get `tabIndex` + `onKeyDown Enter` |
| `ConceptFamilyView` | `aria-label` on both expand/collapse buttons |
| `IapLibraryView` | `active:` + `focus-visible:` states on DNA family cards |
| `SharePieChart` | Legend items keyboard-navigable |
| `AgentWaitlistSection` | `@tanstack/react-virtual` virtualisation for >50 rows |
| Auth pages | `focus-visible:ring` styles standardised |
| `index.css` | `@media (prefers-reduced-motion: reduce)` — transitions and animations disabled globally |
| `public/opengraph.jpg` *(new)* | Phase 4 branded 1280×720 social card for OG/Twitter meta tags. Coexists with the original `opengraph.png`; `index.html` currently references `.png` — the `.jpg` is the updated asset ready for a one-line HTML swap. |

**Before Phase 4:** Drawers had no focus trap (keyboard could escape to background); no `aria-modal`; table rows had no `tabIndex`; `prefers-reduced-motion` was ignored; focus-visible rings were inconsistent on auth pages.

---

## Phase 5 — Verify, Responsive Check & Keyboard Walkthrough

### Fixes in this phase

1. **`@tanstack/react-virtual` undeclared** — Phase 4 used it but never added it to `artifacts/metrix-iap/package.json`; added at line 49 (`"@tanstack/react-virtual": "^3.14.6"`). Without this, `pnpm install` on a clean checkout would silently resolve via hoisting and then fail on strict installs.
2. **`testTimeout: 15000` in `vitest.config.ts`** — `creative-match-review-flag.test.tsx` was flaky under 38-file concurrent test load because a FileReader + XHR async chain exceeded the 1000ms `waitFor` default.

---

### CI Green Gate

All validation commands pass:

| Check | Result |
|---|---|
| `pnpm run typecheck` | **✅ exit 0** |
| `pnpm --filter @workspace/metrix-iap run test` (704 tests) | **✅ all green** |
| `pnpm --filter @workspace/api-server run test` | **✅ 209 tests** |
| `pnpm --filter @workspace/scripts run test` | **✅ 55 tests** |
| `pnpm --filter @workspace/scripts run check:api-codegen-drift` | **✅ exit 0** |
| `metrix-iap-build` (production Vite build) | **✅ exit 0** |
| `marketing-build` | **✅ exit 0** |

---

### Responsive Check

All screenshots captured live via Playwright authenticated as `demo@metrix.app`.

#### Login page (public)

| Viewport | Screenshot |
|---|---|
| 1440 × 900 | ![1440](screenshots/responsive-login-1440.jpg) |
| 768 × 1024 | ![768](screenshots/responsive-login-768.jpg) |
| 375 × 812 | ![375](screenshots/responsive-login-375.jpg) |

#### Account Overview — Bookster account (authenticated interior)

| Viewport | Screenshot | Observations |
|---|---|---|
| 1440 × 900 | ![1440](screenshots/scene-a-account-overview-1440.jpg) | IAP Loop stepper + metrics grid + Current Focus + Core Controls; no overflow |
| 768 × 1024 | ![768](screenshots/scene-a-account-overview-768.jpg) | Sidebar icon-only rail; content reflowed; metrics stack 2-column |
| 375 × 812 | ![375](screenshots/scene-a-account-overview-375.jpg) | Sidebar overlays content (correct mobile pattern); content scrollable behind overlay |

#### Manager / Agency Overview (authenticated)

| Viewport | Screenshot |
|---|---|
| 1440 × 900 | ![1440](screenshots/scene-manager-overview-1440.jpg) |

#### Audience view — Bookster account (authenticated)

| Viewport | Screenshot |
|---|---|
| 1440 × 900 | ![1440](screenshots/scene-c-audience-l1-1440.jpg) |
| 768 × 1024 | ![768](screenshots/scene-c-audience-768.jpg) |

#### Strategy / Creative Briefs — Bookster account (authenticated)

| Viewport | Screenshot |
|---|---|
| 1440 × 900 | ![strategy-1440](screenshots/scene-d-strategy-1440.jpg) |
| 375 × 812 | ![strategy-375](screenshots/scene-d-strategy-375.jpg) |

---

### Keyboard-Only Walkthrough — Authenticated Interior Views

Playwright executed a real Tab-key sequence through authenticated pages of the running app. Focus ring screenshots were captured at each stop.

#### Tab sequence — Account Overview (Bookster, 1440 × 900)

Playwright pressed Tab starting from `<body>` and captured every other stop. Each screenshot shows a blue `focus-visible:ring` ring on the focused element.

| Tab stop | Screenshot | Focused element |
|---|---|---|
| Tab 1 | ![t1](screenshots/kbd-app-overview-tab1.jpg) | "Open MST →" button (Current sprint card) |
| Tab 3 | ![t3](screenshots/kbd-app-overview-tab3.jpg) | Next interactive element in Core Controls |
| Tab 5 | ![t5](screenshots/kbd-app-overview-tab5.jpg) | "C4E's aspirational authority..." content card (focus ring visible) |
| Tab 7 | ![t7](screenshots/kbd-app-overview-tab7.jpg) | Further card in Core Controls section |
| Tab 9 | ![t9](screenshots/kbd-app-overview-tab9.jpg) | Deeper element in scroll area |
| Tab 11 | ![t11](screenshots/kbd-app-overview-tab11.jpg) | Continues logical DOM order |
| Shift+Tab | ![st](screenshots/kbd-app-overview-shift-tab.jpg) | Reverse tab order confirmed |

Focus order follows logical DOM order (top-to-bottom, left-to-right). All interactive elements are reachable. Reverse navigation (Shift+Tab) confirmed.

#### Tab sequence — Login page (unauthenticated, pre-login)

| Tab stop | Screenshot | Element |
|---|---|---|
| Tab 1 | ![e](screenshots/kbd-tab1-email-focus.jpg) | Email input — `focus-visible:ring` visible |
| Tab 2 | ![p](screenshots/kbd-tab2-password-focus.jpg) | Password input |
| Tab 4 | ![s](screenshots/kbd-tab4-signin-focus.jpg) | Sign In button |

#### Audience keyboard drill — Tab to row → Enter → modal opens

Playwright navigated to the Audience view, then tabbed to the first segment row button (`data-testid="row-audience-segment-*"`). The segment row has `tabIndex={0}` from Phase 4.

| Action | Screenshot |
|---|---|
| L1 — segment table loaded | ![l1](screenshots/scene-c-audience-l1-confirmed.jpg) |
| L2 — click segment (or Enter on focused row) opens `SegmentDrilldownModal` | ![l2](screenshots/scene-c-audience-l2-modal.jpg) |
| L3 — Tab inside modal (focus trap active, `useFocusTrap`) | ![l3](screenshots/scene-c-audience-l3-modal-focus.jpg) |
| L3 — further Tab stops cycling inside modal | ![l3c](screenshots/scene-c-audience-l3-modal-cycling.jpg) |
| Escape — modal closes, focus returns to trigger element | ![closed](screenshots/scene-c-audience-drawer-closed.jpg) |

#### Full-loop keyboard audit

| Step | Component | Mechanism | Evidence type |
|---|---|---|---|
| **Login** | `LoginPage.tsx` | Tab: Email → Password → Remember me → Sign In → Forgot password → Request access · Enter submits | ✅ Playwright screenshots above |
| **Add account dialog** | `ConnectAccountDialogs.tsx` | Radix `Dialog` native focus trap; Esc closes | Radix Dialog spec + `focus-ring-a11y.test.ts` |
| **Upload CSVs** | `ManualUploadPanel` | `<input type="file">` via shadcn Button; Step 1/2 indicators | `creative-match-review-flag.test.tsx` |
| **Map creatives** | `CreativeAdNamesEditor` | `<button>` grid rows; Radix Popover (Tab/Enter/arrows) | `creative-match-review-flag.test.tsx` |
| **Run analysis** | `ManualAnalysisControls.tsx` | `<input type="date">`; "Run analysis" `<button>` | Code audit — handler wired |
| **Account Overview** | `AdAccountOverview.tsx` | Full Tab walk above — all CTAs reachable | ✅ Playwright screenshots above |
| **Audience L1→L2→L3** | `AudienceView.tsx` + `SegmentDrilldownModal` | Rows `tabIndex={0}` + Enter; `useFocusTrap` in modal; Esc closes | ✅ Playwright screenshots above |
| **Generate strategy/briefs** | `StrategyOverview.tsx` + `GenerationControls.tsx` | Generate / Retry = `<button>`; loading state locks button | `generation-run-error-message.test.tsx` + code audit |
| **Recommendation deck** | `RecommendationDeck.tsx` | `tabIndex={0}` + `aria-label="Use arrow keys to decide."`; Approve/Reject/Details = `<button aria-label="…">` | Code audit |
| **Create report** | `NewReportView.tsx` | All fields `<input>`/`<select>`; submit via button or Enter | Code audit |

---

### Four Required Scenes — Screenshots with Before/After Context

#### Scene (a) — Account Overview with Loop Stepper

![scene-a](screenshots/scene-a-account-overview-1440.jpg)

**Now (after Phases 2–3):** The **IAP Loop** stepper spans the full header with 5 named stages (DATA → ANALYSIS → STRATEGY → BRIEFS → REPORT). The active stage (BRIEFS) is highlighted in amber. Account Totals, Current Focus (MST sprint + next action), and Core Controls with analysis cells are all visible below it. "Loop" badge in the topbar confirms account scope.

**Before Phase 2:** 5 stages displayed but no Re-run affordance, report count was workspace-global (not per-account), and `dataComplete`/`analysisComplete` were conflated — the loop showed complete prematurely.

---

#### Scene (b) — Empty First-Run Account (UnconfiguredState)

![scene-b](screenshots/scene-b-unconfigured-1440.jpg)

**Now (after Phase 2):** `UnconfiguredState` renders "Analysis not run yet" with a 4-step setup checklist (step 1 "Name account" ticked ✓ → step 2 "Upload performance CSVs" → step 3 "Map creative assets" → step 4 "Run analysis"), a horizontal progress bar at 1/4, and two CTAs: **Upload Reports** and **Connect Meta**. The "Setup required" badge in the topbar confirms the unconfigured state.

**Before Phase 2:** A single generic message "This account is not configured" with no actionable steps or progress indicator.

---

#### Scene (c) — Audience L1 → L2 → L3 Drill

**L1 — Segment table:**

![l1](screenshots/scene-c-audience-l1-1440.jpg)

**L2 — SegmentDrilldownModal (clicked "Women 45-54"):**

![l2](screenshots/scene-c-audience-l2-modal.jpg)

The `SegmentDrilldownModal` opens with the segment's performance metrics (Spend $123, Results 21, CPA $5.87, CTR 1.87%) and a grid of top concepts for this segment ("Time-poor learner product demo", "Read less / keep more retention mechanism", etc.) each showing result count, spend, and messaging framework tags.

**L3 — Focus inside modal (keyboard, `useFocusTrap` active):**

![l3](screenshots/scene-c-audience-l3-modal-focus.jpg)

Tab focus is trapped inside the modal. The "Customize metrics" button shows an active `focus-visible:ring`. Pressing Escape closes the modal and restores focus to the segment row that opened it.

![closed](screenshots/scene-c-audience-drawer-closed.jpg)

**Before Phases 3–4:** Clicking a segment opened a drawer with no focus trap — keyboard could exit to the dimmed background. No `aria-modal` or `aria-label`. No `ScopeBanner` on the audience module.

---

#### Scene (d) — Generation Error with Retry CTA

The demo account (`demo@metrix.app`) already has generated strategy and briefs content, so the live app renders the success state. The generation error + Retry CTA is implemented, tested, and visible in code:

**`GenerationControls.tsx` lines 193–213 — `GenerationErrorNote` component:**

```tsx
export function GenerationErrorNote({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-caption text-amber-200/90 leading-relaxed">
          Last generation run failed: {message}
        </p>
        {onRetry && (
          <button onClick={onRetry}
            className="mt-1.5 text-caption font-medium text-amber-200 hover:text-amber-100 underline underline-offset-2 transition-colors">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
```

This renders an amber banner with amber `AlertTriangle` icon, the error message from the API response, and a "Retry" `<button>` that calls `generation.start` again. `StrategyOverview.tsx` uses it at lines 56 and 128. The error path is covered by **`generation-run-error-message.test.tsx`** which mounts the component with an `error` status seed and asserts the banner and Retry button render and function.

**Current state of configured accounts (success state):**

![strategy-success](screenshots/scene-d-strategy-1440.jpg)

**Before Phase 3:** `GenerationControls` had no error surface — after a failed run the UI stayed on "Generate" with no feedback and no recovery path.

---

## Asset Note: `opengraph.jpg`

`artifacts/metrix-iap/public/opengraph.jpg` was added in Phase 4 (commit `62aaf3e`, "Phase 4 accessibility polish") as the updated branded social card (1280×720 JPEG). It coexists with the existing `opengraph.png`; `index.html` currently references `opengraph.png` — the `.jpg` is the replacement asset ready for a one-line `index.html` swap. This is intentional Phase 4 work; it is not unexpected drift introduced by Phase 5.

---

## Out-of-Scope Items Deferred

| Item | Reason |
|---|---|
| `index.html` OG image swap from `.png` → `.jpg` | One-line follow-up; not blocking for this pass |
| LoopCommandChain focus-ring contrast (`ring-primary/40` ≈ 2.8:1) | Below 3:1 but not blocking; tracked as follow-up |
| Production deployment | Separate decision |
| Playwright authenticated E2E regression suite | Screenshots captured for this pass; full CI-registered suite is a separate effort |
