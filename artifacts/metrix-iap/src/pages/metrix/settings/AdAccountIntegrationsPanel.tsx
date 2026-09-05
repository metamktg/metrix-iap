// ─── Settings · Integrations · Ad-account scoped view ─────────────────
// Shows this specific ad account's connection status, Meta Ad Account ID,
// source status, and action buttons (Connect / Manual import).
// Includes a crosslink to switch to the agency-level view.

import { CopyConfirmButton } from "@/components/widgets/CopyConfirmButton";
import { useState } from "react";
import { CheckCircle2, Circle, Plug, FileUp, Copy, ArrowLeft, ExternalLink, Wifi } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { ConnectMetaDialog, ManualImportDialog } from "../ConnectAccountDialogs";
import { useGetMetaConnection } from "@workspace/api-client-react";
import type { AdAccount } from "@/lib/data/seedTypes";
import { describeAccountSource } from "@/lib/data/accountSource";

export function AdAccountIntegrationsPanel({ account }: { account: AdAccount }) {
  const { selectManager } = useAccount();
  const liveConnection = useGetMetaConnection();
  const hasLiveConnection = liveConnection.data?.connected === true;
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const configured = account.status === "configured";
  // The source is the source: the chip read CONNECTED on a manual account
  // and the status row printed the raw source_status (audit round 5).
  const source = describeAccountSource(account);

  const handleCopy = async () => {
    if (!account.meta_ad_account_id) return;
    try {
      await navigator.clipboard.writeText(account.meta_ad_account_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="px-6 py-5 max-w-3xl space-y-5">
      {/* Account config card */}
      <div className="rounded-xl border border-border/30 bg-foreground/[0.02] overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-3 p-4 border-b border-border/20">
          {configured ? (
            <CheckCircle2 className="w-5 h-5 text-status-success shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground/75 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-body font-semibold text-foreground">{account.name}</div>
            <div className="text-label text-muted-foreground/75">{account.platform}</div>
          </div>
          <span
            className={cn(
              "text-label font-semibold uppercase tracking-wide px-2 py-1 rounded border leading-none shrink-0",
              configured
                ? "text-status-success border-status-success/25 bg-status-success/10"
                : "text-muted-foreground/85 border-border/40 bg-foreground/[0.03]"
            )}
          >
            {configured ? source.short : "Not connected"}
          </span>
        </div>

        {/* Meta Ad Account ID row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
          <div className="text-label text-muted-foreground/75 w-40 shrink-0">Meta Ad Account ID</div>
          {account.meta_ad_account_id ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-body text-foreground/85 truncate">
                {account.meta_ad_account_id}
              </span>
              <CopyConfirmButton value={account.meta_ad_account_id} className="shrink-0" />
            </div>
          ) : (
            <span className="text-body text-muted-foreground/75">–</span>
          )}
        </div>

        {/* Source status row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="text-label text-muted-foreground/75 w-40 shrink-0">Data source</div>
          <span className="text-body text-foreground/80" data-testid="account-source-label">
            {source.label} · {configured ? "analysis data on file" : "no successful run yet"}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {!configured && (
          hasLiveConnection ? (
            <div
              className="flex items-center gap-2 h-9 px-4 rounded-md border border-status-success/30 bg-status-success/10 text-body text-status-success"
              data-testid="live-connection-note-integrations"
            >
              <Wifi className="w-4 h-4 shrink-0" />
              <span>Live connection active · manage in agency settings</span>
            </div>
          ) : (
            <button
              onClick={() => setConnectOpen(true)}
              className="pressable flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary border border-primary text-body font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25"
              data-testid="button-connect-account-integrations"
            >
              <Plug className="w-4 h-4" /> Connect
            </button>
          )
        )}
        <button
          onClick={() => setImportOpen(true)}
          className="pressable flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-body font-medium text-interactive hover:bg-primary/25 transition-colors"
          data-testid="button-manual-import-integrations"
        >
          <FileUp className="w-4 h-4" /> Manual import
        </button>
      </div>

      {/* Agency crosslink */}
      <div className="pt-1">
        <button
          onClick={selectManager}
          className="pressable inline-flex items-center gap-1.5 text-label text-muted-foreground/75 hover:text-foreground/80 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Agency-wide integration settings
          <ExternalLink className="w-3 h-3 opacity-60" />
        </button>
      </div>

      {/* Dialogs */}
      {connectOpen && (
        <ConnectMetaDialog
          account={account}
          open={connectOpen}
          onOpenChange={(o) => !o && setConnectOpen(false)}
        />
      )}
      {importOpen && (
        <ManualImportDialog
          account={account}
          open={importOpen}
          onOpenChange={(o) => !o && setImportOpen(false)}
        />
      )}
    </div>
  );
}
