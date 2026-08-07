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
  { label: "Home screen + 5-section nav e2e", script: "smoke:metrix-iap-home-screen" },
  { label: "Forgot-password flow e2e", script: "smoke:forgot-password" },
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
];

/**
 * smoke:metrix-iap-* scripts intentionally NOT run by the orchestrator.
 * Every entry must carry a reason so exclusions stay deliberate.
 */
export const EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS: Record<string, string> = {
  "smoke:metrix-iap-tests": "the orchestrator itself — running it would recurse",
  "smoke:metrix-iap-build":
    "full production build; runs in its own dedicated workflow (metrix-iap-build)",
  "smoke:metrix-iap-hover-popover":
    "currently failing (3/26 assertions): the spec's drill-down/DNA tests assume seed " +
    "fixture data (variable_family rows, C2B demographic rows) that no longer exists in " +
    "the current fixture. Repair the spec against current data before promoting to a step.",
};
