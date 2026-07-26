// ─── Analysis run tracker ────────────────────────────────────────────
// Watches in-flight manual-analysis runs (and, in future, other async
// ingestion jobs) across navigation. Mounted once above the router so
// completion is never tied to whichever settings sub-page started the
// run — the previous pattern (a useEffect local to that one component)
// only invalidated the dashboard cache if the user stayed on that exact
// page until its own poll noticed completion. This provider polls
// independently of what's currently rendered and always invalidates +
// notifies on a terminal state.

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getLatestAnalysisRun, getGetMetrixSeedQueryKey } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

interface AnalysisRunTrackerCtx {
  /** Start (or continue) watching this account's latest analysis run until it settles. */
  watchRun: (accountId: string) => void;
}

const AnalysisRunTrackerContext = createContext<AnalysisRunTrackerCtx>({ watchRun: () => {} });

const POLL_MS = 3000;

export function AnalysisRunTrackerProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const watched = useRef<Set<string>>(new Set());

  const watchRun = useCallback((accountId: string) => {
    watched.current.add(accountId);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      for (const accountId of Array.from(watched.current)) {
        void (async () => {
          try {
            const { run } = await getLatestAnalysisRun(accountId);
            if (!run || run.status === "running") return;
            // Only fire once per completed run: drop the watch immediately,
            // then invalidate + notify.
            watched.current.delete(accountId);
            queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
            if (run.status === "success") {
              toast({
                title: "Analysis complete",
                description:
                  run.date_start && run.date_end
                    ? `Covers ${run.date_start} → ${run.date_end} (${run.rows_ingested ?? 0} rows). Dashboards have been refreshed.`
                    : "Your uploaded data has been processed. Dashboards have been refreshed.",
              });
            } else {
              toast({
                title: "Analysis failed",
                description: run.error_message ?? "The analysis run did not complete. Try again.",
                variant: "destructive",
              });
            }
          } catch {
            // Transient fetch failure — leave the watch in place and retry next tick.
          }
        })();
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [queryClient]);

  return (
    <AnalysisRunTrackerContext.Provider value={{ watchRun }}>{children}</AnalysisRunTrackerContext.Provider>
  );
}

export function useAnalysisRunTracker() {
  return useContext(AnalysisRunTrackerContext);
}
