// ─── Strategy · Avatars / ICP ─────────────────────────────────────────
// Performance-first: sticky sort/filter bar, view toggle (Matrix Avatars
// vs ICP Profiles), per-avatar metric pills + normalised spend bar.
// Creative DNA collapses behind a disclosure. ICP cards: performance →
// recommendation → placements accordion → copy approach → theory.

import { TYPE } from "../typography";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getStrategyData, getAds } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, resultTerm, SectionCard, ConfidenceBadge,
  fmtUSD, fmtPct, fmtNum,
  DetailReveal, deriveLabel, SegmentedToggle, PILL_ACTIVE, PILL_INACTIVE,
  useShowMore, ShowMoreButton, SegmentGenderIcon,
} from "../shared";
import { DemographicTable } from "../analysis/tables";
import { VariableStackChips, VariableChip, familyLabel } from "./strategyShared";
import {
  computeAvatarDna, mergeAvatarDna, columnIdForCell,
  type AvatarDna, type DnaVariable,
} from "@/lib/creative-dna";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import {
  listSegments, computeSegmentTotals, deriveSegmentMetrics,
  assessSegmentSignal, computeSegmentAttribution,
  segmentLabel, segmentKey, scopeDemographicRows,
  type SegmentId, type SegmentRawTotals, type SegmentDerivedMetrics, type SegmentSignal,
} from "@/lib/segment-analytics";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import {
  Users, Fingerprint, DoorOpen, MessageSquareQuote, Compass,
  ArrowDownRight, ArrowUpRight, ArrowDown, ArrowUp, Dna, ChevronDown, ChevronRight, Search, MapPin,
} from "lucide-react";
import type {
  MSTMatrixColumn, MSTMatrixCell, ICPProfile, PlacementRow, AnalysisData,
  AdRecord, ActiveHypothesis,
} from "@/lib/data/seedTypes";
import { cn } from "@workspace/command-deck/lib/utils";

const SECTION = "Strategy · 04";

// ─── Types & constants ─────────────────────────────────────────────────

type SortKey = "spend" | "cpa" | "cvr" | "cpm" | "confidence";
type ViewMode = "avatars" | "profiles";

const SORT_LABEL: Record<SortKey, string> = {
  spend: "Spend",
  cpa: "CPA",
  cvr: "Link CVR",
  cpm: "CPM",
  confidence: "Confidence",
};

/** "asc" = lower is better (cost metrics), "desc" = higher is better. Drives the sort-pill arrow. */
const SORT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  spend: "desc",
  cpa: "asc",
  cvr: "desc",
  cpm: "asc",
  confidence: "desc",
};

const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, directional: 2, low: 3 };

interface ColumnPerf {
  spend: number;
  results: number;
  cpa: number | null;
  /** link clicks ÷ impressions × 100 */
  cvr: number | null;
  /** upper-funnel reach efficiency: spend ÷ impressions × 1000 */
  cpm: number | null;
}

/** Stable per-avatar accent so identity reads consistently regardless of sort order. */
const AVATAR_ACCENTS = [
  { icon: "text-blue-300", chip: "border-blue-400/30 bg-chart-1/10", rail: "before:bg-chart-1/70", bar: "bg-chart-1/70" },
  { icon: "text-violet-300", chip: "border-violet-400/30 bg-violet-400/10", rail: "before:bg-violet-400/70", bar: "bg-violet-400/70" },
  { icon: "text-amber-300", chip: "border-amber-400/30 bg-amber-400/10", rail: "before:bg-amber-400/70", bar: "bg-amber-400/70" },
  { icon: "text-teal-300", chip: "border-teal-400/30 bg-teal-400/10", rail: "before:bg-teal-400/70", bar: "bg-teal-400/70" },
  { icon: "text-fuchsia-300", chip: "border-fuchsia-400/30 bg-fuchsia-400/10", rail: "before:bg-fuchsia-400/70", bar: "bg-fuchsia-400/70" },
  { icon: "text-sky-300", chip: "border-sky-400/30 bg-sky-400/10", rail: "before:bg-sky-400/70", bar: "bg-sky-400/70" },
] as const;

function avatarAccent(index: number) {
  return AVATAR_ACCENTS[index % AVATAR_ACCENTS.length];
}

// ─── Per-column performance ────────────────────────────────────────────

function computeColumnPerf(
  columnId: string,
  columnIds: string[],
  analysis: AnalysisData | null | undefined,
): ColumnPerf {
  const rows = (analysis?.performance_by_cell ?? []).filter(
    (r) => columnIdForCell(r.cell_id, columnIds) === columnId,
  );
  if (rows.length === 0) return { spend: 0, results: 0, cpa: null, cvr: null, cpm: null };
  const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const impressions = rows.reduce((s, r) => s + r.Impressions, 0);
  const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
  return {
    spend,
    results,
    cpa: results > 0 ? spend / results : null,
    cvr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

// ─── Metric pill ──────────────────────────────────────────────────────

function MetricPill({ label, value, colorClass, active, direction }: {
  label: string;
  value: string;
  colorClass?: string;
  /** True when this is the metric currently driving sort order — gets a visible highlight. */
  active?: boolean;
  direction?: "asc" | "desc";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors",
        active && "bg-primary/[0.07] ring-1 ring-primary/25"
      )}
    >
      <span className={cn(
        "text-label font-semibold normal-case inline-flex items-center gap-0.5",
        active ? "text-interactive/90" : "text-muted-foreground/60"
      )}>
        {label}
        {active && direction && (direction === "asc"
          ? <ArrowUp className="w-2.5 h-2.5" />
          : <ArrowDown className="w-2.5 h-2.5" />)}
      </span>
      <span className={cn(
        "text-callout font-extrabold tabular-nums leading-none",
        colorClass ?? (active ? "text-foreground" : "text-foreground/85")
      )}>
        {value}
      </span>
    </div>
  );
}

// ─── IcpFact ──────────────────────────────────────────────────────────

function IcpFact({ label, value, Icon }: {
  label: string;
  value?: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  if (!value) return null;
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
      </div>
      {value.length > 72 ? (
        <DetailReveal
          label={deriveLabel(value, 64)}
          labelClassName={TYPE.body}
          eyebrow={label}
          sections={[{ text: value }]}
        />
      ) : (
        <p className={TYPE.body}>{value}</p>
      )}
    </div>
  );
}

// ─── DNA variable line ─────────────────────────────────────────────────

function DnaVariableLine({ v, resultNoun }: { v: DnaVariable; resultNoun: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/15 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <VariableChip code={v.code} />
        {v.family && (
          <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/50">
            {familyLabel(v.family)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 tabular-nums">
        <span className="text-label text-muted-foreground/70">{fmtUSD(v.spend, 0)}</span>
        <span className="text-label text-muted-foreground/70">{fmtNum(v.results)} {resultNoun}</span>
        <span className="text-label font-semibold text-foreground/85">
          {v.cpa != null ? `${fmtUSD(v.cpa)} CPA` : "no CPA"}
        </span>
      </div>
    </div>
  );
}

// ─── DNA chip strip ───────────────────────────────────────────────────

function DnaChipStrip({ variables, label, testId }: { variables: DnaVariable[]; label: string; testId: string }) {
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

// ─── Sort / filter bar ────────────────────────────────────────────────

function SortFilterBar({
  viewMode, onViewMode, sortBy, onSort, search, onSearch,
}: {
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  sortBy: SortKey;
  onSort: (k: SortKey) => void;
  search: string;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 px-6 py-2.5 border-b border-border/30 bg-surface-deep/95 backdrop-blur-sm flex-wrap shrink-0">
      {/* View toggle */}
      <SegmentedToggle
        ariaLabel="Avatar view mode"
        options={[
          { id: "avatars" as ViewMode, label: "Avatars", Icon: Users },
          { id: "profiles" as ViewMode, label: "Profiles", Icon: Fingerprint },
        ]}
        active={viewMode}
        onChange={onViewMode}
      />

      <div className="w-px h-5 bg-border/40" />

      {/* Sort options — CPM only applies to avatar-level (impression) data */}
      <div className="flex items-center gap-1.5" role="group" aria-label="Sort avatars">
        <span className="text-label font-semibold text-muted-foreground/40 normal-case tracking-normal">Sort</span>
        {(Object.keys(SORT_LABEL) as SortKey[])
          .filter((k) => k !== "cpm" || viewMode === "avatars")
          .map((k) => {
            const active = sortBy === k;
            return (
              <button
                key={k}
                onClick={() => onSort(k)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-body font-semibold transition-colors border",
                  active ? PILL_ACTIVE : PILL_INACTIVE
                )}
              >
                {SORT_LABEL[k]}
                {active && (SORT_DIRECTION[k] === "asc"
                  ? <ArrowUp className="w-3 h-3" />
                  : <ArrowDown className="w-3 h-3" />)}
              </button>
            );
          })}
      </div>

      {/* Profile search — only in profiles view */}
      {viewMode === "profiles" && (
        <>
          <div className="w-px h-5 bg-border/40" />
          <div className="flex items-center gap-1.5 border border-border/30 bg-white/[0.02] rounded-md px-2.5 py-1.5">
            <Search className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Filter profiles…"
              className="bg-transparent text-body text-foreground/85 placeholder:text-muted-foreground/35 outline-none w-32"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Avatar card ──────────────────────────────────────────────────────

function AvatarCard({
  col, cells, perf, maxSpend, matched, flash, registerRef,
  onClickAvatar, onScrollProfile, dna, accentIndex, rank, sortBy,
}: {
  col: MSTMatrixColumn;
  cells: MSTMatrixCell[];
  perf: ColumnPerf;
  maxSpend: number;
  matched: ICPProfile[];
  flash: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onClickAvatar: (col: MSTMatrixColumn, cells: MSTMatrixCell[]) => void;
  onScrollProfile: (profileId: string) => void;
  dna: AvatarDna | null;
  /** Stable identity index (original matrix order) — drives the accent color, independent of sort. */
  accentIndex: number;
  /** 1-based position in the currently sorted list — shown as a rank badge. */
  rank: number;
  sortBy: SortKey;
}) {
  const [dnaOpen, setDnaOpen] = useState(false);
  const spendPct = maxSpend > 0 ? (perf.spend / maxSpend) * 100 : 0;
  const hasPerf = perf.spend > 0 || perf.cpa != null;
  const accent = avatarAccent(accentIndex);

  return (
    <div
      ref={registerRef}
      className={cn(
        "relative rounded-xl border bg-white/[0.02] transition-colors duration-500 scroll-mt-24",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-xl",
        accent.rail,
        flash ? "border-primary/70 bg-primary/[0.06]" : "border-border/40 hover:border-border/60"
      )}
    >
      {/* Rank badge — reinforces that re-sorting actually reordered the grid */}
      <span
        className="absolute top-3 right-3.5 text-label font-mono font-semibold text-muted-foreground/35 tabular-nums"
        aria-hidden="true"
      >
        #{rank}
      </span>

      <button
        onClick={() => onClickAvatar(col, cells)}
        className="group w-full text-left pl-5 pr-4 py-4 hover:bg-white/[0.03] transition-colors rounded-xl"
      >
        {/* L1: identity — the primary visual anchor on the card */}
        <div className="flex items-center gap-2.5 mb-3.5 pr-6">
          <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center shrink-0", accent.chip)}>
            <Users className={cn("w-5 h-5", accent.icon)} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground leading-tight tracking-tight whitespace-pre-line">{col.name}</p>
            <span className="inline-block mt-0.5 text-label font-mono text-muted-foreground/55">{col.icp}</span>
          </div>
        </div>

        {/* L1: metric pills — the active sort metric is visually highlighted */}
        {hasPerf && (
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            <MetricPill label="Spend" value={fmtUSD(perf.spend, 0)} active={sortBy === "spend"} direction={SORT_DIRECTION.spend} />
            <MetricPill label="CPA" value={perf.cpa != null ? fmtUSD(perf.cpa) : "—"} active={sortBy === "cpa"} direction={SORT_DIRECTION.cpa} />
            <MetricPill label="Link CVR" value={perf.cvr != null ? fmtPct(perf.cvr) : "—"} active={sortBy === "cvr"} direction={SORT_DIRECTION.cvr} />
            <MetricPill label="CPM" value={perf.cpm != null ? fmtUSD(perf.cpm) : "—"} active={sortBy === "cpm"} direction={SORT_DIRECTION.cpm} />
          </div>
        )}

        {/* L1: spend bar (normalised across all avatars) */}
        {maxSpend > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex-1 h-[3px] rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <div
                className={cn("h-full rounded-full", accent.bar)}
                style={{ width: `${Math.min(spendPct, 100)}%` }}
              />
            </div>
            <span className="text-label text-muted-foreground/40 tabular-nums shrink-0">
              {spendPct.toFixed(0)}% of top spend
            </span>
          </div>
        )}

        <p className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground/65 group-hover:text-interactive transition-colors">
          {cells.length} angle{cells.length !== 1 ? "s" : ""} · tap for detail
          <ChevronRight className="w-3 h-3 opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </p>
      </button>

      {/* L2: Creative DNA — collapsed by default */}
      {dna && dna.variables.length > 0 && (
        <div className={cn("border-t border-border/20", dnaOpen && "bg-white/[0.015]")}>
          <button
            type="button"
            onClick={() => setDnaOpen((o) => !o)}
            className="w-full flex items-center justify-between pl-5 pr-4 py-2 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Dna className={cn("w-3.5 h-3.5", accent.icon)} />
              <span className="text-label font-bold text-muted-foreground/75 uppercase tracking-widest">
                Creative DNA
              </span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/40 transition-transform", dnaOpen && "rotate-180")} />
          </button>
          {dnaOpen && (
            <div className="pl-5 pr-4 pb-3">
              <DnaChipStrip
                variables={dna.variables}
                label={`Measured · ${dna.measuredCellIds.length} angle${dna.measuredCellIds.length === 1 ? "" : "s"}`}
                testId={`avatar-dna-${col.id}`}
              />
            </div>
          )}
        </div>
      )}

      {/* ICP profile links */}
      {matched.length > 0 && (
        <div className="pl-5 pr-4 pb-3 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/20">
          <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/60">
            ICP profile{matched.length === 1 ? "" : "s"}
          </span>
          {matched.map((p) => (
            <button
              key={p.profile_id}
              onClick={() => onScrollProfile(p.profile_id)}
              className="inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
              data-testid={`link-avatar-icp-${p.profile_id}`}
            >
              {p.profile_name}
              <ArrowDownRight className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Placements accordion ─────────────────────────────────────────────

function PlacementsAccordion({ rows }: { rows: PlacementRow[] }) {
  const [open, setOpen] = useState(false);
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) return null;
  return (
    <div>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              Account placements
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px]">
            <p className="text-caption leading-relaxed">
              Account-level placement signal — no per-profile breakdown available.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <div className="mt-2 space-y-1.5">
          {top3.map((r, i) => (
            <div key={r.Placement + r.Platform + i} className="flex items-center justify-between gap-2 rounded-lg border border-border/25 bg-white/[0.015] px-3 py-2">
              <div className="min-w-0">
                <p className={cn(TYPE.title, "font-medium truncate")}>{r.Placement}</p>
                <span className={cn(TYPE.label, "text-muted-foreground/50 capitalize")}>{r.Platform}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 tabular-nums">
                <div className="text-right">
                  <p className={cn(TYPE.label, "text-muted-foreground/50")}>Spend</p>
                  <p className={cn(TYPE.body, "font-semibold text-foreground/80")}>{fmtUSD(r["Amount spent (USD)"], 0)}</p>
                </div>
                {r.CPA != null && (
                  <div className="text-right">
                    <p className={cn(TYPE.label, "text-muted-foreground/50")}>CPA</p>
                    <p className={cn(TYPE.body, "font-semibold text-foreground/80")}>{fmtUSD(r.CPA)}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ICP profile card ─────────────────────────────────────────────────

function IcpProfileCard({
  profile, registerRef, flash, avatars, onAvatarClick, dna,
  placementRows, avgCpa, avgCvr, hypotheses,
}: {
  profile: ICPProfile;
  registerRef?: (el: HTMLDivElement | null) => void;
  flash?: boolean;
  avatars?: MSTMatrixColumn[];
  onAvatarClick?: (columnId: string) => void;
  dna?: DnaVariable[];
  placementRows: PlacementRow[];
  avgCpa: number | null;
  avgCvr?: number | null;
  hypotheses?: ActiveHypothesis[];
}) {
  const perf = profile.performance_data ?? null;
  const hasPerf = perf != null && (perf.spend != null || perf.cpa != null || perf.cvr_link_pct != null);
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const hasTheory = Boolean(
    profile.demographic_foundation || profile.psychographic_profile ||
    profile.behavioral_signals || profile.funnel_entry_point,
  );
  const hasCopy = Boolean(
    profile.message_resonance || (dna && dna.length > 0) || (hypotheses && hypotheses.length > 0),
  );

  function cpaColor(cpa: number | null): string {
    if (cpa == null || avgCpa == null || avgCpa <= 0) return "text-foreground/85";
    const ratio = cpa / avgCpa;
    if (ratio < 0.85) return "text-emerald-400";
    if (ratio <= 1.15) return "text-amber-300";
    return "text-red-300";
  }

  function cvrColor(cvr: number | null): string {
    if (cvr == null || avgCvr == null || avgCvr <= 0) return "text-foreground/85";
    const ratio = cvr / avgCvr;
    if (ratio > 1.15) return "text-emerald-400";
    if (ratio >= 0.85) return "text-amber-300";
    return "text-red-300";
  }

  return (
    <div
      ref={registerRef}
      className={cn(
        "rounded-xl border bg-white/[0.02] p-4 transition-colors duration-500 scroll-mt-24",
        flash ? "border-primary/70 bg-primary/[0.06]" : "border-border/40"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-title font-semibold text-foreground leading-tight">{profile.profile_name}</p>
          <span className="text-label font-mono text-muted-foreground/60">{profile.profile_id}</span>
        </div>
        {profile.confidence_level && <ConfidenceBadge value={profile.confidence_level} />}
      </div>

      <div className="space-y-3 mt-3">
        {/* 1. Performance pills */}
        {hasPerf && (
          <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">Performance</span>
              {perf?.confidence && <ConfidenceBadge value={perf.confidence} />}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MetricPill label="Spend" value={perf?.spend != null ? fmtUSD(perf.spend, 0) : "—"} />
              <MetricPill
                label="CPA"
                value={perf?.cpa != null ? fmtUSD(perf.cpa) : "—"}
                colorClass={cpaColor(perf?.cpa ?? null)}
              />
              <MetricPill
                label="Link CVR"
                value={perf?.cvr_link_pct != null ? fmtPct(perf.cvr_link_pct) : "—"}
                colorClass={cvrColor(perf?.cvr_link_pct ?? null)}
              />
            </div>
            {/* Performance bar — CPA vs account average */}
            {perf?.cpa != null && avgCpa != null && avgCpa > 0 && (
              <div className="mt-2 pt-2 border-t border-border/15">
                <div className="relative h-1 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  {(() => {
                    const pct = Math.min(Math.max((perf.cpa / (2 * avgCpa)) * 100, 0), 100);
                    if (perf.cpa < avgCpa) {
                      return (
                        <div
                          className="absolute inset-y-0 bg-emerald-400/50"
                          style={{ left: `${pct}%`, right: "50%" }}
                        />
                      );
                    }
                    return (
                      <div
                        className="absolute inset-y-0 bg-red-400/40"
                        style={{ left: "50%", right: `${100 - pct}%` }}
                      />
                    );
                  })()}
                </div>
                <div className="flex items-center justify-between mt-0.5 text-label text-muted-foreground/35">
                  <span>best</span>
                  <span>avg {fmtUSD(avgCpa)}</span>
                  <span>2×avg</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Recommendation */}
        {profile.strategic_recommendation && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.05] p-3">
            <div className="text-label font-semibold uppercase tracking-widest text-interactive/80 mb-0.5">Recommendation</div>
            <DetailReveal
              label={deriveLabel(profile.strategic_recommendation, 72)}
              labelClassName={TYPE.body}
              eyebrow="Recommendation"
              sections={[{ text: profile.strategic_recommendation }]}
            />
          </div>
        )}

        {/* 3. Placements accordion */}
        <PlacementsAccordion rows={placementRows} />

        {/* 4. Copy approach accordion */}
        {hasCopy && (
          <div>
            <button
              type="button"
              onClick={() => setCopyOpen((o) => !o)}
              className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
            >
              <MessageSquareQuote className="w-3.5 h-3.5" />
              Copy approach
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", copyOpen && "rotate-180")} />
            </button>
            {copyOpen && (
              <div className="mt-2.5 space-y-2.5">
                {profile.message_resonance && (
                  <DetailReveal
                    label={deriveLabel(profile.message_resonance, 72)}
                    labelClassName={TYPE.body}
                    eyebrow="Message resonance"
                    sections={[{ text: profile.message_resonance }]}
                  />
                )}
                {dna && dna.length > 0 && (
                  <DnaChipStrip
                    variables={dna}
                    label="Creative DNA · via avatars"
                    testId={`icp-dna-${profile.profile_id}`}
                  />
                )}
                {hypotheses && hypotheses.length > 0 && (
                  <div>
                    <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                      Hypothesis test variants
                    </p>
                    <div className="space-y-1.5">
                      {hypotheses.map((h) => (
                        <div key={h.id} className="rounded-lg border border-border/25 bg-white/[0.015] px-3 py-2">
                          {h.isolated_variable && (
                            <span className="inline-block text-label font-mono text-interactive/70 border border-primary/25 px-1.5 py-0.5 rounded mb-1">
                              {h.isolated_variable}
                            </span>
                          )}
                          <DetailReveal
                            label={deriveLabel(h.test_variant!, 64)}
                            labelClassName={TYPE.body}
                            eyebrow="Test variant"
                            sections={[
                              { text: h.test_variant! },
                              ...(h.success_criteria ? [{ label: "Success criteria", text: h.success_criteria }] : []),
                            ]}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. Profile theory accordion */}
        {hasTheory && (
          <div>
            <button
              type="button"
              onClick={() => setTheoryOpen((o) => !o)}
              aria-expanded={theoryOpen}
              className="inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", theoryOpen && "rotate-180")} />
              {theoryOpen ? "Hide profile theory" : "Profile theory"}
            </button>
            {theoryOpen && (
              <div className="grid grid-cols-dashboard-2-lg gap-x-4 gap-y-2.5 mt-2.5">
                <IcpFact label="Demographics" value={profile.demographic_foundation} Icon={Users} />
                <IcpFact label="Psychographics" value={profile.psychographic_profile} Icon={Fingerprint} />
                <IcpFact label="Behavioral signals" value={profile.behavioral_signals} Icon={Compass} />
                <IcpFact label="Funnel entry" value={profile.funnel_entry_point} Icon={DoorOpen} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Avatar back-links */}
      {avatars && avatars.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/20 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/60">
            Avatar{avatars.length === 1 ? "" : "s"}
          </span>
          {avatars.map((col) => (
            <button
              key={col.id}
              onClick={() => onAvatarClick?.(col.id)}
              className="inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
              data-testid={`link-icp-avatar-${col.id}`}
            >
              {col.name.replace(/\n/g, " ")}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Audience segment tile ────────────────────────────────────────────
// Primary organizing authority: each demographic segment is a standalone
// tile showing performance, confidence, best variable, and explore CTA.

function AudienceSegmentTile({
  seg, totals, derived, signal, bestVariableCode, onExplore,
}: {
  seg: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
  signal: SegmentSignal;
  bestVariableCode: string | null;
  onExplore: () => void;
}) {
  const hasSpend = totals.spend != null && totals.spend > 0;
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-3">
      {/* L1: identity + confidence badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 min-w-0">
          <SegmentGenderIcon gender={seg.gender} />
          <span className={cn(TYPE.title, "text-foreground leading-snug truncate")}>
            {segmentLabel(seg)}
          </span>
        </p>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-0.5 cursor-default",
                  TYPE.label,
                  signal.low
                    ? "border-amber-400/30 bg-amber-400/[0.08] text-amber-400"
                    : "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-400",
                )}
              >
                {signal.low ? "low signal" : "signal ✓"}
                <span className="sr-only">
                  {signal.low
                    ? ` — ${signal.reasons.join(" ")}`
                    : " — Sufficient spend and impressions for a reliable read."}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px]">
              <p className="text-caption leading-relaxed">
                {signal.low
                  ? signal.reasons.join(" ")
                  : "Sufficient spend and impressions for a reliable read."}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* L1: 3 performance pills */}
      {hasSpend ? (
        <div className="grid grid-cols-3 gap-2">
          <MetricPill label="Spend" value={fmtUSD(totals.spend!, 0)} />
          <MetricPill label="CPA" value={derived.cpa != null ? fmtUSD(derived.cpa) : "—"} />
          <MetricPill label="Link CVR" value={derived.cvr != null ? fmtPct(derived.cvr) : "—"} />
        </div>
      ) : (
        <p className={cn(TYPE.caption, "text-muted-foreground/50")}>No spend data for this segment.</p>
      )}

      {/* L1: best variable signal */}
      <div className="flex items-center gap-1.5 min-h-[1.25rem]">
        <span className={cn(TYPE.label, "text-muted-foreground/50 normal-case")}>Top variable</span>
        {bestVariableCode ? (
          <VariableChip code={bestVariableCode} showCode={false} />
        ) : (
          <span className={cn(TYPE.label, "text-muted-foreground/30 normal-case")}>—</span>
        )}
      </div>

      {/* Explore CTA */}
      <button
        type="button"
        onClick={onExplore}
        className={cn(
          "mt-auto self-start inline-flex items-center gap-1",
          TYPE.caption,
          "font-medium text-interactive hover:text-primary/80 transition-colors",
        )}
      >
        Explore segment
        <ArrowDownRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Combinations panel ───────────────────────────────────────────────
// Unified concept × placement × platform table ranked by CPA (top 10,
// expandable). Concept rows show "—" for placement/platform; placement
// rows show "—" for concept. All sorted by CPA ascending.

type ComboRow = {
  concept: string;
  placement: string;
  platform: string;
  spend: number;
  results: number;
  cpa: number | null;
  rowKey: string;
};

function CombosPanel({ analysis, resultNoun }: {
  analysis: AnalysisData | null | undefined;
  resultNoun: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo((): ComboRow[] => {
    const out: ComboRow[] = [];

    // Concept rows — deduped by concept name, best CPA per concept
    const source = analysis?.performance_by_cell ?? [];
    const byCellId = new Map<string, typeof source[number]>();
    for (const r of source) {
      if (r.Results <= 0 || r.CPA_result == null) continue;
      const prev = byCellId.get(r.cell_id);
      if (!prev || r.Results > prev.Results) byCellId.set(r.cell_id, r);
    }
    const byConcept = new Map<string, typeof source[number]>();
    for (const r of byCellId.values()) {
      if (!r.book2_concept_name) continue;
      const prev = byConcept.get(r.book2_concept_name);
      if (!prev || (r.CPA_result ?? Infinity) < (prev.CPA_result ?? Infinity)) {
        byConcept.set(r.book2_concept_name, r);
      }
    }
    for (const r of byConcept.values()) {
      out.push({
        concept: r.book2_concept_name!,
        placement: "—",
        platform: "—",
        spend: r["Amount spent (USD)"],
        results: r.Results,
        cpa: r.CPA_result ?? null,
        rowKey: `concept:${r.book2_concept_name}`,
      });
    }

    // Placement rows — from v3_placement_signal
    for (const r of (analysis?.v3_placement_signal ?? [])) {
      if (r.Results <= 0 || r.CPA == null) continue;
      out.push({
        concept: "—",
        placement: r.Placement,
        platform: r.Platform,
        spend: r["Amount spent (USD)"],
        results: r.Results,
        cpa: r.CPA,
        rowKey: `placement:${r.Placement}:${r.Platform}`,
      });
    }

    return out.sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  }, [analysis]);

  const visible = expanded ? rows : rows.slice(0, 10);

  if (rows.length === 0) return null;

  return (
    <SectionCard
      title="Creative combos"
      desc="Concept × placement × platform · ranked by CPA · top 10"
    >
      <div className="rounded-xl border border-border/40 overflow-hidden bg-white/[0.015]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-table z-10">
              <tr className="border-b border-border/40">
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-left">Concept</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-left">Placement</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-left">Platform</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-right">Spend</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-right">Results</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.rowKey} className="border-b border-border/20 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-body text-foreground/85 font-medium max-w-[160px] truncate">
                    {r.concept}
                  </td>
                  <td className="px-3 py-2 text-body text-foreground/70 max-w-[140px] truncate">
                    {r.placement}
                  </td>
                  <td className="px-3 py-2 text-body text-muted-foreground/60 capitalize">
                    {r.platform}
                  </td>
                  <td className="px-3 py-2 text-right text-body tabular-nums text-foreground/70">
                    {fmtUSD(r.spend, 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-body tabular-nums text-foreground/70">
                    {fmtNum(r.results)} {resultNoun}
                  </td>
                  <td className="px-3 py-2 text-right text-body font-semibold tabular-nums text-foreground/85">
                    {r.cpa != null ? fmtUSD(r.cpa) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 10 && (
          <button
            onClick={() => setExpanded((o) => !o)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-body font-medium text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/[0.02] border-t border-border/30 transition-colors"
          >
            {expanded ? "Show fewer" : `Show all ${rows.length} combinations`}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Drawer ad list ───────────────────────────────────────────────────
// Owns the showAll state so it can live in a component rather than an IIFE.

function DrawerAdList({
  matchedAds,
  cellPerf,
  resultNoun,
}: {
  matchedAds: Array<AdRecord & { cell_id: string }>;
  cellPerf: Map<string, { spend: number; results: number }>;
  resultNoun: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (matchedAds.length === 0) {
    return (
      <p className="text-caption text-muted-foreground/70">
        No ad records matched to this avatar's cells.
      </p>
    );
  }
  const visible = showAll ? matchedAds : matchedAds.slice(0, 8);
  return (
    <div className="space-y-2">
      {visible.map((ad, i) => {
        const perf = cellPerf.get(ad.cell_id);
        return (
          <div
            key={ad.ad_name + i}
            className="flex items-start justify-between gap-2 border-b border-border/15 pb-1.5 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-body font-medium text-foreground/85 truncate" title={ad.ad_name}>
                {ad.ad_name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {ad.cell && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-label font-mono border border-border/30 px-1 py-0.5 rounded text-muted-foreground/55 cursor-default">
                          {ad.cell}
                          <span className="sr-only">{` — matrix cell${ad.concept ? ` for ${ad.concept}` : ""}`}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-caption leading-relaxed">
                          Matrix cell <span className="font-mono">{ad.cell}</span>
                          {ad.concept ? ` — ${ad.concept}` : ""}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {ad.concept && (
                  <span className="text-label text-muted-foreground/55">{ad.concept}</span>
                )}
              </div>
            </div>
            {perf && (perf.spend > 0 || perf.results > 0) && (
              <div className="flex items-center gap-3 shrink-0 tabular-nums text-right">
                {perf.spend > 0 && (
                  <div>
                    <p className="text-label text-muted-foreground/50">Spend</p>
                    <p className="text-body text-foreground/70">{fmtUSD(perf.spend, 0)}</p>
                  </div>
                )}
                {perf.results > 0 && (
                  <div>
                    <p className="text-label text-muted-foreground/50">Results</p>
                    <p className="text-body text-foreground/70">{fmtNum(perf.results)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {matchedAds.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-interactive underline-offset-2 hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${matchedAds.length} ads`}
        </button>
      )}
    </div>
  );
}

// ─── Folded grid / list wrappers ──────────────────────────────────────
// The three unbounded lists below live inside the ModuleScopeGate render
// callback, so the show-more hook is extracted into these small components
// to keep it called unconditionally (rules of hooks).

function FoldedGrid<T>({
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

function FoldedList<T>({
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

// ─── Main view ────────────────────────────────────────────────────────

export function AvatarsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  // ─── Sort / filter state ──────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("avatars");
  const [sortBy, setSortBy] = useState<SortKey>("spend");
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Drawer & segment state ───────────────────────────────────────
  const [detail, setDetail] = useState<{ column: MSTMatrixColumn; cells: MSTMatrixCell[] } | null>(null);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [audienceSegment, setAudienceSegment] = useState<SegmentId | null>(null);

  // ─── Cross-view scroll: pending scroll after view-switch ─────────
  const [pendingProfileScroll, setPendingProfileScroll] = useState<string | null>(null);
  const [pendingAvatarScroll, setPendingAvatarScroll] = useState<string | null>(null);

  // ─── Refs & flash ─────────────────────────────────────────────────
  const profileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashProfile, setFlashProfile] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashAvatar, setFlashAvatar] = useState<string | null>(null);
  const avatarFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToProfile = useCallback((profileId: string) => {
    setTimeout(() => {
      const el = profileRefs.current[profileId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashProfile(profileId);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashProfile(null), 1600);
    }, 60);
  }, []);

  const scrollToAvatar = useCallback((columnId: string) => {
    setTimeout(() => {
      const el = avatarRefs.current[columnId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashAvatar(columnId);
      if (avatarFlashTimer.current) clearTimeout(avatarFlashTimer.current);
      avatarFlashTimer.current = setTimeout(() => setFlashAvatar(null), 1600);
    }, 60);
  }, []);

  // Cross-view scroll: fires once the new view has rendered
  useEffect(() => {
    if (!pendingProfileScroll || viewMode !== "profiles") return;
    const id = pendingProfileScroll;
    setPendingProfileScroll(null);
    scrollToProfile(id);
  }, [viewMode, pendingProfileScroll, scrollToProfile]);

  useEffect(() => {
    if (!pendingAvatarScroll || viewMode !== "avatars") return;
    const id = pendingAvatarScroll;
    setPendingAvatarScroll(null);
    scrollToAvatar(id);
  }, [viewMode, pendingAvatarScroll, scrollToAvatar]);

  // ─── Data ──────────────────────────────────────────────────────────
  const mst = getMST(seed, adAccountId);
  const matrix = mst?.historical_matrix_4x4 ?? null;
  const analysis = getAnalysisData(seed, adAccountId);
  const strategyData = getStrategyData(seed, adAccountId);
  const icpProfiles = strategyData?.icp_profiles ?? [];
  const term = resultTerm(account);

  const columnIds = useMemo(() => matrix?.columns.map((c) => c.id) ?? [], [matrix]);

  const dnaByColumn = useMemo(
    () =>
      matrix
        ? new Map(matrix.columns.map((col) => [col.id, computeAvatarDna(col.id, matrix, analysis, mst)]))
        : new Map<string, AvatarDna>(),
    [matrix, analysis, mst],
  );

  const perfByColumn = useMemo(
    () =>
      matrix
        ? new Map(matrix.columns.map((col) => [col.id, computeColumnPerf(col.id, columnIds, analysis)]))
        : new Map<string, ColumnPerf>(),
    [matrix, columnIds, analysis],
  );

  const maxSpend = useMemo(() => {
    let max = 0;
    for (const p of perfByColumn.values()) max = Math.max(max, p.spend);
    return max;
  }, [perfByColumn]);

  const avgCpa = useMemo(() => {
    const vals = icpProfiles
      .map((p) => p.performance_data?.cpa)
      .filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [icpProfiles]);

  const avgCvr = useMemo(() => {
    const vals = icpProfiles
      .map((p) => p.performance_data?.cvr_link_pct)
      .filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [icpProfiles]);

  const placementRows = useMemo(
    () => [...(analysis?.v3_placement_signal ?? [])].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]),
    [analysis],
  );

  // Audience segment list sorted by spend — the hierarchical tile authority
  const segmentList = useMemo(
    () => (analysis ? listSegments(analysis.demographic_registration_signal ?? []) : []),
    [analysis],
  );

  // Per-segment pre-computed stats (totals, derived, signal, best variable)
  const segmentStats = useMemo(() => {
    if (!analysis || segmentList.length === 0) {
      return new Map<string, {
        totals: SegmentRawTotals; derived: SegmentDerivedMetrics;
        signal: SegmentSignal; bestVariableCode: string | null;
      }>();
    }
    const allRows = analysis.demographic_registration_signal ?? [];
    const scoped = scopeDemographicRows(allRows, null);
    const scopedTotals = computeSegmentTotals(scoped);
    const result = new Map<string, {
      totals: SegmentRawTotals; derived: SegmentDerivedMetrics;
      signal: SegmentSignal; bestVariableCode: string | null;
    }>();
    for (const seg of segmentList) {
      const segRows = scoped.filter((r) => r.Age === seg.age && r.Gender === seg.gender);
      const totals = computeSegmentTotals(segRows);
      const derived = deriveSegmentMetrics(totals);
      const signal = assessSegmentSignal(totals, scopedTotals);
      const attribution = computeSegmentAttribution(analysis, mst, seg, null);
      const bestVariableCode =
        attribution.available && attribution.variables.length > 0
          ? attribution.variables[0].code
          : null;
      result.set(segmentKey(seg), { totals, derived, signal, bestVariableCode });
    }
    return result;
  }, [analysis, mst, segmentList]);

  // Ads indexed by cell code for drawer ad breakdown
  const adsByCell = useMemo(() => {
    const ads = getAds(seed, adAccountId);
    const map = new Map<string, AdRecord[]>();
    for (const ad of ads) {
      if (!ad.cell) continue;
      const list = map.get(ad.cell) ?? [];
      list.push(ad);
      map.set(ad.cell, list);
    }
    return map;
  }, [seed, adAccountId]);

  // Hypothesis test variants indexed by profile_id (via pillar → target_icps)
  const hypothesesByProfile = useMemo(() => {
    const hyps = strategyData?.active_hypotheses ?? [];
    const pillars = strategyData?.message_pillars ?? [];
    const pillarTargets = new Map(pillars.map((p) => [p.id, p.target_icps ?? []]));
    const result = new Map<string, ActiveHypothesis[]>();
    for (const h of hyps) {
      if (!h.test_variant) continue;
      const targets = h.pillar_id ? (pillarTargets.get(h.pillar_id) ?? []) : [];
      for (const profileId of targets) {
        const list = result.get(profileId) ?? [];
        list.push(h);
        result.set(profileId, list);
      }
    }
    return result;
  }, [strategyData]);

  // ─── Sorted / filtered lists ───────────────────────────────────────

  // Stable per-avatar identity index (original matrix order) so the accent color
  // and "which avatar is which" stay fixed regardless of the active sort.
  const accentIndexByColumn = useMemo(
    () => new Map((matrix?.columns ?? []).map((c, i) => [c.id, i])),
    [matrix],
  );

  const sortedColumns = useMemo(() => {
    if (!matrix) return [];
    const emptyPerf: ColumnPerf = { spend: 0, results: 0, cpa: null, cvr: null, cpm: null };
    return [...matrix.columns].sort((a, b) => {
      const pa = perfByColumn.get(a.id) ?? emptyPerf;
      const pb = perfByColumn.get(b.id) ?? emptyPerf;
      switch (sortBy) {
        case "spend": return (pb.spend ?? 0) - (pa.spend ?? 0);
        case "cpa": return (pa.cpa ?? Infinity) - (pb.cpa ?? Infinity);
        case "cvr": return (pb.cvr ?? -1) - (pa.cvr ?? -1);
        case "cpm": return (pa.cpm ?? Infinity) - (pb.cpm ?? Infinity);
        case "confidence": {
          const da = dnaByColumn.get(a.id);
          const db = dnaByColumn.get(b.id);
          return (db?.measuredCellIds.length ?? 0) - (da?.measuredCellIds.length ?? 0);
        }
      }
    });
  }, [matrix, perfByColumn, sortBy]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return icpProfiles
      .filter((p) => !q || p.profile_name.toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = a.performance_data;
        const pb = b.performance_data;
        switch (sortBy) {
          case "spend": return (pb?.spend ?? 0) - (pa?.spend ?? 0);
          case "cpa": return (pa?.cpa ?? Infinity) - (pb?.cpa ?? Infinity);
          case "cvr": return (pb?.cvr_link_pct ?? -1) - (pa?.cvr_link_pct ?? -1);
          // ICP profile data carries no impression-level CPM — fall back to spend order.
          case "cpm": return (pb?.spend ?? 0) - (pa?.spend ?? 0);
          case "confidence": {
            const ca = CONF_ORDER[pa?.confidence?.toLowerCase() ?? ""] ?? 99;
            const cb = CONF_ORDER[pb?.confidence?.toLowerCase() ?? ""] ?? 99;
            return ca - cb;
          }
        }
      });
  }, [icpProfiles, searchQuery, sortBy]);

  return (
    <ModuleScopeGate section={SECTION} title="Avatars / ICP / PMF" account={account}>
      {() => {
        const acct = account!;
        const demo = analysis?.demographic_registration_signal ?? [];

        if (!matrix && icpProfiles.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Avatars / ICP / PMF" tabs="strategy" account={acct} />
              <PendingState
                title="No avatars yet"
                message="Avatars are derived from the MST matrix and strategy ICP profiles once they exist for this account."
                icon={Users}
                action={<CrossLink to="/app/mst/matrix" label="Open MST Matrix" />}
              />
            </div>
          );
        }

        const cellsFor = (colId: string) =>
          matrix ? matrix.cells.filter((c) => c.column_id === colId) : [];
        const profileById = new Map(icpProfiles.map((p) => [p.profile_id, p]));
        const matchedProfilesFor = (col: MSTMatrixColumn): ICPProfile[] =>
          (col.matched_profile_ids ?? [])
            .map((id) => profileById.get(id))
            .filter((p): p is ICPProfile => p != null);
        const avatarsForProfile = (profileId: string): MSTMatrixColumn[] =>
          matrix ? matrix.columns.filter((col) => (col.matched_profile_ids ?? []).includes(profileId)) : [];
        const dnaForProfile = (profileId: string): DnaVariable[] =>
          mergeAvatarDna(
            avatarsForProfile(profileId)
              .map((col) => dnaByColumn.get(col.id))
              .filter((d): d is AvatarDna => d != null),
          );

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Avatars / ICP / PMF"
              subtitle="Matrix avatars · ICP profiles · audience signal"
              tabs="strategy"
              account={acct}
            />

            {/* Sticky sort / filter strip */}
            <SortFilterBar
              viewMode={viewMode}
              onViewMode={setViewMode}
              sortBy={sortBy}
              onSort={setSortBy}
              search={searchQuery}
              onSearch={setSearchQuery}
            />

            {/* Summary tiles */}
                <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                  <MetricTile label="Avatars" value={String(matrix?.columns.length ?? 0)} variant="primary" />
                  <MetricTile label="Message angles" value={String(matrix?.cells.length ?? 0)} sub="matrix cells" />
                  <MetricTile label="ICP profiles" value={String(icpProfiles.length)} sub="strategy map" />
                  <MetricTile label="Segments" value={String(segmentList.length)} sub="audience signal" />
                </div>

                <div className="px-6 py-5 space-y-4 max-w-5xl">
                  {/* ── Avatars view ── */}
                  {viewMode === "avatars" && matrix && (
                    <SectionCard
                      title="Matrix avatars"
                      desc={`Sorted by ${SORT_LABEL[sortBy]} · tap any card for detail`}
                      >
                      <FoldedGrid
                        items={sortedColumns}
                        limit={6}
                        noun="avatars"
                        gridClassName="grid grid-cols-dashboard-2 gap-3"
                        renderItem={(col, i) => {
                          const cells = cellsFor(col.id);
                          const matched = matchedProfilesFor(col);
                          const perf = perfByColumn.get(col.id) ?? { spend: 0, results: 0, cpa: null, cvr: null, cpm: null };
                          const dna = dnaByColumn.get(col.id) ?? null;
                          return (
                            <AvatarCard
                              key={col.id}
                              col={col}
                              cells={cells}
                              perf={perf}
                              maxSpend={maxSpend}
                              matched={matched}
                              flash={flashAvatar === col.id}
                              registerRef={(el) => { avatarRefs.current[col.id] = el; }}
                              onClickAvatar={(c, cs) => setDetail({ column: c, cells: cs })}
                              onScrollProfile={(profileId) => {
                                setViewMode("profiles");
                                setPendingProfileScroll(profileId);
                              }}
                              dna={dna}
                              accentIndex={accentIndexByColumn.get(col.id) ?? i}
                              rank={i + 1}
                              sortBy={sortBy}
                            />
                          );
                        }}
                      />
                    </SectionCard>
                  )}

                  {/* ── Profiles view ── */}
                  {viewMode === "profiles" && icpProfiles.length > 0 && (
                    <SectionCard
                      title="ICP profiles"
                      desc="Strategy-map customer profiles · real performance"
                      >
                      {filteredProfiles.length === 0 ? (
                        <div className="space-y-3">
                          <p className={cn(TYPE.body, "text-muted-foreground/50 py-6 text-center")}>
                            No profiles match "{searchQuery}"
                          </p>
                        </div>
                      ) : (
                        <FoldedList
                          items={filteredProfiles}
                          limit={5}
                          noun="profiles"
                          listClassName="space-y-3"
                          renderItem={(p) => (
                            <IcpProfileCard
                              key={p.profile_id}
                              profile={p}
                              registerRef={(el) => { profileRefs.current[p.profile_id] = el; }}
                              flash={flashProfile === p.profile_id}
                              avatars={avatarsForProfile(p.profile_id)}
                              onAvatarClick={(colId) => {
                                setViewMode("avatars");
                                setPendingAvatarScroll(colId);
                              }}
                              dna={dnaForProfile(p.profile_id)}
                              placementRows={placementRows}
                              avgCpa={avgCpa}
                              avgCvr={avgCvr}
                              hypotheses={hypothesesByProfile.get(p.profile_id)}
                            />
                          )}
                        />
                      )}
                    </SectionCard>
                  )}

                  {/* ── Audience segments — hierarchical tile authority ── */}
                  {segmentList.length > 0 && (
                    <SectionCard
                      title="Audience segments"
                      desc="Demographic signal · performance + confidence · explore"
                      >
                      <FoldedGrid
                        items={segmentList.filter((seg) => segmentStats.has(segmentKey(seg)))}
                        limit={6}
                        noun="segments"
                        gridClassName="grid grid-cols-dashboard-2 gap-3"
                        renderItem={(seg) => {
                          const stats = segmentStats.get(segmentKey(seg))!;
                          return (
                            <AudienceSegmentTile
                              key={segmentKey(seg)}
                              seg={seg}
                              totals={stats.totals}
                              derived={stats.derived}
                              signal={stats.signal}
                              bestVariableCode={stats.bestVariableCode}
                              onExplore={() => setAudienceSegment(seg)}
                            />
                          );
                        }}
                      />
                    </SectionCard>
                  )}

                  {/* ── Combinations panel (always visible) ── */}
                  <CombosPanel analysis={analysis} resultNoun={term.singular} />

                  {/* ── Audience signal ── */}
                  {analysis && (analysis.demographic_registration_signal ?? []).length > 0 && (
                    <SectionCard
                      title="Audience signal"
                      desc="Age × gender · CVR heatmap · click row to explore"
                    >
                      <DemographicTable
                        rows={analysis.demographic_registration_signal ?? []}
                        heatmap={true}
                        onSegmentClick={(seg) => setAudienceSegment(seg)}
                      />
                    </SectionCard>
                  )}

                </div>

            {/* ── Avatar detail drawer ── */}
            {detail && (
              <InfoDrawer
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4 flex-wrap">
                    {analysis && <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />}
                    {matchedProfilesFor(detail.column).map((p) => (
                      <button
                        key={p.profile_id}
                        onClick={() => {
                          setDetail(null);
                          setViewMode("profiles");
                          setPendingProfileScroll(p.profile_id);
                        }}
                        className="inline-flex items-center gap-1 text-caption font-medium text-interactive hover:text-primary/80 transition-colors"
                        data-testid={`link-drawer-icp-${p.profile_id}`}
                      >
                        View ICP: {p.profile_name}
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                    <CrossLink to="/app/mst" label="Open MST matrix" />
                    <CrossLink to="/app/creative" label="Open Creative" />
                  </div>
                }
              >
                {(() => {
                  const matchedAds: Array<AdRecord & { cell_id: string }> = detail.cells.flatMap((c) =>
                    (adsByCell.get(c.cell_id) ?? []).map((ad) => ({ ...ad, cell_id: c.cell_id })),
                  );
                  const cellPerf = new Map(
                    detail.cells.map((c) => {
                      const rows = (analysis?.performance_by_cell ?? []).filter((r) => r.cell_id === c.cell_id);
                      return [c.cell_id, {
                        spend: rows.reduce((s, r) => s + r["Amount spent (USD)"], 0),
                        results: rows.reduce((s, r) => s + r.Results, 0),
                      }];
                    }),
                  );
                  return (
                    <DrawerField label={matchedAds.length > 0 ? `Matched ads (${matchedAds.length})` : "Matched ads"}>
                      <DrawerAdList
                        matchedAds={matchedAds}
                        cellPerf={cellPerf}
                        resultNoun={term.plural}
                      />
                    </DrawerField>
                  );
                })()}
                {(() => {
                  const dna = dnaByColumn.get(detail.column.id);
                  if (!dna) return null;
                  return (
                    <DrawerField label="Variable resonance — ranked by results">
                      {dna.variables.length > 0 ? (
                        <>
                          <p className="text-label text-muted-foreground/70 leading-relaxed mb-1.5">
                            Aggregated from {dna.measuredCellIds.length} measured angle{dna.measuredCellIds.length === 1 ? "" : "s"} ({dna.measuredCellIds.join(", ")})
                            {dna.extensionCellIds.length > 0 ? ` — ${dna.extensionCellIds.length} beyond the planned grid` : ""}.
                            Planned angles without data are excluded. Variables share angles; rows overlap and are not additive.
                          </p>
                          <div data-testid={`drawer-dna-${detail.column.id}`}>
                            {dna.variables.slice(0, 10).map((v) => (
                              <DnaVariableLine key={v.code} v={v} resultNoun={term.plural} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-caption text-muted-foreground/70">
                          No measured variable resonance yet — none of this avatar's angles have performance data.
                        </p>
                      )}
                    </DrawerField>
                  );
                })()}
                {detail.cells.map((c) => (
                  <DrawerField key={c.cell_id} label={`${c.cell_id} · ${c.concept_code}`}>
                    {c.plain_text.headline && <p className="font-semibold text-foreground">{c.plain_text.headline}</p>}
                    {c.plain_text.primary && <p className="mt-1">{c.plain_text.primary}</p>}
                    <div className="mt-2">
                      <VariableStackChips stack={c.variable_stack} />
                    </div>
                  </DrawerField>
                ))}
              </InfoDrawer>
            )}

            {analysis && (
              <SegmentDrilldownModal
                open={audienceSegment != null}
                onClose={() => setAudienceSegment(null)}
                segment={audienceSegment}
                analysis={analysis}
                cellIds={null}
                kicker="Audience signal"
              />
            )}

            {detail && analysis && (
              <SegmentGridModal
                open={segmentsOpen}
                onClose={() => setSegmentsOpen(false)}
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                analysis={analysis}
                cellIds={detail.cells.map((c) => c.cell_id)}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
