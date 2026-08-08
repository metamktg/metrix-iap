// ─── Onboarding tour — step definitions ────────────────────────────────
// Pure data: no React, no DOM. TourOverlay (components/onboarding) reads
// this to know which route to be on, which element to spotlight, and what
// to say. Keeping the copy here — instead of inline in the overlay —
// means a new tour is just a new array, never a change to the rendering
// engine itself.

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  /** Stable id — also used to key auto-advance behavior in TourOverlay. */
  id: string;
  /** Route this step must be shown on. Omit to stay on whatever route is current. */
  route?: string;
  /** CSS selector for the element to spotlight. Omit for a centered, un-anchored card. */
  selector?: string;
  title: string;
  body: string;
  placement?: TourPlacement;
  /** Defaults to "Next" (or "Finish tour" on the last step). */
  primaryLabel?: string;
}

export const FIRST_ANALYSIS_TOUR_ID = "first-analysis-v1";

export const firstAnalysisTourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Metrix",
    body: "A one-minute tour: run your first analysis, then jump straight into Strategy the moment it's ready.",
    placement: "center",
    primaryLabel: "Start tour",
  },
  {
    id: "run-analysis",
    route: "/app/analysis",
    selector: '[data-tour="analysis-run-panel"]',
    title: "Run your first analysis",
    body: "Pick a date range and click Run analysis. Metrix reads your staged data and builds every performance, audience, and placement view in about a minute.",
    placement: "bottom",
    primaryLabel: "Next",
  },
  {
    id: "strategy-preview",
    route: "/app/strategy",
    selector: '[data-tour="strategy-generate-panel"]',
    title: "Strategy unlocks right here",
    body: "The moment analysis finishes, this button lights up. Come back to Strategy and click Generate to turn results into message pillars and testing hypotheses.",
    placement: "bottom",
    primaryLabel: "Next",
  },
  {
    id: "watch-status",
    route: "/app/analysis",
    selector: '[data-tour="analysis-run-status"]',
    title: "Track it from right here",
    body: "This is your analysis status — watch it turn into Analysis complete, then head to Strategy to generate your playbook.",
    placement: "top",
    primaryLabel: "Finish tour",
  },
];

export const TOURS: Record<string, TourStep[]> = {
  [FIRST_ANALYSIS_TOUR_ID]: firstAnalysisTourSteps,
};
