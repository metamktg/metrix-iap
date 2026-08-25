// ─── Cause-specific creative-tab empty reasons (single source) ──────────
// §1.4 of the Phase-1 honesty work gave every creative popup tab a reason
// that names WHY it is empty and what the remedy is, replacing three generic
// "no data" messages that all told the user to import a file they had
// already imported.
//
// That fix was threaded through call sites by hand and reached 3 of the 10
// <CreativeCard> sites; the other seven (Concept family, Variable drill-down,
// Creative Scan, Brief builder, and three more IAP Library card rows) still
// rendered the misleading original copy, and no site passed a funnel reason
// at all. Deriving the reasons where they are RENDERED — from the scoped
// account's own analysis data — closes the class instead of the instances:
// a new call site cannot forget what it never has to pass.
//
// The rules themselves stay pure and unit-tested in lib/creative-empty-reasons
// (creativeEmptyReasonsFor); this hook only supplies them with the scoped
// account's analysis data.

import { useMemo } from "react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { creativeEmptyReasonsFor, type CreativeEmptyReasons } from "@/lib/creative-empty-reasons";

export type { CreativeEmptyReasons };

/** Derives the three creative-tab reasons for one cell from the scoped account. */
export function useCreativeEmptyReasons(cellId: string | null | undefined): CreativeEmptyReasons {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const analysis = getAnalysisData(seed, adAccountId);
  return useMemo(() => creativeEmptyReasonsFor(analysis, cellId), [analysis, cellId]);
}
