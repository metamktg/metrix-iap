// ─── Required-format panel + manual analysis controls ──────────────────
// Two pieces used by the manual-import flow:
//  - RequiredFormatPanel: shows the exact columns a "Performance export
//    (CSV)" upload must contain, straight from the server-side spec, plus
//    a downloadable sample CSV.
//  - AnalysisControls: lets the user pick a date range and explicitly
//    kick off analysis of their staged CSVs. Analysis NEVER runs
//    automatically on upload — this is the only trigger. Polls the latest
//    run until it settles and shows the actual dates covered.

import { useEffect, useRef, useState } from "react";
import {
  useGetManualPerformanceCsvFormat,
  useStartManualAnalysisRun,
  useGetLatestAnalysisRun,
  getGetMetrixSeedQueryKey,
  ApiError,
  type AnalysisRun,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  CalendarRange,
} from "lucide-react";

function RunAnalysisBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary transition-colors",
        disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-primary/25"
      )}
    >
      {children}
    </button>
  );
}

export function RequiredFormatPanel() {
  const { data, isLoading } = useGetManualPerformanceCsvFormat();
  const [open, setOpen] = useState(false);

  const downloadSample = () => {
    if (!data?.sample_csv) return;
    const blob = new Blob([data.sample_csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metrix-performance-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        )}
        <FileText className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        <span className="text-[12px] font-medium text-foreground">
          Required CSV columns for performance uploads
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading || !data ? (
            <p className="text-[11px] text-muted-foreground/60">Loading format spec…</p>
          ) : (
            <>
              <div className="rounded-md border border-border/30 divide-y divide-border/30">
                {data.columns.map((c) => (
                  <div key={c.label} className="flex items-start gap-2 p-2">
                    <span
                      className={cn(
                        "shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        c.required
                          ? "bg-primary/15 text-primary border border-primary/25"
                          : "bg-white/[0.04] text-muted-foreground/70 border border-border/30"
                      )}
                    >
                      {c.required ? "Required" : "Optional"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-foreground">{c.label}</div>
                      <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-0.5">
                        {c.description}
                      </p>
                      {c.aliases.length > 0 && (
                        <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                          Also accepted: {c.aliases.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={downloadSample}
                className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
              >
                <Download className="w-3 h-3" /> Download a sample CSV
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const DATE_RANGES: { id: "7d" | "14d" | "30d" | "all"; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "14d", label: "Last 14 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All uploaded data" },
];

function StatusBadge({ run }: { run: AnalysisRun }) {
  if (run.status === "running") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Running
      </span>
    );
  }
  if (run.status === "success") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Complete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-red-400">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
}

/**
 * Explicit, manual analysis trigger for an account's staged CSVs.
 * Nothing here runs automatically — the user must pick a date range and
 * press "Run analysis". Polls the latest run every 2.5s while running.
 */
export function AnalysisControls({ accountId }: { accountId: string }) {
  const [dateRange, setDateRange] = useState<"7d" | "14d" | "30d" | "all">("30d");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const startMutation = useStartManualAnalysisRun();
  const { data: latest, refetch } = useGetLatestAnalysisRun(accountId);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = latest?.run ?? null;
  const isRunning = run?.status === "running";

  useEffect(() => {
    if (isRunning && !pollRef.current) {
      pollRef.current = setInterval(() => {
        refetch();
      }, 2500);
    }
    if (!isRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRunning, refetch, queryClient]);

  const handleRun = async () => {
    setError(null);
    try {
      await startMutation.mutateAsync({ accountId, data: { date_range: dateRange } });
      await refetch();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start analysis. Check your connection and try again."
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        <span className="text-[11px] font-medium text-foreground">Date range to analyze</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {DATE_RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setDateRange(r.id)}
            disabled={isRunning}
            className={cn(
              "h-8 px-2 rounded-md border text-[11px] font-medium transition-colors",
              dateRange === r.id
                ? "border-primary/40 bg-primary/[0.08] text-primary"
                : "border-border/40 bg-white/[0.02] text-muted-foreground/70 hover:bg-white/[0.04]",
              isRunning && "opacity-50 cursor-not-allowed"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {run ? (
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge run={run} />
            {run.status === "success" && run.date_start && run.date_end && (
              <span className="text-[10px] text-muted-foreground/60 truncate">
                Covers {run.date_start} → {run.date_end} ({run.rows_ingested ?? 0} rows)
              </span>
            )}
            {run.status === "error" && run.error_message && (
              <span className="text-[10px] text-red-400/80 truncate">{run.error_message}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">No analysis has been run yet.</span>
        )}
        <RunAnalysisBtn onClick={handleRun} disabled={isRunning || startMutation.isPending}>
          {isRunning || startMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…
            </>
          ) : (
            <>
              <PlayCircle className="w-3.5 h-3.5" /> Run analysis
            </>
          )}
        </RunAnalysisBtn>
      </div>
      <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
        Analysis only runs when you press this button. It reads your staged uploads and reports
        the exact dates found in the data for the selected range — it will never run on its own.
      </p>
    </div>
  );
}
