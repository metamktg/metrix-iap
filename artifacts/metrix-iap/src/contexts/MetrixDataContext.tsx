// @refresh reset
// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Metrix Data Context
// Fetches the seed bundle from the backend API (generated React Query hook)
// and exposes it to the app. Renders explicit loading / error states — no
// silent fallbacks and no direct seed JSON imports on the client.
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, getAuthMeQueryKey, getGetMetrixSeedQueryKey, useGetMetrixSeed } from "@workspace/api-client-react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { MetrixBootLoader } from "@/components/brand/MetrixBootLoader";
import type { MetrixSeed } from "@/lib/data/seedTypes";

const MetrixDataContext = createContext<MetrixSeed | null>(null);

/** After this long on the first load, the splash says the data service has not answered. */
export const SEED_SLOW_AFTER_MS = 20_000;
interface MetrixFreshness {
  /** A refresh is in flight. */
  isRefetching: boolean;
  /** The last refresh failed, so what is on screen is the previous bundle. */
  refreshFailed: boolean;
  retry: () => void;
}

const MetrixLoadingContext = createContext<MetrixFreshness>({
  isRefetching: false,
  refreshFailed: false,
  retry: () => {},
});

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh w-full mx-app-bg flex items-center justify-center">
      <div className="text-center space-y-3 max-w-sm px-6">{children}</div>
    </div>
  );
}

export function MetrixDataProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isRefetching } = useGetMetrixSeed();

  // A 401 here is not a data problem, it is a gone session — and 401 is the
  // seed route's ONLY documented auth failure. It happens without a reload:
  // changing a password revokes every other session, so a second tab's next
  // seed refresh comes back 401 while the page still looks signed in. Neither
  // of this provider's two states is right for that (an error screen blaming
  // the API server, or a staleness strip the user can retry forever), so nudge
  // the auth query instead: it re-asks who the user is, gets null, and AuthGate
  // renders the login page — the one screen that can actually resolve it.
  const sessionExpired = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (!sessionExpired) return;
    void queryClient.invalidateQueries({ queryKey: getAuthMeQueryKey() });
  }, [sessionExpired, queryClient]);

  // How long the FIRST load has been outstanding. Past SEED_SLOW_AFTER_MS the
  // splash stops pretending and says the data service has not answered — a
  // hung seed (a wedged database behind it) is otherwise indistinguishable
  // from a slow network, and the splash used to cycle its callouts forever.
  const [slowSeconds, setSlowSeconds] = useState<number | null>(null);
  const [retryingSlow, setRetryingSlow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setSlowSeconds(null);
      return;
    }
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= SEED_SLOW_AFTER_MS) setSlowSeconds(Math.round(elapsed / 1000));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [isLoading]);

  const freshness = useMemo<MetrixFreshness>(
    () => ({ isRefetching, refreshFailed: isError, retry: () => void refetch() }),
    [isRefetching, isError, refetch],
  );

  if (isLoading) {
    return (
      <MetrixBootLoader
        slow={
          slowSeconds !== null
            ? {
                elapsedSeconds: slowSeconds,
                retrying: retryingSlow,
                onRetry: () => {
                  // Cancel the hung request first: a plain refetch would
                  // dedupe onto the one that is not answering.
                  setRetryingSlow(true);
                  void queryClient
                    .cancelQueries({ queryKey: getGetMetrixSeedQueryKey() })
                    .then(() => refetch())
                    .finally(() => setRetryingSlow(false));
                },
              }
            : null
        }
      />
    );
  }

  // Only take over the screen when there is no bundle to render at all.
  //
  // This used to be `isError || !data`, which also fired when a REFRESH failed
  // — and React Query keeps the last successful bundle in that case (proved in
  // MetrixDataContext.test.tsx). Every one of the mutation handlers invalidates
  // this query, so one blip while a creative upload or an analysis run settled
  // replaced a fully loaded dashboard with a full-screen error and threw away
  // scroll position, open drawers, and in-progress form state for data the app
  // still had. A stale bundle is worth more than a blank screen — provided the
  // staleness is said out loud, which SeedRefreshFailedBanner does.
  if (!data) {
    return (
      <FullScreen>
        <AlertTriangle className="w-6 h-6 text-status-warning/80 mx-auto" />
        <p className="text-body font-semibold text-foreground">Couldn't load Metrix data</p>
        <p className="text-body text-muted-foreground/75 leading-relaxed">
          The data service didn't respond. Check that the API server is running, then try again.
        </p>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 text-body font-medium text-interactive border border-primary/30 hover:bg-primary/10 active:bg-primary/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={isRefetching ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
          Retry
        </button>
      </FullScreen>
    );
  }

  const seed = data as unknown as MetrixSeed;
  return (
    <MetrixLoadingContext.Provider value={freshness}>
      <MetrixDataContext.Provider value={seed}>{children}</MetrixDataContext.Provider>
    </MetrixLoadingContext.Provider>
  );
}

export function useMetrixSeed(): MetrixSeed {
  const ctx = useContext(MetrixDataContext);
  if (!ctx) throw new Error("useMetrixSeed must be used within MetrixDataProvider");
  return ctx;
}

/** Returns true while the seed is being re-fetched in the background. */
export function useMetrixIsRefetching(): boolean {
  return useContext(MetrixLoadingContext).isRefetching;
}

/**
 * Whether the bundle on screen is the last-good one because a refresh failed,
 * plus the retry that would replace it.
 */
export function useMetrixFreshness(): MetrixFreshness {
  return useContext(MetrixLoadingContext);
}
