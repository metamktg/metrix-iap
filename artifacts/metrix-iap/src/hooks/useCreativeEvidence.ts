// ─── Creative evidence (single source) ──────────────────────────────────
// Resolves one creative's evidence from the scoped account's seed: its ads
// (cell code first, MST mapped names second), the ad-grain breakdown rows,
// the ledger, its asset instances and variable evidence. Derived where it
// is RENDERED, like useCreativeEmptyReasons, so both <CreativeExpandDialog>
// call sites get it without threading props.

import { useMemo } from "react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getAnalysisData, getMST } from "@/lib/data/metrixSeedAdapter";
import type { AdBreakdownRow, CreativeAssetRow, LedgerRow, VariableEvidenceRow, VariableSegmentRow } from "@/lib/data/seedTypes";
import {
  type CreativeAdIdentity,
  adIdentityForCreative,
  breakdownRowsFor,
  creativeAssetsFor,
  funnelRowFromAds,
  variableEvidenceFor,
} from "@/lib/creative-evidence";

export interface CreativeEvidence {
  identity: CreativeAdIdentity;
  demographic: AdBreakdownRow[];
  placement: AdBreakdownRow[];
  ledger: LedgerRow[];
  /** The placement breakdown's account-level unattributed spend, when the ledger has it. */
  placementUnattributed: number | null;
  funnel: ReturnType<typeof funnelRowFromAds>;
  assets: CreativeAssetRow[];
  variableEvidence: VariableEvidenceRow[];
  variableSegments: VariableSegmentRow[] | undefined;
  /** True when the account's latest run wrote the evidence layer at all. */
  layerPresent: boolean;
}

export function useCreativeEvidence(cellId: string | null | undefined): CreativeEvidence {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const mst = getMST(seed, adAccountId);
  return useMemo(() => {
    const mapped = cellId ? mst?.local_book2_library?.find((c) => c.cell_id === cellId)?.mapped_ad_names ?? null : null;
    const identity = adIdentityForCreative(account?.ads, cellId, mapped);
    const ledger = analysis?.reconciliation?.ledger ?? [];
    const placementAccount = ledger.find((r) => r.scope === "account" && r.report_class === "placement" && r.metric === "amount_spent");
    return {
      identity,
      demographic: breakdownRowsFor(analysis?.ad_breakdowns, "demographic", identity),
      placement: breakdownRowsFor(analysis?.ad_breakdowns, "placement", identity),
      ledger,
      placementUnattributed: placementAccount?.residual !== null && placementAccount?.residual !== undefined && placementAccount.residual > 0 ? placementAccount.residual : null,
      funnel: cellId ? funnelRowFromAds(identity, ledger, cellId) : null,
      assets: creativeAssetsFor(account?.creative_assets, identity),
      variableEvidence: variableEvidenceFor(account?.variable_evidence, identity),
      variableSegments: analysis?.variable_segment_performance,
      layerPresent: Array.isArray(analysis?.ad_breakdowns) && (analysis?.ad_breakdowns?.length ?? 0) > 0,
    };
  }, [account, analysis, mst, cellId]);
}
