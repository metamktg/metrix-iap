// ─── Global Running Banner ────────────────────────────────────────────────
// Slim amber strip shown below the Topbar on every page while any Metrix
// engine stage (analysis, strategy, briefs) is in progress.
// Uses the lower-level polling hooks directly so it never triggers duplicate
// toast notifications — toast side-effects live only in useGenerationRun
// (GenerationControls.tsx) and LoopCommandChain.
//
// Seeds the React Query cache with the same keys LoopCommandChain uses,
// so there is no extra network traffic when both components are mounted.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  useGetLatestAnalysisRun,
  useGetLatestGenerationRun,
  getGetLatestAnalysisRunQueryKey,
  getGetLatestGenerationRunQueryKey,
  getGetMetrixSeedQueryKey,
} from "@workspace/api-client-react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { cn } from "@workspace/command-deck/lib/utils";

const POLL_MS = 3000;

// ── Elapsed timer hook ───────────────────────────────────────────────────

function useElapsedSeconds(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setSeconds(0);
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

function fmtElapsed(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ── Per-account running state ─────────────────────────────────────────────

function useAccountRunningState(accountId: string) {
  const queryClient = useQueryClient();
  const settledRef = useRef<Set<string>>(new Set());

  // Analysis
  const { data: analysisData } = useGetLatestAnalysisRun(accountId, {
    query: {
      queryKey: getGetLatestAnalysisRunQueryKey(accountId),
      enabled: !!accountId,
      refetchInterval: (q) =>
        q.state.data?.run?.status === "running" ? POLL_MS : false,
    },
  });

  // Strategy
  const { data: strategyData } = useGetLatestGenerationRun(accountId, "strategy", {
    query: {
      queryKey: getGetLatestGenerationRunQueryKey(accountId, "strategy"),
      enabled: !!accountId,
      refetchInterval: (q) =>
        q.state.data?.run?.status === "running" ? POLL_MS : false,
    },
  });

  // Briefs
  const { data: briefsData } = useGetLatestGenerationRun(accountId, "briefs", {
    query: {
      queryKey: getGetLatestGenerationRunQueryKey(accountId, "briefs"),
      enabled: !!accountId,
      refetchInterval: (q) =>
        q.state.data?.run?.status === "running" ? POLL_MS : false,
    },
  });

  const analysisRunning = analysisData?.run?.status === "running";
  const strategyRunning = strategyData?.run?.status === "running";
  const briefsRunning   = briefsData?.run?.status === "running";

  // When any run settles to success, invalidate the seed so all pages
  // repopulate automatically — this is the same invalidation LoopCommandChain
  // does, deduplicated by run id so it only fires once per completion.
  useEffect(() => {
    const runs = [
      { run: analysisData?.run, key: "analysis" },
      { run: strategyData?.run, key: "strategy" },
      { run: briefsData?.run,   key: "briefs"   },
    ];
    for (const { run } of runs) {
      if (!run || run.status !== "success") continue;
      const runId = `${accountId}:${run.id}`;
      if (settledRef.current.has(runId)) continue;
      settledRef.current.add(runId);
      void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
  }, [analysisData, strategyData, briefsData, accountId, queryClient]);

  const anyRunning = analysisRunning || strategyRunning || briefsRunning;
  const activeLabel = analysisRunning ? "Analysis" : strategyRunning ? "Strategy" : briefsRunning ? "Briefs" : null;

  return { anyRunning, activeLabel };
}

// ── Banner UI ─────────────────────────────────────────────────────────────

interface BannerInnerProps {
  label: string;
}

function BannerInner({ label }: BannerInnerProps) {
  const elapsed = useElapsedSeconds(true);

  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5 border-b border-status-warning/20 bg-status-warning/[0.04]">
      <Loader2 className="w-3 h-3 text-status-warning/70 animate-spin shrink-0" />
      <span className="text-label font-medium text-status-warning/75">{label} processing</span>
      <span className="text-[9px] font-mono tabular-nums text-status-warning/45 leading-none">{fmtElapsed(elapsed)}</span>

      {/* Progress bar */}
      <div className="flex-1 relative h-[3px] rounded-full overflow-hidden bg-status-warning/[0.08]">
        <span className="absolute inset-y-0 w-1/3 bg-status-warning/40 rounded-full animate-[progress-slide_1.4s_ease-in-out_infinite]" />
      </div>

      <span className={cn("text-[9px] text-status-warning/40 leading-none whitespace-nowrap hidden sm:block")}>
        Views update on completion
      </span>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────

export function GlobalRunningBanner() {
  const accountId = useScopedAdAccountId();

  if (!accountId) return null;

  return <GlobalRunningBannerInner accountId={accountId} />;
}

function GlobalRunningBannerInner({ accountId }: { accountId: string }) {
  const { anyRunning, activeLabel } = useAccountRunningState(accountId);

  if (!anyRunning || !activeLabel) return null;

  return <BannerInner label={activeLabel} />;
}
