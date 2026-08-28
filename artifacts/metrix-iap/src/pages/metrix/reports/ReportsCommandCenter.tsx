// ─── Reports · Command Center ──────────────────────────────────────────
// The parent /app/reports route. Agency-scoped (not tied to one ad
// account): a dashboard of every generated report plus the "Build new
// report" entry point. Gated on at least one account in the workspace
// having analysis data — reports have nothing to summarize otherwise.

import { useLocation } from "wouter";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccounts, getAnalysisData, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import { useListWorkspaceReports } from "@workspace/api-client-react";
import {
  ModuleHeader, PrerequisiteGate, PendingState, HubNavGrid, SectionCard,
  StageLoopHub, buildLoopStages, MetricTile, fmtNum,
} from "../shared";
import { FileBarChart, Settings2, History, FileText, Sparkles } from "lucide-react";

const SECTION = "Reports · 07";

const CHILDREN = [
  { to: "/app/reports/builder", label: "Report Builder", Icon: FileText, desc: "White-label and curate a report for a specific meeting objective.", lineage: "report_builder.report_sections[]" },
  { to: "/app/reports/configuration", label: "Configuration", Icon: Settings2, desc: "Default template and scheduled-send settings.", lineage: "report_settings" },
  { to: "/app/reports/history", label: "History", Icon: History, desc: "Every report generated for this workspace.", lineage: "workspace_reports[] · report_builder.report_history[]" },
];

export function ReportsCommandCenter() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const scopedAdAccountId = useScopedAdAccountId();
  const status = useStageStatus(scopedAdAccountId);
  const [, navigate] = useLocation();
  const adAccounts = getAdAccounts(seed);
  const hasAnyAnalysis = adAccounts.some((a) => getAnalysisData(seed, a.id) != null);
  const { data: generatedData } = useListWorkspaceReports(manager.id);
  const reports = generatedData?.reports ?? [];
  const recent = [...reports].sort((a, b) => b.generated_at.localeCompare(a.generated_at)).slice(0, 3);
  const lastSent = recent[0] ?? null;

  // Sections/formats read from the account "Build report" would actually
  // open: the active scoped account if it has analysis to report on,
  // otherwise the first workspace account that does. Both tiles read "—"
  // rather than guess when no account qualifies — never fabricated.
  const scopedAccount = scopedAdAccountId ? adAccounts.find((a) => a.id === scopedAdAccountId) : undefined;
  const previewAccount =
    (scopedAccount && getAnalysisData(seed, scopedAccount.id) != null ? scopedAccount : undefined) ??
    adAccounts.find((a) => getAnalysisData(seed, a.id) != null);
  const previewRb = previewAccount ? getReportBuilder(seed, previewAccount.id) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Reports"
        subtitle="Client-ready presentation, curated from validated analysis across the workspace."
      />
      <StageLoopHub stages={buildLoopStages(status)} current="reports" />

      <div className="px-6 py-5 space-y-4 max-w-4xl">
        <PrerequisiteGate
          met={hasAnyAnalysis}
          title="No analysis data yet"
          message="No account in this workspace has analysis data to report on yet."
          ctaLabel="Go to an account's Analysis"
          ctaTo="/app/analysis"
        >
          {() => (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <SectionCard title="Build report" desc="Compose the client or internal report from the current loop state.">
                  <div className="grid grid-cols-2 gap-2 mb-3.5">
                    <MetricTile label="Sections" value={previewRb ? fmtNum(previewRb.report_sections.length) : "—"} sub={previewRb ? "available" : undefined} />
                    <MetricTile
                      label="Last sent"
                      value={lastSent ? new Date(lastSent.generated_at).toLocaleDateString() : "Never"}
                      sub={lastSent ? `${lastSent.mode} report` : undefined}
                    />
                    <MetricTile
                      label="Formats"
                      value={previewRb ? fmtNum(previewRb.export_formats.length) : "—"}
                      sub={previewRb && previewRb.export_formats.length > 0 ? previewRb.export_formats.join(" · ") : undefined}
                    />
                    <MetricTile label="On file" value={fmtNum(reports.length)} sub="reports total" />
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/app/reports/builder")}
                    className="inline-flex items-center gap-1.5 text-body font-medium text-interactive border border-primary/30 hover:bg-primary/10 active:bg-primary/20 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Build report
                  </button>
                </SectionCard>

                <SectionCard title="Run history" desc="Every report generated for this workspace, most recent first.">
                  {recent.length === 0 ? (
                    <PendingState title="No reports yet" message="Build your first report from the Report Builder." icon={FileBarChart} />
                  ) : (
                    <div className="flex flex-col">
                      {recent.map((r) => (
                        <div key={r.id} className="flex items-center gap-2.5 py-2 border-t border-border/25 first:border-0 min-w-0">
                          <span className="text-label text-muted-foreground/75 shrink-0">#{r.id}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-body text-foreground/85 truncate">{r.title}</span>
                            <span className="block text-label text-muted-foreground/75">{new Date(r.generated_at).toLocaleDateString()}</span>
                          </span>
                          <span className="mx-inline-badge shrink-0">{r.mode}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <HubNavGrid items={CHILDREN} label="Explore Reports" />
            </>
          )}
        </PrerequisiteGate>
      </div>
    </div>
  );
}
