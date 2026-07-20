// ─── useWorkflowCounts ────────────────────────────────────────────────
// Centralised derivation of the five IAP loop stage counts for any account.
// Returns both the raw counts and a ready-to-render LoopChecklistStep array.

import { useListWorkspaceReports } from "@workspace/api-client-react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";

export interface WorkflowCounts {
  analysisRows: number;
  pillarCount: number;
  briefCount: number;
  reportCount: number;
  dataConnected: boolean;
  allComplete: boolean;
}

/**
 * Derive IAP-loop workflow stage counts for a given ad account.
 * Returns zeros / false when the account or its data is unavailable.
 */
export function useWorkflowCounts(adAccountId: string | null): WorkflowCounts {
  const seed = useMetrixSeed();
  const account = getAdAccount(seed, adAccountId);
  const managerId = seed?.manager_account?.id ?? "";
  const { data: reportsData } = useListWorkspaceReports(managerId);

  const iap = account?.iap;

  const analysisRows = iap?.analysis?.performance_by_cell?.length ?? 0;
  const pillarCount = iap?.strategy?.message_pillars?.length ?? 0;
  const briefCount = iap?.brief_builder?.draft_briefs?.length ?? 0;
  const reportCount =
    (reportsData?.reports ?? []).filter((r) => r.ad_account_id === adAccountId).length;
  const dataConnected = account?.status === "configured";

  const allComplete =
    dataConnected &&
    analysisRows > 0 &&
    pillarCount > 0 &&
    briefCount > 0 &&
    reportCount > 0;

  return {
    analysisRows,
    pillarCount,
    briefCount,
    reportCount,
    dataConnected,
    allComplete,
  };
}
