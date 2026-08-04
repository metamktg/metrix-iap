// ─── Single source of truth for sidebar navigation ────────────────────
// All labels, routes, badge keys, and placeholder flags live here.
// Sidebar.tsx consumes this — no nav data defined elsewhere.
//
// Locked 10-section information architecture (user-specified — the IAP
// loop expressed directly in navigation). Every expandable section's
// PARENT route is a command center: execution + run history + a loop-hub
// nav, never charts. Analytical depth lives only in child pages.
//
//   1  Overview    → IAP Loop / Updates
//   2  Listen      → Alerts / Signal / Recommendations  (parent = TL;DR)
//   3  Analysis    → Ad Performance / IAP Library / Audience / Placements / Budget / History
//   4  Strategy    → Overview / Strategy Map / Avatars·ICP·PMF / Communications / Hypothesis Queue / History
//   5  Creative    → Library / Brief Builder / Creative Scan / Import & Export
//   6  MST         → Cross-Map / Sprints / Performance / Direction
//   7  Reports     → Report Builder / Configuration / History
//   8  Exports     → Analysis / Strategy JSON / Reports / Brief   (open to all during beta; advanced-tier gating is a post-beta consideration, not enforced today)
//   9  Action      → Agent   (Coming Soon)
//   10 Settings    → General / Users & Permissions / Security / Integrations / Billing

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
  | "Download"
  | "Zap"
  | "Settings2";

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
  icon: NavIconName;
  // Leaf section: direct link, no expand/collapse
  to?: string;
  // Additional locations that should mark this section active.
  matchPaths?: string[];
  // Expandable section: renders children list
  children?: NavChild[];
  // Landing route for an expandable section header (e.g. the section's
  // command-center / pulse page). Falls back to the first child's route
  // when unset.
  landing?: string;
  badgeKey?: NavBadgeKey;
  dataSource?: string;
  placeholder?: boolean;
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
    label: "Account Overview",
    icon: "LayoutDashboard",
    landing: "/",
    matchPaths: ["/app/account"],
    dataSource: "core_reanalysis_read, campaign_summary",
    children: [
      {
        id: "overview-loop",
        label: "IAP Loop",
        to: "/app/overview/loop",
        dataSource: "stage_status (per account)",
      },
      {
        id: "overview-updates",
        label: "Updates",
        to: "/app/overview/updates",
        dataSource: "platform_updates",
        placeholder: true,
      },
    ],
  },
  {
    id: "listen",
    number: "02",
    label: "Listen",
    icon: "Radio",
    landing: "/app/listen",
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
        id: "analysis-performance",
        label: "Ad Performance",
        to: "/app/analysis/performance",
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
        label: "Budget",
        to: "/app/analysis/budget",
        dataSource: "campaign_summary, performance_by_cell",
      },
      {
        id: "analysis-history",
        label: "History",
        to: "/app/analysis/history",
        dataSource: "manual_analysis_runs",
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
        dataSource: "message_pillars, active_hypotheses",
      },
      {
        id: "strategy-map",
        label: "Strategy Map",
        to: "/app/strategy/map",
        dataSource: "message_pillars, performance_by_cell",
      },
      {
        id: "strategy-avatars",
        label: "Avatars / ICP / PMF",
        to: "/app/strategy/avatars",
        dataSource: "historical_matrix_4x4, demographic_registration_signal",
      },
      {
        id: "strategy-communications",
        label: "Communications",
        to: "/app/strategy/communications",
        dataSource: "message_pillars, performance_by_cell",
        placeholder: true,
      },
      {
        id: "strategy-hypotheses",
        label: "Hypothesis Queue",
        to: "/app/strategy/hypotheses",
        dataSource: "active_hypotheses, message_pillars",
      },
      {
        id: "strategy-history",
        label: "History",
        to: "/app/strategy/history",
        dataSource: "generation_runs",
      },
    ],
  },
  {
    id: "creative",
    number: "05",
    label: "Creative",
    icon: "FileText",
    landing: "/app/creative",
    children: [
      {
        id: "creative-library",
        label: "Library",
        to: "/app/creative/library",
        dataSource: "local_book2_library, imported_creative_briefs",
        placeholder: true,
      },
      {
        id: "creative-builder",
        label: "Brief Builder",
        to: "/app/creative/builder",
        badgeKey: "briefs",
        dataSource: "draft_briefs",
      },
      {
        id: "creative-scan",
        label: "Creative Scan",
        to: "/app/creative/scan",
        dataSource: "local_book2_library",
      },
      {
        id: "creative-import-export",
        label: "Import & Export",
        to: "/app/creative/import-export",
        dataSource: "manual_imports",
        placeholder: true,
      },
    ],
  },
  {
    id: "mst",
    number: "06",
    label: "MST",
    icon: "Layers",
    landing: "/app/mst",
    children: [
      {
        id: "mst-cross-map",
        label: "Cross-Map",
        to: "/app/mst/cross-map",
        dataSource: "performance_by_cell, message_pillars, historical_matrix_4x4",
      },
      {
        id: "mst-sprints",
        label: "Sprints",
        to: "/app/mst/sprints",
        badgeKey: "mst",
        dataSource: "historical_matrix_4x4",
      },
      {
        id: "mst-performance",
        label: "Performance",
        to: "/app/mst/performance",
        dataSource: "historical_matrix_4x4, performance_by_cell",
        placeholder: true,
      },
      {
        id: "mst-direction",
        label: "Direction",
        to: "/app/mst/direction",
        dataSource: "optimization_loop",
        placeholder: true,
      },
    ],
  },
  {
    id: "reports",
    number: "07",
    label: "Reports",
    icon: "FileBarChart",
    landing: "/app/reports",
    children: [
      {
        id: "reports-builder",
        label: "Report Builder",
        to: "/app/reports/builder",
        dataSource: "report_sections",
      },
      {
        id: "reports-configuration",
        label: "Configuration",
        to: "/app/reports/configuration",
        dataSource: "report_builder defaults + workspace overrides",
      },
      {
        id: "reports-history",
        label: "History",
        to: "/app/reports/history",
        dataSource: "report_history",
      },
    ],
  },
  {
    id: "exports",
    number: "08",
    label: "Exports",
    icon: "Download",
    landing: "/app/exports",
    children: [
      {
        id: "exports-analysis",
        label: "Analysis",
        to: "/app/exports/analysis",
        dataSource: "performance_by_cell, v3_variable_performance",
      },
      {
        id: "exports-strategy",
        label: "Strategy JSON",
        to: "/app/exports/strategy",
        dataSource: "message_pillars, active_hypotheses",
      },
      {
        id: "exports-reports",
        label: "Reports",
        to: "/app/exports/reports",
        dataSource: "report_history, export_formats",
      },
      {
        id: "exports-brief",
        label: "Brief",
        to: "/app/exports/brief",
        dataSource: "draft_briefs",
      },
    ],
  },
  {
    id: "action",
    number: "09",
    label: "Action",
    icon: "Zap",
    landing: "/app/action/agent",
    placeholder: true,
    children: [
      {
        id: "action-agent",
        label: "Agent",
        to: "/app/action/agent",
        badgeKey: "agent",
        placeholder: true,
      },
    ],
  },
  {
    id: "settings",
    number: "10",
    label: "Settings",
    icon: "Settings2",
    landing: "/app/settings/general",
    children: [
      {
        id: "settings-general",
        label: "General",
        to: "/app/settings/general",
      },
      {
        id: "settings-users",
        label: "Users & Permissions",
        to: "/app/settings/users",
        dataSource: "workspace_settings",
      },
      {
        id: "settings-security",
        label: "Security",
        to: "/app/settings/security",
      },
      {
        id: "settings-integrations",
        label: "Integrations",
        to: "/app/settings/integrations",
        dataSource: "manual_imports",
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
