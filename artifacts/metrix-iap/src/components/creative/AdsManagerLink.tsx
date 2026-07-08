// ─── "View in Ads Manager" deep-link scaffolding ──────────────────────
// Built at ad level, but rendered disabled/pending until the raw exports
// carry a real Meta ad id (ads.meta_ad_id is nullable and currently null
// for every imported ad — no deep link can be resolved yet).
//
// URL format (verified against Meta Ads Manager, July 2026):
//   https://adsmanager.facebook.com/adsmanager/manage/ads?act=<AD_ACCOUNT_NUMERIC_ID>&selected_ad_ids=<AD_ID>
// The act= param takes the numeric ad account id without the "act_" prefix.

import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function buildAdsManagerAdUrl(adAccountId: string, metaAdId: string): string {
  const act = adAccountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(act)}&selected_ad_ids=${encodeURIComponent(metaAdId)}`;
}

export function AdsManagerButton({
  metaAdId,
  adAccountId,
  compact = false,
}: {
  /** Meta ad id when known. Currently always null/undefined — no ad ids exist in this import. */
  metaAdId?: string | null;
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
          ? "inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-medium px-2 h-6"
          : "inline-flex items-center gap-1 rounded-md border border-border/40 text-muted-foreground/50 cursor-not-allowed text-[10px] font-medium px-2 h-6"
      }
    >
      <ExternalLink className="w-2.5 h-2.5" />
      {compact ? "Ads Manager" : "View in Ads Manager"}
      {!enabled && !compact && (
        <span className="text-[8px] font-semibold uppercase tracking-wide border border-border/30 px-1 py-0.5 rounded leading-none ml-0.5">
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
      <TooltipContent side="top" className="max-w-[240px] text-[11px] leading-relaxed">
        Deep link pending: this import doesn't include Meta ad ids yet. The link resolves
        automatically from ad id + ad account id once raw exports with ad ids arrive.
      </TooltipContent>
    </Tooltip>
  );
}
