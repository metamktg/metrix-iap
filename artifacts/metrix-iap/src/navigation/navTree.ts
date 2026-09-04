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
//   7  Action      → Action Queue / Agent (Coming Soon)   (the loop's sixth stage — beside MST so the loop reads as one shape)
//   8  Reports     → Report Builder / Configuration / History
//   9  Exports     → Analysis / Strategy JSON / Reports / Brief   (open to all during beta; advanced-tier gating is a post-beta consideration, not enforced today)
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

/**
 * Where a section sits in the product's shape. The IAP loop (Listen →
 * Analysis → Strategy → Creative → MST → Action) is the differentiation the
 * sidebar exists to convey; Reports and Exports are what comes out of it;
 * Settings is the workspace. Rendered as group labels and a connected loop
 * spine in the expanded sidebar — never as a route or a filter.
 */
export type NavGroup = "home" | "loop" | "output" | "workspace";

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  home: "Account",
  loop: "IAP loop",
  output: "Outputs",
  workspace: "Workspace",
};

export type NavChild = {
  id: string;
  label: string;
  to: string;
  /** One fragment saying what this page proves or does — chrome, ≤ 56 chars, never a sentence. */
  purpose?: string;
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
  /** Which part of the product shape this section belongs to (see NavGroup). */
  group: NavGroup;
  /** 1-based position in the IAP loop for `group: "loop"` sections; the spine connects them in order. */
  loopStage?: number;
  /** One fragment saying what this module is for — the category it defines. Chrome, ≤ 56 chars. */
  purpose: string;
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
    group: "home",
    purpose: "Where this account stands, and the next runnable stage",
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
        purpose: "Platform and account updates",
        to: "/app/overview/updates",
        dataSource: "platform_updates",
      },
    ],
  },
  {
    id: "listen",
    group: "loop",
    loopStage: 1,
    purpose: "What the data is saying. Alerts, signal, next moves",
    number: "02",
    label: "Listen",
    icon: "Radio",
    landing: "/app/listen",
    children: [
      {
        id: "listen-alerts",
        label: "Alerts",
        purpose: "High-impact signals worth acting on now",
        to: "/app/listen/alerts",
        dataSource: "signal_cards, data_caveats",
      },
      {
        id: "listen-signal",
        label: "Signal",
        purpose: "The full signal feed for this scope",
        to: "/app/listen/signal",
        badgeKey: "signals",
        dataSource: "signal_cards",
      },
      {
        id: "listen-recommendations",
        label: "Recommendations",
        purpose: "Suggested next actions from what was heard",
        to: "/app/listen/recommendations",
        dataSource: "recommendation_cards",
      },
    ],
  },
  {
    id: "analysis",
    group: "loop",
    loopStage: 2,
    purpose: "Objective reads from subjective media, per result event",
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
        purpose: "Headline reads, trend and drill-in modules",
        to: "/app/analysis/overview",
        dataSource: "campaign_summary, v3_variable_performance",
      },
      {
        id: "analysis-performance",
        label: "Ad Performance",
        purpose: "Ad tiers, lift and the buyer-intent funnel",
        to: "/app/analysis/performance",
        dataSource: "campaign_summary, performance_by_cell",
      },
      {
        id: "analysis-library",
        label: "IAP Library",
        purpose: "Cell and variable performance, by result scope",
        to: "/app/analysis/library",
        dataSource: "performance_by_cell, v3_variable_performance",
      },
      {
        id: "analysis-dna",
        label: "Creative DNA",
        purpose: "Per-variable lift and tested combinations",
        to: "/app/analysis/dna",
        dataSource: "v3_variable_performance, variable_combinations",
      },
      {
        id: "analysis-audience",
        label: "Audience",
        purpose: "Who responded · segments, clusters, signal",
        to: "/app/analysis/audience",
        dataSource: "demographic_registration_signal",
      },
      {
        id: "analysis-placements",
        label: "Placements",
        purpose: "Where delivery happened and what it produced",
        to: "/app/analysis/placements",
        dataSource: "v3_placement_signal, c4e_placement_signal",
      },
      {
        id: "analysis-budget",
        label: "Budget",
        purpose: "Spend allocation by event, concept and placement",
        to: "/app/analysis/budget",
        dataSource: "campaign_summary, performance_by_cell",
      },
      {
        id: "analysis-history",
        label: "History",
        purpose: "Every analysis run, its window and its files",
        to: "/app/analysis/history",
        dataSource: "manual_analysis_runs",
      },
      {
        // Reached from Ad Performance's "Open full funnel breakdown". Not a
        // menu row — it is a drill-down of that page, not a peer of it.
        id: "analysis-funnel",
        label: "Engagement Funnel",
        purpose: "Full engagement funnel for the selected reads",
        to: "/app/analysis/funnel",
        dataSource: "performance_by_cell",
        hidden: true,
      },
      {
        // Was hidden "until its producer runs for real accounts". Its
        // producer is `intelligence.failure_patterns` and `concept_scores`,
        // which every configured account carries — and since change log
        // entry 10 the recommendations on it derive from those same rows.
        // A page with real content, reachable only from one cross-link, is
        // a page most readers never find. Owner decision, 2026-09-03.
        id: "analysis-findings",
        label: "Findings",
        purpose: "Verdicts and recommendations from the analysis",
        to: "/app/analyze/findings",
        dataSource: "intelligence, recommendation_cards",
      },
    ],
  },
  {
    id: "strategy",
    group: "loop",
    loopStage: 3,
    purpose: "Pillars, profiles and hypotheses the analysis earned",
    number: "04",
    label: "Strategy",
    icon: "Compass",
    landing: "/app/strategy",
    children: [
      {
        id: "strategy-overview",
        label: "Overview",
        purpose: "The configurable strategy view",
        to: "/app/strategy/overview",
        dataSource: "message_pillars, active_hypotheses",
      },
      {
        id: "strategy-map",
        label: "Strategy Map",
        purpose: "How pillars, source cells and hypotheses connect",
        to: "/app/strategy/map",
        dataSource: "message_pillars, performance_by_cell",
      },
      {
        id: "strategy-avatars",
        label: "Avatars / ICP / PMF",
        purpose: "The customer profiles the matrix targets",
        to: "/app/strategy/avatars",
        dataSource: "historical_matrix_4x4, demographic_registration_signal",
      },
      {
        id: "strategy-communications",
        label: "Communications",
        purpose: "Who is responding, to what, and why",
        to: "/app/strategy/communications",
        dataSource: "message_pillars, performance_by_cell",
      },
      {
        id: "strategy-hypotheses",
        label: "Hypothesis Queue",
        purpose: "Active hypotheses and validation status",
        to: "/app/strategy/hypotheses",
        dataSource: "active_hypotheses, message_pillars",
      },
      {
        id: "strategy-history",
        label: "History",
        purpose: "Past strategy generation runs",
        to: "/app/strategy/history",
        dataSource: "generation_runs",
      },
    ],
  },
  {
    id: "creative",
    group: "loop",
    loopStage: 4,
    purpose: "Briefs and assets built from the strategy, ready to run",
    number: "05",
    label: "Creative",
    icon: "FileText",
    landing: "/app/creative",
    children: [
      {
        id: "creative-library",
        label: "Library",
        purpose: "The creative asset register",
        to: "/app/creative/library",
        dataSource: "local_book2_library, imported_creative_briefs",
      },
      {
        id: "creative-builder",
        label: "Brief Builder",
        purpose: "Execution-ready briefs from the strategy",
        to: "/app/creative/builder",
        badgeKey: "briefs",
        dataSource: "draft_briefs",
      },
      {
        id: "creative-scan",
        label: "Creative Scan",
        purpose: "Assets checked against the matrix rules",
        to: "/app/creative/scan",
        dataSource: "local_book2_library",
      },
      {
        id: "creative-import-export",
        label: "Import & Export",
        purpose: "Stage exports and creatives, take briefs out",
        to: "/app/creative/import-export",
        dataSource: "manual_imports",
      },
    ],
  },
  {
    id: "mst",
    group: "loop",
    loopStage: 5,
    purpose: "The matrix sprint test: isolate what won and why",
    number: "06",
    label: "MST",
    icon: "Layers",
    landing: "/app/mst",
    children: [
      {
        id: "mst-cross-map",
        label: "Cross-Map",
        purpose: "Planned cells crossmapped to observed performance",
        to: "/app/mst/cross-map",
        dataSource: "performance_by_cell, message_pillars, historical_matrix_4x4",
      },
      {
        id: "mst-sprints",
        label: "Sprints",
        purpose: "The 4×4 test matrix for this account",
        to: "/app/mst/sprints",
        badgeKey: "mst",
        dataSource: "historical_matrix_4x4",
      },
      {
        // Two pages carried the name "Creative Scan" (N-13). The Creative
        // section's is the scan itself; this one checks a sprint's assets
        // against the matrix before launch, which is what it is now called.
        // Owner decision, 2026-09-03.
        id: "mst-creative-scan",
        label: "Sprint Asset Check",
        purpose: "Sprint assets validated before launch",
        to: "/app/mst/creative-scan",
        dataSource: "local_book2_library",
      },
      {
        id: "mst-direction",
        label: "Direction",
        purpose: "Scale, optimize, validate, retire, next sprint",
        to: "/app/mst/direction",
        dataSource: "optimization_loop",
        placeholder: true,
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
    group: "loop",
    loopStage: 6,
    purpose: "Approve or dismiss what the loop recommends next",
    number: "07",
    label: "Action",
    icon: "Zap",
    landing: "/app/act/queue",
    children: [
      {
        id: "action-queue",
        label: "Action Queue",
        purpose: "Recommendations to approve into the tray or dismiss",
        to: "/app/act/queue",
        dataSource: "recommendation_cards, optimization_loop",
      },
      {
        id: "action-agent",
        label: "Agent",
        purpose: "Autonomous execution · coming soon",
        to: "/app/action/agent",
        badgeKey: "agent",
        placeholder: true,
      },
    ],
  },
  {
    id: "reports",
    group: "output",
    purpose: "Stakeholder-ready reads of the loop's evidence",
    number: "08",
    label: "Reports",
    icon: "FileBarChart",
    // The section lands on the builder, not on a hub that relays to it: the
    // job a reader brings here is "read a report", and the hub only listed
    // the pages the sidebar already lists. /app/reports stays routable.
    landing: "/app/reports/builder",
    children: [
      {
        id: "reports-builder",
        label: "Report Builder",
        purpose: "Compose a stakeholder report from the evidence",
        to: "/app/reports/builder",
        dataSource: "report_sections",
      },
      {
        id: "reports-configuration",
        label: "Configuration",
        purpose: "Defaults and overrides for every report",
        to: "/app/reports/configuration",
        dataSource: "report_builder defaults + workspace overrides",
      },
      {
        id: "reports-history",
        label: "History",
        purpose: "Generated reports, reproduced exactly",
        to: "/app/reports/history",
        dataSource: "report_history",
      },
    ],
  },
  {
    id: "exports",
    group: "output",
    purpose: "Take the evidence out of Metrix, in its own shape",
    number: "09",
    label: "Exports",
    icon: "Download",
    landing: "/app/exports",
    children: [
      {
        id: "exports-analysis",
        label: "Analysis",
        purpose: "Cell and variable rows as data",
        to: "/app/exports/analysis",
        dataSource: "performance_by_cell, v3_variable_performance",
        hidden: true,
      },
      {
        id: "exports-strategy",
        label: "Strategy JSON",
        purpose: "Pillars and hypotheses as JSON",
        to: "/app/exports/strategy",
        dataSource: "message_pillars, active_hypotheses",
        hidden: true,
      },
      {
        id: "exports-reports",
        label: "Reports",
        purpose: "Report files in their export formats",
        to: "/app/exports/reports",
        dataSource: "export_formats, report_history",
        hidden: true,
      },
      {
        id: "exports-brief",
        label: "Brief",
        purpose: "Briefs, ready to hand off",
        to: "/app/exports/brief",
        dataSource: "draft_briefs",
        hidden: true,
      },
    ],
  },
  {
    id: "settings",
    group: "workspace",
    purpose: "Workspace, people, security, integrations",
    number: "10",
    label: "Settings",
    icon: "Settings2",
    landing: "/app/settings/general",
    children: [
      {
        id: "settings-general",
        label: "General",
        purpose: "Account facts and derived objectives",
        to: "/app/settings/general",
      },
      {
        id: "settings-users",
        label: "Users & Permissions",
        purpose: "People, roles and account grants",
        to: "/app/settings/users",
        dataSource: "workspace_settings",
      },
      {
        id: "settings-security",
        label: "Security",
        purpose: "Sessions and passwords",
        to: "/app/settings/security",
      },
      {
        id: "settings-integrations",
        label: "Integrations",
        purpose: "Meta connection and staged files",
        to: "/app/settings/integrations",
        dataSource: "manual_imports",
      },
      {
        id: "settings-billing",
        label: "Billing",
        purpose: "Plan and invoices",
        to: "/app/settings/billing",
        dataSource: "workspace_settings",
      },
      {
        id: "settings-provenance",
        label: "Data Provenance",
        purpose: "Where every number came from",
        to: "/app/settings/provenance",
        dataSource: "integrity_note",
      },
    ],
  },
];

// ─── The loop, as one list ──────────────────────────────────────────────
// The IAP loop is the six `group: "loop"` sections above, in `loopStage`
// order. Four surfaces render a loop shape (the sidebar spine, the
// command-center stage strip, the Manager Overview rollup, the account
// overview's command chain) and they used to hand-type it — one ended at
// Reports, one at Briefs, one had four stages. Every one now reads this
// list and subsets it by filter; nothing re-types a stage.

export interface LoopStage {
  /** The section id (`listen` … `action`). */
  id: string;
  label: string;
  /** The stage's command center. */
  to: string;
  /** 1-based position in the loop. */
  loopStage: number;
  purpose: string;
}

export const LOOP_STAGES: readonly LoopStage[] = navTree
  .filter((s): s is NavSection & { loopStage: number } => s.group === "loop" && s.loopStage != null)
  .sort((a, b) => a.loopStage - b.loopStage)
  .map((s) => ({
    id: s.id,
    label: s.label,
    to: sectionLandingRoute(s) ?? s.to ?? "/",
    loopStage: s.loopStage,
    purpose: s.purpose,
  }));

/** One loop stage by section id, or null for a section outside the loop. */
export function loopStageById(id: string): LoopStage | null {
  return LOOP_STAGES.find((s) => s.id === id) ?? null;
}
