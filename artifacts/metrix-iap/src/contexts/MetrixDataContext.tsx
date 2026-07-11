// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Metrix Data Context
// Fetches the seed bundle from the backend API (generated React Query hook)
// and exposes it to the app. Renders explicit loading / error states — no
// silent fallbacks and no direct seed JSON imports on the client.
// ═══════════════════════════════════════════════════════════════════════

import React, { createContext, useContext } from "react";
import { useGetMetrixSeed } from "@workspace/api-client-react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import type { MetrixSeed } from "@/lib/data/seedTypes";

const MetrixDataContext = createContext<MetrixSeed | null>(null);

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
    return (
      <FullScreen>
        <Loader2 className="w-6 h-6 text-primary/70 animate-spin mx-auto" />
        <p className="text-xs text-muted-foreground/70">Loading Metrix data…</p>
      </FullScreen>
    );
  }

  if (isError || !data) {
    return (
      <FullScreen>
        <AlertTriangle className="w-6 h-6 text-amber-400/80 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Couldn't load Metrix data</p>
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          The data service didn't respond. Check that the API server is running, then try again.
        </p>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={isRefetching ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
          Retry
        </button>
      </FullScreen>
    );
  }

  const seed = data as unknown as MetrixSeed;
  return <MetrixDataContext.Provider value={seed}>{children}</MetrixDataContext.Provider>;
}

export function useMetrixSeed(): MetrixSeed {
  const ctx = useContext(MetrixDataContext);
  if (!ctx) throw new Error("useMetrixSeed must be used within MetrixDataProvider");
  return ctx;
}
