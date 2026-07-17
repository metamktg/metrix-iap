// @refresh reset
// ─── In-app generation controls ───────────────────────────────────────
// Shared hook + UI for triggering Metrix engine generation runs
// (strategy-from-analysis, briefs-from-strategy) and polling the run
// until it settles. On success the seed query is invalidated so the app
// re-renders with the newly generated set (server-side provenance rule).

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGenerateAccountStrategy,
  useGenerateAccountBriefs,
  useGetLatestGenerationRun,
  getGetMetrixSeedQueryKey,
  getGetLatestGenerationRunQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";

export type GenerationKind = "strategy" | "briefs";

const KIND_LABEL: Record<GenerationKind, string> = {
  strategy: "strategy",
  briefs: "briefs",
};

// How often (ms) we poll the run status endpoint while a job is in flight.
const POLL_INTERVAL_MS = 2500;

export function useGenerationRun(accountId: string | null, kind: GenerationKind) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [polling, setPolling] = useState(false);
  const settledRunIds = useRef<Set<string>>(new Set());
  // Double-tap guard: firingRef blocks a second mutate() call synchronously
  // (before any re-render); firingState drives the isRunning value so the
  // button disables in the very next render triggered by setFiring(true).
  // Without this, a rapid double-tap fires two API requests because
  // mutation.isPending only flips after the async mutation starts.
  const firingRef = useRef(false);
  const [firing, setFiring] = useState(false);

  const latestQuery = useGetLatestGenerationRun(accountId ?? "", kind, {
    query: {
      queryKey: getGetLatestGenerationRunQueryKey(accountId ?? "", kind),
      enabled: !!accountId,
      refetchInterval: polling ? POLL_INTERVAL_MS : false,
    },
  });

  const run = latestQuery.data?.run ?? null;

  // Keep polling while a run is in flight (covers page reloads mid-run).
  useEffect(() => {
    if (run?.status === "running" && !polling) setPolling(true);
  }, [run?.status, polling]);

  // When a polled run settles, refresh the seed and stop polling.
  useEffect(() => {
    if (!run || run.status === "running") return;
    if (!polling) return;
    if (settledRunIds.current.has(run.id)) return;
    settledRunIds.current.add(run.id);
    setPolling(false);
    if (run.status === "success") {
      void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
      toast({
        title: `Generated ${KIND_LABEL[kind]}`,
        description: `The Metrix engine finished generating ${KIND_LABEL[kind]} for this account.`,
      });
    } else {
      toast({
        title: `${kind === "strategy" ? "Strategy" : "Briefs"} generation failed`,
        description: run.error_message ?? "The generation run ended with an error.",
        variant: "destructive",
      });
    }
  }, [run, polling, queryClient, toast, kind]);

  const strategyMutation = useGenerateAccountStrategy();
  const briefsMutation = useGenerateAccountBriefs();
  const mutation = kind === "strategy" ? strategyMutation : briefsMutation;

  const start = () => {
    if (!accountId) return;
    // Guard against rapid double-taps: firingRef blocks the second call
    // synchronously (before any re-render); setFiring(true) triggers a
    // re-render so isRunning is true before mutation.isPending catches up.
    if (firingRef.current) return;
    firingRef.current = true;
    setFiring(true);
    mutation.mutate(
      { accountId },
      {
        onSuccess: () => {
          firingRef.current = false;
          setFiring(false);
          setPolling(true);
          void queryClient.invalidateQueries({
            queryKey: getGetLatestGenerationRunQueryKey(accountId, kind),
          });
        },
        onError: (err: unknown) => {
          firingRef.current = false;
          setFiring(false);
          const message =
            err instanceof ApiError
              ? ((err.data as { message?: string } | null)?.message ?? err.message)
              : err instanceof Error
                ? err.message
                : "Could not start the generation run.";
          toast({
            title: `Couldn't start ${KIND_LABEL[kind]} generation`,
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const isRunning = firing || mutation.isPending || polling || run?.status === "running";

  // ── Elapsed-time counter ─────────────────────────────────────────────────
  // Starts ticking when isRunning becomes true; resets when it becomes false.
  // Gives the user a live signal that work is happening without needing the
  // hub open.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runningStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      runningStartRef.current = null;
      setElapsedSeconds(0);
      return;
    }
    if (runningStartRef.current === null) {
      runningStartRef.current = Date.now();
    }
    const iv = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - runningStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRunning]);

  return {
    start,
    isRunning,
    elapsedSeconds,
    lastRun: run,
    lastError: run?.status === "error" ? (run.error_message ?? "Generation failed.") : null,
  };
}

export function GenerateButton({
  onClick,
  isRunning,
  label,
  runningLabel,
}: {
  onClick: () => void;
  isRunning: boolean;
  label: string;
  runningLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isRunning}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
    >
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      {isRunning ? runningLabel : label}
    </button>
  );
}

export function ProvenanceBadge({ provenance }: { provenance?: string }) {
  if (provenance !== "generated") return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary border border-primary/25 bg-primary/10 px-1.5 py-0.5 rounded leading-none">
      <Sparkles className="w-2.5 h-2.5" /> Generated in-app
    </span>
  );
}

export function GenerationErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
      <p className="text-[11px] text-amber-200/90 leading-relaxed">
        Last generation run failed: {message}
      </p>
    </div>
  );
}
