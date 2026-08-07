// ─── Task Tray ────────────────────────────────────────────────────────
// Persistent right panel reserved for actionable workflow items.
// Sections priority-ordered: Analysis → Approved Actions → Ready to Brief →
// Briefs Pending → Top Signals → Quick Jump.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  X, ClipboardList, Sparkles, AlertCircle, FileText,
  ArrowRight, Zap, ChevronRight, Check, RotateCcw,
  ChevronDown, ChevronUp, PlayCircle, Loader2,
  CheckCircle2, XCircle, Upload, CalendarRange, UploadCloud,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import {
  useDecisions,
  getAllApproved,
  toggleDone,
  setDecision,
} from "@/lib/data/decisionStore";
import {
  useStartManualAnalysisRun,
  useGetLatestAnalysisRun,
  getGetMetrixSeedQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { SignalCard } from "@/lib/data/seedTypes";

// ─── Helpers ──────────────────────────────────────────────────────────

const GROUP_ORDER = [
  "Budget actions",
  "Creative actions",
  "Strategy updates",
  "Brief updates",
  "MST setup actions",
  "Account setup",
];

const DATE_PRESETS = [
  { id: "7d" as const, label: "7 days" },
  { id: "14d" as const, label: "14 days" },
  { id: "30d" as const, label: "30 days" },
  { id: "all" as const, label: "All data" },
];

// Left-accent stripe colors keyed to item type
const ACCENT = {
  approved: "before:bg-emerald-400",
  hypothesis: "before:bg-violet-400",
  brief: "before:bg-chart-1",
  signal: "before:bg-amber-400",
  nav: "",
} as const;

// ─── Analysis section ─────────────────────────────────────────────────

function TrayAnalysisUnconfigured({ accountId }: { accountId: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="mx-4 rounded-xl border border-border/50 bg-white/[0.025] overflow-hidden">
      {/* Header stripe */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30 bg-primary/[0.04]">
        <CalendarRange className="w-3.5 h-3.5 text-interactive/80 shrink-0" />
        <span className="text-caption font-semibold text-foreground/80 flex-1">IAP Analysis</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/70 border border-amber-400/25 bg-amber-400/[0.08] rounded px-1.5 py-0.5 leading-none">
          Setup required
        </span>
      </div>
      {/* Body */}
      <div className="px-3 py-3 space-y-3">
        <p className="text-caption text-foreground/55 leading-snug">
          Upload your performance CSVs or connect Meta to unlock analysis, strategy, and briefs.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => navigate(`/app/account?account=${accountId}`)}
            className="flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg bg-primary/15 border border-primary/30 text-caption font-semibold text-interactive hover:bg-primary/25 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload CSV
          </button>
          <button
            onClick={() => navigate(`/app/account?account=${accountId}`)}
            className="flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border border-border/40 bg-white/[0.03] text-caption font-medium text-foreground/65 hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Connect Meta
          </button>
        </div>
      </div>
    </div>
  );
}

/** True when the last successful run finished within the past 28 days. */
function wasRecentlyRun(run: { status: string; finished_at?: string | null } | null): boolean {
  if (!run || run.status !== "success" || !run.finished_at) return false;
  const finishedMs = new Date(run.finished_at).getTime();
  const age = Date.now() - finishedMs;
  return age < 28 * 24 * 60 * 60 * 1000;
}

function TrayAnalysisConfigured({ accountId }: { accountId: string }) {
  const [dateRange, setDateRange] = useState<"7d" | "14d" | "30d" | "all">("30d");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const startMutation = useStartManualAnalysisRun();
  const { data: latest, refetch } = useGetLatestAnalysisRun(accountId);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = latest?.run ?? null;
  const isRunning = run?.status === "running";
  const recentlyRun = wasRecentlyRun(run);

  // Poll while running, bust seed cache on completion
  useEffect(() => {
    if (isRunning && !pollRef.current) {
      pollRef.current = setInterval(() => { void refetch(); }, 3000);
    }
    if (!isRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [isRunning, refetch, queryClient]);

  const handleRun = async () => {
    setError(null);
    try {
      await startMutation.mutateAsync({ accountId, data: { date_range: dateRange } });
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start analysis. Try again.";
      setError(msg);
    }
  };

  return (
    <div className="mx-4 rounded-xl border border-border/50 bg-white/[0.025] overflow-hidden">
      {/* Header stripe */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30 bg-primary/[0.04]">
        <CalendarRange className="w-3.5 h-3.5 text-interactive/80 shrink-0" />
        <span className="text-caption font-semibold text-foreground/80 flex-1">Run Analysis</span>
        {run?.status === "success" && (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
          </span>
        )}
        {run?.status === "running" && (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        )}
        {run?.status === "error" && (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-red-400">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5">
        {/* Last run summary */}
        {run?.status === "success" && run.date_start && run.date_end && (
          <div className="text-label text-muted-foreground/60 bg-emerald-400/[0.05] border border-emerald-400/15 rounded-lg px-2.5 py-1.5 leading-snug">
            <span className="text-emerald-400/80 font-medium">Last run:</span>{" "}
            {run.date_start} → {run.date_end}
            {run.rows_ingested != null && (
              <span className="text-muted-foreground/40"> · {run.rows_ingested} rows</span>
            )}
          </div>
        )}
        {run?.status === "error" && run.error_message && (
          <div className="text-label text-red-400/80 bg-red-400/[0.05] border border-red-400/15 rounded-lg px-2.5 py-1.5 leading-snug line-clamp-2">
            {run.error_message}
          </div>
        )}

        {/* Date range label */}
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/55">
          Date window
        </p>

        {/* Date range picker */}
        <div className="grid grid-cols-2 gap-1">
          {DATE_PRESETS.map((r) => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              disabled={isRunning}
              className={cn(
                "h-7 rounded-lg border text-label font-semibold transition-colors",
                dateRange === r.id
                  ? "border-primary/50 bg-primary/15 text-interactive"
                  : "border-border/35 bg-white/[0.02] text-foreground/50 hover:bg-white/[0.05] hover:text-foreground/75",
                isRunning && "opacity-40 cursor-not-allowed"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-label text-red-400 leading-snug">{error}</p>
        )}

        {/* Run / Re-run button — de-emphasised when recently run */}
        {recentlyRun && !isRunning ? (
          /* Subtle secondary link when within 28-day freshness window */
          <button
            onClick={() => void handleRun()}
            disabled={startMutation.isPending}
            className="w-full flex items-center justify-center gap-1.5 h-7 rounded-lg border border-border/30 bg-white/[0.02] text-caption font-medium text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/[0.05] hover:border-border/50 transition-colors"
          >
            {startMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting…</>
            ) : (
              <><RotateCcw className="w-3.5 h-3.5" /> Re-run analysis</>
            )}
          </button>
        ) : (
          /* Primary CTA — first run, failed, or stale (> 28 days) */
          <button
            onClick={() => void handleRun()}
            disabled={isRunning || startMutation.isPending}
            className={cn(
              "w-full flex items-center justify-center gap-2 h-8 rounded-lg text-body font-semibold transition-colors",
              isRunning || startMutation.isPending
                ? "bg-primary/10 border border-primary/20 text-interactive/50 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isRunning || startMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running analysis…</>
            ) : (
              <><PlayCircle className="w-3.5 h-3.5" /> Run analysis</>
            )}
          </button>
        )}

        {/* Upload link */}
        <UploadDataLink accountId={accountId} />
      </div>
    </div>
  );
}

function UploadDataLink({ accountId }: { accountId: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(`/app/account?account=${accountId}`)}
      className="w-full flex items-center gap-1.5 text-label text-muted-foreground/50 hover:text-foreground/70 transition-colors justify-center py-0.5"
    >
      <Upload className="w-3.5 h-3.5" />
      Upload / manage data files
      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
    </button>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────────

function TraySection({
  title,
  count,
  children,
  accentColor,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <div className="px-4">
      <div className="flex items-center gap-1.5 mb-2.5">
        {accentColor && (
          <span className={cn("w-1 h-3 rounded-full shrink-0", accentColor)} />
        )}
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/75">
          {title}
        </span>
        {count != null && count > 0 && (
          <span className="text-[9px] font-mono text-interactive bg-primary/12 border border-primary/20 rounded px-1 leading-tight tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function TrayCard({
  accent,
  children,
  muted,
}: {
  accent: keyof typeof ACCENT;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-white/[0.03] px-2.5 py-2 space-y-1.5",
        "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full",
        ACCENT[accent],
        muted ? "border-border/20 opacity-50" : "border-border/40"
      )}
    >
      {children}
    </div>
  );
}

function TrayItem({
  label,
  sub,
  onAction,
  actionLabel = "Create Brief",
  accent = "hypothesis",
}: {
  label: string;
  sub?: string;
  onAction?: () => void;
  actionLabel?: string;
  accent?: keyof typeof ACCENT;
}) {
  return (
    <TrayCard accent={accent}>
      <p className="text-body font-medium text-foreground/90 leading-snug line-clamp-2">{label}</p>
      {sub && (
        <span className="inline-block text-[9px] font-semibold uppercase tracking-wide bg-white/[0.06] border border-border/30 rounded px-1.5 py-0.5 text-foreground/55 leading-none">
          {sub}
        </span>
      )}
      {onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1 text-caption font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded px-2 py-0.5 transition-colors"
        >
          {actionLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </TrayCard>
  );
}

function ApprovedTaskItem({
  item,
}: {
  item: { scopeId: string; cardId: string; meta: import("@/lib/data/decisionStore").CardMeta; done: boolean };
}) {
  const { scopeId, cardId, meta, done } = item;
  return (
    <TrayCard accent="approved" muted={done}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => toggleDone(scopeId, cardId)}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={cn(
            "mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
            done
              ? "bg-emerald-400/25 border-emerald-400/50 text-emerald-400"
              : "border-border/50 text-transparent hover:border-emerald-400/60 hover:bg-emerald-400/5"
          )}
        >
          <Check className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1 min-w-0">
          <p className={cn("text-body font-medium leading-tight", done ? "text-foreground/40 line-through" : "text-foreground/90")}>
            {meta.title}
          </p>
          {!done && (
            <p className="text-label text-foreground/60 mt-0.5 leading-snug line-clamp-2">
              {meta.recommendedAction}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {meta.actionGroup && (
              <span className="text-[8px] font-semibold border border-emerald-400/20 bg-emerald-400/[0.07] px-1.5 py-0.5 rounded text-emerald-400/80 leading-none">
                {meta.actionGroup}
              </span>
            )}
            {meta.scopeLabel && (
              <span className="text-[8px] text-muted-foreground/50 font-mono">{meta.scopeLabel}</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setDecision(scopeId, cardId, "pending")}
          title="Return to deck"
          aria-label="Return to deck"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-colors shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </TrayCard>
  );
}

function TrayNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-body font-medium text-foreground/60 hover:text-foreground hover:bg-white/[0.04] transition-colors text-left"
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />}
      {label}
      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
    </button>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-border/30" />;
}

function EmptySlot({
  message,
  nudgeLabel,
  nudgeTo,
}: {
  message: string;
  nudgeLabel?: string;
  nudgeTo?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="px-0.5 py-1.5 space-y-1">
      <p className="text-caption text-foreground/40 leading-snug">{message}</p>
      {nudgeLabel && nudgeTo && (
        <button
          onClick={() => navigate(nudgeTo)}
          className="text-label text-interactive/70 hover:text-interactive font-semibold transition-colors flex items-center gap-1"
        >
          {nudgeLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function TaskTray() {
  useDecisions();
  const { open, toggle, close } = useTaskTray();
  const { activeAdAccount, activeAdAccountId, selectedAccountType } = useAccount();
  const [, navigate] = useLocation();
  const [showDone, setShowDone] = useState(false);

  const isAdAccountView = selectedAccountType === "ad_account" && !!activeAdAccountId;

  const hypotheses = activeAdAccount?.iap?.strategy?.active_hypotheses ?? [];
  const signals = activeAdAccount?.listen?.signal_cards ?? [];
  const drafts = activeAdAccount?.iap?.brief_builder?.draft_briefs ?? [];

  const pendingDrafts = drafts.filter((b) => b.status !== "approved");
  const topHyps = hypotheses.slice(0, 3);
  const topSignals = signals.slice(0, 2);

  const allApproved = getAllApproved();
  const approvedUndone = allApproved.filter((i) => !i.done);
  const approvedDone = allApproved.filter((i) => i.done);

  const approvedGroups = GROUP_ORDER.map((g) => ({
    label: g,
    rows: approvedUndone.filter((i) => i.meta.actionGroup === g),
  })).filter((g) => g.rows.length > 0);

  const ungroupedApproved = approvedUndone.filter(
    (i) => !GROUP_ORDER.includes(i.meta.actionGroup)
  );

  const workflowCount = topHyps.length + topSignals.length + pendingDrafts.length;
  const totalItems = approvedUndone.length + workflowCount;

  // ── Minimized strip ──────────────────────────────────────────────────
  if (!open) {
    const hasPriorityItems = approvedUndone.length > 0;
    return (
      <div className="w-[var(--tray-closed)] shrink-0 border-l-2 border-border/50 bg-surface-sidebar flex flex-col items-center py-3 gap-2">
        <button
          onClick={toggle}
          title="Expand task tray"
          aria-label="Expand task tray"
          className="flex flex-col items-center gap-2 w-full px-1 text-muted-foreground/60 hover:text-primary transition-colors group"
        >
          <div className="relative">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              hasPriorityItems
                ? "bg-emerald-400/15 border border-emerald-400/30 group-hover:bg-emerald-400/20"
                : "bg-white/[0.05] border border-border/40 group-hover:bg-white/[0.08]"
            )}>
              <ClipboardList
                className={cn(
                  "w-4 h-4 transition-transform group-hover:scale-110",
                  hasPriorityItems ? "text-emerald-400" : "text-muted-foreground/70"
                )}
              />
            </div>
            {totalItems > 0 && (
              <span className={cn(
                "absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none px-1 tabular-nums border",
                hasPriorityItems
                  ? "bg-emerald-500 text-white border-emerald-400/50"
                  : "bg-primary text-primary-foreground border-primary/50"
              )}>
                {Math.min(totalItems, 9)}
              </span>
            )}
          </div>
        </button>

        <div
          className="flex-1 flex items-end justify-center pb-1 cursor-pointer"
          onClick={toggle}
          title="Expand task tray"
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25" />
        </div>

        <button
          onClick={toggle}
          title="Expand"
          aria-label="Expand task tray"
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-white/[0.05] transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const accountIsUnconfigured = isAdAccountView && activeAdAccount?.status !== "configured";

  return (
    <div className="w-[var(--tray-open)] shrink-0 border-l-2 border-border/60 bg-surface-sidebar flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-white/[0.02]">
        <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <ClipboardList className="w-4 h-4 text-interactive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label font-mono text-muted-foreground/50 uppercase tracking-widest leading-none mb-0.5">
            Workflow
          </p>
          <p className="text-title font-semibold text-foreground leading-tight">
            {totalItems === 0
              ? "All caught up"
              : `${totalItems} action${totalItems !== 1 ? "s" : ""} pending`}
          </p>
        </div>
        <button
          onClick={close}
          aria-label="Close task tray"
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">

        {/* ── IAP Analysis entry point ──────────────────────────────── */}
        {isAdAccountView && activeAdAccountId && (
          <>
            {accountIsUnconfigured ? (
              <TrayAnalysisUnconfigured accountId={activeAdAccountId} />
            ) : (
              <TrayAnalysisConfigured accountId={activeAdAccountId} />
            )}
            <Divider />
          </>
        )}

        {/* ── Approved Actions ──────────────────────────────────────── */}
        <TraySection title="Approved Actions" count={approvedUndone.length} accentColor="bg-emerald-400">
          {allApproved.length === 0 ? (
            <EmptySlot
              message="Approve a recommendation to start"
              nudgeLabel="Go to Recommendations"
              nudgeTo="/app/listen/recommendations"
            />
          ) : (
            <>
              {approvedGroups.map((g) => (
                <div key={g.label} className="space-y-1.5">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 px-0.5 mt-1">
                    {g.label}
                  </p>
                  {g.rows.map((item) => (
                    <ApprovedTaskItem key={`${item.scopeId}::${item.cardId}`} item={item} />
                  ))}
                </div>
              ))}
              {ungroupedApproved.map((item) => (
                <ApprovedTaskItem key={`${item.scopeId}::${item.cardId}`} item={item} />
              ))}

              {approvedDone.length > 0 && (
                <div className="mt-1">
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    className="flex items-center gap-1 text-label text-muted-foreground/50 hover:text-foreground/60 transition-colors px-0.5 py-0.5"
                  >
                    {showDone ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Done ({approvedDone.length})
                  </button>
                  {showDone && (
                    <div className="space-y-1.5 mt-1">
                      {approvedDone.map((item) => (
                        <ApprovedTaskItem key={`${item.scopeId}::${item.cardId}`} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <TrayNavLink to="/app/listen/recommendations" label="Recommendations" icon={ClipboardList} />
        </TraySection>

        <Divider />

        {/* ── Hypotheses ready to brief ─────────────────────────────── */}
        <TraySection title="Ready to Brief" count={topHyps.length} accentColor="bg-violet-400">
          {topHyps.length === 0 ? (
            <EmptySlot
              message="No hypotheses queued for briefing"
              nudgeLabel="View hypothesis queue"
              nudgeTo="/app/strategy/hypotheses"
            />
          ) : (
            topHyps.map((hyp) => (
              <TrayItem
                key={hyp.id}
                label={hyp.label}
                sub={hyp.status}
                accent="hypothesis"
                onAction={() => navigate(`/app/briefs/builder?fromHyp=${encodeURIComponent(hyp.id)}&from=strategy`)}
                actionLabel="Create Brief"
              />
            ))
          )}
          <TrayNavLink to="/app/strategy/hypotheses" label="Hypothesis Queue" icon={Sparkles} />
        </TraySection>

        <Divider />

        {/* ── Draft briefs awaiting review ──────────────────────────── */}
        <TraySection title="Briefs Pending" count={pendingDrafts.length} accentColor="bg-chart-1">
          {pendingDrafts.length === 0 ? (
            <EmptySlot
              message="No briefs waiting for review"
              nudgeLabel="Open Brief Builder"
              nudgeTo="/app/briefs/builder"
            />
          ) : (
            pendingDrafts.slice(0, 2).map((brief) => (
              <TrayItem
                key={brief.id}
                label={brief.human_direction}
                sub={`${brief.asset_type} · ${brief.status}`}
                accent="brief"
                onAction={() => navigate("/app/briefs/builder")}
                actionLabel="Review"
              />
            ))
          )}
          <TrayNavLink to="/app/briefs/builder" label="Brief Builder" icon={FileText} />
        </TraySection>

        <Divider />

        {/* ── Top signals ───────────────────────────────────────────── */}
        <TraySection title="Top Signals" count={topSignals.length} accentColor="bg-amber-400">
          {topSignals.length === 0 ? (
            <EmptySlot
              message="No active signals at this time"
              nudgeLabel="View Signal View"
              nudgeTo="/app/listen/signal"
            />
          ) : (
            topSignals.map((sig: SignalCard) => (
              <TrayItem
                key={sig.id}
                label={sig.title}
                sub={`${sig.impact} impact · ${sig.confidence}`}
                accent="signal"
              />
            ))
          )}
          <TrayNavLink to="/app/listen/signal" label="Signal View" icon={AlertCircle} />
        </TraySection>

        <Divider />

        {/* ── Quick module jumps ────────────────────────────────────── */}
        <TraySection title="Quick Jump">
          <div className="space-y-px">
            <TrayNavLink to="/app/analysis/library" label="IAP Library" icon={Zap} />
            <TrayNavLink to="/app/strategy/map" label="Strategy Map" icon={Zap} />
            <TrayNavLink to="/app/mst/matrix" label="MST Matrix" icon={Zap} />
            <TrayNavLink to="/app/reports/new" label="New Report" icon={Zap} />
          </div>
        </TraySection>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/40 bg-white/[0.01]">
        <p className="text-[9px] text-foreground/35 leading-snug">
          Action items update as you work through analysis, strategy &amp; briefs.
        </p>
      </div>
    </div>
  );
}

// ─── Pure count helper (exported for unit tests) ──────────────────────

/** Compute the tray badge count from raw item arrays. All inputs are
 *  pre-sliced to their visible maximums so this stays a pure sum. */
export function computeTrayCount({
  approvedUndone,
  hypotheses,
  signals,
  pendingDrafts,
}: {
  approvedUndone: number;
  hypotheses: unknown[];
  signals: unknown[];
  pendingDrafts: unknown[];
}): number {
  return Math.min(
    approvedUndone +
      Math.min(hypotheses.length, 3) +
      Math.min(signals.length, 2) +
      pendingDrafts.length,
    99
  );
}

/** Badge count for the Topbar toggle — approved-undone + workflow items. */
export function useTaskTrayCount(): number {
  useDecisions();
  const { activeAdAccount } = useAccount();
  const hypotheses = activeAdAccount?.iap?.strategy?.active_hypotheses ?? [];
  const signals = activeAdAccount?.listen?.signal_cards ?? [];
  const drafts = activeAdAccount?.iap?.brief_builder?.draft_briefs ?? [];
  const pendingDrafts = drafts.filter((b) => b.status !== "approved");
  const approvedUndone = getAllApproved().filter((i) => !i.done).length;
  return computeTrayCount({ approvedUndone, hypotheses, signals, pendingDrafts });
}
