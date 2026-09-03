// ─── Strategy · Command Center ──────────────────────────────────────────
// The parent /app/strategy route. Execution (generate strategy from
// analysis) + a run-history card + the loop-hub nav — no charts.
// Hard-gated on a successful Analysis run. Analytical depth lives only in
// the child pages.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ModuleScopeGate, PrerequisiteGate, SectionCard,
  StageLoopHub, buildLoopStages, CrossLink, MetricTile, fmtNum, HubNavGrid,
} from "../shared";
import {
  useGenerationRun, GenerateButton, GenerationErrorNote, ProvenanceBadge, GenerationProgressBar,
} from "@/components/generation/GenerationControls";
import { Map, Users, MessageSquare, ListChecks, History, Compass, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { RecommendationSlider } from "@/components/deck/RecommendationSlider";
import { deriveRecommendations, recommendationsForStage } from "@/lib/data/recommendations";

const SECTION = "Strategy · 04";

const CHILDREN = [
  { to: "/app/strategy/overview", label: "Overview", Icon: Compass, desc: "The high-level configurable strategy view.", lineage: "strategy.* · composed" },
  { to: "/app/strategy/map", label: "Strategy Map", Icon: Map, desc: "How pillars, source cells, and hypotheses connect.", lineage: "strategy.message_pillars[] · source_cells" },
  { to: "/app/strategy/avatars", label: "Avatars / ICP / PMF", Icon: Users, desc: "The customer profiles the matrix targets.", lineage: "strategy.icp_profiles[]" },
  { to: "/app/strategy/communications", label: "Communications", Icon: MessageSquare, desc: "Who's responding, to what, and why.", lineage: "strategy.message_pillars[]" },
  { to: "/app/strategy/hypotheses", label: "Hypothesis Queue", Icon: ListChecks, desc: "Active hypotheses and validation status.", lineage: "strategy.active_hypotheses[]" },
  { to: "/app/strategy/history", label: "History", Icon: History, desc: "Past strategy generation runs.", lineage: "generation_runs → strategy" },
];

export function StrategyCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const generation = useGenerationRun(account?.id ?? null, "strategy");
  const strategy = getStrategyData(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Strategy" account={account}>
      {() => {
        const acct = account!;
        // Strategy unlocks once the analysis data is VALIDATED — the
        // server-side completeness check confirming every analysis surface
        // (tiles, demographics, placements, …) actually has rows.
        //
        // WHY NOT "a successful run". `status.analysis.status` reports the
        // latest MANUAL analysis run, and an importer account has never had
        // one: getLatestAnalysisRun() reads manual_analysis_runs, falling
        // back to report_pulls for live-Meta accounts and to null for
        // everything imported. So this page told bookster "this account
        // doesn't have a completed analysis run yet" directly beneath tiles
        // reading 3 message pillars, 4 hypotheses and 4 ICP profiles, and
        // beneath a recommendation naming $32.15 per result — every one of
        // them computed from the analysis rows the gate said were missing.
        // verifyAnalysisRunCompleteness() already handles those accounts
        // account-wide, which is exactly why `validated` is the honest
        // predicate and the run record is not. A run in flight or failed
        // still holds the gate: its rows are mid-rewrite.
        // `validated` alone decides: a successful run whose surfaces came up
        // short must still hold the gate, so run success is not a second,
        // independent ticket through it.
        const analysisRunning = status.analysis.status === "running";
        const analysisOk = !analysisRunning && status.analysis.validated === true;
        const gateMessage = analysisRunning
          ? "An analysis run is in progress. Strategy generation reads its output, so it unlocks when the run finishes."
          : status.analysis.status === "success"
            ? "The latest analysis run finished, but not every analysis surface has validated data yet. Check the Analysis completeness report before generating strategy."
            : "Strategy generation reads validated analysis data, and this account has none yet.";
        const run = generation.lastRun;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Strategy"
              accountName={acct.name}
              subtitle="Turn validated analysis into message pillars and testing hypotheses."
              right={<ProvenanceBadge provenance={strategy?.provenance} />}
            />
            <StageLoopHub stages={buildLoopStages(status)} current="strategy" />

            {/* One column width across all four command centres (MST's, the
                widest content, sets it): a reader walking Listen → Analysis →
                Strategy → Creative → MST saw the content column jump between
                three widths, and the same "Execution card" pattern render
                2-across on one stage and 4-across on the next. */}
            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {/* Direction for this stage, from the account's own rows —
                  each tile carries the number behind it and a link to the
                  surface that proves it. Absent when this stage has none. */}
              {(() => { const stageRecs = recommendationsForStage(deriveRecommendations(acct), 3); return stageRecs.length > 0 ? <RecommendationSlider recs={stageRecs} title="What the data says to do next" /> : null; })()}

              {/* Execution card: verb title + input-metric tiles + primary action —
                  canvas's Command Center Execution-card pattern. The tile grid stays
                  unconditional on real strategy data (as it always has), independent
                  of whether generation itself is currently gated. */}
              <SectionCard title="Generate strategy" desc="Runs the Metrix engine over this account's analysis data. Generated pillars/hypotheses fully replace the prior generated set.">
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
                  title="Run analysis first"
                  message={gateMessage}
                  ctaLabel="Go to Analysis"
                  ctaTo="/app/analysis"
                >
                  {() => (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-caption text-muted-foreground/75">
                          {strategy && strategy.message_pillars.length > 0
                            ? `${strategy.message_pillars.length} message pillars currently active.`
                            : "No strategy generated yet."}
                        </span>
                        <GenerateButton
                          onClick={generation.start}
                          isRunning={generation.isRunning}
                          label={strategy && strategy.message_pillars.length > 0 ? "Regenerate strategy" : "Generate from analysis"}
                          runningLabel="Generating…"
                        />
                      </div>
                      <div className="mt-3 space-y-3">
                        <GenerationProgressBar
                          isRunning={generation.isRunning}
                          progressPercent={generation.progressPercent}
                          elapsedSeconds={generation.elapsedSeconds}
                          typicalSeconds={generation.typicalSeconds}
                          stageLabel={generation.progressStage ?? "Generating strategy from validated analysis…"}
                        />
                        <GenerationErrorNote message={generation.lastError} />
                      </div>
                    </>
                  )}
                </PrerequisiteGate>
              </SectionCard>

              {/* Run history card: the backend retains only the latest run per
                  account+kind today (no run-list endpoint yet) — one real row,
                  not a fabricated multi-run log. See History for the full detail. */}
              <SectionCard
                title="Run history"
                desc="Most recent strategy generation run for this account"
                right={<CrossLink to="/app/strategy/history" label="Full history" />}
              >
                {!run ? (
                  <p className="text-caption text-muted-foreground/75">No generation runs yet for this account.</p>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-foreground/[0.015] px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {run.status === "running" && <Loader2 className="w-4 h-4 text-status-warning animate-spin shrink-0" />}
                      {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />}
                      {run.status === "error" && <XCircle className="w-4 h-4 text-status-danger shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-body font-medium text-foreground/90 capitalize truncate">
                          {run.status}
                          <span className="ml-2 text-caption font-normal text-muted-foreground/75 normal-case">{run.id}</span>
                        </p>
                        <p className="text-caption text-muted-foreground/75">
                          {new Date(run.started_at).toLocaleString()}
                          {run.model ? ` · ${run.model}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </SectionCard>

              <HubNavGrid items={CHILDREN} label="Explore Strategy" />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
