// ─── Strategy · Overview ──────────────────────────────────────────────
// Pillar-strength dashboard: coverage bars, hypothesis status donut,
// variable-family heatmap, enhanced pillar cards, and scaling playbook
// restructured with per-lane disclosure.

import { useState } from "react";
import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getBriefBuilder, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { RunScopePicker } from "@/components/analysis/RunSelector";
import { useCellRunScope, usePersistedRunScope } from "@/lib/run-scope";
import { useListAnalysisRuns, getListAnalysisRunsQueryKey } from "@workspace/api-client-react";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtNum, LoopAction,
  DetailReveal, deriveLabel, InfoTooltip, SkeletonBlock, SectionInfoIcon,
} from "../shared";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote,
} from "@/components/generation/GenerationControls";
import { VariableStackChips, IcpChips, NormalizedRefItem, playbookHasContent, HypothesisStatusBadge } from "./strategyShared";
import { splitTitle } from "@/lib/normalize";
import { cn } from "@workspace/command-deck/lib/utils";
import { Compass, Map, Users, ListChecks, ChevronDown } from "lucide-react";
import { SharePieChart } from "@/components/charts/SharePieChart";
import { PREFIX_COLORS, getVariablePrefix, resolveVariableLabel } from "@/lib/variable-registry";
import type { MessagePillar, ActiveHypothesis } from "@/lib/data/seedTypes";

const SECTION = "Strategy · 04";

// ─── Confidence tier (derived from source cell count) ────────────────

function pillarTier(cells: string[]): "high" | "medium" | "low" {
  if (cells.length >= 3) return "high";
  if (cells.length >= 1) return "medium";
  return "low";
}

const TIER_STYLE: Record<string, string> = {
  high:   "bg-status-success/10 text-status-success border-status-success/20",
  medium: "bg-status-warning/10 text-status-warning border-status-warning/20",
  low:    "bg-muted text-muted-foreground/75 border-border/40",
};

const TIER_LABEL: Record<string, string> = {
  high:   "High",
  medium: "Med",
  low:    "Low",
};

// ─── Variable family definitions ─────────────────────────────────────

const VAR_FAMILIES: { key: string; label: string; abbrev: string }[] = [
  { key: "hook",       label: "Hook",      abbrev: "HK"  },
  { key: "tone",       label: "Tone",      abbrev: "TN"  },
  { key: "framework",  label: "Framework", abbrev: "FW"  },
  { key: "concept",    label: "Concept",   abbrev: "CN"  },
  { key: "proof",      label: "Proof",     abbrev: "PR"  },
  { key: "pain_proof", label: "Pain pt.",  abbrev: "PP"  },
  { key: "cta",        label: "CTA",       abbrev: "CTA" },
];

// ─── Pillar coverage strip ────────────────────────────────────────────
// CSS bars (no recharts needed) — click anchors to the pillar card below.

function PillarCoverageStrip({
  pillars,
  hypothesesFor,
}: {
  pillars: MessagePillar[];
  hypothesesFor: (id: string) => ActiveHypothesis[];
}) {
  const maxCells = Math.max(...pillars.map((p) => p.source_cells.length), 1);
  return (
    <div className="space-y-2.5" aria-label="Pillar coverage — source cell count">
      {pillars.map((p, i) => {
        const t = splitTitle(p.label);
        const tier = pillarTier(p.source_cells);
        const hypCount = hypothesesFor(p.id).length;
        const pct = (p.source_cells.length / maxCells) * 100;
        return (
          <div
            key={p.id}
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() =>
              document
                .getElementById(`pillar-${p.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            title={`${t.main}${t.qualifier ? ` — ${t.qualifier}` : ""} · ${p.source_cells.length} source cell${p.source_cells.length !== 1 ? "s" : ""}`}
          >
            <span className={cn(TYPE.label, "w-5 text-right tabular-nums shrink-0")}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className={cn(TYPE.caption, "font-medium text-foreground/80 truncate group-hover:text-foreground transition-colors")}>
                  {t.main}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn("text-label font-semibold border px-1.5 py-0.5 rounded leading-none", TIER_STYLE[tier])}>
                    {p.source_cells.length} cell{p.source_cells.length !== 1 ? "s" : ""}
                  </span>
                  {hypCount > 0 && (
                    <span className={cn(TYPE.label, "text-muted-foreground/75 tabular-nums")}>
                      {hypCount} hyp
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300"
                  style={{
                    width: `${pct}%`,
                    background:
                      tier === "high"
                        ? "hsl(var(--metrix-success) / 0.8)"
                        : tier === "medium"
                          ? "hsl(var(--metrix-gold) / 0.8)"
                          : "hsl(var(--foreground) / 0.18)",
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-3 pt-1 flex-wrap">
        {(["high", "medium", "low"] as const).map((tier) => (
          <div key={tier} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background:
                  tier === "high"
                    ? "hsl(var(--metrix-success) / 0.8)"
                    : tier === "medium"
                      ? "hsl(var(--metrix-gold) / 0.8)"
                      : "hsl(var(--foreground) / 0.18)",
              }}
            />
            <span className={TYPE.label}>{TIER_LABEL[tier]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Variable family × pillar heatmap ────────────────────────────────
// Grid: rows = variable families, columns = pillars.
// Each cell = filled indicator if that pillar's variable_stack uses the family.

function VariableFamilyHeatmap({ pillars }: { pillars: MessagePillar[] }) {
  // Only show families that appear in at least one pillar
  const activeFamilies = VAR_FAMILIES.filter((f) =>
    pillars.some((p) => Boolean(p.variable_stack[f.key]))
  );
  if (activeFamilies.length === 0) return null;

  return (
    <div className="overflow-x-auto" aria-label="Variable family by pillar heatmap">
      <div style={{ minWidth: Math.max(300, pillars.length * 52 + 80) }}>
        {/* Header: pillar index numbers */}
        <div
          className="grid gap-1 mb-2"
          style={{ gridTemplateColumns: `80px repeat(${pillars.length}, 1fr)` }}
        >
          <div />
          {pillars.map((p, i) => (
            <div
              key={p.id}
              className={cn(TYPE.label, "text-center")}
              title={p.label}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
          ))}
        </div>

        {/* Rows: one per family */}
        {activeFamilies.map((f) => {
          const familyUsed = pillars.filter((p) => Boolean(p.variable_stack[f.key])).length;
          return (
            <div
              key={f.key}
              className="grid gap-1 mb-1 items-center"
              style={{ gridTemplateColumns: `80px repeat(${pillars.length}, 1fr)` }}
            >
              {/* Family label */}
              <div className="flex items-center gap-1.5 pr-2">
                <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/75 w-4 text-right")}>
                  {familyUsed}
                </span>
                <span className={cn(TYPE.label, "truncate")} title={f.label}>{f.label}</span>
              </div>
              {/* Per-pillar cells */}
              {pillars.map((p) => {
                const code = p.variable_stack[f.key];
                const used = Boolean(code);
                const prefix = code ? getVariablePrefix(code) : null;
                const colorCls = prefix ? (PREFIX_COLORS[prefix] ?? "") : "";
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "rounded h-6 flex items-center justify-center border transition-opacity",
                      used
                        ? cn("border-transparent opacity-90", colorCls)
                        : "border-border/20 bg-foreground/[0.02] opacity-40"
                    )}
                    title={
                      code
                        ? `${p.label} · ${f.label}: ${resolveVariableLabel(code)} (${code})`
                        : `${p.label} · ${f.label}: not used`
                    }
                  >
                    {used && (
                      <span className="text-label font-semibold leading-none select-none">
                        {f.abbrev}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Per-lane playbook with individual collapse ───────────────────────

const COLLAPSIBLE_LANE_CONFIG: readonly { key: string; label: string; accent: string }[] = [
  { key: "scale_now",          label: "Scale now", accent: "border-status-success/25 bg-status-success/[0.06] text-status-success" },
  { key: "optimize",           label: "Optimize",  accent: "border-status-warning/25 bg-status-warning/[0.06] text-status-warning" },
  { key: "validate",           label: "Validate",  accent: "border-accent/25 bg-accent/[0.06] text-accent" },
  { key: "explore",            label: "Explore",   accent: "border-primary/25 bg-primary/[0.06] text-interactive" },
  { key: "avoid_combinations", label: "Avoid",     accent: "border-status-danger/25 bg-status-danger/[0.06] text-status-danger" },
];

function CollapsiblePlaybook({ playbook }: { playbook: NonNullable<ReturnType<typeof getStrategyData>>["scaling_playbook"] }) {
  if (!playbook) return null;
  // Track which lanes are collapsed; start ALL collapsed — user expands on demand
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(COLLAPSIBLE_LANE_CONFIG.map((l) => l.key))
  );

  const activeLanes = COLLAPSIBLE_LANE_CONFIG.filter(({ key }) => {
    const items = playbook[key];
    return Array.isArray(items) && (items as unknown[]).length > 0;
  });

  return (
    <SectionCard title="Scaling playbook" desc="Scale · optimize · validate · explore · avoid" right={<SectionInfoIcon tip="Prioritised action list — what to scale, optimise, validate, explore, and avoid based on analysis reads." />}>
      <div className="space-y-2">
        {activeLanes.map(({ key, label, accent }) => {
          const items = playbook[key] as string[];
          const isOpen = !collapsed.has(key);
          return (
            <div key={key} className={cn("rounded-xl border p-3", accent)}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                aria-expanded={isOpen}
                className="pressable-lg w-full flex items-center justify-between gap-2 text-left"
              >
                <span className={TYPE.label}>{label} · {items.length}</span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 opacity-60 transition-transform shrink-0",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && (
                <ul className="mt-2.5 space-y-1.5 pl-0">
                  {items.map((item, i) => (
                    <li key={i}>
                      <NormalizedRefItem text={item} eyebrow={label} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {typeof playbook.budget_reallocation_note === "string" &&
          playbook.budget_reallocation_note && (
            <div className="rounded-lg border border-border/30 bg-foreground/[0.015] p-3">
              <div className={cn(TYPE.label, "mb-1 text-muted-foreground/75")}>
                Budget reallocation
              </div>
              <DetailReveal
                label={deriveLabel(playbook.budget_reallocation_note, 72)}
                labelClassName={TYPE.body}
                eyebrow="Budget reallocation"
                sections={[{ text: playbook.budget_reallocation_note }]}
              />
            </div>
          )}
      </div>
    </SectionCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function StrategyOverview() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const generation = useGenerationRun(adAccountId, "strategy");
  const [expandedPillars, setExpandedPillars] = useState<Record<string, boolean>>({});

  // ── Analysis-run scope (compact header dropdown) ──────────────────────
  // Strategy pillars are anchored to source cells; a pillar is in scope
  // when any of its source cells belongs to a selected run's concepts.
  // Pillars with no source cells always pass (nothing to attribute).
  const { data: analysisRunsData } = useListAnalysisRuns(adAccountId ?? "", { query: { enabled: !!adAccountId, queryKey: getListAnalysisRunsQueryKey(adAccountId ?? "") } });
  const [runSelection, setRunSelection] = usePersistedRunScope(
    "strategy-overview", adAccountId, analysisRunsData?.runs,
  );
  const { inRunScope } = useCellRunScope(getAnalysisData(seed, adAccountId), runSelection);

  return (
    <ModuleScopeGate section={SECTION} title="Overview" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const briefs = getBriefBuilder(seed, adAccountId);
        const hasAnalysis = (getAdAccount(seed, adAccountId)?.iap ?? null) !== null;

        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Overview" accountName={acct.name} tabs="strategy" />
              <PendingState title="No strategy yet" message="Strategy pillars derive from validated analysis reads." icon={Compass}
                action={!hasAnalysis ? <CrossLink to="/app/analysis/overview" label="Review Analysis first" /> : undefined}
              />
              {generation.isRunning && (
                <div className="px-6 pt-2 pb-4 space-y-2.5 max-w-2xl" aria-busy="true">
                  <SkeletonBlock className="h-3 w-1/4" />
                  <SkeletonBlock className="h-20 w-full" />
                  <SkeletonBlock className="h-20 w-full" />
                  <SkeletonBlock className="h-20 w-full" />
                </div>
              )}
              <div className="px-6 pb-6 space-y-3 max-w-lg mx-auto w-full text-center">
                <GenerationErrorNote message={generation.lastError} onRetry={() => generation.start()} />
                {hasAnalysis ? (
                  <GenerateButton
                    onClick={() => generation.start()}
                    isRunning={generation.isRunning}
                    label="Generate strategy from analysis"
                    runningLabel="Generating strategy…"
                  />
                ) : (
                  <p className="text-caption text-muted-foreground/75">Needs completed analysis first.</p>
                )}
              </div>
            </div>
          );
        }

        // Scope pillars to the selected analysis run(s); their hypotheses
        // follow (a hypothesis with no surviving pillar is out of scope,
        // unless it isn't tied to a pillar at all).
        const pillars = strategy.message_pillars.filter(
          (p) => p.source_cells.length === 0 || p.source_cells.some((c) => inRunScope(c)),
        );
        const pillarIds = new Set(pillars.map((p) => p.id));
        const hypotheses = strategy.active_hypotheses.filter(
          (h) => !h.pillar_id || pillarIds.has(h.pillar_id),
        );

        // Hypothesis categorisation — explicit set membership (no substring matching)
        const HYP_TESTING = new Set(["validation_required"]);
        const HYP_READY   = new Set(["ready_for_brief_builder"]);
        const testing = hypotheses.filter((h) => HYP_TESTING.has(h.status.toLowerCase())).length;
        const ready   = hypotheses.filter((h) => HYP_READY.has(h.status.toLowerCase())).length;
        // "pending" = everything else (high/p1/medium/p2/low/p3 and any unknown status)
        const pending = hypotheses.filter(
          (h) => !HYP_TESTING.has(h.status.toLowerCase()) && !HYP_READY.has(h.status.toLowerCase())
        ).length;

        const hypothesesFor = (pillarId: string) =>
          hypotheses.filter((h) => h.pillar_id === pillarId);

        // Hypothesis status donut data
        const hypStatusData = [
          { name: "Ready for brief", value: ready   },
          { name: "Validating",      value: testing  },
          { name: "Pending",         value: pending  },
        ].filter((d) => d.value > 0);

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
              title="Overview"
              accountName={acct.name}
              subtitle="Pillar coverage · hypothesis breakdown · variable map"
              tabs="strategy"
              right={
                <div className="flex items-center gap-2">
                  <RunScopePicker
                    runs={analysisRunsData?.runs ?? []}
                    value={runSelection}
                    onChange={setRunSelection}
                  />
                  <ProvenanceBadge provenance={strategy.provenance} />
                  {hasAnalysis && (
                    <GenerateButton
                      onClick={() => generation.start()}
                      isRunning={generation.isRunning}
                      label="Build Strategy"
                      runningLabel="Generating…"
                    />
                  )}
                </div>
              }
            />
            {generation.lastError && (
              <div className="px-6 pt-4">
                <GenerationErrorNote message={generation.lastError} onRetry={() => generation.start()} />
              </div>
            )}

            {/* ── Metric tiles ──────────────────────────────────────── */}
            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Message pillars"    value={fmtNum(pillars.length)} variant="primary" />
              <MetricTile label="Active hypotheses"  value={fmtNum(hypotheses.length)} />
              <MetricTile label="Ready for brief"    value={fmtNum(ready)} />
              <MetricTile label="Draft briefs"       value={fmtNum(briefs?.draft_briefs.length ?? 0)} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {/* ── Pillar coverage strip ──────────────────────────── */}
              <SectionCard
                title="Pillar coverage"
                desc="Source cell count per pillar · click to anchor to the card below"
                right={<><SectionInfoIcon tip="Shows how many source cells back each message pillar, indicating which directions have the strongest evidence." /><CrossLink to="/app/strategy/map" label="Map →" /></>}
              >
                <PillarCoverageStrip pillars={pillars} hypothesesFor={hypothesesFor} />
              </SectionCard>

              {/* ── Hypothesis donut + Variable heatmap ───────────── */}
              {(hypStatusData.length > 0 || pillars.length > 0) && (
                <div className="grid grid-cols-[200px_1fr] gap-3">
                  {hypStatusData.length > 0 && (
                    <SectionCard
                      title="Hypothesis status"
                      desc="By validation stage"
                      right={<><SectionInfoIcon tip="Breakdown of active hypotheses by validation stage so you can see what needs testing before it moves to brief." /><CrossLink to="/app/strategy/hypotheses" label="Queue →" /></>}
                    >
                      <SharePieChart
                        data={hypStatusData}
                        unit="count"
                        height={180}
                        showLegend={hypStatusData.length <= 3}
                      />
                    </SectionCard>
                  )}
                  {pillars.length > 0 && (
                    <SectionCard
                      title="Variable family map"
                      desc="Which variable families each pillar uses — row = family, column = pillar"
                      right={<><SectionInfoIcon tip="Grid showing which creative variable families are used by each message pillar, revealing gaps and overlaps in the strategy." /><CrossLink to="/app/strategy/map" label="Map →" /></>}
                    >
                      <VariableFamilyHeatmap pillars={pillars} />
                    </SectionCard>
                  )}
                </div>
              )}

              {/* ── Pillar cards (enhanced) ────────────────────────── */}
              <SectionCard title="Message pillars" desc="Validated message directions · click source cells to explore" right={<SectionInfoIcon tip="Validated messaging directions derived from high-performing cells, each anchored to the source creative evidence." />}>
                <div className="grid grid-cols-dashboard-3 gap-3">
                  {pillars.map((p, i) => {
                    const t = splitTitle(p.label);
                    const tier = pillarTier(p.source_cells);
                    const linked = hypothesesFor(p.id);
                    const isOpen = expandedPillars[p.id] ?? false;

                    // Left-border accent by evidence tier — matches recommendation-card pattern
                    const tierAccent =
                      tier === "high"
                        ? "border-l-[3px] border-l-emerald-400/60"
                        : tier === "medium"
                          ? "border-l-[3px] border-l-amber-400/50"
                          : "border-l-[3px] border-l-border/30";

                    return (
                      <div
                        key={p.id}
                        id={`pillar-${p.id}`}
                        className={cn(
                          "rounded-xl border border-border/40 bg-foreground/[0.02] flex flex-col scroll-mt-4 overflow-hidden",
                          tierAccent
                        )}
                      >
                        {/* ── Header: index + title + tier badge ── */}
                        <div className="px-4 pt-4 pb-3 flex items-start gap-2 border-b border-border/15">
                          <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/75 mt-0.5 shrink-0 w-5 text-right")}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground leading-snug line-clamp-2" title={p.label}>
                              {t.main}
                            </p>
                            {t.qualifier && (
                              <p className={cn(TYPE.caption, "line-clamp-1 mt-0.5 text-muted-foreground/75")}>
                                {t.qualifier}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-label font-semibold border px-1.5 py-0.5 rounded leading-none shrink-0 mt-0.5",
                              TIER_STYLE[tier]
                            )}
                            title={`${p.source_cells.length} source cell${p.source_cells.length !== 1 ? "s" : ""}`}
                          >
                            {p.source_cells.length}c · {TIER_LABEL[tier]}
                          </span>
                        </div>

                        {/* ── Body ── */}
                        <div className="px-4 py-3 flex flex-col gap-2.5 flex-1">
                          {/* Descriptor */}
                          {p.plain_descriptor && (
                            <p className="text-caption text-muted-foreground/75 leading-relaxed line-clamp-2">
                              {deriveLabel(p.plain_descriptor, 130)}
                            </p>
                          )}

                          {/* Variable stack — most actionable signal, rendered prominently */}
                          <div>
                            <span className={cn(TYPE.label, "text-muted-foreground/75 uppercase tracking-wide text-label mb-1.5 block")}>
                              What works
                            </span>
                            <VariableStackChips stack={p.variable_stack} />
                          </div>

                          {/* ICP chips */}
                          {(p.target_icps?.length ?? 0) > 0 && (
                            <div>
                              <span className={cn(TYPE.label, "text-muted-foreground/75 uppercase tracking-wide text-label mb-1.5 block")}>
                                Who responds
                              </span>
                              <IcpChips ids={p.target_icps} profiles={strategy.icp_profiles} />
                            </div>
                          )}

                          {/* Source cell chips */}
                          {p.source_cells.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-auto pt-1">
                              {p.source_cells.map((c) => (
                                <a
                                  key={c}
                                  href={`/app/analysis/library?focus=${c}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    window.history.pushState({}, "", `/app/analysis/library?focus=${c}`);
                                    window.dispatchEvent(new PopStateEvent("popstate"));
                                  }}
                                  className="text-label font-mono text-interactive/80 hover:text-primary border border-primary/20 hover:border-primary/40 bg-primary/[0.04] px-1.5 py-0.5 rounded leading-none transition-colors"
                                >
                                  {c}
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Hypothesis count + expand */}
                          {linked.length > 0 && (
                            <div className="pt-2 border-t border-border/20">
                              <button
                                onClick={() => setExpandedPillars((e) => ({ ...e, [p.id]: !isOpen }))}
                                aria-expanded={isOpen}
                                className="pressable-lg inline-flex items-center gap-1 text-caption font-semibold text-interactive hover:text-interactive/80 transition-colors w-full"
                              >
                                <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", isOpen && "rotate-180")} />
                                <span>{linked.length} hypothes{linked.length !== 1 ? "es" : "is"}</span>
                              </button>
                              {isOpen && (
                                <div className="mt-2 space-y-1.5">
                                  {linked.map((h) => (
                                    <div key={h.id} className="flex items-center gap-1.5">
                                      <HypothesisStatusBadge status={h.status} />
                                      <span className={cn(TYPE.label, "text-foreground/70 truncate")} title={h.label}>
                                        {deriveLabel(h.label, 40)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <CrossLink to="/app/strategy/map" label="See the full strategy map" />
                </div>
              </SectionCard>

              {/* ── Scaling playbook ──────────────────────────────────── */}
              {playbookHasContent(strategy.scaling_playbook) && (
                <CollapsiblePlaybook playbook={strategy.scaling_playbook} />
              )}

              {/* ── Strategy modules ──────────────────────────────────── */}
              <SectionCard title="Go deeper" desc="Same strategy, different lenses — map, audience, and validation queue" right={<SectionInfoIcon tip="Deeper views of the same strategy from different angles — map, avatars, and hypothesis queue." />}>
                <div className="grid grid-cols-dashboard-3 gap-3">
                  {subpages.map((s) => (
                    <a
                      key={s.to}
                      href={s.to}
                      onClick={(e) => {
                        e.preventDefault();
                        window.history.pushState({}, "", s.to);
                        window.dispatchEvent(new PopStateEvent("popstate"));
                      }}
                      className="group rounded-xl border border-border/40 bg-foreground/[0.02] hover:bg-foreground/[0.045] hover:border-border/70 p-4 flex flex-col gap-3 transition-[color,background-color,border-color,box-shadow,opacity,transform] no-underline"
                    >
                      {/* Icon + label */}
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/[0.06] border border-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/[0.10] transition-colors">
                          <s.Icon className="w-3.5 h-3.5 text-interactive" />
                        </div>
                        <span className="text-sm font-bold text-foreground group-hover:text-foreground transition-colors">{s.label}</span>
                      </div>

                      {/* Description — always visible */}
                      <p className={cn(TYPE.caption, "text-muted-foreground/75 leading-relaxed flex-1")}>
                        {s.desc}
                      </p>

                      {/* Stat + arrow */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/20">
                        <span className={cn(TYPE.label, "text-muted-foreground/75 font-mono")}>{s.stat}</span>
                        <span className={cn(TYPE.label, "text-interactive/60 group-hover:text-interactive transition-colors font-semibold")}>
                          Open →
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </SectionCard>

              <div className="flex items-center gap-3 pt-1">
                <LoopAction to="/app/briefs/builder" label="Draft briefs from this strategy" icon="brief" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
