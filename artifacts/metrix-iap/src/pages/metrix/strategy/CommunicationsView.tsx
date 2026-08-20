// ─── Strategy · Communications — visual redesign ─────────────────────────────
//
// Design principles applied:
//   1. OPTICAL AUTHORITY: confidence tier drives a 3px left-border accent so
//      high-evidence pillars claim visual dominance instantly (emerald / amber / neutral)
//   2. ACTIONABILITY FIRST: "What works" (variable signals) leads the body —
//      these are the actual creative levers. "Who responds" is context.
//   3. PROGRESSIVE DISCLOSURE: pillar title + descriptor always visible;
//      "Why it matters" shows one line + expands; hypotheses collapse to a badge strip
//   4. SCANNABILITY: index number + main title + confidence bar readable in 300 ms
//      without drilling in. Cards lay out on a responsive grid (canvas parity),
//      not a single-column list.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  SectionCard, SectionInfoIcon, ConfidenceBadge, deriveLabel, useShowMore, ShowMoreButton,
} from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  VariableStackChips, IcpChips, HypothesisLabel,
  HypothesisStatusBadge, pillarHasDetails, PillarDetailsFold, pillarTier,
} from "./strategyShared";
import type { StrategyData } from "@/lib/data/seedTypes";
import { MessageSquare, Users, Lightbulb, FlaskConical, ChevronDown } from "lucide-react";

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
const TIER_FILL_PCT: Record<string, number> = { high: 88, medium: 55, low: 20 };
const TIER_FILL_COLOR: Record<string, string> = {
  high:   "bg-emerald-400/70",
  medium: "bg-amber-400/60",
  low:    "bg-muted-foreground/30",
};

/** Confidence progress bar — replaces the categorical badge with a
 *  bar-with-fill visual, driven by the same real source_cells-derived
 *  tier. Hoverable for the exact cell count behind the read. */
function ConfidenceBar({ cells }: { cells: string[] }) {
  const tier = pillarTier(cells);
  const pct = TIER_FILL_PCT[tier];
  return (
    <div title={`${cells.length} source cell${cells.length !== 1 ? "s" : ""} behind this pillar`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={cn(TYPE.label, "text-muted-foreground/60")}>Confidence</span>
        <span className={cn(TYPE.label, "text-muted-foreground/60")}>{TIER_LABEL[tier]}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn("h-full rounded-full", TIER_FILL_COLOR[tier])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── "Why it matters" — 1-line visible, full text expandable ─────────────────

function WhyBlock({
  whyText,
  resonance,
}: {
  whyText: string | undefined;
  resonance: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!whyText) return null;
  const preview = deriveLabel(whyText, 100);
  const isTruncated = preview.length < whyText.length || Boolean(resonance);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lightbulb className="w-3 h-3 text-amber-300/60 shrink-0" />
        <span className={cn(TYPE.label, "text-muted-foreground/60")}>Why it matters</span>
      </div>
      <p className={cn(TYPE.body, "text-foreground/75 leading-relaxed", !open && "line-clamp-2")}>
        {whyText}
      </p>
      {resonance && open && (
        <div className="mt-2 rounded-lg bg-white/[0.025] border border-border/20 p-2.5">
          <p className={cn(TYPE.label, "text-muted-foreground/50 mb-0.5")}>Message resonance</p>
          <p className={cn(TYPE.body, "text-foreground/70 leading-relaxed")}>{resonance}</p>
        </div>
      )}
      {isTruncated && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            TYPE.label,
            "inline-flex items-center gap-1 mt-1.5 text-interactive/70 hover:text-interactive transition-colors"
          )}
        >
          <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", open && "rotate-180")} />
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

// ─── Hypothesis badge strip ───────────────────────────────────────────────────

function HypothesesStrip({
  hypotheses,
}: {
  hypotheses: Array<{ id: string; label: string; status: string; isolated_variable?: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  if (hypotheses.length === 0) return null;
  const preview = hypotheses.slice(0, 3);
  const rest = hypotheses.slice(3);
  return (
    <div className="pt-3 border-t border-border/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 mb-2 group"
      >
        <FlaskConical className="w-3 h-3 text-interactive/60 shrink-0" />
        <span className={cn(TYPE.label, "text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors")}>
          {hypotheses.length} testing hypothes{hypotheses.length !== 1 ? "es" : "is"}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {/* Preview: first 3 always visible when open or as badge strip */}
      {open && (
        <div className="space-y-2">
          {(rest.length > 0 ? hypotheses : preview).map((h) => (
            <div key={h.id} className="flex items-start gap-2 pl-0.5">
              <HypothesisStatusBadge status={h.status} />
              <HypothesisLabel label={h.label} isolated={h.isolated_variable} />
            </div>
          ))}
          {!open && rest.length > 0 && (
            <p className={cn(TYPE.label, "text-muted-foreground/40 pl-0.5")}>
              +{rest.length} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pillar grid (first 5 + show-more fold) ───────────────────────────────────

function PillarList({ strategy }: { strategy: StrategyData }) {
  const fold = useShowMore(strategy.message_pillars, 5);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {fold.visible.map((p, i) => {
          const targetIcps = p.target_icps ?? [];
          const matchedProfiles = targetIcps
            .map((id) => strategy.icp_profiles?.find((pr) => pr.profile_id === id))
            .filter((pr): pr is NonNullable<typeof pr> => Boolean(pr));
          const hypotheses = strategy.active_hypotheses.filter((h) => h.pillar_id === p.id);
          const bestConfidence = matchedProfiles.map((pr) => pr.confidence_level).find(Boolean);
          const messageResonance = matchedProfiles.map((pr) => pr.message_resonance).find(Boolean);
          const tier = pillarTier(p.source_cells ?? []);

          return (
            <div
              key={p.id}
              className={cn(
                "rounded-xl border border-border/40 bg-white/[0.02] overflow-hidden flex flex-col h-full",
                TIER_ACCENT[tier]
              )}
            >
              {/* ── Pillar header ── */}
              <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b border-border/15">
                {/* Index number */}
                <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/40 mt-0.5 w-5 text-right shrink-0")}>
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* Title block */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-foreground leading-snug line-clamp-2">
                    {p.label}
                  </p>
                  {p.plain_descriptor && (
                    <p className={cn(TYPE.caption, "text-muted-foreground/55 mt-1 leading-relaxed line-clamp-2")}>
                      {p.plain_descriptor}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Body ── */}
              <div className="px-4 py-3.5 space-y-4 flex-1 flex flex-col">

                {/* Confidence — bar-with-fill, replaces the categorical badge that
                    used to sit in the header; same real source_cells-derived tier. */}
                <ConfidenceBar cells={p.source_cells ?? []} />

                {/* What works — variable signals — LEADS because it's the actionable creative lever */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquare className="w-3 h-3 text-interactive/70 shrink-0" />
                    <span className={cn(TYPE.label, "text-muted-foreground/65 font-semibold uppercase tracking-wide text-label")}>
                      What works
                    </span>
                  </div>
                  <VariableStackChips stack={p.variable_stack} />
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

                {/* Why it matters — strategic rationale, 1 line visible + expand */}
                <WhyBlock
                  whyText={p.why_it_matters}
                  resonance={messageResonance}
                />

                {/* Pillar detail sections — folded behind "Pillar details" */}
                {pillarHasDetails(p) && (
                  <div className="pt-1 border-t border-border/15">
                    <PillarDetailsFold pillar={p} profiles={strategy.icp_profiles} />
                  </div>
                )}

                {/* Hypothesis strip — badge only, progressive disclosure */}
                <HypothesesStrip hypotheses={hypotheses} />
              </div>
            </div>
          );
        })}
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
