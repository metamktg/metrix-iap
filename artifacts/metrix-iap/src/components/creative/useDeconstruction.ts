// ─── Creative deconstruction client helpers ────────────────────────────
// Shared hook + registry helpers for the deconstruct flow: trigger a run
// (202 + run polling, mirrors useGenerationRun), read classification state
// per uploaded creative, and constrain review-queue edits to registry-valid
// family/code values.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBackfillDeconstructCreatives,
  useDeconstructCreatives,
  useListCreativeDeconstructions,
  useReviewCreativeDeconstruction,
  useGetLatestGenerationRun,
  getGetMetrixSeedQueryKey,
  getGetLatestGenerationRunQueryKey,
  getListCreativeDeconstructionsQueryKey,
  ApiError,
  type CreativeDeconstruction,
  type DetectedCreativeVariable,
} from "@workspace/api-client-react";
import { useToast } from "@workspace/command-deck/hooks/use-toast";

const POLL_INTERVAL_MS = 2500;

// ── Registry taxonomy (mirrors the server's IAP_VARIABLE_TAXONOMY and
// docs/iap/VARIABLES_REGISTRY.md: families are fixed, codes extend). ──
export const REGISTRY_FAMILIES: Array<{ family: string; prefix: string; label: string; suggestions: string[] }> = [
  { family: "concept", prefix: "CN", label: "Concept", suggestions: ["CN_Testimonial", "CN_FounderStory", "CN_ProductDemo", "CN_Comparison", "CN_ValueStack", "CN_Lifestyle", "CN_PainFirst", "CN_SocialProof", "CN_UGC"] },
  { family: "framework", prefix: "FW", label: "Framework", suggestions: ["FW_PAS", "FW_AIDA", "FW_FAB", "FW_BAB", "FW_StoryBrand", "FW_Direct"] },
  { family: "tonality", prefix: "TN", label: "Tonality", suggestions: ["TN_Emotional", "TN_Rational", "TN_Relatable", "TN_Playful", "TN_Assertive", "TN_Aspirational", "TN_Warm", "TN_Urgent"] },
  { family: "hook", prefix: "HK", label: "Hook", suggestions: ["HK_Problem", "HK_Benefit", "HK_Curiosity", "HK_Shock", "HK_Story", "HK_SocialProof"] },
  { family: "funnel_stage", prefix: "ST", label: "Funnel stage", suggestions: ["ST_TOFU", "ST_MOFU", "ST_BOFU"] },
  { family: "awareness", prefix: "AW", label: "Awareness", suggestions: ["AW_Unaware", "AW_ProblemAware", "AW_SolutionAware", "AW_MostAware"] },
  { family: "pain_point", prefix: "HP", label: "Pain / hurdle", suggestions: ["HP_Time", "HP_Money", "HP_Confidence", "HP_Overwhelm"] },
  { family: "proof", prefix: "PR", label: "Proof", suggestions: ["PR_Testimonial", "PR_Expert", "PR_DataDriven", "PR_SocialProof", "PR_VisualDemo", "PR_UGC"] },
];

const CODE_RE = /^(CN|FW|TN|ST|AW|HP|PR|HK)_[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function isRegistryValidCode(family: string, code: string): boolean {
  const fam = REGISTRY_FAMILIES.find((f) => f.family === family);
  return !!fam && CODE_RE.test(code) && code.startsWith(`${fam.prefix}_`);
}

export function familyDisplayLabel(family: string): string {
  return REGISTRY_FAMILIES.find((f) => f.family === family)?.label ?? family;
}

export const DECONSTRUCTION_STATUS_LABEL: Record<CreativeDeconstruction["status"], string> = {
  unsupported: "Unsupported format",
  auto_filed: "Classified",
  needs_review: "Needs review",
  user_overridden: "Accepted (override)",
  discarded: "Discarded",
};

/** Percentage display for a 0..1 confidence, or em dash. */
export function pct(confidence: number | null | undefined): string {
  return confidence == null ? "—" : `${Math.round(confidence * 100)}%`;
}

/**
 * Trigger + poll a deconstruction run and expose per-import classification
 * state. Mirrors useGenerationRun's 202+poll pattern for kind=deconstruct.
 */
export function useDeconstruction(accountId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [polling, setPolling] = useState(false);
  const settledRunIds = useRef<Set<string>>(new Set());
  const firingRef = useRef(false);
  const [firing, setFiring] = useState(false);

  const listQuery = useListCreativeDeconstructions(accountId ?? "", {
    query: {
      queryKey: getListCreativeDeconstructionsQueryKey(accountId ?? ""),
      enabled: !!accountId,
    },
  });

  const latestQuery = useGetLatestGenerationRun(accountId ?? "", "deconstruct", {
    query: {
      queryKey: getGetLatestGenerationRunQueryKey(accountId ?? "", "deconstruct"),
      enabled: !!accountId,
      refetchInterval: polling ? POLL_INTERVAL_MS : false,
    },
  });
  const run = latestQuery.data?.run ?? null;

  useEffect(() => {
    if (run?.status === "running" && !polling) setPolling(true);
  }, [run?.status, polling]);

  useEffect(() => {
    if (!run || run.status === "running" || !polling) return;
    if (settledRunIds.current.has(run.id)) return;
    settledRunIds.current.add(run.id);
    setPolling(false);
    void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    void queryClient.invalidateQueries({
      queryKey: getListCreativeDeconstructionsQueryKey(accountId ?? ""),
    });
    if (run.status === "success") {
      toast({ title: "Deconstruction complete", description: "Creatives were classified against the IAP registry." });
    } else {
      toast({
        title: "Deconstruction failed",
        description: run.error_message ?? "The run did not finish. Try again.",
        variant: "destructive",
      });
    }
  }, [run, polling, queryClient, toast, accountId]);

  const startMutation = useDeconstructCreatives();
  const backfillMutation = useBackfillDeconstructCreatives();

  const fire = async (mutate: () => Promise<unknown>) => {
    if (!accountId || firingRef.current) return;
    firingRef.current = true;
    setFiring(true);
    try {
      const started = (await mutate()) as { total?: number } | undefined;
      setPolling(true);
      const n = typeof started?.total === "number" ? started.total : null;
      toast({
        title: "Deconstruction started",
        description: n
          ? `${n} creative${n === 1 ? "" : "s"} queued. Each one is classified in turn — the meter below counts them.`
          : "Each creative is classified in turn — the meter below counts them.",
      });
      void queryClient.invalidateQueries({
        queryKey: getGetLatestGenerationRunQueryKey(accountId, "deconstruct"),
      });
    } catch (err) {
      toast({
        title: "Couldn't start deconstruction",
        description: err instanceof ApiError ? err.message : "Something went wrong. Try again.",
        variant: "destructive",
      });
    } finally {
      firingRef.current = false;
      setFiring(false);
    }
  };

  const start = async (importIds: string[]) => {
    if (importIds.length === 0) return;
    await fire(() => startMutation.mutateAsync({ accountId: accountId!, data: { import_ids: importIds } }));
  };

  /** Bulk backfill: the server targets every upload with no non-discarded classification. */
  const startBackfill = async () => {
    await fire(() => backfillMutation.mutateAsync({ accountId: accountId! }));
  };

  const reviewMutation = useReviewCreativeDeconstruction();
  const review = async (
    deconstructionId: string,
    action: "update_variables" | "bypass" | "discard",
    variables?: DetectedCreativeVariable[],
  ) => {
    if (!accountId) return;
    await reviewMutation.mutateAsync({
      accountId,
      deconstructionId,
      data: { action, ...(variables ? { variables } : {}) },
    });
    await queryClient.invalidateQueries({
      queryKey: getListCreativeDeconstructionsQueryKey(accountId),
    });
    await queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
  };

  const deconstructions = listQuery.data?.deconstructions ?? [];
  const byImportId = new Map(deconstructions.map((d) => [d.manual_import_id, d]));

  const isRunning = firing || run?.status === "running" || startMutation.isPending || backfillMutation.isPending;
  const startedAt = run?.status === "running" && run.started_at ? new Date(run.started_at).getTime() : null;

  return {
    deconstructions,
    byImportId,
    isRunning,
    /** n-of-m meter for the in-flight run, when it reports per-item progress. */
    progress:
      isRunning && run?.status === "running" && run.progress_total != null
        ? { done: run.progress_done ?? 0, total: run.progress_total }
        : null,
    /** Epoch ms of the in-flight run's start, for an elapsed readout. */
    startedAt,
    runError: run?.status === "error" ? (run.error_message ?? "The run failed.") : null,
    start,
    startBackfill,
    review,
    reviewPending: reviewMutation.isPending,
    refetch: () => {
      void listQuery.refetch();
    },
  };
}
