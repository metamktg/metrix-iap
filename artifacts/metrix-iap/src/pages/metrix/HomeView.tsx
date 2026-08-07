// ─── HomeView — verdict-first home screen ─────────────────────────────
// Reads from the active scoped ad account via useMetrixSeed() +
// useScopedAdAccountId(). Renders:
//   • Verdict headline + sub-line
//   • Loop strip (Listen → Analyze → Act → Learn)
//   • L0 KPI tiles (Spend / CPA / Results / Concepts)
//   • Next best actions (up to 3 recommendation cards)

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@workspace/command-deck/lib/utils";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { fmtMetric } from "@/lib/normalize";
import {
  deriveLabel, ConfidenceBadge, UnconfiguredState, DenseText,
} from "./shared";
import { TYPE } from "./typography";
import type { RecommendationCard } from "@/lib/data/seedTypes";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/command-deck/components/ui/tooltip";

// ─── helpers ──────────────────────────────────────────────────────────

function spaNav(href: string, e: React.MouseEvent) {
  e.preventDefault();
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function actionVerb(recommended_action: string): { label: string; cls: string } {
  const a = recommended_action.toLowerCase();
  if (a.includes("scale")) return { label: "Scale", cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/25" };
  if (a.includes("pause") || a.includes("kill") || a.includes("stop"))
    return { label: "Kill", cls: "bg-red-400/10 text-red-300 border-red-400/25" };
  return { label: "Fix", cls: "bg-amber-400/10 text-amber-400 border-amber-400/25" };
}

function fmtWindowEnd(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── Loop strip ───────────────────────────────────────────────────────

interface LoopStageProps {
  label: string;
  dot: React.ReactNode;
  sub: string;
  active: boolean;
  href: string;
}

function LoopStage({ label, dot, sub, active, href }: LoopStageProps) {
  return (
    <a
      href={href}
      onClick={(e) => spaNav(href, e)}
      className={cn(
        "flex flex-col items-center gap-1 px-5 py-3 rounded-[11px] border transition-all",
        "min-w-[100px] text-center select-none",
        active
          ? "border-[var(--meta-blue-highlight)] bg-[rgba(0,153,255,0.06)]"
          : "border-[hsl(var(--border))] bg-transparent hover:border-[hsl(var(--border-default))] hover:bg-white/[0.03]"
      )}
    >
      <span className={cn("text-caption font-bold uppercase tracking-widest", active ? "text-[var(--meta-blue-highlight)]" : "text-foreground/70")}>
        {label}
      </span>
      <span className={cn("text-base font-semibold leading-none tabular-nums", active ? "text-[var(--meta-blue-highlight)]" : "text-foreground/50")}>
        {dot}
      </span>
      <span className="text-label text-muted-foreground/60 leading-snug">{sub}</span>
    </a>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────

function KpiTile({ label, stat, unit }: { label: string; stat: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--border))] bg-white/[0.03] px-4 py-3 hover:bg-white/[0.05] transition-colors">
      <span className="text-label uppercase tracking-widest text-muted-foreground/55 font-semibold">{label}</span>
      <span
        className="text-display font-semibold leading-none tabular-nums"
        style={{
          background: "var(--grad-meta)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {stat}
      </span>
      {unit && <span className="text-caption text-muted-foreground/55 leading-tight">{unit}</span>}
    </div>
  );
}

// ─── Action card ──────────────────────────────────────────────────────

function ActionCard({ card }: { card: RecommendationCard }) {
  const [expanded, setExpanded] = useState(false);
  const verb = actionVerb(card.recommended_action);
  const impactLabel = typeof card.impact === "object" && card.impact !== null
    ? `${(card.impact as { value?: string | number; label?: string }).value ?? ""} ${(card.impact as { label?: string }).label ?? ""}`.trim()
    : "";

  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className={cn(
        "w-full text-left rounded-xl border border-[hsl(var(--border))] p-4 transition-all",
        "bg-[var(--void-navy-3)] hover:border-[hsl(var(--border-default))] hover:bg-[rgba(10,26,60,0.95)]"
      )}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("inline-flex text-label font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none", verb.cls)}>
          {verb.label}
        </span>
        <ConfidenceBadge value={card.confidence} />
        {impactLabel && (
          <span className="ml-auto text-caption text-[var(--meta-blue-highlight)] font-semibold tabular-nums">
            {impactLabel}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-title font-semibold text-foreground leading-snug mb-1">
        {deriveLabel(card.title, 60)}
      </p>

      {/* Rationale */}
      {!expanded ? (
        <p className="text-body text-muted-foreground/75 line-clamp-2 leading-relaxed">
          {card.rationale}
        </p>
      ) : (
        <p className="text-body text-muted-foreground/85 leading-relaxed">
          {card.rationale}
        </p>
      )}

      {expanded && card.recommended_action && (
        <p className="mt-2 text-caption text-muted-foreground/60 italic leading-snug">
          {card.recommended_action}
        </p>
      )}
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────

export function HomeView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const [location] = useLocation();
  const account = getAdAccount(seed, adAccountId);

  const optLoop = account?.iap?.optimization_loop ?? null;
  const recCards = useMemo(
    () => [...(optLoop?.recommendation_cards ?? [])].sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1, setup: 0 } as Record<string, number>;
      const aVal = typeof a.impact === "object" && a.impact !== null
        ? (rank[(a.impact as { value?: string }).value?.toLowerCase?.() ?? ""] ?? 0)
        : 0;
      const bVal = typeof b.impact === "object" && b.impact !== null
        ? (rank[(b.impact as { value?: string }).value?.toLowerCase?.() ?? ""] ?? 0)
        : 0;
      return bVal - aVal;
    }),
    [optLoop]
  );

  const topCard = recCards[0] ?? null;
  const displayCards = recCards.slice(0, 3);

  // ── Verdict headline ─────────────────────────────────────────────────
  const verdictHeadline = topCard?.title
    ? topCard.title
    : "Your latest analysis is ready.";

  // Sub-line: first sentence of rationale, up to 120 chars
  const subLine = topCard?.rationale
    ? (() => {
        const m = topCard.rationale.match(/^(.*?[.!?])\s/);
        const sentence = m ? m[1] : topCard.rationale;
        return sentence.length > 120 ? sentence.slice(0, 120).replace(/\s+\S*$/, "") + "…" : sentence;
      })()
    : null;

  // ── Loop strip data ──────────────────────────────────────────────────
  const signalCards = account?.listen?.signal_cards ?? [];
  const cs = account?.iap?.campaign_summary ?? null;
  const perf = account?.iap?.analysis?.performance_by_cell ?? [];
  const actCount = recCards.length;

  const loopActive = (() => {
    if (location.startsWith("/app/home")) return "listen";
    if (location.startsWith("/app/analyze")) return "analyze";
    if (location.startsWith("/app/act")) return "act";
    return "listen";
  })();

  // ── KPI tiles ────────────────────────────────────────────────────────
  const spend = cs?.total_spend_usd ?? null;

  const bestCpa = useMemo(() => {
    const rows = perf.filter(r => r.CPA_result != null);
    if (!rows.length) return null;
    return Math.min(...rows.map(r => r.CPA_result as number));
  }, [perf]);

  const totalResults = useMemo(
    () => perf.reduce((s, r) => s + (Number(r.Results) || 0), 0),
    [perf]
  );

  const conceptCount = useMemo(
    () => new Set(perf.map(r => r.book2_concept_name).filter(Boolean)).size,
    [perf]
  );

  // ── Analyze sub-label ────────────────────────────────────────────────
  const cellCount = perf.length;
  const analyzeDate = cs?.window_end ? fmtWindowEnd(cs.window_end) : "";
  const analyzeSubLabel = cellCount > 0
    ? `${cellCount} cells${analyzeDate ? " · " + analyzeDate : ""}`
    : "No data yet";

  // ── Listen sub-label ─────────────────────────────────────────────────
  const listenSubLabel = signalCards.length > 0 ? "Synced" : "No signals";

  // ── Unconfigured state guard ─────────────────────────────────────────
  if (!account) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-6">
        <h1
          className="text-2xl font-semibold text-foreground mb-2 max-w-[680px] text-center leading-[1.22]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome to Metrix.
        </h1>
        <p className="text-title text-muted-foreground/70">Select an ad account to see your dashboard.</p>
      </div>
    );
  }

  if (account.status !== "configured" || !account.iap) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6">
        <h1
          className="text-2xl font-semibold text-foreground mb-6 max-w-[680px] leading-[1.22]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Set up {account.name} to get started.
        </h1>
        <UnconfiguredState account={account} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-6 py-6 space-y-6 max-w-[1100px] w-full mx-auto">

        {/* ── Verdict headline block ──────────────────────────────────── */}
        <div className="space-y-1.5">
          <h1
            className="text-foreground leading-[1.22] max-w-[680px]"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(22px, 2vw, 28px)",
              fontWeight: 600,
            }}
          >
            {verdictHeadline}
          </h1>
          {subLine && (
            <p className="text-title text-muted-foreground/75 max-w-[600px] leading-relaxed">
              {subLine}
            </p>
          )}
        </div>

        {/* ── Loop strip ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <LoopStage
            label="Listen"
            dot={signalCards.length > 0 ? "✓" : "·"}
            sub={listenSubLabel}
            active={loopActive === "listen"}
            href="/app/home"
          />
          <span className="text-[var(--mx-border-strong)] text-sm select-none">→</span>
          <LoopStage
            label="Analyze"
            dot={perf.length > 0 ? "✓" : "·"}
            sub={analyzeSubLabel}
            active={loopActive === "analyze"}
            href="/app/analyze/findings"
          />
          <span className="text-[var(--mx-border-strong)] text-sm select-none">→</span>
          <LoopStage
            label="Act"
            dot={actCount > 0 ? String(actCount) : "·"}
            sub={actCount > 0 ? `${actCount} pending` : "No actions"}
            active={loopActive === "act"}
            href="/app/act/queue"
          />
          <span className="text-[var(--mx-border-strong)] text-sm select-none">→</span>
          <LoopStage
            label="Learn"
            dot="…"
            sub="Awaiting results"
            active={false}
            href="/app/home"
          />
        </div>

        {/* ── L0 KPI tiles ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            label="Spend"
            stat={spend != null ? fmtMetric("usd_total", spend) : "—"}
            unit="total invested"
          />
          <KpiTile
            label="Best CPA"
            stat={bestCpa != null ? fmtMetric("usd_unit", bestCpa) : "—"}
            unit="per result"
          />
          <KpiTile
            label="Results"
            stat={totalResults > 0 ? fmtMetric("count", totalResults) : "—"}
            unit="total conversions"
          />
          <KpiTile
            label="Concepts"
            stat={conceptCount > 0 ? String(conceptCount) : "—"}
            unit="active in analysis"
          />
        </div>

        {/* ── Next best actions ───────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/55">
              Next best actions
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground/35 hover:text-muted-foreground/65 transition-colors">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-caption">
                  Highest-impact moves from your latest analysis run
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {displayCards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {displayCards.map(card => (
                <ActionCard key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border/40 px-6 py-8 text-center">
              <p className="text-body text-muted-foreground/50">
                Run analysis to surface actions.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
