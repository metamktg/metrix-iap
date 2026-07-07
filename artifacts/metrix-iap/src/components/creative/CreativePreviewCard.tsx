import { cn } from "@/lib/utils";
import { Image, Video, Layers, AlertCircle, Link2 } from "lucide-react";
import {
  resolveVariableLabel,
  getVariablePrefix,
  PREFIX_COLORS,
} from "@/lib/variable-registry";

// ─── Data model ────────────────────────────────────────────────────────

export type CreativeAssetPreview = {
  asset_id: string;
  source_platform: "meta" | "manual_upload" | "drive" | "canva" | "unknown";
  external_creative_id?: string;
  ad_id?: string;
  thumbnail_url?: string;
  media_url?: string;
  media_type: "image" | "video" | "carousel" | "unknown";
  concept_code?: string;
  angle_codes?: string[];
  human_label?: string;
  fallback_state: "ready" | "missing_thumbnail" | "metadata_pending" | "not_connected";
};

// ─── Helpers ──────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<CreativeAssetPreview["source_platform"], string> = {
  meta:          "Meta",
  manual_upload: "Uploaded",
  drive:         "Drive",
  canva:         "Canva",
  unknown:       "Unknown source",
};

const MEDIA_ICONS = {
  image:    Image,
  video:    Video,
  carousel: Layers,
  unknown:  AlertCircle,
};

const FALLBACK_COPY: Record<CreativeAssetPreview["fallback_state"], { title: string; sub: string }> = {
  ready:            { title: "",                                   sub: "" },
  missing_thumbnail:{ title: "Thumbnail unavailable",              sub: "Asset detected — preview source pending." },
  metadata_pending: { title: "Metadata detected — source pending", sub: "Asset ID found. Media source not yet connected." },
  not_connected:    { title: "Asset source not connected",         sub: "No production data connected yet." },
};

// ─── VariableChip ─────────────────────────────────────────────────────

function VariableChip({ code }: { code: string }) {
  const prefix = getVariablePrefix(code);
  const color = PREFIX_COLORS[prefix];
  return (
    <span
      title={code}
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border",
        color
      )}
    >
      {resolveVariableLabel(code)}
    </span>
  );
}

// ─── AssetSourceBadge ─────────────────────────────────────────────────

function AssetSourceBadge({ platform }: { platform: CreativeAssetPreview["source_platform"] }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-muted-foreground/50 font-mono">
      <Link2 className="w-2.5 h-2.5" />
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

// ─── CreativePreviewCard ──────────────────────────────────────────────

interface CreativePreviewCardProps {
  asset: CreativeAssetPreview;
  className?: string;
  compact?: boolean;
}

export function CreativePreviewCard({ asset, className, compact = false }: CreativePreviewCardProps) {
  const MediaIcon = MEDIA_ICONS[asset.media_type];
  const fallback = FALLBACK_COPY[asset.fallback_state];
  const isReady = asset.fallback_state === "ready";
  const label = asset.human_label ?? (asset.concept_code ? resolveVariableLabel(asset.concept_code) : "Untitled Asset");

  return (
    <div
      className={cn(
        "group flex flex-col rounded-lg border border-border/40 bg-white/[0.02] overflow-hidden",
        "hover:border-border/60 hover:bg-white/[0.03] transition-colors",
        className
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          "relative flex items-center justify-center bg-white/[0.03] border-b border-border/30",
          compact ? "h-24" : "h-36"
        )}
      >
        {isReady && asset.thumbnail_url ? (
          <img
            src={asset.thumbnail_url}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 opacity-40">
            <MediaIcon className="w-6 h-6 text-muted-foreground" />
            {!isReady && (
              <span className="text-[9px] font-mono text-muted-foreground text-center px-2">
                {fallback.title}
              </span>
            )}
          </div>
        )}

        {/* Media type badge */}
        <span className="absolute top-1.5 left-1.5 text-[8px] font-mono uppercase tracking-wide bg-background/70 border border-border/40 rounded px-1 py-0.5 text-muted-foreground/60">
          {asset.media_type}
        </span>

        {/* Fallback state badge */}
        {!isReady && (
          <span className="absolute top-1.5 right-1.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-400/10 border border-amber-400/20 text-amber-400 rounded px-1.5 py-0.5">
            {asset.fallback_state === "metadata_pending" ? "Pending" : "No source"}
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className={cn("flex flex-col gap-1.5 p-3", compact && "p-2 gap-1")}>
        {/* Label */}
        <p className="text-[12px] font-medium text-foreground leading-tight truncate">{label}</p>

        {/* Fallback sub-message */}
        {!isReady && fallback.sub && (
          <p className="text-[10px] text-muted-foreground/50 leading-tight">{fallback.sub}</p>
        )}

        {/* Concept + angle */}
        {!compact && asset.concept_code && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {asset.concept_code && <VariableChip code={asset.concept_code} />}
            {asset.angle_codes?.slice(0, 2).map(c => <VariableChip key={c} code={c} />)}
          </div>
        )}

        {/* Source */}
        <AssetSourceBadge platform={asset.source_platform} />
      </div>
    </div>
  );
}

// ─── CreativeFallbackState (full-page empty) ──────────────────────────

interface CreativeFallbackStateProps {
  reason: "not_connected" | "metadata_pending" | "no_assets";
  sourceName?: string;
}

export function CreativeFallbackState({ reason, sourceName }: CreativeFallbackStateProps) {
  const copy = {
    not_connected: {
      title: "Asset source not connected",
      sub: "Connect a creative source to preview assets here.",
    },
    metadata_pending: {
      title: "Metadata detected — media source pending",
      sub: "Asset IDs found. Thumbnail source is not yet connected.",
    },
    no_assets: {
      title: "No creative assets found",
      sub: "Run an analysis to surface creative signals.",
    },
  }[reason];

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto">
        <Image className="w-4 h-4 text-muted-foreground/40" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-foreground/80">{copy.title}</p>
        <p className="text-[11px] text-muted-foreground/50">{copy.sub}</p>
        {sourceName && (
          <p className="text-[10px] font-mono text-muted-foreground/30">Source: {sourceName}</p>
        )}
      </div>
    </div>
  );
}

// ─── CreativeAssetGrid ─────────────────────────────────────────────────

interface CreativeAssetGridProps {
  assets: CreativeAssetPreview[];
  compact?: boolean;
}

export function CreativeAssetGrid({ assets, compact }: CreativeAssetGridProps) {
  if (!assets.length) return <CreativeFallbackState reason="no_assets" />;
  return (
    <div className={cn(
      "grid gap-3",
      compact
        ? "grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    )}>
      {assets.map(a => (
        <CreativePreviewCard key={a.asset_id} asset={a} compact={compact} />
      ))}
    </div>
  );
}
