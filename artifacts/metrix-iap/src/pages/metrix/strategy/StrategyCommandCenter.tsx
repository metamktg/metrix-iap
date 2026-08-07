// ─── Strategy · Command Center ──────────────────────────────────────────
// The parent /app/strategy route. Execution (generate strategy from
// analysis) + the loop-hub nav — no charts. Hard-gated on a successful
// Analysis run. Analytical depth lives only in the child pages.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PrerequisiteGate, SectionCard,
  StageLoopHub, buildLoopStages, CrossLink, MetricTile, fmtNum,
} from "../shared";
import {
  useGenerationRun, GenerateButton, GenerationErrorNote, ProvenanceBadge,
} from "@/components/generation/GenerationControls";
import { Map, Users, MessageSquare, ListChecks, History, Compass } from "lucide-react";

const SECTION = "Strategy · 04";

const CHILDREN = [
  { to: "/app/strategy/overview", label: "Overview", Icon: Compass, desc: "The high-level configurable strategy view." },
  { to: "/app/strategy/map", label: "Strategy Map", Icon: Map, desc: "How pillars, source cells, and hypotheses connect." },
  { to: "/app/strategy/avatars", label: "Avatars / ICP / PMF", Icon: Users, desc: "The customer profiles the matrix targets." },
  { to: "/app/strategy/communications", label: "Communications", Icon: MessageSquare, desc: "Who's responding, to what, and why." },
  { to: "/app/strategy/hypotheses", label: "Hypothesis Queue", Icon: ListChecks, desc: "Active hypotheses and validation status." },
  { to: "/app/strategy/history", label: "History", Icon: History, desc: "Past strategy generation runs." },
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
        const analysisOk = status.analysis.status === "success";
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Strategy"
              subtitle="Turn validated analysis into message pillars and testing hypotheses."
              right={<ProvenanceBadge provenance={strategy?.provenance} />}
            />
            <ScopeBanner account={acct} />
            <StageLoopHub stages={buildLoopStages(status)} current="strategy" />

            {strategy && (
              <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                <MetricTile label="Message pillars" value={fmtNum(strategy.message_pillars.length)} variant="primary" />
                <MetricTile label="Active hypotheses" value={fmtNum(strategy.active_hypotheses.length)} />
                <MetricTile label="ICP profiles" value={fmtNum(strategy.icp_profiles?.length ?? 0)} />
                <MetricTile label="Ready for brief" value={fmtNum(strategy.active_hypotheses.filter((h) => h.status === "ready_for_brief_builder").length)} />
              </div>
            )}

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <PrerequisiteGate
                met={analysisOk}
                title="Run analysis first"
                message="Strategy generation reads validated analysis data — this account doesn't have a completed analysis run yet."
                ctaLabel="Go to Analysis"
                ctaTo="/app/analysis"
              >
                {() => (
                  <SectionCard title="Generate strategy" desc="Runs the Metrix engine over this account's analysis data. Generated pillars/hypotheses fully replace the prior generated set.">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground/75">
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
                    <div className="mt-3">
                      <GenerationErrorNote message={generation.lastError} />
                    </div>
                  </SectionCard>
                )}
              </PrerequisiteGate>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CHILDREN.map((c) => (
                  <div key={c.to} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <c.Icon className="w-4 h-4 text-interactive shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-foreground">{c.label}</div>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{c.desc}</p>
                      </div>
                    </div>
                    <CrossLink to={c.to} label="Open" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
