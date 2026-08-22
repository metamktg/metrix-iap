// ─── Shared building blocks for the Strategy pages ────────────────────
// Reusable, data-honest presentational pieces: pillar detail sections,
// readable variable-stack chips, ICP chips, hypothesis badges, and the
// variable-combination / scaling-playbook visualizations.

import { useState } from "react";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS, resolveInlineVariableCodes } from "@/lib/variable-registry";
import { ConfidenceBadge, DetailReveal, deriveLabel, useShowMore, ShowMoreButton } from "../shared";
import {
  parseHierarchyRef, formatHierarchyRef, fmtMetric, extractVariableCodes, compactIcpName,
  type HierarchyRef,
} from "@/lib/normalize";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { Funnel, Wrench, LayoutGrid, TrendingUp, Users, ArrowUpRight, Ban, FlaskConical, Search, Sparkles, ChevronDown, Dna } from "lucide-react";
import type { MessagePillar, ICPProfile, VariableCombination, ScalingPlaybook } from "@/lib/data/seedTypes";
import type { DnaVariable } from "@/lib/creative-dna";

// ─── Variable families ────────────────────────────────────────────────

const FAMILY_LABEL: Record<string, string> = {
  hook: "Hook",
  tone: "Tone",
  framework: "Framework",
  concept: "Concept",
  proof: "Proof",
  pain_proof: "Pain point",
  cta: "CTA",
};

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? family.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Pillar evidence tier ──────────────────────────────────────────────
// Shared across Communications (confidence bar) and Avatars (coverage
// matrix) — a pillar's real source_cells count is the one honest evidence
// signal the seed carries; both views key their visuals off this same
// derivation rather than each inventing their own threshold.

export function pillarTier(cells: string[]): "high" | "medium" | "low" {
  if (cells.length >= 3) return "high";
  if (cells.length >= 1) return "medium";
  return "low";
}

// ─── Confidence ordinal ranking ────────────────────────────────────────
// The one ordinal ranking for ICP/hypothesis `confidence_level` strings —
// lower is higher confidence. Shared by the Avatars profile sort (highest
// confidence first) and Communications' "best confidence among a pillar's
// matched ICPs" pick, so both surfaces agree on what "best" means instead
// of each inventing (or accidentally not inventing) its own order.
export const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, directional: 2, low: 3 };

/** One readable chip per variable code, colored by family prefix. Styled info tooltip on hover. */
export function VariableChip({ code, showCode = false, className }: { code: string; showCode?: boolean; className?: string }) {
  const prefix = getVariablePrefix(code);
  return (
    <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-label font-medium border px-1.5 py-0.5 rounded leading-none cursor-default",
            PREFIX_COLORS[prefix],
            className,
          )}
        >
          {resolveVariableLabel(code)}
          {showCode && <span className="font-mono text-label opacity-60">{code}</span>}
          {!showCode && <span className="sr-only">{` (${code})`}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] space-y-0.5 text-left">
        <p className="font-mono text-label text-primary-foreground/70">{code}</p>
        <p className="text-label leading-relaxed text-primary-foreground/90">{resolveVariableLabel(code)}</p>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

/** "+N" overflow chip: caps a chip row and reveals the rest in a popover. */
function ChipOverflow({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show ${count} more`}
          className="inline-flex items-center text-label font-semibold text-muted-foreground/80 border border-border/50 bg-white/[0.04] hover:bg-white/[0.08] px-1.5 py-1 rounded leading-none transition-colors"
        >
          +{count}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[300px] p-2.5">
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Readable chips for a `variable_stack` record ({ family: code }).
 * Density rule: at most `maxVisible` chips on the card face; the rest
 * collapse into a "+N" chip that opens a popover with the full stack.
 */
export function VariableStackChips({ stack, maxVisible = 4 }: { stack: Record<string, string>; maxVisible?: number }) {
  const entries = Object.entries(stack).filter(([, v]) => Boolean(v));
  if (entries.length === 0) return null;
  // Density rule: no family eyebrow on the chip face — the family and
  // raw code live in the title attr; the chip shows only the label.
  const chip = ([family, code]: [string, string]) => (
    <TooltipProvider key={family} delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center text-label font-medium border px-1.5 py-1 rounded leading-none cursor-default",
            PREFIX_COLORS[getVariablePrefix(code)],
          )}
        >
          {resolveVariableLabel(code)}
          <span className="sr-only">{` — ${familyLabel(family)} (${code})`}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] space-y-0.5 text-left">
        <p className="text-label font-semibold text-primary-foreground/90">{familyLabel(family)}</p>
        <p className="font-mono text-label text-primary-foreground/70">{code}</p>
        <p className="text-label leading-relaxed text-primary-foreground/90">{resolveVariableLabel(code)}</p>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
  const visible = entries.length > maxVisible ? entries.slice(0, maxVisible) : entries;
  const hidden = entries.length > maxVisible ? entries.slice(maxVisible) : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(chip)}
      {hidden.length > 0 && <ChipOverflow count={hidden.length}>{hidden.map(chip)}</ChipOverflow>}
    </div>
  );
}

/** Readable chips for a "VAR_A + VAR_B" combination string. */
export function CombinationChips({ combination }: { combination: string }) {
  const codes = combination.split(/\s*\+\s*/).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((code, i) => (
        <VariableChip key={`${code}-${i}`} code={code} />
      ))}
    </div>
  );
}

// ─── ICP chips ────────────────────────────────────────────────────────

/** Resolve an ICP profile id to its human name when the profile exists. */
export function icpName(profiles: ICPProfile[] | undefined, id: string): string {
  const match = (profiles ?? []).find((p) => p.profile_id === id);
  return match?.profile_name ?? id.replace(/^ICP_/, "").replace(/_/g, " ");
}

export function IcpChips({ ids, profiles, maxVisible = 4 }: { ids: string[] | undefined; profiles?: ICPProfile[]; maxVisible?: number }) {
  if (!ids || ids.length === 0) return null;
  // Density rule: chips show the compact name (trailing parentheticals
  // and " - …" qualifiers stripped); the full name + id stay in title.
  const chip = (id: string) => {
    const full = icpName(profiles, id);
    const compact = compactIcpName(full);
    return (
      <span
        key={id}
        className="inline-flex items-center gap-1 text-label font-medium text-foreground/85 border border-border/40 bg-white/[0.03] px-1.5 py-1 rounded leading-none"
        title={compact === full ? id : `${full} · ${id}`}
      >
        <Users className="w-3.5 h-3.5 text-interactive/70" />
        {compact}
      </span>
    );
  };
  const visible = ids.length > maxVisible ? ids.slice(0, maxVisible) : ids;
  const hidden = ids.length > maxVisible ? ids.slice(maxVisible) : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(chip)}
      {hidden.length > 0 && <ChipOverflow count={hidden.length}>{hidden.map(chip)}</ChipOverflow>}
    </div>
  );
}

// ─── Hierarchy reference items ────────────────────────────────────────
// Free-text refs into the Book → Concept → Row/Cell hierarchy ("BOOK0
// Concept C2 (esp. Row B)") normalize to compact mono chips; the
// annotation and full raw string stay reachable behind DetailReveal.
// Strings that don't lead with a ref fall back to plain deriveLabel.

function RefChips({ refs }: { refs: HierarchyRef[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {refs.map((r, i) => (
        <span
          key={i}
          className="inline-flex items-center text-label font-mono font-semibold text-foreground/90 border border-border/50 bg-white/[0.04] px-1.5 py-0.5 rounded leading-none whitespace-nowrap"
        >
          {formatHierarchyRef(r)}
        </span>
      ))}
    </span>
  );
}

/**
 * One normalized list item that may lead with hierarchy refs.
 * Parsed: chips + (annotation behind DetailReveal). Unparseable: the
 * existing deriveLabel/DetailReveal fallback — nothing is ever lost.
 */
export function NormalizedRefItem({ text, eyebrow }: { text: string; eyebrow: string }) {
  const parsed = parseHierarchyRef(text);
  if (!parsed) {
    return text.length > 40 ? (
      <DetailReveal
        label={deriveLabel(text, 40)}
        labelClassName="text-caption text-foreground/85 leading-snug"
        eyebrow={eyebrow}
        sections={[{ text }]}
      />
    ) : (
      <span className="text-caption text-foreground/85 leading-snug">{text}</span>
    );
  }
  if (!parsed.annotation) {
    return (
      <span title={parsed.raw}>
        <RefChips refs={parsed.refs} />
      </span>
    );
  }
  return (
    <DetailReveal
      label={<RefChips refs={parsed.refs} />}
      labelClassName="leading-none"
      eyebrow={eyebrow}
      sections={[{ text: parsed.raw }]}
    />
  );
}

// ─── Hypothesis labels ────────────────────────────────────────────────
// Hypothesis sentences are import/LLM-authored prose with NO stable
// grammar — never parsed into actions. The first layer shows the
// variable codes the sentence mentions as chips (mechanical regex
// extraction); the full sentence + isolated-variable prose stay behind
// DetailReveal. Sentences without codes fall back to deriveLabel.

/** Non-interactive chip row for codes extracted from one sentence. */
function HypothesisCodeChips({ codes, maxVisible = 4 }: { codes: string[]; maxVisible?: number }) {
  const visible = codes.slice(0, maxVisible);
  const hidden = codes.length - visible.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visible.map((c) => (
        <VariableChip key={c} code={c} />
      ))}
      {hidden > 0 && (
        <span className="text-label font-semibold text-muted-foreground/80">+{hidden}</span>
      )}
    </span>
  );
}

/**
 * First-layer rendering of one hypothesis: code chips when the sentence
 * mentions variable codes, deriveLabel otherwise — full prose always
 * behind the reveal. Not for use inside <button> cards.
 */
export function HypothesisLabel({ label, isolated }: { label: string; isolated?: string | null }) {
  const codes = extractVariableCodes(label);
  const sections = [
    { label: "Hypothesis", text: label },
    { label: "Isolates", text: isolated ? resolveInlineVariableCodes(isolated) : undefined },
  ];
  if (codes.length === 0) {
    return (
      <DetailReveal
        label={deriveLabel(label, 90)}
        eyebrow="Hypothesis"
        labelClassName="text-body text-foreground/90 leading-snug"
        sections={sections}
      />
    );
  }
  return (
    <DetailReveal
      label={<HypothesisCodeChips codes={codes} />}
      eyebrow="Hypothesis"
      labelClassName="leading-none"
      sections={sections}
    />
  );
}

/** Chips-only variant safe inside <button> cards (no nested reveal). */
export function HypothesisCodeChipsRow({ label }: { label: string }) {
  const codes = extractVariableCodes(label);
  if (codes.length === 0) return null;
  return <HypothesisCodeChips codes={codes} />;
}

/** Progressive-disclosure fold for a pillar's full detail sections
 *  (funnel, execution, placement, scaling, ICPs). Collapsed by default —
 *  pillar cards lead with label, descriptor, and variable stack. */
export function PillarDetailsFold({ pillar, profiles }: { pillar: MessagePillar; profiles?: ICPProfile[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
      >
        Pillar details
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="mt-2">
          <PillarDetailSections pillar={pillar} profiles={profiles} />
        </div>
      )}
    </div>
  );
}

// ─── Pillar detail sections ───────────────────────────────────────────
// Full picture behind a pillar: funnel role, execution specs, placement,
// scaling guidance, target ICPs. Renders only what the data carries.

const PILLAR_DETAILS: Array<{
  key: keyof MessagePillar;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "funnel_application", label: "Funnel application", Icon: Funnel },
  { key: "execution_specifications", label: "Execution specs", Icon: Wrench },
  { key: "placement_strategy", label: "Placement strategy", Icon: LayoutGrid },
  { key: "scaling_guidance", label: "Scaling guidance", Icon: TrendingUp },
];

export function pillarHasDetails(p: MessagePillar): boolean {
  return (
    PILLAR_DETAILS.some(({ key }) => typeof p[key] === "string" && (p[key] as string).length > 0) ||
    (p.target_icps?.length ?? 0) > 0
  );
}

export function PillarDetailSections({ pillar, profiles }: { pillar: MessagePillar; profiles?: ICPProfile[] }) {
  const sections = PILLAR_DETAILS.filter(
    ({ key }) => typeof pillar[key] === "string" && (pillar[key] as string).length > 0,
  );
  const icps = pillar.target_icps ?? [];
  if (sections.length === 0 && icps.length === 0) return null;
  return (
    <div className="grid grid-cols-dashboard-2 gap-3">
      {icps.length > 0 && (
        <div className="md:col-span-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="w-3.5 h-3.5 text-interactive/70" />
            <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">Targets</span>
          </div>
          <IcpChips ids={icps} profiles={profiles} />
        </div>
      )}
      {sections.map(({ key, label, Icon }) => (
        <div key={key} className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
          </div>
          <DetailReveal
            label={deriveLabel(pillar[key] as string, 72)}
            labelClassName={TYPE.body}
            eyebrow={label}
            sections={[{ text: pillar[key] as string }]}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Hypothesis status / priority ─────────────────────────────────────

export const HYP_STATUS_STYLE: Record<string, string> = {
  ready_for_brief_builder: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  validation_required: "bg-accent/10 text-accent border-accent/20",
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  p1: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  p2: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
  p3: "bg-muted text-muted-foreground/60 border-border/40",
};

export const HYP_STATUS_LABEL: Record<string, string> = {
  ready_for_brief_builder: "Ready for Brief Builder",
  validation_required: "Validation required",
  high: "High priority",
  p1: "P1 · High priority",
  medium: "Medium priority",
  p2: "P2 · Medium priority",
  low: "Low priority",
  p3: "P3 · Low priority",
};

export function HypothesisStatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex text-label font-semibold border px-1.5 py-0.5 rounded leading-none",
        HYP_STATUS_STYLE[key] ?? "bg-muted text-muted-foreground/60 border-border/40",
      )}
    >
      {HYP_STATUS_LABEL[key] ?? status}
    </span>
  );
}

// ─── Variable combinations ────────────────────────────────────────────

const RECO_STYLE: Record<string, string> = {
  scale: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  optimize: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  validate: "bg-accent/10 text-accent border-accent/20",
  avoid: "bg-red-400/10 text-red-300 border-red-400/20",
};

export function VariableCombinationsGrid({ combinations }: { combinations: VariableCombination[] }) {
  return (
    <div className="grid grid-cols-dashboard-3 gap-3">
      {combinations.map((c, i) => (
        <div key={`${c.combination}-${i}`} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            {c.context && <NormalizedRefItem text={c.context} eyebrow="Combination context" />}
            {c.recommendation && (
              <span
                className={cn(
                  "shrink-0 text-label font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                  RECO_STYLE[c.recommendation.toLowerCase()] ?? "bg-muted text-muted-foreground/60 border-border/40",
                )}
              >
                {c.recommendation}
              </span>
            )}
          </div>
          <CombinationChips combination={c.combination} />
          <div className="mt-auto pt-2 border-t border-border/20 flex items-center gap-4">
            <div>
              <div className={cn(TYPE.microLabel, "text-muted-foreground/40")}>CPA</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{fmtMetric("usd_unit", c.cpa)}</div>
            </div>
            <div>
              <div className={cn(TYPE.microLabel, "text-muted-foreground/40")}>CVR</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{fmtMetric("pct", c.cvr_pct)}</div>
            </div>
            {c.confidence && (
              <div className="ml-auto">
                <ConfidenceBadge value={c.confidence} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Scaling playbook ─────────────────────────────────────────────────

const PLAYBOOK_LANES: Array<{
  key: keyof ScalingPlaybook;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { key: "scale_now", label: "Scale now", Icon: ArrowUpRight, accent: "text-emerald-400 border-emerald-400/25 bg-emerald-400/[0.06]" },
  { key: "optimize", label: "Optimize", Icon: Sparkles, accent: "text-amber-300 border-amber-400/25 bg-amber-400/[0.06]" },
  { key: "validate", label: "Validate", Icon: FlaskConical, accent: "text-accent border-accent/25 bg-accent/[0.06]" },
  { key: "explore", label: "Explore", Icon: Search, accent: "text-purple-300 border-purple-400/25 bg-purple-400/[0.06]" },
  { key: "avoid_combinations", label: "Avoid", Icon: Ban, accent: "text-red-300 border-red-400/25 bg-red-400/[0.06]" },
];

export function playbookHasContent(pb: ScalingPlaybook | null | undefined): boolean {
  if (!pb) return false;
  return PLAYBOOK_LANES.some(({ key }) => Array.isArray(pb[key]) && (pb[key] as string[]).length > 0);
}

export function ScalingPlaybookLanes({ playbook }: { playbook: ScalingPlaybook }) {
  const lanes = PLAYBOOK_LANES.filter(
    ({ key }) => Array.isArray(playbook[key]) && (playbook[key] as string[]).length > 0,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-dashboard-playbook gap-3">
        {lanes.map(({ key, label, Icon, accent }) => (
          <div key={String(key)} className={cn("rounded-xl border p-3 flex flex-col gap-2", accent)}>
            <div className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-label font-semibold uppercase tracking-widest">{label}</span>
            </div>
            <ul className="space-y-1.5">
              {(playbook[key] as string[]).map((item, i) => (
                <li key={i}>
                  <NormalizedRefItem text={item} eyebrow={label} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {playbook.budget_reallocation_note && (
        <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
          <div className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">Budget reallocation</div>
          <DetailReveal
            label={deriveLabel(playbook.budget_reallocation_note, 72)}
            labelClassName={TYPE.body}
            eyebrow="Budget reallocation"
            sections={[{ text: playbook.budget_reallocation_note }]}
          />
        </div>
      )}
    </div>
  );
}

// ─── Persona identity ──────────────────────────────────────────────────
// Canvas "Strategy · ICP" card treatment: an initials medallion with a
// stable per-identity hue (hashed from the name, so identity reads
// consistently across sorts, sessions and — now that avatar tiles and ICP
// cards live on separate pages — across routes too). Pure presentation,
// no data invented. Shared by the MST matrix-avatar cards and the
// Strategy ICP profile cards for one consistent identity block.

export function personaHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function personaInitials(name: string): string {
  return name
    .replace(/^The\s+/i, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PersonaAvatar({ name, size = 48 }: { name: string; size?: number }) {
  const h = personaHue(name);
  return (
    <span
      aria-hidden="true"
      data-testid="persona-avatar"
      className="flex items-center justify-center rounded-full shrink-0 font-semibold text-callout"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(155deg, hsl(${h} 42% 24%), hsl(${(h + 40) % 360} 36% 14%))`,
        color: `hsl(${h} 70% 82%)`,
      }}
    >
      {personaInitials(name)}
    </span>
  );
}

// ─── Stat grid ───────────────────────────────────────────────────────
// Canvas card-face metric treatment: a hairline-divided grid of small
// kicker+value cells (not the old boxed "Performance panel" + pill list).
// One real fix in one place — every avatar/ICP/segment card composes the
// same grid instead of each hand-rolling its own metric block.

export interface StatCell {
  label: string;
  value: string;
  valueClassName?: string;
}

export function StatGrid({ cells, cols }: { cells: StatCell[]; cols?: number }) {
  if (cells.length === 0) return null;
  return (
    <div
      className="grid gap-px rounded-lg border border-border/35 bg-border/25 overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${cols ?? cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((c, i) => (
        <div key={i} className="bg-card px-2 py-1.5 text-center min-w-0">
          <div className={cn(TYPE.microLabel, "text-muted-foreground/45 truncate")}>{c.label}</div>
          <div className={cn("text-body font-semibold tabular-nums mt-0.5 truncate", c.valueClassName ?? "text-foreground/90")}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Disclosure toggle ─────────────────────────────────────────────────
// Canvas convention: chevron + label, rotating open. Every fold on the
// Avatar/ICP surfaces (creative DNA, placements, copy approach, profile
// theory, message→ICP coverage) composes from this one trigger instead of
// each accordion hand-rolling its own button markup.

export function AccordionToggle({
  label, open, onToggle, icon: Icon,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} aria-hidden />
    </button>
  );
}

// ─── DNA chip strip ───────────────────────────────────────────────────
// Shared by MST matrix-avatar cards (their own measured variables) and
// Strategy ICP profile cards (variables merged in from the avatars that
// target that profile) — one rendering for "which variables moved this
// identity's results."

export function DnaChipStrip({ variables, label, testId }: { variables: DnaVariable[]; label: string; testId: string }) {
  const [expanded, setExpanded] = useState(false);
  if (variables.length === 0) return null;
  const visible = expanded ? variables : variables.slice(0, 3);
  const overflow = variables.length - 3;
  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-1 mb-1.5">
        <Dna className="w-3.5 h-3.5 text-interactive/70" />
        <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {visible.map((v) => (
          <VariableChip key={v.code} code={v.code} showCode={false} />
        ))}
        {!expanded && overflow > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-border/40 bg-white/[0.03] text-xs px-2 py-0.5 text-muted-foreground/60 hover:text-foreground/80 hover:border-border/60 transition-colors"
          >
            +{overflow} more
          </button>
        )}
        {expanded && variables.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-full border border-border/40 bg-white/[0.03] text-xs px-2 py-0.5 text-muted-foreground/60 hover:text-foreground/80 hover:border-border/60 transition-colors"
          >
            − less
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Folded grid / list wrappers ──────────────────────────────────────
// Cognitive-load cap for unbounded card lists: first `limit` items visible
// until an explicit "Show all …" toggle. Shared by every card grid across
// the Avatars/ICP and MST-overview surfaces.

export function FoldedGrid<T>({
  items, limit, noun, gridClassName, renderItem,
}: {
  items: T[];
  limit: number;
  noun: string;
  gridClassName: string;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const fold = useShowMore(items, limit);
  return (
    <>
      <div className={gridClassName}>
        {fold.visible.map((item, i) => renderItem(item, i))}
      </div>
      <ShowMoreButton
        total={items.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun={noun}
      />
    </>
  );
}

export function FoldedList<T>({
  items, limit, noun, listClassName, renderItem,
}: {
  items: T[];
  limit: number;
  noun: string;
  listClassName: string;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const fold = useShowMore(items, limit);
  return (
    <div className={listClassName}>
      {fold.visible.map((item, i) => renderItem(item, i))}
      <ShowMoreButton
        total={items.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun={noun}
      />
    </div>
  );
}
