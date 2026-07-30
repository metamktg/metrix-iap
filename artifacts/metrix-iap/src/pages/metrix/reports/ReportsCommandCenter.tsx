// ─── Reports · Command Center ──────────────────────────────────────────
// The parent /app/reports route. Agency-scoped (not tied to one ad
// account): a dashboard of every generated report plus the "Build new
// report" entry point. Gated on at least one account in the workspace
// having analysis data — reports have nothing to summarize otherwise.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccounts, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { useListWorkspaceReports } from "@workspace/api-client-react";
import { ModuleHeader, PrerequisiteGate, CrossLink, PendingState } from "../shared";
import { FileBarChart, Settings2, History, FileText } from "lucide-react";

const SECTION = "Reports · 07";

const CHILDREN = [
  { to: "/app/reports/builder", label: "Report Builder", Icon: FileText, desc: "White-label and curate a report for a specific meeting objective." },
  { to: "/app/reports/configuration", label: "Configuration", Icon: Settings2, desc: "Default template and scheduled-send settings." },
  { to: "/app/reports/history", label: "History", Icon: History, desc: "Every report generated for this workspace." },
];

export function ReportsCommandCenter() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const adAccounts = getAdAccounts(seed);
  const hasAnyAnalysis = adAccounts.some((a) => getAnalysisData(seed, a.id) != null);
  const { data: generatedData } = useListWorkspaceReports(manager.id);
  const recent = [...(generatedData?.reports ?? [])]
    .sort((a, b) => b.generated_at.localeCompare(a.generated_at))
    .slice(0, 3);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Reports"
        subtitle="Client-ready presentation, curated from validated analysis across the workspace."
      />
      <div className="px-6 py-5 space-y-4 max-w-3xl">
        <PrerequisiteGate
          met={hasAnyAnalysis}
          title="No analysis data yet"
          message="No account in this workspace has analysis data to report on yet."
          ctaLabel="Go to an account's Analysis"
          ctaTo="/app/analysis"
        >
          {() => (
            <>
              <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Recent reports</div>
                {recent.length === 0 ? (
                  <PendingState title="No reports yet" message="Build your first report from the Report Builder." icon={FileBarChart} />
                ) : (
                  <div className="space-y-2">
                    {recent.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/20 last:border-0">
                        <span className="text-[12px] text-foreground/85 truncate">{r.title}</span>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">{new Date(r.generated_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CHILDREN.map((c) => (
                  <div key={c.to} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <c.Icon className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-foreground">{c.label}</div>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{c.desc}</p>
                      </div>
                    </div>
                    <CrossLink to={c.to} label="Open" />
                  </div>
                ))}
              </div>
            </>
          )}
        </PrerequisiteGate>
      </div>
    </div>
  );
}
