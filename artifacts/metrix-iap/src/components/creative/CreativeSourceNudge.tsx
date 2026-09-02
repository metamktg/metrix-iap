// ─── Creative-source nudge ─────────────────────────────────────────────
// Owner brief (2026-09-02): a non-intrusive suggestion to upload creatives
// or connect Meta, shown where visual creative intelligence would appear,
// persisting until the reader dismisses it.
//
// It renders only when it is true: the account has analysis data, and no
// ad carries a servable creative asset and nothing has been deconstructed.
// Once creatives exist it disappears on its own — a suggestion to do what
// is already done is noise. Dismissal is per account, per browser
// (creativeNudgeStore), never a server flag, and never a modal.
//
// It states what is ALREADY working (copy-level intelligence from the
// export) before what more would add, so the reader learns the baseline
// is real value, not a placeholder.

import { useState } from "react";
import { FileUp, Plug, Sparkles, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { ConnectMetaDialog, ManualImportDialog } from "@/pages/metrix/ConnectAccountDialogs";
import { dismissCreativeNudge, useCreativeNudgeDismissed } from "@/lib/data/creativeNudgeStore";
import type { AdAccount } from "@/lib/data/seedTypes";

/** True when at least one ad has a servable visual or a deconstruction exists. */
function accountHasVisualCreatives(account: AdAccount): boolean {
  if ((account.creative_deconstructions?.length ?? 0) > 0) return true;
  return (account.ads ?? []).some((a) => a.asset_servable === true && Boolean(a.creative_asset_url));
}

export function CreativeSourceNudge({ account, className }: { account: AdAccount; className?: string }) {
  const dismissed = useCreativeNudgeDismissed(account.id);
  const [importOpen, setImportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  if (dismissed) return null;
  if (!account.iap) return null;
  if (accountHasVisualCreatives(account)) return null;

  const copyKnown = (account.creative_components?.coverage.ads_with_copy ?? 0) > 0;
  const coveragePct = Math.round((account.creative_components?.coverage.coverage ?? 0) * 100);
  const isLive = ["meta", "facebook", "meta ads"].includes((account.platform ?? "").toLowerCase());

  return (
    <div
      role="status"
      aria-label="Creative source suggestion"
      data-testid="creative-source-nudge"
      className={cn(
        "mx-6 my-3 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] px-4 py-3",
        className,
      )}
    >
      <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-interactive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={cn(TYPE.caption, "font-semibold text-foreground")}>
          {copyKnown
            ? `Copy-level creative intelligence is live for ${coveragePct}% of spend.`
            : "Creative intelligence is running on performance data only."}
        </p>
        <p className={cn(TYPE.caption, "text-muted-foreground/85 mt-0.5")}>
          Add the creatives themselves for visual deconstruction: variable stacks, formats and matrix positions.
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="pressable inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-primary/40 bg-primary/10 text-interactive text-caption font-semibold hover:bg-primary/20 transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" /> Upload creatives
          </button>
          {!isLive && (
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="pressable inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-foreground/85 text-caption font-medium hover:bg-foreground/[0.05] transition-colors"
            >
              <Plug className="w-3.5 h-3.5" aria-hidden="true" /> Connect Meta
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissCreativeNudge(account.id)}
        aria-label="Dismiss creative source suggestion"
        title="Not now"
        className="pressable shrink-0 w-8 h-8 -mr-1 -mt-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <ManualImportDialog account={account} open={importOpen} onOpenChange={setImportOpen} />
      {!isLive && <ConnectMetaDialog account={account} open={connectOpen} onOpenChange={setConnectOpen} />}
    </div>
  );
}
