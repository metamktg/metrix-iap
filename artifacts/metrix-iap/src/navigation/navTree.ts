// ─── Single source of truth for sidebar navigation ────────────────────
// All labels, routes, badge keys, and placeholder flags live here.
// Sidebar.tsx consumes this — no nav data defined elsewhere.

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
  // Expandable section: renders children list
  children?: NavChild[];
  badgeKey?: NavBadgeKey;
  dataSource?: string;
};

export const navTree: NavSection[] = [
  {
    id: "account",
    number: "00",
    label: "Ad Account",
    to: "/app/account",
    dataSource: "core_reanalysis_read, campaign_summary",
  },
  {
    id: "listen",
    number: "01",
    label: "Listen",
    to: "/app/listen",
    badgeKey: "signals",
    dataSource: "core_reanalysis_read",
  },
  {
    id: "analysis",
    number: "02",
    label: "Analysis",
    to: "/app/analysis",
    dataSource: "performance_by_cell, v3_variable_performance",
  },
  {
    id: "strategy",
    number: "03",
    label: "Strategy",
    children: [
      {
        id: "strategy-overview",
        label: "Overview",
        to: "/app/strategy",
        dataSource: "message_pillars, active_hypotheses",
      },
      {
        id: "strategy-brief-builder",
        label: "Brief Builder",
        to: "/app/strategy/brief-builder",
        badgeKey: "briefs",
        dataSource: "draft_briefs",
      },
    ],
  },
  {
    id: "reports",
    number: "04",
    label: "Report Builder",
    to: "/app/report-builder",
    dataSource: "report_sections",
  },
  {
    id: "mst",
    number: "05",
    label: "MST",
    to: "/app/mst",
    badgeKey: "mst",
    dataSource: "historical_matrix_4x4",
  },
  {
    id: "agent",
    number: "06",
    label: "Metrix Agent",
    to: "/app/agent",
    badgeKey: "agent",
  },
  {
    id: "settings",
    number: "07",
    label: "Settings",
    to: "/app/settings",
  },
];
