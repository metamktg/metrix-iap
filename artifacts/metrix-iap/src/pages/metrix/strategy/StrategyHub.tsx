// ─── Strategy · Hub (/app/strategy) ──────────────────────────────────
// Command center for the Strategy layer of the loop:
// pillar health, ICP count, generation status, quick links.

import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount,
  getStrategyData,
  getBriefBuilder,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader,
  ModuleScopeGate,
  PendingState,
  CrossLink,
  deriveLabel,
  InfoTooltip,
} from "../shared";
import {
  useGenerationRun,
  GenerateButton,
  ProvenanceBadge,
} from "@/components/generation/GenerationControls";
import { cn } from "@/lib/utils";
import {
  Compass,
  ArrowUpRight,
  CheckCircle2,
  Activity,
  Users,
  Map,
  FlaskConical,
} from "lucide-react";

const SECTION = "Strategy · 04";

export function StrategyHub() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const generation = useGenerationRun(adAccountId, "strategy");

  return (
    <ModuleScopeGate section={SECTION} title="Strategy" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const briefBuilder = getBriefBuilder(seed, adAccountId);

        const pillars = strategy?.message_pillars ?? [];
        const hypotheses = strategy?.active_hypotheses ?? [];
        const icpCount = strategy?.icp_profiles?.length ?? 0;
        const briefCount = briefBuilder?.draft_briefs?.length ?? 0;
        const hasStrategy = pillars.length > 0;

        const loopStatus = acct.iap?.loop_status ?? [];
        const strategyStage = loopStatus.find((s) => s.stage === "strategy");

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="Strategy"
              account={acct}
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-5xl">
              {/* Action row */}
              <div className="flex items-center justify-between gap-4">
                <p className={cn(TYPE.caption, "text-muted-foreground")}>
                  {acct.name} · {pillars.length} pillar
                  {pillars.length !== 1 ? "s" : ""} · {icpCount} ICP profile
                  {icpCount !== 1 ? "s" : ""}
                </p>
                <GenerateButton
                  onClick={generation.start}
                  isRunning={generation.isRunning}
                  label="Generate Strategy"
                  runningLabel="Generating…"
                />
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  {
                    label: "Message Pillars",
                    value: pillars.length,
                    icon: Map,
                    color: "text-primary",
                  },
                  {
                    label: "ICP Profiles",
                    value: icpCount,
                    icon: Users,
                    color: "text-[hsl(var(--metrix-cyan))]",
                  },
                  {
                    label: "Active Hypotheses",
                    value: hypotheses.filter((h) => h.status === "active").length,
                    icon: FlaskConical,
                    color: "text-[hsl(var(--metrix-gold))]",
                  },
                  {
                    label: "Briefs",
                    value: briefCount,
                    icon: Compass,
                    color: "text-[hsl(var(--metrix-success))]",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <kpi.icon className={cn("w-3 h-3", kpi.color)} />
                      <p className={cn(TYPE.label, "text-muted-foreground/70")}>
                        {kpi.label}
                      </p>
                    </div>
                    <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stage status */}
              {strategyStage && (
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border",
                    strategyStage.status === "complete"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-primary/5 border-primary/20",
                  )}
                >
                  {strategyStage.status === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Activity className="w-4 h-4 text-primary shrink-0" />
                  )}
                  <p className={cn(TYPE.body, "text-foreground font-semibold")}>
                    Strategy stage:{" "}
                    <span className="capitalize">{strategyStage.status}</span>
                  </p>
                  {generation.lastRun?.status === "success" && (
                    <ProvenanceBadge
                      provenance="generated"
                    />
                  )}
                </div>
              )}

              {/* Lead pillar */}
              {pillars[0] && (
                <div className="bg-card/60 border border-primary/25 rounded-xl px-4 py-3.5">
                  <p className={cn(TYPE.label, "text-primary mb-1.5")}>
                    Lead Message Pillar
                  </p>
                  <p className={cn(TYPE.body, "text-foreground font-semibold")}>
                    {pillars[0].label}
                  </p>
                  {pillars[0].plain_descriptor && (
                    <p className={cn(TYPE.caption, "text-muted-foreground mt-1 leading-relaxed")}>
                      {deriveLabel(pillars[0].plain_descriptor, 140)}
                    </p>
                  )}
                </div>
              )}

              {/* No strategy state */}
              {!hasStrategy && (
                <PendingState
                  title="Strategy not yet generated"
                  message="Run an IAP analysis first, then generate the strategy layer to unlock pillars, ICP profiles, and hypotheses."
                  icon={Compass}
                  action={
                    <CrossLink to="/app/analysis/overview" label="Go to Analysis" />
                  }
                />
              )}

              {/* Quick links */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    label: "Strategy Overview",
                    desc: "ICP grid + pillar pipeline",
                    href: "/app/strategy/overview",
                  },
                  {
                    label: "Avatars / ICP",
                    desc: `${icpCount} profile${icpCount !== 1 ? "s" : ""} on this account`,
                    href: "/app/strategy/avatars",
                  },
                  {
                    label: "Strategy Map",
                    desc: "Positioning + funnel structure",
                    href: "/app/strategy/map",
                  },
                  {
                    label: "Hypothesis Queue",
                    desc: "Active + pending hypotheses",
                    href: "/app/strategy/hypotheses",
                  },
                ].map((l) => (
                  <div
                    key={l.href}
                    className="bg-card/60 border border-border/60 rounded-xl hover:border-primary/30 hover:bg-card transition-colors group"
                  >
                    <div className="flex items-center gap-1 px-4 py-3">
                      <a
                        href={l.href}
                        className="flex-1 flex items-center justify-between gap-1 min-w-0"
                      >
                        <span className={cn(TYPE.body, "font-semibold text-foreground truncate")}>
                          {l.label}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </a>
                      <InfoTooltip content={l.desc} />
                    </div>
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
