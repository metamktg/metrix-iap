// ─── Analysis View Context ────────────────────────────────────────────────
// Persists the Top-N and Goal-CPA slider values across in-session navigations.
// Lives outside the AnalysisOverview component so values survive route changes.
// The brush position on the trend chart is intentionally NOT persisted — zoomed
// ranges are disorienting on re-entry, so the chart always resets to "all".

import React, { createContext, useContext, useState } from "react";

interface AnalysisViewState {
  topN: number;
  setTopN: (v: number) => void;
  goalCpa: number | null;
  setGoalCpa: (v: number | null) => void;
}

const AnalysisViewContext = createContext<AnalysisViewState | null>(null);

export function AnalysisViewProvider({ children }: { children: React.ReactNode }) {
  const [topN, setTopN] = useState(10);
  const [goalCpa, setGoalCpa] = useState<number | null>(null);

  return (
    <AnalysisViewContext.Provider value={{ topN, setTopN, goalCpa, setGoalCpa }}>
      {children}
    </AnalysisViewContext.Provider>
  );
}

export function useAnalysisView(): AnalysisViewState {
  const ctx = useContext(AnalysisViewContext);
  if (!ctx) throw new Error("useAnalysisView must be used inside AnalysisViewProvider");
  return ctx;
}
