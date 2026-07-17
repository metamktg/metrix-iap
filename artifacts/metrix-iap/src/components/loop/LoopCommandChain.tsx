// ─── IAP Loop · Command Chain ─────────────────────────────────────────
// Execute-on-command representation of the IAP loop. Renders the loop as
// an ordered chain of stages, each with an honest state (complete /
// running / ready-to-run / locked / not-yet-runnable) and — where a real
// engine exists — an explicit Execute control.
//
// HARD PRODUCT CONSTRAINT (see replit.md): the loop only ever runs when a
// human executes a stage. Nothing here auto-advances, nothing runs on a
// schedule, and live Meta data pulls / manual uploads NEVER trigger a run.
// New or refreshed data is surfaced as a "data refreshed" note that may
// mark downstream stages STALE — but re-running is always a deliberate
// command the user issues, never automatic. Actions call the same explicit
// endpoints the per-stage views use; they do not invent new execution.

import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGetLatestAnalysisRun } from "@workspace/api-client-react";
import { useGenerationRun } from "@/components/generation/GenerationControls";
import type { AdAccount } from "@/lib/data/seedTypes";
import {
  BarChart3, Layers, FileText, Grid3x3, Zap,
  PlayCircle, Loader2, CheckCircle2, Lock, Clock, RefreshCw, ArrowRight,
} from "lucide-react";

// ── Stage model ───────────────────────────────────────────────────────

type StageState =
  | "complete"      // real output exists for this stage
  | "running"       // a run this user started is in flight
  | "runnable"      // precondition met, not run yet — the next command
  | "stale"         // was run, but newer data means it may need re-running
  | "locked"        // precondition not met yet
  | "unavailable";  // no in-app engine for this stage yet (honest)

type StageAction =
  | { kind: "execute"; run: () => void }   // one-click in-app generation
  | { kind: "navigate"; to: string }       // execution lives on another page
  | { kind: "none" };

type StageView = {
  key: string;
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  state: StageState;
  /** Why a stage is locked / unavailable — shown inline, never fabricated. */
  note?: string;
  action: StageAction;
  actionLabel: string;
};

const STATE_META: Record<
  StageState,
  { label: string; chip: string; icon: React.ComponentType<{ className?: string }> }
> = {
  complete:    { label: "Complete",        chip: "text-emerald-300 border-emerald-400/40 bg-emerald-400/12", icon: CheckCircle2 },
  running:     { label: "Running",         chip: "text-amber-300 border-amber-400/40 bg-amber-400/12",       icon: Loader2 },
  runnable:    { label: "Ready to run",    chip: "text-primary border-primary/40 bg-primary/12",             icon: PlayCircle },
  stale:       { label: "Data refreshed",  chip: "text-sky-300 border-sky-400/40 bg-sky-400/12",             icon: RefreshCw },
  locked:      { label: "Locked",          chip: "text-muted-foreground/70 border-border/50 bg-white/[0.03]", icon: Lock },
  unavailable: { label: "Not yet in-app",  chip: "text-muted-foreground/60 border-border/40 bg-white/[0.02]", icon: Clock },
};

/**
 * The execute-on-command view of the IAP loop for one account.
 * Reuses the exact endpoints the per-stage views call — it never
 * introduces a new or automatic execution path.
 */
export function LoopCommandChain({
  accountId,
  account,
}: {
  accountId: string;
  account: AdAccount;
}) {
  const [, navigate] = useLocation();
  const strategyGen = useGenerationRun(accountId, "strategy");
  const briefsGen = useGenerationRun(accountId, "briefs");
  const { data: latestAnalysis } = useGetLatestAnalysisRun(accountId);

  const iap = account.iap ?? null;

  // ── Honest completion signals: real output presence is ground truth ──
  const cellCount = iap?.analysis?.performance_by_cell?.length ?? 0;
  const variableCount = iap?.analysis?.v3_variable_performance?.length ?? 0;
  const analysisComplete = cellCount + variableCount > 0;
  const strategyComplete = (iap?.strategy?.message_pillars?.length ?? 0) > 0;
  const briefsComplete = (iap?.brief_builder?.draft_briefs?.length ?? 0) > 0;

  // ── In-flight runs (started explicitly by the user) ─────────────────
  const analysisRunning = latestAnalysis?.run?.status === "running";
  const strategyRunning = strategyGen.isRunning;
  const briefsRunning = briefsGen.isRunning;

  function resolveState(opts: {
    complete: boolean;
    running: boolean;
    unlocked: boolean;
  }): StageState {
    if (opts.running) return "running";
    if (opts.complete) return "complete";
    if (opts.unlocked) return "runnable";
    return "locked";
  }

  const stages: StageView[] = [
    {
      key: "analysis",
      name: "Analysis",
      Icon: BarChart3,
      state: resolveState({ complete: analysisComplete, running: analysisRunning, unlocked: true }),
      // Analysis needs an explicit date-range choice, so its execution
      // surface is the Run-analysis control, not a one-click here.
      action: { kind: "navigate", to: "/app/settings/account" },
      actionLabel: analysisComplete ? "Re-run analysis" : "Run analysis",
    },
    {
      key: "strategy",
      name: "Strategy",
      Icon: Layers,
      state: resolveState({ complete: strategyComplete, running: strategyRunning, unlocked: analysisComplete }),
      note: !analysisComplete && !strategyComplete ? "Run analysis first" : undefined,
      action: analysisComplete ? { kind: "execute", run: strategyGen.start } : { kind: "none" },
      actionLabel: strategyComplete ? "Regenerate strategy" : "Generate strategy",
    },
    {
      key: "briefs",
      name: "Briefs",
      Icon: FileText,
      state: resolveState({ complete: briefsComplete, running: briefsRunning, unlocked: strategyComplete }),
      note: !strategyComplete && !briefsComplete ? "Generate strategy first" : undefined,
      action: strategyComplete ? { kind: "execute", run: briefsGen.start } : { kind: "none" },
      actionLabel: briefsComplete ? "Regenerate briefs" : "Generate briefs",
    },
    {
      key: "creative_scan",
      name: "Creative Scan",
      Icon: Grid3x3,
      state: "unavailable",
      note: "No in-app run yet — runs from imported data only.",
      action: { kind: "navigate", to: "/app/mst/creative-scan" },
      actionLabel: "View",
    },
    {
      key: "optimization_loop",
      name: "Optimization Loop",
      Icon: Zap,
      state: "unavailable",
      note: "No in-app run yet — no golden formula until this stage runs.",
      action: { kind: "none" },
      actionLabel: "",
    },
  ];

  // The single next command: first stage that is runnable and not complete.
  const nextRunnableKey = stages.find((s) => s.state === "runnable")?.key ?? null;

  function runAction(stage: StageView) {
    if (stage.action.kind === "execute") stage.action.run();
    else if (stage.action.kind === "navigate") navigate(stage.action.to);
  }

  const actionable = (s: StageView) =>
    (s.state === "runnable" || s.state === "complete" || s.state === "stale") &&
    s.action.kind !== "none";

  return (
    <div className="rounded-2xl border border-border/40 bg-gradient-to-b from-white/[0.02] to-transparent p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <PlayCircle className="w-3.5 h-3.5 text-primary/80" />
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60">
            IAP Loop · Command Chain
          </h2>
        </div>
        <span className="text-[10px] text-muted-foreground/45">Runs only when you execute a stage</span>
      </div>
      <p className="text-[10.5px] text-muted-foreground/60 leading-relaxed mb-3.5 max-w-2xl">
        Each stage runs on command — never automatically. Live Meta data refreshes on its own, but a
        data refresh never runs the loop; you execute the next stage deliberately.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {stages.map((s, i) => {
          const meta = STATE_META[s.state];
          const isNext = s.key === nextRunnableKey;
          const canAct = actionable(s);
          return (
            <div
              key={s.key}
              className={cn(
                "relative flex flex-col gap-2 rounded-xl border p-3 transition-colors",
                isNext
                  ? "border-primary/50 bg-primary/[0.06] ring-1 ring-primary/25"
                  : s.state === "complete"
                    ? "border-emerald-400/25 bg-emerald-400/[0.03]"
                    : "border-border/40 bg-white/[0.02]"
              )}
            >
              {/* step index + state chip */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-muted-foreground/40 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <s.Icon
                    className={cn(
                      "w-3.5 h-3.5",
                      s.state === "complete" ? "text-emerald-400/80"
                        : isNext ? "text-primary"
                        : "text-muted-foreground/45"
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                    meta.chip
                  )}
                >
                  <meta.icon className={cn("w-2.5 h-2.5", s.state === "running" && "animate-spin")} />
                  {meta.label}
                </span>
              </div>

              {/* name */}
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-foreground leading-tight truncate">{s.name}</div>
                {s.note && (
                  <div className="text-[9.5px] text-muted-foreground/55 mt-0.5 leading-tight">{s.note}</div>
                )}
                {isNext && !s.note && (
                  <div className="text-[9.5px] text-primary/75 mt-0.5 leading-tight font-medium">Next command</div>
                )}
              </div>

              {/* action */}
              <div className="mt-auto pt-1">
                {s.state === "running" ? (
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-amber-300/90">
                    <Loader2 className="w-3 h-3 animate-spin" /> Running…
                  </span>
                ) : canAct ? (
                  <button
                    onClick={() => runAction(s)}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[10.5px] font-semibold rounded-md px-2 py-1 border transition-colors",
                      isNext
                        ? "text-primary border-primary/40 bg-primary/10 hover:bg-primary/18"
                        : "text-foreground/80 border-border/50 bg-white/[0.03] hover:bg-white/[0.06]"
                    )}
                  >
                    {s.action.kind === "execute" ? (
                      <PlayCircle className="w-3 h-3" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                    {s.actionLabel}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/45">
                    <Lock className="w-2.5 h-2.5" />
                    {s.state === "unavailable" ? "Not runnable yet" : "Locked"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
