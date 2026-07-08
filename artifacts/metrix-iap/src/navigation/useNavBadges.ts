import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getListenSignals, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";

export type NavBadgeCounts = {
  signals: number | null;
  briefs: number | null;
  mst: number | null;
  agent: number | null;
};

// Badge counts are scoped to the active ad account, read from the API-served seed.
export function useNavBadges(): NavBadgeCounts {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  return useMemo(() => {
    const signals = getListenSignals(seed, adAccountId).length;
    const briefs = getBriefBuilder(seed, adAccountId)?.draft_briefs.length ?? 0;
    return {
      signals: signals > 0 ? signals : null,
      briefs: briefs > 0 ? briefs : null,
      mst: null,
      agent: null,
    };
  }, [seed, adAccountId]);
}
