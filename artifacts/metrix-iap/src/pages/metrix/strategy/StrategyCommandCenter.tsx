// ─── Strategy · Command Center ──────────────────────────────────────────
// The parent /app/strategy route, on the Execution Layer shell (StageLayout,
// sweep spec §3, slice 3): header · spine · pages · status hub · execution
// card · direction rail · run history. Execution (generate strategy from
// analysis) and the loop-hub nav; no charts. Hard-gated on validated
// Analysis data. Analytical depth lives only in the child pages.
//
// The run is manually executed, never automatic (§5.1, owner correction
// 2026-09-05): a strategy run starts only when the reader presses Generate
// here, built on whichever analysis run(s) the base-run picker names,
// which defaults to the latest successful analysis run; the reader sees
// the base before pressing and can change it, and the run that results is
// the account's current strategy. Changing the picker changes what the
// NEXT press builds, and nothing until it is pressed.

import { useEffect, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import type { AdAccount } from "@/lib/data/seedTypes";
import { useStageStatus } from "@/hooks/useStageStatus";
import { ModuleScopeGate, PrerequisiteGate, SectionCard, CrossLink, MetricTile, fmtNum, type HubNavItem } from "../shared";
import { StageLayout } from "../StageLayout";
import { useGenerationRun, GenerateButton, ProvenanceBadge } from "@/components/generation/GenerationControls";
import { BaseRunPicker, STRATEGY_BASE_RUN_PAGE_KEY } from "@/components/loop/BaseRunPicker";
import { usePersistedRunScope } from "@/lib/run-scope";
import { buildStrategyHub } from "@/lib/loop/statusHub";
import { GenerationRunRow } from "@/components/loop/GenerationRunRow";
import {
  useListAnalysisRuns, getListAnalysisRunsQueryKey,
  useListGenerationRuns, getListGenerationRunsQueryKey,
} from "@workspace/api-client-react";
import { Map, Users, MessageSquare, ListChecks, History, Compass } from "lucide-react";
import { deriveRecommendations, recommendationsForStage } from "@/lib/data/recommendations";

const SECTION = "Strategy · 04";
const HISTORY_TO = "/app/strategy/history";

const CHILDREN: HubNavItem[] = [
  { to: "/app/strategy/overview", label: "Overview", Icon: Compass, desc: "The high-level configurable strategy view.", lineage: "strategy.* · composed" },
  { to: "/app/strategy/map", label: "Strategy Map", Icon: Map, desc: "How pillars, source cells, and hypotheses connect.", lineage: "strategy.message_pillars[] · source_cells" },
  { to: "/app/strategy/avatars", label: "Avatars / ICP / PMF", Icon: Users, desc: "The customer profiles the matrix targets.", lineage: "strategy.icp_profiles[]" },
  { to: "/app/strategy/communications", label: "Communications", Icon: MessageSquare, desc: "Who's responding, to what, and why.", lineage: "strategy.message_pillars[]" },
  { to: "/app/strategy/hypotheses", label: "Hypothesis Queue", Icon: ListChecks, desc: "Active hypotheses and validation status.", lineage: "strategy.active_hypotheses[]" },
  { to: HISTORY_TO, label: "History", Icon: History, desc: "Every strategy generation run and what it was built from.", lineage: "generation_runs → strategy" },
];

export function StrategyCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Strategy" account={account}>
      {() => <StrategyStage account={account!} />}
    </ModuleScopeGate>
  );
}

/** The page behind the scope gate; every account-scoped hook lives here. */
function StrategyStage({ account: acct }: { account: AdAccount }) {
  const seed = useMetrixSeed();
  const status = useStageStatus(acct.id);
  const generation = useGenerationRun(acct.id, "strategy");
  const strategy = getStrategyData(seed, acct.id);
  const { data: analysisRunsData } = useListAnalysisRuns(acct.id, { query: { queryKey: getListAnalysisRunsQueryKey(acct.id) } });
  const { data: runsData } = useListGenerationRuns(acct.id, "strategy", { query: { queryKey: getListGenerationRunsQueryKey(acct.id, "strategy") } });
  const analysisRuns = analysisRunsData?.runs;
  const runs = runsData?.runs ?? [];
  // The base for the NEXT run (§5.1): shared with the Account Overview's
  // chain through one persisted key; the latest successful run by default.
  const [selection, setSelection] = usePersistedRunScope(STRATEGY_BASE_RUN_PAGE_KEY, acct.id, analysisRuns, true, "latest-success");

  // From the Generate click until the server's run row exists, the hub
  // shows the pre-flight so the click is never followed by nothing (§4.1).
  const starting = generation.isRunning && generation.lastRun?.status !== "running";
  const inFlight = starting || generation.lastRun?.status === "running";
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!inFlight) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [inFlight]);

  // Strategy unlocks once the analysis data is VALIDATED, the server-side
  // completeness check confirming every analysis surface has rows. An
  // importer account has never had a manual run, so the run record is not
  // the predicate; `validated` is (see loop-gates-read-data-not-runs.test).
  // A run in flight or failed still holds the gate: its rows are mid-rewrite.
  const analysisRunning = status.analysis.status === "running";
  const analysisOk = !analysisRunning && status.analysis.validated === true;
  const gateMessage = analysisRunning
    ? "An analysis run is in progress. Strategy generation reads its output, so it unlocks when the run finishes."
    : status.analysis.status === "success"
      ? "The latest analysis run finished, but not every analysis surface has validated data yet. Check the Analysis completeness report before generating strategy."
      : "Generating a new strategy needs a validated analysis run, and this account has not had one yet. The strategy shown above was imported and stays readable on the Strategy pages.";

  const hub = buildStrategyHub({
    runs,
    latest: generation.lastRun,
    selection,
    analysisRuns: analysisRuns ?? [],
    strategy: strategy
      ? { provenance: strategy.provenance, pillars: strategy.message_pillars.length, hypotheses: strategy.active_hypotheses.length }
      : null,
    starting,
    nowMs,
    historyTo: HISTORY_TO,
  });

  const recentRuns = (runs.length > 0 ? runs : generation.lastRun ? [generation.lastRun] : [])
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 3);

  return (
    <StageLayout
      stage="strategy"
      section={SECTION}
      title="Strategy"
      accountName={acct.name}
      subtitle="Turn validated analysis into message pillars and testing hypotheses. Never runs automatically."
      headerRight={<ProvenanceBadge provenance={strategy?.provenance} />}
      status={status}
      hub={hub}
      hubLabel="Strategy status"
      execution={
        <SectionCard title="Generate strategy" desc="Runs the Metrix engine over the analysis run(s) chosen below. Generated pillars and hypotheses fully replace the prior generated set.">
          {strategy && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <MetricTile label="Message pillars" value={fmtNum(strategy.message_pillars.length)} variant="primary" />
              <MetricTile label="Active hypotheses" value={fmtNum(strategy.active_hypotheses.length)} />
              <MetricTile label="ICP profiles" value={fmtNum(strategy.icp_profiles?.length ?? 0)} />
              <MetricTile label="Ready for brief" value={fmtNum(strategy.active_hypotheses.filter((h) => h.status === "ready_for_brief_builder").length)} />
            </div>
          )}
          <PrerequisiteGate
            met={analysisOk}
            loading={status.isLoading}
            title="Run analysis first"
            message={gateMessage}
            ctaLabel="Go to Analysis"
            ctaTo="/app/analysis"
          >
            {() => (
              <div className="space-y-3">
                <BaseRunPicker runs={analysisRuns ?? []} value={selection} onChange={setSelection} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption text-muted-foreground/75">
                    {strategy && strategy.message_pillars.length > 0
                      ? `${strategy.message_pillars.length} message pillars currently active.`
                      : "No strategy generated yet."}
                  </span>
                  <GenerateButton
                    onClick={() =>
                      generation.start(
                        selection.allTime ? { analysis_all_time: true } : { analysis_run_ids: selection.selectedRunIds },
                      )
                    }
                    isRunning={generation.isRunning}
                    label={strategy && strategy.message_pillars.length > 0 ? "Regenerate strategy" : "Generate from analysis"}
                    runningLabel="Generating…"
                  />
                </div>
                {/* The run's progress and its failure render in the status
                    hub above (§4); the card keeps the trigger and its base. */}
              </div>
            )}
          </PrerequisiteGate>
        </SectionCard>
      }
      recommendations={recommendationsForStage(deriveRecommendations(acct), 3)}
      explore={CHILDREN}
      exploreLabel="Strategy pages"
    >
      <SectionCard
        title="Run history"
        desc="Most recent strategy generation runs for this account, and what each was built from."
        right={<CrossLink to={HISTORY_TO} label="Full history" />}
      >
        {recentRuns.length === 0 ? (
          <p className="text-caption text-muted-foreground/75">No generation runs yet for this account.</p>
        ) : (
          <div className="flex flex-col">
            {recentRuns.map((run) => (
              <GenerationRunRow key={run.id} run={run} kind="strategy" />
            ))}
          </div>
        )}
      </SectionCard>
    </StageLayout>
  );
}
