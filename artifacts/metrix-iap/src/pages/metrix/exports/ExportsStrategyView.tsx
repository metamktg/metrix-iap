// ─── Exports · Strategy JSON ─────────────────────────────────────────────
// Data-limited JSON export of this account's Strategy data — exactly what
// the Strategy pages already display (message_pillars, active_hypotheses),
// never Metrix's internal scoring/weighting.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { buildExportEnvelope } from "@/lib/jsonExport";
import { ModuleHeader, ModuleScopeGate, PendingState } from "../shared";
import { DataLimitedCaveat, JsonExportCard } from "./exportsShared";
import { FileJson } from "lucide-react";

const SECTION = "Exports · 08";

export function ExportsStrategyView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Strategy JSON" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);

        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Strategy JSON" />
              <PendingState title="No strategy data yet" message="Generate strategy first — there's nothing to export yet." icon={FileJson} />
            </div>
          );
        }

        const payload = buildExportEnvelope(acct, {
          message_pillars: strategy.message_pillars,
          active_hypotheses: strategy.active_hypotheses,
        });

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Strategy JSON"
              subtitle="Message pillars and active hypotheses, as shown in Strategy."
              table="message_pillars, active_hypotheses"
            />
            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <DataLimitedCaveat />
              <JsonExportCard
                title="Strategy export"
                desc="Everything the Strategy pages currently show for this account."
                filename={`${acct.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-strategy-export.json`}
                data={payload}
                fieldSummary={[
                  `${strategy.message_pillars.length} message pillars`,
                  `${strategy.active_hypotheses.length} active hypotheses`,
                ]}
              />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
