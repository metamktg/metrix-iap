// ─── Metrix seed adapter ──────────────────────────────────────────────
// Single source of truth for reading the Bookster seed bundle.
// Every module reads through here, scoped to an ad account id.
// No fabrication: missing data returns null / undefined and callers render
// pending / unconfigured states.

import rawSeed from "@/data/seeds/metrix_bookster_seed_bundle_v1.json";
import type {
  MetrixSeed,
  ManagerAccount,
  AdAccount,
  AnalysisData,
  StrategyData,
  BriefBuilder,
  ReportBuilder,
  OptimizationLoop,
  SignalCard,
  MST,
  CoreReanalysisRead,
  CampaignSummary,
} from "./seedTypes";

const seed = rawSeed as unknown as MetrixSeed;

// ─── App defaults ─────────────────────────────────────────────────────

export function getAppDefaults() {
  return seed.app_defaults;
}

export function getForbiddenTerms(): string[] {
  return seed.app_defaults.forbidden_ui_terms;
}

// ─── Manager ──────────────────────────────────────────────────────────

export function getManagerOverview(): ManagerAccount {
  return seed.manager_account;
}

// ─── Ad accounts ──────────────────────────────────────────────────────

export function getAdAccounts(): AdAccount[] {
  return seed.ad_accounts;
}

export function getAdAccount(adAccountId: string | null | undefined): AdAccount | null {
  if (!adAccountId) return null;
  return seed.ad_accounts.find((a) => a.id === adAccountId) ?? null;
}

export function isConfigured(adAccountId: string | null | undefined): boolean {
  return getAdAccount(adAccountId)?.status === "configured";
}

/** Overview payload for a single ad account. Null iap means unconfigured. */
export function getAdAccountOverview(adAccountId: string | null | undefined) {
  const acct = getAdAccount(adAccountId);
  if (!acct) return null;
  return {
    account: acct,
    configured: acct.status === "configured",
    coreControls: acct.iap?.core_reanalysis_read ?? null,
    campaignSummary: acct.iap?.campaign_summary ?? null,
    optimizationLoop: acct.iap?.optimization_loop ?? null,
    overviewState: acct.overview_state ?? null,
  };
}

// ─── Per-module getters (scoped) ──────────────────────────────────────

export function getCoreControls(adAccountId: string | null): CoreReanalysisRead | null {
  return getAdAccount(adAccountId)?.iap?.core_reanalysis_read ?? null;
}

export function getCampaignSummary(adAccountId: string | null): CampaignSummary | null {
  return getAdAccount(adAccountId)?.iap?.campaign_summary ?? null;
}

export function getListenSignals(adAccountId: string | null): SignalCard[] {
  return getAdAccount(adAccountId)?.listen?.signal_cards ?? [];
}

export function getAnalysisData(adAccountId: string | null): AnalysisData | null {
  return getAdAccount(adAccountId)?.iap?.analysis ?? null;
}

export function getStrategyData(adAccountId: string | null): StrategyData | null {
  return getAdAccount(adAccountId)?.iap?.strategy ?? null;
}

export function getBriefBuilder(adAccountId: string | null): BriefBuilder | null {
  return getAdAccount(adAccountId)?.iap?.brief_builder ?? null;
}

export function getReportBuilder(adAccountId: string | null): ReportBuilder | null {
  return getAdAccount(adAccountId)?.iap?.report_builder ?? null;
}

export function getOptimizationLoop(adAccountId: string | null): OptimizationLoop | null {
  return getAdAccount(adAccountId)?.iap?.optimization_loop ?? null;
}

export function getMST(adAccountId: string | null): MST | null {
  return getAdAccount(adAccountId)?.mst ?? null;
}
