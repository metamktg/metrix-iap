// ─── Loop stage-status hook ─────────────────────────────────────────────
// Thin wrapper over the generated stage-status query — the single source
// of truth every command center gates on (Strategy needs a successful
// Analysis run, Creative needs a successful Strategy run, MST needs at
// least one brief). Returns null fields until the account id resolves.

import { useGetAccountStageStatus, getGetAccountStageStatusQueryKey } from "@workspace/api-client-react";

export type StageRunStatus = "none" | "running" | "success" | "error";

export function useStageStatus(accountId: string | null) {
  const query = useGetAccountStageStatus(accountId ?? "", {
    query: {
      queryKey: getGetAccountStageStatusQueryKey(accountId ?? ""),
      enabled: !!accountId,
      // The server reports live progress here (progress_pct / stage) but the
      // global staleTime is Infinity, so a run in flight was read once and
      // never again until it settled. Poll while anything is running.
      refetchInterval: (q) => {
        const d = q.state.data;
        const running =
          d?.analysis?.status === "running" || d?.strategy?.status === "running" || d?.briefs?.status === "running";
        return running ? 3000 : false;
      },
    },
  });

  return {
    isLoading: query.isLoading,
    analysis: query.data?.analysis ?? {
      status: "none" as StageRunStatus,
      last_run_at: null,
      date_range: null,
      validated: false,
      progress_pct: 0,
      progress_stage: "",
    },
    strategy: query.data?.strategy ?? { status: "none" as StageRunStatus, last_run_at: null },
    briefs: query.data?.briefs ?? { status: "none" as StageRunStatus, last_run_at: null, count: 0 },
    mst: query.data?.mst ?? { unlocked: false },
  };
}
