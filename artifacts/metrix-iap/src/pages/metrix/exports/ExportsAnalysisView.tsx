// ─── Exports · Analysis ─────────────────────────────────────────────

import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { ModuleHeader, SectionCard, PendingState } from "../shared";
import { useExportsEnabled, ExportsLocked, useExportAccountPicker } from "./exportsShared";
import { buildAnalysisExport, downloadJson, downloadCsv } from "@/lib/dataExport";
import { Download, BarChart2 } from "lucide-react";

const SECTION = "Exports · 08";

export function ExportsAnalysisView() {
  const enabled = useExportsEnabled();
  const seed = useMetrixSeed();
  const { selectedId, picker } = useExportAccountPicker();
  const payload = selectedId ? buildAnalysisExport(seed, selectedId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="Analysis" subtitle="Findings, variable codes with plain-language labels, and performance roll-ups." />
      <div className="px-6 py-5 space-y-4 max-w-3xl">
        {!enabled ? (
          <ExportsLocked />
        ) : (
          <SectionCard title="Choose an account" right={picker}>
            {!payload ? (
              <PendingState title="No analysis data" message="This account has no analysis data to export yet." icon={BarChart2} />
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/75">
                  {payload.performance.length} cell rows · {payload.variable_performance.length} variable rows
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadJson(`metrix-analysis-${selectedId}.json`, payload)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> JSON
                  </button>
                  <button
                    onClick={() => downloadCsv(`metrix-analysis-${selectedId}.csv`, payload.performance)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}
