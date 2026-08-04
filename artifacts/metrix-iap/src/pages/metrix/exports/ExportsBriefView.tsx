// ─── Exports · Brief ──────────────────────────────────────────────────
// Data-limited JSON export of this account's draft briefs — exactly what
// the Brief Builder page already displays. `full_brief` (the raw Brief
// Builder document) is deliberately excluded: it isn't rendered anywhere
// in the Brief Builder UI today, so it doesn't qualify as "already shown."

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import { buildExportEnvelope } from "@/lib/jsonExport";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState } from "../shared";
import { DataLimitedCaveat, JsonExportCard } from "./exportsShared";
import { FileStack } from "lucide-react";

const SECTION = "Exports · 08";

export function ExportsBriefView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Exports · Brief" account={account}>
      {() => {
        const acct = account!;
        const briefBuilder = getBriefBuilder(seed, adAccountId);

        if (!briefBuilder || briefBuilder.draft_briefs.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Exports · Brief" />
              <ScopeBanner account={acct} />
              <PendingState title="No briefs yet" message="Build a brief first — there's nothing to export yet." icon={FileStack} />
            </div>
          );
        }

        const draftBriefs = briefBuilder.draft_briefs.map(({ full_brief: _fullBrief, ...displayed }) => displayed);
        const payload = buildExportEnvelope(acct, { draft_briefs: draftBriefs });

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports · Brief"
              subtitle="Draft briefs, as shown in Brief Builder."
              table="draft_briefs"
            />
            <ScopeBanner account={acct} />
            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <DataLimitedCaveat />
              <JsonExportCard
                title="Brief export"
                desc="Everything the Brief Builder page currently shows for this account."
                filename={`${acct.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-brief-export.json`}
                data={payload}
                fieldSummary={[`${draftBriefs.length} draft briefs`]}
              />
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
