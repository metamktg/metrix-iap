// ─── "View in Ads Manager" deep link ──────────────────────────────────
// Enables automatically when both ads.meta_ad_id and the account's
// meta_ad_account_id have been backfilled from a raw Meta export;
// renders disabled/pending otherwise.
//
// URL format (re-verified against Meta Ads Manager docs, July 2026):
//   https://adsmanager.facebook.com/adsmanager/manage/ads?act=<AD_ACCOUNT_NUMERIC_ID>&selected_ad_ids=<AD_ID>
// The act= param takes the numeric ad account id without the "act_"
// prefix (the prefix is stripped defensively if present).

import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/command-deck/components/ui/tooltip";

export function buildAdsManagerAdUrl(adAccountId: string, metaAdId: string): string {
  const act = adAccountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(act)}&selected_ad_ids=${encodeURIComponent(metaAdId)}`;
}

export function AdsManagerButton({
  metaAdId,
  adAccountId,
  compact = false,
}: {
  /** Meta ad id when known (ads.meta_ad_id, null until backfilled). */
  metaAdId?: string | null;
  /** Numeric Meta ad account id (meta_ad_account_id, null until backfilled). */
  adAccountId?: string | null;
  compact?: boolean;
}) {
  const enabled = Boolean(metaAdId && adAccountId);

  const button = (
    <button
      disabled={!enabled}
      onClick={
        enabled
          ? () => window.open(buildAdsManagerAdUrl(adAccountId!, metaAdId!), "_blank", "noopener,noreferrer")
          : undefined
      }
      aria-disabled={!enabled}
      className={
        enabled
          ? "inline-flex items-center gap-1 rounded-md border border-primary/30 text-interactive hover:bg-primary/10 active:bg-primary/20 transition-colors text-label font-medium px-2 h-6"
          : "inline-flex items-center gap-1 rounded-md border border-border/40 text-muted-foreground/75 cursor-not-allowed text-label font-medium px-2 h-6"
      }
    >
      <ExternalLink className="w-3.5 h-3.5" />
      {compact ? "Ads Manager" : "View in Ads Manager"}
      {!enabled && !compact && (
        <span className="text-micro font-semibold uppercase border border-border/30 px-1 py-0.5 rounded leading-none ml-0.5">
          Pending
        </span>
      )}
    </button>
  );

  if (enabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-caption leading-relaxed">
        Deep link pending: this import doesn't include Meta ad ids yet. The link resolves
        automatically from ad id + ad account id once raw exports with ad ids arrive.
      </TooltipContent>
    </Tooltip>
  );
}
