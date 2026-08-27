// @refresh reset
// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Metrix Data Context
// Fetches the seed bundle from the backend API (generated React Query hook)
// and exposes it to the app. Renders explicit loading / error states — no
// silent fallbacks and no direct seed JSON imports on the client.
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext } from "react";
import { useGetMetrixSeed } from "@workspace/api-client-react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { MetrixBootLoader } from "@/components/brand/MetrixBootLoader";
import type { MetrixSeed } from "@/lib/data/seedTypes";

const MetrixDataContext = createContext<MetrixSeed | null>(null);
const MetrixLoadingContext = createContext<{ isRefetching: boolean }>({ isRefetching: false });

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen mx-app-bg flex items-center justify-center">
      <div className="text-center space-y-3 max-w-sm px-6">{children}</div>
    </div>
  );
}

export function MetrixDataProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, refetch, isRefetching } = useGetMetrixSeed();

  if (isLoading) {
    return <MetrixBootLoader />;
  }

  if (isError || !data) {
    return (
      <FullScreen>
        <AlertTriangle className="w-6 h-6 text-status-warning/80 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Couldn't load Metrix data</p>
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
    <MetrixLoadingContext.Provider value={{ isRefetching }}>
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
