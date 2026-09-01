// ─── Seed refresh failure strip ───────────────────────────────────────────
// Slim strip below the Topbar shown when the seed bundle on screen is the last
// one that loaded successfully because a refresh failed.
//
// Every mutation in the app invalidates the seed query, so this is the state a
// user lands in when an upload, an analysis run, or a settings change settles
// against a data service that has since become unreachable. The dashboard is
// still fully usable on the previous bundle — but the figures no longer
// include whatever just happened, and saying nothing would let the user read
// stale numbers as confirmation that their action took effect.

import { AlertTriangle, RefreshCw } from "lucide-react";

import { useMetrixFreshness } from "@/contexts/MetrixDataContext";

export function SeedRefreshFailedBanner() {
  const { refreshFailed, isRefetching, retry } = useMetrixFreshness();

  if (!refreshFailed) return null;

  return (
    <div
      data-testid="seed-refresh-failed"
      role="status"
      className="flex items-center gap-2.5 px-4 py-1.5 border-b border-status-warning/20 bg-status-warning/[0.04]"
    >
      <AlertTriangle className="w-3 h-3 text-status-warning/70 shrink-0" />
      <span className="text-label font-medium text-status-warning/75">Showing the last data that loaded</span>
      <span className="text-caption text-status-warning/60 leading-none hidden sm:block">
        Refresh failed, so anything changed since then is not reflected here
      </span>

      <button
        type="button"
        onClick={retry}
        disabled={isRefetching}
        className="ml-auto inline-flex items-center gap-1.5 text-label font-medium text-status-warning/80 border border-status-warning/25 hover:bg-status-warning/10 active:bg-status-warning/20 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={isRefetching ? "w-3 h-3 animate-spin" : "w-3 h-3"} />
        {isRefetching ? "Refreshing" : "Refresh"}
      </button>
    </div>
  );
}
