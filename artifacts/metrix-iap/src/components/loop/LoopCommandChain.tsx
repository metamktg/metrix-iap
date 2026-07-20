// @refresh reset
// ─── IAP Loop · Command Chain ─────────────────────────────────────────
//
// SIX stage tiles — pure state at a glance, no data on face.
// Stages: Data → Analysis → Strategy → Briefs → Report → Re-run
//
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
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  useGetLatestAnalysisRun, getGetLatestAnalysisRunQueryKey,
  useListAnalysisRuns,
  useListWorkspaceReports, useListManualImports,
  useStartManualAnalysisRun, getGetMetrixSeedQueryKey,
} from "@workspace/api-client-react";
import type { AnalysisRun } from "@workspace/api-client-react";
import { useGenerationRun } from "@/components/generation/GenerationControls";
import { useToast } from "@/hooks/use-toast";
import type { AdAccount, StrategyData, BriefBuilder } from "@/lib/data/seedTypes";
import { computeStaleStages } from "./staleStageDetection";
import {
  BarChart3, Layers, FileText, Database, FileBarChart,
  CheckCircle2, Lock, Loader2, X,
  Upload, Link2, PlayCircle, RefreshCw,
  AlertTriangle, Sparkles, ArrowRight, Clock, RotateCcw, CalendarRange, Timer,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

type Stage = "data" | "analysis" | "strategy" | "briefs" | "report" | "rerun";

// ── Route map ─────────────────────────────────────────────────────────────

const STAGE_ROUTES: Record<Stage, { label: string; path: string; desc: string }[]> = {
  data: [
    { label: "Account Setup",  path: "/app/settings/account",      desc: "Uploads · source" },
    { label: "Integrations",   path: "/app/settings/integrations",  desc: "Meta OAuth" },
  ],
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
  report: [
    { label: "New Report",    path: "/app/reports/new",     desc: "Generate a report" },
    { label: "Report History", path: "/app/reports/history", desc: "Past generations" },
  ],
  rerun: [
    { label: "Account Setup",  path: "/app/settings/account",     desc: "Uploads · source" },
    { label: "Run Analysis",   path: "/app/settings/account",     desc: "Start next cycle" },
  ],
};

// ── Stage config ──────────────────────────────────────────────────────────

const STAGE_CONFIG = {
  data:     { icon: Database,     label: "Data"     },
  analysis: { icon: BarChart3,    label: "Analysis" },
  strategy: { icon: Layers,       label: "Strategy" },
  briefs:   { icon: FileText,     label: "Briefs"   },
  report:   { icon: FileBarChart, label: "Report"   },
  rerun:    { icon: RotateCcw,    label: "Re-run"   },
} as const;

const TOTAL_STAGES = 5;

const DATE_RANGES = [
  { id: "7d"  as const, label: "Last 7 days"  },
  { id: "14d" as const, label: "Last 14 days" },
  { id: "30d" as const, label: "Last 30 days" },
  { id: "all" as const, label: "All data"     },
];

type AnalysisDateRange = "7d" | "14d" | "30d" | "all";

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

// ── Progress estimation ────────────────────────────────────────────────────
// Converts elapsed seconds to a 0–95% estimate using quadratic ease-out.
// Holds at 95% until the run settles (never displays 100 prematurely).

const EXPECTED_SECONDS = { analysis: 45, strategy: 75, briefs: 90 } as const;

function calcProgress(elapsed: number, expected: number): number {
  const t = Math.min(elapsed / expected, 1);
  const ease = 1 - Math.pow(1 - t, 2); // quadratic ease-out
  return Math.min(95, Math.round(ease * 95));
}

const PHASE_LABELS: Record<"analysis" | "strategy" | "briefs", [number, string][]> = {
  analysis: [
    [0,  "Parsing performance data…"],
    [22, "Computing cell metrics…"],
    [50, "Building variable signals…"],
    [78, "Finalizing output…"],
  ],
  strategy: [
    [0,  "Loading analysis evidence…"],
    [18, "Building message pillars…"],
    [42, "Generating hypotheses…"],
    [68, "Creating ICP profiles…"],
    [88, "Finalizing strategy…"],
  ],
  briefs: [
    [0,  "Loading strategy context…"],
    [18, "Designing MST matrix…"],
    [48, "Writing creative briefs…"],
    [78, "Reviewing & refining…"],
  ],
};

function getPhaseLabel(kind: "analysis" | "strategy" | "briefs", pct: number): string {
  const phases = PHASE_LABELS[kind];
  let label = phases[0][1];
  for (const [threshold, text] of phases) {
    if (pct >= threshold) label = text;
  }
  return label;
}

// ── Stat pill ─────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: string | number; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-label tabular-nums bg-white/[0.04] border border-border/20 rounded-md px-2 py-1 leading-none">
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
        ? <CheckCircle2 className="w-3.5 h-3.5" />
        : <Lock className="w-3.5 h-3.5" />
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
        "border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
          className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"
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
            <Loader2 className="w-3.5 h-3.5 text-amber-400/90 animate-spin" />
          ) : isStale ? (
            <RotateCcw className="w-3.5 h-3.5 text-orange-400/85" />
          ) : isComplete ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80" />
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
  dataComplete,
  analysisComplete,
  strategyComplete,
  briefsComplete,
  reportComplete,
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
  reportCount,
  strategy,
  briefBuilder,
  analysisRun,
  strategyLastRun,
  briefsLastRun,
  loopStatus,
  accountPlatform,
}: {
  stage: Stage;
  dataComplete: boolean;
  analysisComplete: boolean;
  strategyComplete: boolean;
  briefsComplete: boolean;
  reportComplete: boolean;
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
  reportCount: number;
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
  accountPlatform?: string;
}) {
  const analysisLS = loopStatus?.find((l) => l.stage === "analysis") ?? null;
  const strategyLS = loopStatus?.find((l) => l.stage === "strategy") ?? null;

  // Shared: error block
  function ErrorBlock({ message }: { message: string }) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 mt-1">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/70 mt-0.5 shrink-0" />
        <p className="text-label text-amber-200/65 leading-relaxed">{message}</p>
      </div>
    );
  }

  // ── Data intelligence ────────────────────────────────────────────────

  if (stage === "data") {
    const isLiveMeta = ["meta", "facebook", "meta ads"].includes((accountPlatform ?? "").toLowerCase());
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] text-muted-foreground/30 font-medium">Entry point</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20" />
          <span className="text-[9px] text-muted-foreground/35">Enables Analysis</span>
        </div>
        {dataComplete && (
          <div className="flex flex-wrap gap-1.5">
            <StatPill value={isLiveMeta ? "Live Meta" : "Manual"} label="source" />
            {cellCount > 0 && <StatPill value={cellCount} label="cells" />}
          </div>
        )}
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
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20" />
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
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Last run {fmtFull(lastRun)}</span>
          </div>
        )}

        {hasError && analysisRun?.error_message && (
          <ErrorBlock message={analysisRun.error_message} />
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
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20" />
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
                <Sparkles className="w-3.5 h-3.5" /> Generated
              </span>
            )}
          </div>
        )}

        {/* Provenance */}
        {genDate && (
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/30">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Generated {fmtFull(genDate)}</span>
            {strategyLastRun?.model && (
              <span className="text-muted-foreground/20">· {strategyLastRun.model}</span>
            )}
          </div>
        )}

        {strategyIsStale && !strategyRunning && (
          <div className="flex items-center gap-1.5 rounded-lg border border-orange-400/20 bg-orange-400/[0.05] px-2.5 py-1.5">
            <RotateCcw className="w-3 h-3 text-orange-400/70 shrink-0" />
            <span className="text-label text-orange-200/60">Data refreshed · prev. results shown</span>
          </div>
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
              <Sparkles className="w-3.5 h-3.5" /> Generated
            </span>
          )}
        </div>
      )}

      {/* Provenance */}
      {genDate && (
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/30">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Generated {fmtFull(genDate)}</span>
        </div>
      )}

      {briefsIsStale && !briefsRunning && (
        <div className="flex items-center gap-1.5 rounded-lg border border-orange-400/20 bg-orange-400/[0.05] px-2.5 py-1.5">
          <RotateCcw className="w-3 h-3 text-orange-400/70 shrink-0" />
          <span className="text-label text-orange-200/60">Data refreshed · prev. results shown</span>
        </div>
      )}

      {hasError && briefsLastRun?.error_message && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 mt-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400/70 mt-0.5 shrink-0" />
          <p className="text-label text-amber-200/65 leading-relaxed">{briefsLastRun.error_message}</p>
        </div>
      )}
    </div>
  );
}

// ── Report intelligence ──────────────────────────────────────────────────
// (Rendered as the last case inside StageIntelligence via stage === "report")

function ReportIntelligence({
  briefsComplete,
  reportComplete,
  reportCount,
}: {
  briefsComplete: boolean;
  reportComplete: boolean;
  reportCount: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <DepBadge label="Briefs" satisfied={briefsComplete} />
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20" />
        <span className="text-[9px] text-muted-foreground/35">Deliverable</span>
      </div>
      {reportComplete && (
        <div className="flex flex-wrap gap-1.5">
          <StatPill value={reportCount} label={reportCount === 1 ? "report" : "reports"} />
        </div>
      )}
    </div>
  );
}

// ── Re-run intelligence ───────────────────────────────────────────────────

function RerunIntelligence({ allLoopComplete }: { allLoopComplete: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <DepBadge label="Full loop complete" satisfied={allLoopComplete} />
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/20" />
        <span className="text-[9px] text-muted-foreground/35">Next cycle</span>
      </div>
      {allLoopComplete && (
        <div className="flex flex-wrap gap-1.5">
          <StatPill value="Loop complete" />
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
  dataComplete,
  analysisComplete,
  strategyComplete,
  briefsComplete,
  reportComplete,
  analysisRunning,
  strategyRunning,
  briefsRunning,
  analysisElapsedSeconds,
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
  reportCount,
  strategy,
  briefBuilder,
  analysisRun,
  analysisRuns,
  strategyLastRun,
  briefsLastRun,
  loopStatus,
  accountPlatform,
  allLoopComplete,
  stagedImportCount,
  isLiveMeta,
  analysisStarting,
  analysisStartError,
  onNavigate,
  onStartAnalysis,
  onGenerateStrategy,
  onGenerateBriefs,
}: {
  stage: Stage;
  onClose: () => void;
  currentPath: string;
  dataComplete: boolean;
  analysisComplete: boolean;
  strategyComplete: boolean;
  briefsComplete: boolean;
  reportComplete: boolean;
  analysisRunning: boolean;
  strategyRunning: boolean;
  briefsRunning: boolean;
  analysisElapsedSeconds: number;
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
  reportCount: number;
  strategy: StrategyData | null;
  briefBuilder: BriefBuilder | null;
  analysisRun: {
    id?: string;
    status: string;
    date_start?: string | null;
    date_end?: string | null;
    rows_ingested?: number | null;
    finished_at?: string | null;
    error_message?: string | null;
  } | null;
  analysisRuns: AnalysisRun[];
  strategyLastRun: { status: string; finished_at?: string | null; error_message?: string | null; model?: string | null } | null;
  briefsLastRun:   { status: string; finished_at?: string | null; error_message?: string | null } | null;
  loopStatus: { stage: string; window_start?: string | null; window_end?: string | null; generated_at?: string | null }[] | null;
  accountPlatform?: string;
  allLoopComplete: boolean;
  stagedImportCount: number;
  isLiveMeta: boolean;
  analysisStarting: boolean;
  analysisStartError: string | null;
  onNavigate: (path: string) => void;
  onStartAnalysis: (range: AnalysisDateRange) => Promise<void>;
  onGenerateStrategy: (analysisRunId?: string) => void;
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

  const elapsedSeconds = stage === "analysis" ? analysisElapsedSeconds
    : stage === "strategy" ? strategyElapsedSeconds
    : stage === "briefs" ? briefsElapsedSeconds
    : 0;

  const isComplete = stage === "data"     ? dataComplete
    : stage === "analysis" ? analysisComplete
    : stage === "strategy" ? strategyComplete
    : stage === "briefs"   ? briefsComplete
    : stage === "report"   ? reportComplete
    : false; // "rerun" is never complete — the loop is cyclic

  const isStale = (stage === "strategy" && strategyIsStale)
    || (stage === "briefs" && briefsIsStale);

  const statusLabel = isRunning ? "Running"
    : isStale ? "Data refreshed"
    : isComplete ? "Complete"
    : stage === "data"     ? "No data yet"
    : stage === "analysis" ? "Not run"
    : stage === "report"   ? (briefsComplete ? "Ready to generate" : "Needs briefs")
    : stage === "rerun"    ? (allLoopComplete ? "Ready to re-run" : "Complete loop first")
    : stage === "strategy" ? (analysisComplete ? "Ready to generate" : "Needs analysis")
    : (strategyComplete ? "Ready to generate" : "Needs strategy");

  const statusClass = isRunning   ? "text-amber-400/80 bg-amber-400/10 border-amber-400/20"
    : isStale       ? "text-orange-400/80 bg-orange-400/[0.08] border-orange-400/20"
    : isComplete     ? "text-emerald-400/70 bg-emerald-400/[0.08] border-emerald-400/15"
    : (analysisComplete && stage === "strategy")
      || (strategyComplete && stage === "briefs")
      || (briefsComplete && stage === "report")
      || (allLoopComplete && stage === "rerun")
    ? "text-primary/70 bg-primary/[0.08] border-primary/15"
    : "text-muted-foreground/35 bg-white/[0.03] border-border/15";

  const routes = STAGE_ROUTES[stage];

  function goTo(path: string) {
    onNavigate(path);
    onClose();
  }

  // Pre-execution confirmation step for analysis / strategy / briefs
  const [pendingConfirm, setPendingConfirm] = useState<"analysis" | "strategy" | "briefs" | null>(null);
  const [localDateRange, setLocalDateRange] = useState<AnalysisDateRange>("30d");
  // Which analysis run the user wants to ground strategy in.
  // Defaults to latest successful run when the confirmation panel opens.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  useEffect(() => {
    if (pendingConfirm === "strategy") {
      const best = analysisRuns.find((r) => r.status === "success") ?? analysisRuns[0];
      setSelectedRunId(best?.id ?? analysisRun?.id ?? null);
    }
  }, [pendingConfirm, analysisRuns, analysisRun?.id]);

  // Actions section content
  function Actions() {
    if (isRunning) {
      const activeKind = stage === "analysis" ? "analysis"
        : stage === "strategy" ? "strategy"
        : stage === "briefs"   ? "briefs"
        : null;
      const progressPct = activeKind
        ? calcProgress(elapsedSeconds, EXPECTED_SECONDS[activeKind])
        : 0;
      const phaseLabel = activeKind ? getPhaseLabel(activeKind, progressPct) : "Processing…";
      const progressView = (
        <div className="flex flex-col gap-2.5">
          {/* Phase label + percentage + elapsed */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 className="w-3.5 h-3.5 text-amber-400/70 animate-spin shrink-0" />
              <span className="text-label text-amber-400/65 font-medium truncate">{phaseLabel}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-bold tabular-nums text-amber-400/65">{progressPct}%</span>
              {elapsedSeconds > 0 && (
                <span className="text-[9px] font-mono tabular-nums text-amber-400/35 leading-none">
                  {fmtElapsed(elapsedSeconds)}
                </span>
              )}
            </div>
          </div>
          {/* Deterministic progress bar */}
          <div className="relative h-[4px] rounded-full overflow-hidden bg-amber-400/10">
            <span
              className="absolute inset-y-0 left-0 bg-amber-400/50 rounded-full transition-[width] duration-1000 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[9px] text-amber-400/40 leading-none">Views update automatically on completion</p>
        </div>
      );
      // Strategy and Briefs: keep the generate button visible but disabled while
      // the run is in flight so the user can see what action is locked, and so
      // tests can assert the disabled state with a standard toBeDisabled() query.
      if (stage === "strategy") {
        return (
          <div className="flex flex-col gap-2">
            {progressView}
            <button
              disabled
              className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-primary-btn opacity-40 cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" /> Build Strategy
            </button>
          </div>
        );
      }
      if (stage === "briefs") {
        return (
          <div className="flex flex-col gap-2">
            {progressView}
            <button
              disabled
              className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-primary-btn opacity-40 cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" /> Draft Briefs
            </button>
          </div>
        );
      }
      return progressView;
    }

    if (stage === "data") {
      if (isLiveMeta) return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-2.5 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
            <span className="text-label text-emerald-200/70 font-medium">Live Meta — connected</span>
          </div>
          <button
            onClick={() => goTo("/app/settings/integrations")}
            className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
          >
            <Link2 className="w-3.5 h-3.5" />
            Manage connection
          </button>
        </div>
      );
      return (
        <div className="flex flex-col gap-1.5">
          {stagedImportCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-2.5 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
              <span className="text-label text-emerald-200/70 font-medium">
                {stagedImportCount} file{stagedImportCount === 1 ? "" : "s"} staged · awaiting analysis run
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => goTo("/app/settings/account")}
              className={cn(
                "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg",
                stagedImportCount > 0 ? "mx-secondary-btn" : "mx-primary-btn",
              )}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload CSV
            </button>
          </div>
        </div>
      );
    }

    if (stage === "analysis") {
      if (pendingConfirm === "analysis") return (
        <div className="flex flex-col gap-2.5">
          {/* Data source context */}
          <div className="rounded-lg border border-primary/15 bg-primary/[0.05] px-2.5 py-2 space-y-1">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/35">Data source</p>
            <p className="text-label text-foreground/70 leading-relaxed">
              {isLiveMeta
                ? "Live Meta ad account connection"
                : `Manual CSV imports · ${stagedImportCount} file${stagedImportCount === 1 ? "" : "s"} staged`}
            </p>
          </div>

          {/* Date range picker (manual accounts only) */}
          {!isLiveMeta && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/35 flex items-center gap-1">
                <CalendarRange className="w-3 h-3" /> Date range
              </p>
              <div className="grid grid-cols-2 gap-1">
                {DATE_RANGES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setLocalDateRange(r.id)}
                    className={cn(
                      "h-7 px-2 rounded-md border text-label font-medium transition-colors",
                      localDateRange === r.id
                        ? "border-primary/40 bg-primary/[0.08] text-primary"
                        : "border-border/40 bg-white/[0.02] text-muted-foreground/70 hover:bg-white/[0.04]"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Estimated wait time */}
          <div className="flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-muted-foreground/35 shrink-0" />
            <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
              Typical run time: 15–60 seconds
            </p>
          </div>

          {/* Error message */}
          {analysisStartError && (
            <p className="text-label text-red-400 leading-relaxed">{analysisStartError}</p>
          )}

          {/* Confirm / Cancel */}
          <div className="flex gap-1.5">
            <button
              onClick={async () => {
                if (isLiveMeta) {
                  setPendingConfirm(null);
                  goTo("/app/settings/integrations");
                } else {
                  await onStartAnalysis(localDateRange);
                  setPendingConfirm(null);
                  onClose();
                }
              }}
              disabled={analysisStarting}
              className={cn(
                "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-primary-btn",
                analysisStarting && "opacity-60 cursor-not-allowed"
              )}
            >
              {analysisStarting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting…</>
              ) : (
                <><PlayCircle className="w-3.5 h-3.5" /> {isLiveMeta ? "Connect account" : "Run Analysis"}</>
              )}
            </button>
            <button
              onClick={() => setPendingConfirm(null)}
              className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      );

      return (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPendingConfirm("analysis")}
            className={cn(
              "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg",
              analysisComplete ? "mx-secondary-btn" : "mx-primary-btn",
            )}
          >
            <PlayCircle className="w-3.5 h-3.5" /> {analysisComplete ? "Re-run Analysis" : "Run Analysis"}
          </button>
        </div>
      );
    }

    if (stage === "strategy") {
      if (pendingConfirm === "strategy") {
      const successRuns = analysisRuns.filter((r) => r.status === "success");
      const candidateRuns = successRuns.length > 0 ? successRuns : analysisRuns;
      // Show at most 3 runs (most recent first — API returns newest first)
      const displayRuns = candidateRuns.slice(0, 3);
      const hiddenCount  = candidateRuns.length - displayRuns.length;
      return (
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/30">
                Ground strategy in
              </p>
              {candidateRuns.length > 0 && (
                <span className="text-[9px] text-muted-foreground/25">
                  {candidateRuns.length} run{candidateRuns.length !== 1 ? "s" : ""} available
                </span>
              )}
            </div>
            {displayRuns.length === 0 ? (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
                  <span className="text-label font-semibold text-foreground/75">
                    {analysisRun?.date_start && analysisRun?.date_end
                      ? `${fmtDate(analysisRun.date_start)} – ${fmtDate(analysisRun.date_end)}`
                      : "Latest analysis"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/40 divide-y divide-border/30 overflow-hidden">
                {displayRuns.map((run, idx) => {
                  const isSel = selectedRunId === run.id;
                  const dateLabel = run.date_start && run.date_end
                    ? `${fmtDate(run.date_start)} – ${fmtDate(run.date_end)}`
                    : run.date_range ?? "Analysis";
                  const isLatest = idx === 0 && successRuns.length > 0;
                  return (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRunId(run.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors",
                        isSel
                          ? "bg-emerald-400/[0.07] text-foreground/90"
                          : "bg-transparent text-foreground/55 hover:bg-muted/30",
                      )}
                    >
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0 border transition-colors",
                        isSel
                          ? "bg-emerald-400/80 border-emerald-400/60"
                          : "bg-transparent border-border/40",
                      )} />
                      <span className="text-label font-medium flex-1 truncate">{dateLabel}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isLatest && (
                          <span className="text-[8px] font-semibold uppercase tracking-wider text-emerald-400/60 bg-emerald-400/[0.08] border border-emerald-400/15 rounded px-1 py-0.5 leading-none">
                            Latest
                          </span>
                        )}
                        {run.rows_ingested != null && (
                          <span className="text-[9px] font-mono text-muted-foreground/35">
                            {run.rows_ingested.toLocaleString()} rows
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {hiddenCount > 0 && (
                  <div className="px-2.5 py-1.5 bg-white/[0.01]">
                    <span className="text-[9px] text-muted-foreground/25">
                      +{hiddenCount} older run{hiddenCount !== 1 ? "s" : ""} not shown
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Estimated time hint */}
          <div className="flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            <p className="text-[9px] text-muted-foreground/35">Typical run time: 30–90 seconds</p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => { setPendingConfirm(null); onGenerateStrategy(selectedRunId ?? undefined); onClose(); }}
              className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-primary-btn"
            >
              <Sparkles className="w-3.5 h-3.5" /> Build Strategy
            </button>
            <button
              onClick={() => setPendingConfirm(null)}
              className="inline-flex items-center text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
      return (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => analysisComplete && setPendingConfirm("strategy")}
            disabled={!analysisComplete}
            className={cn(
              "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg",
              !analysisComplete
                ? "opacity-30 cursor-not-allowed mx-secondary-btn"
                : "mx-primary-btn",
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> Build Strategy
          </button>
        </div>
      );
    }

    if (stage === "report") return (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => goTo("/app/reports/new")}
          className={cn(
            "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg",
            reportComplete ? "mx-secondary-btn" : briefsComplete ? "mx-primary-btn" : "mx-secondary-btn opacity-50",
          )}
          disabled={!briefsComplete && !reportComplete}
        >
          {reportComplete
            ? <><RefreshCw className="w-3.5 h-3.5" /> New Report</>
            : <><Sparkles className="w-3.5 h-3.5" /> Generate Report</>
          }
        </button>
        {reportComplete && (
          <button
            onClick={() => goTo("/app/reports/history")}
            className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
          >
            View History
          </button>
        )}
      </div>
    );

    if (stage === "rerun") return (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => goTo("/app/settings/account")}
          disabled={!allLoopComplete}
          className={cn(
            "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg",
            !allLoopComplete
              ? "opacity-30 cursor-not-allowed mx-secondary-btn"
              : "mx-primary-btn",
          )}
        >
          <PlayCircle className="w-3.5 h-3.5" /> Run Analysis
        </button>
      </div>
    );

    // briefs — confirmation step before firing
    if (pendingConfirm === "briefs") return (
      <div className="flex flex-col gap-2.5">
        <div className="rounded-lg border border-primary/15 bg-primary/[0.05] px-2.5 py-2 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/35">Grounded in</p>
          <p className="text-label text-foreground/70 leading-relaxed">
            Strategy
            {strategyLastRun?.finished_at ? ` · generated ${fmtDate(strategyLastRun.finished_at)}` : ""}
            {strategyLastRun?.model ? ` · ${strategyLastRun.model}` : ""}
            {pillarCount > 0 ? ` · ${pillarCount} pillar${pillarCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => { setPendingConfirm(null); onGenerateBriefs(); onClose(); }}
            className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-primary-btn"
          >
            <Sparkles className="w-3.5 h-3.5" /> Draft Briefs
          </button>
          <button
            onClick={() => setPendingConfirm(null)}
            className="inline-flex items-center text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    );

    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => strategyComplete && setPendingConfirm("briefs")}
          disabled={!strategyComplete}
          className={cn(
            "inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg",
            !strategyComplete
              ? "opacity-30 cursor-not-allowed mx-secondary-btn"
              : "mx-primary-btn",
          )}
        >
          <Sparkles className="w-3.5 h-3.5" /> Draft Briefs
        </button>
        {briefsComplete && (
          <button
            onClick={() => goTo("/app/briefs/history")}
            className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
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
        className="w-[380px] max-w-full flex flex-col rounded-2xl overflow-hidden elevation-floating"
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
            <p className="text-title font-bold text-foreground/85 leading-none">{stageLabel}</p>
            <span className={cn(
              "inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider border rounded-md px-1.5 py-0.5 mt-1.5 leading-none",
              statusClass,
            )}>
              {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
          {stage === "report" ? (
            <ReportIntelligence
              briefsComplete={briefsComplete}
              reportComplete={reportComplete}
              reportCount={reportCount}
            />
          ) : stage === "rerun" ? (
            <RerunIntelligence allLoopComplete={allLoopComplete} />
          ) : (
            <StageIntelligence
              stage={stage}
              dataComplete={dataComplete}
              analysisComplete={analysisComplete}
              strategyComplete={strategyComplete}
              briefsComplete={briefsComplete}
              reportComplete={reportComplete}
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
              reportCount={reportCount}
              strategy={strategy}
              briefBuilder={briefBuilder}
              analysisRun={analysisRun}
              strategyLastRun={strategyLastRun}
              briefsLastRun={briefsLastRun}
              loopStatus={loopStatus}
              accountPlatform={accountPlatform}
            />
          )}
        </div>

        {/* ── Layer 3: Navigate ────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-border/12">
          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-muted-foreground/22 mb-2">
            Navigate
          </p>
          <div className="grid grid-cols-2 gap-1">
            {routes.map((r) => {
              const isCurrent    = currentPath === r.path;
              const isAccessible = isComplete || isRunning || (stage === "rerun" && allLoopComplete);
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
                    "text-caption font-semibold leading-none",
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
  managerId,
}: {
  accountId: string;
  account: AdAccount;
  managerId: string;
}) {
  const [location, navigate] = useLocation();
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const strategyGen = useGenerationRun(accountId, "strategy");
  const briefsGen   = useGenerationRun(accountId, "briefs");

  // Analysis run: poll every 2.5 s while a run is in flight.
  const [analysisPolling, setAnalysisPolling] = useState(false);
  const { data: latestAnalysisData, refetch: refetchAnalysis } = useGetLatestAnalysisRun(accountId, {
    query: {
      queryKey: getGetLatestAnalysisRunQueryKey(accountId),
      refetchInterval: analysisPolling ? 2500 : false,
    },
  });
  const { data: reportsData }        = useListWorkspaceReports(managerId);
  const { data: manualImportsData }  = useListManualImports(accountId);
  const { data: analysisRunsData }   = useListAnalysisRuns(accountId);

  const analysisRun     = latestAnalysisData?.run ?? null;
  const strategyLastRun = strategyGen.lastRun ?? null;
  const briefsLastRun   = briefsGen.lastRun ?? null;

  const iap = account.iap ?? null;

  // Counts
  const cellCount          = iap?.analysis?.performance_by_cell?.length ?? 0;
  const variableCount      = iap?.analysis?.v3_variable_performance?.length ?? 0;
  const pillarCount        = iap?.strategy?.message_pillars?.length ?? 0;
  const hypothesisCount    = iap?.strategy?.active_hypotheses?.length ?? 0;
  const icpCount           = iap?.strategy?.icp_profiles?.length ?? 0;
  const briefCount         = iap?.brief_builder?.draft_briefs?.length ?? 0;
  const reportCount        = (reportsData?.reports ?? []).filter((r) => r.ad_account_id === accountId).length;
  const stagedImportCount  = manualImportsData?.imports?.length ?? 0;

  // Stage completion signals.
  // dataComplete and analysisComplete use DIFFERENT signals:
  //   Data     — source is connected (live Meta) OR manual files are staged OR analysis ran
  //   Analysis — result data exists from a completed analysis run
  const isLiveMeta       = ["meta", "facebook", "meta ads"].includes((account.platform ?? "").toLowerCase());
  const analysisComplete = cellCount + variableCount > 0;
  const dataComplete     = isLiveMeta || stagedImportCount > 0 || analysisComplete;
  const strategyComplete = pillarCount > 0;
  const briefsComplete   = briefCount > 0;
  const reportComplete   = reportCount > 0;
  // rerun is the 6th tile — represents the next loop cycle; never "complete"
  const allLoopComplete  = dataComplete && analysisComplete && strategyComplete && briefsComplete && reportComplete;

  const analysisRunning = analysisRun?.status === "running";
  const strategyRunning = strategyGen.isRunning;
  const briefsRunning   = briefsGen.isRunning;

  // ── Analysis elapsed-time counter ──────────────────────────────────────
  // Mirrors the pattern in useGenerationRun: starts ticking when
  // analysisRunning becomes true, resets when it becomes false.
  // When the component mounts mid-run the counter is seeded from the
  // run's server-side started_at so a page-reload doesn't restart at 0:00.
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const analysisRunningStartRef = useRef<number | null>(null);
  // Keep the latest started_at available inside the effect without adding
  // it to the deps array (we only need it for the one-time seeding).
  const analysisRunStartedAtRef = useRef<string | null | undefined>(undefined);
  analysisRunStartedAtRef.current = analysisRun?.started_at;

  useEffect(() => {
    if (!analysisRunning) {
      analysisRunningStartRef.current = null;
      setAnalysisElapsedSeconds(0);
      return;
    }
    if (analysisRunningStartRef.current === null) {
      const serverTs = analysisRunStartedAtRef.current
        ? new Date(analysisRunStartedAtRef.current).getTime()
        : null;
      analysisRunningStartRef.current = serverTs ?? Date.now();
    }
    const iv = setInterval(() => {
      setAnalysisElapsedSeconds(Math.floor((Date.now() - analysisRunningStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [analysisRunning]);

  // ── Analysis polling lifecycle ───────────────────────────────────────────
  // Enables polling when a run starts, disables + invalidates seed when done.
  //
  // Two paths to seed invalidation:
  //   A. Normal path — component was mounted when the run settled:
  //      analysisPolling was true → run status left "running" → invalidate + stop polling.
  //   B. Remount path — user navigated away mid-run, then returned after completion:
  //      analysisPolling is false on remount (initial state), so path A is skipped.
  //      We detect this by checking that the run is "success" but the seed hasn't
  //      reflected the data yet (!analysisComplete), and guard against re-triggering
  //      on every render with seedRefreshedForRunIdRef (tracks the last run id we
  //      already invalidated for).
  const prevAnalysisStatusRef    = useRef<string | null | undefined>(undefined);
  const analysisToastRunIdRef    = useRef<string | null>(null);
  const seedRefreshedForRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    const status = analysisRun?.status;
    const runId  = analysisRun?.id;
    if (status === "running") {
      setAnalysisPolling(true);
    } else if (analysisPolling && status) {
      // Path A: polling was active, run just settled.
      setAnalysisPolling(false);
      void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
      if (runId) seedRefreshedForRunIdRef.current = runId;
    } else if (
      status === "success" &&
      runId &&
      seedRefreshedForRunIdRef.current !== runId &&
      !analysisComplete
    ) {
      // Path B: component mounted (or user returned) after the run completed,
      // but the seed bundle doesn't yet show the results. Invalidate once per run id.
      seedRefreshedForRunIdRef.current = runId;
      void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
    // Toast once when a run transitions to success (only when we were watching it run).
    if (
      status === "success" &&
      runId &&
      analysisToastRunIdRef.current !== runId &&
      prevAnalysisStatusRef.current === "running"
    ) {
      analysisToastRunIdRef.current = runId;
      toast({
        title: "Analysis complete",
        description:
          analysisRun.date_start && analysisRun.date_end
            ? `Data covers ${analysisRun.date_start} → ${analysisRun.date_end}.`
            : "Performance data is ready.",
        duration: 4000,
      });
    }
    prevAnalysisStatusRef.current = status;
  }, [analysisRun?.status, analysisRun?.id, analysisRun?.date_start, analysisRun?.date_end, analysisPolling, analysisComplete, queryClient, toast]);

  // ── Analysis run mutation (fired from CommandHub confirmation) ───────────
  const startAnalysisMutation = useStartManualAnalysisRun();
  const [analysisStartError, setAnalysisStartError]  = useState<string | null>(null);
  // Double-tap guard: analysisFireRef blocks a second mutateAsync() call
  // synchronously (before any re-render); analysisFiring drives the disabled
  // state so the button disables in the very next render triggered by
  // setAnalysisFiring(true) — before mutation.isPending catches up.
  const analysisFireRef = useRef(false);
  const [analysisFiring, setAnalysisFiring] = useState(false);
  const handleStartAnalysis = async (range: AnalysisDateRange): Promise<void> => {
    if (analysisFireRef.current) return;
    analysisFireRef.current = true;
    setAnalysisFiring(true);
    setAnalysisStartError(null);
    try {
      await startAnalysisMutation.mutateAsync({ accountId, data: { date_range: range } });
      // Start polling immediately — don't wait for refetch to confirm "running"
      // so there's no timing gap where the run exists on the server but
      // analysisPolling is still false.
      setAnalysisPolling(true);
      await refetchAnalysis();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start analysis — check your connection.";
      setAnalysisStartError(msg);
    } finally {
      analysisFireRef.current = false;
      setAnalysisFiring(false);
    }
  };

  const strategy     = iap?.strategy ?? null;
  const briefBuilder = iap?.brief_builder ?? null;
  const loopStatus   = iap?.loop_status ?? null;

  // ── Staleness: generated before the latest successful analysis run ────────
  // Pure logic extracted to staleStageDetection.ts (unit-tested there).
  // Loop status stage keys: "strategy_map" for strategy, "brief_builder" for briefs
  const {
    analysisFinishedAt,
    strategyGeneratedAt,
    briefsGeneratedAt,
    strategyIsStale,
    briefsIsStale,
  } = computeStaleStages({
    analysisRun,
    strategyLastRun,
    briefsLastRun,
    loopStatus: loopStatus ?? null,
    analysisComplete,
    strategyComplete,
    briefsComplete,
    strategyRunning,
    briefsRunning,
  });

  const completeCount = [dataComplete, analysisComplete, strategyComplete, briefsComplete, reportComplete].filter(Boolean).length;
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
              : completeCount === TOTAL_STAGES ? "text-emerald-400/45"
              : completeCount > 0   ? "text-primary/40"
              : "text-muted-foreground/22",
          )}>
            {anyRunning ? "●" : completeCount === TOTAL_STAGES ? "✓" : `${completeCount}/${TOTAL_STAGES}`}
          </span>
        </div>

        {/* Running strip — persistent progress indicator whenever any stage is active */}
        {(analysisRunning || strategyRunning || briefsRunning) && (() => {
          const activeKind: "analysis" | "strategy" | "briefs" = analysisRunning ? "analysis" : strategyRunning ? "strategy" : "briefs";
          const activeElapsed = analysisRunning ? analysisElapsedSeconds : strategyRunning ? strategyGen.elapsedSeconds : briefsGen.elapsedSeconds;
          const pct = calcProgress(activeElapsed, EXPECTED_SECONDS[activeKind]);
          const phase = getPhaseLabel(activeKind, pct);
          const stageLabel = activeKind.charAt(0).toUpperCase() + activeKind.slice(1);
          return (
            <div className="flex flex-col gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Loader2 className="w-3 h-3 text-amber-400/70 animate-spin shrink-0" />
                  <span className="text-label text-amber-400/65 font-medium truncate">
                    <span className="text-amber-400/45">{stageLabel} · </span>{phase}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] font-bold tabular-nums text-amber-400/65">{pct}%</span>
                  <span className="text-[9px] font-mono tabular-nums text-amber-400/35 leading-none">
                    {fmtElapsed(activeElapsed)}
                  </span>
                </div>
              </div>
              <div className="relative h-[3px] rounded-full overflow-hidden bg-amber-400/[0.08]">
                <span
                  className="absolute inset-y-0 left-0 bg-amber-400/50 rounded-full transition-[width] duration-1000 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Six tiles + causal connectors */}
        <div className="flex items-center gap-0.5">
          <StageTile
            stage="data"
            isComplete={dataComplete}
            isRunning={false}
            isStale={false}
            isNext={!dataComplete}
            isLocked={false}
            isActive={activeStage === "data"}
            elapsedSeconds={0}
            onClick={() => toggle("data")}
          />

          <ArrowRight className={cn(
            "w-2.5 h-2.5 shrink-0 transition-colors",
            dataComplete ? "text-emerald-400/25" : "text-muted-foreground/10",
          )} />

          <StageTile
            stage="analysis"
            isComplete={analysisComplete}
            isRunning={analysisRunning}
            isStale={false}
            isNext={dataComplete && !analysisComplete && !analysisRunning}
            isLocked={!dataComplete && !analysisComplete && !analysisRunning}
            isActive={activeStage === "analysis"}
            elapsedSeconds={analysisElapsedSeconds}
            onClick={() => toggle("analysis")}
          />

          <ArrowRight className={cn(
            "w-2.5 h-2.5 shrink-0 transition-colors",
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
            "w-2.5 h-2.5 shrink-0 transition-colors",
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

          <ArrowRight className={cn(
            "w-2.5 h-2.5 shrink-0 transition-colors",
            briefsComplete ? "text-emerald-400/25" : "text-muted-foreground/10",
          )} />

          <StageTile
            stage="report"
            isComplete={reportComplete}
            isRunning={false}
            isStale={false}
            isNext={briefsComplete && !reportComplete}
            isLocked={!briefsComplete && !reportComplete}
            isActive={activeStage === "report"}
            elapsedSeconds={0}
            onClick={() => toggle("report")}
          />

          <ArrowRight className={cn(
            "w-2.5 h-2.5 shrink-0 transition-colors",
            allLoopComplete ? "text-primary/20" : "text-muted-foreground/10",
          )} />

          <StageTile
            stage="rerun"
            isComplete={false}
            isRunning={false}
            isStale={false}
            isNext={allLoopComplete && !anyRunning}
            isLocked={!allLoopComplete}
            isActive={activeStage === "rerun"}
            elapsedSeconds={0}
            onClick={() => toggle("rerun")}
          />
        </div>
      </div>

      {activeStage && (
        <CommandHub
          stage={activeStage}
          onClose={() => setActiveStage(null)}
          currentPath={location}
          dataComplete={dataComplete}
          analysisComplete={analysisComplete}
          strategyComplete={strategyComplete}
          briefsComplete={briefsComplete}
          reportComplete={reportComplete}
          analysisRunning={analysisRunning}
          strategyRunning={strategyRunning}
          briefsRunning={briefsRunning}
          analysisElapsedSeconds={analysisElapsedSeconds}
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
          reportCount={reportCount}
          strategy={strategy}
          briefBuilder={briefBuilder}
          analysisRun={analysisRun}
          analysisRuns={analysisRunsData?.runs ?? []}
          strategyLastRun={strategyLastRun}
          briefsLastRun={briefsLastRun}
          loopStatus={loopStatus}
          accountPlatform={account.platform}
          allLoopComplete={allLoopComplete}
          stagedImportCount={stagedImportCount}
          isLiveMeta={isLiveMeta}
          analysisStarting={startAnalysisMutation.isPending || analysisFiring}
          analysisStartError={analysisStartError}
          onNavigate={navigate}
          onStartAnalysis={handleStartAnalysis}
          onGenerateStrategy={(runId) => strategyGen.start({ analysis_run_id: runId })}
          onGenerateBriefs={() => briefsGen.start()}
        />
      )}
    </>
  );
}
