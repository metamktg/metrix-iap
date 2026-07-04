// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Mock Data Exports
// SAMPLE/DEMO DATA — All figures are seeded for prototype purposes.
// Not computed from live data. See lib/supabase.ts for the real client stub.
// ═══════════════════════════════════════════════════════════════════════

export {
  ORG,
  USERS,
  WORKSPACES,
  WORKSPACE_MEMBERS,
  AD_ACCOUNTS,
  CAMPAIGNS,
  ADS,
  CREATIVE_CONCEPTS,
  CREATIVE_VARIABLES,
  ICP_PROFILES,
  IMPORTS,
  ANALYSIS_RUNS,
  MST_MATRICES,
  BRIEFS,
  REPORTS,
  BENCHMARK_MEMORY,
  CHANGE_EVENTS,
  AUDIT_LOGS,
  PROMPT_VERSIONS,
} from "./mock/generate";

import {
  ORG,
  WORKSPACES,
  AD_ACCOUNTS,
  WORKSPACE_MEMBERS,
  USERS,
  ANALYSIS_RUNS,
  CAMPAIGNS,
  ADS,
  IMPORTS,
  BRIEFS,
  REPORTS,
  ICP_PROFILES,
  MST_MATRICES,
} from "./mock/generate";

import type {
  WorkspaceWithData,
  MasterCommandCenterData,
  NeedsAttentionItem,
} from "./types";

// ─── Derived / Aggregated Data ────────────────────────────────────────

export function getWorkspaceWithData(workspaceId: string): WorkspaceWithData | undefined {
  const ws = WORKSPACES.find(w => w.id === workspaceId);
  if (!ws) return undefined;

  const accounts = AD_ACCOUNTS.filter(a => a.workspace_id === workspaceId);
  const members = WORKSPACE_MEMBERS.filter(m => m.workspace_id === workspaceId);
  const runs = ANALYSIS_RUNS.filter(r => r.workspace_id === workspaceId);
  const latestRun = runs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const allDecisions = runs.flatMap(r => r.decision_feed);
  const openDecisions = allDecisions.filter(d => d.status === "Open").length;
  const priorityDecisions = allDecisions.filter(d =>
    d.status === "Open" && (d.tier === 1 || d.tier === 4 || d.confidence_label === "high")
  ).length;
  const totalSpend = accounts.reduce((sum, a) => sum + a.spend_analyzed_usd, 0);

  return {
    ...ws,
    ad_accounts: accounts,
    members,
    latest_run: latestRun,
    open_decisions: openDecisions,
    priority_decisions: priorityDecisions,
    total_spend_analyzed: totalSpend,
  };
}

export function getAllWorkspacesWithData(): WorkspaceWithData[] {
  return WORKSPACES.map(ws => getWorkspaceWithData(ws.id)!).filter(Boolean);
}

export function getMasterCommandCenterData(): MasterCommandCenterData {
  const workspaces = getAllWorkspacesWithData();

  const allRuns = ANALYSIS_RUNS;
  const allDecisions = allRuns.flatMap(r => r.decision_feed);

  const needsAttention: NeedsAttentionItem[] = [
    {
      workspace_id: "ws_bookster",
      workspace_name: "Bookster",
      type: "tracking_issue",
      message: "Pixel/CAPI gap detected — iOS conversion events unreliable. Open, unresolved.",
      severity: "Critical",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      workspace_id: "ws_kov",
      workspace_name: "King of Violence",
      type: "decision",
      message: "Camozzi creative: Tier 4 confirmed. Kill action is open — not yet executed.",
      severity: "High",
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      workspace_id: "ws_kov",
      workspace_name: "King of Violence",
      type: "budget_alert",
      message: "Account ROAS still below profitability threshold. CRO brief not actioned.",
      severity: "High",
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      workspace_id: "ws_imco",
      workspace_name: "IMCO Wheels",
      type: "low_signal",
      message: "Seasonal summer campaign: validation_required after 5 days. Monitor or pause.",
      severity: "Medium",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      workspace_id: "ws_skov",
      workspace_name: "SKOV Pet",
      type: "creative_fatigue",
      message: "World Cup creative hook score declining. Brief replacement angle before fatigue.",
      severity: "Medium",
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ];

  const recentRuns = [...allRuns]
    .filter(r => r.status === "Completed")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const recentImports = [...IMPORTS]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const recentBriefs = [...BRIEFS]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const recentReports = [...REPORTS]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const globalDecisions = allDecisions
    .filter(d => d.status === "Open")
    .slice(0, 10);

  return {
    org: ORG,
    workspaces,
    total_ad_accounts: AD_ACCOUNTS.length,
    open_iap_runs: allRuns.filter(r => r.status === "Running" || r.status === "Pending").length,
    priority_decisions: allDecisions.filter(d =>
      d.status === "Open" && (d.tier === 1 || d.confidence_label === "high")
    ).length,
    spend_analyzed_usd: AD_ACCOUNTS.reduce((sum, a) => sum + a.spend_analyzed_usd, 0),
    briefs_generated: BRIEFS.length,
    needs_attention: needsAttention,
    recent_runs: recentRuns,
    recent_imports: recentImports,
    recent_briefs: recentBriefs,
    recent_reports: recentReports,
    global_decision_feed: globalDecisions,
  };
}

// ─── Lookup Helpers ───────────────────────────────────────────────────

export function getRunsForWorkspace(workspaceId: string) {
  return ANALYSIS_RUNS.filter(r => r.workspace_id === workspaceId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getCampaignsForAccount(adAccountId: string) {
  return CAMPAIGNS.filter(c => c.ad_account_id === adAccountId);
}

export function getAdsForCampaign(campaignId: string) {
  return ADS.filter(a => a.campaign_id === campaignId);
}

export function getAdsForAccount(adAccountId: string) {
  return ADS.filter(a => a.ad_account_id === adAccountId);
}

export function getImportsForWorkspace(workspaceId: string) {
  return IMPORTS.filter(i => i.workspace_id === workspaceId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getBriefsForWorkspace(workspaceId: string) {
  return BRIEFS.filter(b => b.workspace_id === workspaceId);
}

export function getReportsForWorkspace(workspaceId: string) {
  return REPORTS.filter(r => r.workspace_id === workspaceId);
}

export function getICPsForWorkspace(workspaceId: string) {
  return ICP_PROFILES.filter(icp => icp.workspace_id === workspaceId);
}

export function getMSTMatricesForRun(runId: string) {
  return MST_MATRICES.filter(m => m.run_id === runId);
}

export function getUserById(userId: string) {
  return USERS.find(u => u.id === userId);
}

export function getWorkspaceById(workspaceId: string) {
  return WORKSPACES.find(w => w.id === workspaceId);
}

export function getAdAccountById(accountId: string) {
  return AD_ACCOUNTS.find(a => a.id === accountId);
}

export function getRunById(runId: string) {
  return ANALYSIS_RUNS.find(r => r.id === runId);
}
