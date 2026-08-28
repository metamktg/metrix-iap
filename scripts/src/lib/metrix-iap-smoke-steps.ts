// Declarative list of steps run by the Metrix IAP smoke orchestrator
// (smoke-metrix-iap-tests.ts). Each step is a script in scripts/package.json
// invoked via `pnpm --filter @workspace/scripts run <script>` — except the
// vitest step, which runs the metrix-iap package's own test suite.
//
// Any new `smoke:metrix-iap-*` script MUST either be added here or explicitly
// listed in EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS; the guard test
// metrix-iap-smoke-coverage.test.ts fails otherwise.

export interface SmokeStep {
  /** Human-readable label used in logs and failure messages. */
  label: string;
  /** scripts/package.json script name to run via pnpm. */
  script: string;
}

export const IAP_SMOKE_STEPS: SmokeStep[] = [
  { label: "Login page layout e2e", script: "smoke:login-page-layout" },
  { label: "Forgot-password flow e2e", script: "smoke:forgot-password" },
  {
    label: "Register session-persistence e2e",
    script: "smoke:register-session-persistence",
  },
  { label: "Slider persistence e2e", script: "smoke:metrix-iap-slider-persistence" },
  { label: "Funnel filter e2e", script: "smoke:metrix-iap-funnel-filter" },
  { label: "Engagement funnel e2e", script: "smoke:metrix-iap-engagement-funnel" },
  {
    label: "SectionInfoIcon tooltip e2e (EngagementFunnel + AdPerformance)",
    script: "smoke:metrix-iap-section-info-icons",
  },
  {
    label: "SectionInfoIcon tooltip e2e (Audience + Placements + Budget)",
    script: "smoke:metrix-iap-section-info-tooltips",
  },
  {
    label: "Avatars page tooltip e2e (signal badge + placements + cell chips)",
    script: "smoke:metrix-iap-avatars-tooltips",
  },
  { label: "AdAccountOverview UX e2e", script: "smoke:metrix-iap-ad-account-overview" },
  { label: "IAP Library review queue e2e", script: "smoke:metrix-iap-review-queue" },
  {
    label: "MetricHoverPopover + drill-down e2e",
    script: "smoke:metrix-iap-hover-popover",
  },
  { label: "Manual import flow e2e", script: "smoke:metrix-iap-manual-import" },
  {
    // Walks every authenticated route in a real browser looking for a
    // <button> inside a <button> (or a link inside a button). check:interaction
    // scans for the same thing statically and cannot see the real instances,
    // because they are formed by composition across two files. The browser
    // resolves that nesting by DROPPING one control, so an action silently
    // stops working with no error and no visual difference.
    label: "DOM validity e2e (no nested interactive controls)",
    script: "smoke:metrix-iap-dom-validity",
  },
  {
    // Measures the creative tile's media pane on every animation frame as it
    // expands. A shared-layout morph is invisible to every other kind of
    // test: delete a layoutId and the app still renders, still opens, still
    // passes — it just stops being continuous.
    label: "Shared-layout morph e2e (creative tile → expand panel)",
    script: "smoke:metrix-iap-shared-layout",
  },
];

/**
 * smoke:metrix-iap-* scripts intentionally NOT run by the orchestrator.
 * Every entry must carry a reason so exclusions stay deliberate.
 */
export const EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS: Record<string, string> = {
  "smoke:metrix-iap-tests": "the orchestrator itself — running it would recurse",
  "smoke:metrix-iap-build":
    "full production build; runs in its own dedicated workflow (metrix-iap-build)",
};
