// ─── Reports · Exports ────────────────────────────────────────────────
// Export formats, branding policy, and past exported deliverables for
// this account's reports. Formats and deliverables download real files.

import { useState } from "react";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder, getReportHistory } from "@/lib/data/metrixSeedAdapter";
import { buildReportModel, downloadReportExport, parseReportModel, type BrandingMode } from "@/lib/reportExport";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, CaveatNote, PendingState, CrossLink } from "../shared";
import { FORMAT_LABEL } from "./NewReportView";
import { cn } from "@/lib/utils";
import { FileDown, FileText, Check, Loader2 } from "lucide-react";
import { useListWorkspaceReports } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const SECTION = "Reports · 06";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface Deliverable {
  key: string;
  title: string;
  generated_at: string;
  mode: string;
  export_format: string | null;
  section_count: number;
  /** Stored document snapshot — present for reports generated in-app. */
  modelJson: string | null;
}

export function ExportsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { manager } = useAccount();
  const { data: generatedData } = useListWorkspaceReports(manager.id);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const { toast } = useToast();

  async function download(key: string, format: string, mode: BrandingMode, opts?: { docTitle?: string; sectionCount?: number }) {
    if (busyKey) return;
    const model = buildReportModel(seed, adAccountId!, mode, opts);
    if (!model) return;
    setBusyKey(key);
    setDoneKey(null);
    try {
      await downloadReportExport(format, model);
      setDoneKey(key);
    } finally {
      setBusyKey(null);
    }
  }

  async function downloadDeliverable(d: Deliverable, format: string) {
    if (busyKey) return;
    // Generated reports re-download their stored snapshot; seed history
    // entries are re-composed from current data (no snapshot exists).
    const mode: BrandingMode = d.mode === "client" ? "client" : "internal";
    const model = d.modelJson
      ? parseReportModel(d.modelJson)
      : buildReportModel(seed, adAccountId!, mode, { docTitle: d.title, sectionCount: d.section_count });
    if (!model) {
      toast({
        variant: "destructive",
        title: "Couldn't download the report",
        description: "This report's saved copy can't be read — try generating it again.",
      });
      return;
    }
    setBusyKey(d.key);
    setDoneKey(null);
    try {
      await downloadReportExport(format, model);
      setDoneKey(d.key);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ModuleScopeGate section={SECTION} title="Exports" account={account}>
      {() => {
        const acct = account!;
        const rb = getReportBuilder(seed, adAccountId);
        const generated = (generatedData?.reports ?? []).filter((r) => r.ad_account_id === adAccountId);
        const exportedReports: Deliverable[] = [
          ...generated.map((r) => ({
            key: `gen:${r.id}`,
            title: r.title,
            generated_at: r.generated_at,
            mode: r.mode,
            export_format: r.export_format,
            section_count: r.section_count,
            modelJson: r.model_json,
          })),
          ...getReportHistory(seed, adAccountId)
            .filter((r) => r.status === "exported")
            .map((r) => ({
              key: `hist:${r.id}`,
              title: r.title,
              generated_at: r.generated_at,
              mode: r.mode,
              export_format: r.export_format ?? null,
              section_count: r.section_count,
              modelJson: null,
            })),
        ].sort((a, b) => b.generated_at.localeCompare(a.generated_at));

        if (!rb) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Exports" />
              <ScopeBanner account={acct} />
              <PendingState title="No export options" message="Export formats become available once the report template exists." icon={FileDown} />
            </div>
          );
        }

        const defaultMode: BrandingMode = rb.default_branding === "metrix" ? "internal" : "client";

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports"
              subtitle="How reports leave Metrix: formats, branding policy, and delivered exports."
              table="report_builder"
            />
            <ScopeBanner account={acct} />

            <div className="px-6 py-5 space-y-5 max-w-3xl">
              <SectionCard title="Available formats" desc="Click a format to download the current report in it.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {rb.export_formats.map((f) => {
                    const key = `fmt:${f}`;
                    return (
                      <button
                        key={f}
                        onClick={() => download(key, f, defaultMode)}
                        disabled={busyKey !== null}
                        className={cn(
                          "rounded-lg border bg-white/[0.02] p-3.5 flex items-center gap-2.5 text-left transition-colors disabled:opacity-60",
                          doneKey === key
                            ? "border-emerald-400/30 bg-emerald-400/5"
                            : "border-border/40 hover:border-border/70 hover:bg-white/[0.04]"
                        )}
                      >
                        {busyKey === key ? (
                          <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
                        ) : (
                          <FileDown className="w-4 h-4 text-primary shrink-0" />
                        )}
                        <div>
                          <div className="text-body font-medium text-foreground">{FORMAT_LABEL[f] ?? f}</div>
                          <div className={cn("text-label flex items-center gap-1", doneKey === key ? "text-emerald-400" : "text-muted-foreground/80")}>
                            <Check className="w-3 h-3 text-emerald-400" /> {doneKey === key ? "Downloaded" : "Supported · click to download"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Branding policy" desc="How exported reports are branded for delivery.">
                <div className="text-body text-foreground/90 capitalize mb-2">
                  Default: {rb.default_branding} branding · white-label {rb.white_label_supported ? "supported" : "unavailable"}
                </div>
                <CaveatNote text={rb.logo_policy} />
              </SectionCard>

              <SectionCard title="Exported deliverables" desc="Reports from this account that have been exported. Download re-generates the file from current data.">
                {exportedReports.length === 0 ? (
                  <PendingState title="Nothing exported yet" message="Exported reports will be listed here with their format and date." icon={FileText} />
                ) : (
                  <div className="divide-y divide-border/20">
                    {exportedReports.map((r) => (
                      <div key={r.key} className="flex items-center gap-3 py-2.5">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-body font-medium text-foreground truncate">{r.title}</div>
                          <div className="text-label font-mono text-muted-foreground/80 mt-1">
                            {fmtDate(r.generated_at)} · {r.mode === "client" ? "Client-facing" : "Internal"}
                            {r.modelJson && <span className="text-primary/80"> · saved snapshot</span>}
                          </div>
                        </div>
                        {r.export_format && (
                          <button
                            onClick={() => downloadDeliverable(r, r.export_format!)}
                            disabled={busyKey !== null}
                            className={cn(
                              "flex items-center gap-1.5 text-label font-semibold uppercase border px-2 py-1 rounded leading-none shrink-0 transition-colors disabled:opacity-60",
                              doneKey === r.key
                                ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
                                : "text-primary border-primary/25 bg-primary/10 hover:bg-primary/20"
                            )}
                          >
                            {busyKey === r.key ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : doneKey === r.key ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <FileDown className="w-3 h-3" />
                            )}
                            {FORMAT_LABEL[r.export_format] ?? r.export_format}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <div className="flex items-center gap-4">
                <CrossLink to="/app/reports/new" label="Compose a new report" />
                <CrossLink to="/app/reports/history" label="Full report history" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
