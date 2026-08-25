// ─── Measured demographic join coverage (single source) ─────────────────
// The run's measured per-class coverage gates segment signal classification
// (see assessSegmentSignal): a "signal ✓" computed from 2% of an account's
// spend is fabricated confidence, so every surface that classifies segments
// must know the coverage.
//
// This hook exists because the Phase-1 coverage layer was threaded through
// call sites by hand, and three of the five SegmentDrilldownModal call sites
// (Analysis Overview, IAP Library, Variable drill-down) silently omitted it —
// the same modal therefore suppressed badges when opened from Audience and
// rendered them unqualified when opened from anywhere else. Reading the
// coverage where it is USED, rather than passing it in, removes the class of
// bug rather than the three instances.
//
// The "all" preset is deliberate: coverage is a property of the analysis RUN,
// not of the currently selected date window, and the run always records it
// under the full range. react-query dedupes this with any preset query a
// caller already holds, so calling it from a modal costs no extra request.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { demographicCoverageOf, type DemographicCoverageInput } from "@/lib/segment-analytics";

/**
 * Measured demographic coverage for the scoped account's latest successful
 * analysis run. Null when the account has no run, when the run predates the
 * coverage layer, or while the account id is still resolving — in which case
 * signal gating honestly falls back to the per-segment heuristics alone.
 */
export function useDemographicCoverage(): DemographicCoverageInput | null {
  const adAccountId = useScopedAdAccountId();
  const { data: allSummary } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", "all"),
    enabled: !!adAccountId,
  });
  return useMemo(
    () => demographicCoverageOf(allSummary?.data_coverage ?? null),
    [allSummary],
  );
}
