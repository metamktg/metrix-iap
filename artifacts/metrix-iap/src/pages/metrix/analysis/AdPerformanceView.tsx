// ─── Analysis · Ad Performance ──────────────────────────────────────────
// The charts/tiles read surface for Analysis (formerly "Overview"):
// campaign totals, the core control reads, and jump-offs into each
// analysis subpage. The Analysis command center (AnalysisCommandCenter,
// mounted at the parent /app/analysis route) owns execution + run
// history — this page is read-only.

import { useState, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import { getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls, getMST, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CaveatNote, SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState, SectionInfoIcon,
  ConfidenceBadge, useShowMore, ShowMoreButton, DetailReveal,
  PILL_ACTIVE, PILL_INACTIVE,
} from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import { LineChart, Library, Users, LayoutGrid, Wallet, TrendingUp, AlertTriangle, Eye, ChevronDown } from "lucide-react";
import { KpiTileRow } from "@/components/metrics/KpiTile";
import { buildMetricCatalog, metricSourceFromCampaignSummary } from "@/lib/data/metricsCatalog";
import { bucketEntryForConcept, BUCKET_LABEL, type ScalingBucket } from "@/lib/data/scalingBuckets";
import { normalizeConfidence } from "@/lib/normalize";
import { RankSortBar, sortByRankMetric, useRankMetric, type RankMetric } from "./rankSort";
import { CombinationChips, familyLabel } from "../strategy/strategyShared";
import type { DataQualityFlag, ConceptRollupRow, ScalingPlaybook, CellPerformanceRow, MSTLibraryCell } from "@/lib/data/seedTypes";

const SECTION = "Analysis · 03";

// ─── Signal cards — the canvas's analysis signal strip ────────────────
// Renders the account's real data_quality flags (raised by the last
// analysis run): anomalies read as "Investigate", quality flags as
// "Watch", everything else (attribution window, quality score) as
// neutral notes. First surface in the app to render these flags.

function flagHeadline(f: DataQualityFlag): string {
  const type = typeof f["type"] === "string" ? (f["type"] as string) : null;
  if (type) return type.replace(/_/g, " ");
  // Some quality_flag entries (e.g. the live-pilot underspend/zero-conversion
  // set) carry a `flag` id instead of `type` — a real, specific label beats
  // the generic kind-only fallback below.
  const flagId = typeof f["flag"] === "string" ? (f["flag"] as string) : null;
  if (flagId) return flagId.replace(/_/g, " ");
  return f.kind === "attribution_window" ? "Attribution window" : f.kind.replace(/_/g, " ");
}

function flagBody(f: DataQualityFlag): string {
  const note = typeof f["note"] === "string" ? (f["note"] as string) : null;
  if (note) return note;
  const campaign = typeof f["campaign"] === "string" ? (f["campaign"] as string) : null;
  const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
  const parts = [campaign, spend != null ? `${fmtUSD(spend)} affected` : null].filter(Boolean);
  return parts.join(" · ") || "Raised by the last analysis run.";
}

// Evidence grid behind "Show evidence" — every scalar field actually present
// on the real flag object, beyond the ones already surfaced in the headline
// and so-what paragraph. Nothing here is computed or guessed; keys that
// aren't present on a given flag simply don't produce a row.
function flagEvidence(f: DataQualityFlag): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = [{ k: "Kind", v: f.kind.replace(/_/g, " ") }];
  const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
  if (spend != null) rows.push({ k: "Spend affected", v: fmtUSD(spend) });
  const results = typeof f["results"] === "number" ? (f["results"] as number) : null;
  if (results != null) rows.push({ k: "Results", v: fmtNum(results) });
  const campaign = typeof f["campaign"] === "string" ? (f["campaign"] as string) : null;
  if (campaign) rows.push({ k: "Campaign", v: campaign });
  const platform = typeof f["platform"] === "string" ? (f["platform"] as string) : null;
  if (platform) rows.push({ k: "Platform", v: platform });
  const placement = typeof f["placement"] === "string" ? (f["placement"] as string) : null;
  if (placement) rows.push({ k: "Placement", v: placement });
  const impressions = typeof f["impressions"] === "number" ? (f["impressions"] as number) : null;
  if (impressions != null) rows.push({ k: "Impressions", v: fmtNum(impressions) });
  const severity = typeof f["severity"] === "string" ? (f["severity"] as string) : null;
  if (severity) rows.push({ k: "Severity", v: severity.charAt(0).toUpperCase() + severity.slice(1) });
  return rows;
}

function SignalCards({ flags }: { flags: DataQualityFlag[] }) {
  const fold = useShowMore(flags, 4);
  const [, navigate] = useLocation();
  if (flags.length === 0) return null;
  return (
    <SectionCard
      title="Signals"
      desc="Data-quality flags from the last analysis run"
      right={<SectionInfoIcon tip="Anomalies and quality flags the analysis raised against this window — tracking gaps, zero-conversion campaigns, coverage caveats. Investigate before treating affected reads as final." />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5" data-testid="signal-cards">
        {fold.visible.map((f, i) => {
          const isAnomaly = f.kind === "anomaly";
          const severity = isAnomaly ? "Investigate" : f.kind === "quality_flag" ? "Watch" : "Note";
          const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
          const evidence = flagEvidence(f);
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border px-3.5 py-3 flex flex-col gap-2",
                isAnomaly ? "border-amber-400/30 bg-amber-400/[0.04]" : "border-border/40 bg-white/[0.015]",
              )}
            >
              <div className="flex items-center gap-1.5">
                {isAnomaly
                  ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                  : <Eye className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                <span className={cn(TYPE.label, "font-mono uppercase tracking-widest", isAnomaly ? "text-amber-400/85" : "text-muted-foreground/60")}>
                  {severity}
                </span>
                {/* Real spend-affected badge — never a fabricated confidence percentage. */}
                {spend != null && (
                  <span className={cn(TYPE.label, "ml-auto shrink-0 border rounded-full px-2 py-0.5 font-semibold normal-case tracking-normal text-muted-foreground/65 border-border/40 bg-white/[0.03]")}>
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
              <DetailReveal
                label="Show evidence"
                labelClassName={cn(TYPE.caption, "font-semibold text-interactive")}
                eyebrow="Evidence"
                sections={evidence.map((e) => ({ label: e.k, text: e.v }))}
              />
              {/* No real per-flag acknowledge/snooze mechanism exists yet — this
                  cross-links into the real Listen · Signal surface instead of a
                  decorative "Verify tracking" button that would do nothing. */}
              <div className="mt-auto pt-1">
                <button
                  type="button"
                  onClick={() => navigate("/app/listen/signal")}
                  className={cn(TYPE.caption, "inline-flex items-center gap-1.5 font-semibold rounded-lg border border-primary/40 bg-primary/15 text-interactive px-3 py-1.5 hover:bg-primary/25 transition-colors")}
                >
                  Review in Listen
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <ShowMoreButton
        total={flags.length}
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
  optimize: "border-border/40 bg-white/[0.04] text-foreground/75",
  validate: "border-border/40 bg-white/[0.04] text-muted-foreground/70",
  explore: "border-border/40 bg-white/[0.04] text-muted-foreground/70",
  avoid: "border-red-400/30 bg-red-400/10 text-red-300",
};

// Real tier vocabulary only — the strategy map classifies into these five
// buckets (plus "no match yet"). Canvas's mock used a sixth "Retire" label
// that doesn't exist anywhere in this app's scaling-playbook system, so it
// isn't reproduced here.
const TIER_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "scale_now", label: "Scale" },
  { id: "optimize", label: "Optimize" },
  { id: "validate", label: "Validate" },
  { id: "explore", label: "Explore" },
  { id: "avoid", label: "Avoid" },
  { id: "unclassified", label: "Unclassified" },
];

interface TierRow extends ConceptRollupRow {
  lift: number | null;
  bucket: ScalingBucket | null;
  bucketEntry: string | null;
}

/** CVR lift against the row's own book average — same formula MstSprintsView
 *  uses for "CVR lift vs avg" (confidence-checked in a prior audit), just
 *  applied across every book present in the rollup rather than one at a time. */
function computeTierRows(rollup: ConceptRollupRow[], playbook: ScalingPlaybook | null): TierRow[] {
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
    const avg = avgCvr(r.book);
    const lift = avg != null && avg > 0 && r.cvr_link_pct != null
      ? ((r.cvr_link_pct - avg) / avg) * 100
      : null;
    const match = bucketEntryForConcept(r.book, r.concept, playbook);
    return { ...r, lift, bucket: match?.bucket ?? null, bucketEntry: match?.entry ?? null };
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

function ConceptTierTable({ rollup, playbook, resultNoun, cells, library }: {
  rollup: ConceptRollupRow[];
  playbook: ScalingPlaybook | null;
  resultNoun: string;
  cells: CellPerformanceRow[];
  library: MSTLibraryCell[];
}) {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<string>("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { activeId, select } = useRankMetric(
    "metrix_tier_sort_v1",
    TIER_RANK_METRICS.map((m) => m.id),
    "spend",
  );
  const tierRows = useMemo(() => computeTierRows(rollup, playbook), [rollup, playbook]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tierRows.length };
    for (const r of tierRows) {
      const k = r.bucket ?? "unclassified";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [tierRows]);
  const activeMetric = TIER_RANK_METRICS.find((m) => m.id === activeId) ?? TIER_RANK_METRICS[0]!;
  const filteredRows = filter === "all" ? tierRows : tierRows.filter((r) => (r.bucket ?? "unclassified") === filter);
  const sortedRows = sortByRankMetric(filteredRows, activeMetric);
  const fold = useShowMore(sortedRows, 4);

  if (rollup.length === 0) return null;

  return (
    <SectionCard
      title="Performance tiers"
      desc="Concept rollup · playbook classification"
      table="concept_rollup"
      right={
        <div className="flex items-center gap-2">
          <SectionInfoIcon tip="Each concept's measured rollup with the strategy map's scaling-playbook classification. Unclassified concepts are position-only in the local library — no playbook entry names them yet. Lift compares each concept's link-CVR against its book's average." />
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
              onClick={() => { setFilter(id); setExpandedKey(null); }}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1 h-6 px-2 rounded-full border text-label font-medium transition-colors",
                active ? PILL_ACTIVE : PILL_INACTIVE,
              )}
            >
              {label}
              <span className={cn("text-label font-mono rounded px-0.5", active ? "text-interactive/70" : "text-muted-foreground/40")}>
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
              <th className="text-right">Lift vs book avg</th>
              <th>Confidence</th>
              <th className="text-right">Tier</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  <span className={cn(TYPE.caption, "text-muted-foreground/50")}>No concepts in this tier.</span>
                </td>
              </tr>
            )}
            {fold.visible.map((r) => {
              const key = `${r.book}:${r.concept}`;
              const isOpen = expandedKey === key;
              const zero = (r.results ?? 0) === 0;
              const firstCellId = firstCellIdForConcept(r.book, r.concept, cells);
              const varStack = conceptVariableStack(r.book, r.concept, library);
              return (
                <Fragment key={key}>
                  <tr
                    className={cn(zero && "opacity-50", "cursor-pointer")}
                    onClick={() => setExpandedKey(isOpen ? null : key)}
                    aria-expanded={isOpen}
                  >
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform shrink-0", isOpen && "rotate-180")} aria-hidden />
                        <span className="font-medium text-foreground/90">{r.book} · {r.concept}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground/75">{r.spend != null ? fmtUSD(r.spend, 0) : "n/a"}</td>
                    <td className="text-right tabular-nums text-foreground/80">{r.cpa != null ? fmtUSD(r.cpa) : zero ? `no ${resultNoun}` : "n/a"}</td>
                    <td className="text-right tabular-nums text-muted-foreground/75">{r.cvr_link_pct != null ? fmtPct(r.cvr_link_pct) : "n/a"}</td>
                    <td className={cn("text-right tabular-nums", r.lift == null ? "text-muted-foreground/40" : r.lift >= 0 ? "text-emerald-400" : "text-red-300")}>
                      {r.lift == null ? "—" : `${r.lift >= 0 ? "+" : ""}${fmtPct(r.lift)}`}
                    </td>
                    <td>{r.confidence ? <ConfidenceBadge value={r.confidence} /> : <span className={cn(TYPE.label, "text-muted-foreground/35")}>—</span>}</td>
                    <td className="text-right">
                      {r.bucket ? (
                        <span className={cn(TYPE.label, "inline-flex border rounded-full px-2 py-0.5 font-semibold normal-case", BUCKET_TAG_CLS[r.bucket])}>
                          {BUCKET_LABEL[r.bucket]}
                        </span>
                      ) : (
                        <span className={cn(TYPE.label, "text-muted-foreground/35")}>unclassified</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="pb-3 pt-0">
                        <div className="pl-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2">
                            <div className={cn(TYPE.microLabel, "mb-1")}>Confidence</div>
                            <div className={TYPE.body}>{r.confidence ?? "Not scored yet"}</div>
                          </div>
                          <div className="rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2">
                            <div className={cn(TYPE.microLabel, "mb-1")}>Recommended next</div>
                            <div className={TYPE.body}>
                              {r.bucketEntry ?? "No playbook entry names this concept yet — position-only in the local library."}
                            </div>
                          </div>
                          {varStack && (
                            <div className="rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2 sm:col-span-2">
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
                              className={cn(TYPE.caption, "inline-flex items-center gap-1.5 font-medium rounded-lg border border-border/40 text-muted-foreground/70 px-3 py-1.5 hover:text-foreground/80 hover:border-border/60 transition-colors")}
                            >
                              Open creative deep dive
                            </button>
                          ) : (
                            <span className={cn(TYPE.caption, "text-muted-foreground/40 italic")}>No mapped creative cell for this concept yet.</span>
                          )}
                        </div>
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

export function AdPerformanceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const analysis = getAnalysisData(seed, adAccountId);
  const { range, narrowed, filterCells } = useCellRangeScope(analysis);

  // KPI tile drill-down modal (one shared modal for all tiles).
  const [drillMetricId, setDrillMetricId] = useState<string | null>(null);

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
              <ModuleHeader section={SECTION} title="Ad Performance" />
              <PendingState title="No analysis yet" message="Analysis appears once performance data is connected or imported." icon={LineChart} />
            </div>
          );
        }

        // Range-scoped totals from the dated concept rollup. When the user
        // narrows the range, tiles reflect only concepts whose flight
        // window overlaps it — no per-day interpolation, whole flights.
        const rollup = a.concept_rollup ?? [];
        const rollupDates = (r: (typeof rollup)[number]) => ({ start: r.date_start, end: r.date_end });
        const scoped = narrowed
          ? {
              spend: sumInRange(rollup, range, rollupDates, (r) => r.spend),
              linkClicks: sumInRange(rollup, range, rollupDates, (r) => r.link_clicks),
              results: sumInRange(rollup, range, rollupDates, (r) => r.results),
              concepts: rollup.filter((r) => range && r.date_start && r.date_end && !(r.date_end < range.start || r.date_start > range.end)).length,
            }
          : null;
        const cellRowsInRange = filterCells(a.performance_by_cell).length;

        const mst = getMST(seed, adAccountId);
        const lib = mst?.local_book2_library ?? [];
        const resolveConceptName = (id: string) =>
          lib.find((c) => c.cell_id === id)?.book2_concept_name ?? id;
        const resolveControlText = (text: string, id: string) => {
          const name = resolveConceptName(id);
          if (name === id) return text;
          return text.replace(id, name);
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
            stat: narrowed
              ? `${cellRowsInRange} cell rows in range · ${a.v3_variable_performance.length} variable rows`
              : `${a.performance_by_cell.length} cell rows · ${a.v3_variable_performance.length} variable rows`,
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
            stat: `${a.demographic_registration_signal.length} demographic rows`,
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
              subtitle="What the account's performance data says, and where to drill in."
              table="campaign_summary, performance_by_cell"
            />
            <RangeScopeBar grainNote="Campaign totals cover the account's full flight window — this import has no daily grain." />

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
                    resultEvents: [{ key: "in_range_results", label: "Results (in range)", results: scoped.results }],
                    isMultiEvent: false,
                  })}
                  tileCount={3}
                  disclosures={{
                    spend: <span>Range-scoped: {scoped.concepts} concept flight{scoped.concepts === 1 ? "" : "s"} overlapping the selected range — whole flights, no per-day interpolation.</span>,
                  }}
                />
              ) : (
                <KpiTileRow
                  viewKey="ad-performance"
                  catalog={buildMetricCatalog(metricSourceFromCampaignSummary(summary))}
                  onTileClick={setDrillMetricId}
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
                      resultEvents: [{ key: "in_range_results", label: "Results (in range)", results: scoped.results }],
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

              <SignalCards flags={acct.iap?.data_quality ?? []} />

              {controls && (
                <SectionCard title="Core control reads" desc="Control creative · per funnel depth" table="core_reanalysis_read" right={<SectionInfoIcon tip="The winning concept at each funnel stage as determined by the most recent re-analysis run — the benchmark every new test is measured against." />}>
                  {/* Primary control dominates (accent card, 3/5 width);
                      the secondary control read sits subordinate beside it. */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {(() => {
                      const primaryName = resolveConceptName(controls.primary_control);
                      const primaryResolved = primaryName !== controls.primary_control;
                      return (
                        <div className="relative rounded-xl border border-primary/35 bg-primary/[0.03] p-4 md:col-span-3">
                          <div data-testid="primary-control-accent" className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />
                          <div className={cn(TYPE.microLabel, "text-muted-foreground/70 mb-1.5")}>Primary control</div>
                          {/* Unresolved codes (no human name in local_book2_library) render
                              de-emphasized instead of borrowing the resolved-name treatment —
                              a raw composite ID is not a headline. */}
                          <p className={primaryResolved ? TYPE.title : cn(TYPE.body, "font-mono text-muted-foreground/70")}>
                            {primaryName}
                          </p>
                          <p className={cn(TYPE.body, "text-muted-foreground/80 mt-1.5")}>{resolveControlText(controls.primary_control_read, controls.primary_control)}</p>
                          {primaryResolved && (
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/40 mt-1.5")}>{controls.primary_control}</p>
                          )}
                        </div>
                      );
                    })()}
                    {controls.registration_control && (() => {
                      const regId = controls.registration_control!;
                      const regName = resolveConceptName(regId);
                      const regResolved = regName !== regId;
                      return (
                        <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4 md:col-span-2">
                          <div className={cn(TYPE.microLabel, "text-muted-foreground/70 mb-1.5")}>{term.Singular} control</div>
                          <p className={regResolved ? TYPE.title : cn(TYPE.body, "font-mono text-muted-foreground/70")}>
                            {regName}
                          </p>
                          {controls.registration_control_read && (
                            <p className={cn(TYPE.body, "text-muted-foreground/80 mt-1.5")}>{resolveControlText(controls.registration_control_read, regId)}</p>
                          )}
                          {regResolved && (
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/40 mt-1.5")}>{regId}</p>
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
              />

              {/* Reference strip only — these 5 destinations are already reachable
                  via the Analysis section tab bar in ModuleHeader above; this is
                  a compact index (label + a live stat), not a second nav. Each
                  module's full description lives in the title attr, not as
                  always-visible first-layer prose. */}
              <SectionCard title="Analysis modules" desc="Same data · different slices" right={<SectionInfoIcon tip="Each module drills into a different dimension of the same import — Library (cell/variable performance), Audience, Placements, Budget, and Engagement Funnel." />}>
                {/* Progressive disclosure: the two data-heavy modules get full
                    cards; the remaining slices sit as a subordinate chip row. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {featuredModules.map((s) => (
                    <div
                      key={s.to}
                      data-testid={`featured-module-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-white/[0.02] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <s.Icon className="w-4 h-4 text-interactive shrink-0" />
                        <span className={TYPE.title}>{s.label}</span>
                        <div className="ml-auto"><CrossLink to={s.to} label="Open" /></div>
                      </div>
                      <p className={cn(TYPE.caption, "text-muted-foreground/70")}>{s.desc}</p>
                      <span className={cn(TYPE.microLabel, "text-muted-foreground/50")}>{s.stat}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {secondaryModules.map((s) => (
                    <div
                      key={s.to}
                      title={s.desc}
                      className="flex items-center gap-2 rounded-lg border border-border/30 bg-white/[0.015] pl-3 pr-1.5 py-1.5"
                    >
                      <s.Icon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className={cn(TYPE.caption, "font-semibold text-foreground/90")}>{s.label}</span>
                        <span className={cn(TYPE.microLabel, "text-muted-foreground/50 truncate")}>{s.stat}</span>
                      </div>
                      <CrossLink to={s.to} label="Open" />
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
