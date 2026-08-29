// ─── Metrix seed adapter ──────────────────────────────────────────────
// Pure read helpers over the seed bundle fetched from the backend API.
// Every module reads through here, scoped to an ad account id. The seed
// comes from MetrixDataContext (useMetrixSeed) — never imported directly.
// No fabrication: missing data returns null / undefined and callers render
// pending / unconfigured states.

import type {
  MetrixSeed,
  ManagerAccount,
  AdAccount,
  AdRecord,
  AnalysisData,
  StrategyData,
  BriefBuilder,
  ReportBuilder,
  OptimizationLoop,
  SignalCard,
  MST,
  CoreReanalysisRead,
  CampaignSummary,
  ReportHistoryEntry,
  WorkspaceSettings,
} from "./seedTypes";

// ─── App defaults ─────────────────────────────────────────────────────

export function getAppDefaults(seed: MetrixSeed) {
  return seed.app_defaults;
}

export function getForbiddenTerms(seed: MetrixSeed): string[] {
  return seed.app_defaults.forbidden_ui_terms;
}

// ─── Manager ──────────────────────────────────────────────────────────

export function getManagerOverview(seed: MetrixSeed): ManagerAccount {
  return seed.manager_account;
}

// ─── Ad accounts ──────────────────────────────────────────────────────

export function getAdAccounts(seed: MetrixSeed): AdAccount[] {
  return seed.ad_accounts;
}

export function getAdAccount(seed: MetrixSeed, adAccountId: string | null | undefined): AdAccount | null {
  if (!adAccountId) return null;
  return seed.ad_accounts.find((a) => a.id === adAccountId) ?? null;
}

export function isConfigured(seed: MetrixSeed, adAccountId: string | null | undefined): boolean {
  return getAdAccount(seed, adAccountId)?.status === "configured";
}

/** Overview payload for a single ad account. Null iap means unconfigured. */
export function getAdAccountOverview(seed: MetrixSeed, adAccountId: string | null | undefined) {
  const acct = getAdAccount(seed, adAccountId);
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

/** Ad-level registry for an account (empty until the seed carries it). */
export function getAds(seed: MetrixSeed, adAccountId: string | null | undefined): AdRecord[] {
  return getAdAccount(seed, adAccountId)?.ads ?? [];
}

/**
 * Context needed to render creative assets and Ads Manager deep links.
 * `metaAdAccountId` is the numeric Meta account id (null until backfilled)
 * — NOT the internal account id, which cannot form a valid deep link.
 */
export function getCreativeLinkContext(
  seed: MetrixSeed,
  adAccountId: string | null | undefined
): { ads: AdRecord[]; metaAdAccountId: string | null } {
  const acct = getAdAccount(seed, adAccountId);
  return {
    ads: acct?.ads ?? [],
    metaAdAccountId: acct?.meta_ad_account_id ?? null,
  };
}

// ─── Per-module getters (scoped) ──────────────────────────────────────

export function getCoreControls(seed: MetrixSeed, adAccountId: string | null): CoreReanalysisRead | null {
  return getAdAccount(seed, adAccountId)?.iap?.core_reanalysis_read ?? null;
}

export function getCampaignSummary(seed: MetrixSeed, adAccountId: string | null): CampaignSummary | null {
  return getAdAccount(seed, adAccountId)?.iap?.campaign_summary ?? null;
}

export function getListenSignals(seed: MetrixSeed, adAccountId: string | null): SignalCard[] {
  return getAdAccount(seed, adAccountId)?.listen?.signal_cards ?? [];
}

export function getAnalysisData(seed: MetrixSeed, adAccountId: string | null): AnalysisData | null {
  return getAdAccount(seed, adAccountId)?.iap?.analysis ?? null;
}

export function getStrategyData(seed: MetrixSeed, adAccountId: string | null): StrategyData | null {
  return getAdAccount(seed, adAccountId)?.iap?.strategy ?? null;
}

export function getBriefBuilder(seed: MetrixSeed, adAccountId: string | null): BriefBuilder | null {
  return getAdAccount(seed, adAccountId)?.iap?.brief_builder ?? null;
}

export function getReportBuilder(seed: MetrixSeed, adAccountId: string | null): ReportBuilder | null {
  return getAdAccount(seed, adAccountId)?.iap?.report_builder ?? null;
}

export function getOptimizationLoop(seed: MetrixSeed, adAccountId: string | null): OptimizationLoop | null {
  return getAdAccount(seed, adAccountId)?.iap?.optimization_loop ?? null;
}

/**
 * The imported MST seed historically carried `render_policy` as a sentence,
 * but current source data may provide its format rules as a structured object.
 * Normalize at the data boundary so UI components never receive an object they
 * could try to render directly.
 *
 * "Nothing to say" is NULL, never "". Every consumer writes
 * `render_policy ?? "<fallback sentence>"`, and `??` does not catch an empty
 * string — so a blank policy (all six manual-import accounts carry `""`)
 * silently defeated every fallback: four empty states rendered a bare title
 * with no explanation beneath it, on exactly the accounts a real operator
 * uses. Returning null is what makes those fallbacks work.
 */
export function formatMstRenderPolicy(policy: unknown): string | null {
  if (typeof policy === "string") return policy.trim() || null;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return null;
  }

  const fields = policy as Record<string, unknown>;
  const stringValue = (key: string) =>
    typeof fields[key] === "string" && fields[key].trim() ? fields[key].trim() : null;
  const parts = [
    fields.mobile_first === true ? "Mobile-first" : null,
    stringValue("primary_format") ? `Primary format: ${stringValue("primary_format")}` : null,
    stringValue("secondary_format_required")
      ? `Secondary format required: ${stringValue("secondary_format_required")}`
      : null,
    fields.text_safe_zones_required_on_9x16 === true ? "Text safe zones required on 9:16" : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ") || null;
}

export function getMST(seed: MetrixSeed, adAccountId: string | null): MST | null {
  const mst = getAdAccount(seed, adAccountId)?.mst;
  return mst ? { ...mst, render_policy: formatMstRenderPolicy(mst.render_policy) } : null;
}

export function getReportHistory(seed: MetrixSeed, adAccountId: string | null): ReportHistoryEntry[] {
  return getAdAccount(seed, adAccountId)?.iap?.report_builder?.report_history ?? [];
}

// ─── Workspace settings (manager-wide) ────────────────────────────────

export function getWorkspaceSettings(seed: MetrixSeed): WorkspaceSettings | null {
  return seed.workspace_settings ?? null;
}
