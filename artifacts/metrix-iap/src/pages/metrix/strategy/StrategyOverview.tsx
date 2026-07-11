// ─── Strategy · Overview ──────────────────────────────────────────────
// Entry point for the Strategy section: pillar and hypothesis counts,
// compact pillar cards (click to expand full detail), scaling playbook,
// and jump-offs into each strategy subpage.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtNum,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote,
} from "@/components/generation/GenerationControls";
import {
  VariableStackChips, IcpChips, playbookHasContent,
  ScalingPlaybookLanes, PillarDetailSections,
} from "./strategyShared";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Compass, Map, Users, ListChecks, ChevronRight, Layers, ArrowRight } from "lucide-react";
import type { MessagePillar, ICPProfile } from "@/lib/data/seedTypes";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const SECTION = "Strategy · 04";

// ─── Pillar expand dialog ─────────────────────────────────────────────
// Full detail for one message pillar: descriptor, funnel/execution/
// placement/scaling sections, variable stack, ICP targets.

function PillarExpandDialog({
  pillar,
  profiles,
  open,
  onOpenChange,
}: {
  pillar: MessagePillar;
  profiles?: ICPProfile[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[hsl(222_61%_6%)] border-border/40 p-0 gap-0 overflow-hidden max-h-[88vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border/30">
          <span className="text-label-xs font-mono text-muted-foreground/50 uppercase tracking-widest block mb-1">
            {pillar.id}
          </span>
          <h2 className="text-base font-semibold text-foreground leading-snug">{pillar.label}</h2>
          <p className="text-body text-muted-foreground/70 leading-relaxed mt-1.5">{pillar.plain_descriptor}</p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {/* Variable stack */}
          {Object.keys(pillar.variable_stack ?? {}).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-label-xs font-mono uppercase tracking-widest text-muted-foreground/70">Variable stack</p>
              <VariableStackChips stack={pillar.variable_stack} />
            </div>
          )}

          {/* ICP targets inline (also shown inside PillarDetailSections, but surfaced here for prominence) */}
          {(pillar.target_icps?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-label-xs font-mono uppercase tracking-widest text-muted-foreground/70">Target ICPs</p>
              <IcpChips ids={pillar.target_icps} profiles={profiles} />
            </div>
          )}

          {/* All detail sections (funnel, execution, placement, scaling) */}
          <PillarDetailSections pillar={pillar} profiles={profiles} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compact pillar card ──────────────────────────────────────────────
// Shows ID + title + 2-line descriptor. Footer badges hint at depth
// available in the expanded dialog. Full detail on click.

function PillarCard({
  pillar,
  profiles,
}: {
  pillar: MessagePillar;
  profiles?: ICPProfile[];
}) {
  const [open, setOpen] = useState(false);
  const varCount  = Object.keys(pillar.variable_stack ?? {}).filter(([, v]) => Boolean(v)).length;
  const icpCount  = pillar.target_icps?.length ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "group text-left w-full rounded-xl border border-border/40 bg-white/[0.02]",
          "hover:border-primary/40 hover:bg-white/[0.035] hover:shadow-md hover:shadow-black/20 hover-elevate",
          "active:scale-[0.99] transition-all duration-150 flex flex-col p-4 gap-2.5 mx-card"
        )}
      >
        {/* ID + title row */}
        <div className="space-y-0.5">
          <span className="text-label-xs font-mono text-muted-foreground/70 block">{pillar.id}</span>
          <p className="text-body font-semibold text-foreground leading-snug line-clamp-2">{pillar.label}</p>
        </div>

        {/* Descriptor — 3-line clamp, no overflow */}
        <p className="text-body text-muted-foreground/85 leading-relaxed line-clamp-3 flex-1">
          {pillar.plain_descriptor}
        </p>

        {/* Footer: depth badges + expand cue */}
        <div className="flex items-center justify-between pt-1 border-t border-border/20">
          <div className="flex items-center gap-1.5">
            {varCount > 0 && (
              <span className="flex items-center gap-1 text-label-xs font-mono text-muted-foreground/50 border border-border/30 bg-white/[0.015] px-1.5 py-0.5 rounded leading-none">
                <Layers className="w-2.5 h-2.5" />
                {varCount} var{varCount !== 1 ? "s" : ""}
              </span>
            )}
            {icpCount > 0 && (
              <span className="flex items-center gap-1 text-label-xs font-mono text-muted-foreground/50 border border-border/30 bg-white/[0.015] px-1.5 py-0.5 rounded leading-none">
                <Users className="w-2.5 h-2.5" />
                {icpCount} ICP{icpCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <span className="flex items-center gap-0.5 text-label-xs font-medium text-muted-foreground/40 group-hover:text-primary/60 transition-colors">
            Details <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </button>

      <PillarExpandDialog
        pillar={pillar}
        profiles={profiles}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function StrategyOverview() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const generation = useGenerationRun(adAccountId, "strategy");
  const [, navigate] = useLocation();

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
              <ModuleHeader section={SECTION} title="Strategy Overview" />
              <ScopeBanner account={acct} />
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
                  <p className="text-label text-muted-foreground/70">
                    Strategy generation needs analysis data — run the analysis pipeline for this account first.
                  </p>
                )}
              </div>
            </div>
          );
        }

        const pillars    = strategy.message_pillars;
        const hypotheses = strategy.active_hypotheses;
        const testing    = hypotheses.filter((h) => h.status.toLowerCase().includes("test")).length;

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
              subtitle="The account's message strategy at a glance: pillars, hypotheses, and where they lead."
              table="message_pillars, active_hypotheses"
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
            <ScopeBanner account={acct} />
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
              <MetricTile label="Message pillars"    value={fmtNum(pillars.length)} />
              <MetricTile label="Active hypotheses"  value={fmtNum(hypotheses.length)} />
              <MetricTile label="In testing"         value={fmtNum(testing)} />
              <MetricTile label="Draft briefs"       value={fmtNum(briefs?.draft_briefs.length ?? 0)} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">

              {/* ── Message pillars — compact cards, full detail on click ── */}
              <SectionCard
                title="Message pillars"
                desc="Validated message directions this account's strategy stands on. Click any pillar to see the full detail."
                table="message_pillars"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {pillars.map((p) => (
                    <PillarCard
                      key={p.id}
                      pillar={p}
                      profiles={strategy.icp_profiles}
                    />
                  ))}
                </div>
                <div className="mt-3">
                  <CrossLink to="/app/strategy/map" label="See the full strategy map" />
                </div>
              </SectionCard>

              {/* ── Scaling playbook ── */}
              {playbookHasContent(strategy.scaling_playbook) && (
                <SectionCard
                  title="Scaling playbook"
                  desc="Where the analysis says to push, tune, prove, look next — and what to stay away from."
                  table="scaling_playbook"
                >
                  <ScalingPlaybookLanes playbook={strategy.scaling_playbook!} />
                </SectionCard>
              )}

              {/* ── Strategy modules nav ── */}
              <SectionCard title="Strategy modules" desc="Each module reads the same account strategy from a different angle.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {subpages.map((s) => (
                    <button
                      key={s.to}
                      onClick={() => navigate(s.to)}
                      className={cn(
                        "group text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2 mx-card",
                        "hover:border-primary/40 hover:bg-white/[0.035] hover:shadow-md hover:shadow-black/20 hover-elevate",
                        "active:scale-[0.99] transition-all duration-150"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-4 h-4 text-primary/80" />
                        <span className="text-body font-semibold text-foreground">{s.label}</span>
                      </div>
                      <p className="text-body text-muted-foreground/80 leading-relaxed flex-1">{s.desc}</p>
                      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/20">
                        <span className="text-label-xs font-mono text-muted-foreground/70">{s.stat}</span>
                        <span className="flex items-center gap-0.5 text-label-xs font-medium text-muted-foreground/60 group-hover:text-primary/80 transition-colors">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
