// ─── Strategy · Overview ──────────────────────────────────────────────
// Pillar-strength dashboard: coverage bars, hypothesis status donut,
// variable-family heatmap, enhanced pillar cards, and scaling playbook
// restructured with per-lane disclosure.

import { useState } from "react";
import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtNum, LoopAction,
  RangeScopeBar, NoDataInRangeState, DetailReveal, deriveLabel, InfoTooltip, SkeletonBlock,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote,
} from "@/components/generation/GenerationControls";
import { VariableStackChips, IcpChips, NormalizedRefItem, playbookHasContent, HypothesisStatusBadge } from "./strategyShared";
import { splitTitle } from "@/lib/normalize";
import { cn } from "@/lib/utils";
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
  high:   "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low:    "bg-muted text-muted-foreground/60 border-border/40",
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
                    <span className={cn(TYPE.label, "text-muted-foreground/40 tabular-nums")}>
                      {hypCount} hyp
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background:
                      tier === "high"
                        ? "hsl(var(--metrix-success) / 0.8)"
                        : tier === "medium"
                          ? "hsl(var(--metrix-gold) / 0.8)"
                          : "rgba(255,255,255,0.18)",
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
                      : "rgba(255,255,255,0.18)",
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
                <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/40 w-4 text-right")}>
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
                        : "border-border/20 bg-white/[0.02] opacity-40"
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
  { key: "scale_now",          label: "Scale now", accent: "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-400" },
  { key: "optimize",           label: "Optimize",  accent: "border-amber-400/25 bg-amber-400/[0.06] text-amber-300" },
  { key: "validate",           label: "Validate",  accent: "border-[#16d9ff]/25 bg-[#16d9ff]/[0.06] text-[#62e6ff]" },
  { key: "explore",            label: "Explore",   accent: "border-purple-400/25 bg-purple-400/[0.06] text-purple-300" },
  { key: "avoid_combinations", label: "Avoid",     accent: "border-red-400/25 bg-red-400/[0.06] text-red-300" },
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
    <SectionCard title="Scaling playbook" desc="Scale · optimize · validate · explore · avoid">
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
                className="w-full flex items-center justify-between gap-2 text-left"
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
            <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
              <div className={cn(TYPE.label, "mb-1 text-muted-foreground/60")}>
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
  const { rangeHasData } = useDateRange();
  const generation = useGenerationRun(adAccountId, "strategy");
  const [expandedPillars, setExpandedPillars] = useState<Record<string, boolean>>({});

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
                  <p className="text-caption text-muted-foreground/70">Needs completed analysis first.</p>
                )}
              </div>
            </div>
          );
        }

        const pillars = strategy.message_pillars;
        const hypotheses = strategy.active_hypotheses;

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
              title="Strategy Overview"
              subtitle="Pillar coverage · hypothesis breakdown · variable map"
              tabs="strategy"
              account={acct}
              right={
                <div className="flex items-center gap-2">
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
            <RangeScopeBar grainNote="Strategy derives from the account's full flight window — this import has no daily grain." />
            {generation.lastError && (
              <div className="px-6 pt-4">
                <GenerationErrorNote message={generation.lastError} onRetry={() => generation.start()} />
              </div>
            )}

            {!rangeHasData ? (
              <NoDataInRangeState what="strategy data" />
            ) : (
            <>
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
                right={<CrossLink to="/app/strategy/map" label="Map →" />}
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
                      right={<CrossLink to="/app/strategy/hypotheses" label="Queue →" />}
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
                      right={<CrossLink to="/app/strategy/map" label="Map →" />}
                    >
                      <VariableFamilyHeatmap pillars={pillars} />
                    </SectionCard>
                  )}
                </div>
              )}

              {/* ── Pillar cards (enhanced) ────────────────────────── */}
              <SectionCard title="Message pillars" desc="Validated message directions · click source cells to explore">
                <div className="grid grid-cols-dashboard-3 gap-3">
                  {pillars.map((p, i) => {
                    const t = splitTitle(p.label);
                    const tier = pillarTier(p.source_cells);
                    const linked = hypothesesFor(p.id);
                    const isOpen = expandedPillars[p.id] ?? false;
                    return (
                      <div
                        key={p.id}
                        id={`pillar-${p.id}`}
                        className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2 scroll-mt-4"
                      >
                        {/* Index + confidence tier */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(TYPE.label, "tabular-nums")}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className={cn("text-label font-semibold border px-1.5 py-0.5 rounded leading-none", TIER_STYLE[tier])}>
                            {TIER_LABEL[tier]}
                          </span>
                        </div>

                        {/* Pillar title */}
                        <div title={p.label}>
                          <p className="text-title font-semibold text-foreground leading-tight line-clamp-2">{t.main}</p>
                          {t.qualifier && <p className={cn(TYPE.caption, "line-clamp-2 mt-0.5 text-muted-foreground/70")}>{t.qualifier}</p>}
                        </div>

                        {/* Descriptor — visible inline */}
                        {p.plain_descriptor && (
                          <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2">
                            {deriveLabel(p.plain_descriptor, 120)}
                          </p>
                        )}

                        {/* Source cell chips */}
                        {p.source_cells.length > 0 && (
                          <div className="flex flex-wrap gap-1">
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

                        {/* Variable stack + ICP chips */}
                        <div className="mt-auto pt-1 space-y-1.5">
                          <VariableStackChips stack={p.variable_stack} />
                          <IcpChips ids={p.target_icps} profiles={strategy.icp_profiles} />
                        </div>

                        {/* Hypothesis count + expand */}
                        {linked.length > 0 && (
                          <div className="pt-1 border-t border-border/20">
                            <button
                              onClick={() => setExpandedPillars((e) => ({ ...e, [p.id]: !isOpen }))}
                              aria-expanded={isOpen}
                              className="inline-flex items-center gap-1 text-caption font-semibold text-interactive hover:text-interactive/80 transition-colors w-full"
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
              <SectionCard title="Strategy modules" desc="Same strategy · different angles">
                <div className="grid grid-cols-dashboard-3 gap-3">
                  {subpages.map((s) => (
                    <div key={s.to} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-3.5 h-3.5 text-interactive" />
                        <span className="text-title font-semibold text-foreground">{s.label}</span>
                        <InfoTooltip content={s.desc} />
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-label font-mono text-muted-foreground/70">{s.stat}</span>
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
