// ─── Settings · Integrations ──────────────────────────────────────────
// Connection status for every ad account under the manager, plus the
// manual-import path. Reads the same seed the rest of the app uses.
// Connect / Add import open the guided flows from ConnectAccountDialogs.

import { useState } from "react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccounts } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard } from "../shared";
import { ConnectMetaDialog, ManualImportDialog } from "../ConnectAccountDialogs";
import { MetaLiveConnection } from "./MetaLiveConnection";
import { cn } from "@/lib/utils";
import { Plug, FileUp, CheckCircle2, Circle } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

const SECTION = "Settings · 09";

export function IntegrationsView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const accounts = getAdAccounts(seed);
  const connected = accounts.filter((a) => a.status === "configured");
  const [connectAccount, setConnectAccount] = useState<AdAccount | null>(null);
  const [importAccount, setImportAccount] = useState<AdAccount | null>(null);

  const defaultImportAccount = accounts.find((a) => a.status !== "configured") ?? accounts[0] ?? null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Integrations"
        subtitle={`Data connections across ${manager.name}: ${connected.length} of ${accounts.length} ad accounts connected.`}
      />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <MetaLiveConnection />

        <SectionCard title="Meta ad accounts" desc="Each ad account connects independently; data never crosses accounts.">
          <div className="space-y-2.5">
            {accounts.map((a) => {
              const configured = a.status === "configured";
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                  {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/60 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-foreground">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground/70">
                      {a.platform} · {configured ? (a.source_status ?? "connected") : "not connected"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none shrink-0",
                      configured
                        ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
                        : "text-muted-foreground/70 border-border/40 bg-white/[0.03]"
                    )}
                  >
                    {configured ? "Connected" : "Not connected"}
                  </span>
                  {!configured && (
                    <button
                      onClick={() => setConnectAccount(a)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors shrink-0"
                      data-testid={`button-connect-${a.id}`}
                    >
                      <Plug className="w-3 h-3" /> Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Manual imports" desc="For accounts without an API connection, exported performance data can be imported by hand.">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
            <FileUp className="w-4 h-4 text-muted-foreground/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-foreground">Manual import</div>
              <div className="text-[10px] text-muted-foreground/70">Upload exported performance data for any ad account</div>
            </div>
            <button
              onClick={() => defaultImportAccount && setImportAccount(defaultImportAccount)}
              disabled={!defaultImportAccount}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              data-testid="button-add-import-integrations"
            >
              <FileUp className="w-3 h-3" /> Add import
            </button>
          </div>
        </SectionCard>
      </div>

      {connectAccount && (
        <ConnectMetaDialog
          account={connectAccount}
          open={connectAccount !== null}
          onOpenChange={(o) => !o && setConnectAccount(null)}
        />
      )}
      {importAccount && (
        <ManualImportDialog
          account={importAccount}
          open={importAccount !== null}
          onOpenChange={(o) => !o && setImportAccount(null)}
        />
      )}
    </div>
  );
}
