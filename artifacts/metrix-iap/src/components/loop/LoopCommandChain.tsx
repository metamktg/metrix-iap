// ─── IAP Loop · Command Chain ─────────────────────────────────────────
//
// THREE minimal stage tiles — pure state at a glance, no data on face.
// Each tile is a clickable state light: icon + indicator + label only.
//
// Clicking opens the Command Hub: a progressive-disclosure panel that
// surfaces the full intelligence for that stage in four layers —
//   1. Header: stage identity + live status
//   2. Intelligence: what's inside (stat pills, provenance, causal deps)
//   3. Navigate: direct links to every subtab in this layer
//   4. Act: data uploads, API connections, generate/regenerate commands
//
// Tile philosophy: no numbers, no copy — state speaks through color + icon.
// Hub philosophy: everything needed to understand + act on this stage.
//
// HARD CONSTRAINT: every action is user-initiated. Nothing auto-advances.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGetLatestAnalysisRun } from "@workspace/api-client-react";
import { useGenerationRun } from "@/components/generation/GenerationControls";
import type { AdAccount, StrategyData, BriefBuilder } from "@/lib/data/seedTypes";
import {
  BarChart3, Layers, FileText,
  CheckCircle2, Lock, Loader2, X,
  Upload, Link2, PlayCircle, RefreshCw,
  AlertTriangle, Sparkles, ArrowRight, Clock, RotateCcw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

type Stage = "analysis" | "strategy" | "briefs";

// ── Route map ─────────────────────────────────────────────────────────────

const STAGE_ROUTES: Record<Stage, { label: string; path: string; desc: string }[]> = {
  analysis: [
    { label: "Overview",   path: "/app/analysis/overview",   desc: "Cells · variables" },
    { label: "Library",    path: "/app/analysis/library",    desc: "Creative concepts" },
    { label: "Audience",   path: "/app/analysis/audience",   desc: "Demographic signal" },
    { label: "Placements", path: "/app/analysis/placements", desc: "Placement signal" },
    { label: "Budget",     path: "/app/analysis/budget",     desc: "Spend allocation" },
  ],
  strategy: [
    { label: "Overview",      path: "/app/strategy/overview",   desc: "Pillar summary" },
    { label: "Strategy Map",  path: "/app/strategy/map",        desc: "Variable combinations" },
    { label: "Avatars",       path: "/app/strategy/avatars",    desc: "ICP profiles" },
    { label: "Hypotheses",    path: "/app/strategy/hypotheses", desc: "Test queue" },
  ],
  briefs: [
    { label: "Builder", path: "/app/briefs/builder", desc: "Draft & export" },
    { label: "History", path: "/app/briefs/history", desc: "Past generations" },
  ],
};

// ── Stage config ──────────────────────────────────────────────────────────

const STAGE_CONFIG = {
  analysis: { icon: BarChart3, label: "Analysis" },
  strategy: { icon: Layers,    label: "Strategy"  },
  briefs:   { icon: FileText,  label: "Briefs"    },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Stat pill ─────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: string | number; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-[10px] tabular-nums bg-white/[0.04] border border-border/20 rounded-md px-2 py-1 leading-none">
      <span className="font-bold text-foreground/70">{value}</span>
      {label && <span className="text-muted-foreground/40 font-normal">{label}</span>}
    </span>
  );
}

// ── Dependency badge ──────────────────────────────────────────────────────

function DepBadge({
  label,
  satisfied,
}: {
  label: string;
  satisfied: boolean;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[9px] font-semibold rounded-md px-2 py-1 leading-none border",
      satisfied
        ? "text-emerald-400/75 bg-emerald-400/[0.08] border-emerald-400/15"
        : "text-muted-foreground/30 bg-white/[0.025] border-border/15",
    )}>
      {satisfied
        ? <CheckCircle2 className="w-2.5 h-2.5" />
        : <Lock className="w-2.5 h-2.5" />
      }
      {label}
    </span>
  );
}

// ── Minimal stage tile ────────────────────────────────────────────────────

function StageTile({
  stage,
  isComplete,
  isRunning,
  isStale,
  isNext,
  isLocked,
  isActive,
  elapsedSeconds,
  onClick,
}: {
  stage: Stage;
  isComplete: boolean;
  isRunning: boolean;
  isStale: boolean;
  isNext: boolean;
  isLocked: boolean;
  isActive: boolean;
  elapsedSeconds?: number;
  onClick: () => void;
}) {
  const { icon: Icon, label } = STAGE_CONFIG[stage];

  return (
    <button
      onClick={onClick}
      disabled={isLocked}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-xl flex-1 min-w-0 overflow-hidden",
        "border transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
        isLocked
          ? "border-border/8 bg-transparent opacity-25 cursor-not-allowed"
          : isActive
          ? "border-primary/40 bg-primary/[0.1] shadow-sm shadow-primary/10 cursor-pointer"
          : isRunning
          ? "border-amber-400/30 bg-amber-400/[0.05] cursor-pointer"
          : isStale
          ? "border-orange-400/30 bg-orange-400/[0.04] hover:border-orange-400/45 hover:bg-orange-400/[0.07] cursor-pointer"
          : isComplete
          ? "border-emerald-400/20 bg-emerald-400/[0.03] hover:border-emerald-400/35 hover:bg-emerald-400/[0.06] cursor-pointer"
          : isNext
          ? "border-primary/25 bg-primary/[0.04] hover:border-primary/40 hover:bg-primary/[0.08] cursor-pointer"
          : "border-border/15 hover:border-border/30 cursor-pointer",
      )}
    >
      {/* Animated indeterminate progress bar — bottom edge, running only */}
      {isRunning && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden"
        >
          <span className="absolute inset-y-0 w-1/2 bg-amber-400/50 rounded-full animate-[progress-slide_1.4s_ease-in-out_infinite]" />
        </span>
      )}

      {/* Icon + inline state indicator */}
      <div className="relative flex items-center justify-center">
        <Icon className={cn(
          "w-4 h-4",
          isLocked   ? "text-muted-foreground/30"
            : isRunning  ? "text-amber-400/80"
            : isStale    ? "text-orange-400/75"
            : isComplete ? "text-emerald-400/70"
            : isNext     ? "text-primary/70"
            : "text-muted-foreground/30",
        )} />
        {/* State overlay badge — top-right of icon */}
        <span className="absolute -top-1 -right-1.5">
          {isRunning ? (
            <Loader2 className="w-2.5 h-2.5 text-amber-400/90 animate-spin" />
          ) : isStale ? (
            <RotateCcw className="w-2.5 h-2.5 text-orange-400/85" />
          ) : isComplete ? (
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400/80" />
          ) : isNext ? (
            <span className="block w-2 h-2 rounded-full bg-primary/70 animate-pulse" />
          ) : null}
        </span>
      </div>

      {/* Stage label — only text on the tile */}
      <span className={cn(
        "text-[8px] font-bold uppercase tracking-[0.14em] leading-none",
        isLocked   ? "text-muted-foreground/20"
          : isRunning  ? "text-amber-400/60"
          : isStale    ? "text-orange-400/55"
          : isComplete ? "text-emerald-400/50"
          : isNext     ? "text-primary/55"
          : "text-muted-foreground/30",
      )}>
        {label}
      </span>

      {/* Elapsed time — replaces label when running */}
      {isRunning && elapsedSeconds !== undefined && (
        <span className="text-[8px] font-mono tabular-nums text-amber-400/50 leading-none -mt-1">
          {fmtElapsed(elapsedSeconds)}
        </span>
      )}
    </button>
  );
}

// ── Intelligence block for each stage ────────────────────────────────────

function StageIntelligence({
  stage,
  analysisComplete,
  strategyComplete,
  briefsComplete,
  analysisRunning,
  strategyRunning,
  briefsRunning,
  strategyIsStale,
  briefsIsStale,
  cellCount,
  variableCount,
  pillarCount,
  hypothesisCount,
  icpCount,
  briefCount,
  strategy,
  briefBuilder,
  analysisRun,
  strategyLastRun,
  briefsLastRun,
  loopStatus,
}: {
  stage: Stage;
  analysisComplete: boolean;
  strategyComplete: boolean;
  briefsComplete: boolean;
  analysisRunning: boolean;
  strategyRunning: boolean;
  briefsRunning: boolean;
  strategyIsStale: boolean;
  briefsIsStale: boolean;
  cellCount: number;
  variableCount: number;
  pillarCount: number;
  hypothesisCount: number;
  icpCount: number;
  briefCount: number;
  strategy: StrategyData | null;
  briefBuilder: BriefBuilder | null;
  analysisRun: {
    status: string;
    date_start?: string | null;
    date_end?: string | null;
    rows_ingested?: number | null;
    finished_at?: string | null;
    error_message?: string | null;
  } | null;
  strategyLastRun: { status: string; finished_at?: string | null; error_message?: string | null; model?: string | null } | null;
  briefsLastRun:   { status: string; finished_at?: string | null; error_message?: string | null } | null;
  loopStatus: { stage: string; window_start?: string | null; window_end?: string | null; generated_at?: string | null }[] | null;
}) {
  const analysisLS = loopStatus?.find((l) => l.stage === "analysis") ?? null;
  const strategyLS = loopStatus?.find((l) => l.stage === "strategy") ?? null;

  // Shared: error block
  function ErrorBlock({ message }: { message: string }) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 mt-1">
        <AlertTriangle className="w-3 h-3 text-amber-400/70 mt-0.5 shrink-0" />
        <p className="text-[10px] text-amber-200/65 leading-relaxed">{message}</p>
      </div>
    );
  }

  // ── Analysis intelligence ────────────────────────────────────────────

  if (stage === "analysis") {
    const windowStart = analysisRun?.date_start ?? analysisLS?.window_start ?? null;
    const windowEnd   = analysisRun?.date_end   ?? analysisLS?.window_end   ?? null;
    const lastRun     = analysisRun?.finished_at ?? null;
    const hasError    = analysisRun?.status === "error";

    return (
      <div className="flex flex-col gap-3">
        {/* Causal position */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] text-muted-foreground/30 font-medium">Root stage</span>
          <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/20" />
          <span className="text-[9px] text-muted-foreground/35">Enables Strategy &amp; Briefs</span>
        </div>

        {/* Stats — only when there's data */}
        {(analysisComplete || analysisRunning) && (
          <div className="flex flex-wrap gap-1.5">
            {cellCount > 0 && <StatPill value={cellCount} label="cells" />}
            {variableCount > 0 && <StatPill value={variableCount} label="variables" />}
            {windowStart && windowEnd && (
              <StatPill value={`${fmtDate(windowStart)} – ${fmtDate(windowEnd)}`} />
            )}
            {analysisRun?.rows_ingested != null && (
              <StatPill value={analysisRun.rows_ingested.toLocaleString()} label="rows" />
            )}
          </div>
        )}

        {/* Last run provenance */}
        {lastRun && (
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/30">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span>Last run {fmtFull(lastRun)}</span>
          </div>
        )}

        {hasError && analysisRun?.error_message && (
          <ErrorBlock message={analysisRun.error_message} />
        )}

        {!analysisComplete && !analysisRunning && !hasError && (
          <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
            Upload a CSV export or connect a Meta ad account, then run analysis.
          </p>
        )}
      </div>
    );
  }

  // ── Strategy intelligence ────────────────────────────────────────────

  if (stage === "strategy") {
    const analysisWindow = (() => {
      const s = analysisRun?.date_start ?? analysisLS?.window_start;
      const e = analysisRun?.date_end   ?? analysisLS?.window_end;
      if (s && e) return `${fmtDate(s)} – ${fmtDate(e)}`;
      return null;
    })();
    const genDate  = strategyLastRun?.finished_at ?? strategyLS?.generated_at ?? null;
    const hasError = strategyLastRun?.status === "error";
    const isGenerated = strategy?.provenance === "generated";

    return (
      <div className="flex flex-col gap-3">
        {/* Causal chain: dependency + enables */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <DepBadge
            label={`Analysis${analysisWindow ? `: ${analysisWindow}` : ""}`}
            satisfied={analysisComplete}
          />
          <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/20" />
          <span className="text-[9px] text-muted-foreground/35">Enables Briefs</span>
        </div>

        {/* Stats */}
        {(strategyComplete || strategyRunning) && (
          <div className="flex flex-wrap gap-1.5">
            {pillarCount > 0 && <StatPill value={pillarCount} label="pillars" />}
            {hypothesisCount > 0 && <StatPill value={hypothesisCount} label="hypotheses" />}
            {icpCount > 0 && <StatPill value={icpCount} label="ICPs" />}
            {isGenerated && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-primary/60 bg-primary/[0.08] border border-primary/15 rounded-md px-2 py-1 leading-none">
                <Sparkles className="w-2.5 h-2.5" /> Generated
              </span>
            )}
          </div>
        )}

        {/* Provenance */}
        {genDate && (
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/30">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span>Generated {fmtFull(genDate)}</span>
            {strategyLastRun?.model && (
              <span className="text-muted-foreground/20">· {strategyLastRun.model}</span>
            )}
          </div>
        )}

        {strategyIsStale && !strategyRunning && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-400/20 bg-orange-400/[0.05] px-2.5 py-2">
            <RotateCcw className="w-3 h-3 text-orange-400/70 mt-0.5 shrink-0" />
            <p className="text-[10px] text-orange-200/65 leading-relaxed">
              Analysis data has been refreshed. Results here reflect the previous run.
            </p>
          </div>
        )}

        {!analysisComplete && (
          <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
            Run analysis first — strategy is built from the cell and variable results.
          </p>
        )}

        {hasError && strategyLastRun?.error_message && (
          <ErrorBlock message={strategyLastRun.error_message} />
        )}
      </div>
    );
  }

  // ── Briefs intelligence ──────────────────────────────────────────────

  const stratGenDate = strategyLastRun?.finished_at ?? strategyLS?.generated_at ?? null;
  const genDate  = briefsLastRun?.finished_at ?? null;
  const hasError = briefsLastRun?.status === "error";
  const isGenerated = briefBuilder?.provenance === "generated";

  // Asset type breakdown
  const assetTypes = briefBuilder?.draft_briefs
    ? [...new Set(briefBuilder.draft_briefs.map((b) => b.asset_type).filter(Boolean))]
    : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Causal dependency */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <DepBadge
          label={`Strategy${stratGenDate ? `: ${fmtDate(stratGenDate)}` : ""}`}
          satisfied={strategyComplete}
        />
      </div>

      {/* Stats */}
      {(briefsComplete || briefsRunning) && (
        <div className="flex flex-wrap gap-1.5">
          {briefCount > 0 && <StatPill value={briefCount} label={briefCount === 1 ? "brief" : "briefs"} />}
          {assetTypes.slice(0, 3).map((t) => (
            <StatPill key={t} value={t} />
          ))}
          {isGenerated && (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-primary/60 bg-primary/[0.08] border border-primary/15 rounded-md px-2 py-1 leading-none">
              <Sparkles className="w-2.5 h-2.5" /> Generated
            </span>
          )}
        </div>
      )}

      {/* Provenance */}
      {genDate && (
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/30">
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span>Generated {fmtFull(genDate)}</span>
        </div>
      )}

      {briefsIsStale && !briefsRunning && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-400/20 bg-orange-400/[0.05] px-2.5 py-2">
          <RotateCcw className="w-3 h-3 text-orange-400/70 mt-0.5 shrink-0" />
          <p className="text-[10px] text-orange-200/65 leading-relaxed">
            Analysis data has been refreshed. Results here reflect the previous run.
          </p>
        </div>
      )}

      {!strategyComplete && (
        <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
          Generate strategy first — briefs are derived from the message pillars.
        </p>
      )}

      {hasError && briefsLastRun?.error_message && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 mt-1">
          <AlertTriangle className="w-3 h-3 text-amber-400/70 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-200/65 leading-relaxed">{briefsLastRun.error_message}</p>
        </div>
      )}
    </div>
  );
}

// ── Command hub popup ─────────────────────────────────────────────────────

function CommandHub({
  stage,
  onClose,
  currentPath,
  analysisComplete,
  strategyComplete,
  briefsComplete,
  analysisRunning,
  strategyRunning,
  briefsRunning,
  strategyElapsedSeconds,
  briefsElapsedSeconds,
  strategyIsStale,
  briefsIsStale,
  cellCount,
  variableCount,
  pillarCount,
  hypothesisCount,
  icpCount,
  briefCount,
  strategy,
  briefBuilder,
  analysisRun,
  strategyLastRun,
  briefsLastRun,
  loopStatus,
  onNavigate,
  onGenerateStrategy,
  onGenerateBriefs,
}: {
  stage: Stage;
  onClose: () => void;
  currentPath: string;
  analysisComplete: boolean;
  strategyComplete: boolean;
  briefsComplete: boolean;
  analysisRunning: boolean;
  strategyRunning: boolean;
  briefsRunning: boolean;
  strategyElapsedSeconds: number;
  briefsElapsedSeconds: number;
  strategyIsStale: boolean;
  briefsIsStale: boolean;
  cellCount: number;
  variableCount: number;
  pillarCount: number;
  hypothesisCount: number;
  icpCount: number;
  briefCount: number;
  strategy: StrategyData | null;
  briefBuilder: BriefBuilder | null;
  analysisRun: {
    status: string;
    date_start?: string | null;
    date_end?: string | null;
    rows_ingested?: number | null;
    finished_at?: string | null;
    error_message?: string | null;
  } | null;
  strategyLastRun: { status: string; finished_at?: string | null; error_message?: string | null; model?: string | null } | null;
  briefsLastRun:   { status: string; finished_at?: string | null; error_message?: string | null } | null;
  loopStatus: { stage: string; window_start?: string | null; window_end?: string | null; generated_at?: string | null }[] | null;
  onNavigate: (path: string) => void;
  onGenerateStrategy: () => void;
  onGenerateBriefs: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { icon: Icon, label: stageLabel } = STAGE_CONFIG[stage];

  const isRunning = (stage === "analysis" && analysisRunning)
    || (stage === "strategy" && strategyRunning)
    || (stage === "briefs"   && briefsRunning);

  const elapsedSeconds = stage === "strategy" ? strategyElapsedSeconds
    : stage === "briefs" ? briefsElapsedSeconds
    : 0;

  const isComplete = stage === "analysis" ? analysisComplete
    : stage === "strategy" ? strategyComplete
    : briefsComplete;

  const isStale = (stage === "strategy" && strategyIsStale)
    || (stage === "briefs" && briefsIsStale);

  const statusLabel = isRunning ? "Running"
    : isStale ? "Data refreshed"
    : isComplete ? "Complete"
    : stage === "analysis" ? "Not run"
    : stage === "strategy" ? (analysisComplete ? "Ready to generate" : "Needs analysis")
    : (strategyComplete ? "Ready to generate" : "Needs strategy");

  const statusClass = isRunning   ? "text-amber-400/80 bg-amber-400/10 border-amber-400/20"
    : isStale       ? "text-orange-400/80 bg-orange-400/[0.08] border-orange-400/20"
    : isComplete     ? "text-emerald-400/70 bg-emerald-400/[0.08] border-emerald-400/15"
    : (analysisComplete && stage === "strategy") || (strategyComplete && stage === "briefs")
    ? "text-primary/70 bg-primary/[0.08] border-primary/15"
    : "text-muted-foreground/35 bg-white/[0.03] border-border/15";

  const routes = STAGE_ROUTES[stage];

  function goTo(path: string) {
    onNavigate(path);
    onClose();
  }

  // Actions section content
  function Actions() {
    if (isRunning) return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3 h-3 text-amber-400/70 animate-spin shrink-0" />
          <span className="text-[10px] text-amber-400/55">Processing — views will update when complete</span>
        </div>
        {/* Elapsed time + indeterminate progress bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 h-[3px] rounded-full overflow-hidden bg-amber-400/10">
            <span className="absolute inset-y-0 w-1/3 bg-amber-400/45 rounded-full animate-[progress-slide_1.4s_ease-in-out_infinite]" />
          </div>
          {elapsedSeconds > 0 && (
            <span className="text-[9px] font-mono tabular-nums text-amber-400/45 leading-none shrink-0">
              {fmtElapsed(elapsedSeconds)}
            </span>
          )}
        </div>
      </div>
    );

    if (stage === "analysis") return (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => goTo("/app/settings/account")}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
        >
          <Upload className="w-2.5 h-2.5" />
          Upload CSV
        </button>
        <button
          onClick={() => goTo("/app/settings/account")}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
        >
          <Link2 className="w-2.5 h-2.5" />
          Connect Meta
        </button>
        <button
          onClick={() => goTo("/app/settings/account")}
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg",
            analysisComplete ? "mx-secondary-btn" : "mx-primary-btn",
          )}
        >
          {analysisComplete
            ? <><RefreshCw className="w-2.5 h-2.5" /> Re-run</>
            : <><PlayCircle className="w-2.5 h-2.5" /> Run Analysis</>
          }
        </button>
      </div>
    );

    if (stage === "strategy") return (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { onGenerateStrategy(); onClose(); }}
          disabled={!analysisComplete}
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg",
            !analysisComplete
              ? "opacity-30 cursor-not-allowed mx-secondary-btn"
              : strategyComplete
              ? "mx-secondary-btn"
              : "mx-primary-btn",
          )}
        >
          {strategyComplete
            ? <><RefreshCw className="w-2.5 h-2.5" /> Regenerate</>
            : <><Sparkles className="w-2.5 h-2.5" /> Generate Strategy</>
          }
        </button>
      </div>
    );

    // briefs
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { onGenerateBriefs(); onClose(); }}
          disabled={!strategyComplete}
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg",
            !strategyComplete
              ? "opacity-30 cursor-not-allowed mx-secondary-btn"
              : briefsComplete
              ? "mx-secondary-btn"
              : "mx-primary-btn",
          )}
        >
          {briefsComplete
            ? <><RefreshCw className="w-2.5 h-2.5" /> Regenerate</>
            : <><Sparkles className="w-2.5 h-2.5" /> Generate Briefs</>
          }
        </button>
        {briefsComplete && (
          <button
            onClick={() => goTo("/app/briefs/history")}
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
          >
            View Archive
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        ref={popupRef}
        className="w-[380px] max-w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-black/70"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border) / 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Layer 1: Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          {/* Icon badge */}
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
            isRunning   ? "bg-amber-400/10 border-amber-400/20"
              : isComplete ? "bg-emerald-400/[0.08] border-emerald-400/15"
              : "bg-white/[0.04] border-border/20",
          )}>
            <Icon className={cn(
              "w-4 h-4",
              isRunning   ? "text-amber-400/80"
                : isComplete ? "text-emerald-400/70"
                : "text-muted-foreground/35",
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-foreground/85 leading-none">{stageLabel}</p>
            <span className={cn(
              "inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider border rounded-md px-1.5 py-0.5 mt-1.5 leading-none",
              statusClass,
            )}>
              {isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
              {statusLabel}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/25 hover:text-foreground/60 hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Layer 2: Intelligence ────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-border/12">
          <StageIntelligence
            stage={stage}
            analysisComplete={analysisComplete}
            strategyComplete={strategyComplete}
            briefsComplete={briefsComplete}
            analysisRunning={analysisRunning}
            strategyRunning={strategyRunning}
            briefsRunning={briefsRunning}
            strategyIsStale={strategyIsStale}
            briefsIsStale={briefsIsStale}
            cellCount={cellCount}
            variableCount={variableCount}
            pillarCount={pillarCount}
            hypothesisCount={hypothesisCount}
            icpCount={icpCount}
            briefCount={briefCount}
            strategy={strategy}
            briefBuilder={briefBuilder}
            analysisRun={analysisRun}
            strategyLastRun={strategyLastRun}
            briefsLastRun={briefsLastRun}
            loopStatus={loopStatus}
          />
        </div>

        {/* ── Layer 3: Navigate ────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-border/12">
          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-muted-foreground/22 mb-2">
            Navigate
          </p>
          <div className="grid grid-cols-2 gap-1">
            {routes.map((r) => {
              const isCurrent    = currentPath === r.path;
              const isAccessible = isComplete || isRunning;
              return (
                <button
                  key={r.path}
                  onClick={() => isAccessible && goTo(r.path)}
                  disabled={!isAccessible}
                  className={cn(
                    "group flex flex-col gap-0.5 text-left px-3 py-2 rounded-lg transition-all",
                    !isAccessible
                      ? "opacity-25 cursor-not-allowed"
                      : isCurrent
                      ? "bg-primary/12 border border-primary/22"
                      : "hover:bg-white/[0.06] border border-transparent hover:border-border/20",
                  )}
                >
                  <span className={cn(
                    "text-[11px] font-semibold leading-none",
                    !isAccessible ? "text-muted-foreground/40"
                      : isCurrent ? "text-primary/80"
                      : "text-foreground/65 group-hover:text-foreground/85",
                  )}>
                    {r.label}
                  </span>
                  <span className={cn(
                    "text-[9px] leading-none",
                    isCurrent ? "text-primary/45" : "text-muted-foreground/30",
                  )}>
                    {r.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Layer 4: Actions ─────────────────────────────────────────── */}
        <div className="px-4 pt-2 pb-4 border-t border-border/12">
          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-muted-foreground/22 mb-2">
            {isRunning ? "Status" : "Actions"}
          </p>
          <Actions />
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export function LoopCommandChain({
  accountId,
  account,
}: {
  accountId: string;
  account: AdAccount;
}) {
  const [location, navigate] = useLocation();
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  const strategyGen = useGenerationRun(accountId, "strategy");
  const briefsGen   = useGenerationRun(accountId, "briefs");
  const { data: latestAnalysisData } = useGetLatestAnalysisRun(accountId);

  const analysisRun     = latestAnalysisData?.run ?? null;
  const strategyLastRun = strategyGen.lastRun ?? null;
  const briefsLastRun   = briefsGen.lastRun ?? null;

  const iap = account.iap ?? null;

  // Counts
  const cellCount       = iap?.analysis?.performance_by_cell?.length ?? 0;
  const variableCount   = iap?.analysis?.v3_variable_performance?.length ?? 0;
  const pillarCount     = iap?.strategy?.message_pillars?.length ?? 0;
  const hypothesisCount = iap?.strategy?.active_hypotheses?.length ?? 0;
  const icpCount        = iap?.strategy?.icp_profiles?.length ?? 0;
  const briefCount      = iap?.brief_builder?.draft_briefs?.length ?? 0;

  const analysisComplete = cellCount + variableCount > 0;
  const strategyComplete = pillarCount > 0;
  const briefsComplete   = briefCount > 0;

  const analysisRunning = analysisRun?.status === "running";
  const strategyRunning = strategyGen.isRunning;
  const briefsRunning   = briefsGen.isRunning;

  const strategy     = iap?.strategy ?? null;
  const briefBuilder = iap?.brief_builder ?? null;
  const loopStatus   = iap?.loop_status ?? null;

  // ── Staleness: generated before the latest successful analysis run ────────
  // Loop status stage keys: "strategy_map" for strategy, "brief_builder" for briefs
  const analysisFinishedAt = (analysisRun?.status === "success" ? analysisRun?.finished_at : null) ?? null;
  const strategyGeneratedAt = (strategyLastRun?.status === "success" ? strategyLastRun?.finished_at : null)
    ?? loopStatus?.find((l) => l.stage === "strategy_map")?.generated_at
    ?? null;
  const briefsGeneratedAt = (briefsLastRun?.status === "success" ? briefsLastRun?.finished_at : null)
    ?? loopStatus?.find((l) => l.stage === "brief_builder")?.generated_at
    ?? null;

  const strategyIsStale =
    strategyComplete &&
    analysisComplete &&
    !!analysisFinishedAt &&
    !!strategyGeneratedAt &&
    !strategyRunning &&
    new Date(analysisFinishedAt) > new Date(strategyGeneratedAt);

  const briefsIsStale =
    briefsComplete &&
    analysisComplete &&
    !!briefsGeneratedAt &&
    !briefsRunning &&
    (
      (!!analysisFinishedAt && new Date(analysisFinishedAt) > new Date(briefsGeneratedAt)) ||
      (!!strategyGeneratedAt && new Date(strategyGeneratedAt) > new Date(briefsGeneratedAt))
    );

  const completeCount = [analysisComplete, strategyComplete, briefsComplete].filter(Boolean).length;
  const anyRunning    = analysisRunning || strategyRunning || briefsRunning;

  const toggle = (s: Stage) => setActiveStage((prev) => (prev === s ? null : s));

  return (
    <>
      <div className="mx-card p-2.5 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="mx-section-label leading-none">IAP Loop</span>
          <span className={cn(
            "text-[9px] font-mono tabular-nums tracking-widest",
            anyRunning          ? "text-amber-400/55"
              : completeCount === 3 ? "text-emerald-400/45"
              : completeCount > 0   ? "text-primary/40"
              : "text-muted-foreground/22",
          )}>
            {anyRunning ? "●" : completeCount === 3 ? "✓" : `${completeCount}/3`}
          </span>
        </div>

        {/* Three tiles + causal connectors */}
        <div className="flex items-center gap-1">
          <StageTile
            stage="analysis"
            isComplete={analysisComplete}
            isRunning={analysisRunning}
            isStale={false}
            isNext={!analysisComplete && !analysisRunning}
            isLocked={false}
            isActive={activeStage === "analysis"}
            onClick={() => toggle("analysis")}
          />

          <ArrowRight className={cn(
            "w-3 h-3 shrink-0 transition-colors",
            analysisComplete ? "text-emerald-400/25" : "text-muted-foreground/10",
          )} />

          <StageTile
            stage="strategy"
            isComplete={strategyComplete}
            isRunning={strategyRunning}
            isStale={strategyIsStale}
            isNext={analysisComplete && !strategyComplete && !strategyRunning}
            isLocked={!analysisComplete && !strategyComplete && !strategyRunning}
            isActive={activeStage === "strategy"}
            elapsedSeconds={strategyGen.elapsedSeconds}
            onClick={() => toggle("strategy")}
          />

          <ArrowRight className={cn(
            "w-3 h-3 shrink-0 transition-colors",
            strategyComplete ? "text-emerald-400/25" : "text-muted-foreground/10",
          )} />

          <StageTile
            stage="briefs"
            isComplete={briefsComplete}
            isRunning={briefsRunning}
            isStale={briefsIsStale}
            isNext={strategyComplete && !briefsComplete && !briefsRunning}
            isLocked={!strategyComplete && !briefsComplete && !briefsRunning}
            isActive={activeStage === "briefs"}
            elapsedSeconds={briefsGen.elapsedSeconds}
            onClick={() => toggle("briefs")}
          />
        </div>
      </div>

      {activeStage && (
        <CommandHub
          stage={activeStage}
          onClose={() => setActiveStage(null)}
          currentPath={location}
          analysisComplete={analysisComplete}
          strategyComplete={strategyComplete}
          briefsComplete={briefsComplete}
          analysisRunning={analysisRunning}
          strategyRunning={strategyRunning}
          briefsRunning={briefsRunning}
          strategyElapsedSeconds={strategyGen.elapsedSeconds}
          briefsElapsedSeconds={briefsGen.elapsedSeconds}
          strategyIsStale={strategyIsStale}
          briefsIsStale={briefsIsStale}
          cellCount={cellCount}
          variableCount={variableCount}
          pillarCount={pillarCount}
          hypothesisCount={hypothesisCount}
          icpCount={icpCount}
          briefCount={briefCount}
          strategy={strategy}
          briefBuilder={briefBuilder}
          analysisRun={analysisRun}
          strategyLastRun={strategyLastRun}
          briefsLastRun={briefsLastRun}
          loopStatus={loopStatus}
          onNavigate={navigate}
          onGenerateStrategy={() => strategyGen.start()}
          onGenerateBriefs={() => briefsGen.start()}
        />
      )}
    </>
  );
}
