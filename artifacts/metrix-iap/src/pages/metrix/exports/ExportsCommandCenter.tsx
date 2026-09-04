// ─── Exports · Command Center ───────────────────────────────────────────
// The parent /app/exports route. Lets advanced users take this account's
// analysis, strategy, briefs, and reports out of Metrix — data-limited
// JSON for analysis/strategy/briefs (strictly what the interface already
// shows), real file exports for reports (already built, see
// ExportsReportsView). No premium gating during open beta.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import { ModuleHeader, ModuleScopeGate, StageLoopHub, buildLoopStages } from "../shared";
import { DataLimitedCaveat } from "./exportsShared";
import { AnalysisExportCard, StrategyExportCard, BriefExportCard, ReportsExportCard } from "./ExportsCards";

const SECTION = "Exports · 09";


export function ExportsCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);

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
            {/* No `current`: Exports isn't one of the 6 loop stages, so no
                stage should read as "active" while viewing this page. */}
            <StageLoopHub stages={buildLoopStages(status)} />

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              {/* Execution card: verb title + input-metric tiles — canvas's
                  Command Center Execution-card pattern (see exports.cc). No
                  primary action here: unlike Generate/Build, there's no single
                  unified "export bundle" operation — each real export lives on
                  its own child page below, so the hub grid is the action. */}

              {/* The four exports, on this page. They were four one-card pages
                  behind a grid that only named them. */}
              <DataLimitedCaveat />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start" data-testid="exports-cards">
                <AnalysisExportCard account={acct} />
                <StrategyExportCard account={acct} />
                <BriefExportCard account={acct} />
                <ReportsExportCard account={acct} />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
