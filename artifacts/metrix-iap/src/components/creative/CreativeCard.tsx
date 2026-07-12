// ─── Creative card ─────────────────────────────────────────────────────
// Dominant visual, copy, compact stat strip, variable tags, click to
// expand. Renders the real asset when creative_asset_url is backfilled;
// falls back to a labelled placeholder keyed to concept code otherwise.
//
// Expand dialog delegates to CreativeExpandDialog (tabbed Overview /
// Demographics / Placements with CSS bar charts and Ads Manager link).

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ImageOff, Maximize2 } from "lucide-react";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { CreativeExpandDialog } from "./CreativeExpandDialog";
import type { DemographicRow, PlacementRow } from "@/lib/data/seedTypes";

// ─── Data shape ───────────────────────────────────────────────────────

export interface CreativeCardStats {
  spend?: number | null;
  results?: number | null;
  cpa?: number | null;
  ctrPct?: number | null;
  resultLabel?: string;
}

export interface CreativeCardData {
  /** Creative cell / concept code, e.g. "C2B". Keys the placeholder visual. */
  conceptCode: string;
  title: string;
  primaryText?: string | null;
  secondaryText?: string | null;
  cta?: string | null;
  /** Real asset URL when ads.creative_asset_url has been backfilled; null → placeholder. */
  assetUrl?: string | null;
  /** Original filename (ads.asset_filename) — used to detect video vs image assets by extension. */
  assetFilename?: string | null;
  /** e.g. "1122:1402" from the library metadata. */
  aspectRatio?: string | null;
  visualSystem?: string | null;
  assetFormat?: string | null;
  /** Raw variable codes (may be compound "A + B"). */
  tags: string[];
  stats?: CreativeCardStats;
  iapRead?: string | null;
  stage?: string | null;
  /** Meta ad id (ads.meta_ad_id) — enables the Ads Manager link when set with adAccountId. */
  metaAdId?: string | null;
  /** Numeric Meta ad account id (meta_ad_account_id) — NOT the internal account id. */
  adAccountId?: string | null;
}

// ─── Formatting ───────────────────────────────────────────────────────

function usd(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

// ─── Placeholder visual ───────────────────────────────────────────────

function hueFor(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
  return h;
}

function PlaceholderVisual({ code, format, className }: { code: string; format?: string | null; className?: string }) {
  const hue = hueFor(code);
  return (
    <div
      aria-label={`No creative asset imported for ${code}`}
      className={cn("relative w-full h-full flex flex-col items-center justify-center gap-1.5 select-none", className)}
      style={{ background: `linear-gradient(140deg, hsl(${hue} 45% 14%) 0%, hsl(${(hue + 40) % 360} 40% 9%) 100%)` }}
    >
      <span className="text-[26px] font-black tracking-tight leading-none" style={{ color: `hsl(${hue} 70% 72% / 0.85)` }}>
        {code}
      </span>
      <span className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest text-white/35">
        <ImageOff className="w-2.5 h-2.5" />
        No asset in import
      </span>
      {format && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-mono uppercase tracking-wide text-white/40 border border-white/10 px-1 py-0.5 rounded leading-none">
          {format}
        </span>
      )}
    </div>
  );
}

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);

function isVideoAsset(assetUrl: string, assetFilename?: string | null): boolean {
  const candidate = assetFilename || assetUrl;
  const match = /\.([a-zA-Z0-9]+)(?:[?#]|$)/.exec(candidate);
  const ext = match?.[1]?.toLowerCase();
  return ext != null && VIDEO_EXTENSIONS.has(ext);
}

export function CreativeVisual({ data, className }: { data: CreativeCardData; className?: string }) {
  // Track which URL caused the failure — if assetUrl changes (seed refresh,
  // account switch) we automatically try the new URL even if a prior URL failed.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = data.assetUrl != null && brokenUrl === data.assetUrl;

  if (data.assetUrl && !broken) {
    if (isVideoAsset(data.assetUrl, data.assetFilename)) {
      return (
        <video
          src={data.assetUrl}
          className={cn("w-full h-full object-cover", className)}
          muted loop playsInline autoPlay
          onError={() => setBrokenUrl(data.assetUrl!)}
        />
      );
    }
    return (
      <img
        src={data.assetUrl}
        alt={`Creative for ${data.conceptCode}`}
        className={cn("w-full h-full object-cover", className)}
        onError={() => setBrokenUrl(data.assetUrl!)}
      />
    );
  }
  return <PlaceholderVisual code={data.conceptCode} format={data.assetFormat} className={className} />;
}

// ─── Tag chips ────────────────────────────────────────────────────────

export function VariableTagChips({ codes, max }: { codes: string[]; max?: number }) {
  const flat = useMemo(
    () => codes.flatMap((c) => c.split(/\s*\+\s*/)).filter(Boolean),
    [codes]
  );
  const shown = max != null ? flat.slice(0, max) : flat;
  const hidden = flat.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((c, i) => (
        <span
          key={c + i}
          title={c}
          className={cn(
            "text-[9px] font-medium border px-1.5 py-0.5 rounded leading-none",
            PREFIX_COLORS[getVariablePrefix(c)]
          )}
        >
          {resolveVariableLabel(c)}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-[8px] font-mono text-muted-foreground/60 border border-border/30 px-1 py-0.5 rounded leading-none">
          +{hidden}
        </span>
      )}
    </div>
  );
}

// ─── Stat strip ───────────────────────────────────────────────────────

function StatStrip({ stats }: { stats: CreativeCardStats }) {
  const items = [
    { label: "Spend",                        value: usd(stats.spend, 0) },
    { label: stats.resultLabel ?? "Results", value: num(stats.results) },
    { label: "CPA",                          value: stats.cpa != null ? usd(stats.cpa) : "—" },
    { label: "Link CTR",                     value: pct(stats.ctrPct) },
  ];
  return (
    <div className="grid grid-cols-4 gap-px bg-border/30 rounded-md overflow-hidden border border-border/30">
      {items.map((it) => (
        <div key={it.label} className="bg-[hsl(222_55%_7%)] px-1.5 py-1.5 text-center">
          <div className="text-[7px] font-mono uppercase tracking-wider text-muted-foreground/60 truncate">{it.label}</div>
          <div className="text-[10px] font-semibold text-foreground/90 tabular-nums mt-0.5">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────

export function CreativeCard({
  data,
  className,
  expandFooter,
  unmapped,
  demographic,
  placements,
  onUploadCreatives,
  onSegmentClick,
}: {
  data: CreativeCardData;
  className?: string;
  /**
   * Extra actions rendered in the expanded dialog footer. Render-prop form
   * receives close() so an action can dismiss the dialog first (surfaces
   * opened while it's still up would stack behind it).
   */
  expandFooter?: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** True when this cell has performance data but no IAP library mapping. */
  unmapped?: boolean;
  /** Cell-scoped demographic rows for the expanded dialog Demographics tab. */
  demographic?: DemographicRow[];
  /** Account-level placement rows for the expanded dialog Placements tab. */
  placements?: PlacementRow[];
  /** Called (after dialog closes) when the user taps "Upload creatives" in the unmapped warning. */
  onUploadCreatives?: () => void;
  /** Makes the expanded dialog's Demographics tab tappable → segment drill-down. */
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
  /** Called when the user wants the full grid breakdown for this cell. */
  onFullBreakdownClick?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Expand creative ${data.conceptCode} — ${data.title}`}
        className={cn(
          "group text-left rounded-xl border bg-white/[0.02] overflow-hidden transition-all duration-200 flex flex-col",
          "hover:shadow-lg hover:shadow-black/30 active:scale-[0.98]",
          unmapped
            ? "border-amber-400/30 hover:border-amber-400/50"
            : "border-white/[0.09] hover:border-primary/30",
          className
        )}
      >
        {/* Visual with hover zoom */}
        <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-white/[0.06]">
          <div className="absolute inset-0 transition-transform duration-500 will-change-transform group-hover:scale-[1.04]">
            <CreativeVisual data={data} />
          </div>

          {unmapped && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[8px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm z-10">
              <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
              Unmapped
            </div>
          )}

          <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Maximize2 className="w-2.5 h-2.5 text-white/80" />
          </span>
        </div>

        {/* Info strip */}
        <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-muted-foreground/60">{data.conceptCode}</span>
              {data.stage && (
                <span className="text-[8px] font-mono uppercase text-muted-foreground/60 border border-border/30 px-1 py-0.5 rounded leading-none">
                  {data.stage}
                </span>
              )}
            </div>
            <p className="text-[12px] font-semibold text-foreground leading-tight mt-0.5 line-clamp-2">{data.title}</p>
          </div>
          {data.primaryText && (
            <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2">{data.primaryText}</p>
          )}
          {data.stats && <StatStrip stats={data.stats} />}
          {data.tags.length > 0 && <VariableTagChips codes={data.tags} max={4} />}
        </div>
      </button>

      <CreativeExpandDialog
        open={open}
        onOpenChange={setOpen}
        data={data}
        demographic={demographic}
        placements={placements}
        expandFooter={expandFooter}
        unmapped={unmapped}
        onUploadCreatives={onUploadCreatives}
        onSegmentClick={onSegmentClick}
      />
    </>
  );
}
