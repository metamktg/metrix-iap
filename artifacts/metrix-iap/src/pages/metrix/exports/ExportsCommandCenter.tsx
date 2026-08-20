// ─── Exports · Command Center ───────────────────────────────────────────
// The parent /app/exports route. Lets advanced users take this account's
// analysis, strategy, briefs, and reports out of Metrix — data-limited
// JSON for analysis/strategy/briefs (strictly what the interface already
// shows), real file exports for reports (already built, see
// ExportsReportsView). No premium gating during open beta.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ModuleScopeGate, HubNavGrid, SectionCard,
  StageLoopHub, buildLoopStages, MetricTile, fmtNum,
} from "../shared";
import { BarChart3, FileJson, FileText, FileStack } from "lucide-react";

const SECTION = "Exports · 08";

const CHILDREN = [
  { to: "/app/exports/analysis", label: "Analysis", Icon: BarChart3, desc: "Performance-by-cell and variable-performance data, as data-limited JSON.", lineage: "analysis.performance_by_cell[] · v3_variable_performance[]" },
  { to: "/app/exports/strategy", label: "Strategy JSON", Icon: FileJson, desc: "Message pillars and active hypotheses, as data-limited JSON.", lineage: "strategy.message_pillars[] · active_hypotheses[]" },
  { to: "/app/exports/reports", label: "Reports", Icon: FileText, desc: "PDF, HTML, and Google Doc export — already available from Report History.", lineage: "workspace_reports[] · pdf · google_doc · html" },
  { to: "/app/exports/brief", label: "Brief", Icon: FileStack, desc: "Draft creative briefs, as data-limited JSON.", lineage: "brief_builder.draft_briefs[]" },
];

export function ExportsCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const reportBuilder = getReportBuilder(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Exports" account={account}>
      {() => {
        const acct = account!;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports"
              accountName={acct.name}
              subtitle="Take this account's analysis, strategy, briefs, and reports out of Metrix."
            />
            <StageLoopHub stages={buildLoopStages(status)} current="reports" />

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              {/* Execution card: verb title + input-metric tiles — canvas's
                  Command Center Execution-card pattern (see exports.cc). No
                  primary action here: unlike Generate/Build, there's no single
                  unified "export bundle" operation — each real export lives on
                  its own child page below, so the hub grid is the action. */}
              <SectionCard
                title="Export bundle"
                desc="Every layer of the loop as raw JSON, versioned per sprint. Exports are read-only snapshots."
              >
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Layers available" value={fmtNum(CHILDREN.length)} />
                  <MetricTile
                    label="Formats"
                    value={reportBuilder ? fmtNum(reportBuilder.export_formats.length) : "—"}
                    sub={reportBuilder && reportBuilder.export_formats.length > 0 ? reportBuilder.export_formats.join(" · ") : undefined}
                  />
                </div>
              </SectionCard>

              <HubNavGrid items={CHILDREN} label="Explore Exports" />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
