// ─── Strategy · Avatars / ICP / PMF ────────────────────────────────────
// The ICP identity page: persona, psychographic quote, performance,
// recommendation and message-pillar coverage for each customer profile.
// The matrix-avatar tile grid (concept × avatar-column rollups) now lives
// on the MST overview (/app/mst) — an avatar tile is matrix-cell data
// first, ICP identity second. This page keeps every profile-level real
// field: performance, recommendation, placements, copy approach (message
// resonance, creative DNA merged in from linked avatars, hypothesis test
// variants), profile theory, and the avatar back-links (now a cross-page
// deep link into MST via ?focus=).

import { TYPE } from "../typography";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, resultTerm, SectionCard, ConfidenceBadge,
  fmtUSD, fmtPct, fmtNum,
  DetailReveal, deriveLabel, useFocusParam, useStaleFocus, StaleFocusNotice,
  SegmentGenderIcon,
} from "../shared";
import { DemographicTable } from "../analysis/tables";
import {
  VariableStackChips, pillarTier,
  PersonaAvatar, StatGrid, AccordionToggle, DnaChipStrip, FoldedGrid, FoldedList,
} from "./strategyShared";
import { normalizeConfidence } from "@/lib/normalize";
import {
  computeAvatarDna, mergeAvatarDna,
  type AvatarDna, type DnaVariable,
} from "@/lib/creative-dna";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import {
  listSegments, computeSegmentTotals, deriveSegmentMetrics,
  assessSegmentSignal, computeSegmentAttribution,
  segmentLabel, segmentKey, scopeDemographicRows,
  type SegmentId, type SegmentRawTotals, type SegmentDerivedMetrics, type SegmentSignal,
} from "@/lib/segment-analytics";
import {
  Users, Fingerprint, DoorOpen, MessageSquareQuote, Compass,
  ArrowUpRight, MapPin, Search,
} from "lucide-react";
import type {
  MSTMatrixColumn, ICPProfile, PlacementRow, AnalysisData,
  ActiveHypothesis, MessagePillar,
} from "@/lib/data/seedTypes";
import { cn } from "@workspace/command-deck/lib/utils";

const SECTION = "Strategy · 04";

// ─── Types & constants ─────────────────────────────────────────────────

type SortKey = "spend" | "cpa" | "cvr" | "confidence";

const SORT_LABEL: Record<SortKey, string> = {
  spend: "Spend", cpa: "CPA", cvr: "Link CVR", confidence: "Confidence",
};
const SORT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  spend: "desc", cpa: "asc", cvr: "desc", confidence: "desc",
};
const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, directional: 2, low: 3 };

// ─── Sort / search bar ─────────────────────────────────────────────────

function ProfileSortBar({
  sortBy, onSort, search, onSearch,
}: {
  sortBy: SortKey;
  onSort: (k: SortKey) => void;
  search: string;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5" role="group" aria-label="Sort profiles">
        <span className="text-label font-semibold text-muted-foreground/40 normal-case tracking-normal">Sort</span>
        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => {
          const active = sortBy === k;
          return (
            <button
              key={k}
              onClick={() => onSort(k)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-body font-semibold transition-colors border",
                active
                  ? "bg-primary/12 border-primary/35 text-interactive"
                  : "bg-transparent border-border/40 text-muted-foreground/60 hover:text-foreground/80 hover:border-border/60",
              )}
            >
              {SORT_LABEL[k]}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 border border-border/30 bg-card/40 rounded-md px-2.5 py-1.5">
        <Search className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filter profiles…"
          className="bg-transparent text-body text-foreground/85 placeholder:text-muted-foreground/35 outline-none w-36"
        />
      </div>
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
        <DetailReveal label={deriveLabel(value, 64)} labelClassName={TYPE.body} eyebrow={label} sections={[{ text: value }]} />
      ) : (
        <p className={TYPE.body}>{value}</p>
      )}
    </div>
  );
}

// ─── Placements list (top 3, static — already sits behind the profile-detail fold) ──

function PlacementsList({ rows }: { rows: PlacementRow[] }) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <MapPin className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">
          Account placements
        </span>
      </div>
      <div className="space-y-1.5">
        {top3.map((r, i) => (
          <div key={r.Placement + r.Platform + i} className="flex items-center justify-between gap-2 rounded-lg border border-border/25 bg-card/30 px-3 py-2">
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
    </div>
  );
}

// ─── Profile detail fold ───────────────────────────────────────────────
// Canvas single-disclosure convention: everything beyond performance +
// recommendation collapses behind one "Profile detail" expander, with
// sub-sections inside rather than three separate accordions.

function ProfileDetailFold({
  placementRows, hasCopy, messageResonance, dna, hypotheses, hasTheory, profile,
}: {
  placementRows: PlacementRow[];
  hasCopy: boolean;
  messageResonance?: string;
  dna?: DnaVariable[];
  hypotheses?: ActiveHypothesis[];
  hasTheory: boolean;
  profile: ICPProfile;
}) {
  const [open, setOpen] = useState(false);
  const hasPlacements = placementRows.length > 0;
  if (!hasPlacements && !hasCopy && !hasTheory) return null;

  return (
    <div>
      <AccordionToggle label="Profile detail" open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="mt-3 space-y-3">
          {hasPlacements && <PlacementsList rows={placementRows} />}

          {hasCopy && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquareQuote className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">Copy approach</span>
              </div>
              <div className="space-y-2.5">
                {messageResonance && (
                  <DetailReveal
                    label={deriveLabel(messageResonance, 72)}
                    labelClassName={TYPE.body}
                    eyebrow="Message resonance"
                    sections={[{ text: messageResonance }]}
                  />
                )}
                {dna && dna.length > 0 && (
                  <DnaChipStrip variables={dna} label="Creative DNA · via avatars" testId={`icp-dna-${profile.profile_id}`} />
                )}
                {hypotheses && hypotheses.length > 0 && (
                  <div>
                    <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                      Hypothesis test variants
                    </p>
                    <div className="space-y-1.5">
                      {hypotheses.map((h) => (
                        <div key={h.id} className="rounded-lg border border-border/25 bg-card/30 px-3 py-2">
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
            </div>
          )}

          {hasTheory && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Fingerprint className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/70">Profile theory</span>
              </div>
              <div className="grid grid-cols-dashboard-2-lg gap-x-4 gap-y-2.5">
                <IcpFact label="Demographics" value={profile.demographic_foundation} Icon={Users} />
                <IcpFact label="Psychographics" value={profile.psychographic_profile} Icon={Fingerprint} />
                <IcpFact label="Behavioral signals" value={profile.behavioral_signals} Icon={Compass} />
                <IcpFact label="Funnel entry" value={profile.funnel_entry_point} Icon={DoorOpen} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ICP profile card ─────────────────────────────────────────────────

function IcpProfileCard({
  profile, registerRef, flash, avatars, onAvatarClick, dna,
  placementRows, avgCpa, avgCvr, hypotheses, rank,
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
  rank?: number;
}) {
  const perf = profile.performance_data ?? null;
  const hasPerf = perf != null && (perf.spend != null || perf.cpa != null || perf.cvr_link_pct != null);
  const rankConfidence = profile.confidence_level ? normalizeConfidence(profile.confidence_level) : null;
  const rankConfidenceText = rankConfidence
    ? rankConfidence.level === "unknown" ? rankConfidence.label : `${rankConfidence.label.toLowerCase()} confidence`
    : null;
  const hasTheory = Boolean(
    profile.demographic_foundation || profile.psychographic_profile ||
    profile.behavioral_signals || profile.funnel_entry_point,
  );
  const hasCopy = Boolean(
    profile.message_resonance || (dna && dna.length > 0) || (hypotheses && hypotheses.length > 0),
  );

  function cpaColor(cpa: number | null): string {
    if (cpa == null || avgCpa == null || avgCpa <= 0) return "text-foreground/90";
    const ratio = cpa / avgCpa;
    if (ratio < 0.85) return "text-emerald-400";
    if (ratio <= 1.15) return "text-amber-300";
    return "text-red-300";
  }
  function cvrColor(cvr: number | null): string {
    if (cvr == null || avgCvr == null || avgCvr <= 0) return "text-foreground/90";
    const ratio = cvr / avgCvr;
    if (ratio > 1.15) return "text-emerald-400";
    if (ratio >= 0.85) return "text-amber-300";
    return "text-red-300";
  }

  return (
    <div
      ref={registerRef}
      className={cn(
        "rounded-xl border bg-card/50 p-4 transition-colors duration-500 scroll-mt-24",
        flash ? "border-primary/70 bg-primary/[0.06]" : "border-border/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PersonaAvatar name={profile.profile_name} />
          <div className="min-w-0">
            {rank != null && (
              <p className="text-micro font-mono uppercase tracking-widest text-muted-foreground/45 mb-0.5">
                ICP {String(rank).padStart(2, "0")}
                {rankConfidenceText && ` · ${rankConfidenceText}`}
              </p>
            )}
            <p className="text-title font-semibold text-foreground leading-tight">{profile.profile_name}</p>
            <span className="text-label font-mono text-muted-foreground/60">{profile.profile_id}</span>
          </div>
        </div>
        {profile.confidence_level && <ConfidenceBadge value={profile.confidence_level} />}
      </div>

      {profile.psychographic_profile && (
        <div className="mt-2.5">
          <DetailReveal
            label={`"${deriveLabel(profile.psychographic_profile, 90)}"`}
            labelClassName="text-body italic font-display text-muted-foreground/75 leading-relaxed"
            eyebrow="Psychographic read"
            sections={[{ text: profile.psychographic_profile }]}
          />
        </div>
      )}

      <div className="space-y-3 mt-3">
        {hasPerf && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className={cn(TYPE.microLabel, "text-muted-foreground/60")}>Performance</span>
              {perf?.confidence && <ConfidenceBadge value={perf.confidence} />}
            </div>
            <StatGrid
              cols={3}
              cells={[
                { label: "Spend", value: perf?.spend != null ? fmtUSD(perf.spend, 0) : "—" },
                { label: "CPA", value: perf?.cpa != null ? fmtUSD(perf.cpa) : "—", valueClassName: cpaColor(perf?.cpa ?? null) },
                { label: "Link CVR", value: perf?.cvr_link_pct != null ? fmtPct(perf.cvr_link_pct) : "—", valueClassName: cvrColor(perf?.cvr_link_pct ?? null) },
              ]}
            />
            {perf?.cpa != null && avgCpa != null && avgCpa > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-label text-muted-foreground/40 mb-1">
                  <span>best</span>
                  <span>avg {fmtUSD(avgCpa)}</span>
                  <span>2×avg</span>
                </div>
                <div className="relative h-1 bg-border/25 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border/60" />
                  {(() => {
                    const pct = Math.min(Math.max((perf.cpa / (2 * avgCpa)) * 100, 0), 100);
                    return perf.cpa < avgCpa ? (
                      <div className="absolute inset-y-0 bg-emerald-400/50" style={{ left: `${pct}%`, right: "50%" }} />
                    ) : (
                      <div className="absolute inset-y-0 bg-red-400/40" style={{ left: "50%", right: `${100 - pct}%` }} />
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

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

        <ProfileDetailFold
          placementRows={placementRows}
          hasCopy={hasCopy}
          messageResonance={profile.message_resonance}
          dna={dna}
          hypotheses={hypotheses}
          hasTheory={hasTheory}
          profile={profile}
        />
      </div>

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

function AudienceSegmentTile({
  seg, totals, derived, signal, bestVariableCode, onExplore, rank,
}: {
  seg: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
  signal: SegmentSignal;
  bestVariableCode: string | null;
  onExplore: () => void;
  rank?: number;
}) {
  const hasSpend = totals.spend != null && totals.spend > 0;
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SegmentGenderIcon gender={seg.gender} />
          <div className="min-w-0">
            {rank != null && <p className="text-micro font-mono uppercase tracking-widest text-muted-foreground/45 mb-0.5">SEGMENT {String(rank).padStart(2, "0")}</p>}
            <p className={cn(TYPE.title, "leading-snug truncate")}>{segmentLabel(seg)}</p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5",
            TYPE.label,
            signal.low ? "border-amber-400/30 bg-amber-400/[0.08] text-amber-400" : "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-400",
          )}
          title={signal.low ? signal.reasons.join(" ") : "Sufficient spend and impressions for a reliable read."}
        >
          {signal.low ? "low signal" : "signal ✓"}
        </span>
      </div>

      {hasSpend ? (
        <StatGrid
          cols={3}
          cells={[
            { label: "Spend", value: fmtUSD(totals.spend!, 0) },
            { label: "CPA", value: derived.cpa != null ? fmtUSD(derived.cpa) : "—" },
            { label: "Link CVR", value: derived.cvr != null ? fmtPct(derived.cvr) : "—" },
          ]}
        />
      ) : (
        <p className={cn(TYPE.caption, "text-muted-foreground/50")}>No spend data for this segment.</p>
      )}

      <div className="flex items-center gap-1.5 min-h-[1.25rem]">
        <span className={cn(TYPE.label, "text-muted-foreground/50 normal-case")}>Top variable</span>
        {bestVariableCode ? (
          <VariableStackChips stack={{ variable: bestVariableCode }} maxVisible={1} />
        ) : (
          <span className={cn(TYPE.label, "text-muted-foreground/30 normal-case")}>—</span>
        )}
      </div>

      <div className="mt-auto pt-3 border-t border-border/20">
        <button
          type="button"
          onClick={onExplore}
          className={cn("inline-flex items-center gap-1", TYPE.caption, "font-medium text-interactive hover:text-primary/80 transition-colors")}
        >
          Explore segment
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
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

function CombosPanel({ analysis, resultNoun }: { analysis: AnalysisData | null | undefined; resultNoun: string }) {
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo((): ComboRow[] => {
    const out: ComboRow[] = [];
    const source = analysis?.performance_by_cell ?? [];
    const byCellId = new Map<string, (typeof source)[number]>();
    for (const r of source) {
      if (r.Results <= 0 || r.CPA_result == null) continue;
      const prev = byCellId.get(r.cell_id);
      if (!prev || r.Results > prev.Results) byCellId.set(r.cell_id, r);
    }
    const byConcept = new Map<string, (typeof source)[number]>();
    for (const r of byCellId.values()) {
      if (!r.book2_concept_name) continue;
      const prev = byConcept.get(r.book2_concept_name);
      if (!prev || (r.CPA_result ?? Infinity) < (prev.CPA_result ?? Infinity)) byConcept.set(r.book2_concept_name, r);
    }
    for (const r of byConcept.values()) {
      out.push({
        concept: r.book2_concept_name!, placement: "—", platform: "—",
        spend: r["Amount spent (USD)"], results: r.Results, cpa: r.CPA_result ?? null,
        rowKey: `concept:${r.book2_concept_name}`,
      });
    }
    for (const r of analysis?.v3_placement_signal ?? []) {
      if (r.Results <= 0 || r.CPA == null) continue;
      out.push({
        concept: "—", placement: r.Placement, platform: r.Platform,
        spend: r["Amount spent (USD)"], results: r.Results, cpa: r.CPA,
        rowKey: `placement:${r.Placement}:${r.Platform}`,
      });
    }
    return out.sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  }, [analysis]);

  const visible = expanded ? rows : rows.slice(0, 10);
  if (rows.length === 0) return null;

  return (
    <SectionCard title="Creative combos" desc="Concept × placement × platform · ranked by CPA · top 10">
      <div className="rounded-xl border border-border/40 overflow-hidden bg-card/40">
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
                <tr key={r.rowKey} className="border-b border-border/20 hover:bg-primary/[0.04]">
                  <td className="px-3 py-2 text-body text-foreground/85 font-medium max-w-[160px] truncate">{r.concept}</td>
                  <td className="px-3 py-2 text-body text-foreground/70 max-w-[140px] truncate">{r.placement}</td>
                  <td className="px-3 py-2 text-body text-muted-foreground/60 capitalize">{r.platform}</td>
                  <td className="px-3 py-2 text-right text-body tabular-nums text-foreground/70">{fmtUSD(r.spend, 0)}</td>
                  <td className="px-3 py-2 text-right text-body tabular-nums text-foreground/70">{fmtNum(r.results)} {resultNoun}</td>
                  <td className="px-3 py-2 text-right text-body font-semibold tabular-nums text-foreground/85">{r.cpa != null ? fmtUSD(r.cpa) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 10 && (
          <button
            onClick={() => setExpanded((o) => !o)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-body font-medium text-muted-foreground/60 hover:text-foreground/80 hover:bg-primary/[0.04] border-t border-border/30 transition-colors"
          >
            {expanded ? "Show fewer" : `Show all ${rows.length} combinations`}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Message → ICP coverage matrix ─────────────────────────────────────
// Collapsible CSS-grid table (canvas coverage-matrix convention): pillars
// × ICP profiles, cells marked proven/tested/untested from the real
// message_pillars[].target_icps linkage + each pillar's source_cells
// evidence tier. Collapsed by default — a cross-reference view, not
// primary-surface content.

type CoverageLevel = "proven" | "tested" | "untested";

const COVERAGE_STYLE: Record<CoverageLevel, string> = {
  proven: "bg-emerald-400/15 border-emerald-400/35 text-emerald-300",
  tested: "bg-accent/10 border-accent/25 text-foreground/80",
  untested: "border-border/25 text-muted-foreground/35",
};
const COVERAGE_LABEL: Record<CoverageLevel, string> = { proven: "Proven", tested: "Tested", untested: "—" };

function CoverageMatrix({ rows, profiles }: { rows: { pillar: MessagePillar; cells: CoverageLevel[] }[]; profiles: ICPProfile[] }) {
  if (rows.length === 0 || profiles.length === 0) return null;
  return (
    <SectionCard title="Message → ICP coverage" desc="Where each pillar is proven, tested, or never tried against a profile" defaultOpen={false}>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1 min-w-[560px]"
          style={{ gridTemplateColumns: `170px repeat(${profiles.length}, minmax(110px, 1fr))` }}
        >
          <span />
          {profiles.map((p) => (
            <span key={p.profile_id} className={cn(TYPE.label, "text-center text-muted-foreground/50 pb-1")} title={p.profile_name}>
              {deriveLabel(p.profile_name, 18)}
            </span>
          ))}
          {rows.map(({ pillar, cells }) => (
            <div key={pillar.id} className="contents">
              <span className={cn(TYPE.caption, "text-foreground/80 flex items-center py-1 truncate")} title={pillar.label}>
                {pillar.label}
              </span>
              {cells.map((level, i) => (
                <div key={i} className={cn("rounded-md border text-center py-1.5", TYPE.label, "font-medium", COVERAGE_STYLE[level])}>
                  {COVERAGE_LABEL[level]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function AvatarsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [, navigate] = useLocation();

  const [sortBy, setSortBy] = useState<SortKey>("spend");
  const [searchQuery, setSearchQuery] = useState("");
  const [audienceSegment, setAudienceSegment] = useState<SegmentId | null>(null);

  const profileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashProfile, setFlashProfile] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const mst = getMST(seed, adAccountId);
  const matrix = mst?.historical_matrix_4x4 ?? null;
  const analysis = getAnalysisData(seed, adAccountId);
  const strategyData = getStrategyData(seed, adAccountId);
  const icpProfiles = strategyData?.icp_profiles ?? [];
  const term = resultTerm(account);

  const dnaByColumn = useMemo(
    () => (matrix ? new Map(matrix.columns.map((col) => [col.id, computeAvatarDna(col.id, matrix, analysis, mst)])) : new Map<string, AvatarDna>()),
    [matrix, analysis, mst],
  );

  const avgCpa = useMemo(() => {
    const vals = icpProfiles.map((p) => p.performance_data?.cpa).filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [icpProfiles]);

  const avgCvr = useMemo(() => {
    const vals = icpProfiles.map((p) => p.performance_data?.cvr_link_pct).filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [icpProfiles]);

  const placementRows = useMemo(
    () => [...(analysis?.v3_placement_signal ?? [])].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]),
    [analysis],
  );

  const segmentList = useMemo(() => (analysis ? listSegments(analysis.demographic_registration_signal ?? []) : []), [analysis]);

  const segmentStats = useMemo(() => {
    if (!analysis || segmentList.length === 0) {
      return new Map<string, { totals: SegmentRawTotals; derived: SegmentDerivedMetrics; signal: SegmentSignal; bestVariableCode: string | null }>();
    }
    const allRows = analysis.demographic_registration_signal ?? [];
    const scoped = scopeDemographicRows(allRows, null);
    const scopedTotals = computeSegmentTotals(scoped);
    const result = new Map<string, { totals: SegmentRawTotals; derived: SegmentDerivedMetrics; signal: SegmentSignal; bestVariableCode: string | null }>();
    for (const seg of segmentList) {
      const segRows = scoped.filter((r) => r.Age === seg.age && r.Gender === seg.gender);
      const totals = computeSegmentTotals(segRows);
      const derived = deriveSegmentMetrics(totals);
      const signal = assessSegmentSignal(totals, scopedTotals);
      const attribution = computeSegmentAttribution(analysis, mst, seg, null);
      const bestVariableCode = attribution.available && attribution.variables.length > 0 ? attribution.variables[0].code : null;
      result.set(segmentKey(seg), { totals, derived, signal, bestVariableCode });
    }
    return result;
  }, [analysis, mst, segmentList]);

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

  const coverageRows = useMemo(() => {
    const pillars = strategyData?.message_pillars ?? [];
    return pillars.map((p) => {
      const targets = new Set(p.target_icps ?? []);
      const tier = pillarTier(p.source_cells ?? []);
      return {
        pillar: p,
        cells: icpProfiles.map((profile) => (!targets.has(profile.profile_id) ? ("untested" as const) : tier === "high" ? ("proven" as const) : ("tested" as const))),
      };
    });
  }, [strategyData, icpProfiles]);

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

  // Cross-page deep link from an avatar's "ICP profile" link on /app/mst
  // (?focus=<profileId>) — scroll to and flash that card once rendered.
  const focus = useFocusParam();
  const focusResolved = icpProfiles.some((p) => p.profile_id === focus);
  const focusStale = useStaleFocus(focus, icpProfiles.length > 0, focusResolved);
  useEffect(() => {
    if (!focus || !focusResolved) return;
    scrollToProfile(focus);
  }, [focus, focusResolved, scrollToProfile]);

  return (
    <ModuleScopeGate section={SECTION} title="Avatars / ICP / PMF" account={account}>
      {() => {
        const acct = account!;

        if (!matrix && icpProfiles.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Avatars / ICP / PMF" accountName={acct.name} tabs="strategy" />
              <PendingState
                title="No avatars yet"
                message="ICP profiles are derived from the MST matrix and strategy map once they exist for this account."
                icon={Users}
                action={<CrossLink to="/app/mst" label="Open MST" />}
              />
            </div>
          );
        }

        const avatarsForProfile = (profileId: string): MSTMatrixColumn[] =>
          matrix ? matrix.columns.filter((col) => (col.matched_profile_ids ?? []).includes(profileId)) : [];
        const dnaForProfile = (profileId: string): DnaVariable[] =>
          mergeAvatarDna(avatarsForProfile(profileId).map((col) => dnaByColumn.get(col.id)).filter((d): d is AvatarDna => d != null));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Avatars / ICP / PMF"
              accountName={acct.name}
              subtitle="ICP profiles · message-pillar coverage · audience signal"
              tabs="strategy"
            />

            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="ICP profiles" value={String(icpProfiles.length)} variant="primary" />
              <MetricTile label="Message pillars" value={String(coverageRows.length)} sub="coverage tracked" />
              <MetricTile label="Segments" value={String(segmentList.length)} sub="audience signal" />
              <MetricTile label="Avatars mapped" value={String(matrix?.columns.length ?? 0)} sub="matrix · see MST" />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {focusStale && <StaleFocusNotice label="ICP profile" />}

              {icpProfiles.length > 0 && (
                <SectionCard title="ICP profiles" desc="Strategy-map customer profiles · real performance" right={<ProfileSortBar sortBy={sortBy} onSort={setSortBy} search={searchQuery} onSearch={setSearchQuery} />}>
                  {filteredProfiles.length === 0 ? (
                    <p className={cn(TYPE.body, "text-muted-foreground/50 py-6 text-center")}>No profiles match "{searchQuery}"</p>
                  ) : (
                    <FoldedList
                      items={filteredProfiles}
                      limit={5}
                      noun="profiles"
                      listClassName="space-y-3"
                      renderItem={(p, i) => (
                        <IcpProfileCard
                          key={p.profile_id}
                          profile={p}
                          rank={i + 1}
                          registerRef={(el) => { profileRefs.current[p.profile_id] = el; }}
                          flash={flashProfile === p.profile_id}
                          avatars={avatarsForProfile(p.profile_id)}
                          onAvatarClick={(colId) => navigate(`/app/mst?focus=${colId}`)}
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

              <CoverageMatrix rows={coverageRows} profiles={icpProfiles} />

              {segmentList.length > 0 && (
                <SectionCard title="Audience segments" desc="Demographic signal · performance + confidence · explore">
                  <FoldedGrid
                    items={segmentList.filter((seg) => segmentStats.has(segmentKey(seg)))}
                    limit={6}
                    noun="segments"
                    gridClassName="grid grid-cols-dashboard-2 gap-3"
                    renderItem={(seg, i) => {
                      const stats = segmentStats.get(segmentKey(seg))!;
                      return (
                        <AudienceSegmentTile
                          key={segmentKey(seg)}
                          seg={seg}
                          rank={i + 1}
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

              <CombosPanel analysis={analysis} resultNoun={term.singular} />

              {analysis && (analysis.demographic_registration_signal ?? []).length > 0 && (
                <SectionCard title="Audience signal" desc="Age × gender · CVR heatmap · click row to explore">
                  <DemographicTable
                    rows={analysis.demographic_registration_signal ?? []}
                    heatmap={true}
                    onSegmentClick={(seg) => setAudienceSegment(seg)}
                  />
                </SectionCard>
              )}
            </div>

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
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
