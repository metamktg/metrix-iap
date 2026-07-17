// ─── Strategy · Overview ──────────────────────────────────────────────
// Entry point for the Strategy section: pillar and hypothesis counts,
// the pillar summaries, and jump-offs into each strategy subpage.

import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtNum, LoopAction,
  RangeScopeBar, NoDataInRangeState, DetailReveal, deriveLabel,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote,
} from "@/components/generation/GenerationControls";
import { VariableStackChips, IcpChips, playbookHasContent, ScalingPlaybookLanes } from "./strategyShared";
import { splitTitle } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { Compass, Map, Users, ListChecks } from "lucide-react";

const SECTION = "Strategy · 04";

export function StrategyOverview() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const generation = useGenerationRun(adAccountId, "strategy");

  return (
    <ModuleScopeGate section={SECTION} title="Strategy Overview" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const briefs = getBriefBuilder(seed, adAccountId);
        const hasAnalysis = (getAdAccount(seed, adAccountId)?.iap ?? null) !== null;

        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Strategy Overview" tabs="strategy" account={acct} />
              <PendingState title="No strategy yet" message="Strategy pillars derive from validated analysis reads." icon={Compass} />
              <div className="px-6 pb-6 space-y-3 max-w-lg mx-auto w-full text-center">
                <GenerationErrorNote message={generation.lastError} />
                {hasAnalysis ? (
                  <GenerateButton
                    onClick={generation.start}
                    isRunning={generation.isRunning}
                    label="Generate strategy from analysis"
                    runningLabel="Generating strategy…"
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground/70">
                    Strategy generation needs analysis data — run the analysis pipeline for this account first.
                  </p>
                )}
              </div>
            </div>
          );
        }

        const pillars = strategy.message_pillars;
        const hypotheses = strategy.active_hypotheses;
        const testing = hypotheses.filter((h) => h.status.toLowerCase().includes("test")).length;

        const subpages = [
          {
            to: "/app/strategy/map",
            label: "Strategy Map",
            Icon: Map,
            desc: "How pillars, source cells, and hypotheses connect.",
            stat: `${pillars.length} pillars mapped`,
          },
          {
            to: "/app/strategy/avatars",
            label: "Avatars / ICP",
            Icon: Users,
            desc: "The customer profiles the matrix targets, with their demographic reads.",
            stat: "From matrix columns",
          },
          {
            to: "/app/strategy/hypotheses",
            label: "Hypothesis Queue",
            Icon: ListChecks,
            desc: "Active hypotheses and their validation status.",
            stat: `${hypotheses.length} active`,
          },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Strategy Overview"
              subtitle="Pillars · hypotheses · next moves"
              table="message_pillars, active_hypotheses"
              tabs="strategy"
              account={acct}
              right={
                <div className="flex items-center gap-2">
                  <ProvenanceBadge provenance={strategy.provenance} />
                  {hasAnalysis && (
                    <GenerateButton
                      onClick={generation.start}
                      isRunning={generation.isRunning}
                      label={strategy.provenance === "generated" ? "Regenerate strategy" : "Generate from analysis"}
                      runningLabel="Generating…"
                    />
                  )}
                </div>
              }
            />
            <RangeScopeBar grainNote="Strategy derives from the account's full flight window — this import has no daily grain." />
            {generation.lastError && (
              <div className="px-6 pt-4">
                <GenerationErrorNote message={generation.lastError} />
              </div>
            )}

            {!rangeHasData ? (
              <NoDataInRangeState what="strategy data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Message pillars" value={fmtNum(pillars.length)} />
              <MetricTile label="Active hypotheses" value={fmtNum(hypotheses.length)} />
              <MetricTile label="In testing" value={fmtNum(testing)} />
              <MetricTile label="Draft briefs" value={fmtNum(briefs?.draft_briefs.length ?? 0)} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              <SectionCard title="Message pillars" desc="Validated message directions" table="message_pillars">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {pillars.map((p, i) => {
                    const t = splitTitle(p.label);
                    return (
                    <div key={p.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2">
                      <span className="text-[10px] font-semibold text-muted-foreground/50 tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div title={t.qualifier ? p.label : undefined}>
                        <p className="text-[13px] font-semibold text-foreground leading-tight line-clamp-1">{t.main}</p>
                        {t.qualifier && <p className={cn(TYPE.caption, "line-clamp-1 mt-0.5")}>{t.qualifier}</p>}
                      </div>
                      <DetailReveal
                        label={deriveLabel(p.plain_descriptor, 72)}
                        labelClassName={TYPE.caption}
                        eyebrow={p.label}
                        sections={[
                          { label: "Descriptor", text: p.plain_descriptor },
                          { label: "Funnel application", text: p.funnel_application ?? undefined },
                        ]}
                      />
                      <div className="mt-auto pt-1 space-y-1.5">
                        <VariableStackChips stack={p.variable_stack} />
                        <IcpChips ids={p.target_icps} profiles={strategy.icp_profiles} />
                      </div>
                    </div>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <CrossLink to="/app/strategy/map" label="See the full strategy map" />
                </div>
              </SectionCard>

              {playbookHasContent(strategy.scaling_playbook) && (
                <SectionCard
                  title="Scaling playbook"
                  desc="Push · tune · prove · watch · avoid"
                  table="scaling_playbook"
                >
                  <ScalingPlaybookLanes playbook={strategy.scaling_playbook!} />
                </SectionCard>
              )}

              <SectionCard title="Strategy modules" desc="Same strategy · different angles">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {subpages.map((s) => (
                    <div key={s.to} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[13px] font-semibold text-foreground">{s.label}</span>
                      </div>
                      <p className={TYPE.caption}>{s.desc}</p>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-[10px] font-mono text-muted-foreground/70">{s.stat}</span>
                        <CrossLink to={s.to} label="Open" />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <div className="flex items-center gap-3 pt-1">
                <LoopAction to="/app/briefs/builder" label="Draft briefs from this strategy" icon="brief" />
              </div>
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
