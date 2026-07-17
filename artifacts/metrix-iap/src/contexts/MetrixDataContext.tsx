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
        <div className="w-full max-w-xl space-y-3 px-4" aria-busy="true" aria-label="Loading Metrix data">
          <div className="animate-pulse rounded-md bg-white/[0.06] h-3 w-1/3" />
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-white/[0.02] px-3 py-2.5 space-y-2">
                <div className="animate-pulse rounded-md bg-white/[0.06] h-2 w-2/3" />
                <div className="animate-pulse rounded-md bg-white/[0.06] h-5 w-1/2" />
              </div>
            ))}
          </div>
          <div className="animate-pulse rounded-md bg-white/[0.06] h-24 w-full" />
          <div className="animate-pulse rounded-md bg-white/[0.06] h-16 w-full" />
        </div>
      </FullScreen>
    );
  }

  if (isError || !data) {
    return (
      <FullScreen>
        <AlertTriangle className="w-6 h-6 text-amber-400/80 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Couldn't load Metrix data</p>
        <p className="text-body text-muted-foreground/70 leading-relaxed">
          The data service didn't respond. Check that the API server is running, then try again.
        </p>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 text-body font-medium text-primary border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
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
