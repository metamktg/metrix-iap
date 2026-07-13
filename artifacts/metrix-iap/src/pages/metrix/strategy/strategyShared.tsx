// ─── Shared building blocks for the Strategy pages ────────────────────
// Reusable, data-honest presentational pieces: pillar detail sections,
// readable variable-stack chips, ICP chips, hypothesis badges, and the
// variable-combination / scaling-playbook visualizations.

import { cn } from "@/lib/utils";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { fmtUSD, fmtPct, ConfidenceBadge } from "../shared";
import { Funnel, Wrench, LayoutGrid, TrendingUp, Users, ArrowUpRight, Ban, FlaskConical, Search, Sparkles } from "lucide-react";
import type { MessagePillar, ICPProfile, VariableCombination, ScalingPlaybook } from "@/lib/data/seedTypes";

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

/** One readable chip per variable code, colored by family prefix. Code shown as tooltip on hover. */
export function VariableChip({ code, showCode = false }: { code: string; showCode?: boolean }) {
  const prefix = getVariablePrefix(code);
  return (
    <span
      title={code}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium border px-1.5 py-0.5 rounded leading-none",
        PREFIX_COLORS[prefix],
      )}
    >
      {resolveVariableLabel(code)}
      {showCode && <span className="font-mono text-[8px] opacity-60">{code}</span>}
    </span>
  );
}

/** Readable chips for a `variable_stack` record ({ family: code }). */
export function VariableStackChips({ stack }: { stack: Record<string, string> }) {
  const entries = Object.entries(stack).filter(([, v]) => Boolean(v));
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([family, code]) => (
        <span
          key={family}
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-medium border px-1.5 py-1 rounded leading-none",
            PREFIX_COLORS[getVariablePrefix(code)],
          )}
        >
          <span className="uppercase tracking-wide text-[8px] opacity-60">{familyLabel(family)}</span>
          {resolveVariableLabel(code)}
        </span>
      ))}
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

export function IcpChips({ ids, profiles }: { ids: string[] | undefined; profiles?: ICPProfile[] }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground/85 border border-border/40 bg-white/[0.03] px-1.5 py-1 rounded leading-none"
          title={id}
        >
          <Users className="w-2.5 h-2.5 text-primary/70" />
          {icpName(profiles, id)}
        </span>
      ))}
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {icps.length > 0 && (
        <div className="md:col-span-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="w-3 h-3 text-primary/70" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Targets</span>
          </div>
          <IcpChips ids={icps} profiles={profiles} />
        </div>
      )}
      {sections.map(({ key, label, Icon }) => (
        <div key={key} className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
          </div>
          <p className="text-[11.5px] text-foreground/80 leading-relaxed">{pillar[key] as string}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Hypothesis status / priority ─────────────────────────────────────

export const HYP_STATUS_STYLE: Record<string, string> = {
  ready_for_brief_builder: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  validation_required: "bg-blue-400/10 text-blue-300 border-blue-400/20",
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
        "inline-flex text-[9px] font-semibold border px-1.5 py-0.5 rounded leading-none",
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
  validate: "bg-blue-400/10 text-blue-300 border-blue-400/20",
  avoid: "bg-red-400/10 text-red-300 border-red-400/20",
};

export function VariableCombinationsGrid({ combinations }: { combinations: VariableCombination[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {combinations.map((c, i) => (
        <div key={`${c.combination}-${i}`} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            {c.context && <span className="text-[10px] font-mono text-muted-foreground/70">{c.context}</span>}
            {c.recommendation && (
              <span
                className={cn(
                  "shrink-0 text-[9px] font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
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
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">CPA</div>
              <div className="text-[14px] font-bold text-foreground tabular-nums">{c.cpa != null ? fmtUSD(c.cpa) : "—"}</div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">CVR</div>
              <div className="text-[14px] font-bold text-foreground tabular-nums">{c.cvr_pct != null ? fmtPct(c.cvr_pct) : "—"}</div>
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
  { key: "validate", label: "Validate", Icon: FlaskConical, accent: "text-blue-300 border-blue-400/25 bg-blue-400/[0.06]" },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {lanes.map(({ key, label, Icon, accent }) => (
          <div key={String(key)} className={cn("rounded-xl border p-3 flex flex-col gap-2", accent)}>
            <div className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
            </div>
            <ul className="space-y-1.5">
              {(playbook[key] as string[]).map((item, i) => (
                <li key={i} className="text-[11px] text-foreground/85 leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {playbook.budget_reallocation_note && (
        <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">Budget reallocation</div>
          <p className="text-[11.5px] text-foreground/80 leading-relaxed">{playbook.budget_reallocation_note}</p>
        </div>
      )}
    </div>
  );
}
