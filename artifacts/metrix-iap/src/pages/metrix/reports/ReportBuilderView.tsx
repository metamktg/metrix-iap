// @refresh reset
// ─── Reports · Report Builder — the canvas's reports screen ──────────
// Two-column composition: audience + sections + window + generate on
// the left rail, a LIVE document preview on the right rendered from the
// same buildReportModel output that generation persists — the preview
// IS the document, not a mock. Sub-tab 2 keeps Branding & export.

import { useMemo, useRef, useState } from "react";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { buildReportModel, downloadReportExport, serializeReportModel, parseReportModel, type ReportBlock, type ReportModel } from "@/lib/reportExport";
import { ModuleHeader, ModuleScopeGate, SectionCard, ModuleTabs, CaveatNote, PendingState, CrossLink, fmtUSD, fmtNum, fmtPct } from "../shared";
import { TYPE } from "../typography";
import { useDateRange, formatIsoRange, isoMin, isoMax, type IsoRange } from "@/contexts/DateRangeContext";
import { cn } from "@workspace/command-deck/lib/utils";
import { FileText, FileDown, Palette, Check, Eye, Building2, Users, Loader2, CalendarRange, Sparkles } from "lucide-react";
import {
  useGetReportSettings,
  useCreateWorkspaceReport,
  getListWorkspaceReportsQueryKey,
  type GeneratedReportCreateInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@workspace/command-deck/hooks/use-toast";
import { Link } from "wouter";
import { FORMAT_LABEL } from "./reportFormatLabels";

const SECTION = "Reports · 07";

type Tab = "preview" | "branding";
type Mode = "internal" | "client";

// ─── Live preview blocks — the canvas's document body ─────────────────
// Renders the real ReportModel blocks compactly: text as prose, stats
// as the canvas's figure boxes, tables as nc-tables (first rows, with
// an honest "+N more in the export" note), bar charts as scaled rows.

const PREVIEW_TABLE_ROWS = 6;

function fmtChartValue(unit: "usd" | "num" | "pct", v: number): string {
  return unit === "usd" ? fmtUSD(v, v >= 100 ? 0 : 2) : unit === "pct" ? fmtPct(v) : fmtNum(v);
}

function blockVizNote(b: ReportBlock): string {
  switch (b.kind) {
    case "stats": return `${b.items.length} figures`;
    case "table": return `table · ${b.rows.length} rows`;
    case "chart": return "bar chart";
    default: return "";
  }
}

function PreviewBlock({ block }: { block: ReportBlock }) {
  if (block.kind === "text") {
    return <p className={cn(TYPE.body, "text-muted-foreground/80 leading-relaxed max-w-[74ch] mb-2.5")}>{block.text}</p>;
  }
  if (block.kind === "stats") {
    return (
      <div className="flex gap-2 flex-wrap mb-2.5">
        {block.items.map((it) => (
          // Figure boxes pop back out to the card-chrome surface tone
          // against the body's recessed background — the third tier of
          // the wrapper(surface)/body(bg)/figure(surface) layering.
          <div key={it.label} className="flex-1 min-w-[130px] rounded-lg border border-border/40 bg-card px-3 py-2.5">
            <div className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{it.label}</div>
            <div className={cn("text-cardtitle font-medium text-foreground tabular-nums")}>{it.value}</div>
          </div>
        ))}
      </div>
    );
  }
  if (block.kind === "table") {
    const shown = block.rows.slice(0, PREVIEW_TABLE_ROWS);
    return (
      <div className="mb-2.5">
        {block.caption && <p className={cn(TYPE.label, "text-muted-foreground/75 mb-1.5")}>{block.caption}</p>}
        <div className="overflow-x-auto">
          <table className="nc-table">
            <thead>
              <tr>{block.headers.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={cn(j > 0 && "tabular-nums text-muted-foreground/80")}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {block.rows.length > shown.length && (
          <p className={cn(TYPE.label, "text-muted-foreground/75 mt-1.5")}>+{block.rows.length - shown.length} more rows in the export</p>
        )}
      </div>
    );
  }
  // chart (bar)
  const max = Math.max(...block.data.map((d) => d.value), 0);
  return (
    <div className="mb-2.5">
      <p className={cn(TYPE.label, "text-muted-foreground/75 mb-1.5")}>{block.title}</p>
      {block.caption && (
        <p className={cn(TYPE.microLabel, "text-muted-foreground/60 mb-1.5")}>{block.caption}</p>
      )}
      <div className="flex flex-col gap-1.5">
        {block.data.map((d) => (
          <div key={d.label} className="grid grid-cols-[minmax(100px,150px)_1fr_minmax(64px,90px)] items-center gap-2.5">
            <span className={cn(TYPE.label, "text-foreground/75 truncate")}>{d.label}</span>
            <div className="h-2 rounded bg-foreground/[0.04] overflow-hidden">
              <div className="h-full rounded bg-primary/60" style={{ width: `${max > 0 ? Math.max((d.value / max) * 100, 1.5) : 0}%` }} />
            </div>
            <span className={cn(TYPE.label, "text-right tabular-nums text-muted-foreground/75")}>{fmtChartValue(block.unit, d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportPreviewPane({ model, audienceLabel }: { model: ReportModel; audienceLabel: string }) {
  // Kicker: real account name + selected window, not a static string.
  const kicker = model.windowLabel ? `${model.accountName} · ${model.windowLabel}` : model.accountName;
  // Title: audience-differentiated, matching the real client/internal
  // distinction the audience selector on the left already carries.
  const title = model.mode === "client"
    ? "What we learned and what happens next"
    : "Full-window performance & strategy record";
  return (
    // Card chrome sits at the surface tone; the body below resets to the
    // recessed background tone so it reads as a sunken sheet inside it —
    // matching the canvas's wrapper(surface)/body(bg) contrast.
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden min-w-0" data-testid="report-live-preview">
      <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-border/30 flex-wrap">
        <span className={cn(TYPE.caption, "text-muted-foreground/75 flex gap-1.5")}>
          <span>Preview</span><span>·</span>
          <span>{model.sections.length} section{model.sections.length === 1 ? "" : "s"}</span>
          {model.windowLabel && (<><span>·</span><span className="tabular-nums">{model.windowLabel}</span></>)}
        </span>
        <span className="mx-inline-badge">{audienceLabel}</span>
      </div>
      <div className="px-5 py-5 bg-background">
        <div className={cn(TYPE.label, "font-semibold uppercase tracking-[0.14em] text-interactive/80 mb-1")}>{kicker}</div>
        <h2 className={TYPE.title}>{title}</h2>
        <p className={cn(TYPE.body, "text-muted-foreground/75 mt-1.5 max-w-[70ch]")}>{model.brandLine}</p>

        {model.sections.map((s) => (
          <div key={s.title} className="border-t border-border/25 pt-3.5 mt-4">
            <div className="flex items-baseline justify-between gap-2.5 mb-2">
              <span className={cn(TYPE.body, "font-semibold text-foreground")}>{s.title}</span>
              {s.blocks[0] && blockVizNote(s.blocks[0]) && (
                <span className={cn(TYPE.label, "text-muted-foreground/75")}>{blockVizNote(s.blocks.find((b) => b.kind !== "text") ?? s.blocks[0])}</span>
              )}
            </div>
            {s.blocks.map((b, i) => <PreviewBlock key={i} block={b} />)}
          </div>
        ))}

        <p className={cn(TYPE.label, "text-muted-foreground/75 border-t border-border/25 pt-3 mt-4")}>{model.footerNote}</p>
      </div>
    </div>
  );
}

export function ReportBuilderView() {
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
  const [exportedGoogleDocUrl, setExportedGoogleDocUrl] = useState<string | null>(null);
  // Section selection: all template sections are included by default;
  // unchecking removes them from the generated document only.
  const [excludedSections, setExcludedSections] = useState<Set<string>>(new Set());
  const [generatedOk, setGeneratedOk] = useState(false);
  const [generatedGoogleDocUrl, setGeneratedGoogleDocUrl] = useState<string | null>(null);
  // Per-report format override: null = follow the workspace default from
  // Report Settings. Choosing here never changes the saved default.
  const [formatOverride, setFormatOverride] = useState<string | null>(null);

  // Report window: inherits the global date range by default; a per-report
  // override applies to this report composition only (never the global filter).
  const { range: globalRange, bounds, rangeLabel } = useDateRange();
  const [override, setOverride] = useState<IsoRange | null>(null);
  const reportRange = override ?? globalRange;

  const { data: settings } = useGetReportSettings(manager.id);
  // Double-tap guard: generateFireRef blocks a second createReport() call
  // synchronously (before any re-render); generateFiring drives the disabled
  // state so the button disables in the very next render triggered by
  // setGenerateFiring(true) — before mutation.isPending catches up.
  const generateFireRef = useRef(false);
  const [generateFiring, setGenerateFiring] = useState(false);

  const { mutate: createReport, isPending: generating } = useCreateWorkspaceReport({
    mutation: {
      onSuccess: async (result) => {
        generateFireRef.current = false;
        setGenerateFiring(false);
        await queryClient.invalidateQueries({
          queryKey: getListWorkspaceReportsQueryKey(manager.id),
        });
        setGeneratedOk(true);
        setGeneratedGoogleDocUrl(null);
        const model = parseReportModel(result.report.model_json);
        if (model) {
          const outcome = await downloadReportExport(result.report.export_format, model, {
            workspaceId: manager.id,
          });
          if (outcome.kind === "google_doc") {
            setGeneratedGoogleDocUrl(outcome.url);
            toast({
              title: "Report generated",
              description: `"${result.report.title}" was saved to Report History and opened as a Google Doc.`,
              duration: 4000,
            });
          } else {
            const label =
              outcome.kind === "fallback_downloaded"
                ? `${FORMAT_LABEL["google_doc"]} (downloaded as .doc — Google not connected)`
                : (FORMAT_LABEL[result.report.export_format] ?? result.report.export_format);
            toast({
              title: "Report generated",
              description: `"${result.report.title}" was saved to Report History and downloaded as ${label}.`,
              duration: 4000,
            });
          }
        } else {
          toast({
            variant: "destructive",
            title: "Report saved, but the download failed",
            description: `"${result.report.title}" was saved to Report History, but its saved copy can't be read — try generating it again.`,
          });
        }
      },
      onError: () => {
        generateFireRef.current = false;
        setGenerateFiring(false);
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
    if (generateFireRef.current || generating || !adAccountId) return;
    generateFireRef.current = true;
    setGenerateFiring(true);
    const selected = rbSections.filter((s) => !excludedSections.has(s));
    if (selected.length === 0) {
      generateFireRef.current = false;
      setGenerateFiring(false);
      return;
    }
    const windowLabel = reportRange ? formatIsoRange(reportRange) : null;
    const model = buildReportModel(seed, adAccountId, mode, {
      selectedSections: selected,
      windowLabel,
    });
    if (!model) {
      generateFireRef.current = false;
      setGenerateFiring(false);
      return;
    }
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
    setExportedGoogleDocUrl(null);
    try {
      const outcome = await downloadReportExport(format, model, { workspaceId: manager.id });
      setExported(format);
      if (outcome.kind === "google_doc") {
        setExportedGoogleDocUrl(outcome.url);
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <ModuleScopeGate section={SECTION} title="Report Builder" account={account}>
      {() => {
        const acct = account!;
        const rb = getReportBuilder(seed, adAccountId);
        if (!rb) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Report Builder" accountName={acct.name} />
              <PendingState title="Report Builder pending" message="No report template is available for this account yet." icon={FileText}
                action={<CrossLink to="/app/analysis/overview" label="Review Analysis first" />}
              />
            </div>
          );
        }

        const tabs: { id: Tab; label: string; count?: number }[] = [
          { id: "preview", label: "Report preview", count: rb.report_sections.length },
          { id: "branding", label: "Branding & export" },
        ];

        // Live preview: the exact model generation would persist, rebuilt
        // from the current audience/sections/window selections. Null when
        // every section is excluded.
        const selectedSections = rb.report_sections.filter((s) => !excludedSections.has(s));
        const previewModel = selectedSections.length > 0
          ? buildReportModel(seed, adAccountId!, mode, {
              selectedSections,
              windowLabel: reportRange ? formatIsoRange(reportRange) : null,
            })
          : null;
        const audienceLabel = mode === "internal" ? "Internal ops" : "Client-facing";

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Report Builder"
              accountName={acct.name}
              subtitle="Client-ready report · from analysis & strategy"
            />
            <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />

            <div className={cn("px-6 py-5 space-y-5", tab === "preview" ? "max-w-6xl" : "max-w-4xl")}>
              {tab === "preview" && (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-4 items-start">
                  {/* ── Left rail: audience · sections · window · generate ── */}
                  <div className="space-y-4 min-w-0">
                    {/* Audience — the canvas's density/branding selector */}
                    <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-4">
                      <div className="text-cardtitle font-semibold text-foreground mb-0.5">Audience</div>
                      <p className={cn(TYPE.caption, "text-muted-foreground/75 mb-2.5")}>Sets branding and delivery density</p>
                      <div className="flex flex-col gap-1.5">
                        {([
                          { id: "internal" as Mode, Icon: Building2, label: "Internal ops", desc: "Full Metrix branding · internal density" },
                          { id: "client" as Mode, Icon: Users, label: "Client-facing", desc: `White-labeled for ${acct.name}` },
                        ]).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setMode(a.id)}
                            aria-pressed={mode === a.id}
                            className={cn(
                              "pressable-lg flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                              mode === a.id
                                ? "border-primary/45 bg-primary/[0.06]"
                                : "border-border/40 bg-foreground/[0.015] hover:border-primary/25",
                            )}
                          >
                            <span className={cn(TYPE.body, "font-medium text-foreground flex items-center gap-1.5")}>
                              <a.Icon className="w-3.5 h-3.5 text-interactive/70" /> {a.label}
                            </span>
                            <span className={cn(TYPE.caption, "text-muted-foreground/75")}>{a.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sections — the canvas's checklist card */}
                    <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-4">
                      <div className="flex items-baseline justify-between gap-2 mb-2">
                        <div className="text-cardtitle font-semibold text-foreground">Sections</div>
                        <span className={cn(TYPE.label, "text-muted-foreground/75 tabular-nums")}>
                          {rb.report_sections.length - excludedSections.size} of {rb.report_sections.length}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        {rb.report_sections.map((s) => {
                          const included = !excludedSections.has(s);
                          return (
                            <label key={s} className="flex items-center gap-2.5 cursor-pointer select-none py-1.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={included}
                                onChange={() => toggleSection(s)}
                                className="sr-only"
                              />
                              {/* Canvas checkbox spec: a 15x15 colored box with a
                                  checkmark glyph rather than a native control. The
                                  real input above stays in the a11y tree (keyboard
                                  focus, screen-reader checkbox role); this span is
                                  purely decorative. */}
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "flex items-center justify-center w-[15px] h-[15px] rounded-[3px] border shrink-0 transition-colors",
                                  included ? "bg-primary border-primary text-primary-foreground" : "bg-foreground/[0.04] border-border/60"
                                )}
                              >
                                {included && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                              </span>
                              <span className={cn(TYPE.body, "truncate", included ? "text-foreground" : "text-muted-foreground/75 line-through")}>{s}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Report window: inherit global range, allow per-report override */}
                    <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CalendarRange className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
                        <span className="text-label uppercase tracking-widest text-muted-foreground/75">Report window</span>
                        {override && <span className="mx-inline-badge mx-inline-badge--info">Override</span>}
                      </div>
                      {reportRange ? (
                        <div className="text-caption font-medium text-foreground/80 tabular-nums mt-1.5">{formatIsoRange(reportRange)}</div>
                      ) : (
                        <div className="text-caption text-muted-foreground/75 mt-1.5">No data window available</div>
                      )}
                      {!override && (
                        <p className="text-label text-muted-foreground/75 mt-1">inherited from the global date range ({rangeLabel})</p>
                      )}
                      {bounds && (
                        <div className="flex items-center gap-2 flex-wrap mt-2.5">
                          <label className="flex items-center gap-1.5 text-label text-muted-foreground/75">
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
                              className="h-7 rounded border border-border/50 bg-foreground/[0.03] px-2 text-caption text-foreground tabular-nums [color-scheme:dark]"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-label text-muted-foreground/75">
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
                              className="h-7 rounded border border-border/50 bg-foreground/[0.03] px-2 text-caption text-foreground tabular-nums [color-scheme:dark]"
                            />
                          </label>
                          {override && (
                            <button
                              onClick={() => setOverride(null)}
                              className="pressable text-label font-medium text-interactive/80 hover:text-primary transition-colors"
                            >
                              Reset to global range
                            </button>
                          )}
                        </div>
                      )}
                      <p className="mt-2 text-label text-muted-foreground/75">
                        Affects this report only — the global date filter is untouched. Sections still summarize each item's full flight; this import has no daily grain.
                      </p>
                    </div>

                    {/* Generate: persists a snapshot to Report History + downloads it */}
                    <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-4">
                      {(() => {
                        const defaultFormat = settings?.default_format ?? rb.export_formats[0] ?? "pdf";
                        const chosenFormat =
                          formatOverride && rb.export_formats.includes(formatOverride)
                            ? formatOverride
                            : defaultFormat;
                        return (
                          <div className="flex flex-col gap-2.5">
                            <button
                              onClick={() => handleGenerate(rb.report_sections, chosenFormat)}
                              disabled={generating || generateFiring || rb.report_sections.length - excludedSections.size === 0}
                              className="pressable-lg inline-flex items-center justify-center gap-2 h-9 w-full rounded-md bg-primary text-primary-foreground text-body font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              {generating ? "Generating…" : "Generate report"}
                            </button>
                            <div
                              role="radiogroup"
                              aria-label="Download format"
                              className="flex items-center gap-1 rounded-md border border-border/40 p-0.5 w-fit"
                            >
                              {rb.export_formats.map((f) => (
                                <button
                                  key={f}
                                  role="radio"
                                  aria-checked={chosenFormat === f}
                                  onClick={() => setFormatOverride(f)}
                                  disabled={generating}
                                  className={cn(
                                    "pressable flex items-center gap-1 h-7 px-2.5 rounded text-caption font-medium transition-colors disabled:opacity-60",
                                    chosenFormat === f
                                      ? "bg-foreground/[0.06] text-foreground"
                                      : "text-muted-foreground/75 hover:text-foreground"
                                  )}
                                >
                                  {FORMAT_LABEL[f] ?? f}
                                  {f === defaultFormat && (
                                    <span className="text-label font-normal text-muted-foreground/75">default</span>
                                  )}
                                </button>
                              ))}
                            </div>
                            <span className="text-label text-muted-foreground/75">
                              {chosenFormat === "google_doc"
                                ? "Saves to Report History and creates a Google Doc in your Drive."
                                : `Saves the composed document to Report History and downloads it as ${FORMAT_LABEL[chosenFormat] ?? chosenFormat}.`}
                              {chosenFormat !== defaultFormat && " Your default in Report Settings is unchanged."}
                            </span>
                          </div>
                        );
                      })()}
                      {rb.report_sections.length - excludedSections.size === 0 && (
                        <p className="mt-2 text-label text-status-warning/90">Include at least one section to generate a report.</p>
                      )}
                      {generatedOk && (
                        <div className="mt-2 flex flex-col gap-1">
                          <p className="text-caption text-status-success flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" /> Report saved.
                            <Link to="/app/reports/history" className="underline underline-offset-2 hover:text-status-success">View it in Report History</Link>
                          </p>
                          {generatedGoogleDocUrl && (
                            <p className="text-caption text-status-success flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" />
                              <a href={generatedGoogleDocUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-status-success">Open Google Doc</a>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <CrossLink to="/app/reports/history" label="See previously generated reports" />
                  </div>

                  {/* ── Right: live document preview — the real composed model ── */}
                  {previewModel ? (
                    <ReportPreviewPane model={previewModel} audienceLabel={audienceLabel} />
                  ) : (
                    <div className="rounded-xl border border-border/40 bg-foreground/[0.015] p-6">
                      <p className={cn(TYPE.body, "text-muted-foreground/75")}>Include at least one section to preview the report.</p>
                    </div>
                  )}
                </div>
              )}

              {tab === "branding" && (
                <>
                  <SectionCard title="Branding" desc="White-labeling · client delivery">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", "border-primary/25 bg-primary/8")}>
                        <Palette className="w-3.5 h-3.5 text-interactive" />
                        <div>
                          <div className="text-caption font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                          <div className="text-label text-muted-foreground/75">Default on first load</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-caption text-muted-foreground/80">
                        <Check className={cn("w-3.5 h-3.5", rb.white_label_supported ? "text-status-success" : "text-muted-foreground/75")} />
                        White-label {rb.white_label_supported ? "supported" : "unavailable"}
                      </div>
                    </div>
                    <div className="mt-3">
                      <CaveatNote text={rb.logo_policy} />
                    </div>
                  </SectionCard>

                  <SectionCard title="Export" desc="Composed report · client's preferred format">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rb.export_formats.map((f) => (
                        <button
                          key={f}
                          onClick={() => handleExport(f)}
                          disabled={exporting !== null}
                          className={cn(
                            "pressable flex items-center gap-1.5 h-9 px-3.5 rounded-md border text-body font-medium transition-colors disabled:opacity-60",
                            exported === f
                              ? "border-status-success/30 text-status-success bg-status-success/5"
                              : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
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
                          {exported === f && (
                            <span className="text-label font-normal text-status-success/80">
                              {f === "google_doc" && exportedGoogleDocUrl ? "opened" : "downloaded"}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2.5 text-label text-muted-foreground/75">
                      Exports use the current preview mode: {mode === "internal" ? "Internal dashboard (Metrix branding)" : `Client-facing (white-labeled for ${acct.name})`}.
                    </p>
                    {exportedGoogleDocUrl && (
                      <p className="mt-2 text-caption text-status-success flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <a href={exportedGoogleDocUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-status-success">Open Google Doc</a>
                      </p>
                    )}
                    <div className="mt-3">
                      <CrossLink to="/app/exports/reports" label="Manage export formats & destinations" />
                    </div>
                  </SectionCard>

                  <button
                    onClick={() => setTab("preview")}
                    className="pressable inline-flex items-center gap-1.5 text-caption font-medium text-interactive/80 hover:text-primary transition-colors"
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
