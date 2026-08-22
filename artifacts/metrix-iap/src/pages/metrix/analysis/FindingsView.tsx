// ─── Analyze · Findings ───────────────────────────────────────────────
// AI verdict panel for the Analyze section. Surfaces:
//   • Verdict banner — executive_summary top_finding or top recommendation
//   • Critical alert strip (when present)
//   • Concept intelligence card grid — sorted by CPA ascending (winners first)
//   • Failure patterns — brief list of flagged campaigns
//
// Data sources: account.iap.intelligence (summary + concept_scores +
// failure_patterns) with fallback to optimization_loop recommendation_cards.

import { useMemo } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { fmtMetric } from "@/lib/normalize";
import {
  ModuleHeader,
  ConfidenceBadge,
  DenseText,
  UnconfiguredState,
  fmtUSD,
  fmtNum,
  deriveLabel,
  useShowMore,
  ShowMoreButton,
} from "../shared";
import { TYPE } from "../typography";
import { AlertTriangle, TrendingDown, TrendingUp, Minus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface ConceptScore {
  book: string;
  concept_code: string;
  mapped_in_library: boolean;
  spend: number;
  link_clicks: number;
  results: number;
  cpa: number | null;
  buying_intent_score?: number;
  performance_lift_vs_baseline?: string | number | null;
  performance_tier?: string;
  confidence_level?: string;
  what?: string;
  why?: string;
  so_what?: string;
  now_what?: string;
}

interface FailurePattern {
  campaign: string;
  spend: number;
  wasted_spend?: number;
  diagnosis: string;
  segment_type?: string;
  engagement_present?: boolean;
}

interface ExecutiveSummary {
  top_finding?: string;
  total_spend?: number;
  total_results?: number;
  critical_alert?: string;
  blended_cpa_by_book?: Record<string, number>;
}

interface IntelligenceSummary {
  executive_summary?: ExecutiveSummary;
  report_metadata?: {
    client?: string;
    run_type?: string;
    date_range?: { start?: string; end?: string };
    source_bundle?: string;
  };
}

interface Intelligence {
  summary?: IntelligenceSummary;
  concept_scores?: ConceptScore[];
  failure_patterns?: FailurePattern[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtDate(d: string | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function tierBadge(tier: string | undefined): { label: string; cls: string } {
  if (!tier) return { label: "—", cls: "bg-muted/40 text-muted-foreground/50 border-border/30" };
  const t = tier.toLowerCase();
  if (t.includes("1") || t.includes("scale") || t.includes("winner"))
    return { label: tier.replace(/^\d+\s*[-–]\s*/,""), cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/25" };
  if (t.includes("2") || t.includes("watch") || t.includes("test"))
    return { label: tier.replace(/^\d+\s*[-–]\s*/,""), cls: "bg-sky-400/10 text-sky-400 border-sky-400/25" };
  if (t.includes("3") || t.includes("optim") || t.includes("limit"))
    return { label: tier.replace(/^\d+\s*[-–]\s*/,""), cls: "bg-amber-400/10 text-amber-400 border-amber-400/25" };
  if (t.includes("4") || t.includes("elim") || t.includes("kill") || t.includes("fail"))
    return { label: tier.replace(/^\d+\s*[-–]\s*/,""), cls: "bg-red-400/10 text-red-300 border-red-400/25" };
  return { label: tier, cls: "bg-muted/40 text-muted-foreground/60 border-border/30" };
}

// Performance lift convention: positive = outperforming baseline (good, green ↑),
// negative = underperforming baseline (bad, red ↓). Matches the seeded intelligence
// data where Scale Winner concepts carry +lift and Eliminate concepts carry -lift.
function liftIcon(lift: string | number | null | undefined) {
  if (lift == null) return null;
  const n = typeof lift === "number" ? lift : parseFloat(String(lift));
  if (isNaN(n)) return null;
  if (n > 0.05)  return <TrendingUp   className="w-3 h-3 text-emerald-400 shrink-0" />;
  if (n < -0.05) return <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />;
  return <Minus className="w-3 h-3 text-muted-foreground/40 shrink-0" />;
}

function liftLabel(lift: string | number | null | undefined): string {
  if (lift == null) return "";
  const n = typeof lift === "number" ? lift : parseFloat(String(lift));
  if (isNaN(n)) return "";
  const pct = Math.round(Math.abs(n) * 100);
  return n > 0 ? `${pct}% above baseline` : `${pct}% below baseline`;
}

// ─── Verdict banner ───────────────────────────────────────────────────

function VerdictBanner({
  headline,
  subLine,
  dateRange,
  confidence,
  criticalAlert,
  runType,
}: {
  headline: string;
  subLine?: string | null;
  dateRange?: { start?: string; end?: string };
  confidence?: string;
  criticalAlert?: string;
  runType?: string;
}) {
  return (
    <div className="space-y-3">
      {/* Main banner */}
      <div
        className="rounded-xl border border-[var(--meta-blue-highlight)]/20 bg-primary/5 px-5 py-4 space-y-2"
      >
        {/* Eyebrow */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-label font-bold uppercase tracking-widest text-[var(--meta-blue-highlight)]/80">
            AI Verdict
          </span>
          {runType && (
            <span className="text-label text-muted-foreground/50 font-mono">{runType}</span>
          )}
          {dateRange && (dateRange.start || dateRange.end) && (
            <span className="text-label text-muted-foreground/50 font-mono ml-auto">
              {dateRange.start ? fmtDate(dateRange.start) : ""}
              {dateRange.start && dateRange.end ? " – " : ""}
              {dateRange.end ? fmtDate(dateRange.end) : ""}
            </span>
          )}
        </div>

        {/* Headline */}
        <p
          className="text-foreground leading-[1.3] max-w-[780px]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(15px, 1.5vw, 18px)",
            fontWeight: 600,
          }}
        >
          {headline}
        </p>

        {/* Sub-line / confidence row */}
        {(subLine || confidence) && (
          <div className="flex items-start gap-2 flex-wrap">
            {subLine && (
              <p className="text-body text-muted-foreground/70 leading-relaxed flex-1 min-w-0 max-w-[680px]">
                {subLine}
              </p>
            )}
            {confidence && (
              <div className="shrink-0 mt-0.5">
                <ConfidenceBadge value={confidence} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Critical alert strip */}
      {criticalAlert && (
        <div className="flex items-start gap-2.5 rounded-lg border border-status-warning/20 bg-status-warning/[0.04] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-status-warning/80 shrink-0 mt-0.5" />
          <p className="text-body text-status-warning/90 leading-relaxed">{criticalAlert}</p>
        </div>
      )}
    </div>
  );
}

// ─── Concept intelligence card ────────────────────────────────────────

function ConceptCard({ score }: { score: ConceptScore }) {
  const tb = tierBadge(score.performance_tier);
  const lift = liftIcon(score.performance_lift_vs_baseline);
  const liftLbl = liftLabel(score.performance_lift_vs_baseline);
  const whatText = score.what ?? "";
  const soWhatText = score.so_what ?? "";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-4 gap-3 transition-colors",
        "bg-[var(--void-navy-3)] border-[hsl(var(--border))] hover:border-[hsl(var(--border-default))]"
      )}
    >
      {/* Header row: concept code + tier badge + confidence */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-caption font-bold font-mono text-foreground/60 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.08]">
          {score.book} {score.concept_code}
        </span>
        <span
          className={cn(
            "inline-flex text-label font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
            tb.cls
          )}
        >
          {tb.label}
        </span>
        {score.confidence_level && (
          <div className="ml-auto">
            <ConfidenceBadge value={score.confidence_level} />
          </div>
        )}
      </div>

      {/* Metrics row: CPA · Spend · Results */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-label uppercase tracking-widest text-muted-foreground/45 font-semibold mb-0.5">CPA</div>
          <div
            className="text-title font-semibold tabular-nums leading-none"
            style={{
              background: score.cpa != null ? "var(--grad-meta)" : undefined,
              WebkitBackgroundClip: score.cpa != null ? "text" : undefined,
              WebkitTextFillColor: score.cpa != null ? "transparent" : undefined,
              backgroundClip: score.cpa != null ? "text" : undefined,
              color: score.cpa == null ? "var(--muted-foreground)" : undefined,
            }}
          >
            {score.cpa != null ? fmtUSD(score.cpa, score.cpa < 100 ? 2 : 0) : "—"}
          </div>
        </div>
        <div>
          <div className="text-label uppercase tracking-widest text-muted-foreground/45 font-semibold mb-0.5">Spend</div>
          <div className="text-title font-medium tabular-nums text-foreground/70 leading-none">
            {score.spend != null ? fmtMetric("usd_total", score.spend) : "—"}
          </div>
        </div>
        <div>
          <div className="text-label uppercase tracking-widest text-muted-foreground/45 font-semibold mb-0.5">Results</div>
          <div className="text-title font-medium tabular-nums text-foreground/70 leading-none">
            {score.results != null ? fmtNum(score.results) : "—"}
          </div>
        </div>
      </div>

      {/* Lift vs baseline */}
      {liftLbl && (
        <div className="flex items-center gap-1.5">
          {lift}
          <span className="text-caption text-muted-foreground/55 leading-none">{liftLbl}</span>
        </div>
      )}

      {/* What / so_what text */}
      {(whatText || soWhatText) && (
        <div className="border-t border-white/[0.06] pt-2.5 space-y-1.5">
          {whatText && (
            <DenseText
              text={whatText}
              className="text-caption text-muted-foreground/75 leading-relaxed"
              clampClass="line-clamp-2"
              threshold={80}
            />
          )}
          {soWhatText && (
            <p className="text-label text-muted-foreground/50 leading-snug font-medium uppercase tracking-wide">
              {deriveLabel(soWhatText, 70)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Failure patterns strip ───────────────────────────────────────────

function FailurePatternsStrip({ patterns }: { patterns: FailurePattern[] }) {
  const fold = useShowMore(patterns, 6);
  if (!patterns.length) return null;
  const totalWasted = patterns.reduce((s, p) => s + (p.wasted_spend ?? p.spend ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/55">
          Flagged campaigns
        </span>
        <span className="text-label text-muted-foreground/40 font-mono ml-auto">
          {fmtUSD(totalWasted, 0)} flagged spend
        </span>
      </div>
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--void-navy-3)] overflow-hidden divide-y divide-white/[0.04]">
        {fold.visible.map((p, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <AlertTriangle className="w-3.5 h-3.5 text-status-warning/60 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium text-foreground/80 truncate">{p.campaign}</p>
              <p className="text-caption text-muted-foreground/55 leading-snug mt-0.5">{p.diagnosis}</p>
            </div>
            <span className="shrink-0 text-caption font-mono tabular-nums text-status-warning/70">
              {fmtUSD(p.wasted_spend ?? p.spend, 0)}
            </span>
          </div>
        ))}
      </div>
      <ShowMoreButton total={patterns.length} hiddenCount={fold.hiddenCount} expanded={fold.expanded} onToggle={fold.toggle} noun="findings" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────

function FindingsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="w-12 h-12 rounded-xl border border-border/40 bg-white/[0.02] flex items-center justify-center">
        <span className="text-display opacity-30">🔍</span>
      </div>
      <p className="text-title font-semibold text-foreground/70">No intelligence data yet</p>
      <p className="text-body text-muted-foreground/55 max-w-xs leading-relaxed">
        Run the full IAP loop to generate concept scores, tier rankings, and the AI verdict.
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────

export function FindingsView() {
  const seed      = useMetrixSeed();
  const accountId = useScopedAdAccountId();
  const account   = getAdAccount(seed, accountId);
  const cs        = getCampaignSummary(seed, accountId);

  // ── Intelligence data ─────────────────────────────────────────────
  const intel = (account?.iap?.intelligence ?? null) as Intelligence | null;

  const execSummary: ExecutiveSummary | undefined = intel?.summary?.executive_summary;
  const reportMeta = intel?.summary?.report_metadata;

  const conceptScores: ConceptScore[] = useMemo(() => {
    const raw = intel?.concept_scores ?? [];
    return [...raw].sort((a, b) => {
      // Sort by CPA ascending; null CPA goes last
      if (a.cpa == null && b.cpa == null) return 0;
      if (a.cpa == null) return 1;
      if (b.cpa == null) return -1;
      return a.cpa - b.cpa;
    });
  }, [intel]);

  const failurePatterns: FailurePattern[] = intel?.failure_patterns ?? [];

  const conceptFold = useShowMore(conceptScores, 8);

  // ── Fallback: derive verdict from optimization_loop top card ─────
  const optLoop = account?.iap?.optimization_loop ?? null;
  const topCard = [...(optLoop?.recommendation_cards ?? [])].sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1, setup: 0 } as Record<string, number>;
    return (rank[String(typeof b.impact === "object" && b.impact !== null
      ? (b.impact as { value?: string }).value?.toLowerCase?.() ?? "" : b.impact)?.toLowerCase?.() ?? ""] ?? 0)
      - (rank[String(typeof a.impact === "object" && a.impact !== null
        ? (a.impact as { value?: string }).value?.toLowerCase?.() ?? "" : a.impact)?.toLowerCase?.() ?? ""] ?? 0);
  })[0] ?? null;

  const verdictHeadline =
    execSummary?.top_finding
    ?? topCard?.title
    ?? "Your latest analysis is ready.";

  const subLine: string | null = (() => {
    if (topCard && !execSummary?.top_finding) {
      const m = topCard.rationale?.match(/^(.*?[.!?])\s/);
      const s = m ? m[1] : topCard.rationale;
      return s && s.length > 140 ? s.slice(0, 140).replace(/\s+\S*$/, "") + "…" : (s || null);
    }
    return null;
  })();

  // Date range: prefer report_metadata, fall back to campaign_summary
  const dateRange = reportMeta?.date_range ?? {
    start: cs?.window_start,
    end:   cs?.window_end,
  };

  // Top-card confidence for the verdict banner
  const verdictConfidence = topCard?.confidence ?? null;

  // ── Guard: unconfigured / no iap ─────────────────────────────────
  if (!account) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-6">
        <p className="text-title text-muted-foreground/70">Select an ad account to view Findings.</p>
      </div>
    );
  }

  if (account.status !== "configured" || !account.iap) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6">
        <UnconfiguredState account={account} />
      </div>
    );
  }

  // Show the panel when any meaningful data is present: intelligence summary,
  // concept scores, OR fallback recommendation cards from the optimization loop.
  const hasIntelligence = !!(
    conceptScores.length > 0 ||
    execSummary?.top_finding ||
    topCard
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ModuleHeader
        section="Analyze"
        title="Findings"
        subtitle="AI-generated verdict: concept tier rankings, performance lift vs baseline, and failure patterns."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-8 max-w-[1100px] w-full mx-auto">

          {hasIntelligence ? (
            <>
              {/* ── Verdict banner ─────────────────────────────────────── */}
              <VerdictBanner
                headline={verdictHeadline}
                subLine={subLine}
                dateRange={dateRange}
                confidence={verdictConfidence ?? undefined}
                criticalAlert={execSummary?.critical_alert}
                runType={reportMeta?.run_type}
              />

              {/* ── Blended CPA summary row ────────────────────────────── */}
              {execSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--border))] bg-white/[0.02] px-4 py-3">
                    <span className="text-label uppercase tracking-widest text-muted-foreground/50 font-semibold">Total spend</span>
                    <span
                      className="text-display font-semibold tabular-nums leading-none"
                      style={{ background: "var(--grad-meta)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                    >
                      {execSummary.total_spend != null ? fmtMetric("usd_total", execSummary.total_spend) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--border))] bg-white/[0.02] px-4 py-3">
                    <span className="text-label uppercase tracking-widest text-muted-foreground/50 font-semibold">Total results</span>
                    <span
                      className="text-display font-semibold tabular-nums leading-none"
                      style={{ background: "var(--grad-meta)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                    >
                      {execSummary.total_results != null ? fmtNum(execSummary.total_results) : "—"}
                    </span>
                  </div>
                  {execSummary.blended_cpa_by_book && Object.entries(execSummary.blended_cpa_by_book).slice(0, 2).map(([book, cpa]) => (
                    <div key={book} className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--border))] bg-white/[0.02] px-4 py-3">
                      <span className="text-label uppercase tracking-widest text-muted-foreground/50 font-semibold">Blended CPA · {book}</span>
                      <span
                        className="text-display font-semibold tabular-nums leading-none"
                        style={{ background: "var(--grad-meta)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                      >
                        {fmtUSD(cpa, cpa < 100 ? 2 : 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Concept intelligence card grid ─────────────────────── */}
              {conceptScores.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/55">
                      Concept rankings
                    </span>
                    <span className="text-label text-muted-foreground/35 font-mono">
                      {conceptScores.length} concepts · sorted by CPA
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {conceptFold.visible.map((score, i) => (
                      <ConceptCard key={`${score.book}-${score.concept_code}-${i}`} score={score} />
                    ))}
                  </div>
                  <ShowMoreButton total={conceptScores.length} hiddenCount={conceptFold.hiddenCount} expanded={conceptFold.expanded} onToggle={conceptFold.toggle} noun="concepts" />
                </div>
              )}

              {/* ── Failure patterns ───────────────────────────────────── */}
              {failurePatterns.length > 0 && (
                <FailurePatternsStrip patterns={failurePatterns} />
              )}
            </>
          ) : (
            <FindingsEmptyState />
          )}

        </div>
      </div>
    </div>
  );
}
