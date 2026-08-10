// ─── Creative card ─────────────────────────────────────────────────────
// Dominant visual, compact 2-stat strip, click anywhere on the card to
// expand the detail dialog. Variable tags and full stats live in the
// expanded dialog only.
//
// HTML interaction model:
//   • Card root is a <div> with onClick → expand.  It is NOT a <button>
//     so that nested interactive controls are valid HTML.
//   • Interactive children (Map creative pill, Expand/Upload buttons) all
//     call e.stopPropagation() so they don't double-fire. The "View in Ads
//     Manager" link lives only in the expand dialog, not on the tile.
//   • Non-interactive areas use pointer-events-none so the root div click
//     handler fires reliably across the full card face.
//   • The hover action bar uses pointer-events-none by default and
//     pointer-events-auto only when hovered, preventing invisible
//     interception of card clicks.

import { useMemo, useState, useCallback, useRef } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { ImageOff, Maximize2, Upload, AlertTriangle } from "lucide-react";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { CreativeExpandDialog } from "./CreativeExpandDialog";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";

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
  /**
   * Every real performance row behind `stats` — `stats` sums these for the
   * compact card face, but a concept can carry more than one real row (e.g.
   * separate campaign flights toward different result types on the same
   * creative). Kept so the expand dialog's Funnel tab can show each one
   * distinctly instead of only the row `stats` was blended from.
   */
  perfRows?: CellPerformanceRow[];
  iapRead?: string | null;
  stage?: string | null;
  /** MSTLibraryCell.qa_mapping_status — "flagged"/"library_only_no_export_match" need attention. */
  qaMappingStatus?: string | null;
  /** MSTLibraryCell.mapping_confidence — high/medium/low. */
  mappingConfidence?: string | null;
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
      className={cn("relative w-full h-full flex flex-col items-center justify-center gap-2 select-none", className)}
      style={{ background: `linear-gradient(155deg, hsl(${hue} 38% 12%) 0%, hsl(${(hue + 50) % 360} 32% 7%) 100%)` }}
    >
      <span
        className="text-hero font-black tracking-tight leading-none"
        style={{ color: `hsl(${hue} 65% 68% / 0.75)` }}
      >
        {code}
      </span>
      <span className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest text-white/25">
        <ImageOff className="w-3.5 h-3.5" />
        No asset
      </span>
      {format && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-mono uppercase tracking-wide text-white/30 border border-white/10 px-1 py-0.5 rounded leading-none">
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

// Inner component is always keyed on assetUrl (see CreativeVisual wrapper
// below). This means state resets cleanly whenever the URL changes —
// including the case where a cached image fires onLoad before useEffect
// could run, which would otherwise leave the image permanently opacity-0.
function CreativeVisualInner({ data, className }: { data: CreativeCardData; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loading = !broken && !loaded;

  if (data.assetUrl && !broken) {
    if (isVideoAsset(data.assetUrl, data.assetFilename)) {
      return (
        <video
          src={data.assetUrl}
          className={cn("w-full h-full object-cover", className)}
          muted loop playsInline autoPlay
          onError={() => setBroken(true)}
        />
      );
    }
    return (
      <div className={cn("relative w-full h-full", className)}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
            <div className="w-5 h-5 rounded-full border-2 border-primary/20 border-t-primary/50 animate-spin" />
          </div>
        )}
        <img
          src={data.assetUrl}
          alt={`Creative for ${data.conceptCode}`}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loading ? "opacity-0" : "opacity-100",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return <PlaceholderVisual code={data.conceptCode} format={data.assetFormat} className={className} />;
}

export function CreativeVisual({ data, className }: { data: CreativeCardData; className?: string }) {
  // Key on assetUrl so inner state resets cleanly on every URL change.
  return <CreativeVisualInner key={data.assetUrl ?? "__placeholder__"} data={data} className={className} />;
}

// ─── Tag chips (dialog-only export) ───────────────────────────────────

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

// ─── Compact 2-stat strip (card face only) ────────────────────────────

function StatStrip({ stats }: { stats: CreativeCardStats }) {
  const items = [
    { label: "Spend",                        value: usd(stats.spend, 0) },
    { label: stats.resultLabel ?? "Results", value: num(stats.results) },
  ];
  return (
    <div className="grid grid-cols-2 gap-px bg-border/30 rounded-md overflow-hidden border border-border/30">
      {items.map((it) => (
        <div key={it.label} className="bg-surface-table px-2 py-1.5 text-center">
          <div className="text-[7px] font-mono uppercase tracking-wider text-muted-foreground/55 truncate">{it.label}</div>
          <div className="text-label font-semibold text-foreground/90 tabular-nums mt-0.5">{it.value}</div>
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
  onUploadCreative,
  onSegmentClick,
  perfRow,
}: {
  data: CreativeCardData;
  className?: string;
  expandFooter?: React.ReactNode | ((close: () => void) => React.ReactNode);
  unmapped?: boolean;
  demographic?: DemographicRow[];
  placements?: PlacementRow[];
  onUploadCreatives?: () => void;
  onUploadCreative?: (cellId: string) => void;
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
  onFullBreakdownClick?: () => void;
  /**
   * Single-row override for the Funnel tab, kept for callers that only have
   * one specific row in hand. Prefer wiring `data.perfRows` (via
   * cardFromCell/cardFromLibraryCell) — when present it takes precedence and
   * carries every real row for the cell, not just one.
   */
  perfRow?: CellPerformanceRow | null;
}) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);

  // Track whether a child button/link fired — if so the root onClick is a
  // redundant bubble and we skip it. Children call stopPropagation instead,
  // but this ref acts as a belt-and-suspenders guard.
  const suppressRef = useRef(false);

  const qaFlagged = data.qaMappingStatus === "flagged" || data.qaMappingStatus === "library_only_no_export_match";

  return (
    <>
      {/*
       * Card root: <div> not <button> so nested interactive elements are
       * valid HTML. The root onClick opens the expand dialog; interactive
       * children stopPropagation so they don't also fire the expand.
       */}
      <div
        role="group"
        aria-label={`Creative ${data.conceptCode} — ${data.title}`}
        onClick={(e) => {
          if (suppressRef.current) { suppressRef.current = false; return; }
          // Only open if the click landed on a non-interactive area.
          // Interactive children call e.stopPropagation() which prevents
          // this handler from running at all.
          openDialog();
        }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDialog(); } }}
        tabIndex={0}
        className={cn(
          "group relative rounded-xl border bg-white/[0.02] overflow-hidden",
          "transition-all duration-200 flex flex-col cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "hover:shadow-lg hover:shadow-black/30",
          unmapped
            ? "border-amber-400/30 hover:border-amber-400/50"
            : "border-white/[0.09] hover:border-primary/30",
          className
        )}
      >
        {/* Visual area — pointer-events-none so root div click fires reliably */}
        <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-white/[0.06]">
          {/* Asset or placeholder (pointer-events-none so clicks bubble to root) */}
          <div className="absolute inset-0 transition-transform duration-500 will-change-transform group-hover:scale-[1.04] pointer-events-none">
            <CreativeVisual data={data} />
          </div>

          {/* Unmapped → "Map creative" pill — pointer-events-auto, stopPropagation */}
          {unmapped && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUploadCreatives?.();
              }}
              title="Map this creative to an IAP library entry"
              className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 bg-amber-500/20 border border-amber-400/35 text-amber-300 text-[8px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm hover:bg-amber-500/30 transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
              Map creative
            </button>
          )}

          {/*
           * Hover action bar — hidden (opacity-0) AND pointer-events-none by
           * default so invisible state cannot intercept card clicks.
           * On group-hover: opacity-100 + pointer-events-auto.
           * Each action stopPropagation so parent onClick doesn't also fire.
           */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-between gap-1 px-2 py-1.5 bg-black/70 backdrop-blur-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openDialog(); }}
              title="Expand creative"
              className="flex items-center gap-1 text-[9px] font-medium text-white/80 hover:text-white transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Expand
            </button>
            <div className="flex items-center gap-2">
              {onUploadCreative && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onUploadCreative(data.conceptCode); }}
                  title={data.assetUrl ? "Replace creative" : "Upload creative"}
                  className="flex items-center gap-1 text-[9px] font-medium text-white/70 hover:text-white transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {data.assetUrl ? "Replace" : "Upload"}
                </button>
              )}
              {/* "View in Ads Manager" intentionally lives only in the expand
                  dialog (AdsManagerButton) — keeping it off the tile prevents
                  the hover bar from overflowing/truncating on narrow tiles. */}
            </div>
          </div>
        </div>

        {/* Info strip — pointer-events-none so root div click fires through it */}
        <div className="p-2.5 space-y-1.5 flex-1 flex flex-col pointer-events-none">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-muted-foreground/55">{data.conceptCode}</span>
              {data.stage && (
                <span className="text-[8px] font-mono uppercase text-muted-foreground/55 border border-border/30 px-1 py-0.5 rounded leading-none">
                  {data.stage}
                </span>
              )}
              {qaFlagged && (
                <span
                  title={`QA mapping: ${data.qaMappingStatus}`}
                  className="flex items-center gap-0.5 text-[8px] font-semibold uppercase text-amber-300 border border-amber-400/30 bg-amber-400/10 px-1 py-0.5 rounded leading-none"
                >
                  <AlertTriangle className="w-2.5 h-2.5" />
                  QA
                </span>
              )}
            </div>
            <p className="text-body font-semibold text-foreground leading-tight mt-0.5 line-clamp-2">{data.title}</p>
          </div>
          {data.stats && <StatStrip stats={data.stats} />}
        </div>
      </div>

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
        perfRows={data.perfRows && data.perfRows.length > 0 ? data.perfRows : perfRow ? [perfRow] : []}
      />
    </>
  );
}
