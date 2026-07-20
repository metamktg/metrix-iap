// ─── Reports · Hub (/app/reports) ─────────────────────────────────────
// Command center for the Reports layer: loop-stage gate, quick-generate
// action (inline mode picker → compose + save + download), recent report
// list from the live API, and quick-nav to all report sub-pages.
// Mirrors the report-generation pattern introduced into LoopCommandChain.

import { useRef, useState } from "react";
import { TYPE } from "../typography";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount,
  getBriefBuilder,
  getReportBuilder,
  getReportHistory,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader,
  ModuleScopeGate,
  PendingState,
  CrossLink,
  SectionCard,
} from "../shared";
import {
  useListWorkspaceReports,
  useCreateWorkspaceReport,
  getListWorkspaceReportsQueryKey,
  type GeneratedReportCreateInput,
} from "@workspace/api-client-react";
import {
  buildReportModel,
  serializeReportModel,
  downloadReportExport,
  parseReportModel,
} from "@/lib/reportExport";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FileText,
  ArrowUpRight,
  Sparkles,
  Calendar,
  FileDown,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

const SECTION = "Report Builder · 06";

// ── Helpers ───────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Quick-generate widget ─────────────────────────────────────────────
// Mirrors the report-generation action in LoopCommandChain: mode picker →
// compose → save to DB → auto-download. Shown when briefsComplete.

function QuickGenerate({
  managerId,
  adAccountId,
}: {
  managerId: string;
  adAccountId: string;
}) {
  const seed = useMetrixSeed();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<"internal" | "client">("internal");
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fireRef = useRef(false);

  const { mutate: createReport } = useCreateWorkspaceReport({
    mutation: {
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: getListWorkspaceReportsQueryKey(managerId),
        });
        const model = parseReportModel(result.report.model_json);
        if (model) {
          await downloadReportExport(result.report.export_format, model);
        }
        setGenerating(false);
        setDone(true);
        fireRef.current = false;
        toast({
          title: "Report generated",
          description: `"${result.report.title}" was saved to Report History.`,
          duration: 4000,
        });
      },
      onError: (err) => {
        const msg =
          err instanceof Error
            ? err.message
            : "Could not generate the report — please try again.";
        setError(msg);
        setGenerating(false);
        fireRef.current = false;
      },
    },
  });

  function handleGenerate() {
    if (fireRef.current) return;
    const rb = getReportBuilder(seed, adAccountId);
    if (!rb) return;
    const model = buildReportModel(seed, adAccountId, mode, {
      selectedSections: rb.report_sections,
    });
    if (!model) return;
    fireRef.current = true;
    setGenerating(true);
    setError(null);
    setDone(false);
    const branding = mode === "internal" ? "metrix" : "white_label";
    const body: GeneratedReportCreateInput = {
      ad_account_id: adAccountId,
      title: model.docTitle,
      mode,
      branding,
      export_format:
        (rb.export_formats[0] ?? "pdf") as GeneratedReportCreateInput["export_format"],
      section_count: rb.report_sections.length,
      range_start: null,
      range_end: null,
      range_source: null,
      summary: `${rb.report_sections.length} sections · ${mode === "internal" ? "internal" : "client-facing"} delivery.`,
      model_json: serializeReportModel(model),
    };
    createReport({ workspaceId: managerId, data: body });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
          <span className={cn(TYPE.body, "text-emerald-400/80 font-medium")}>
            Report saved &amp; downloaded
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/app/reports/history"
            className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-primary-btn"
          >
            View History
          </a>
          <button
            onClick={() => setDone(false)}
            className="inline-flex items-center gap-1.5 text-label font-semibold px-2.5 py-1.5 rounded-lg mx-secondary-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" /> New Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mode picker */}
      <div className="space-y-1.5">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40">
          Delivery mode
        </p>
        <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5 w-fit">
          {(["internal", "client"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={generating}
              className={cn(
                "h-6 px-2.5 rounded text-[10px] font-semibold transition-colors",
                mode === m
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground/60 hover:text-foreground",
                generating && "pointer-events-none",
              )}
            >
              {m === "internal" ? "Internal" : "Client-facing"}
            </button>
          ))}
        </div>
        <p className={cn(TYPE.caption, "text-muted-foreground/50")}>
          {mode === "internal"
            ? "Full Metrix branding · for the agency dashboard"
            : "White-labeled for the client · removes Metrix marks"}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400/70 mt-0.5 shrink-0" />
          <p className={cn(TYPE.label, "text-red-300/70 leading-relaxed")}>
            {error}
          </p>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating}
        className={cn(
          "inline-flex items-center gap-1.5 text-label font-semibold px-3 py-2 rounded-lg w-fit mx-primary-btn",
          generating && "opacity-60 cursor-not-allowed",
        )}
      >
        {generating ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Composing report…
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" /> Generate Report
          </>
        )}
      </button>
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────

export function ReportsHub() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { manager } = useAccount();

  // Live generated reports (scoped to this workspace)
  const { data: liveReportsData } = useListWorkspaceReports(manager.id);

  return (
    <ModuleScopeGate section={SECTION} title="Report Builder" account={account}>
      {() => {
        const acct = account!;
        const seedHistory = getReportHistory(seed, adAccountId);

        // Live reports filtered to this ad account
        const liveReports = (liveReportsData?.reports ?? []).filter(
          (r) => r.ad_account_id === adAccountId,
        );

        // Stage completion — mirrors LoopCommandChain
        const briefCount = getBriefBuilder(seed, adAccountId)?.draft_briefs?.length ?? 0;
        const briefsComplete = briefCount > 0;
        const reportComplete = liveReports.length > 0;

        // Recent list: live API rows take priority over seed history entries
        type ReportRow = {
          id: string;
          title: string;
          mode: string;
          date_label: string;
          generated_at: string;
          export_format: string | null;
          is_live: boolean;
        };

        const recentRows: ReportRow[] = liveReports.length > 0
          ? liveReports
              .slice()
              .sort((a, b) => b.generated_at.localeCompare(a.generated_at))
              .map((r) => ({
                id: String(r.id),
                title: r.title,
                mode: r.mode,
                date_label:
                  r.range_start && r.range_end
                    ? `${fmtDate(r.range_start)} – ${fmtDate(r.range_end)}`
                    : r.range_start
                    ? `From ${fmtDate(r.range_start)}`
                    : "",
                generated_at: r.generated_at,
                export_format: r.export_format,
                is_live: true,
              }))
          : seedHistory
              .slice()
              .sort((a, b) =>
                (b.generated_at ?? "").localeCompare(a.generated_at ?? ""),
              )
              .map((r) => ({
                id: r.id,
                title: r.title,
                mode: r.mode ?? "internal",
                date_label: "",
                generated_at: r.generated_at ?? "",
                export_format: r.export_format ?? null,
                is_live: false,
              }));

        const totalCount = liveReports.length > 0
          ? liveReports.length
          : seedHistory.length;
        const internalCount = recentRows.filter(
          (r) => r.mode === "internal",
        ).length;
        const clientCount = recentRows.filter(
          (r) => r.mode === "client",
        ).length;

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="Report Builder"
              account={acct}
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-3xl">
              {/* KPI strip */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    label: "Reports",
                    value: totalCount,
                    color: "text-foreground",
                  },
                  {
                    label: "Internal",
                    value: internalCount,
                    color: "text-muted-foreground",
                  },
                  {
                    label: "Client-facing",
                    value: clientCount,
                    color: "text-primary",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <p
                      className={cn(
                        TYPE.label,
                        "text-muted-foreground/70 mb-1",
                      )}
                    >
                      {kpi.label}
                    </p>
                    <div
                      className={cn(
                        "text-2xl font-bold tabular-nums",
                        kpi.color,
                      )}
                    >
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick generate — shown when briefs are ready */}
              <SectionCard
                title={reportComplete ? "New Report" : "Generate Report"}
                desc={
                  briefsComplete
                    ? "Compose a report from current analysis and strategy"
                    : "Briefs must be complete before generating a report"
                }
              >
                {briefsComplete ? (
                  <QuickGenerate
                    managerId={manager.id}
                    adAccountId={adAccountId!}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/20 shrink-0" />
                      <span
                        className={cn(
                          TYPE.label,
                          "text-muted-foreground/50",
                        )}
                      >
                        Waiting for Briefs stage to complete
                      </span>
                    </div>
                    <CrossLink to="/app/briefs" label="Go to Briefs" />
                  </div>
                )}
              </SectionCard>

              {/* Recent reports */}
              {recentRows.length === 0 ? (
                <PendingState
                  title="No reports yet"
                  message="Generate the first report for this account above or using the full composer."
                  icon={FileText}
                  action={<CrossLink to="/app/reports/new" label="Full composer" />}
                />
              ) : (
                <div className="bg-card/60 border border-border/60 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-border/40">
                    <p className={cn(TYPE.label, "text-muted-foreground/70")}>
                      Recent reports
                    </p>
                    <a
                      href="/app/reports/history"
                      className={cn(
                        TYPE.caption,
                        "text-primary hover:text-primary/80 transition-colors flex items-center gap-1",
                      )}
                    >
                      Full history <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="divide-y divide-border/30">
                    {recentRows.slice(0, 6).map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="shrink-0">
                          {report.is_live ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                TYPE.body,
                                "font-semibold text-foreground truncate",
                              )}
                            >
                              {report.title}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none capitalize",
                                report.mode === "client"
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : "bg-border/20 text-muted-foreground border-border/40",
                              )}
                            >
                              {report.mode === "client"
                                ? "Client-facing"
                                : "Internal"}
                            </span>
                            {report.export_format && (
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-semibold leading-none flex items-center gap-0.5">
                                <FileDown className="w-2.5 h-2.5" />
                                {report.export_format.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {report.date_label && (
                            <div
                              className={cn(
                                TYPE.caption,
                                "flex items-center gap-1.5 text-muted-foreground",
                              )}
                            >
                              <Calendar className="w-2.5 h-2.5" />
                              {report.date_label}
                            </div>
                          )}
                        </div>
                        {report.generated_at && (
                          <div
                            className={cn(
                              TYPE.caption,
                              "text-muted-foreground/60 shrink-0 flex items-center gap-1",
                            )}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {fmtDate(report.generated_at)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    label: "Full Composer",
                    desc: "Section picker · date range · branding options",
                    href: "/app/reports/new",
                  },
                  {
                    label: "Report History",
                    desc: "All generated reports · re-download · delete",
                    href: "/app/reports/history",
                  },
                  {
                    label: "Exports",
                    desc: "Format downloads + delivered exports",
                    href: "/app/reports/exports",
                  },
                  {
                    label: "Settings",
                    desc: "Templates · delivery config · schedule",
                    href: "/app/reports/settings",
                  },
                ].map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3 hover:border-primary/30 hover:bg-card transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          TYPE.body,
                          "font-semibold text-foreground",
                        )}
                      >
                        {l.label}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </div>
                    <p className={cn(TYPE.caption, "text-muted-foreground mt-0.5")}>
                      {l.desc}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
