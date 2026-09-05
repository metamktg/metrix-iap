// ─── Analysis · Ad Performance ──────────────────────────────────────────
// The charts/tiles read surface for Analysis (formerly "Overview"):
// campaign totals, the core control reads, and jump-offs into each
// analysis subpage. The Analysis command center (AnalysisCommandCenter,
// mounted at the parent /app/analysis route) owns execution + run
// history — this page is read-only.

import { RevealPanel } from "@/components/widgets/LayeredDisclosure";
import { useState, useMemo, useEffect, Fragment } from "react";
import { scopeToRun, supersededCount } from "@/lib/run-supersede";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import { getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls, getMST, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CaveatNote, SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState, SectionInfoIcon,
  ConfidenceBadge, useShowMore, ShowMoreButton, DetailReveal,
  PILL_ACTIVE, PILL_INACTIVE, OverviewHeaderControls, type ViewPreset,
} from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import {
  LineChart, Library, Users, LayoutGrid, Wallet, TrendingUp, AlertTriangle, Eye, Search,
  ChevronDown, ArrowRight,
} from "lucide-react";
import { KpiTileRow, type KpiTileTrend } from "@/components/metrics/KpiTile";
import { buildMetricCatalog, metricSourceFromCampaignSummary } from "@/lib/data/metricsCatalog";
import { bucketEntryForConcept, bucketVerbKey, BUCKET_LABEL, type ScalingBucket } from "@/lib/data/scalingBuckets";
import { normalizeConfidence } from "@/lib/normalize";
import { RankSortBar, sortByRankMetric, useRankMetric, type RankMetric } from "./rankSort";
import { CombinationChips, familyLabel } from "../strategy/strategyShared";
import type { DataQualityFlag, ConceptRollupRow, ScalingPlaybook, CellPerformanceRow, MSTLibraryCell } from "@/lib/data/seedTypes";
import { flagHeadline, flagBody, flagEvidence } from "@/lib/dataQualityFlags";
import { buildFunnelStages, describeLowerFunnel, ZONE_COLOR, type FunnelStage } from "./EngagementFunnelView";
import { breakdownSpendShare, countCells, spendShareLabel } from "@/lib/account-totals";
import { adGrainPerformanceRows } from "@/lib/ad-grain-rows";
import { getGetAnalysisSummaryQueryOptions } from "@workspace/api-client-react";
import { trendForMetric, sparkSeriesForMetric, sparkPoints } from "@/lib/data/summaryTrends";
import { AddToTrayButton } from "@/components/tray/AddToTrayButton";

const SECTION = "Analysis · 03";

/** Format a raw prior-window value in the metric's own display format —
 *  mirrors AdAccountOverview's formatLikeMetric so the "vs prior" trend
 *  line reads the same way everywhere it appears. */
function formatTrendValue(metricId: string, v: number): string {
  if (metricId === "spend" || metricId === "cpa_blended" || metricId === "cpc" || metricId === "cpm") return fmtUSD(v);
  if (metricId === "link_ctr" || metricId === "cvr") return `${v.toFixed(2)}%`;
  return fmtNum(Math.round(v));
}

// ─── Signal cards — the canvas's "signals worth acting on" strip ──────
type SignalTier = "act_now" | "watch" | "investigate";

const TIER_LABEL: Record<SignalTier, string> = {
  act_now: "Act now",
  watch: "Watch",
  investigate: "Investigate",
};

/** The flag's real `kind` is the only tiering field these objects carry —
 *  no severity/urgency/confidence field exists on DataQualityFlag, so this
 *  is a straight rename of the kind-based split the cards already used
 *  (anomaly/quality_flag/other), not a new categorical field. */
function tierForFlag(f: DataQualityFlag): SignalTier {
  if (f.kind === "anomaly") return "act_now";
  if (f.kind === "quality_flag") return "watch";
  return "investigate";
}

const SIGNAL_TIER_FILTERS: { id: "all" | SignalTier; label: string }[] = [
  { id: "all", label: "All" },
  { id: "act_now", label: "Act now" },
  { id: "watch", label: "Watch" },
  { id: "investigate", label: "Investigate" },
];

const TIER_ORDER: SignalTier[] = ["act_now", "watch", "investigate"];
const TIER_ICON: Record<SignalTier, typeof AlertTriangle> = {
  act_now: AlertTriangle,
  watch: Eye,
  investigate: Search,
};

/** The single headline card per tier: highest real $ affected first (the
 *  only real severity signal these flags carry), falling back to the first
 *  flag in tier order when none carries a spend figure. Null when the tier
 *  has no real flags for this account — never backfilled with a placeholder. */
function highestPriorityFlag(flags: DataQualityFlag[], tier: SignalTier): DataQualityFlag | null {
  const inTier = flags.filter((f) => tierForFlag(f) === tier);
  if (inTier.length === 0) return null;
  const withSpend = (f: DataQualityFlag) => (typeof f["spend"] === "number" ? (f["spend"] as number) : -1);
  return [...inTier].sort((a, b) => withSpend(b) - withSpend(a))[0]!;
}

function SignalHeadlineCard({ tier, flag }: { tier: SignalTier; flag: DataQualityFlag | null }) {
  const Icon = TIER_ICON[tier];
  const isActNow = tier === "act_now";
  const spend = flag && typeof flag["spend"] === "number" ? (flag["spend"] as number) : null;
  return (
    <div
      data-testid={`signal-headline-${tier}`}
      className={cn(
        "rounded-lg border px-3.5 py-3 flex flex-col gap-1.5 min-h-[92px]",
        flag && isActNow ? "border-status-warning/30 bg-status-warning/[0.04]" : "border-border/40 bg-foreground/[0.015]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("w-3.5 h-3.5 shrink-0", flag && isActNow ? "text-status-warning/80" : "text-muted-foreground/75")} />
        <span className={cn(TYPE.label, " uppercase tracking-widest", flag && isActNow ? "text-status-warning/85" : "text-muted-foreground/75")}>
          {TIER_LABEL[tier]}
        </span>
      </div>
      {flag ? (
        <>
          <span className={cn(TYPE.caption, "font-semibold text-foreground/90 capitalize")}>{flagHeadline(flag)}</span>
          {spend != null ? (
            <span className={cn(TYPE.body, "font-semibold text-foreground/80")}>{fmtUSD(spend, 0)} affected</span>
          ) : (
            <span className={cn(TYPE.caption, "text-muted-foreground/75")}>{flagBody(flag)}</span>
          )}
        </>
      ) : (
        <span className={cn(TYPE.caption, "text-muted-foreground/75 italic")}>
          No {TIER_LABEL[tier].toLowerCase()} signals this run.
        </span>
      )}
    </div>
  );
}

function SignalCards({ flags, scopeId, detailOn }: { flags: DataQualityFlag[]; scopeId: string; detailOn: boolean }) {
  const [filter, setFilter] = useState<"all" | SignalTier>("all");
  const [, navigate] = useLocation();
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: flags.length, act_now: 0, watch: 0, investigate: 0 };
    for (const f of flags) c[tierForFlag(f)] += 1;
    return c;
  }, [flags]);
  const filtered = filter === "all" ? flags : flags.filter((f) => tierForFlag(f) === filter);
  const fold = useShowMore(filtered, 4);
  if (flags.length === 0) return null;
  return (
    <SectionCard
      title="Signals worth acting on"
      desc="Data-quality flags from the last analysis run · grouped by real urgency"
      right={<SectionInfoIcon tip="Grouped by each flag's real kind: anomalies (Act now), quality-tracking caveats (Watch), everything else like attribution-window notes (Investigate). No confidence percentage. Flags carry no real confidence score." />}
    >
      {/* Curated headline row: the single highest-$-impact real flag per
          tier, one column each — the mock's top-line "signals worth acting
          on" read. The full filterable list (below) is never removed, just
          no longer the only view. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-4" data-testid="signal-headline-row">
        {TIER_ORDER.map((tier) => (
          <SignalHeadlineCard key={tier} tier={tier} flag={highestPriorityFlag(flags, tier)} />
        ))}
      </div>
      <div className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-2 px-0.5")}>All signals</div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap" role="group" aria-label="Filter signals by tier">
        {SIGNAL_TIER_FILTERS.map(({ id, label }) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={active}
              className={cn(
                "pressable inline-flex items-center gap-1 h-6 px-2 rounded-full border text-label font-medium transition-colors",
                active ? PILL_ACTIVE : PILL_INACTIVE,
              )}
            >
              {label}
              <span className={cn("text-label rounded px-0.5", active ? "text-interactive/70" : "text-muted-foreground/75")}>
                {counts[id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5" data-testid="signal-cards">
        {fold.visible.map((f) => {
          const tier = tierForFlag(f);
          const isActNow = tier === "act_now";
          const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
          const evidence = flagEvidence(f);
          const globalIndex = flags.indexOf(f);
          return (
            <div
              key={globalIndex}
              className={cn(
                "rounded-lg border px-3.5 py-3 flex flex-col gap-2",
                isActNow ? "border-status-warning/30 bg-status-warning/[0.04]" : "border-border/40 bg-foreground/[0.015]",
              )}
            >
              <div className="flex items-center gap-1.5">
                {isActNow
                  ? <AlertTriangle className="w-3.5 h-3.5 text-status-warning/80 shrink-0" />
                  : tier === "watch"
                    ? <Eye className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
                    : <Search className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />}
                <span className={cn(TYPE.label, " uppercase tracking-widest", isActNow ? "text-status-warning/85" : "text-muted-foreground/75")}>
                  {TIER_LABEL[tier]}
                </span>
                {/* Real spend-affected badge — never a fabricated confidence percentage. */}
                {spend != null && (
                  <span className={cn(TYPE.label, "ml-auto shrink-0 border rounded-full px-2 py-0.5 font-semibold normal-case tracking-normal text-muted-foreground/75 border-border/40 bg-foreground/[0.03]")}>
                    {fmtUSD(spend, 0)} affected
                  </span>
                )}
              </div>
              <div>
                <span className={cn(TYPE.caption, "font-semibold text-foreground/90 capitalize block")}>
                  {flagHeadline(f)}
                </span>
                <p className={cn(TYPE.body, "text-foreground/70 leading-relaxed mt-0.5")}>{flagBody(f)}</p>
              </div>
              {/* Summary/Detailed header toggle: "Detailed" renders every
                  card's evidence inline (never several simultaneously-open
                  popovers — Radix's dismissable-layer stack only tolerates
                  one uncontrolled Popover opening at a time); "Summary"
                  restores the compact click-to-reveal popover. */}
              {detailOn ? (
                <div className="rounded-lg border border-border/30 bg-foreground/[0.02] p-2.5 space-y-1.5" data-testid="signal-evidence-inline">
                  <div className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Evidence</div>
                  {evidence.map((e) => (
                    <div key={e.k} className="flex items-baseline gap-2 flex-wrap">
                      <span className={cn(TYPE.microLabel, "shrink-0 w-28 text-muted-foreground/75")}>{e.k}</span>
                      <span className={TYPE.body}>{e.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <DetailReveal
                  label="Show evidence"
                  labelClassName={cn(TYPE.caption, "font-semibold text-interactive")}
                  eyebrow="Evidence"
                  sections={evidence.map((e) => ({ label: e.k, text: e.v }))}
                />
              )}
              {/* Real actions only: a cross-link into the real Listen · Signal
                  surface, and Add to Tray (the app's real file-for-later
                  mechanism — the honest substitute for the canvas's mocked
                  "Snooze" button, which has no backend). No "Shift budget" /
                  "Split bids" / "Draft exclusion" — none of those mutating
                  actions exist anywhere in this app yet. */}
              <div className="mt-auto pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/app/listen/signal")}
                  className={cn("pressable", TYPE.caption, "inline-flex items-center gap-1.5 font-semibold rounded-lg border border-primary/40 bg-primary/15 text-interactive px-3 py-1.5 hover:bg-primary/25 transition-colors")}
                >
                  Review in Listen
                </button>
                <AddToTrayButton
                  scopeId={scopeId}
                  item={{
                    id: `signal-${globalIndex}`,
                    kind: "signal",
                    title: flagHeadline(f),
                    sub: flagBody(f),
                    href: "/app/listen/signal",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <ShowMoreButton
        total={filtered.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun="signals"
      />
    </SectionCard>
  );
}

// ─── Concept tier table — the canvas's performance tier register ──────
// One row per concept_rollup entry: real spend / CPA / CVR / confidence,
// with the strategy map's scaling-playbook bucket as the tier tag. Rows
// the playbook doesn't name stay unclassified — never guessed. Sortable,
// filterable by tier, row-expandable (confidence, the real playbook entry
// that produced the tier, and the concept's variable stack when the local
// library maps it), capped at 4 rows with a show-more fold.

const BUCKET_TAG_CLS: Record<string, string> = {
  scale_now: "border-primary/40 bg-primary/15 text-interactive",
  optimize: "border-border/40 bg-foreground/[0.04] text-foreground/75",
  validate: "border-border/40 bg-foreground/[0.04] text-muted-foreground/75",
  explore: "border-border/40 bg-foreground/[0.04] text-muted-foreground/75",
  avoid: "border-status-danger/30 bg-status-danger/10 text-status-danger",
};

// The filter speaks the loop's four verbs (round 7): the playbook's
// validate and explore lists are both "Validate", avoid is "Retire". The
// chips read Explore · Avoid · Unclassified until the design pass of
// round 8; `bucketVerbKey` folds a row's bucket onto the verb it wears.
const TIER_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "scale", label: "Scale" },
  { id: "optimize", label: "Optimize" },
  { id: "validate", label: "Validate" },
  { id: "retire", label: "Retire" },
  { id: "unclassified", label: "Unclassified" },
];

interface TierRow extends ConceptRollupRow {
  lift: number | null;
  /** Why `lift` is null, carried from the branch that produced it. */
  liftReason?: string;
  /** Which lift definition `lift` carries for THIS table — one definition
   *  per render, never mixed per row. */
  liftKind: "cpa_vs_baseline" | "cvr_vs_book_avg";
  bucket: ScalingBucket | null;
  bucketEntry: string | null;
}

/**
 * One lift definition per table:
 *  - When the rollup carries the engine's Stage-2
 *    `performance_lift_vs_baseline` (CPA lift vs the book's spend-weighted
 *    blended baseline, computed at analysis time), that is the canonical
 *    number — the same one FindingsView's intelligence cards show. It is a
 *    fraction ("0.1234" = concept CPA 12.34% cheaper than baseline).
 *  - Legacy rollup rows without Stage-2 fields fall back to the CVR-vs-book-
 *    average formula (an unweighted mean — kept only because no better
 *    source exists for those rows, and applied to the WHOLE table so two
 *    definitions never mix in one column).
 */
function computeTierRows(rollup: ConceptRollupRow[], playbook: ScalingPlaybook | null): TierRow[] {
  const engineLift = (r: ConceptRollupRow): number | null => {
    const v = r.performance_lift_vs_baseline;
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n * 100 : null;
  };
  const hasEngineLift = rollup.some((r) => engineLift(r) != null);

  const cvrByBook = new Map<string, number[]>();
  for (const r of rollup) {
    if (r.cvr_link_pct != null) {
      cvrByBook.set(r.book, [...(cvrByBook.get(r.book) ?? []), r.cvr_link_pct]);
    }
  }
  const avgCvr = (book: string): number | null => {
    const arr = cvrByBook.get(book);
    if (!arr || arr.length === 0) return null;
    return arr.reduce((n, v) => n + v, 0) / arr.length;
  };
  return rollup.map((r) => {
    // The reason a lift is null comes out of the branch that produced the
    // null, so the dash and its explanation cannot drift apart. Two
    // definitions, two different ways to be missing.
    let lift: number | null;
    let liftReason: string | undefined;
    if (hasEngineLift) {
      lift = engineLift(r);
      if (lift == null) {
        liftReason = "the analysis engine reported no CPA lift against the book baseline for this concept";
      }
    } else {
      const avg = avgCvr(r.book);
      lift = avg != null && avg > 0 && r.cvr_link_pct != null
        ? ((r.cvr_link_pct - avg) / avg) * 100
        : null;
      if (lift == null) {
        liftReason = r.cvr_link_pct == null
          ? `this concept has no link conversion rate, so there is nothing to compare against the ${r.book} average`
          : `the ${r.book} average link conversion rate could not be measured, so a comparison against it would be meaningless`;
      }
    }
    const match = bucketEntryForConcept(r.book, r.concept, playbook);
    return {
      ...r,
      lift,
      liftReason,
      liftKind: hasEngineLift ? "cpa_vs_baseline" as const : "cvr_vs_book_avg" as const,
      bucket: match?.bucket ?? null,
      bucketEntry: match?.entry ?? null,
    };
  });
}

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, directional: 0 };
function confidenceRank(value: string | null): number | null {
  if (!value) return null;
  const { level } = normalizeConfidence(value);
  return level in CONFIDENCE_RANK ? CONFIDENCE_RANK[level] : null;
}

const TIER_RANK_METRICS: RankMetric<TierRow>[] = [
  { id: "spend", label: "Spend", direction: "desc", value: (r) => r.spend, format: (v) => fmtUSD(v, 0) },
  { id: "cpa", label: "CPA", direction: "asc", value: (r) => r.cpa, format: (v) => fmtUSD(v) },
  { id: "lift", label: "Lift", direction: "desc", value: (r) => r.lift, format: (v) => `${v >= 0 ? "+" : ""}${fmtPct(v)}` },
  { id: "confidence", label: "Confidence", direction: "desc", value: (r) => confidenceRank(r.confidence), format: (v) => String(v) },
];

/** `local_book2_library`/`performance_by_cell`'s cell_id space is scoped to
 *  one book (its name says so, and on multi-book accounts the concept-id
 *  overlap confirms it: bookster's BOOK2 concepts C2/C4 own cells
 *  C2B/C2E/C2F/C4E — BOOK0's same-numbered concepts own none). A concept
 *  code alone (e.g. "C2") isn't unique across books, so a null book
 *  (single-book accounts) is trusted, but a named book must say "BOOK2" or
 *  the lookup is skipped rather than risk attributing another book's cell. */
function inLibraryBookScope(book: string): boolean {
  return !book || book.toUpperCase() === "BOOK2";
}

/** First mapped matrix cell for a concept (e.g. concept "C2" → cell "C2B") —
 *  the same cell_id space `?focus=` already deep-links into on IAP Library.
 *  Concepts with no mapped cell (BOOK0 in this account, for example — a
 *  real, already-flagged data-quality gap) get no deep-dive link rather
 *  than one that resolves to nothing. */
function firstCellIdForConcept(book: string, concept: string, cells: CellPerformanceRow[]): string | null {
  if (!inLibraryBookScope(book)) return null;
  const re = new RegExp(`^${concept.toUpperCase()}[A-Z]$`);
  const match = cells.find((c) => re.test(c.cell_id.toUpperCase()));
  return match ? match.cell_id : null;
}

/** Union of each variable family across every local-library cell mapped to
 *  this concept. Cells within a concept can carry different values per row
 *  (e.g. Row B vs Row E), so this shows everything actually in use for the
 *  concept rather than picking one row's stack and presenting it as "the"
 *  answer. Returns null when the library maps no cell to this concept. */
function conceptVariableStack(book: string, concept: string, library: MSTLibraryCell[]): Record<string, string> | null {
  if (!inLibraryBookScope(book)) return null;
  const cells = library.filter((c) => c.concept_id === concept);
  if (cells.length === 0) return null;
  const FAMILIES: Array<[string, keyof MSTLibraryCell]> = [
    ["hook", "hook_variable"],
    ["tone", "tone_variable"],
    ["framework", "framework_variable"],
    ["concept", "concept_variable"],
    ["proof", "proof_variable"],
    ["cta", "cta_variable"],
  ];
  const stack: Record<string, string> = {};
  for (const [label, key] of FAMILIES) {
    const values = new Set<string>();
    for (const c of cells) {
      const raw = c[key];
      // Multi-code cells separate variants with "+" or "/" depending on the
      // source library row — split on either so every real code becomes its
      // own chip instead of one garbled compound string.
      if (typeof raw === "string" && raw) {
        raw.split(/\s*[+/]\s*/).forEach((v) => v.trim() && values.add(v.trim()));
      }
    }
    if (values.size > 0) stack[label] = [...values].join(" + ");
  }
  return Object.keys(stack).length > 0 ? stack : null;
}

function ConceptTierTable({ rollup, playbook, resultNoun, cells, library, detailOn }: {
  rollup: ConceptRollupRow[];
  playbook: ScalingPlaybook | null;
  resultNoun: string;
  cells: CellPerformanceRow[];
  library: MSTLibraryCell[];
  /** Header "Summary/Detailed" toggle — sets each row's default expanded
   *  state; individual rows can still be clicked open/closed afterward. */
  detailOn: boolean;
}) {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<string>("all");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const { activeId, select } = useRankMetric(
    "metrix_tier_sort_v1",
    TIER_RANK_METRICS.map((m) => m.id),
    "spend",
  );
  const tierRows = useMemo(() => computeTierRows(rollup, playbook), [rollup, playbook]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tierRows.length };
    for (const r of tierRows) {
      const k = bucketVerbKey(r.bucket);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [tierRows]);
  const activeMetric = TIER_RANK_METRICS.find((m) => m.id === activeId) ?? TIER_RANK_METRICS[0]!;
  const filteredRows = filter === "all" ? tierRows : tierRows.filter((r) => bucketVerbKey(r.bucket) === filter);
  const sortedRows = sortByRankMetric(filteredRows, activeMetric);
  const fold = useShowMore(sortedRows, 4);

  // Toggling the header's Summary/Detailed control re-defaults every row's
  // expanded state; a row clicked afterward stays under the user's control
  // until the toggle flips again.
  useEffect(() => {
    setExpandedKeys(detailOn ? new Set(tierRows.map((r) => `${r.book}:${r.concept}`)) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOn]);

  const toggleRow = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (rollup.length === 0) return null;

  return (
    <SectionCard
      title="Performance tiers"
      desc="Concept rollup · playbook classification"
      table="concept_rollup"
      right={
        <div className="flex items-center gap-2">
          <SectionInfoIcon tip="Each concept's measured rollup with the strategy map's scaling-playbook classification. Unclassified concepts are position-only in the local library. No playbook entry names them yet. Lift compares each concept's link-CVR against its book's average." />
          <RankSortBar metrics={TIER_RANK_METRICS} activeId={activeMetric.id} onSelect={select} />
        </div>
      }
    >
      <div className="flex items-center gap-1.5 mb-3 flex-wrap" role="group" aria-label="Filter concepts by tier">
        {TIER_FILTERS.map(({ id, label }) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { setFilter(id); setExpandedKeys(new Set()); }}
              aria-pressed={active}
              className={cn(
                "pressable inline-flex items-center gap-1 h-6 px-2 rounded-full border text-label font-medium transition-colors",
                active ? PILL_ACTIVE : PILL_INACTIVE,
              )}
            >
              {label}
              <span className={cn("text-label rounded px-0.5", active ? "text-interactive/70" : "text-muted-foreground/75")}>
                {counts[id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="nc-table" data-testid="concept-tier-table">
          <thead>
            <tr>
              <th>Concept</th>
              <th className="text-right">Spend</th>
              <th className="text-right">CPA</th>
              <th className="text-right">Link CVR</th>
              <th className="text-right">{tierRows[0]?.liftKind === "cpa_vs_baseline" ? "CPA lift vs baseline" : "Lift vs book avg"}</th>
              <th>Confidence</th>
              <th className="text-right">Tier</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  <span className={cn(TYPE.caption, "text-muted-foreground/75")}>No concepts in this tier.</span>
                </td>
              </tr>
            )}
            {fold.visible.map((r) => {
              const key = `${r.book}:${r.concept}`;
              const isOpen = expandedKeys.has(key);
              const zero = (r.results ?? 0) === 0;
              const firstCellId = firstCellIdForConcept(r.book, r.concept, cells);
              const varStack = conceptVariableStack(r.book, r.concept, library);
              return (
                <Fragment key={key}>
                  <tr
                    className={cn(
                      "cursor-pointer transition-opacity duration-300",
                      zero && "opacity-50",
                      expandedKeys.size > 0 && !isOpen && "opacity-40",
                    )}
                    onClick={() => toggleRow(key)}
                    aria-expanded={isOpen}
                  >
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronDown className={cn("w-3 h-3 text-muted-foreground/75 transition-transform shrink-0", isOpen && "rotate-180")} aria-hidden />
                        <span className="font-medium text-foreground/90">{r.book} · {r.concept}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground/75">{r.spend != null ? fmtUSD(r.spend, 0) : "n/a"}</td>
                    <td className="text-right tabular-nums text-foreground/80">{r.cpa != null ? fmtUSD(r.cpa) : zero ? `no ${resultNoun}` : "n/a"}</td>
                    <td className="text-right tabular-nums text-muted-foreground/75">{r.cvr_link_pct != null ? fmtPct(r.cvr_link_pct) : "n/a"}</td>
                    <td className={cn("text-right tabular-nums", r.lift == null ? "text-muted-foreground/75" : r.lift >= 0 ? "text-status-success" : "text-status-danger")}>
                      {r.lift == null ? (
                        <span
                          className={r.liftReason ? "border-b border-dotted border-muted-foreground/40 cursor-help" : undefined}
                          {...(r.liftReason ? { title: `Lift: ${r.liftReason}` } : {})}
                        >
                          –
                        </span>
                      ) : `${r.lift >= 0 ? "+" : ""}${fmtPct(r.lift)}`}
                    </td>
                    <td>{r.confidence ? <ConfidenceBadge value={r.confidence} /> : (
                      <span
                        className={cn(TYPE.label, "text-muted-foreground/75 border-b border-dotted border-muted-foreground/40 cursor-help")}
                        title="Confidence: the analysis engine graded no confidence for this concept. It needs enough spend and results to grade one."
                      >
                        –
                      </span>
                    )}</td>
                    <td className="text-right">
                      {r.bucket ? (
                        <span className={cn(TYPE.label, "inline-flex border rounded-full px-2 py-0.5 font-semibold normal-case", BUCKET_TAG_CLS[r.bucket])}>
                          {BUCKET_LABEL[r.bucket]}
                        </span>
                      ) : (
                        <span className={cn(TYPE.label, "text-muted-foreground/75")}>unclassified</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="pb-3 pt-0">
                        <RevealPanel open>
                        <div className="pl-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="rounded-lg border border-border/40 bg-foreground/[0.02] px-3 py-2">
                            <div className={cn(TYPE.microLabel, "mb-1")}>Confidence</div>
                            <div className={TYPE.body}>{r.confidence ?? "Not scored yet"}</div>
                          </div>
                          <div className="rounded-lg border border-border/40 bg-foreground/[0.02] px-3 py-2">
                            <div className={cn(TYPE.microLabel, "mb-1")}>Recommended next</div>
                            <div className={TYPE.body}>
                              {r.bucketEntry ?? "No playbook entry names this concept yet. Position-only in the local library."}
                            </div>
                          </div>
                          {varStack && (
                            <div className="rounded-lg border border-border/40 bg-foreground/[0.02] px-3 py-2 sm:col-span-2">
                              <div className={cn(TYPE.microLabel, "mb-1.5")}>Variable stack · across mapped rows</div>
                              <div className="space-y-1.5">
                                {Object.entries(varStack).map(([family, codes]) => (
                                  <div key={family} className="flex items-start gap-2 flex-wrap">
                                    <span className={cn(TYPE.microLabel, "shrink-0 pt-0.5 w-24")}>{familyLabel(family)}</span>
                                    <CombinationChips combination={codes} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="pl-5 pt-2.5">
                          {firstCellId ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/app/analysis/library?focus=${firstCellId}`)}
                              className={cn("pressable", TYPE.caption, "inline-flex items-center gap-1.5 font-medium rounded-lg border border-border/40 text-muted-foreground/75 px-3 py-1.5 hover:text-foreground/80 hover:border-border/60 transition-colors")}
                            >
                              Open creative deep dive
                            </button>
                          ) : (
                            <span className={cn(TYPE.caption, "text-muted-foreground/75 italic")}>No mapped creative cell for this concept yet.</span>
                          )}
                        </div>
                        </RevealPanel>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <ShowMoreButton
        total={sortedRows.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun="concepts"
      />
    </SectionCard>
  );
}

// ─── Buyer-intent funnel, data-first ──────────────────────────────────
// Reuses EngagementFunnelView's real stage math (buildFunnelStages) rather
// than re-deriving it.
//
// THE OBJECTIVE LABEL IS A LENS, NEVER A WALL (owner decision, 2026-08-28):
// analysis applies no manual emphasis and no objective-based filtering —
// "the data should speak for itself based on the specific campaign
// objectives defined", flowing downstream undistorted; weighting and
// curation live in the STRATEGY layer. An earlier version of this card
// dropped intent/conversion stages for any account not labelled purely
// "ecommerce", which hid a lead-gen account's 26 real measured purchases —
// exactly the distortion the decision forbids. A stage renders iff it
// carries measured data, whatever the label; since audit round 5 the lower
// stages are the account's own result events, so a lead-gen account's
// leads ARE its conversion band. The absence note names what the export
// lacked (describeLowerFunnel), never a business model: the objective is
// not a way to describe an account to a reader (CLAUDE.md).

function BuyerIntentFunnelCard({ stages, source }: { stages: FunnelStage[]; source?: string | null }) {
  const lowerNote = describeLowerFunnel(stages);
  const visibleStages = stages.filter((s) => s.value != null);

  if (visibleStages.length === 0) return null;
  const maxVal = visibleStages[0]!.value!;

  return (
    <SectionCard
      title="Buyer-intent funnel"
      desc="Impressions through the account's own result events · stage-over-stage retention"
      right={<SectionInfoIcon tip="Every stage with measured data renders, impressions through the intent and conversion events the ads were optimised towards, whatever the account's objectives. Each stage's % is measured against the previous real stage (a terminal event against the last stage before the conversion band); absent stages are explained, never faked as zero bars." />}
    >
      {/* The rows this funnel reads, on the first layer: a demographic
          export is a SHARE of the account, and its 31,542 impressions sat
          under a KPI tile reading 2,572,802 with nothing between them
          (design pass, round 8). */}
      <p className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-2")} data-testid="funnel-source">
        {source ?? "Read from the demographic export"}
      </p>
      <div className="space-y-1.5" data-testid="buyer-intent-funnel">
        {visibleStages.map((stage) => {
          const c = ZONE_COLOR[stage.zone];
          const barW = Math.max((stage.value! / maxVal) * 100, 1.5);
          return (
            <div key={stage.id} className={cn("rounded-lg border p-2.5", c.bg, c.border)}>
              <div className="flex items-center gap-3">
                <span className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 w-28 shrink-0")}>
                  {stage.label}
                </span>
                {/* ONE measure down ONE funnel, so ONE hue. These bars used
                    to take c.bar, painting four stages of the same count in
                    four different colours — the exact defect the funnel
                    waterfall in EngagementFunnelView was rewritten to remove
                    ("THREE HUES FOR ONE MEASURE"). That fix landed in the one
                    view and this consumer of the shared export kept the old
                    behaviour. The zone still reads, from the panel tint and
                    the stage label; it just stops arguing with the bar. */}
                <div className="flex-1 h-4 bg-foreground/[0.04] rounded overflow-hidden">
                  <div className="h-full rounded bg-chart-1/70 transition-[color,background-color,border-color,box-shadow,opacity,transform]" style={{ width: `${barW}%` }} />
                </div>
                <span className={cn(TYPE.body, "font-semibold text-foreground tabular-nums w-20 text-right shrink-0")}>
                  {fmtNum(stage.value!)}
                </span>
              </div>
              {stage.pctOfPrev != null && (
                <div className="flex items-center gap-1 ml-28 pl-3 mt-1">
                  <ArrowRight className="w-3 h-3 text-muted-foreground/75" />
                  <span className={cn(TYPE.microLabel, stage.pctOfPrev >= 20 ? "text-status-success/70" : stage.pctOfPrev >= 5 ? c.text : "text-status-danger/70")}>
                    {stage.pctOfPrev.toFixed(1)}% of {stage.zone === "conversion" ? "the last stage before conversion" : "previous stage"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lowerNote && (
        <div className="mt-2">
          <CaveatNote text={lowerNote} />
        </div>
      )}
      <div className="pt-2.5">
        <CrossLink to="/app/analysis/funnel" label="Open full funnel breakdown" />
      </div>
    </SectionCard>
  );
}

// ─── What moved cost per result — real prior-vs-current, no fabricated
//     per-factor waterfall ───────────────────────────────────────────
// The canvas mocked a 4-bar waterfall (audience mix / creative refresh /
// placement shift / bid strategy). None of those breakdowns carry a prior
// window to diff against anywhere in this schema — demographic_rows,
// placement_rows, and concept_rows on AnalysisSummaryResult are current-
// window-only, and no bid_strategy field exists anywhere in the repo. The
// only real prior-vs-current comparison this data model supports is the
// same windowed totals/prior_totals pair the KPI tiles already use
// (summaryTrends.ts), so that's what renders here instead.

// Bar heights for the 2-bar mini chart — proportional to the taller of the
// two real values, capped at BAR_MAX_H px, with a small floor so a near-zero
// value still renders a visible sliver rather than vanishing.
const BAR_MAX_H = 56;
function barHeightPx(value: number, maxVal: number): number {
  return Math.max((value / maxVal) * BAR_MAX_H, 4);
}

function CostPerResultCard({ adAccountId, accountConfigured }: { adAccountId: string | null; accountConfigured: boolean }) {
  const { data: summary, isLoading } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", "28d"),
    enabled: !!adAccountId && accountConfigured,
  });
  const trend = summary ? trendForMetric("cpa_blended", summary.totals, summary.prior_totals) : null;
  const delta = trend ? trend.current - trend.prior : null;
  const maxVal = trend ? Math.max(trend.prior, trend.current, 0.01) : 1;

  return (
    <SectionCard
      title="What moved cost per result"
      desc="Prior 28-day window vs current · blended cost per result across all result events"
      right={<SectionInfoIcon tip="The same prior-period comparison the KPI tiles use (analysis-summary endpoint, 28-day window). A full per-factor breakdown by audience, creative, and placement isn't available. See the note below." />}
    >
      {trend ? (
        <div className="flex flex-wrap items-end gap-5">
          {/* Honest 2-bar visual — only the two real windowed values this
              data model supports, no fabricated per-factor bars. */}
          <div className="flex items-end gap-3" data-testid="cpr-mini-chart">
            <div className="flex flex-col items-center gap-1.5 w-16">
              <span className={cn(TYPE.caption, "font-semibold text-foreground/75 tabular-nums")}>{fmtUSD(trend.prior)}</span>
              <div
                className="w-8 rounded-t bg-muted-foreground/25"
                style={{ height: `${barHeightPx(trend.prior, maxVal)}px` }}
              />
              <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Prior window</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 w-16">
              <span className={cn(TYPE.caption, "font-semibold text-foreground tabular-nums")}>{fmtUSD(trend.current)}</span>
              <div
                className={cn("w-8 rounded-t", trend.improved ? "bg-status-success/70" : "bg-status-warning/70")}
                style={{ height: `${barHeightPx(trend.current, maxVal)}px` }}
              />
              <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Current window</span>
            </div>
          </div>
          <div className={cn(TYPE.body, "font-semibold pb-1", trend.improved ? "text-status-success" : "text-status-danger")}>
            {trend.deltaPct >= 0 ? "+" : ""}{trend.deltaPct.toFixed(1)}%
            {delta != null && <span className="text-muted-foreground/75 font-normal"> ({delta >= 0 ? "+" : "−"}{fmtUSD(Math.abs(delta))})</span>}
          </div>
        </div>
      ) : (
        <p className={cn(TYPE.body, "text-muted-foreground/75")}>
          {isLoading ? "Loading prior-period comparison…" : "Not enough prior-period data in this window for a real comparison yet."}
        </p>
      )}
      <p className={cn(TYPE.caption, "text-muted-foreground/75 mt-3")}>
        Full per-factor attribution isn't available yet · placement, audience, and creative breakdowns don't carry prior-period comparisons in the current data model.
      </p>
    </SectionCard>
  );
}

export function AdPerformanceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const analysis = getAnalysisData(seed, adAccountId);
  const { range, narrowed, filterCells } = useCellRangeScope(analysis);

  // KPI tile drill-down modal (one shared modal for all tiles).
  const [drillMetricId, setDrillMetricId] = useState<string | null>(null);

  // Header cluster (date-range pills · vs prior · Summary/Detailed · Export)
  // — mirrors AdAccountOverview's own local window/compare/detail state
  // exactly, independent of the global date-range scope used by
  // RangeScopeBar/the KPI tiles above (same split AnalysisCommandCenter
  // already runs: a local preset alongside the app-wide date range).
  const [headerPreset, setHeaderPreset] = useState<ViewPreset>("all");
  const [compareOn, setCompareOn] = useState(true);
  const [detailOn, setDetailOn] = useState(false);
  const { data: headerSummary, isFetching: headerSummaryFetching } = useQuery({
    ...getGetAnalysisSummaryQueryOptions(adAccountId ?? "", headerPreset),
    enabled: !!adAccountId && account?.status === "configured",
  });
  // Real trend/sparkline per metric id, sourced from the header's own
  // analysis-summary window — "vs prior" off hides the trend line, on
  // shows it, exactly like AdAccountOverview's KPI tiles.
  const tileTrendFor = (metricId: string): { trend: KpiTileTrend | null; spark: string | null } => {
    if (!compareOn || !headerSummary) return { trend: null, spark: null };
    const t = trendForMetric(metricId, headerSummary.totals, headerSummary.prior_totals);
    const series = sparkSeriesForMetric(metricId, headerSummary.daily ?? []);
    return {
      trend: t ? { deltaPct: t.deltaPct, improved: t.improved, priorFormatted: formatTrendValue(metricId, t.prior) } : null,
      spark: series ? sparkPoints(series) : null,
    };
  };

  return (
    <ModuleScopeGate section={SECTION} title="Ad Performance" account={account}>
      {() => {
        const acct = account!;
        const term = resultTerm(acct);
        const summary = getCampaignSummary(seed, adAccountId);
        const a = analysis;
        const controls = getCoreControls(seed, adAccountId);

        if (!summary || !a) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Ad Performance" accountName={acct.name} />
              <PendingState title="No analysis yet" message="Analysis appears once performance data is connected or imported." icon={LineChart} />
            </div>
          );
        }

        // Range-scoped totals from the dated concept rollup. When the user
        // narrows the range, tiles reflect only concepts whose flight
        // window overlaps it — no per-day interpolation, whole flights.
        // Scoped to the newest successful run. concept_performance keeps one
        // row per run by design, so the unscoped array holds every run's
        // measurement of every concept — summing it reported a $1,000
        // concept as $2,000 after one re-run and $3,000 after two. Untagged
        // pre-migration rows are kept under every scope.
        const rollupAll = a.concept_rollup ?? [];
        const rollup = scopeToRun(rollupAll, a.latest_analysis_run_id ?? null);
        const rollupSuperseded = supersededCount(rollupAll, a.latest_analysis_run_id ?? null);
        const rollupDates = (r: (typeof rollup)[number]) => ({ start: r.date_start, end: r.date_end });
        const scoped = narrowed
          ? {
              spend: sumInRange(rollup, range, rollupDates, (r) => r.spend),
              linkClicks: sumInRange(rollup, range, rollupDates, (r) => r.link_clicks),
              results: sumInRange(rollup, range, rollupDates, (r) => r.results),
              concepts: rollup.filter((r) => range && r.date_start && r.date_end && !(r.date_end < range.start || r.date_start > range.end)).length,
            }
          : null;
        // Cells are counted as cells (a cell row is cell × result event); a
        // run without a cell library counts its ads with performance; the
        // variable rows are the current run's, not every generation's.
        const cellsInRange = countCells(filterCells(a.performance_by_cell));
        const cellsAll = countCells(a.performance_by_cell);
        const variableRowCount = scopeToRun(a.v3_variable_performance ?? [], a.latest_analysis_run_id ?? null).length;
        const adsWithPerformance = adGrainPerformanceRows(acct.ads).rows.length;
        const demoShare = spendShareLabel(breakdownSpendShare(a, summary, "demographic"));

        const funnelStages = buildFunnelStages(a.demographic_registration_signal, summary);
        const funnelSource = `Read from the demographic export${demoShare ? ` · ${demoShare}` : ""}`;

        const mst = getMST(seed, adAccountId);
        const lib = mst?.local_book2_library ?? [];
        const resolveConceptName = (id: string) =>
          lib.find((c) => c.cell_id === id)?.book2_concept_name ?? id;
        const resolveControlText = (text: string, id: string) => {
          const name = resolveConceptName(id);
          if (name === id) return text;
          // Global replacement via split/join — a plain `.replace(id, name)`
          // only swaps the first match, so a cell id mentioned twice in the
          // same generated sentence would leave the raw code showing the
          // second time. split/join sidesteps building a regex from a
          // string that could theoretically contain regex-special characters.
          return text.split(id).join(name);
        };

        // Featured modules get a full card (icon, description, stat); the
        // rest collapse into a subordinate chip row — progressive disclosure
        // instead of five identical tiles.
        const featuredModules = [
          {
            to: "/app/analysis/library",
            label: "IAP Library",
            Icon: Library,
            desc: "Cell and variable performance across the account.",
            stat: cellsAll > 0
              ? `${narrowed ? `${cellsInRange} cells in range` : `${cellsAll} cells`} · ${variableRowCount} variable rows`
              : `${adsWithPerformance} ads with performance · ${variableRowCount} variable rows`,
          },
          {
            to: "/app/analysis/funnel",
            label: "Engagement Funnel",
            Icon: TrendingUp,
            desc: "Frequency, CTR all vs link, and the full conversion waterfall.",
            stat: `${fmtNum(summary.total_impressions)} impressions · ${fmtNum(summary.total_link_clicks)} link clicks`,
          },
        ];
        const secondaryModules = [
          {
            to: "/app/analysis/audience",
            label: "Audience",
            Icon: Users,
            desc: `Demographic ${term.singular} signal by age and gender.`,
            stat: `${a.demographic_registration_signal.length} demographic rows${demoShare ? ` · ${demoShare}` : ""}`,
          },
          {
            to: "/app/analysis/placements",
            label: "Placements",
            Icon: LayoutGrid,
            desc: "Where delivery happened and what each placement produced.",
            stat: `${a.v3_placement_signal.length + a.c4e_placement_signal.length} placement rows`,
          },
          {
            to: "/app/analysis/budget",
            label: "Budget",
            Icon: Wallet,
            desc: "Spend allocation by result event, concept, and placement.",
            stat: `${fmtUSD(summary.total_spend_usd, 0)} analyzed`,
          },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Ad Performance"
              accountName={acct.name}
              subtitle="What the account's performance data says, and where to drill in."
              table="campaign_summary, performance_by_cell"
              right={
                <OverviewHeaderControls
                  preset={headerPreset}
                  onPresetChange={setHeaderPreset}
                  isFetching={headerSummaryFetching}
                  availableWindow={headerSummary?.available_window}
                  compareOn={compareOn}
                  onToggleCompare={() => setCompareOn((v) => !v)}
                  detailOn={detailOn}
                  onToggleDetail={() => setDetailOn((v) => !v)}
                  exportTo="/app/exports/analysis"
                />
              }
            />
            <RangeScopeBar grainNote="Campaign totals cover the account's full flight window. This import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="analysis data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {scoped ? (
                <KpiTileRow
                  viewKey="ad-performance:in-range"
                  onTileClick={setDrillMetricId}
                  catalog={buildMetricCatalog({
                    spend: scoped.spend,
                    impressions: null,
                    reach: null,
                    clicksAll: null,
                    linkClicks: scoped.linkClicks,
                    linkCtrPct: null,
                    resultEvents: [{ key: "in_range_results", label: "Results (in range)", results: scoped.results, spend: scoped.spend }],
                    isMultiEvent: false,
                  })}
                  tileCount={3}
                  disclosures={{
                    spend: (
                      <span>
                        Range-scoped: {scoped.concepts} concept flight{scoped.concepts === 1 ? "" : "s"} overlapping
                        the selected range · whole flights, no per-day interpolation.
                        {rollupSuperseded > 0 && (
                          <>
                            {" "}Measured by the latest analysis run only; {rollupSuperseded} row
                            {rollupSuperseded === 1 ? "" : "s"} from earlier runs re-measure the same concepts and are
                            excluded rather than added to it.
                          </>
                        )}
                      </span>
                    ),
                  }}
                  trendFor={tileTrendFor}
                />
              ) : (
                <KpiTileRow
                  viewKey="ad-performance"
                  catalog={buildMetricCatalog(metricSourceFromCampaignSummary(summary))}
                  onTileClick={setDrillMetricId}
                  trendFor={tileTrendFor}
                />
              )}
            </div>

            <KpiDrilldownModal
              open={drillMetricId != null}
              onClose={() => setDrillMetricId(null)}
              scope="account"
              metricId={drillMetricId}
              catalog={buildMetricCatalog(
                scoped
                  ? {
                      spend: scoped.spend,
                      impressions: null,
                      reach: null,
                      clicksAll: null,
                      linkClicks: scoped.linkClicks,
                      linkCtrPct: null,
                      resultEvents: [{ key: "in_range_results", label: "Results (in range)", results: scoped.results, spend: scoped.spend }],
                      isMultiEvent: false,
                    }
                  : metricSourceFromCampaignSummary(summary),
              )}
              analysis={a}
              scopedCellRows={filterCells(a.performance_by_cell)}
              scopeNarrowed={narrowed}
              windowLabel={narrowed && range ? `${range.start} → ${range.end} (range-scoped)` : "full flight window"}
            />

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {summary.data_caveat && <CaveatNote text={summary.data_caveat} />}

              <SignalCards flags={acct.iap?.data_quality ?? []} scopeId={acct.id} detailOn={detailOn} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BuyerIntentFunnelCard stages={funnelStages} source={funnelSource} />
                <CostPerResultCard adAccountId={adAccountId} accountConfigured={acct.status === "configured"} />
              </div>

              {controls && (
                <SectionCard title="Core control reads" desc="Control creative · per funnel depth" table="core_reanalysis_read" right={<SectionInfoIcon tip="The winning concept at each funnel stage as determined by the most recent re-analysis run. The benchmark every new test is measured against." />}>
                  {/* Primary control dominates (accent card, 3/5 width);
                      the secondary control read sits subordinate beside it. */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {(() => {
                      const primaryName = resolveConceptName(controls.primary_control);
                      const primaryResolved = primaryName !== controls.primary_control;
                      return (
                        <div className="relative rounded-xl border border-primary/35 bg-primary/[0.03] p-4 md:col-span-3">
                          <div data-testid="primary-control-accent" className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />
                          <div className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-1.5")}>Primary control</div>
                          {/* Unresolved codes (no human name in local_book2_library) render
                              de-emphasized instead of borrowing the resolved-name treatment —
                              a raw composite ID is not a headline. */}
                          <p className={primaryResolved ? TYPE.title : cn(TYPE.body, " text-muted-foreground/75")}>
                            {primaryName}
                          </p>
                          <p className={cn(TYPE.body, "text-muted-foreground/80 mt-1.5")}>{resolveControlText(controls.primary_control_read, controls.primary_control)}</p>
                          {primaryResolved && (
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/75 mt-1.5")}>{controls.primary_control}</p>
                          )}
                        </div>
                      );
                    })()}
                    {controls.registration_control && (() => {
                      const regId = controls.registration_control!;
                      const regName = resolveConceptName(regId);
                      const regResolved = regName !== regId;
                      return (
                        <div className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4 md:col-span-2">
                          <div className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-1.5")}>{term.Singular} control</div>
                          <p className={regResolved ? TYPE.title : cn(TYPE.body, " text-muted-foreground/75")}>
                            {regName}
                          </p>
                          {controls.registration_control_read && (
                            <p className={cn(TYPE.body, "text-muted-foreground/80 mt-1.5")}>{resolveControlText(controls.registration_control_read, regId)}</p>
                          )}
                          {regResolved && (
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/75 mt-1.5")}>{regId}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </SectionCard>
              )}

              <ConceptTierTable
                rollup={
                  narrowed && range
                    ? rollup.filter((r) => r.date_start && r.date_end && !(r.date_end < range.start || r.date_start > range.end))
                    : rollup
                }
                playbook={getStrategyData(seed, adAccountId)?.scaling_playbook ?? null}
                resultNoun={term.plural}
                cells={a.performance_by_cell}
                library={lib}
                detailOn={detailOn}
              />

              {/* Reference strip only — these 5 destinations are already reachable
                  via the Analysis section tab bar in ModuleHeader above; this is
                  a compact index (label + a live stat), not a second nav. Each
                  module's full description lives in the title attr, not as
                  always-visible first-layer prose. */}
              <SectionCard title="Analysis modules" desc="Same data · different slices" right={<SectionInfoIcon tip="Each module drills into a different dimension of the same import. Library (cell/variable performance), Audience, Placements, Budget, and Engagement Funnel." />}>
                {/* Progressive disclosure: the two data-heavy modules get full
                    cards; the remaining slices sit as a subordinate chip row. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {featuredModules.map((s) => (
                    <div
                      key={s.to}
                      data-testid={`featured-module-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-foreground/[0.02] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-4 h-4 text-interactive shrink-0" />
                        <span className={TYPE.title}>{s.label}</span>
                        <div className="ml-auto"><CrossLink to={s.to} label="Open" /></div>
                      </div>
                      <p className={cn(TYPE.caption, "text-muted-foreground/75")}>{s.desc}</p>
                      <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{s.stat}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {secondaryModules.map((s) => (
                    <div
                      key={s.to}
                      title={s.desc}
                      className="flex items-center gap-2 max-w-full rounded-lg border border-border/30 bg-foreground/[0.015] pl-3 pr-1.5 py-1.5"
                    >
                      <s.Icon className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
                      {/* The text column yields before the link does: at 390 px a
                          long stat pushed "Open" past the card's edge (round 8). */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={cn(TYPE.caption, "font-semibold text-foreground/90 truncate")}>{s.label}</span>
                        <span className={cn(TYPE.microLabel, "text-muted-foreground/75 truncate")}>{s.stat}</span>
                      </div>
                      <span className="shrink-0"><CrossLink to={s.to} label="Open" /></span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
