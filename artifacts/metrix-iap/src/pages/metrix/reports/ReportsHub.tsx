// ─── Reports · Hub (/app/reports) ─────────────────────────────────────
// Command center for the Reports layer:
// pipeline KPIs, recent reports, quick links to all report sub-pages.

import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportHistory, getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader,
  ModuleScopeGate,
  PendingState,
  CrossLink,
} from "../shared";
import { useListWorkspaceReports } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  FileText,
  ArrowUpRight,
  PlusCircle,
  Calendar,
  FileDown,
  Clock,
} from "lucide-react";

const SECTION = "Report Builder · 06";

const STATUS_PILL: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border/40",
  "in-review": "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  exported: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  final: "bg-primary/10 text-primary border-primary/20",
};

const STATUS_BAR: Record<string, string> = {
  draft: "bg-border",
  "in-review": "bg-yellow-400",
  exported: "bg-emerald-500",
  final: "bg-primary",
};

function normalizeStatus(s: string) {
  return s?.toLowerCase().replace(/\s+/g, "-") ?? "draft";
}

export function ReportsHub() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  // Live generated reports — manager id from seed
  const managerId = seed ? getManagerOverview(seed).id : "";
  const { data: liveReports } = useListWorkspaceReports(managerId);

  return (
    <ModuleScopeGate section={SECTION} title="Report Builder" account={account}>
      {() => {
        const acct = account!;
        const seedHistory = getReportHistory(seed, adAccountId);

        // Live generated reports take priority; fall back to seed history
        const reports =
          liveReports && Array.isArray(liveReports) && liveReports.length > 0
            ? liveReports
                .map((r) => ({
                  id: String(r.id),
                  title: r.title ?? "Untitled report",
                  status: (r.status ?? "draft") as string,
                  date_label: r.dateRangeStart
                    ? `${r.dateRangeStart}${r.dateRangeEnd ? ` – ${r.dateRangeEnd}` : ""}`
                    : "",
                  created_at: r.createdAt ?? "",
                  exported: r.exported ?? false,
                }))
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
            : seedHistory.map((r) => ({
                id: r.id,
                title: r.title,
                status: r.status ?? "draft",
                date_label: "",
                created_at: r.generated_at ?? "",
                exported: r.status === "exported",
              }));

        const totalCount = reports.length;
        const exportedCount = reports.filter((r) => r.exported).length;
        const draftCount = reports.filter(
          (r) => normalizeStatus(r.status) === "draft",
        ).length;
        const finalCount = reports.filter((r) => {
          const ns = normalizeStatus(r.status);
          return ns === "exported" || ns === "final";
        }).length;

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="Report Builder"
              account={acct}
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-5xl">
              {/* Header row */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className={cn(TYPE.label, "mb-1")}>Reports · Execution</p>
                  <h1 className="text-xl font-bold text-foreground tracking-tight">
                    Reports
                  </h1>
                  <p className={cn(TYPE.caption, "text-muted-foreground mt-0.5")}>
                    {acct.name} · {totalCount} report
                    {totalCount !== 1 ? "s" : ""} · {exportedCount} exported
                  </p>
                </div>
                <a
                  href="/app/reports/new"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> New Report
                </a>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: "Total", value: totalCount, color: "text-foreground" },
                  { label: "Draft", value: draftCount, color: "text-muted-foreground" },
                  { label: "Final / Sent", value: finalCount, color: "text-[hsl(var(--metrix-success))]" },
                  { label: "Exported", value: exportedCount, color: "text-primary" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <p className={cn(TYPE.label, "text-muted-foreground/70 mb-1")}>
                      {kpi.label}
                    </p>
                    <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent reports */}
              {reports.length === 0 ? (
                <PendingState
                  title="No reports yet"
                  message="Create the first report for this account using the Report Builder."
                  icon={FileText}
                  action={<CrossLink to="/app/reports/new" label="New Report" />}
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
                    {reports.slice(0, 6).map((report) => {
                      const ns = normalizeStatus(report.status);
                      return (
                        <div
                          key={report.id}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <div
                            className={cn(
                              "w-1 h-8 rounded-full shrink-0",
                              STATUS_BAR[ns] ?? "bg-border",
                            )}
                          />
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
                                  "shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-semibold leading-none capitalize",
                                  STATUS_PILL[ns] ?? STATUS_PILL.draft,
                                )}
                              >
                                {report.status}
                              </span>
                              {report.exported && (
                                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-semibold leading-none flex items-center gap-0.5">
                                  <FileDown className="w-2.5 h-2.5" />
                                  Exported
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
                          {report.created_at && (
                            <div
                              className={cn(
                                TYPE.caption,
                                "text-muted-foreground/60 shrink-0 flex items-center gap-1",
                              )}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              {report.created_at.slice(0, 10)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "New Report", desc: "Create a client-ready report", href: "/app/reports/new" },
                  { label: "Report History", desc: "All generated reports", href: "/app/reports/history" },
                  { label: "Exports", desc: "Download + share reports", href: "/app/reports/exports" },
                  { label: "Settings", desc: "Templates + delivery config", href: "/app/reports/settings" },
                ].map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3 hover:border-primary/30 hover:bg-card transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(TYPE.body, "font-semibold text-foreground")}>
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
