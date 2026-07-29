// ─── Exports · Strategy JSON ────────────────────────────────────────

import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { ModuleHeader, SectionCard, PendingState } from "../shared";
import { useExportsEnabled, ExportsLocked, useExportAccountPicker } from "./exportsShared";
import { buildStrategyExport, downloadJson } from "@/lib/dataExport";
import { Download, Compass } from "lucide-react";

const SECTION = "Exports · 08";

export function ExportsStrategyView() {
  const enabled = useExportsEnabled();
  const seed = useMetrixSeed();
  const { selectedId, picker } = useExportAccountPicker();
  const payload = selectedId ? buildStrategyExport(seed, selectedId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="Strategy JSON" subtitle="Message pillars, hypotheses, and avatars/ICP/PMF." />
      <div className="px-6 py-5 space-y-4 max-w-3xl">
        {!enabled ? (
          <ExportsLocked />
        ) : (
          <SectionCard title="Choose an account" right={picker}>
            {!payload ? (
              <PendingState title="No strategy data" message="This account has no generated strategy to export yet." icon={Compass} />
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/75">
                  {payload.message_pillars.length} pillars · {payload.hypotheses.length} hypotheses · {payload.avatars.length} avatars
                </span>
                <button
                  onClick={() => downloadJson(`metrix-strategy-${selectedId}.json`, payload)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}
