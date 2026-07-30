// ─── Single source of truth for sidebar navigation ────────────────────
// All labels, routes, badge keys, and placeholder flags live here.
// Sidebar.tsx consumes this — no nav data defined elsewhere.
//
// 5-section information architecture:
//   1 Home     → leaf /app/home
//   2 Analyze  → Findings / Audience / Placements / Budget
//   3 Act      → Action Queue / Hypotheses / Briefs / MST
//   4 Report   → New Report / History / Exports
//   5 Settings → Account / Integrations / Team / Notifications / Billing

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
  | "Settings2"
  | "House"
  | "Zap";

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
    id: "home",
    number: "01",
    label: "Home",
    icon: "House",
    to: "/app/home",
    matchPaths: ["/app/account"],
  },
  {
    id: "analyze",
    number: "02",
    label: "Analyze",
    icon: "BarChart2",
    landing: "/app/analyze",
    children: [
      {
        id: "analyze-findings",
        label: "Findings",
        to: "/app/analyze/findings",
      },
      {
        id: "analyze-audience",
        label: "Audience",
        to: "/app/analysis/audience",
        dataSource: "demographic_registration_signal",
      },
      {
        id: "analyze-placements",
        label: "Placements",
        to: "/app/analysis/placements",
        dataSource: "v3_placement_signal, c4e_placement_signal",
      },
      {
        id: "analyze-budget",
        label: "Budget",
        to: "/app/analysis/budget",
        dataSource: "campaign_summary, performance_by_cell",
      },
    ],
  },
  {
    id: "act",
    number: "03",
    label: "Act",
    icon: "Zap",
    landing: "/app/act",
    children: [
      {
        id: "act-queue",
        label: "Action Queue",
        to: "/app/act/queue",
      },
      {
        id: "act-hypotheses",
        label: "Hypotheses",
        to: "/app/strategy/hypotheses",
        dataSource: "active_hypotheses, message_pillars",
      },
      {
        id: "act-briefs",
        label: "Briefs",
        to: "/app/briefs",
        badgeKey: "briefs",
        dataSource: "draft_briefs",
      },
      {
        id: "act-mst",
        label: "MST",
        to: "/app/mst",
        badgeKey: "mst",
        dataSource: "historical_matrix_4x4, performance_by_cell",
      },
    ],
  },
  {
    id: "report",
    number: "04",
    label: "Report",
    icon: "FileBarChart",
    landing: "/app/reports",
    children: [
      {
        id: "report-new",
        label: "New Report",
        to: "/app/reports/new",
        dataSource: "report_sections",
      },
      {
        id: "report-history",
        label: "History",
        to: "/app/reports/history",
        dataSource: "report_history",
      },
      {
        id: "report-exports",
        label: "Exports",
        to: "/app/reports/exports",
        dataSource: "report_history, export_formats",
      },
    ],
  },
  {
    id: "settings",
    number: "05",
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
