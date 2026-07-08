// ─── Single source of truth for sidebar navigation ────────────────────
// All labels, routes, badge keys, and placeholder flags live here.
// Sidebar.tsx consumes this — no nav data defined elsewhere.
//
// Locked structure:
//   Overview
//   Listen        → Signal / Alerts / Recommendations
//   Analysis      → IAP Library / Concept Map / Budget
//   Strategy      → Hypothesis Queue / Avatars
//   Creative Briefs → Brief Builder / History
//   Report Builder
//   MST
//   Metrix Agent  (Coming Soon)
//   Settings

export type NavBadgeKey =
  | "signals"
  | "briefs"
  | "mst"
  | "agent"
  | null;

export type NavChild = {
  id: string;
  label: string;
  to: string;
  badgeKey?: NavBadgeKey;
  dataSource?: string;
  placeholder?: boolean;
};

export type NavSection = {
  id: string;
  number: string;
  label: string;
  // Leaf section: direct link, no expand/collapse
  to?: string;
  // Additional locations that should mark this section active.
  matchPaths?: string[];
  // Expandable section: renders children list
  children?: NavChild[];
  badgeKey?: NavBadgeKey;
  dataSource?: string;
  placeholder?: boolean;
};

export const navTree: NavSection[] = [
  {
    id: "overview",
    number: "00",
    label: "Overview",
    to: "/",
    matchPaths: ["/app/account"],
    dataSource: "core_reanalysis_read, campaign_summary",
  },
  {
    id: "listen",
    number: "01",
    label: "Listen",
    children: [
      {
        id: "listen-signal",
        label: "Signal",
        to: "/app/listen/signal",
        badgeKey: "signals",
        dataSource: "signal_cards",
      },
      {
        id: "listen-alerts",
        label: "Alerts",
        to: "/app/listen/alerts",
        dataSource: "signal_cards, data_caveats",
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
    number: "02",
    label: "Analysis",
    children: [
      {
        id: "analysis-library",
        label: "IAP Library",
        to: "/app/analysis/library",
        dataSource: "performance_by_cell, v3_variable_performance",
      },
      {
        id: "analysis-concept-map",
        label: "Concept Map",
        to: "/app/analysis/concept-map",
        dataSource: "performance_by_cell, message_pillars",
      },
      {
        id: "analysis-budget",
        label: "Budget",
        to: "/app/analysis/budget",
        dataSource: "campaign_summary, performance_by_cell",
      },
    ],
  },
  {
    id: "strategy",
    number: "03",
    label: "Strategy",
    children: [
      {
        id: "strategy-hypotheses",
        label: "Hypothesis Queue",
        to: "/app/strategy/hypotheses",
        dataSource: "active_hypotheses, message_pillars",
      },
      {
        id: "strategy-avatars",
        label: "Avatars",
        to: "/app/strategy/avatars",
        dataSource: "historical_matrix_4x4, demographic_registration_signal",
      },
    ],
  },
  {
    id: "briefs",
    number: "04",
    label: "Creative Briefs",
    children: [
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
    number: "05",
    label: "Report Builder",
    to: "/app/report-builder",
    dataSource: "report_sections",
  },
  {
    id: "mst",
    number: "06",
    label: "MST",
    to: "/app/mst",
    badgeKey: "mst",
    dataSource: "historical_matrix_4x4",
  },
  {
    id: "agent",
    number: "07",
    label: "Metrix Agent",
    to: "/app/agent",
    badgeKey: "agent",
    placeholder: true,
  },
  {
    id: "settings",
    number: "08",
    label: "Settings",
    to: "/app/settings",
  },
];
