// ─── Strategy · Communications — visual redesign ─────────────────────────────
//
// Design principles applied:
//   1. OPTICAL AUTHORITY: confidence tier drives a 3px left-border accent so
//      high-evidence pillars claim visual dominance instantly (emerald / amber / neutral)
//   2. ACTIONABILITY FIRST: "What works" (variable signals) leads the body —
//      these are the actual creative levers. "Who responds" is context.
//   3. PROGRESSIVE DISCLOSURE: the card face is a scannable summary only
//      (title, descriptor, confidence bar, variable chips, ICP chips) —
//      the full prose ("why it matters", message resonance, funnel/
//      execution/placement/scaling detail, every testing hypothesis)
//      lives one click away in the deep-dive slide-over panel (same
//      right-side panel the MST tiles use — see lib/data/deepDive.ts's
//      buildPillarDeepDiveModule), never inline on the page.
//   4. SCANNABILITY: index number + main title + confidence bar readable in 300 ms
//      without drilling in. Cards lay out on a responsive grid (canvas parity),
//      not a single-column list.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  SectionCard, SectionInfoIcon, ConfidenceBadge, useShowMore, ShowMoreButton,
} from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { VariableStackChips, IcpChips, pillarTier, CONF_ORDER } from "./strategyShared";
import { useDeepDive } from "@/contexts/DeepDiveContext";
import { buildPillarDeepDiveModule } from "@/lib/data/deepDive";
import type { MessagePillar, StrategyData } from "@/lib/data/seedTypes";
import { MessageSquare, Users, ArrowRight } from "lucide-react";

const SECTION = "Strategy · 04";

// ─── Confidence tier (from source cell count) ────────────────────────────────
// pillarTier itself lives in strategyShared (shared with the Avatars coverage
// matrix) — this file keeps only the tier→visual mappings.

/** Left-border accent by evidence tier — matches the recommendation-card pattern */
const TIER_ACCENT: Record<string, string> = {
  high:   "border-l-[3px] border-l-emerald-400/60",
  medium: "border-l-[3px] border-l-amber-400/50",
  low:    "border-l-[3px] border-l-border/30",
};

const TIER_LABEL: Record<string, string> = {
  high:   "High evidence",
  medium: "Some evidence",
  low:    "Low evidence",
};

// Confidence-bar fill: same categorical tier the badge used to encode, now
// expressed as a weight (not a literal percentage — source_cells.length has
// no fixed upper bound across accounts, so a weight-per-tier is the honest
// representation, the same pattern the tier itself already used for color).
// The tier is ORDINAL — three positions, nothing between them. It used to
// fill a smooth bar to 88 / 55 / 20 percent; those numbers were chosen to
// make the bar look right and nothing measured them, so a reader had every
// reason to take 88% for a measurement. Three discrete steps say exactly as
// much and claim only what is true.
const TIER_STEPS: Record<string, number> = { high: 3, medium: 2, low: 1 };
const TIER_FILL: Record<string, string> = {
  high:   "hsl(var(--status-success) / 0.70)",
  medium: "hsl(var(--status-warning) / 0.60)",
  low:    "hsl(var(--muted-foreground) / 0.45)",
};

/** Confidence progress bar — replaces the categorical badge with a
 *  bar-with-fill visual, driven by the same real source_cells-derived
 *  tier. Hoverable for the exact cell count behind the read. */
function ConfidenceBar({ cells }: { cells: string[] }) {
  const tier = pillarTier(cells);
  const step = TIER_STEPS[tier] ?? null;
  return (
    <div title={`${cells.length} source cell${cells.length !== 1 ? "s" : ""} behind this pillar`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={cn(TYPE.label, "text-muted-foreground/60")}>Confidence</span>
        <span className={cn(TYPE.label, "text-muted-foreground/60")}>{TIER_LABEL[tier]}</span>
      </div>
      <ProgressMeter
        value={step}
        total={3}
        segments={3}
        label={`Confidence — ${TIER_LABEL[tier]}`}
        fill={TIER_FILL[tier]}
        size="md"
      />
    </div>
  );
}

// ─── Pillar card — scannable summary only ─────────────────────────────────────
// Full prose ("why it matters", message resonance, funnel/execution/
// placement/scaling sections, and every testing hypothesis) lives behind
// the deep-dive panel now — the card face keeps only what reads in
// ~300ms: title, descriptor, confidence, the variable levers, and who
// responds. Clicking anywhere on the card pushes the pillar's full module
// into the same right slide-over the MST tiles use.

function PillarCard({ pillar, index, strategy }: { pillar: MessagePillar; index: number; strategy: StrategyData }) {
  const deepDive = useDeepDive();
  const targetIcps = pillar.target_icps ?? [];
  const matchedProfiles = targetIcps
    .map((id) => strategy.icp_profiles?.find((pr) => pr.profile_id === id))
    .filter((pr): pr is NonNullable<typeof pr> => Boolean(pr));
  const hypotheses = strategy.active_hypotheses.filter((h) => h.pillar_id === pillar.id);
  // Highest-confidence match by rank, not array order — target_icps
  // preserves generation order, not confidence-tier order, so a plain
  // "first truthy" pick could surface a low-confidence ICP even when one
  // of the pillar's own matched profiles is high-confidence.
  const bestConfidence = matchedProfiles
    .map((pr) => pr.confidence_level)
    .filter((c): c is string => Boolean(c))
    .sort((a, b) => (CONF_ORDER[a.toLowerCase()] ?? 99) - (CONF_ORDER[b.toLowerCase()] ?? 99))[0];
  const tier = pillarTier(pillar.source_cells ?? []);

  const open = () => {
    if (!deepDive.enabled) return;
    deepDive.push(buildPillarDeepDiveModule({ pillar, hypotheses, profiles: strategy.icp_profiles }));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      aria-label={`Open the deep dive for ${pillar.label}`}
      data-testid={`pillar-card-${pillar.id}`}
      className={cn(
        "text-left rounded-xl border border-border/40 bg-foreground/[0.02] overflow-hidden flex flex-col h-full cursor-pointer",
        "transition-colors hover:border-border/60 hover:bg-foreground/[0.03]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        TIER_ACCENT[tier]
      )}
    >
      {/* ── Pillar header ── */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b border-border/15">
        {/* Index number */}
        <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/40 mt-0.5 w-5 text-right shrink-0")}>
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <p className={cn(TYPE.title, "leading-snug line-clamp-2")}>
            {pillar.label}
          </p>
          {pillar.plain_descriptor && (
            <p className={cn(TYPE.caption, "text-muted-foreground/55 mt-1 leading-relaxed line-clamp-2")}>
              {pillar.plain_descriptor}
            </p>
          )}
        </div>
      </div>

      {/* ── Body — summary only, full detail lives in the deep-dive panel ── */}
      <div className="px-4 py-3.5 space-y-3.5 flex-1 flex flex-col">

        {/* Confidence — bar-with-fill, same real source_cells-derived tier. */}
        <ConfidenceBar cells={pillar.source_cells ?? []} />

        {/* What works — variable signals — LEADS because it's the actionable creative lever */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <MessageSquare className="w-3 h-3 text-interactive/70 shrink-0" />
            <span className={cn(TYPE.label, "text-muted-foreground/65 font-semibold uppercase tracking-wide text-label")}>
              What works
            </span>
          </div>
          <VariableStackChips stack={pillar.variable_stack} />
        </div>

        {/* Who responds — ICP context */}
        {(matchedProfiles.length > 0 || targetIcps.length > 0) && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-interactive/60 shrink-0" />
                <span className={cn(TYPE.label, "text-muted-foreground/55 font-semibold uppercase tracking-wide text-label")}>
                  Who responds
                </span>
              </div>
              {bestConfidence && <ConfidenceBadge value={bestConfidence} />}
            </div>
            {targetIcps.length > 0 ? (
              <IcpChips ids={targetIcps} profiles={strategy.icp_profiles} maxVisible={3} />
            ) : (
              <p className={cn(TYPE.caption, "text-muted-foreground/40 italic")}>No ICP linked yet</p>
            )}
          </div>
        )}

        {/* Footer — hint that there's more, never the prose itself */}
        <div className="mt-auto pt-3 border-t border-border/20 flex items-center justify-between gap-2">
          <span className={cn(TYPE.label, "text-muted-foreground/50")}>
            {hypotheses.length > 0 ? `${hypotheses.length} testing hypothes${hypotheses.length !== 1 ? "es" : "is"}` : "No hypotheses yet"}
          </span>
          <span className={cn(TYPE.label, "inline-flex items-center gap-1 text-interactive/70")}>
            Full detail <ArrowRight className="w-3 h-3" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Pillar grid (first 5 + show-more fold) ───────────────────────────────────

function PillarList({ strategy }: { strategy: StrategyData }) {
  const fold = useShowMore(strategy.message_pillars, 5);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {fold.visible.map((p, i) => (
          <PillarCard key={p.id} pillar={p} index={i} strategy={strategy} />
        ))}
      </div>
      <ShowMoreButton
        total={strategy.message_pillars.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun="pillars"
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommunicationsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Communications" account={account}>
      {() => {
        const strategy = getStrategyData(seed, adAccountId);
        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Communications" accountName={account!.name} />
              <PendingState
                title="No communications data yet"
                message="Communications derive from generated message pillars — generate strategy first."
                icon={MessageSquare}
              />
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Communications"
              accountName={account!.name}
              subtitle="Who responds, to what, and why — per message pillar."
              table="message_pillars, historical_matrix_4x4"
            />

            <div className="px-6 py-5 space-y-3">
              <SectionCard
                title="Message pillars"
                table="message_pillars"
                collapsible={false}
                right={
                  <SectionInfoIcon tip="Each pillar is a validated message direction backed by source cells — showing what creative angles work, who responds, and the strategic rationale behind them." />
                }
              >
                <div className="pt-3 space-y-3">
                  <PillarList strategy={strategy} />
                </div>
              </SectionCard>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
