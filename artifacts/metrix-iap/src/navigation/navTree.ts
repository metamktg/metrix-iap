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
//   9  Action      → Action Queue / Agent (Coming Soon)
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
  /**
   * Belongs to the section for breadcrumbs, the active-state highlight and
   * the Back target, but renders no menu row. For pages reached only from
   * inside another page (the full funnel breakdown from Ad Performance).
   * Without this, such a page had NO section: the breadcrumb trail was
   * empty, the sidebar lit nothing, and the only way out was the browser.
   */
  hidden?: boolean;
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

/** The children a menu renders — hidden entries stay out of every list. */
export function visibleChildren(section: NavSection): NavChild[] {
  return (section.children ?? []).filter((c) => !c.hidden);
}

function under(location: string, base: string): boolean {
  return location === base || location.startsWith(base + "/");
}

export type NavMatch = {
  section: NavSection;
  /** The most specific child under the location, if any. */
  child: NavChild | null;
  /** True when the location IS the section's landing (command-center) page. */
  atLanding: boolean;
};

/**
 * Where in the tree a location sits. One resolver for breadcrumbs, the
 * Back target, the sidebar highlight and the command palette, so they
 * cannot disagree about which section a page belongs to.
 *
 * Longest matching child wins, so a child at `/app/briefs` can never shadow
 * a sibling at `/app/briefs/builder` via the prefix check.
 */
export function resolveNavLocation(location: string): NavMatch | null {
  for (const section of navTree) {
    if ((section.matchPaths ?? []).some((p) => under(location, p))) {
      return { section, child: null, atLanding: true };
    }
    if (!section.children?.length && section.to && under(location, section.to)) {
      return { section, child: null, atLanding: true };
    }
    let best: NavChild | null = null;
    for (const child of section.children ?? []) {
      if (under(location, child.to) && (!best || child.to.length > best.to.length)) best = child;
    }
    // A landing that is itself a child (Settings → General) resolves as
    // that child: the trail reads "Settings · General", not "Settings".
    if (best) return { section, child: best, atLanding: false };
    const landing = section.landing;
    if (landing && landing !== "/" && under(location, landing)) {
      return { section, child: null, atLanding: location === landing };
    }
  }
  return null;
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
        id: "overview-updates",
        label: "Updates",
        to: "/app/overview/updates",
        dataSource: "platform_updates",
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
        // The analysis tab rail leads with Overview and five cross-links
        // point at it, but it had no menu entry — so following "Review
        // analysis" landed the reader on a page they could not navigate
        // back to or reach again on purpose. The menu now matches the rail.
        id: "analysis-overview",
        label: "Overview",
        to: "/app/analysis/overview",
        dataSource: "campaign_summary, v3_variable_performance",
      },
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
        id: "analysis-dna",
        label: "Creative DNA",
        to: "/app/analysis/dna",
        dataSource: "v3_variable_performance, variable_combinations",
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
      {
        // Reached from Ad Performance's "Open full funnel breakdown". Not a
        // menu row — it is a drill-down of that page, not a peer of it.
        id: "analysis-funnel",
        label: "Engagement Funnel",
        to: "/app/analysis/funnel",
        dataSource: "performance_by_cell",
        hidden: true,
      },
      {
        // AI verdict panel. Kept off the menu until its producer runs for
        // real accounts, but it is an Analysis page and must say so.
        id: "analysis-findings",
        label: "Findings",
        to: "/app/analyze/findings",
        dataSource: "intelligence, recommendation_cards",
        hidden: true,
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
        id: "mst-creative-scan",
        label: "Creative Scan",
        to: "/app/mst/creative-scan",
        dataSource: "local_book2_library",
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
        dataSource: "export_formats, report_history",
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
    // The act stage of the loop. The queue is a real page (it renders the
    // scoped recommendation_cards, honestly empty until the optimize
    // producer lands — register item F-e); before this it was reachable
    // only from one Overview button and belonged to no section, so a
    // reader who followed that button had no crumb, no highlight and no
    // way back except the browser.
    id: "action",
    number: "09",
    label: "Action",
    icon: "Zap",
    landing: "/app/act/queue",
    children: [
      {
        id: "action-queue",
        label: "Action Queue",
        to: "/app/act/queue",
        dataSource: "recommendation_cards, optimization_loop",
      },
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
      {
        id: "settings-provenance",
        label: "Data Provenance",
        to: "/app/settings/provenance",
        dataSource: "integrity_note",
      },
    ],
  },
];
