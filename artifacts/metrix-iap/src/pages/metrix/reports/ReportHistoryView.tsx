// ─── Reports · Report History ─────────────────────────────────────────
// Previously generated reports for this account: when they ran, how they
// were branded, and whether they were exported. Exported entries can be
// re-downloaded as real files, composed from current seed data.

import { useState } from "react";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportHistory } from "@/lib/data/metrixSeedAdapter";
import { buildReportModel, downloadReportExport, parseReportModel, type BrandingMode } from "@/lib/reportExport";
import { ModuleHeader, ModuleScopeGate, PendingState, MetricTile, CrossLink, fmtNum, deriveLabel } from "../shared";
import { FORMAT_LABEL } from "./reportFormatLabels";
import { cn } from "@/lib/utils";
import { History, FileText, Building2, Users, FileDown, Check, Loader2, Trash2, X } from "lucide-react";
import {
  useListWorkspaceReports,
  useDeleteWorkspaceReport,
  useBatchDeleteWorkspaceReports,
  getListWorkspaceReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SECTION = "Reports · 06";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface HistoryEntry {
  id: string;
  title: string;
  summary: string;
  generated_at: string;
  mode: string;
  branding: string;
  section_count: number;
  export_format: string | null;
  status: string;
  /** Stored document snapshot — present for reports generated in-app. */
  modelJson: string | null;
  /** Raw DB id — present only for in-app generated reports (deletable). */
  reportId: number | null;
}

export function ReportHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { manager } = useAccount();
  const { data: generatedData } = useListWorkspaceReports(manager.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HistoryEntry | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { mutate: deleteReport, isPending: deleting } = useDeleteWorkspaceReport({
    mutation: {
      onSuccess: async (_result, vars) => {
        await queryClient.invalidateQueries({
          queryKey: getListWorkspaceReportsQueryKey(manager.id),
        });
        const title = confirmDelete?.reportId === vars.reportId ? confirmDelete.title : "Report";
        setConfirmDelete(null);
        toast({
          title: "Report deleted",
          description: `"${title}" was removed from Report History.`,
        });
      },
      onError: () => {
        setConfirmDelete(null);
        toast({
          variant: "destructive",
          title: "Couldn't delete the report",
          description: "The report was not deleted. Please try again.",
        });
      },
    },
  });

  const { mutate: batchDeleteReports, isPending: batchDeleting } = useBatchDeleteWorkspaceReports({
    mutation: {
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: getListWorkspaceReportsQueryKey(manager.id),
        });
        setConfirmBulkDelete(false);
        setSelectMode(false);
        setSelectedIds(new Set());
        const n = result.deleted_count;
        toast({
          title: n === 1 ? "Report deleted" : "Reports deleted",
          description: `${fmtNum(n)} ${n === 1 ? "report was" : "reports were"} removed from Report History.`,
        });
      },
      onError: () => {
        setConfirmBulkDelete(false);
        toast({
          variant: "destructive",
          title: "Couldn't delete the reports",
          description: "No reports were deleted. Please try again.",
        });
      },
    },
  });

  function toggleSelected(reportId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function download(entry: HistoryEntry, format: string) {
    if (busyId) return;
    // Generated reports re-download their stored snapshot; seed history
    // entries are re-composed from current data (no snapshot exists).
    const model = entry.modelJson
      ? parseReportModel(entry.modelJson)
      : buildReportModel(seed, adAccountId!, (entry.mode === "client" ? "client" : "internal") as BrandingMode, {
          docTitle: entry.title,
          sectionCount: entry.section_count,
        });
    if (!model) {
      toast({
        variant: "destructive",
        title: "Couldn't download the report",
        description: "This report's saved copy can't be read — try generating it again.",
      });
      return;
    }
    setBusyId(entry.id);
    setDoneId(null);
    try {
      await downloadReportExport(format, model);
      setDoneId(entry.id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModuleScopeGate section={SECTION} title="Report History" account={account}>
      {() => {
        const acct = account!;
        const seedHistory = getReportHistory(seed, adAccountId);
        const generated = (generatedData?.reports ?? []).filter((r) => r.ad_account_id === adAccountId);

        const history: HistoryEntry[] = [
          ...generated.map((r) => ({
            id: `gen-${r.id}`,
            title: r.title,
            summary: r.summary,
            generated_at: r.generated_at,
            mode: r.mode,
            branding: r.branding,
            section_count: r.section_count,
            export_format: r.export_format,
            status: "exported",
            modelJson: r.model_json,
            reportId: r.id,
          })),
          ...seedHistory.map((h) => ({
            id: h.id,
            title: h.title,
            summary: h.summary,
            generated_at: h.generated_at,
            mode: h.mode,
            branding: h.branding,
            section_count: h.section_count,
            export_format: h.export_format ?? null,
            status: h.status,
            modelJson: null,
            reportId: null,
          })),
        ];

        if (history.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Report History" account={acct} />
              <PendingState title="No reports yet" message="Reports you compose and export will appear here." icon={History} />
              <div className="px-6 pb-6 text-center">
                <CrossLink to="/app/reports/new" label="Compose the first report" />
              </div>
            </div>
          );
        }

        const exported = history.filter((h) => h.status === "exported").length;
        const sorted = [...history].sort((a, b) => b.generated_at.localeCompare(a.generated_at));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Report History"
              subtitle="All generated reports · newest first"
              table="report_history"
              account={acct}
            />

            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
              <MetricTile label="Reports" value={fmtNum(history.length)} />
              <MetricTile label="Exported" value={fmtNum(exported)} />
              <MetricTile label="Drafts" value={fmtNum(history.length - exported)} />
            </div>

            {(() => {
              const deletableIds = sorted.filter((r) => r.reportId != null).map((r) => r.reportId!);
              if (deletableIds.length === 0) return null;
              const draftIds = sorted
                .filter((r) => r.reportId != null && !r.export_format)
                .map((r) => r.reportId!);
              const allSelected =
                deletableIds.length > 0 && deletableIds.every((id) => selectedIds.has(id));
              const allDraftsSelected =
                draftIds.length > 0 &&
                draftIds.every((id) => selectedIds.has(id)) &&
                selectedIds.size === draftIds.length;
              return (
                <div className="px-6 pt-5 max-w-3xl flex items-center justify-between gap-3 flex-wrap">
                  {selectMode ? (
                    <>
                      <span className="text-[12px] text-muted-foreground">
                        {selectedIds.size === 0
                          ? "Select reports to delete"
                          : `${fmtNum(selectedIds.size)} selected`}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() =>
                            setSelectedIds(allSelected ? new Set() : new Set(deletableIds))
                          }
                          disabled={batchDeleting}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-60"
                        >
                          {allSelected ? "Deselect all" : `Select all (${fmtNum(deletableIds.length)})`}
                        </button>
                        {draftIds.length > 0 && (
                          <button
                            onClick={() =>
                              setSelectedIds(allDraftsSelected ? new Set() : new Set(draftIds))
                            }
                            disabled={batchDeleting}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-60"
                          >
                            {allDraftsSelected
                              ? "Deselect drafts"
                              : `Select drafts (${fmtNum(draftIds.length)})`}
                          </button>
                        )}
                        <button
                          onClick={exitSelectMode}
                          disabled={batchDeleting}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-60"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                        <button
                          onClick={() => setConfirmBulkDelete(true)}
                          disabled={selectedIds.size === 0 || batchDeleting}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-red-400/30 text-[11px] font-medium text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                        >
                          {batchDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Delete selected
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors ml-auto"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Select
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="px-6 py-5 space-y-3 max-w-3xl">
              {sorted.map((r) => {
                const selectable = selectMode && r.reportId != null;
                const isSelected = r.reportId != null && selectedIds.has(r.reportId);
                return (
                <div
                  key={r.id}
                  onClick={selectable ? () => toggleSelected(r.reportId!) : undefined}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    isSelected
                      ? "border-red-400/40 bg-red-400/[0.06]"
                      : "border-border/40 bg-white/[0.02]",
                    selectable && "cursor-pointer hover:border-border/70",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {selectMode && (
                      <div className="flex items-center h-9 shrink-0">
                        {r.reportId != null ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelected(r.reportId!)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select report "${r.title}"`}
                          />
                        ) : (
                          <div className="w-4 h-4" title="Seed reports can't be deleted" />
                        )}
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[13px] font-semibold text-foreground leading-tight">{r.title}</h3>
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none",
                            r.status === "exported"
                              ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
                              : "text-amber-400 border-amber-400/25 bg-amber-400/10"
                          )}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed line-clamp-1">{deriveLabel(r.summary, 90)}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground/70 flex-wrap">
                        <span>{fmtDate(r.generated_at)}</span>
                        <span className="inline-flex items-center gap-1">
                          {r.mode === "client" ? <Users className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                          {r.mode === "client" ? "Client-facing" : "Internal"} · {r.branding}
                        </span>
                        <span>{r.section_count} sections</span>
                        {r.export_format && <span className="uppercase">{FORMAT_LABEL[r.export_format] ?? r.export_format}</span>}
                      </div>
                    </div>
                    {r.status === "exported" && r.export_format && (
                      <button
                        onClick={() => download(r, r.export_format!)}
                        disabled={busyId !== null}
                        className={cn(
                          "flex items-center gap-1.5 h-8 px-3 rounded-md border text-[11px] font-medium shrink-0 transition-colors disabled:opacity-60",
                          doneId === r.id
                            ? "border-emerald-400/30 text-emerald-400 bg-emerald-400/5"
                            : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : doneId === r.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                        {doneId === r.id ? "Downloaded" : `Download ${FORMAT_LABEL[r.export_format] ?? r.export_format}`}
                      </button>
                    )}
                    {r.reportId && (
                      <button
                        onClick={() => setConfirmDelete(r)}
                        disabled={deleting}
                        aria-label={`Delete report "${r.title}"`}
                        title="Delete report"
                        className="flex items-center justify-center h-8 w-8 rounded-md border border-border/50 text-muted-foreground hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 shrink-0 transition-colors disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}

              <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && !deleting && setConfirmDelete(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {confirmDelete
                        ? `"${confirmDelete.title}" and its stored snapshot will be permanently removed from Report History and Exports. This can't be undone.`
                        : ""}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleting}
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirmDelete?.reportId) {
                          deleteReport({ workspaceId: manager.id, reportId: confirmDelete.reportId });
                        }
                      }}
                      className="bg-red-500/90 hover:bg-red-500 text-white"
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete report"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={confirmBulkDelete} onOpenChange={(open) => !open && !batchDeleting && setConfirmBulkDelete(false)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {fmtNum(selectedIds.size)} {selectedIds.size === 1 ? "report" : "reports"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {selectedIds.size === 1
                        ? "The selected report and its stored snapshot will be permanently removed from Report History and Exports. This can't be undone."
                        : `The ${fmtNum(selectedIds.size)} selected reports and their stored snapshots will be permanently removed from Report History and Exports. This can't be undone.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={batchDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={batchDeleting || selectedIds.size === 0}
                      onClick={(e) => {
                        e.preventDefault();
                        if (selectedIds.size > 0) {
                          batchDeleteReports({
                            workspaceId: manager.id,
                            data: { report_ids: Array.from(selectedIds) },
                          });
                        }
                      }}
                      className="bg-red-500/90 hover:bg-red-500 text-white"
                    >
                      {batchDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        `Delete ${fmtNum(selectedIds.size)} ${selectedIds.size === 1 ? "report" : "reports"}`
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex items-center gap-4 pt-1">
                <CrossLink to="/app/reports/new" label="Compose a new report" />
                <CrossLink to="/app/reports/exports" label="Export formats" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
