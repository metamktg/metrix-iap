// ─── Settings · Integrations ──────────────────────────────────────────
// Connection status for every ad account under the manager, plus the
// manual-import path. Reads the same seed the rest of the app uses.
// Connect / Add import open the guided flows from ConnectAccountDialogs.

import { useState } from "react";
import { useGetMetaConnection, useListManualImports } from "@workspace/api-client-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccounts } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard } from "../shared";
import { ConnectMetaDialog, ManualImportDialog } from "../ConnectAccountDialogs";
import { MetaLiveConnection } from "./MetaLiveConnection";
import { cn } from "@/lib/utils";
import { Plug, FileUp, CheckCircle2, Circle } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

const SECTION = "Settings · 10";

/** One account's staged manual-import count, with a re-upload/replace shortcut. */
function ManualUploadsRow({ account, onManage }: { account: AdAccount; onManage: () => void }) {
  const { data } = useListManualImports(account.id);
  const staged = data?.imports.length ?? 0;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
      <FileUp className="w-4 h-4 text-muted-foreground/85 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-foreground">{account.name}</div>
        <div className="text-[10px] text-muted-foreground/85">
          {staged > 0 ? `${staged} file${staged === 1 ? "" : "s"} staged` : "No files staged"}
        </div>
      </div>
      <button
        onClick={onManage}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
      >
        <FileUp className="w-3 h-3" /> {staged > 0 ? "Re-upload / replace" : "Add import"}
      </button>
    </div>
  );
}

// a.source_status is a free-form string (seedTypes.ts has no enum for it) —
// seen holding internal import-pipeline tags like "imported_from_iap_loop_package"
// rather than a user-facing status word. Humanize any non-empty value instead
// of showing the raw snake_case token verbatim.
function humanizeSourceStatus(status: string): string {
  return status.replace(/_/g, " ").trim();
}

export function IntegrationsView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const accounts = getAdAccounts(seed);
  const connected = accounts.filter((a) => a.status === "configured");
  const [connectAccount, setConnectAccount] = useState<AdAccount | null>(null);
  const [importAccount, setImportAccount] = useState<AdAccount | null>(null);

  // Once a live Meta connection exists, the workspace's demo integration
  // panels are hidden entirely — live and demo data are never shown together.
  const liveConnection = useGetMetaConnection();
  const hasLiveConnection = liveConnection.data?.connected === true;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Integrations"
        subtitle={`Data connections across ${manager.name}: ${connected.length} of ${accounts.length} ad accounts connected.`}
      />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <MetaLiveConnection />

        {!hasLiveConnection && (
        <>
        <SectionCard title="Meta ad accounts" desc="Each ad account connects independently; data never crosses accounts.">
          <div className="space-y-2.5">
            {accounts.map((a) => {
              const configured = a.status === "configured";
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                  {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/80 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-foreground">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground/85">
                      {a.platform} · {configured ? (a.source_status ? humanizeSourceStatus(a.source_status) : "connected") : "not connected"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none shrink-0",
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

        <SectionCard title="Manual uploads" desc="Staged uploads for every ad account — CSVs and creative files, reviewable and replaceable per account.">
          <div className="space-y-2.5">
            {accounts.map((a) => (
              <ManualUploadsRow key={a.id} account={a} onManage={() => setImportAccount(a)} />
            ))}
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
    </div>
  );
}
