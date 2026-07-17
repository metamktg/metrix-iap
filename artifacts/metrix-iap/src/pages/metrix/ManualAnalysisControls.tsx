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
  useListManualImports,
  useUpdateManualImportAdNames,
  getGetMetrixSeedQueryKey,
  getListManualImportsQueryKey,
  ApiError,
  type AnalysisRun,
  type ManualImport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  AlertTriangle,
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

export type IapCsvClassKey = "demographic" | "device_placement";

const CSV_CLASS_TITLES: Record<IapCsvClassKey, string> = {
  demographic: "Demographics CSV",
  device_placement: "Placements CSV",
};

/**
 * Shows the exact breakdown + metric columns one CSV class must contain,
 * straight from the server-side spec, plus a downloadable sample CSV.
 * Used once per required CSV (Demographics, Placements) in the upload flow.
 */
export function RequiredFormatPanel({ csvClass }: { csvClass: IapCsvClassKey }) {
  const { data, isLoading } = useGetManualPerformanceCsvFormat();
  const [open, setOpen] = useState(false);
  const classData = data?.[csvClass];

  const downloadSample = () => {
    if (!classData?.sample_csv) return;
    const blob = new Blob([classData.sample_csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metrix-${csvClass}-sample.csv`;
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
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
        )}
        <FileText className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
        <span className="text-[12px] font-medium text-foreground">
          Required columns — {CSV_CLASS_TITLES[csvClass]}
          {classData?.report_name ? ` (${classData.report_name})` : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading || !classData ? (
            <p className="text-[11px] text-muted-foreground/80">Loading format spec…</p>
          ) : (
            <>
              <div className="rounded-md border border-border/30 p-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-1">
                  Breakdown columns
                </div>
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                  {classData.breakdown_columns.join(", ")}
                </p>
              </div>
              <div className="rounded-md border border-border/30 divide-y divide-border/30">
                {classData.metric_groups.map((g) => (
                  <div key={g.name} className="flex items-start gap-2 p-2">
                    <span
                      className={cn(
                        "shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        g.required
                          ? "bg-primary/15 text-primary border border-primary/25"
                          : "bg-white/[0.04] text-muted-foreground/85 border border-border/30"
                      )}
                    >
                      {g.required ? "Required" : "Optional"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-foreground">{g.name}</div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed mt-0.5">
                        {g.columns.join(", ")}
                      </p>
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

/** A staged creative counts as "needs review" when its persisted match was a low-confidence guess the user hasn't confirmed or overridden yet. */
export function guessedCreativeImports(imports: ManualImport[]): ManualImport[] {
  return imports.filter((i) => i.kind === "creative_asset" && i.match_method === "guess");
}

/**
 * Amber callout warning that N staged creative filename→ad mappings are
 * still low-confidence guesses. Actionable, never blocking: the user can
 * confirm all guesses as correct (re-saves each mapping without the guess
 * flag, so it stops being flagged) or jump back to fix them. Shared by the
 * manual-upload Review step and the "Run analysis" control.
 */
export function GuessedMatchesCallout({
  accountId,
  guessedImports,
  onConfirmed,
  onReview,
  reviewLabel,
}: {
  accountId: string;
  guessedImports: ManualImport[];
  /** Called after all guesses are confirmed so the parent can refetch the imports list. */
  onConfirmed?: () => void;
  /** Optional "jump back to fix" action (e.g. return to the upload step). */
  onReview?: () => void;
  reviewLabel?: string;
}) {
  const updateMutation = useUpdateManualImportAdNames();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (guessedImports.length === 0) return null;
  const count = guessedImports.length;
  const plural = count > 1;

  const confirmAll = async () => {
    setError(null);
    setConfirming(true);
    try {
      // Re-saving ad_names WITHOUT match_method clears the persisted guess
      // flag server-side (same path a manual override takes) — confirming
      // is an explicit "yes, these are right" acknowledgement.
      for (const imp of guessedImports) {
        await updateMutation.mutateAsync({ accountId, importId: imp.id, data: { ad_names: imp.ad_names } });
      }
      onConfirmed?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not confirm matches. Please try again."
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <div className="text-[12px] font-semibold text-amber-200">
            {count} creative {plural ? "matches need" : "match needs"} review
          </div>
          <p className="text-[11px] text-amber-100/80 leading-relaxed">
            {plural ? "These filenames" : "This filename"} didn't clearly match an ad name, so we
            picked the most likely one as a best guess. Confirm {plural ? "they're" : "it's"} right
            or fix {plural ? "them" : "it"} first — otherwise analysis may link the wrong creative to
            an ad.
          </p>
          <ul className="text-[10px] text-amber-100/70 leading-relaxed space-y-0.5 pt-0.5">
            {guessedImports.map((imp) => (
              <li key={imp.id} className="truncate">
                <span className="text-amber-100/90">{imp.filename}</span>
                {imp.ad_names.length > 0 ? ` → ${imp.ad_names.join(", ")}` : " → unmapped"}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        <button
          onClick={() => void confirmAll()}
          disabled={confirming || updateMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors",
            confirming || updateMutation.isPending
              ? "border-amber-400/30 text-amber-200/60 cursor-not-allowed"
              : "bg-amber-400/15 border-amber-400/40 text-amber-100 hover:bg-amber-400/25"
          )}
        >
          {confirming ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Confirming…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3" /> Confirm {plural ? `all ${count} matches` : "match"} as correct
            </>
          )}
        </button>
        {onReview && (
          <button
            onClick={onReview}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-amber-400/30 text-[11px] font-medium text-amber-100/85 hover:bg-amber-400/10 transition-colors"
          >
            {reviewLabel ?? "Review & fix"}
          </button>
        )}
      </div>
    </div>
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
  const { toast } = useToast();
  const startMutation = useStartManualAnalysisRun();
  const { data: latest, refetch } = useGetLatestAnalysisRun(accountId);
  const { data: importsData, refetch: refetchImports } = useListManualImports(accountId);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const guessedImports = guessedCreativeImports(importsData?.imports ?? []);

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
      // This branch only fires when a run we were polling settles, so the
      // toast reports a real transition — never a run that finished before
      // this screen mounted.
      const settled = latest?.run;
      if (settled?.status === "success") {
        toast({
          title: "Analysis complete",
          description:
            settled.date_start && settled.date_end
              ? `Covers ${settled.date_start} \u2192 ${settled.date_end} (${settled.rows_ingested ?? 0} rows). Data refreshed.`
              : "Data refreshed.",
        });
      } else if (settled?.status === "error") {
        toast({
          title: "Analysis failed",
          description: settled.error_message ?? "The run ended with an error.",
          variant: "destructive",
        });
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRunning, refetch, queryClient, latest, toast]);

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
        <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
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
                : "border-border/40 bg-white/[0.02] text-muted-foreground/85 hover:bg-white/[0.04]",
              isRunning && "opacity-50 cursor-not-allowed"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <GuessedMatchesCallout
        accountId={accountId}
        guessedImports={guessedImports}
        onConfirmed={() => void refetchImports()}
      />

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {run ? (
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge run={run} />
            {run.status === "success" && run.date_start && run.date_end && (
              <span className="text-[10px] text-muted-foreground/80 truncate">
                Covers {run.date_start} → {run.date_end} ({run.rows_ingested ?? 0} rows)
              </span>
            )}
            {run.status === "error" && run.error_message && (
              <span className="text-[10px] text-red-400/80 truncate">{run.error_message}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/75">No analysis has been run yet.</span>
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
      <p className="text-[10px] text-muted-foreground/75 leading-relaxed">
        Analysis only runs when you press this button. It reads your staged uploads and reports
        the exact dates found in the data for the selected range — it will never run on its own.
      </p>
    </div>
  );
}
