// ─── Reports · Report History ─────────────────────────────────────────
// Previously generated reports for this account: when they ran, how they
// were branded, and whether they were exported. Exported entries can be
// re-downloaded as real files, composed from current seed data.

import { useState } from "react";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportHistory } from "@/lib/data/metrixSeedAdapter";
import { buildReportModel, downloadReportExport, parseReportModel, type BrandingMode } from "@/lib/reportExport";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile, CrossLink, fmtNum } from "../shared";
import { FORMAT_LABEL } from "./NewReportView";
import { cn } from "@/lib/utils";
import { History, FileText, Building2, Users, FileDown, Check, Loader2 } from "lucide-react";
import { useListWorkspaceReports } from "@workspace/api-client-react";

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
}

export function ReportHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { manager } = useAccount();
  const { data: generatedData } = useListWorkspaceReports(manager.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

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
    if (!model) return;
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
          })),
        ];

        if (history.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Report History" />
              <ScopeBanner account={acct} />
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
              subtitle="Every report generated for this account, newest first."
              table="report_history"
            />
            <ScopeBanner account={acct} />

            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
              <MetricTile label="Reports" value={fmtNum(history.length)} />
              <MetricTile label="Exported" value={fmtNum(exported)} />
              <MetricTile label="Drafts" value={fmtNum(history.length - exported)} />
            </div>

            <div className="px-6 py-5 space-y-3 max-w-3xl">
              {sorted.map((r) => (
                <div key={r.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
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
                      <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{r.summary}</p>
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
                  </div>
                </div>
              ))}

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
