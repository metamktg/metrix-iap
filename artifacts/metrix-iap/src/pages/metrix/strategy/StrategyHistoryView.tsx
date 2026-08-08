// ─── Strategy · History ──────────────────────────────────────────────
// Full detail on the account's strategy generation runs. The backend
// today only retains the LATEST generation run per account+kind (no
// run-list endpoint exists yet) — honest about that rather than
// fabricating a multi-row log.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useGetLatestGenerationRun, getGetLatestGenerationRunQueryKey } from "@workspace/api-client-react";
import { ModuleHeader, ModuleScopeGate, SectionCard, PendingState, CaveatNote } from "../shared";
import { History, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const SECTION = "Strategy · 04";

export function StrategyHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { data } = useGetLatestGenerationRun(account?.id ?? "", "strategy", {
    query: { queryKey: getGetLatestGenerationRunQueryKey(account?.id ?? "", "strategy"), enabled: !!account },
  });
  const run = data?.run ?? null;

  return (
    <ModuleScopeGate section={SECTION} title="History" account={account}>
      {() => (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ModuleHeader section={SECTION} title="History" subtitle="Strategy generation runs for this account." table="generation_runs" />
          <div className="px-6 py-5 space-y-4 max-w-3xl">
            <CaveatNote text="Only the most recent strategy generation run is tracked today — a full multi-run log is planned but not yet built." />
            {!run ? (
              <PendingState title="No runs yet" message="Generate strategy from the Strategy command center to see it here." icon={History} />
            ) : (
              <SectionCard title="Latest run" desc={run.model ? `Model: ${run.model}` : undefined}>
                <div className="flex items-center gap-2 mb-3">
                  {run.status === "running" && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
                  {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {run.status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
                  <span className="text-title font-semibold text-foreground capitalize">{run.status}</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-body">
                  <div>
                    <dt className="text-muted-foreground/70">Started</dt>
                    <dd className="text-foreground/90">{new Date(run.started_at).toLocaleString()}</dd>
                  </div>
                  {run.finished_at && (
                    <div>
                      <dt className="text-muted-foreground/70">Finished</dt>
                      <dd className="text-foreground/90">{new Date(run.finished_at).toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
                {run.error_message && (
                  <p className="text-caption text-red-400/90 mt-3">{run.error_message}</p>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
