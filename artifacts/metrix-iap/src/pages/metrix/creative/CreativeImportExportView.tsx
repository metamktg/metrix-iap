// ─── Creative · Import & Export ─────────────────────────────────────
// Staged creative asset uploads for this account (from Creative Scan or
// the manual-upload flow), and the handoff into Exports for finished
// briefs. Reads the same manual_imports rows Settings → Integrations
// shows for CSV imports, filtered to creative_asset kind.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useListManualImports, getListManualImportsQueryKey } from "@workspace/api-client-react";
import { ModuleHeader, ModuleScopeGate, PendingState, CrossLink } from "../shared";
import { FileImage, ArrowLeftRight } from "lucide-react";

const SECTION = "Creative · 05";

export function CreativeImportExportView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { data } = useListManualImports(account?.id ?? "", {
    query: { queryKey: getListManualImportsQueryKey(account?.id ?? ""), enabled: !!account },
  });
  const creativeAssets = (data?.imports ?? []).filter((i) => i.kind === "creative_asset");

  return (
    <ModuleScopeGate section={SECTION} title="Import & Export" account={account}>
      {() => (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ModuleHeader
            section={SECTION}
            title="Import & Export"
            subtitle="Staged creative asset uploads for this account."
            table="manual_imports"
          />
          <div className="px-6 py-5 space-y-4 max-w-3xl">
            {creativeAssets.length === 0 ? (
              <PendingState
                title="No creative assets staged"
                message="Upload a creative from Creative Scan to see it here."
                icon={FileImage}
                action={<CrossLink to="/app/creative/scan" label="Go to Creative Scan" />}
              />
            ) : (
              <div className="space-y-2.5">
                {creativeAssets.map((imp) => (
                  <div key={imp.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                    <FileImage className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium text-foreground truncate">{imp.filename}</p>
                      <p className="text-label text-muted-foreground/70 mt-0.5">
                        {imp.ad_names.length > 0 ? `Mapped to ${imp.ad_names.join(", ")}` : "Unmapped"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 pt-2">
              <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground/60" />
              <CrossLink to="/app/creative/builder" label="Build finished briefs" />
            </div>
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
