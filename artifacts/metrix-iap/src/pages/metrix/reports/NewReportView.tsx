// ─── Reports · New Report ─────────────────────────────────────────────
// Metrix-branded / white-label report composition, scoped to the account.
// Sub-tabs: Report preview (Internal vs Client mode) | Branding & export.

import { useState } from "react";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { buildReportModel, downloadReportExport, serializeReportModel, parseReportModel } from "@/lib/reportExport";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, ModuleTabs, CaveatNote, PendingState, CrossLink } from "../shared";
import { useDateRange, formatIsoRange, isoMin, isoMax, type IsoRange } from "@/contexts/DateRangeContext";
import { cn } from "@/lib/utils";
import { FileText, FileDown, Palette, Check, Eye, Building2, Users, Loader2, CalendarRange, Sparkles } from "lucide-react";
import {
  useGetReportSettings,
  useCreateWorkspaceReport,
  getListWorkspaceReportsQueryKey,
  type GeneratedReportCreateInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const SECTION = "Reports · 06";

export const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  google_doc: "Google Doc",
  html: "HTML",
};

type Tab = "preview" | "branding";
type Mode = "internal" | "client";

export function NewReportView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { manager } = useAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<string>("preview");
  const [mode, setMode] = useState<Mode>("internal");
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  // Section selection: all template sections are included by default;
  // unchecking removes them from the generated document only.
  const [excludedSections, setExcludedSections] = useState<Set<string>>(new Set());
  const [generatedOk, setGeneratedOk] = useState(false);
  // Per-report format override: null = follow the workspace default from
  // Report Settings. Choosing here never changes the saved default.
  const [formatOverride, setFormatOverride] = useState<string | null>(null);

  // Report window: inherits the global date range by default; a per-report
  // override applies to this report composition only (never the global filter).
  const { range: globalRange, bounds, rangeLabel } = useDateRange();
  const [override, setOverride] = useState<IsoRange | null>(null);
  const reportRange = override ?? globalRange;

  const { data: settings } = useGetReportSettings(manager.id);
  const { mutate: createReport, isPending: generating } = useCreateWorkspaceReport({
    mutation: {
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: getListWorkspaceReportsQueryKey(manager.id),
        });
        setGeneratedOk(true);
        const model = parseReportModel(result.report.model_json);
        if (model) {
          await downloadReportExport(result.report.export_format, model);
          toast({
            title: "Report generated",
            description: `"${result.report.title}" was saved to Report History and downloaded as ${FORMAT_LABEL[result.report.export_format] ?? result.report.export_format}.`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Report saved, but the download failed",
            description: `"${result.report.title}" was saved to Report History, but its saved copy can't be read — try generating it again.`,
          });
        }
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Couldn't generate the report",
          description: "The report was not saved. Please try again.",
        });
      },
    },
  });

  function toggleSection(title: string) {
    setGeneratedOk(false);
    setExcludedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function handleGenerate(rbSections: string[], chosenFormat: string) {
    if (generating || !adAccountId) return;
    const selected = rbSections.filter((s) => !excludedSections.has(s));
    if (selected.length === 0) return;
    const windowLabel = reportRange ? formatIsoRange(reportRange) : null;
    const model = buildReportModel(seed, adAccountId, mode, {
      selectedSections: selected,
      windowLabel,
    });
    if (!model) return;
    const branding = mode === "internal" ? "metrix" : "white_label";
    const summary = `${selected.length} of ${rbSections.length} sections · ${
      windowLabel ? `window ${windowLabel}` : "no data window"
    }${override ? " (override)" : ""} · ${mode === "internal" ? "internal" : "client-facing"} delivery.`;
    const body: GeneratedReportCreateInput = {
      ad_account_id: adAccountId,
      title: model.docTitle,
      mode,
      branding,
      export_format: (["pdf", "google_doc", "html"].includes(chosenFormat)
        ? chosenFormat
        : "pdf") as GeneratedReportCreateInput["export_format"],
      section_count: selected.length,
      range_start: reportRange?.start ?? null,
      range_end: reportRange?.end ?? null,
      range_source: reportRange ? (override ? "override" : "global") : null,
      summary,
      model_json: serializeReportModel(model),
    };
    setGeneratedOk(false);
    createReport({ workspaceId: manager.id, data: body });
  }

  async function handleExport(format: string) {
    if (exporting) return;
    const model = buildReportModel(seed, adAccountId!, mode, {
      windowLabel: reportRange ? formatIsoRange(reportRange) : null,
    });
    if (!model) return;
    setExporting(format);
    setExported(null);
    try {
      await downloadReportExport(format, model);
      setExported(format);
    } finally {
      setExporting(null);
    }
  }

  return (
    <ModuleScopeGate section={SECTION} title="New Report" account={account}>
      {() => {
        const acct = account!;
        const rb = getReportBuilder(seed, adAccountId);
        if (!rb) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="New Report" />
              <ScopeBanner account={acct} />
              <PendingState title="Report Builder pending" message="No report template is available for this account yet." icon={FileText} />
            </div>
          );
        }

        const tabs: { id: Tab; label: string; count?: number }[] = [
          { id: "preview", label: "Report preview", count: rb.report_sections.length },
          { id: "branding", label: "Branding & export" },
        ];

        const brandLabel = mode === "internal" ? "Metrix IAP" : acct.name;
        const brandSub = mode === "internal"
          ? "Internal dashboard mode · full Metrix branding"
          : "Client-facing mode · white-labeled for the client";

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="New Report"
              subtitle="Compose a client-ready report from this account's analysis and strategy."
              table="reports"
            />
            <ScopeBanner account={acct} />
            <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />

            <div className="px-6 py-5 space-y-5 max-w-4xl">
              {tab === "preview" && (
                <>
                  {/* Report window: inherit global range, allow per-report override */}
                  <div className="rounded-lg border border-border/40 bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Report window</span>
                      {reportRange ? (
                        <span className="text-label font-medium text-foreground/80 tabular-nums">{formatIsoRange(reportRange)}</span>
                      ) : (
                        <span className="text-label text-muted-foreground/60">No data window available</span>
                      )}
                      {override ? (
                        <span className="text-label-xs font-semibold uppercase tracking-wide text-primary border border-primary/25 bg-primary/10 px-1.5 py-0.5 rounded leading-none">Override</span>
                      ) : (
                        <span className="text-label text-muted-foreground/60">inherited from the global date range ({rangeLabel})</span>
                      )}
                    </div>
                    {bounds && (
                      <div className="flex items-center gap-2 flex-wrap mt-2.5">
                        <label className="flex items-center gap-1.5 text-label text-muted-foreground/70">
                          From
                          <input
                            type="date"
                            min={bounds.start}
                            max={bounds.end}
                            value={override?.start ?? reportRange?.start ?? bounds.start}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) return;
                              const end = override?.end ?? reportRange?.end ?? bounds.end;
                              setOverride({ start: isoMin(v, end), end: isoMax(v, end) });
                            }}
                            className="h-7 rounded border border-border/50 bg-white/[0.03] px-2 text-label text-foreground tabular-nums [color-scheme:dark]"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-label text-muted-foreground/70">
                          To
                          <input
                            type="date"
                            min={bounds.start}
                            max={bounds.end}
                            value={override?.end ?? reportRange?.end ?? bounds.end}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) return;
                              const start = override?.start ?? reportRange?.start ?? bounds.start;
                              setOverride({ start: isoMin(start, v), end: isoMax(start, v) });
                            }}
                            className="h-7 rounded border border-border/50 bg-white/[0.03] px-2 text-label text-foreground tabular-nums [color-scheme:dark]"
                          />
                        </label>
                        {override && (
                          <button
                            onClick={() => setOverride(null)}
                            className="text-label font-medium text-primary/80 hover:text-primary transition-colors"
                          >
                            Reset to global range
                          </button>
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-label text-muted-foreground/60">
                      Overriding the window here affects this report only — the global date filter is untouched. Sections still summarize each item's full flight; this import has no daily grain.
                    </p>
                  </div>

                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5 w-fit">
                    <button
                      onClick={() => setMode("internal")}
                      aria-pressed={mode === "internal"}
                      className={cn("flex items-center gap-1.5 h-8 px-3 rounded text-label font-medium transition-colors", mode === "internal" ? "bg-white/[0.06] text-foreground" : "text-muted-foreground/70 hover:text-foreground")}
                    >
                      <Building2 className="w-3 h-3" /> Internal dashboard
                    </button>
                    <button
                      onClick={() => setMode("client")}
                      aria-pressed={mode === "client"}
                      className={cn("flex items-center gap-1.5 h-8 px-3 rounded text-label font-medium transition-colors", mode === "client" ? "bg-white/[0.06] text-foreground" : "text-muted-foreground/70 hover:text-foreground")}
                    >
                      <Users className="w-3 h-3" /> Client-facing
                    </button>
                  </div>

                  {/* Document preview */}
                  <div className="rounded-xl border border-border/40 bg-white/[0.015] overflow-hidden">
                    <div className="px-6 py-5 border-b border-border/30 bg-gradient-to-br from-primary/[0.05] to-transparent">
                      <div className="flex items-center gap-2 mb-3">
                        <Palette className="w-3.5 h-3.5 text-primary" />
                        <span className="text-label font-semibold text-foreground">{brandLabel}</span>
                        <span className="text-label-xs font-mono uppercase tracking-widest text-muted-foreground/60">{brandSub}</span>
                      </div>
                      <div className="text-label font-mono uppercase tracking-widest text-muted-foreground/70">Creative Signal Report</div>
                      <h2 className="text-section font-semibold text-foreground mt-1">{acct.name} · {acct.platform}</h2>
                      {reportRange && (
                        <div className="text-label text-muted-foreground/80 tabular-nums mt-1">{formatIsoRange(reportRange)}</div>
                      )}
                    </div>

                    <div className="px-6 py-5">
                      <div className="text-label font-mono uppercase tracking-widest text-muted-foreground/60 mb-3">
                        Contents · {rb.report_sections.length - excludedSections.size} of {rb.report_sections.length} sections included
                      </div>
                      <ol className="space-y-1.5">
                        {rb.report_sections.map((s, i) => {
                          const included = !excludedSections.has(s);
                          return (
                            <li key={s} className="flex items-center gap-3 py-2 border-b border-border/15 last:border-b-0">
                              <span className="w-6 h-6 rounded-md bg-white/[0.04] border border-border/40 flex items-center justify-center text-label font-mono text-muted-foreground/70 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                              <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={included}
                                  onChange={() => toggleSection(s)}
                                  className="w-3.5 h-3.5 rounded border-border/60 bg-white/[0.04] accent-[hsl(var(--primary))] shrink-0"
                                />
                                <span className={cn("text-body font-medium", included ? "text-foreground" : "text-muted-foreground/50 line-through")}>{s}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>

                  <p className="text-label text-muted-foreground/70">
                    Preview reflects section order and branding only. Section content is composed from the account's analysis and strategy — no independent analysis is run here.
                  </p>

                  {/* Generate: persists a snapshot to Report History + downloads it */}
                  <div className="rounded-lg border border-border/40 bg-white/[0.02] px-4 py-3.5">
                    {(() => {
                      const defaultFormat = settings?.default_format ?? rb.export_formats[0] ?? "pdf";
                      const chosenFormat =
                        formatOverride && rb.export_formats.includes(formatOverride)
                          ? formatOverride
                          : defaultFormat;
                      return (
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => handleGenerate(rb.report_sections, chosenFormat)}
                            disabled={generating || rb.report_sections.length - excludedSections.size === 0}
                            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-body font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {generating ? "Generating…" : "Generate report"}
                          </button>
                          <div
                            role="radiogroup"
                            aria-label="Download format"
                            className="flex items-center gap-1 rounded-md border border-border/40 p-0.5"
                          >
                            {rb.export_formats.map((f) => (
                              <button
                                key={f}
                                role="radio"
                                aria-checked={chosenFormat === f}
                                onClick={() => setFormatOverride(f)}
                                disabled={generating}
                                className={cn(
                                  "flex items-center gap-1 h-7 px-2.5 rounded text-label font-medium transition-colors disabled:opacity-60",
                                  chosenFormat === f
                                    ? "bg-white/[0.06] text-foreground"
                                    : "text-muted-foreground/70 hover:text-foreground"
                                )}
                              >
                                {FORMAT_LABEL[f] ?? f}
                                {f === defaultFormat && (
                                  <span className="text-label-xs font-normal text-muted-foreground/60">default</span>
                                )}
                              </button>
                            ))}
                          </div>
                          <span className="text-label text-muted-foreground/70">
                            Saves the composed document to Report History and downloads it as {FORMAT_LABEL[chosenFormat] ?? chosenFormat}.
                            {chosenFormat !== defaultFormat && " Your default in Report Settings is unchanged."}
                          </span>
                        </div>
                      );
                    })()}
                    {rb.report_sections.length - excludedSections.size === 0 && (
                      <p className="mt-2 text-label text-amber-400/90">Include at least one section to generate a report.</p>
                    )}
                    {generatedOk && (
                      <p className="mt-2 text-label text-emerald-400 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Report saved.
                        <Link to="/app/reports/history" className="underline underline-offset-2 hover:text-emerald-300">View it in Report History</Link>
                      </p>
                    )}
                  </div>

                  <CrossLink to="/app/reports/history" label="See previously generated reports" />
                </>
              )}

              {tab === "branding" && (
                <>
                  <SectionCard title="Branding" desc="Report white-labeling for client delivery.">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", "border-primary/25 bg-primary/8")}>
                        <Palette className="w-3.5 h-3.5 text-primary" />
                        <div>
                          <div className="text-label font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                          <div className="text-label text-muted-foreground/70">Default on first load</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-label text-muted-foreground/80">
                        <Check className={cn("w-3.5 h-3.5", rb.white_label_supported ? "text-emerald-400" : "text-muted-foreground/70")} />
                        White-label {rb.white_label_supported ? "supported" : "unavailable"}
                      </div>
                    </div>
                    <div className="mt-3">
                      <CaveatNote text={rb.logo_policy} />
                    </div>
                  </SectionCard>

                  <SectionCard title="Export" desc="Deliver the composed report in the client's preferred format.">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rb.export_formats.map((f) => (
                        <button
                          key={f}
                          onClick={() => handleExport(f)}
                          disabled={exporting !== null}
                          className={cn(
                            "flex items-center gap-1.5 h-9 px-3.5 rounded-md border text-body font-medium transition-colors disabled:opacity-60",
                            exported === f
                              ? "border-emerald-400/30 text-emerald-400 bg-emerald-400/5"
                              : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5"
                          )}
                        >
                          {exporting === f ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : exported === f ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <FileDown className="w-3.5 h-3.5" />
                          )}
                          {FORMAT_LABEL[f] ?? f}
                          {exported === f && <span className="text-label font-normal text-emerald-400/80">downloaded</span>}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2.5 text-label text-muted-foreground/70">
                      Exports use the current preview mode: {mode === "internal" ? "Internal dashboard (Metrix branding)" : `Client-facing (white-labeled for ${acct.name})`}.
                    </p>
                    <div className="mt-3">
                      <CrossLink to="/app/reports/exports" label="Manage export formats & destinations" />
                    </div>
                  </SectionCard>

                  <button
                    onClick={() => setTab("preview")}
                    className="inline-flex items-center gap-1.5 text-label font-medium text-primary/80 hover:text-primary transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> Back to report preview
                  </button>
                </>
              )}
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
