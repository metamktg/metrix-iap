// ─── Strategy · History ──────────────────────────────────────────────
// Every strategy generation run for the account, newest first, and what
// each was built from (sweep spec §5.2, slice 3): the analysis runs and
// the window they cover together, the pillars the run still holds, its
// model, its error whole. The list endpoint replaced the latest-run-only
// read this page used to carry with a caveat about it.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useListGenerationRuns, getListGenerationRunsQueryKey } from "@workspace/api-client-react";
import { ModuleHeader, ModuleScopeGate, SectionCard, PendingState, CrossLink } from "../shared";
import { GenerationRunRow } from "@/components/loop/GenerationRunRow";
import { History } from "lucide-react";

const SECTION = "Strategy · 04";

export function StrategyHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { data } = useListGenerationRuns(account?.id ?? "", "strategy", {
    query: { queryKey: getListGenerationRunsQueryKey(account?.id ?? "", "strategy"), enabled: !!account },
  });
  const runs = (data?.runs ?? []).slice().sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const successes = runs.filter((r) => r.status === "success").length;
  const current = runs.find((r) => r.status === "success") ?? null;

  return (
    <ModuleScopeGate section={SECTION} title="History" account={account}>
      {() => (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ModuleHeader section={SECTION} title="History" accountName={account!.name} subtitle="Strategy generation runs for this account, and what each was built from." table="generation_runs" />
          <div className="px-6 py-5 space-y-4 max-w-3xl">
            {runs.length === 0 ? (
              <PendingState title="No runs yet" message="Generate strategy from the Strategy command center to see it here." icon={History} />
            ) : (
              <SectionCard
                title="Generation runs"
                desc={`${runs.length} run${runs.length === 1 ? "" : "s"} · ${successes} completed · the newest completed run is the current strategy`}
                right={current ? <CrossLink to="/app/strategy/overview" label="Open the current strategy" /> : undefined}
              >
                <div className="flex flex-col" data-testid="strategy-history-runs">
                  {runs.map((run) => (
                    <GenerationRunRow key={run.id} run={run} kind="strategy" />
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
