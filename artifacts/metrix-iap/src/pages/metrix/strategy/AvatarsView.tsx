// ─── Strategy · Avatars / ICP ─────────────────────────────────────────
// Performance-first: sticky sort/filter bar, view toggle (Matrix Avatars
// vs ICP Profiles), per-avatar metric pills + normalised spend bar.
// Creative DNA collapses behind a disclosure. ICP cards: performance →
// recommendation → placements accordion → copy approach → theory.

import { TYPE } from "../typography";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, resultTerm, SectionCard, ConfidenceBadge,
  fmtUSD, fmtPct, fmtNum, RangeScopeBar, NoDataInRangeState,
  DetailReveal, deriveLabel,
} from "../shared";
import { VariableStackChips, VariableChip, familyLabel } from "./strategyShared";
import {
  computeAvatarDna, mergeAvatarDna, columnIdForCell,
  type AvatarDna, type DnaVariable,
} from "@/lib/creative-dna";
import { useDateRange } from "@/contexts/DateRangeContext";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import type { SegmentId } from "@/lib/segment-analytics";
import { DemographicTable } from "../analysis/tables";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import {
  Users, Fingerprint, DoorOpen, MessageSquareQuote, Compass,
  ArrowDownRight, ArrowUpRight, Dna, ChevronDown, Search, MapPin,
} from "lucide-react";
import type {
  MSTMatrixColumn, MSTMatrixCell, ICPProfile, PlacementRow, AnalysisData,
} from "@/lib/data/seedTypes";
import { cn } from "@/lib/utils";

const SECTION = "Strategy · 04";

// ─── Types & constants ─────────────────────────────────────────────────

type SortKey = "spend" | "cpa" | "cvr" | "confidence";
type ViewMode = "avatars" | "profiles";

const SORT_LABEL: Record<SortKey, string> = {
  spend: "Spend",
  cpa: "CPA",
  cvr: "CVR",
  confidence: "Confidence",
};

const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, directional: 2, low: 3 };

interface ColumnPerf {
  spend: number;
  results: number;
  cpa: number | null;
  /** link clicks ÷ impressions × 100 */
  cvr: number | null;
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
  if (rows.length === 0) return { spend: 0, results: 0, cpa: null, cvr: null };
  const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const impressions = rows.reduce((s, r) => s + r.Impressions, 0);
  const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
  return {
    spend,
    results,
    cpa: results > 0 ? spend / results : null,
    cvr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
  };
}

// ─── Metric pill ──────────────────────────────────────────────────────

function MetricPill({ label, value, colorClass }: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn(TYPE.label, "text-muted-foreground/50 normal-case")}>{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", colorClass ?? "text-foreground/85")}>{value}</span>
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
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
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
          <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50">
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
  if (variables.length === 0) return null;
  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-1 mb-1.5">
        <Dna className="w-3.5 h-3.5 text-primary/70" />
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {variables.slice(0, 3).map((v) => (
          <VariableChip key={v.code} code={v.code} showCode={false} />
        ))}
        {variables.length > 3 && (
          <span className="text-[9px] text-muted-foreground/60">+{variables.length - 3} more</span>
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
      <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5 border border-border/30">
        {(["avatars", "profiles"] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onViewMode(m)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-body font-medium transition-colors",
              viewMode === m
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground/60 hover:text-foreground/80"
            )}
          >
            {m === "avatars"
              ? <Users className="w-3.5 h-3.5" />
              : <Fingerprint className="w-3.5 h-3.5" />
            }
            {m === "avatars" ? "Avatars" : "Profiles"}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border/40" />

      {/* Sort options */}
      <div className="flex items-center gap-1.5">
        <span className="text-label font-semibold text-muted-foreground/40 normal-case tracking-normal">Sort</span>
        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => onSort(k)}
            className={cn(
              "px-2 py-0.5 rounded text-body font-medium transition-colors border",
              sortBy === k
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground/60 hover:text-foreground/80 hover:border-border/30"
            )}
          >
            {SORT_LABEL[k]}
          </button>
        ))}
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
  onClickAvatar, onScrollProfile, dna,
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
}) {
  const [dnaOpen, setDnaOpen] = useState(false);
  const spendPct = maxSpend > 0 ? (perf.spend / maxSpend) * 100 : 0;
  const hasPerf = perf.spend > 0 || perf.cpa != null;

  return (
    <div
      ref={registerRef}
      className={cn(
        "rounded-xl border bg-white/[0.02] transition-colors duration-500 scroll-mt-24",
        flash ? "border-primary/70 bg-primary/[0.06]" : "border-border/40 hover:border-border/60"
      )}
    >
      <button
        onClick={() => onClickAvatar(col, cells)}
        className="w-full text-left p-4 hover:bg-white/[0.03] transition-colors rounded-xl"
      >
        {/* L1: identity */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg border border-primary/25 bg-primary/[0.08] flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-primary/70" />
          </div>
          <div className="min-w-0">
            <p className="text-title font-semibold text-foreground leading-tight whitespace-pre-line">{col.name}</p>
            <span className="text-[9px] font-mono text-muted-foreground/60">{col.icp}</span>
          </div>
        </div>

        {/* L1: metric pills */}
        {hasPerf && (
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            <MetricPill label="Spend" value={fmtUSD(perf.spend, 0)} />
            <MetricPill label="CPA" value={perf.cpa != null ? fmtUSD(perf.cpa) : "—"} />
            <MetricPill label="Link CVR" value={perf.cvr != null ? fmtPct(perf.cvr) : "—"} />
          </div>
        )}

        {/* L1: spend bar (normalised across all avatars) */}
        {maxSpend > 0 && (
          <div
            className="h-[3px] rounded-full overflow-hidden mb-2.5"
            style={{ background: "rgba(255,255,255,0.04)" }}
            title={`${spendPct.toFixed(1)}% of top avatar spend`}
          >
            <div
              className="h-full rounded-full bg-primary/50"
              style={{ width: `${Math.min(spendPct, 100)}%` }}
            />
          </div>
        )}

        <p className="text-label text-muted-foreground/50">
          {cells.length} angle{cells.length !== 1 ? "s" : ""} · tap for detail
        </p>
      </button>

      {/* L2: Creative DNA — collapsed by default */}
      {dna && dna.variables.length > 0 && (
        <div className="border-t border-border/20">
          <button
            type="button"
            onClick={() => setDnaOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Dna className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-label font-semibold text-muted-foreground/70 uppercase tracking-widest">
                Creative DNA
              </span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/40 transition-transform", dnaOpen && "rotate-180")} />
          </button>
          {dnaOpen && (
            <div className="px-4 pb-3">
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
        <div className="px-4 pb-3 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/20">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            ICP profile{matched.length === 1 ? "" : "s"}
          </span>
          {matched.map((p) => (
            <button
              key={p.profile_id}
              onClick={() => onScrollProfile(p.profile_id)}
              className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:text-primary/80 transition-colors"
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
      >
        <MapPin className="w-3.5 h-3.5" />
        Top placements
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
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
  placementRows, avgCpa,
}: {
  profile: ICPProfile;
  registerRef?: (el: HTMLDivElement | null) => void;
  flash?: boolean;
  avatars?: MSTMatrixColumn[];
  onAvatarClick?: (columnId: string) => void;
  dna?: DnaVariable[];
  placementRows: PlacementRow[];
  avgCpa: number | null;
}) {
  const perf = profile.performance_data ?? null;
  const hasPerf = perf != null && (perf.spend != null || perf.cpa != null || perf.cvr_link_pct != null);
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const hasTheory = Boolean(
    profile.demographic_foundation || profile.psychographic_profile ||
    profile.behavioral_signals || profile.funnel_entry_point,
  );
  const hasCopy = Boolean(profile.message_resonance || (dna && dna.length > 0));

  function cpaColor(cpa: number | null): string {
    if (cpa == null || avgCpa == null || avgCpa <= 0) return "text-foreground/85";
    const ratio = cpa / avgCpa;
    if (ratio < 0.85) return "text-emerald-400";
    if (ratio <= 1.15) return "text-amber-300";
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
          <span className="text-[9px] font-mono text-muted-foreground/60">{profile.profile_id}</span>
        </div>
        {profile.confidence_level && <ConfidenceBadge value={profile.confidence_level} />}
      </div>

      <div className="space-y-3 mt-3">
        {/* 1. Performance pills */}
        {hasPerf && (
          <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">Performance</span>
              {perf?.confidence && <ConfidenceBadge value={perf.confidence} />}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MetricPill label="Spend" value={perf?.spend != null ? fmtUSD(perf.spend, 0) : "—"} />
              <MetricPill
                label="CPA"
                value={perf?.cpa != null ? fmtUSD(perf.cpa) : "—"}
                colorClass={cpaColor(perf?.cpa ?? null)}
              />
              <MetricPill label="Link CVR" value={perf?.cvr_link_pct != null ? fmtPct(perf.cvr_link_pct) : "—"} />
            </div>
          </div>
        )}

        {/* 2. Recommendation */}
        {profile.strategic_recommendation && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.05] p-3">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-primary/80 mb-0.5">Recommendation</div>
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
              className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:text-primary/80 transition-colors"
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
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Avatar{avatars.length === 1 ? "" : "s"}
          </span>
          {avatars.map((col) => (
            <button
              key={col.id}
              onClick={() => onAvatarClick?.(col.id)}
              className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:text-primary/80 transition-colors"
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

// ─── Combinations panel ───────────────────────────────────────────────
// Top-performing creative concepts by CPA from the cell performance data.
// Deduped by concept name (best-CPA row per concept, results > 0 only).

function CombosPanel({ analysis, resultNoun }: {
  analysis: AnalysisData | null | undefined;
  resultNoun: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
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
    return Array.from(byConcept.values()).sort(
      (a, b) => (a.CPA_result ?? Infinity) - (b.CPA_result ?? Infinity),
    );
  }, [analysis]);

  const visible = expanded ? rows : rows.slice(0, 10);
  if (rows.length === 0) return null;

  return (
    <SectionCard title="Top combos" desc="Best-performing concepts by CPA" table="performance_by_cell">
      <div className="rounded-xl border border-border/40 overflow-hidden bg-white/[0.015]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-table z-10">
              <tr className="border-b border-border/40">
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-left">Concept</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-left">Cell</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-right">Spend</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-right">Results</th>
                <th className="text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-3 py-2 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.cell_id + i} className="border-b border-border/20 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-body text-foreground/85 font-medium max-w-[200px] truncate">
                    {r.book2_concept_name}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[9px] font-mono text-muted-foreground/55 border border-border/30 px-1.5 py-0.5 rounded leading-none">
                      {r.cell_id}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-body tabular-nums text-foreground/70">
                    {fmtUSD(r["Amount spent (USD)"], 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-body tabular-nums text-foreground/70">
                    {fmtNum(r.Results)} {resultNoun}
                  </td>
                  <td className="px-3 py-2 text-right text-body font-semibold tabular-nums text-foreground/85">
                    {r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
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
            {expanded ? "Show fewer" : `Show all ${rows.length} combos`}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function AvatarsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();

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
  const icpProfiles = getStrategyData(seed, adAccountId)?.icp_profiles ?? [];
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

  const placementRows = useMemo(
    () => [...(analysis?.v3_placement_signal ?? [])].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]),
    [analysis],
  );

  // ─── Sorted / filtered lists ───────────────────────────────────────

  const sortedColumns = useMemo(() => {
    if (!matrix) return [];
    return [...matrix.columns].sort((a, b) => {
      const pa = perfByColumn.get(a.id) ?? { spend: 0, results: 0, cpa: null, cvr: null };
      const pb = perfByColumn.get(b.id) ?? { spend: 0, results: 0, cpa: null, cvr: null };
      switch (sortBy) {
        case "spend": return (pb.spend ?? 0) - (pa.spend ?? 0);
        case "cpa": return (pa.cpa ?? Infinity) - (pb.cpa ?? Infinity);
        case "cvr": return (pb.cvr ?? -1) - (pa.cvr ?? -1);
        case "confidence": return 0;
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
          case "confidence": {
            const ca = CONF_ORDER[pa?.confidence?.toLowerCase() ?? ""] ?? 99;
            const cb = CONF_ORDER[pb?.confidence?.toLowerCase() ?? ""] ?? 99;
            return ca - cb;
          }
        }
      });
  }, [icpProfiles, searchQuery, sortBy]);

  return (
    <ModuleScopeGate section={SECTION} title="Avatars" account={account}>
      {() => {
        const acct = account!;
        const demo = analysis?.demographic_registration_signal ?? [];

        if (!matrix && icpProfiles.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Avatars" tabs="strategy" account={acct} />
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
              title="Avatars / ICP"
              subtitle="Matrix avatars · ICP profiles · audience signal"
              table="historical_matrix_4x4, icp_profiles, demographic_registration_signal"
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

            <RangeScopeBar grainNote="Avatars come from the historical matrix; audience signal aggregates full flight windows — no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="avatar data" />
            ) : (
              <>
                {/* Summary tiles */}
                <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                  <MetricTile label="Avatars" value={String(matrix?.columns.length ?? 0)} />
                  <MetricTile label="Message angles" value={String(matrix?.cells.length ?? 0)} sub="matrix cells" />
                  <MetricTile label="ICP profiles" value={String(icpProfiles.length)} sub="strategy map" />
                  <MetricTile label="Audience rows" value={String(demo.length)} sub={`${term.singular} signal`} />
                </div>

                <div className="px-6 py-5 space-y-4 max-w-5xl">
                  {/* ── Avatars view ── */}
                  {viewMode === "avatars" && matrix && (
                    <SectionCard
                      title="Matrix avatars"
                      desc="Sorted by spend · tap any card for detail"
                      table="historical_matrix_4x4"
                    >
                      <div className="grid grid-cols-dashboard-2 gap-3">
                        {sortedColumns.map((col) => {
                          const cells = cellsFor(col.id);
                          const matched = matchedProfilesFor(col);
                          const perf = perfByColumn.get(col.id) ?? { spend: 0, results: 0, cpa: null, cvr: null };
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
                            />
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}

                  {/* ── Profiles view ── */}
                  {viewMode === "profiles" && icpProfiles.length > 0 && (
                    <SectionCard
                      title="ICP profiles"
                      desc="Strategy-map customer profiles · real performance"
                      table="icp_profiles"
                    >
                      <div className="space-y-3">
                        {filteredProfiles.length === 0 ? (
                          <p className={cn(TYPE.body, "text-muted-foreground/50 py-6 text-center")}>
                            No profiles match "{searchQuery}"
                          </p>
                        ) : (
                          filteredProfiles.map((p) => (
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
                            />
                          ))
                        )}
                      </div>
                    </SectionCard>
                  )}

                  {/* ── Combinations panel (always visible) ── */}
                  <CombosPanel analysis={analysis} resultNoun={term.singular} />

                  {/* ── Audience signal (demographic heatmap) ── */}
                  <SectionCard
                    title="Audience signal"
                    desc={`Demographic ${term.singular} signal · CVR heatmap`}
                    table="demographic_registration_signal"
                  >
                    {demo.length ? (
                      <DemographicTable
                        rows={demo}
                        onSegmentClick={analysis ? setAudienceSegment : undefined}
                        heatmap
                      />
                    ) : (
                      <PendingState
                        title="No audience signal"
                        message={`Demographic ${term.singular} signal appears once analysis is available.`}
                        icon={Users}
                        action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
                      />
                    )}
                  </SectionCard>
                </div>
              </>
            )}

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
                        className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:text-primary/80 transition-colors"
                        data-testid={`link-drawer-icp-${p.profile_id}`}
                      >
                        View ICP: {p.profile_name}
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                    <CrossLink to="/app/mst" label="Open MST matrix" />
                    <CrossLink to="/app/briefs/builder" label="Open Brief Builder" />
                  </div>
                }
              >
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
