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
  Archive,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { useTaskTray } from "@/contexts/TaskTrayContext";
import { useDragResize } from "@/hooks/useDragResize";
import {
  useTrayItems,
  getOpenTrayItems,
  getTrayHistory,
  setTrayItemStatus,
  type ScopedTrayItem,
} from "@/lib/data/trayStore";
import {
  useStartManualAnalysisRun,
  useGetLatestAnalysisRun,
  getGetMetrixSeedQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { SignalCard } from "@/lib/data/seedTypes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/command-deck/components/ui/alert-dialog";

// ─── Helpers ──────────────────────────────────────────────────────────

// Kind label shown on each tray item chip.
const KIND_LABEL = {
  recommendation: "Recommendation",
  hypothesis: "Hypothesis",
  brief: "Brief",
  signal: "Signal",
  custom: "Task",
} as const;

const DATE_PRESETS = [
  { id: "7d" as const, label: "7 days" },
  { id: "14d" as const, label: "14 days" },
  { id: "30d" as const, label: "30 days" },
  { id: "all" as const, label: "All data" },
];

// Left-accent stripe colors keyed to item type
const ACCENT = {
  approved: "before:bg-status-success",
  recommendation: "before:bg-status-success",
  hypothesis: "before:bg-primary",
  brief: "before:bg-chart-1",
  signal: "before:bg-status-warning",
  custom: "before:bg-status-success",
  nav: "",
} as const;

// ─── Resize geometry ────────────────────────────────────────────────────
// Mirrors the sidebar's named-width pattern (EXPANDED_WIDTH / COLLAPSED_WIDTH
// / COLLAPSE_SNAP_WIDTH) but for the right-docked tray, which resizes wider
// than its historical fixed 308px default rather than only toggling between
// two fixed sizes.
const TRAY_CLOSED_WIDTH = 46;
const TRAY_MIN_WIDTH = 260;
const TRAY_DEFAULT_WIDTH = 308;
const TRAY_MAX_WIDTH = 480;
// Drop below this width mid-drag and releasing snaps the tray shut.
const TRAY_COLLAPSE_SNAP_WIDTH = 200;

// ─── Width persistence ──────────────────────────────────────────────────
// Same load/save pattern as the sidebar's collapse preference: the user's
// last resized open width survives a reload instead of resetting to the
// 308px default.

const WIDTH_STORAGE_KEY = "metrix_tray_width";

function loadTrayWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isNaN(n) && n >= TRAY_MIN_WIDTH && n <= TRAY_MAX_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return TRAY_DEFAULT_WIDTH;
}

function saveTrayWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    /* ignore */
  }
}

// ─── Analysis section ─────────────────────────────────────────────────

function TrayAnalysisUnconfigured({ accountId }: { accountId: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="mx-4 rounded-xl border border-border/50 bg-foreground/[0.025] overflow-hidden">
      {/* Header stripe */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30 bg-primary/[0.04]">
        <CalendarRange className="w-3.5 h-3.5 text-interactive/80 shrink-0" />
        <span className="text-caption font-semibold text-foreground/80 flex-1">IAP Analysis</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-status-warning/70 border border-status-warning/25 bg-status-warning/[0.08] rounded px-1.5 py-0.5 leading-none">
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
            className="flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg border border-border/40 bg-foreground/[0.03] text-caption font-medium text-foreground/65 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
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
  const [conversionExportConfirm, setConversionExportConfirm] = useState<{ message: string; files: string[] } | null>(null);
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

  const handleRun = async (confirmConversionExport = false) => {
    setError(null);
    try {
      await startMutation.mutateAsync({
        accountId,
        data: { date_range: dateRange, ...(confirmConversionExport ? { confirm_conversion_export: true } : {}) },
      });
      setConversionExportConfirm(null);
      await refetch();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errData = err.data as { code?: string; files?: string[]; message?: string } | null;
        if (errData?.code === "conversion_export_confirmation_required") {
          setConversionExportConfirm({
            message: errData.message ?? err.message,
            files: Array.isArray(errData.files) ? errData.files : [],
          });
          return;
        }
      }
      const msg = err instanceof Error ? err.message : "Could not start analysis. Try again.";
      setError(msg);
    }
  };

  return (
    <div className="mx-4 rounded-xl border border-border/50 bg-foreground/[0.025] overflow-hidden">
      {/* Header stripe */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30 bg-primary/[0.04]">
        <CalendarRange className="w-3.5 h-3.5 text-interactive/80 shrink-0" />
        <span className="text-caption font-semibold text-foreground/80 flex-1">Run Analysis</span>
        {run?.status === "success" && (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-status-success">
            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
          </span>
        )}
        {run?.status === "running" && (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-status-warning">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        )}
        {run?.status === "error" && (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-status-danger">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5">
        {/* Last run summary */}
        {run?.status === "success" && run.date_start && run.date_end && (
          <div className="text-label text-muted-foreground/75 bg-status-success/[0.05] border border-status-success/15 rounded-lg px-2.5 py-1.5 leading-snug">
            <span className="text-status-success/80 font-medium">Last run:</span>{" "}
            {run.date_start} → {run.date_end}
            {run.rows_ingested != null && (
              <span className="text-muted-foreground/75"> · {run.rows_ingested} rows</span>
            )}
          </div>
        )}
        {run?.status === "error" && run.error_message && (
          <div className="text-label text-status-danger/80 bg-status-danger/[0.05] border border-status-danger/15 rounded-lg px-2.5 py-1.5 leading-snug line-clamp-2">
            {run.error_message}
          </div>
        )}

        {/* Date range label */}
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/75">
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
                  : "border-border/35 bg-foreground/[0.02] text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground/75",
                isRunning && "opacity-40 cursor-not-allowed"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-label text-status-danger leading-snug">{error}</p>
        )}

        {/* Run / Re-run button — de-emphasised when recently run */}
        {recentlyRun && !isRunning ? (
          /* Subtle secondary link when within 28-day freshness window */
          (<button
            onClick={() => void handleRun()}
            disabled={startMutation.isPending}
            className="w-full flex items-center justify-center gap-1.5 h-7 rounded-lg border border-border/30 bg-foreground/[0.02] text-caption font-medium text-muted-foreground/75 hover:text-foreground/80 hover:bg-foreground/[0.05] hover:border-border/50 transition-colors"
          >
            {startMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting…</>
            ) : (
              <><RotateCcw className="w-3.5 h-3.5" /> Re-run analysis</>
            )}
          </button>)
        ) : (
          /* Primary CTA — first run, failed, or stale (> 28 days) */
          (<button
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
          </button>)
        )}

        {/* Upload link */}
        <UploadDataLink accountId={accountId} />
      </div>

      <AlertDialog
        open={!!conversionExportConfirm}
        onOpenChange={(open) => { if (!open) setConversionExportConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This looks like a conversion export, not a delivery export</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{conversionExportConfirm?.message}</span>
              {conversionExportConfirm && conversionExportConfirm.files.length > 0 && (
                <span className="block text-label text-muted-foreground/80">
                  Affected file{conversionExportConfirm.files.length !== 1 ? "s" : ""}: {conversionExportConfirm.files.join(", ")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRun(true)}>
              Run anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadDataLink({ accountId }: { accountId: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(`/app/account?account=${accountId}`)}
      className="w-full flex items-center gap-1.5 text-label text-muted-foreground/75 hover:text-foreground/70 transition-colors justify-center py-0.5"
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
      <div className="flex items-center gap-1.5 mb-[0px] ml-[4px] text-[17px]">
        {accentColor && (
          <span className={cn("w-1 h-3 rounded-full shrink-0", accentColor)} />
        )}
        <span className="font-bold uppercase tracking-[0.18em] text-muted-foreground/75 text-[17px]">
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
        "relative rounded-lg border bg-foreground/[0.03] px-2.5 py-2 pl-[14px] pt-[4px] pb-[14px] space-y-1.5",
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
      <p className="font-medium text-foreground/90 line-clamp-2 text-[15px] pt-[4px] pb-[4px] mb-[10px] mt-[0px] pr-[40px]">{label}</p>
      {sub && (
        <span className="inline-block font-semibold uppercase tracking-wide bg-foreground/[0.06] border border-border/30 rounded px-1.5 py-0.5 text-foreground/55 text-[15px]">
          {sub}
        </span>
      )}
      {onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1 font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded px-2 py-0.5 transition-colors text-[16px] pb-[4px] pt-[4px] pl-[8px] pr-[8px] ml-[2px] mr-[2px] mt-[4px] mb-[4px]"
        >
          {actionLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </TrayCard>
  );
}

function TrayTaskItem({ item }: { item: ScopedTrayItem }) {
  const [, navigate] = useLocation();
  const { scopeId, id, kind, title, sub, href, status } = item;
  const settled = status !== "open";
  return (
    <TrayCard accent={kind} muted={settled}>
      <div className="flex items-start gap-2">
        {status === "open" && (
          <button
            onClick={() => setTrayItemStatus(scopeId, id, "done")}
            aria-label="Mark complete"
            title="Mark complete"
            className="mt-0.5 w-4 hit-target-24 h-4 rounded border border-border/50 text-transparent hover:border-status-success/60 hover:bg-status-success/5 hover:text-status-success/60 flex items-center justify-center shrink-0 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-body font-medium leading-tight",
              status === "done"
                ? "text-foreground/55 line-through"
                : status === "archived"
                  ? "text-foreground/55"
                  : "text-foreground/90",
              href && !settled && "cursor-pointer hover:text-interactive transition-colors"
            )}
            onClick={href && !settled ? () => navigate(href) : undefined}
          >
            {title}
          </p>
          {sub && !settled && (
            <p className="text-label text-foreground/60 mt-0.5 leading-snug line-clamp-2">{sub}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[8px] font-semibold border border-border/30 bg-foreground/[0.05] px-1.5 py-0.5 rounded text-foreground/55 leading-none">
              {KIND_LABEL[kind]}
            </span>
            {settled && (
              <span
                className={cn(
                  "text-[8px] font-semibold px-1.5 py-0.5 rounded leading-none border",
                  status === "done"
                    ? "border-status-success/20 bg-status-success/[0.07] text-status-success/80"
                    : "border-border/30 bg-foreground/[0.04] text-muted-foreground/75"
                )}
              >
                {status === "done" ? "Completed" : "Archived"}
              </span>
            )}
          </div>
        </div>

        {status === "open" ? (
          <div className="flex flex-col items-center gap-1 shrink-0">
            {href && (
              <button
                onClick={() => navigate(href)}
                title="Open source"
                aria-label={`Open source of "${title}"`}
                className="w-5 hit-target-24 h-5 rounded flex items-center justify-center text-muted-foreground/75 hover:text-interactive hover:bg-foreground/5 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setTrayItemStatus(scopeId, id, "archived")}
              title="Archive"
              aria-label={`Archive "${title}"`}
              className="w-5 hit-target-24 h-5 rounded flex items-center justify-center text-muted-foreground/75 hover:text-muted-foreground hover:bg-foreground/5 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setTrayItemStatus(scopeId, id, "open")}
            title="Move back to tray"
            aria-label={`Move "${title}" back to tray`}
            className="w-5 hit-target-24 h-5 rounded flex items-center justify-center text-muted-foreground/75 hover:text-muted-foreground hover:bg-foreground/5 transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
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
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/[0.04] transition-colors text-left min-w-0 text-[14px] font-semibold"
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/75" />}
      <span className="truncate font-extrabold text-[18px] text-metrix-cyan bg-metrix-panel border-t-[3px] border-r-[3px] border-b-[3px] border-l-[3px] rounded-tl-[8px] rounded-tr-[8px] rounded-br-[8px] rounded-bl-[8px] opacity-[0.94] ml-[14px] mr-[14px] mt-[8px] mb-[8px] pt-[8px] pb-[8px] pl-[20px] pr-[20px] border-t-[color:var(--color-sky-500)] border-r-[color:var(--color-sky-500)] border-b-[color:var(--color-sky-500)] border-l-[color:var(--color-sky-500)]">{label}</span>
      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40 shrink-0" />
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
      <p className="text-foreground/55 text-[15px]">{message}</p>
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
  useTrayItems();
  const { open, toggle, close } = useTaskTray();
  const { activeAdAccount, activeAdAccountId, selectedAccountType } = useAccount();
  const [, navigate] = useLocation();
  const [showHistory, setShowHistory] = useState(false);

  // Persisted open width — restores the user's last resized size on reload
  // instead of always resetting to the 308px default.
  const [width, setWidth] = useState(loadTrayWidth);
  // Live width while a drag is in progress — overrides the width transition
  // so the panel visibly tracks the pointer. Cleared on release once we've
  // committed to a resized/closed state.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const baseWidthRef = useRef(width);
  // Mirrors dragWidth state so onDragEnd can read the final value directly
  // instead of reaching for it via a setState updater — updaters must stay
  // pure, and closing the tray / persisting the width are side effects.
  const dragWidthRef = useRef<number | null>(null);

  // Drag handle on the tray's left edge. Dragging left (negative dx) grows
  // the tray toward TRAY_MAX_WIDTH; dragging right shrinks it, and
  // releasing below TRAY_COLLAPSE_SNAP_WIDTH snaps the tray shut — mirroring
  // the sidebar's clamp/snap-to-collapse behaviour.
  const handlePointerDown = useDragResize(
    (dx) => {
      const next = Math.min(
        TRAY_MAX_WIDTH,
        Math.max(TRAY_COLLAPSE_SNAP_WIDTH - 40, baseWidthRef.current - dx)
      );
      dragWidthRef.current = next;
      setDragWidth(next);
    },
    (wasDragged) => {
      if (!wasDragged) return;
      const fw = dragWidthRef.current ?? width;
      dragWidthRef.current = null;
      if (fw < TRAY_COLLAPSE_SNAP_WIDTH) {
        close();
      } else {
        const clamped = Math.min(TRAY_MAX_WIDTH, Math.max(TRAY_MIN_WIDTH, fw));
        setWidth(clamped);
        saveTrayWidth(clamped);
      }
      setDragWidth(null);
    }
  );
  const onHandlePointerDown = (e: React.PointerEvent) => {
    baseWidthRef.current = width;
    handlePointerDown(e);
  };

  const isAdAccountView = selectedAccountType === "ad_account" && !!activeAdAccountId;

  const hypotheses = activeAdAccount?.iap?.strategy?.active_hypotheses ?? [];
  const signals = activeAdAccount?.listen?.signal_cards ?? [];
  const drafts = activeAdAccount?.iap?.brief_builder?.draft_briefs ?? [];

  const pendingDrafts = drafts.filter((b) => b.status !== "approved");
  const topHyps = hypotheses.slice(0, 3);
  const topSignals = signals.slice(0, 2);

  // Items the user explicitly added to their tray ("Add to Tray" across the
  // platform), scoped to the active ad account when one is selected.
  const trayScope = isAdAccountView ? activeAdAccountId : undefined;
  const openItems = getOpenTrayItems(trayScope);
  const historyItems = getTrayHistory(trayScope);

  const workflowCount = topHyps.length + topSignals.length + pendingDrafts.length;
  const totalItems = openItems.length + workflowCount;

  const hasPriorityItems = openItems.length > 0;
  const accountIsUnconfigured = isAdAccountView && activeAdAccount?.status !== "configured";

  // A single persistent wrapper (rather than two early-returned subtrees)
  // so the width change between closed/open animates smoothly instead of
  // snapping — the same approach the sidebar uses for its collapsed/
  // expanded <aside>. Live drag width overrides the CSS transition so the
  // panel visibly tracks the pointer while dragging.
  const currentWidth = open ? dragWidth ?? width : TRAY_CLOSED_WIDTH;

  return (
    <div
      data-open={open}
      className={cn(
        "relative shrink-0 border-l-2 bg-surface-sidebar flex flex-col overflow-hidden",
        open ? "border-border/60" : "border-border/50",
        dragWidth == null && "transition-[width] duration-200 ease-out"
      )}
      style={{ width: currentWidth }}
    >
      {/* Slide-to-resize handle — drag left to grow the tray (up to
          TRAY_MAX_WIDTH), drag right to shrink it; releasing below
          TRAY_COLLAPSE_SNAP_WIDTH snaps the tray shut. Only present while
          the tray is open — there's nothing to resize when collapsed. */}
      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Task tray resize handle"
          title="Drag to resize"
          onPointerDown={onHandlePointerDown}
          className="absolute top-0 left-0 h-full w-1.5 -ml-0.5 z-10 cursor-col-resize group/handle flex items-center justify-center"
        >
          <span className="w-px h-full bg-transparent group-hover/handle:bg-primary/40 transition-colors" />
        </div>
      )}
      {!open ? (
        // ── Minimized strip ────────────────────────────────────────────
        (<div className="flex-1 flex flex-col items-center py-3 gap-2 min-w-0">
          <button
            onClick={toggle}
            title="Expand task tray"
            aria-label="Expand task tray"
            className="flex flex-col items-center gap-2 w-full px-1 text-muted-foreground/75 hover:text-primary transition-colors group"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-foreground/[0.05] border border-border/40 group-hover:bg-foreground/[0.08] border-t-[0px] border-r-[0px] border-b-[0px] border-l-[0px]">
                <ClipboardList
                  className={cn(
                    "w-4 h-4 transition-transform group-hover:scale-110",
                    hasPriorityItems ? "text-status-success" : "text-muted-foreground/75"
                  )}
                />
              </div>
              {totalItems > 0 && (
                <span className={cn(
                  "absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none px-1 tabular-nums border",
                  hasPriorityItems
                    ? "bg-status-success text-foreground border-status-success/50"
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
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/75" />
          </div>
          <button
            onClick={toggle}
            title="Expand"
            aria-label="Expand task tray"
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground/75 hover:text-primary hover:bg-foreground/[0.05] transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>)
      ) : (
      <>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-foreground/[0.02]">
        <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <ClipboardList className="w-4 h-4 text-interactive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label font-mono text-muted-foreground/75 uppercase tracking-widest leading-none mb-0.5 truncate">
            Workflow
          </p>
          <p className="text-title font-semibold text-foreground leading-tight truncate">
            {totalItems === 0
              ? "All caught up"
              : `${totalItems} action${totalItems !== 1 ? "s" : ""} pending`}
          </p>
        </div>
        <button
          onClick={close}
          aria-label="Close task tray"
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.06] transition-colors shrink-0"
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

        {/* ── My Tray — user-added actionable items ─────────────────── */}
        <TraySection title="My Tray" count={openItems.length} accentColor="bg-status-success">
          {openItems.length === 0 ? (
            <EmptySlot
              message='Nothing in your tray yet. Use "Add to Tray" on recommendations, hypotheses, and briefs as you browse.'
              nudgeLabel="Go to Recommendations"
              nudgeTo="/app/listen/recommendations"
            />
          ) : (
            openItems.map((item) => (
              <TrayTaskItem key={`${item.scopeId}::${item.id}`} item={item} />
            ))
          )}

          {historyItems.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1 text-label text-muted-foreground/75 hover:text-foreground/60 transition-colors px-0.5 py-0.5"
              >
                {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                History ({historyItems.length})
              </button>
              {showHistory && (
                <div className="space-y-1.5 mt-1">
                  {historyItems.map((item) => (
                    <TrayTaskItem key={`${item.scopeId}::${item.id}`} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}
          <TrayNavLink to="/app/listen/recommendations" label="Recommendations" icon={ClipboardList} />
        </TraySection>

        <Divider />

        {/* ── Hypotheses ready to brief ─────────────────────────────── */}
        <TraySection title="Ready to Brief" count={topHyps.length} accentColor="bg-primary">
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
        <TraySection title="Top Signals" count={topSignals.length} accentColor="bg-status-warning">
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
      <div className="px-4 py-2.5 border-t border-border/40 bg-foreground/[0.01]">
        <p className="text-[9px] text-foreground/55 leading-snug">
          Action items update as you work through analysis, strategy &amp; briefs.
        </p>
      </div>
      </>
      )}
    </div>
  );
}

// ─── Pure count helper (exported for unit tests) ──────────────────────

/** Compute the tray badge count from raw item arrays. All inputs are
 *  pre-sliced to their visible maximums so this stays a pure sum. */
export function computeTrayCount({
  openTrayItems,
  hypotheses,
  signals,
  pendingDrafts,
}: {
  openTrayItems: number;
  hypotheses: unknown[];
  signals: unknown[];
  pendingDrafts: unknown[];
}): number {
  return Math.min(
    openTrayItems +
      Math.min(hypotheses.length, 3) +
      Math.min(signals.length, 2) +
      pendingDrafts.length,
    99
  );
}

/** Badge count for the Topbar toggle — open tray items + workflow items. */
export function useTaskTrayCount(): number {
  useTrayItems();
  const { activeAdAccount, activeAdAccountId, selectedAccountType } = useAccount();
  const hypotheses = activeAdAccount?.iap?.strategy?.active_hypotheses ?? [];
  const signals = activeAdAccount?.listen?.signal_cards ?? [];
  const drafts = activeAdAccount?.iap?.brief_builder?.draft_briefs ?? [];
  const pendingDrafts = drafts.filter((b) => b.status !== "approved");
  const scope =
    selectedAccountType === "ad_account" && activeAdAccountId ? activeAdAccountId : undefined;
  const openTrayItems = getOpenTrayItems(scope).length;
  return computeTrayCount({ openTrayItems, hypotheses, signals, pendingDrafts });
}
