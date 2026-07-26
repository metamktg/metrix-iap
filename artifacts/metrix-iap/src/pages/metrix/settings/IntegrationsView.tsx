// ─── Settings · Integrations ──────────────────────────────────────────
// Connection status for every ad account under the manager, plus the
// manual-import path. Reads the same seed the rest of the app uses.
// Connect / Add import open the guided flows from ConnectAccountDialogs.

import { useState } from "react";
import { useGetMetaConnection } from "@workspace/api-client-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccounts } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard } from "../shared";
import { ConnectMetaDialog, ManualImportDialog } from "../ConnectAccountDialogs";
import { MetaLiveConnection } from "./MetaLiveConnection";
import { cn } from "@/lib/utils";
import { Plug, FileUp, CheckCircle2, Circle, ArrowLeft } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

const SECTION = "Settings · 09";

export function IntegrationsView() {
  const seed = useMetrixSeed();
  const { manager, selectedAccountType, selectManager } = useAccount();
  const accounts = getAdAccounts(seed);
  const connected = accounts.filter((a) => a.status === "configured");
  const [connectAccount, setConnectAccount] = useState<AdAccount | null>(null);
  const [importAccount, setImportAccount] = useState<AdAccount | null>(null);

  // Once a live Meta connection exists, the workspace's demo integration
  // panels are hidden entirely — live and demo data are never shown together.
  const liveConnection = useGetMetaConnection();
  const hasLiveConnection = liveConnection.data?.connected === true;

  const defaultImportAccount = accounts.find((a) => a.status !== "configured") ?? accounts[0] ?? null;

  const isAccountScoped = selectedAccountType === "ad_account";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Integrations"
        subtitle={
          isAccountScoped
            ? "Agency-level settings"
            : `Data connections across ${manager.name}: ${connected.length} of ${accounts.length} ad accounts connected.`
        }
      />

      {isAccountScoped ? (
        <div className="px-6 py-5 max-w-3xl">
          <div className="flex items-start gap-3 p-4 rounded-xl border border-border/30 bg-white/[0.02] text-body text-muted-foreground/70">
            <ArrowLeft className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/40" />
            <div className="space-y-1.5">
              <p className="text-body font-medium text-foreground/80">Agency view only</p>
              <p className="text-label text-muted-foreground/60">Connect or manage integrations there.</p>
              <button
                onClick={selectManager}
                className="mt-2 inline-flex items-center gap-1.5 text-label font-semibold text-interactive border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-1.5 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Switch to agency view
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-6 py-5 space-y-5 max-w-3xl">
            <MetaLiveConnection />

            {!hasLiveConnection && (
            <>
            <SectionCard title="Meta ad accounts" desc="Independent connections · data never crosses accounts">
              <div className="space-y-2.5">
                {accounts.map((a) => {
                  const configured = a.status === "configured";
                  return (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                      {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/80 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-body font-medium text-foreground">{a.name}</div>
                        <div className="text-label text-muted-foreground/85">
                          {a.platform} · {configured ? (a.source_status ?? "connected") : "not connected"}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none shrink-0",
                          configured
                            ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
                            : "text-muted-foreground/85 border-border/40 bg-white/[0.03]"
                        )}
                      >
                        {configured ? "Connected" : "Not connected"}
                      </span>
                      {!configured && (
                        <button
                          onClick={() => setConnectAccount(a)}
                          className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary border border-primary text-caption font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25 shrink-0"
                          data-testid={`button-connect-${a.id}`}
                        >
                          <Plug className="w-3.5 h-3.5" /> Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Manual imports" desc="Hand-imported performance data · no API connection needed">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                <FileUp className="w-4 h-4 text-muted-foreground/85 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium text-foreground">Manual import</div>
                  <div className="text-label text-muted-foreground/85">Upload exported performance data for any ad account</div>
                </div>
                <button
                  onClick={() => defaultImportAccount && setImportAccount(defaultImportAccount)}
                  disabled={!defaultImportAccount}
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary border border-primary text-caption font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25 disabled:opacity-40 disabled:pointer-events-none"
                  data-testid="button-add-import-integrations"
                >
                  <FileUp className="w-3.5 h-3.5" /> Add import
                </button>
              </div>
            </SectionCard>
            </>
            )}
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
        </>
      )}
    </div>
  );
}
