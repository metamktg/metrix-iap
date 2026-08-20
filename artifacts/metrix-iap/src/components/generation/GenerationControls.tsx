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
  type GenerateStrategyInput,
} from "@workspace/api-client-react";
import { useToast } from "@workspace/command-deck/hooks/use-toast";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";

export type GenerationKind = "strategy" | "briefs";

const KIND_LABEL: Record<GenerationKind, string> = {
  strategy: "strategy",
  briefs: "briefs",
};

// How often (ms) we poll the run status endpoint while a job is in flight.
const POLL_INTERVAL_MS = 2500;

// Estimated total duration (seconds) per generation kind.
// Used to compute a smooth 0→95% progress estimate from elapsed time.
const EXPECTED_SECONDS: Record<GenerationKind, number> = {
  strategy: 75,
  briefs:   90,
};

/** Quadratic ease-out: starts fast, decelerates as expected time approaches.
 *  Returns 0–95 while running (never shows 100 — that snaps on completion). */
function calcGenerationProgress(elapsedSeconds: number, kind: GenerationKind): number {
  const expected = EXPECTED_SECONDS[kind];
  const t = Math.min(elapsedSeconds / expected, 1);
  const ease = 1 - Math.pow(1 - t, 2);
  return Math.min(95, Math.round(ease * 95));
}

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
        duration: 4000,
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

  const start = (extraData?: GenerateStrategyInput) => {
    // Guard: when passed directly as an onClick handler, extraData is a React
    // SyntheticEvent that carries the DOM element — discard it so we never
    // accidentally JSON.stringify a circular HTMLButtonElement reference.
    if (
      extraData != null &&
      typeof extraData === "object" &&
      ("nativeEvent" in extraData || "currentTarget" in extraData)
    ) {
      extraData = undefined;
    }
    if (!accountId) return;
    // Guard against rapid double-taps: firingRef blocks the second call
    // synchronously (before any re-render); setFiring(true) triggers a
    // re-render so isRunning is true before mutation.isPending catches up.
    if (firingRef.current) return;
    firingRef.current = true;
    setFiring(true);
    const callbacks = {
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
    };
    if (kind === "strategy") {
      // The server requires an explicit selection (analysis_run_ids or
      // analysis_all_time) — no implicit "latest run" fallback. Default to
      // all-time only as a safety net if a caller forgets to pass a
      // selection; RunSelector-driven callers always pass one explicitly.
      strategyMutation.mutate({ accountId, data: extraData ?? { analysis_all_time: true } }, callbacks);
    } else {
      briefsMutation.mutate({ accountId }, callbacks);
    }
  };

  const isRunning = firing || mutation.isPending || polling || run?.status === "running";

  // ── Elapsed-time counter ─────────────────────────────────────────────────
  // Starts ticking when isRunning becomes true; resets when it becomes false.
  // When the component mounts mid-run the counter is seeded from the run's
  // server-side started_at so a page-reload doesn't restart at 0:00.
  // Gives the user a live signal that work is happening without needing the
  // hub open.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runningStartRef = useRef<number | null>(null);
  // Keep the latest run.started_at available inside the effect without adding
  // it to the deps array (we only need it for the one-time seeding).
  const runStartedAtRef = useRef<string | null | undefined>(undefined);
  runStartedAtRef.current = run?.started_at;

  useEffect(() => {
    if (!isRunning) {
      runningStartRef.current = null;
      setElapsedSeconds(0);
      return;
    }
    if (runningStartRef.current === null) {
      const serverTs = runStartedAtRef.current
        ? new Date(runStartedAtRef.current).getTime()
        : null;
      runningStartRef.current = serverTs ?? Date.now();
    }
    const iv = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - runningStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRunning]);

  // Prefer real server-side progress when available (non-zero from the DB).
  // Fall back to the elapsed-time estimate only when the server hasn't written
  // any progress yet (e.g. the run just started and the first phase hasn't
  // committed) or the columns pre-date this feature (legacy runs).
  const serverPct = run?.progress_pct ?? 0;
  const serverStage = run?.progress_stage ?? "";
  const hasRealProgress = isRunning && serverPct > 0;

  const progressPercent = isRunning
    ? hasRealProgress
      ? serverPct
      : calcGenerationProgress(elapsedSeconds, kind)
    : 0;

  const progressStage = isRunning
    ? hasRealProgress
      ? serverStage
      : null // caller falls back to PHASE_LABELS
    : null;

  return {
    start,
    isRunning,
    elapsedSeconds,
    progressPercent,
    progressStage,
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
      className="inline-flex items-center gap-1.5 text-body font-medium text-interactive border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
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

/**
 * Determinate progress bar for generation runs — same visual treatment as
 * the analysis pipeline bar in ManualAnalysisControls (label + % readout +
 * thin rounded track). Renders nothing when not running.
 */
export function GenerationProgressBar({
  isRunning,
  progressPercent,
  stageLabel,
}: {
  isRunning: boolean;
  progressPercent: number;
  stageLabel: string;
}) {
  if (!isRunning) return null;
  return (
    <div className="space-y-1.5" data-testid="generation-progress-bar">
      <div className="flex items-center justify-between gap-2 text-label text-muted-foreground/75">
        <span className="truncate">{stageLabel}</span>
        <span className="tabular-nums shrink-0">{progressPercent}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/70 transition-[width] duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export function ProvenanceBadge({ provenance }: { provenance?: string }) {
  if (provenance !== "generated") return null;
  return (
    <span className="inline-flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-interactive border border-primary/25 bg-primary/10 px-1.5 py-0.5 rounded leading-none">
      <Sparkles className="w-3.5 h-3.5" /> Generated in-app
    </span>
  );
}

export function GenerationErrorNote({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-status-warning/25 bg-status-warning/10 px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 text-status-warning mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-caption text-status-warning/90 leading-relaxed">
          Last generation run failed: {message}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 text-caption font-medium text-status-warning hover:text-status-warning/80 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
