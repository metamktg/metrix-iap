// ─── Exports · Command Center ───────────────────────────────────────────
// The parent /app/exports route. Lets advanced users take this account's
// analysis, strategy, briefs, and reports out of Metrix — data-limited
// JSON for analysis/strategy/briefs (strictly what the interface already
// shows), real file exports for reports (already built, see
// ExportsReportsView). No premium gating during open beta.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ModuleScopeGate, HubNavGrid } from "../shared";
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

  return (
    <ModuleScopeGate section={SECTION} title="Exports" account={account}>
      {() => {
        const acct = account!;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports"
              subtitle="Take this account's analysis, strategy, briefs, and reports out of Metrix."
            />
            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <HubNavGrid items={CHILDREN} label="Explore Exports" />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
