// ─── Single source of truth for sidebar navigation ────────────────────
// All labels, routes, badge keys, and placeholder flags live here.
// Sidebar.tsx consumes this — no nav data defined elsewhere.
//
// Locked 9-section information architecture (user-specified):
//   1 Overview
//   2 Listen          → Alerts / Signal / Recommendations
//   3 Analysis        → Overview / IAP Library / Audience / Placements / Budget Insight
//   4 Strategy        → Overview / Strategy Map / Avatars · ICP / Hypothesis Queue
//   5 Creative Briefs → Brief Builder / History
//   6 Report Builder  → New Report / Report History / Exports
//   7 MST             → Concept Map / Matrix Builder / Creative Scan / Crossmap Results
//   8 Metrix Agent    (Coming Soon — waitlist)
//   9 Settings        → Account / Integrations / Team & Access / Notifications / Billing

export type NavBadgeKey =
  | "signals"
  | "briefs"
  | "mst"
  | "agent"
  | null;

export type NavIconName =
  | "LayoutDashboard"
  | "Radio"
  | "BarChart2"
  | "Compass"
  | "FileText"
  | "FileBarChart"
  | "Layers"
  | "Bot"
  | "Settings2";

export type NavChild = {
  id: string;
  label: string;
  to: string;
  badgeKey?: NavBadgeKey;
  dataSource?: string;
  placeholder?: boolean;
  /** One-sentence teaser shown in tooltip when placeholder is true. */
  teaser?: string;
};

export type NavSection = {
  id: string;
  number: string;
  label: string;
  icon: NavIconName;
  // Leaf section: direct link, no expand/collapse
  to?: string;
  // Additional locations that should mark this section active.
  matchPaths?: string[];
  // Expandable section: renders children list
  children?: NavChild[];
  // Landing route for an expandable section header (e.g. the section's
  // Overview page). Falls back to the first child's route when unset.
  landing?: string;
  badgeKey?: NavBadgeKey;
  dataSource?: string;
  placeholder?: boolean;
  /** One-sentence teaser shown in tooltip when placeholder is true. */
  teaser?: string;
};

/** Route an expandable section header navigates to on click. */
export function sectionLandingRoute(section: NavSection): string | null {
  if (section.landing) return section.landing;
  return section.children?.[0]?.to ?? null;
}

export const navTree: NavSection[] = [
  {
    id: "overview",
    number: "01",
    label: "Overview",
    icon: "LayoutDashboard",
    to: "/",
    matchPaths: ["/app/account"],
    dataSource: "core_reanalysis_read, campaign_summary",
  },
  {
    id: "listen",
    number: "02",
    label: "Listen",
    icon: "Radio",
    children: [
      {
        id: "listen-alerts",
        label: "Alerts",
        to: "/app/listen/alerts",
        dataSource: "signal_cards, data_caveats",
      },
      {
        id: "listen-signal",
        label: "Signal",
        to: "/app/listen/signal",
        badgeKey: "signals",
        dataSource: "signal_cards",
      },
      {
        id: "listen-recommendations",
        label: "Recommendations",
        to: "/app/listen/recommendations",
        dataSource: "recommendation_cards",
      },
    ],
  },
  {
    id: "analysis",
    number: "03",
    label: "Analysis",
    icon: "BarChart2",
    landing: "/app/analysis",
    children: [
      {
        id: "analysis-overview",
        label: "Overview",
        to: "/app/analysis/overview",
        dataSource: "campaign_summary, performance_by_cell",
      },
      {
        id: "analysis-library",
        label: "IAP Library",
        to: "/app/analysis/library",
        dataSource: "performance_by_cell, v3_variable_performance",
      },
      {
        id: "analysis-audience",
        label: "Audience",
        to: "/app/analysis/audience",
        dataSource: "demographic_registration_signal",
      },
      {
        id: "analysis-placements",
        label: "Placements",
        to: "/app/analysis/placements",
        dataSource: "v3_placement_signal, c4e_placement_signal",
      },
      {
        id: "analysis-budget",
        label: "Budget Insight",
        to: "/app/analysis/budget",
        dataSource: "campaign_summary, performance_by_cell",
      },
    ],
  },
  {
    id: "strategy",
    number: "04",
    label: "Strategy",
    icon: "Compass",
    landing: "/app/strategy",
    children: [
      {
        id: "strategy-overview",
        label: "Overview",
        to: "/app/strategy/overview",
        dataSource: "message_pillars, performance_by_cell",
      },
      {
        id: "strategy-map",
        label: "Strategy Map",
        to: "/app/strategy/map",
        dataSource: "message_pillars, performance_by_cell",
      },
      {
        id: "strategy-avatars",
        label: "Avatars / ICP",
        to: "/app/strategy/avatars",
        dataSource: "historical_matrix_4x4, demographic_registration_signal",
      },
      {
        id: "strategy-hypotheses",
        label: "Hypothesis Queue",
        to: "/app/strategy/hypotheses",
        dataSource: "active_hypotheses, message_pillars",
      },
    ],
  },
  {
    id: "briefs",
    number: "05",
    label: "Creative Briefs",
    icon: "FileText",
    landing: "/app/briefs",
    children: [
      {
        id: "briefs-overview",
        label: "Overview",
        to: "/app/briefs",
        dataSource: "draft_briefs",
      },
      {
        id: "briefs-builder",
        label: "Brief Builder",
        to: "/app/briefs/builder",
        badgeKey: "briefs",
        dataSource: "draft_briefs",
      },
      {
        id: "briefs-history",
        label: "History",
        to: "/app/briefs/history",
        dataSource: "draft_briefs",
      },
    ],
  },
  {
    id: "reports",
    number: "06",
    label: "Report Builder",
    icon: "FileBarChart",
    landing: "/app/reports",
    children: [
      {
        id: "reports-overview",
        label: "Overview",
        to: "/app/reports",
        dataSource: "report_sections, report_history",
      },
      {
        id: "reports-new",
        label: "New Report",
        to: "/app/reports/new",
        dataSource: "report_sections",
      },
      {
        id: "reports-history",
        label: "Report History",
        to: "/app/reports/history",
        dataSource: "report_history",
      },
      {
        id: "reports-exports",
        label: "Exports",
        to: "/app/reports/exports",
        dataSource: "report_history, export_formats",
      },
      {
        id: "reports-settings",
        label: "Settings",
        to: "/app/reports/settings",
        dataSource: "report_builder defaults + workspace overrides",
      },
    ],
  },
  {
    id: "mst",
    number: "07",
    label: "MST",
    icon: "Layers",
    landing: "/app/mst",
    badgeKey: "mst",
    children: [
      {
        id: "mst-overview",
        label: "Overview",
        to: "/app/mst",
        dataSource: "historical_matrix_4x4, performance_by_cell",
      },
      {
        id: "mst-concept-map",
        label: "Concept Map",
        to: "/app/mst/concept-map",
        dataSource: "performance_by_cell, message_pillars",
      },
      {
        id: "mst-matrix",
        label: "Matrix Builder",
        to: "/app/mst/matrix",
        dataSource: "historical_matrix_4x4",
      },
      {
        id: "mst-creative-scan",
        label: "Creative Scan",
        to: "/app/mst/creative-scan",
        dataSource: "local_book2_library",
      },
      {
        id: "mst-crossmap",
        label: "Crossmap Results",
        to: "/app/mst/crossmap",
        dataSource: "historical_matrix_4x4, performance_by_cell",
      },
    ],
  },
  {
    id: "agent",
    number: "08",
    label: "Agent",
    icon: "Bot",
    to: "/app/agent",
    badgeKey: "agent",
    teaser: "Your AI strategist — analyzes patterns, surfaces winning tests, and drafts briefs autonomously.",
  },
  {
    id: "settings",
    number: "09",
    label: "Settings",
    icon: "Settings2",
    children: [
      {
        id: "settings-account",
        label: "Account",
        to: "/app/settings/account",
      },
      {
        id: "settings-integrations",
        label: "Integrations",
        to: "/app/settings/integrations",
      },
      {
        id: "settings-team",
        label: "Team & Access",
        to: "/app/settings/team",
        dataSource: "workspace_settings",
      },
      {
        id: "settings-notifications",
        label: "Notifications",
        to: "/app/settings/notifications",
        dataSource: "workspace_settings",
      },
      {
        id: "settings-billing",
        label: "Billing",
        to: "/app/settings/billing",
        dataSource: "workspace_settings",
      },
    ],
  },
];
