// ─── Analysis View Context ────────────────────────────────────────────────
// Persists the Top-N, Goal-CPA slider values, and the selected DataWindowBar
// selection across in-session navigations. Lives outside the AnalysisOverview
// component so values survive route changes.
// The brush position on the trend chart is intentionally NOT persisted — zoomed
// ranges are disorienting on re-entry, so the chart always resets to "all".
//
// Account-switch reset: the provider observes useScopedAdAccountId() directly.
// When the active ad account changes, selectedWindow is cleared immediately —
// regardless of which page is mounted. First entry (undefined → first id) is
// intentionally ignored so a persisted window is restored on re-entry to the
// same account.

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { DataWindowSelection } from "@/pages/metrix/shared";
import { useScopedAdAccountId } from "@/contexts/AccountContext";

interface AnalysisViewState {
  topN: number;
  setTopN: (v: number) => void;
  goalCpa: number | null;
  setGoalCpa: (v: number | null) => void;
  selectedWindow: DataWindowSelection | null;
  setSelectedWindow: (v: DataWindowSelection | null) => void;
}

const AnalysisViewContext = createContext<AnalysisViewState | null>(null);

export function AnalysisViewProvider({ children }: { children: React.ReactNode }) {
  const [topN, setTopN] = useState(10);
  const [goalCpa, setGoalCpa] = useState<number | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<DataWindowSelection | null>(null);

  const adAccountId = useScopedAdAccountId();

  // Reset selectedWindow when the user switches to a different ad account.
  // The sentinel `undefined` marks "not yet seen any account" so the very
  // first account load never clears a window that was already persisted.
  const prevAdAccountIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevAdAccountIdRef.current === undefined) {
      prevAdAccountIdRef.current = adAccountId;
      return;
    }
    if (prevAdAccountIdRef.current !== adAccountId) {
      setSelectedWindow(null);
      prevAdAccountIdRef.current = adAccountId;
    }
  }, [adAccountId]);

  return (
    <AnalysisViewContext.Provider value={{ topN, setTopN, goalCpa, setGoalCpa, selectedWindow, setSelectedWindow }}>
      {children}
    </AnalysisViewContext.Provider>
  );
}

export function useAnalysisView(): AnalysisViewState {
  const ctx = useContext(AnalysisViewContext);
  if (!ctx) throw new Error("useAnalysisView must be used inside AnalysisViewProvider");
  return ctx;
}
