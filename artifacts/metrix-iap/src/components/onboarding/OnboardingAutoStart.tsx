// ─── Onboarding tour — auto-start ────────────────────────────────────────
// Launches the first-analysis tour, once, for a genuinely first-time
// account: an ad account is scoped and it has never had an analysis run.
// Renders nothing — this is pure trigger logic, separated from TourOverlay
// so the overlay stays a dumb renderer of whatever the context says is active.
//
// Evaluates once per app session (not per account switch) via triedRef —
// otherwise switching between a finished account and a fresh one mid-session
// would pop the tour open unexpectedly while the user is mid-task.

import { useEffect, useRef } from "react";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useStageStatus } from "@/hooks/useStageStatus";
import { useOnboardingTour } from "@/contexts/OnboardingTourContext";
import { FIRST_ANALYSIS_TOUR_ID } from "@/lib/onboarding/tourSteps";

const AUTO_START_DELAY_MS = 600;

export function OnboardingAutoStart() {
  const { start, hasResolved } = useOnboardingTour();
  const { selectedAccountType } = useAccount();
  const adAccountId = useScopedAdAccountId();
  const status = useStageStatus(adAccountId);
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    if (selectedAccountType !== "ad_account" || !adAccountId) return;
    if (status.isLoading) return;
    triedRef.current = true;
    if (hasResolved(FIRST_ANALYSIS_TOUR_ID)) return;
    if (status.analysis.status !== "none") return; // not a first-time account
    const t = setTimeout(() => start(FIRST_ANALYSIS_TOUR_ID), AUTO_START_DELAY_MS);
    return () => clearTimeout(t);
  }, [selectedAccountType, adAccountId, status.isLoading, status.analysis.status, hasResolved, start]);

  return null;
}
