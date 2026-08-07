// ─── Creative Briefs · Hub (/app/briefs) ──────────────────────────────
// Command center for the Creative Briefs layer:
// pipeline status, recent briefs, generation controls.

import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import {
  HubTldrCard,
  HypothesisQueuePanel,
} from "../PerformanceIntelligence";
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
import { cn } from "@workspace/command-deck/lib/utils";
import { FileText, ArrowUpRight, CheckCircle2, Activity } from "lucide-react";

const SECTION = "Creative Briefs · 05";

const STATUS_BAR: Record<string, string> = {
  draft: "bg-border",
  "in-review": "bg-yellow-400",
  approved: "bg-primary",
  produced: "bg-[hsl(var(--metrix-cyan))]",
  archived: "bg-muted-foreground/20",
};

const STATUS_PILL: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border/40",
  "in-review": "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  approved: "bg-primary/10 text-interactive border-primary/20",
  produced:
    "bg-[hsl(var(--metrix-cyan)/0.12)] text-[hsl(var(--metrix-cyan))] border-[hsl(var(--metrix-cyan)/0.3)]",
  archived: "bg-muted text-muted-foreground/60 border-border/30",
};

function normalizeStatus(s: string) {
  return s?.toLowerCase().replace(/\s+/g, "-") ?? "draft";
}

export function BriefHub() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const generation = useGenerationRun(adAccountId, "briefs");

  return (
    <ModuleScopeGate section={SECTION} title="Creative Briefs" account={account}>
      {() => {
        const acct = account!;
        const briefBuilder = getBriefBuilder(seed, adAccountId);
        const briefs = briefBuilder?.draft_briefs ?? [];

        const activeBriefs = briefs.filter(
          (b) => normalizeStatus(b.status) !== "archived",
        );
        const draftCount = briefs.filter(
          (b) => normalizeStatus(b.status) === "draft",
        ).length;
        const approvedCount = briefs.filter(
          (b) => normalizeStatus(b.status) === "approved",
        ).length;
        const producedCount = briefs.filter(
          (b) => normalizeStatus(b.status) === "produced",
        ).length;
        const inReviewCount = briefs.filter(
          (b) => normalizeStatus(b.status) === "in-review",
        ).length;

        const loopStatus = acct.iap?.loop_status ?? [];
        const briefsStage = loopStatus.find((s) => s.stage === "briefs");

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="Creative Briefs"
              account={acct}
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-5xl">
              {/* Action row */}
              <div className="flex items-center justify-between gap-4">
                <p className={cn(TYPE.caption, "text-muted-foreground")}>
                  {briefs.length} brief{briefs.length !== 1 ? "s" : ""} · {activeBriefs.length} active
                </p>
                <GenerateButton
                  onClick={() => generation.start()}
                  isRunning={generation.isRunning}
                  label="Generate Briefs"
                  runningLabel="Generating…"
                />
              </div>

              {/* Pipeline KPI strip */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: "Draft", value: draftCount, color: "text-muted-foreground" },
                  { label: "In Review", value: inReviewCount, color: "text-yellow-400" },
                  { label: "Approved", value: approvedCount, color: "text-interactive" },
                  { label: "Produced", value: producedCount, color: "text-[hsl(var(--metrix-success))]" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <p className={cn(TYPE.label, "text-muted-foreground/70 mb-1")}>
                      {kpi.label}
                    </p>
                    <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stage status */}
              {briefsStage && (
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border",
                    briefsStage.status === "complete"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-primary/5 border-primary/20",
                  )}
                >
                  {briefsStage.status === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Activity className="w-4 h-4 text-interactive shrink-0" />
                  )}
                  <p className={cn(TYPE.body, "text-foreground font-semibold")}>
                    Stage: <span className="capitalize">{briefsStage.status}</span>
                  </p>
                  {generation.lastRun?.status === "success" && (
                    <ProvenanceBadge provenance="generated" />
                  )}
                </div>
              )}

              {/* Active pipeline */}
              {activeBriefs.length === 0 ? (
                <PendingState
                  title="No briefs yet"
                  message="Generate briefs from a completed strategy run, or create one manually in the Brief Builder."
                  icon={FileText}
                  action={
                    <CrossLink to="/app/briefs/builder" label="Go to Brief Builder" />
                  }
                />
              ) : (
                <div className="bg-card/60 border border-border/60 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-border/40">
                    <p className={cn(TYPE.label, "text-muted-foreground/70")}>
                      Active pipeline
                    </p>
                    <a
                      href="/app/briefs/builder"
                      className={cn(
                        TYPE.caption,
                        "text-interactive hover:text-primary/80 transition-colors flex items-center gap-1",
                      )}
                    >
                      All briefs <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="divide-y divide-border/30">
                    {activeBriefs.slice(0, 6).map((brief) => {
                      const ns = normalizeStatus(brief.status);
                      return (
                        <a
                          key={brief.id}
                          href="/app/briefs/builder"
                          className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group"
                        >
                          <div
                            className={cn(
                              "w-1 h-8 rounded-full shrink-0",
                              STATUS_BAR[ns] ?? "bg-border",
                            )}
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={cn(TYPE.body, "font-semibold text-foreground truncate")}>
                                {brief.source_pillar}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-label px-1.5 py-0.5 rounded border font-semibold leading-none capitalize",
                                  STATUS_PILL[ns] ?? STATUS_PILL.draft,
                                )}
                              >
                                {brief.status}
                              </span>
                            </div>
                            {brief.human_direction && (
                              <p className={cn(TYPE.caption, "text-muted-foreground truncate")}>
                                {deriveLabel(brief.human_direction, 80)}
                              </p>
                            )}
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    label: "Brief Builder",
                    desc: "Create + edit briefs from strategy",
                    href: "/app/briefs/builder",
                  },
                  {
                    label: "History",
                    desc: "All generated + archived briefs",
                    href: "/app/briefs/history",
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

              {/* Performance Intelligence — panels self-guard on their own data */}
              <section aria-label="Performance Intelligence" className="space-y-4">
                <HubTldrCard accountId={adAccountId!} />
                <HypothesisQueuePanel accountId={adAccountId!} />
              </section>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
