// @refresh reset
// ─── Required-format panel + manual analysis controls ──────────────────
// Two pieces used by the manual-import flow:
//  - RequiredFormatPanel: shows the exact columns a "Performance export"
//    upload must contain, straight from the server-side spec, plus
//    a downloadable sample CSV. Accepted upload formats are CSV (preferred)
//    or XLSX — same required columns either way, only the container differs.
//  - AnalysisControls: lets the user pick a date range and explicitly
//    kick off analysis of their staged CSVs. Analysis NEVER runs
//    automatically on upload — this is the only trigger. Polls the latest
//    run until it settles and shows the actual dates covered.

import { useEffect, useRef, useState } from "react";
import {
  useGetManualPerformanceCsvFormat,
  useStartManualAnalysisRun,
  useGetLatestAnalysisRun,
  useGetAnalysisCompleteness,
  getGetAnalysisCompletenessQueryKey,
  getGetAccountStageStatusQueryKey,
  useListAnalysisRuns,
  useListManualImports,
  useUpdateManualImportAdNames,
  useSyncCreativeLinks,
  useRestageManualImportsForRun,
  getGetMetrixSeedQueryKey,
  getListManualImportsQueryKey,
  ApiError,
  type AnalysisRun,
  type ManualImport,
  type ColumnAliasEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@workspace/command-deck/hooks/use-toast";
import { guessedCreativeImports } from "./manualImportUtils";
import { ImportConfidenceReport } from "./ImportConfidenceReport";
import { InfoTooltip, DetailReveal, DenseText } from "./shared";
import { cn } from "@workspace/command-deck/lib/utils";
import { CsvWarningsPanel } from "@/components/analysis/CsvWarningsPanel";
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
  RefreshCw,
  Images,
  History,
  Info,
} from "lucide-react";

function RunAnalysisBtn({
  onClick,
  disabled,
  warning,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  /** When true, uses amber "run anyway" styling to signal elevated risk. */
  warning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 h-8 px-3 rounded-md border text-caption font-medium transition-colors",
        warning
          ? "bg-status-warning/15 border-status-warning/40 text-status-warning"
          : "bg-primary/15 border-primary/30 text-interactive",
        disabled
          ? "opacity-60 cursor-not-allowed"
          : warning
          ? "hover:bg-status-warning/25"
          : "hover:bg-primary/25"
      )}
    >
      {children}
    </button>
  );
}

export type IapCsvClassKey = "demographic" | "device_placement" | "ad_summary" | "conversion_device";

// Labels the required-columns panel by report, not by file format — the
// same columns are required whether the export arrives as CSV (preferred)
// or XLSX; only the container differs.
const CSV_CLASS_TITLES: Record<IapCsvClassKey, string> = {
  demographic: "Demographics",
  device_placement: "Placements",
  ad_summary: "Ad Summary",
  conversion_device: "Conversion Device",
};

/**
 * Expandable reference guide showing which column name variants the CSV parser
 * accepts for the most commonly misnamed columns. Data comes from the API
 * (server derives it from COLUMN_ALIASES in iapCsvSpec.ts — no client-side
 * duplication of the alias map).
 */
function ColumnAliasGuide({
  aliases,
  open,
  onToggle,
}: {
  aliases: ColumnAliasEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  if (aliases.length === 0) return null;
  return (
    <div className="rounded-md border border-border/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        )}
        <span className="text-caption font-medium text-foreground/85">
          Accepted column name variants
        </span>
        <span className="ml-auto text-label text-muted-foreground/55">
          common Meta UI aliases
        </span>
      </button>
      {open && (
        <div className="border-t border-border/30 divide-y divide-border/20">
          {aliases.map(({ canonical, aliases: aliasList }) => (
            <div key={canonical} className="px-2.5 py-2 space-y-1">
              <div className="text-label font-semibold text-foreground/70 uppercase tracking-wide">
                {canonical}
              </div>
              <div className="flex flex-wrap gap-1">
                {aliasList.map((alias) => (
                  <span
                    key={alias}
                    className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-border/30 text-label text-muted-foreground/80 font-mono"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="px-2.5 py-2 text-label text-muted-foreground/45 leading-relaxed">
            The parser accepts these automatically — no need to rename columns before uploading.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Shows the exact breakdown + metric columns one CSV class must contain,
 * straight from the server-side spec, plus a downloadable sample CSV.
 * Used once per required CSV (Demographics, Placements) in the upload flow.
 */
export function RequiredFormatPanel({ csvClass }: { csvClass: IapCsvClassKey }) {
  const { data, isLoading } = useGetManualPerformanceCsvFormat();
  const [open, setOpen] = useState(false);
  const [aliasesOpen, setAliasesOpen] = useState(false);
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
        <span className="text-body font-medium text-foreground">
          Required columns — {CSV_CLASS_TITLES[csvClass]}
          {classData?.report_name ? ` (${classData.report_name})` : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {isLoading || !classData ? (
            <p className="text-caption text-muted-foreground/80">Loading format spec…</p>
          ) : (
            <>
              <p className="text-label text-muted-foreground/70">
                Upload as CSV (preferred) or XLSX — same required columns either way.
              </p>
              <div className="rounded-md border border-border/30 p-2">
                <div className="text-label font-semibold uppercase tracking-wide text-muted-foreground/80 mb-1">
                  Breakdown columns
                </div>
                <DenseText
                  text={classData.breakdown_columns.join(", ")}
                  className="text-caption text-foreground/80 leading-relaxed"
                  threshold={80}
                />
              </div>
              <div className="rounded-md border border-border/30 divide-y divide-border/30">
                {classData.metric_groups.map((g) => (
                  <div key={g.name} className="flex items-start gap-2 p-2">
                    <span
                      className={cn(
                        "shrink-0 text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        g.required
                          ? "bg-primary/15 text-interactive border border-primary/25"
                          : "bg-white/[0.04] text-muted-foreground/85 border border-border/30"
                      )}
                    >
                      {g.required ? "Required" : "Optional"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-caption font-medium text-foreground">{g.name}</div>
                      <DenseText
                        text={g.columns.join(", ")}
                        className="text-label text-muted-foreground/80 leading-relaxed mt-0.5"
                        threshold={80}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={downloadSample}
                className="flex items-center gap-1.5 text-caption font-medium text-interactive hover:underline"
              >
                <Download className="w-3.5 h-3.5" /> Download a sample CSV
              </button>

              {/* ── Accepted column name variants ─────────────────── */}
              {classData && (
                <ColumnAliasGuide
                  aliases={data?.column_aliases ?? []}
                  open={aliasesOpen}
                  onToggle={() => setAliasesOpen((v) => !v)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export type AnalysisDateRange = "7d" | "14d" | "30d" | "all";

export const DATE_RANGES: { id: AnalysisDateRange; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "14d", label: "Last 14 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All uploaded data" },
];


/**
 * Non-blocking objective coverage notices from a completed run: configured
 * objectives skipped because their columns were absent (nothing fabricated),
 * and detected column groups whose objective isn't configured (a suggestion
 * — never auto-enabled). Mirrors CsvWarningsPanel's amber pattern but in
 * neutral blue: informational, the run itself succeeded.
 */
function ObjectiveFlagsPanel({ run }: { run: AnalysisRun }) {
  const [expanded, setExpanded] = useState(false);
  const flags = run.objective_flags;
  if (!flags || flags.length === 0) return null;
  const count = flags.length;

  return (
    <div className="rounded-lg border border-sky-400/30 bg-sky-400/[0.06] p-3 space-y-2">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-start gap-2 text-left">
        <AlertTriangle className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-caption font-semibold text-sky-200">Objective coverage notices</div>
          <p className="text-label text-sky-100/70 mt-0.5">
            {count} {count === 1 ? "notice" : "notices"} about configured objectives vs the data in this run — nothing was blocked, fabricated, or auto-enabled.{" "}
            <span className="underline cursor-pointer">{expanded ? "Hide" : "Show"} details</span>
          </p>
        </div>
      </button>
      {expanded && (
        <ul className="space-y-1 pt-1 border-t border-sky-400/20">
          {flags.map((f, i) => (
            <li key={i} className="text-label text-sky-100/75 leading-relaxed">
              · {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ run }: { run: AnalysisRun }) {
  if (run.status === "running") {
    return (
      <span className="flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-status-warning">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
      </span>
    );
  }
  if (run.status === "success") {
    return (
      <span className="flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Complete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-red-400">
      <XCircle className="w-3.5 h-3.5" /> Failed
    </span>
  );
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
    <div className="rounded-lg border border-status-warning/30 bg-status-warning/[0.06] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <div className="text-body font-semibold text-status-warning">
            {count} creative {plural ? "matches need" : "match needs"} review
          </div>
          <p className="text-caption text-status-warning/80 leading-relaxed">
            {plural ? "These filenames" : "This filename"} didn't clearly match an ad name, so we
            picked the most likely one as a best guess. Confirm {plural ? "they're" : "it's"} right
            or fix {plural ? "them" : "it"} first — otherwise analysis may link the wrong creative to
            an ad.
          </p>
          <ul className="text-label text-status-warning/70 leading-relaxed space-y-0.5 pt-0.5">
            {guessedImports.map((imp) => (
              <li key={imp.id} className="truncate">
                <span className="text-status-warning/90">{imp.filename}</span>
                {imp.ad_names.length > 0 ? ` → ${imp.ad_names.join(", ")}` : " → unmapped"}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {error && <p className="text-caption text-red-400">{error}</p>}
      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        <button
          onClick={() => void confirmAll()}
          disabled={confirming || updateMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-caption font-medium transition-colors",
            confirming || updateMutation.isPending
              ? "border-status-warning/30 text-status-warning/60 cursor-not-allowed"
              : "bg-status-warning/15 border-status-warning/40 text-status-warning hover:bg-status-warning/25"
          )}
        >
          {confirming ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm {plural ? `all ${count} matches` : "match"} as correct
            </>
          )}
        </button>
        {onReview && (
          <button
            onClick={onReview}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-status-warning/30 text-caption font-medium text-status-warning/85 hover:bg-status-warning/10 transition-colors"
          >
            {reviewLabel ?? "Review & fix"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shows creative linkage status after a completed analysis run.
 * - Green when all mapped creatives are linked.
 * - Amber when some names couldn't be matched (mismatched ad_names).
 * - Includes a "Re-sync" button to retry linking without re-running analysis.
 */
// ─── Analysis completeness report ───────────────────────────────────────
// Server-verified per-surface check that every analysis module (metric
// tiles, concepts, demographics, placements, platforms, devices, creative
// library) actually received data for the latest run. Gaps are surfaced
// explicitly — never a silent empty view. Strategy readiness gates on the
// same server computation.
function CompletenessPanel({ accountId, runId }: { accountId: string; runId: string | null }) {
  const { data, isLoading } = useGetAnalysisCompleteness(accountId, {
    query: {
      // Keyed by run id so a fresh run always re-verifies.
      queryKey: [...getGetAnalysisCompletenessQueryKey(accountId), runId ?? "account"],
    },
  });
  if (isLoading || !data) return null;
  const gaps = data.surfaces.filter((s) => s.required && !s.ok);
  return (
    <div
      data-testid="analysis-completeness-panel"
      className={cn(
        "rounded-lg border p-3 space-y-2",
        data.complete ? "border-emerald-400/25 bg-emerald-400/[0.05]" : "border-status-warning/30 bg-status-warning/[0.06]",
      )}
    >
      <div className="flex items-center gap-2">
        {data.complete ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0" />
        )}
        <span className={cn("text-caption font-semibold", data.complete ? "text-emerald-200" : "text-status-warning")}>
          {data.complete
            ? "Analysis validated — every module received data"
            : `Analysis incomplete — ${gaps.length} module${gaps.length !== 1 ? "s" : ""} missing data`}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {data.surfaces.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 min-w-0">
            {s.ok ? (
              <CheckCircle2 className={cn("w-3 h-3 shrink-0", s.rows > 0 ? "text-emerald-400/80" : "text-muted-foreground/50")} />
            ) : (
              <XCircle className="w-3 h-3 text-status-warning shrink-0" />
            )}
            <span className={cn("text-label truncate", s.ok ? "text-muted-foreground/80" : "text-status-warning/90")}>
              {s.label}
            </span>
            <span className="text-label tabular-nums text-muted-foreground/50 ml-auto shrink-0">
              {s.rows.toLocaleString()} row{s.rows !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
      {data.surfaces.some((s) => s.note) && (
        <div className="space-y-0.5 pt-0.5">
          {data.surfaces.filter((s) => s.note).map((s) => (
            <p key={s.key} className="text-label text-muted-foreground/60 leading-relaxed">
              {s.label}: {s.note}
            </p>
          ))}
        </div>
      )}
      {!data.complete && (
        <p className="text-label text-status-warning/75 leading-relaxed">
          Strategy stays locked until every required module above has data. Re-run analysis or fix the
          uploaded exports, then check again.
        </p>
      )}
    </div>
  );
}

function CreativeLinkageStatus({
  accountId,
  run,
  onSynced,
}: {
  accountId: string;
  run: AnalysisRun;
  onSynced: () => void;
}) {
  const syncMutation = useSyncCreativeLinks();
  const [syncError, setSyncError] = useState<string | null>(null);

  const linked = run.creatives_linked ?? 0;
  const total = run.creatives_total ?? 0;
  const unlinked = run.creatives_unlinked_names ?? [];

  if (total === 0) return null;

  const allLinked = linked === total && unlinked.length === 0;
  // "No creatives linked at all" is common on first runs when ad names haven't been
  // mapped yet — it's a normal setup step, not a failure. Use neutral framing.
  const noneLinked = linked === 0 && total > 0;

  const handleResync = async () => {
    setSyncError(null);
    try {
      await syncMutation.mutateAsync({ accountId });
      onSynced();
    } catch (err) {
      setSyncError(
        err instanceof ApiError ? err.message : "Re-sync failed. Try again."
      );
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        allLinked
          ? "border-emerald-400/25 bg-emerald-400/[0.04]"
          : noneLinked
          ? "border-border/40 bg-white/[0.02]"
          : "border-status-warning/30 bg-status-warning/[0.06]"
      )}
    >
      <div className="flex items-start gap-2">
        <Images
          className={cn(
            "w-3.5 h-3.5 shrink-0 mt-px",
            allLinked ? "text-emerald-400" : noneLinked ? "text-muted-foreground/70" : "text-status-warning"
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div
            className={cn(
              "text-caption font-semibold",
              allLinked ? "text-emerald-300" : noneLinked ? "text-foreground/75" : "text-status-warning"
            )}
          >
            {allLinked
              ? `${linked} of ${total} creatives linked`
              : noneLinked
              ? `${total} creative ${total === 1 ? "file" : "files"} staged — ad name mapping needed`
              : `${linked} of ${total} creatives linked — ${unlinked.length} ad ${unlinked.length === 1 ? "name" : "names"} unmatched`}
          </div>
          {noneLinked && (
            <p className="text-label text-muted-foreground/70 leading-relaxed">
              Map each staged creative file to an ad name in the upload panel, then re-sync to
              link them to this analysis run.
            </p>
          )}
          {!allLinked && !noneLinked && unlinked.length > 0 && (
            <div className="text-label text-status-warning/70 leading-relaxed space-y-0.5">
              <p>
                These ad names had no matching row in the data — check that the names in
                the creative mapping exactly match what's in your CSV:
              </p>
              <ul className="space-y-0.5 pt-0.5">
                {unlinked.slice(0, 5).map((name) => (
                  <li key={name} className="truncate text-status-warning/85">
                    · {name}
                  </li>
                ))}
                {unlinked.length > 5 && (
                  <li className="text-status-warning/50">
                    …and {unlinked.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <button
          onClick={() => void handleResync()}
          disabled={syncMutation.isPending}
          className={cn(
            "shrink-0 flex items-center gap-1 text-label font-medium border px-2.5 py-1.5 rounded transition-colors",
            allLinked
              ? "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
              : noneLinked
              ? "border-border/50 text-muted-foreground/80 hover:bg-white/5"
              : "border-status-warning/30 text-status-warning hover:bg-status-warning/10",
            syncMutation.isPending && "opacity-50 cursor-not-allowed"
          )}
          title="Re-attempt linking all staged creatives to their mapped ad names"
        >
          {syncMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Re-sync
        </button>
      </div>
      {syncError && <p className="text-caption text-red-400">{syncError}</p>}
    </div>
  );
}

/**
 * Compact pre-run warning banner that reads the mapping_summary stored on
 * the account's staged performance CSV imports and surfaces any columns
 * that are missing (tier = "missing") or only inferred with low confidence
 * (tier = "inferred").
 *
 * Severity is graded honestly, not uniformly:
 *  - Required breakdown columns (is_required = true) that are missing get a
 *    red section — the run will produce incomplete or failed results.
 *  - Inferred (fuzzy-matched) columns get an amber section — a guess the
 *    user should verify.
 *  - OPTIONAL columns absent from the export get a neutral, collapsed
 *    notice. Meta's export types simply don't all carry every column;
 *    absence is normal, not a defect in the user's CSV, so it must never
 *    render with warning styling. The list stays available behind the
 *    disclosure — demoted presentation, never hidden data.
 *
 * Non-blocking — the user can still press "Run analysis" — but names the
 * specific columns so they can fix the CSV before committing compute time.
 */
function MappingHealthBanner({ imports }: { imports: ManualImport[] }) {
  const [expanded, setExpanded] = useState(false);
  const [noticesExpanded, setNoticesExpanded] = useState(false);

  // Only performance CSVs carry a mapping_summary; creatives don't. Once an
  // import is consumed by a run (status=processed) it's no longer part of
  // what the NEXT run will read, so its mapping health is no longer
  // actionable here — only currently-staged files are relevant.
  const csvImports = imports.filter(
    (imp) =>
      imp.status === "staged" &&
      (imp.kind === "performance_demo_csv" ||
        imp.kind === "performance_placement_csv" ||
        imp.kind === "performance_ad_summary_csv" ||
        imp.kind === "performance_conversion_device_csv") &&
      imp.mapping_summary &&
      imp.mapping_summary.length > 0
  );

  if (csvImports.length === 0) return null;

  type ProblemEntry = {
    canonical: string;
    tier: string;
    found_as: string | null;
    csvLabel: string;
    isRequired: boolean;
  };
  const problems: ProblemEntry[] = [];
  for (const imp of csvImports) {
    const label =
      imp.kind === "performance_demo_csv"
        ? "Demographics CSV"
        : imp.kind === "performance_placement_csv"
        ? "Placements CSV"
        : imp.kind === "performance_ad_summary_csv"
        ? "Ad Summary CSV"
        : "Conversion Device CSV";
    for (const entry of imp.mapping_summary ?? []) {
      if (entry.tier === "missing" || entry.tier === "inferred") {
        problems.push({
          canonical: entry.canonical,
          tier: entry.tier,
          found_as: entry.found_as ?? null,
          csvLabel: label,
          isRequired: entry.is_required ?? false,
        });
      }
    }
  }

  if (problems.length === 0) return null;

  const requiredMissing = problems.filter((p) => p.tier === "missing" && p.isRequired);
  const optionalMissing = problems.filter((p) => p.tier === "missing" && !p.isRequired);
  const inferred = problems.filter((p) => p.tier === "inferred");

  // Required-missing → red. Inferred (genuine low-confidence guesses) →
  // amber. Optional-missing → neutral collapsed notice only: absence of
  // optional columns is a property of Meta's export type, not a user error.
  const hasRequired = requiredMissing.length > 0;

  const renderProblemRow = (p: ProblemEntry, i: number) => (
    <li key={i} className="text-label leading-relaxed" style={{ color: p.isRequired && p.tier === "missing" ? "hsl(var(--destructive) / 0.85)" : "hsl(var(--status-warning) / 0.75)" }}>
      <span
        className={cn(
          "inline-block mr-1.5 px-1 py-px rounded text-label font-semibold uppercase tracking-wide border",
          p.isRequired && p.tier === "missing"
            ? "bg-red-500/15 border-red-400/40 text-red-300"
            : "bg-status-warning/10 border-status-warning/30 text-status-warning"
        )}
      >
        {p.tier === "missing" ? "missing" : "low confidence"}
      </span>
      <span className="font-medium" style={{ color: p.isRequired && p.tier === "missing" ? "hsl(var(--destructive))" : "hsl(var(--status-warning) / 0.9)" }}>{p.canonical}</span>
      {p.found_as && p.tier === "inferred" && (
        <span style={{ color: "hsl(var(--status-warning) / 0.55)" }}> (found as &ldquo;{p.found_as}&rdquo;)</span>
      )}
      <span style={{ marginLeft: "0.25rem", color: p.isRequired && p.tier === "missing" ? "hsl(var(--destructive) / 0.45)" : "hsl(var(--status-warning) / 0.45)" }}>· {p.csvLabel}</span>
    </li>
  );

  return (
    <div className="space-y-2">
      {/* ── Required-missing section (red) ─────────────────────────────── */}
      {hasRequired && (
        <div className="rounded-lg border border-red-400/35 bg-red-500/[0.07] p-3 space-y-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-start gap-2 text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-caption font-semibold text-red-200">
                {requiredMissing.length} required breakdown column{requiredMissing.length > 1 ? "s" : ""} missing
              </div>
              <p className="text-label text-red-100/70 mt-0.5 leading-relaxed">
                These columns are load-bearing for analysis. Without them the run will likely produce
                incomplete or failed results.{" "}
                <span className="underline cursor-pointer">{expanded ? "Hide" : "Show"} details</span>
              </p>
            </div>
          </button>
          {expanded && (
            <ul className="space-y-1 pt-1 border-t border-red-400/20">
              {requiredMissing.map((p, i) => renderProblemRow(p, i))}
            </ul>
          )}
        </div>
      )}

      {/* ── Inferred (genuine low-confidence) section (amber) ──────────── */}
      {inferred.length > 0 && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/[0.06] p-3 space-y-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-start gap-2 text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-caption font-semibold text-status-warning">
                {inferred.length} column{inferred.length > 1 ? "s" : ""} matched with low confidence
              </div>
              <p className="text-label text-status-warning/70 mt-0.5 leading-relaxed">
                These columns were matched by similarity rather than name. Verify the CSV header
                matches the expected column names.{" "}
                <span className="underline cursor-pointer">{expanded ? "Hide" : "Show"} details</span>
              </p>
            </div>
          </button>
          {expanded && (
            <ul className="space-y-1 pt-1 border-t border-status-warning/20">
              {inferred.map((p, i) => renderProblemRow(p, i))}
            </ul>
          )}
        </div>
      )}

      {/* ── Optional columns not in this export (neutral notice) ───────── */}
      {optionalMissing.length > 0 && (
        <div className="rounded-lg border border-border/30 bg-white/[0.02] p-3 space-y-2">
          <button
            onClick={() => setNoticesExpanded((v) => !v)}
            className="w-full flex items-start gap-2 text-left"
          >
            <Info className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-caption font-medium text-foreground/75">
                {optionalMissing.length} optional column{optionalMissing.length > 1 ? "s" : ""} not
                included in this export
              </div>
              <p className="text-label text-muted-foreground/65 mt-0.5 leading-relaxed">
                Analysis proceeds without them — no action needed. Including them in a future
                export deepens signal coverage.{" "}
                <span className="underline cursor-pointer">{noticesExpanded ? "Hide" : "Show"} list</span>
              </p>
            </div>
          </button>
          {noticesExpanded && (
            <ul className="space-y-1 pt-1 border-t border-border/20">
              {optionalMissing.map((p, i) => (
                <li key={i} className="text-label leading-relaxed text-muted-foreground/70">
                  <span className="inline-block mr-1.5 px-1 py-px rounded text-label font-medium uppercase tracking-wide border bg-white/[0.03] border-border/40 text-muted-foreground/70">
                    not in export
                  </span>
                  <span className="font-medium text-foreground/70">{p.canonical}</span>
                  <span className="ml-1 text-muted-foreground/45">· {p.csvLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Shows past successful runs alongside the specific files each one consumed
 * (status=processed, tagged with manual_analysis_run_id) and lets the user
 * "Restage" a batch — flips those files back to staged and clears the run
 * link, so the next "Run analysis" click regenerates from the exact same
 * files without re-uploading. Collapsed by default; only rendered once at
 * least one past run has destaged files to show.
 */
function ImportHistoryPanel({
  accountId,
  runs,
  imports,
  disabled,
  onRestaged,
}: {
  accountId: string;
  runs: AnalysisRun[];
  imports: ManualImport[];
  disabled?: boolean;
  onRestaged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [restagingRunId, setRestagingRunId] = useState<string | null>(null);
  const [restageError, setRestageError] = useState<string | null>(null);
  const restageMutation = useRestageManualImportsForRun();

  const runsWithFiles = runs
    .map((run) => ({ run, files: imports.filter((imp) => imp.manual_analysis_run_id === run.id) }))
    .filter((entry) => entry.files.length > 0);

  if (runsWithFiles.length === 0) return null;

  const handleRestage = async (runId: string) => {
    setRestageError(null);
    setRestagingRunId(runId);
    try {
      await restageMutation.mutateAsync({ accountId, runId });
      onRestaged();
    } catch (err) {
      setRestageError(err instanceof ApiError ? err.message : "Could not restage these files. Try again.");
    } finally {
      setRestagingRunId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        <History className="w-3.5 h-3.5 text-muted-foreground/55 shrink-0" />
        <span className="text-caption text-muted-foreground/70 leading-snug flex-1">
          <span className="font-semibold text-foreground/80">
            Import history · {runsWithFiles.length} run{runsWithFiles.length !== 1 ? "s" : ""}
          </span>
          {" "}· Restage a past batch's files to regenerate analysis without re-uploading.
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border/20 divide-y divide-border/20">
          {runsWithFiles.map(({ run, files }) => (
            <div key={run.id} className="px-2.5 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-foreground/80">
                  {run.date_start && run.date_end ? `${run.date_start} → ${run.date_end}` : run.date_range}
                  {" "}· {files.length} file{files.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => handleRestage(run.id)}
                  disabled={disabled || restagingRunId === run.id}
                  className="flex items-center gap-1 h-6 px-2 rounded border border-border/40 bg-white/[0.02] text-label font-medium text-foreground/80 hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {restagingRunId === run.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Restage
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {files.map((f) => (
                  <span
                    key={f.id}
                    className="text-micro font-mono text-muted-foreground/50 border border-border/30 rounded px-1 py-0.5 truncate max-w-[160px]"
                    title={f.filename}
                  >
                    {f.filename}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {restageError && <p className="text-caption text-red-400 px-2.5 pb-2">{restageError}</p>}
    </div>
  );
}

/**
 * Explicit, manual analysis trigger for an account's staged CSVs.
 * Nothing here runs automatically — the user must pick a date range and
 * press "Run analysis". Polls the latest run every 2.5s while running.
 */
export function AnalysisControls({
  accountId,
  onDone,
  onDateRangeChange,
  detailsOpen,
}: {
  accountId: string;
  /** Called once when the run status transitions to "success". */
  onDone?: () => void;
  /** Mirrors the currently-selected "date range to analyze" up to the parent — e.g. so a readiness tile can show it without duplicating this component's own state. Fires on mount and on every change. */
  onDateRangeChange?: (range: AnalysisDateRange) => void;
  /** Omit (default) to render the date-range chooser and the two pre-run
   *  warning boxes inline, always visible — the manual-upload wizard's
   *  behavior. Pass a boolean to instead collapse them behind a
   *  DetailReveal, defaulting open/closed to this value — the Analysis
   *  Command Center's Summary/Detailed toggle. */
  detailsOpen?: boolean;
}) {
  const [dateRange, setDateRangeState] = useState<AnalysisDateRange>("30d");
  const setDateRange = (r: AnalysisDateRange) => {
    setDateRangeState(r);
    onDateRangeChange?.(r);
  };
  useEffect(() => {
    onDateRangeChange?.(dateRange);
    // Fire once on mount so a parent tile shows the real default immediately, not a guess.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [conversionExportConfirm, setConversionExportConfirm] = useState<{ message: string; files: string[] } | null>(null);
  const queryClient = useQueryClient();
  const startMutation = useStartManualAnalysisRun();
  const { data: latest, refetch } = useGetLatestAnalysisRun(accountId);
  const { data: runsData } = useListAnalysisRuns(accountId);
  const { data: importsData, refetch: refetchImports } = useListManualImports(accountId);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calledDoneRef = useRef(false);
  // Captured once when the query first settles — the run ID that already existed
  // before the user interacted. Prevents onDone/toast from firing for pre-existing
  // completed runs (e.g. when the dialog auto-opens with CSVs already staged).
  const initialRunIdRef = useRef<string | null | undefined>(undefined); // undefined = not yet settled

  const guessedImports = guessedCreativeImports(importsData?.imports ?? []);

  const run = latest?.run ?? null;
  const isRunning = run?.status === "running";

  // A run destages the files it consumes (status flips staged -> processed,
  // tagged with the run id) so the staging area is empty again for the next
  // batch — every "currently staged" check below only counts status="staged"
  // imports; processed ones live in Import History instead.
  const stagedImports = (importsData?.imports ?? []).filter((imp) => imp.status === "staged");

  // True when an Ad Summary CSV is staged — this provides full spend data unaffected
  // by iOS privacy attribution limits (demographic exports only capture ~10-15% of spend).
  const hasSummary = stagedImports.some((imp) => imp.kind === "performance_ad_summary_csv");

  // Hard-block: this component renders standalone on Account Settings /
  // Analysis Command Center (outside the AddAccountDialog wizard, which
  // already gates its own "Review" step on bothRequiredStaged). Without this
  // check, a first-time user with zero CSVs staged could click "Run analysis"
  // and only discover the requirement from the server's 422 afterward.
  const hasDemoCsv = stagedImports.some((imp) => imp.kind === "performance_demo_csv");
  const hasPlacementCsv = stagedImports.some((imp) => imp.kind === "performance_placement_csv");
  const missingRequiredCsv = !hasDemoCsv || !hasPlacementCsv;

  // BUG-08 — a run consumes the STAGED batch, so a successful run leaves its
  // files `processed` and the next run reports them missing. By design (reading
  // processed files back would double-count), but the copy never said the files
  // still exist and can be re-staged from Import History, so the workaround
  // people found was re-uploading a file already in the database.
  //
  // Derived here rather than passed in, and only true when there is really
  // something to re-stage: offering it against an empty Import History would
  // be the BUG-29 failure again — telling someone to import what they already
  // imported.
  const allImports = importsData?.imports ?? [];
  const restagableFor = (kind: string) =>
    allImports.some((imp) => imp.kind === kind && imp.status === "processed");
  const canRestageDemo = !hasDemoCsv && restagableFor("performance_demo_csv");
  const canRestagePlacement = !hasPlacementCsv && restagableFor("performance_placement_csv");
  const canRestageMissing = canRestageDemo || canRestagePlacement;

  // Detect whether any required breakdown column is missing across staged CSVs.
  // When true, we soft-block the Run button with a warning (escape hatch kept).
  const hasRequiredMissing = stagedImports.some(
    (imp) =>
      (imp.kind === "performance_demo_csv" ||
        imp.kind === "performance_placement_csv" ||
        imp.kind === "performance_ad_summary_csv" ||
        imp.kind === "performance_conversion_device_csv") &&
      imp.mapping_summary?.some((e) => e.tier === "missing" && e.is_required)
  );
  const [forceRunAcknowledged, setForceRunAcknowledged] = useState(false);

  useEffect(() => {
    if (isRunning && !pollRef.current) {
      // Poll every 1 s while running so per-stage progress labels update quickly.
      pollRef.current = setInterval(() => {
        refetch();
      }, 1000);
    }
    if (!isRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
      // Re-verify completeness + stage gating everywhere the moment a run
      // settles so Strategy/Loop surfaces flip to ready in the same pass.
      queryClient.invalidateQueries({ queryKey: getGetAnalysisCompletenessQueryKey(accountId) });
      queryClient.invalidateQueries({ queryKey: getGetAccountStageStatusQueryKey(accountId) });
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRunning, refetch, queryClient]);

  const { toast } = useToast();
  const toastedRunIdRef = useRef<string | null>(null);

  // Capture the run ID present the first time the query settles.
  // Any run with this ID was already complete before the user interacted —
  // we suppress auto-close and toast for it so they don't fire on dialog open.
  useEffect(() => {
    if (initialRunIdRef.current !== undefined) return; // set once
    if (latest === undefined) return;                  // query still loading
    initialRunIdRef.current = run?.id ?? null;
  }, [latest, run?.id]);

  // Toast once when a NEW run (started this session) settles — success or
  // error — so the outcome surfaces even if the user has navigated away
  // from this screen while it was polling.
  useEffect(() => {
    if (
      (run?.status !== "success" && run?.status !== "error") ||
      !run.id ||
      toastedRunIdRef.current === run.id
    ) {
      return;
    }
    toastedRunIdRef.current = run.id;
    // Don't toast for the run that was already complete when the dialog opened.
    if (run.id === initialRunIdRef.current) return;
    if (run.status === "success") {
      toast({
        title: "Analysis complete",
        description:
          run.date_start && run.date_end
            ? `Data covers ${run.date_start} → ${run.date_end}.`
            : "Performance data is ready to review.",
        duration: 4000,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: run.error_message ?? "The run ended with an error.",
        duration: 6000,
      });
    }
  }, [run?.status, run?.id, run?.date_start, run?.date_end, run?.error_message, toast]);

  // Fire onDone once when a NEW run (started this session) transitions to success.
  useEffect(() => {
    if (run?.status !== "success" || !onDone || calledDoneRef.current) return;
    // Don't auto-close for a run that was already complete when the dialog opened.
    if (run?.id === initialRunIdRef.current) return;
    calledDoneRef.current = true;
    // Small delay so the user can see the success state before the dialog closes.
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [run?.status, run?.id, onDone]);

  const handleRun = async (confirmConversionExport = false) => {
    setError(null);
    try {
      await startMutation.mutateAsync({
        accountId,
        data: { date_range: dateRange, ...(confirmConversionExport ? { confirm_conversion_export: true } : {}) },
      });
      setConversionExportConfirm(null);
      await refetch();
    } catch (err) {
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
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start analysis. Check your connection and try again."
      );
    }
  };

  const priorRuns = (runsData?.runs ?? []).filter((r) => r.status === "success");

  // Grouped so both the wizard (always inline) and the Command Center
  // (collapsed behind DetailReveal, see `detailsOpen`) render the exact
  // same date-range grid + pre-run warnings — no duplicated markup.
  const dateRangeGrid = (
    <div className="grid grid-cols-2 gap-1.5">
      {DATE_RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => setDateRange(r.id)}
          disabled={isRunning}
          className={cn(
            "h-8 px-2 rounded-md border text-caption font-medium transition-colors",
            dateRange === r.id
              ? "border-primary/40 bg-primary/[0.08] text-interactive"
              : "border-border/40 bg-white/[0.02] text-muted-foreground/85 hover:bg-white/[0.04]",
            isRunning && "opacity-50 cursor-not-allowed"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  // Spend coverage notice — shown when the Ad Summary export is absent
  const spendWarningBox = !hasSummary && !isRunning && (
    <div className="rounded-lg border border-status-warning/25 bg-status-warning/[0.05] p-3 space-y-1">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-caption font-semibold text-status-warning">Spend will be underreported without an Ad Summary export</div>
          <p className="text-label text-status-warning/65 leading-relaxed">
            Meta's demographic export only captures ~10–15% of actual spend — the rest is unattributable due to iOS
            privacy limits. Upload an <strong className="text-status-warning/90">Ad Summary export</strong> (CSV or XLSX,
            ad-level, no demographic/device breakdown) to unlock full spend totals.
          </p>
        </div>
      </div>
    </div>
  );

  // Hard-block: at least one required report hasn't been staged yet
  const missingCsvWarningBox = missingRequiredCsv && !isRunning && (
    <div className="rounded-lg border border-red-400/35 bg-red-500/[0.07] p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-caption font-semibold text-red-200">
            Both reports are required before running analysis
          </div>
          <p className="text-label text-red-100/70 leading-relaxed">
            Missing: {[!hasDemoCsv && "Demographics export", !hasPlacementCsv && "Placement export"]
              .filter(Boolean)
              .join(", ")}
            .{" "}
            {canRestageMissing
              ? `A previously processed ${[canRestageDemo && "Demographics", canRestagePlacement && "Placement"]
                  .filter(Boolean)
                  .join(" and ")} export is already on this account — re-stage it from Import History below, or upload a new one from the setup screen.`
              : `Upload ${!hasDemoCsv && !hasPlacementCsv ? "them" : "it"} from this account's setup screen.`}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Existing-runs context strip */}
      {priorRuns.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-border/30 bg-white/[0.02] px-2.5 py-2">
          <History className="w-3.5 h-3.5 text-muted-foreground/55 shrink-0" />
          <span className="text-caption text-muted-foreground/70 leading-snug">
            <span className="font-semibold text-foreground/80">
              {priorRuns.length} existing run{priorRuns.length !== 1 ? "s" : ""}
            </span>
            {" "}· Running again adds another snapshot you can select independently when building strategy.
          </span>
        </div>
      )}

      <ImportHistoryPanel
        accountId={accountId}
        runs={priorRuns}
        imports={importsData?.imports ?? []}
        disabled={isRunning}
        onRestaged={() => {
          void refetchImports();
          void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
        }}
      />

      {detailsOpen === undefined ? (
        <>
          <div className="flex items-center gap-2">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
            <span className="text-caption font-medium text-foreground">Date range to analyze</span>
          </div>
          {dateRangeGrid}
          {spendWarningBox}
          {missingCsvWarningBox}
        </>
      ) : (
        // Command Center context: same controls, collapsed behind a
        // disclosure by default so the card matches the mock's compact
        // face. Nothing removed — remounted via `key` so the header's
        // Summary/Detailed toggle can force it open or closed, same
        // pattern as AdAccountOverview's control-read reveals.
        <DetailReveal
          key={String(detailsOpen)}
          label={
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
              Date range to analyze
            </span>
          }
          labelClassName="text-caption font-medium text-foreground"
          sections={[{ render: () => <div className="space-y-3">{dateRangeGrid}{spendWarningBox}{missingCsvWarningBox}</div> }]}
          defaultOpen={detailsOpen}
        />
      )}

      <MappingHealthBanner imports={importsData?.imports ?? []} />

      <GuessedMatchesCallout
        accountId={accountId}
        guessedImports={guessedImports}
        onConfirmed={() => void refetchImports()}
      />

      {error && <p className="text-caption text-red-400">{error}</p>}

      {/* Soft-block warning when required breakdown columns are missing */}
      {!missingRequiredCsv && hasRequiredMissing && !isRunning && !forceRunAcknowledged && (
        <div className="rounded-lg border border-red-400/35 bg-red-500/[0.07] p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="text-caption font-semibold text-red-200">
                Required columns are missing — this run will likely fail
              </div>
              <p className="text-label text-red-100/70 leading-relaxed">
                One or more required breakdown columns (e.g. Age, Placement) were not found in your
                file. Fix the file and re-upload it, or run anyway and review the error.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => setForceRunAcknowledged(true)}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-red-400/35 bg-red-500/[0.08] text-caption font-medium text-red-200 hover:bg-red-500/[0.14] transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" /> Run anyway
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {run ? (
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge run={run} />
            {run.status === "success" && run.date_start && run.date_end && (
              <span className="text-label text-muted-foreground/80 truncate">
                Covers {run.date_start} → {run.date_end} ({run.rows_ingested ?? 0} rows)
              </span>
            )}
            {run.status === "error" && run.error_message && (
              <span className="text-label text-red-400/80 truncate">{run.error_message}</span>
            )}
          </div>
        ) : (
          <span className="text-label text-muted-foreground/75">No analysis has been run yet.</span>
        )}
        <RunAnalysisBtn
          onClick={() => handleRun()}
          disabled={
            isRunning ||
            startMutation.isPending ||
            missingRequiredCsv ||
            (hasRequiredMissing && !forceRunAcknowledged)
          }
          warning={hasRequiredMissing && forceRunAcknowledged}
        >
          {isRunning || startMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…
            </>
          ) : hasRequiredMissing && !forceRunAcknowledged ? (
            <>
              <PlayCircle className="w-3.5 h-3.5" /> Run analysis
            </>
          ) : hasRequiredMissing && forceRunAcknowledged ? (
            <>
              <PlayCircle className="w-3.5 h-3.5" /> Run anyway
            </>
          ) : (
            <>
              <PlayCircle className="w-3.5 h-3.5" /> Run analysis
            </>
          )}
        </RunAnalysisBtn>
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

      {/* Real per-stage progress bar — polls every 1 s while running */}
      {(isRunning || run?.status === "success") && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-label text-muted-foreground/75">
            <span className="truncate">
              {isRunning
                ? (run?.progress_stage || "Starting analysis…")
                : "Analysis complete"}
            </span>
            <span className="tabular-nums shrink-0">
              {run?.status === "success" ? 100 : (run?.progress_pct ?? 0)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                run?.status === "success" ? "bg-emerald-400/70" : "bg-primary/70"
              )}
              style={{
                width: `${run?.status === "success" ? 100 : (run?.progress_pct ?? 0)}%`,
              }}
            />
          </div>
          {isRunning && (
            <div className="grid grid-cols-5 gap-0.5 pt-0.5">
              {[
                { label: "Parse", pct: 50 },
                { label: "Aggregate", pct: 62 },
                { label: "Write", pct: 90 },
                { label: "Link", pct: 92 },
                { label: "Finalize", pct: 100 },
              ].map((step) => {
                const done = (run?.progress_pct ?? 0) >= step.pct;
                const active = !done && (run?.progress_pct ?? 0) >= (step.pct - 38);
                return (
                  <div
                    key={step.label}
                    className={cn(
                      "h-0.5 rounded-full transition-colors duration-500",
                      done
                        ? "bg-primary/70"
                        : active
                        ? "bg-primary/40"
                        : "bg-white/[0.08]"
                    )}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {run && run.status === "success" && <CsvWarningsPanel run={run} />}
      {run && run.status === "success" && <ObjectiveFlagsPanel run={run} />}

      {/* Server-verified module completeness — shown once the run settles */}
      {run && run.status === "success" && <CompletenessPanel accountId={accountId} runId={run.id} />}

      {run && (run.status === "success" || run.status === "error") && (
        <CreativeLinkageStatus
          accountId={accountId}
          run={run}
          onSynced={() => {
            void refetch();
            queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
          }}
        />
      )}

      {run && run.status === "success" && (
        <ImportConfidenceReport imports={importsData?.imports ?? []} />
      )}

      <div className="flex items-center gap-1.5">
        <p className="text-label text-muted-foreground/75">Analysis only runs when you press this button — it will never run on its own.</p>
        <InfoTooltip content="It reads your staged uploads and reports the exact dates found in the data for the selected range." />
      </div>
    </div>
  );
}
