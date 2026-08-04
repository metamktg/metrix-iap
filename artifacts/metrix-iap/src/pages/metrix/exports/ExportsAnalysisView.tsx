// ─── Exports · Analysis ─────────────────────────────────────────────────
// Data-limited JSON export of this account's Analysis data — exactly what
// the Analysis pages already display (performance_by_cell,
// v3_variable_performance), never Metrix's internal scoring/weighting.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { buildExportEnvelope } from "@/lib/jsonExport";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState } from "../shared";
import { DataLimitedCaveat, JsonExportCard } from "./exportsShared";
import { BarChart3 } from "lucide-react";

const SECTION = "Exports · 08";

export function ExportsAnalysisView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Exports · Analysis" account={account}>
      {() => {
        const acct = account!;
        const analysis = getAnalysisData(seed, adAccountId);

        if (!analysis || analysis.performance_by_cell.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Exports · Analysis" />
              <ScopeBanner account={acct} />
              <PendingState title="No analysis data yet" message="Run analysis first — there's nothing to export yet." icon={BarChart3} />
            </div>
          );
        }

        const payload = buildExportEnvelope(acct, {
          performance_by_cell: analysis.performance_by_cell,
          v3_variable_performance: analysis.v3_variable_performance,
        });

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports · Analysis"
              subtitle="Performance-by-cell and variable-performance data, as shown in Analysis."
              table="performance_by_cell, v3_variable_performance"
            />
            <ScopeBanner account={acct} />
            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <DataLimitedCaveat />
              <JsonExportCard
                title="Analysis export"
                desc="Everything the Analysis pages currently show for this account."
                filename={`${acct.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-analysis-export.json`}
                data={payload}
                fieldSummary={[
                  `${analysis.performance_by_cell.length} cell performance rows`,
                  `${analysis.v3_variable_performance.length} variable performance rows`,
                ]}
              />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
