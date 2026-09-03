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
import { motion } from "framer-motion";
import { CreativeExpandDialog } from "./CreativeExpandDialog";
import type { DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { TYPE } from "@/pages/metrix/typography";

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
  /** Where the copy came from: the scanned library, or a creative-input source (export / upload / Meta API). */
  copySource?: "library" | "performance_export" | "uploaded_asset" | "meta_api" | null;
  /** Link description (caption) and destination as the export carried them. */
  description?: string | null;
  linkDestination?: string | null;
  /** The image or video file name Meta recorded for the ad. */
  mediaName?: string | null;
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
      <span className={cn(TYPE.microLabel, "flex items-center gap-1 text-foreground/55")}>
        <ImageOff className="w-3.5 h-3.5" />
        No asset
      </span>
      {format && (
        <span className={cn(TYPE.microLabel, "absolute top-1.5 right-1.5 text-foreground/55 border border-foreground/10 px-1 py-0.5 rounded leading-none")}>
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
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/[0.03]">
            <div className="w-5 h-5 rounded-full border-2 border-primary/20 border-t-primary/50 animate-spin" />
          </div>
        )}
        <img
          src={data.assetUrl}
          alt={`Creative for ${data.conceptCode}`}
          loading="lazy"
          decoding="async"
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
            "text-caption font-medium border px-1.5 py-0.5 rounded leading-none",
            PREFIX_COLORS[getVariablePrefix(c)]
          )}
        >
          {resolveVariableLabel(c)}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-caption text-muted-foreground/75 border border-border/30 px-1 py-0.5 rounded leading-none">
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
          <div className={cn(TYPE.microLabel, "truncate")}>{it.label}</div>
          <div className={cn(TYPE.caption, "font-semibold text-foreground/90 tabular-nums mt-0.5")}>{it.value}</div>
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
  perfRows,
  demographicEmptyReason,
  placementsEmptyReason,
  funnelEmptyReason,
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
  /** Performance row for the Funnel tab in the expand dialog. */
  perfRow?: import("@/lib/data/seedTypes").CellPerformanceRow | null;
  /** Every per-result-event row for this cell — the split behind the blended results tile. */
  perfRows?: import("@/lib/data/seedTypes").CellPerformanceRow[];
  /** Cause-specific empty-state text forwarded to the expand dialog tabs. */
  demographicEmptyReason?: string | null;
  placementsEmptyReason?: string | null;
  funnelEmptyReason?: string | null;
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
          "group relative rounded-xl border bg-foreground/[0.02] overflow-hidden",
          "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 flex flex-col cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "hover:shadow-lg hover:shadow-background/60",
          // An unmapped card carries its "Map creative" pill as the affordance;
          // an amber border on every unmapped card turned a grid of 69 into a
          // wall of warnings (friction audit 2026-09-03).
          "border-foreground/[0.09] hover:border-primary/30",
          className
        )}
      >
        {/* Visual area — pointer-events-none so root div click fires reliably */}
        <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-foreground/[0.06]">
          {/*
           * SHARED-LAYOUT PARTICIPANT.
           *
           * This div and the expand dialog's media pane carry the same
           * `layoutId`, so opening the dialog INTERPOLATES this rectangle
           * into that one: the creative travels and grows instead of the
           * tile vanishing and a modal fading in somewhere else. On a wall
           * of tiles that removes a re-find on every single expand.
           *
           * It stays mounted while the dialog is open — the close animation
           * needs a destination rectangle, and unmounting leaves it with
           * none, so the panel would pop out of existence instead of
           * shrinking back to its tile.
           *
           * The 1.04 hover lift sits on an INNER element on purpose: put it
           * on the layout participant and the hover transform overwrites the
           * layout transform mid-flight.
           */}
          <motion.div layoutId={`creative-media-${data.conceptCode}`} className="absolute inset-0">
            {/* Asset or placeholder (pointer-events-none so clicks bubble to root) */}
            <div className="absolute inset-0 transition-transform duration-500 will-change-transform group-hover:scale-[1.04] pointer-events-none">
              <CreativeVisual data={data} />
            </div>
          </motion.div>

          {/* Unmapped → "Map creative" pill — pointer-events-auto, stopPropagation */}
          {unmapped && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUploadCreatives?.();
              }}
              title="Map this creative to an IAP library entry"
              className="pressable absolute top-1.5 left-1.5 z-10 flex items-center gap-1 bg-status-warning/20 border border-status-warning/35 text-status-warning text-micro-num font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm hover:bg-status-warning/30 transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-status-warning shrink-0" />
              Map creative
            </button>
          )}

          {/*
           * Action bar. Hidden and pointer-events-none at rest so the
           * invisible state cannot intercept card clicks; revealed on hover,
           * on keyboard focus anywhere inside it, and ALWAYS on a device
           * with no hover at all.
           *
           * That last case is the bug this comment used to describe as
           * correct behaviour: on a phone or tablet there is no hover, so
           * Expand and every other action on this card was unreachable —
           * not hard to find, unreachable. group-focus-within covers the
           * keyboard; the (hover: none) query covers touch.
           *
           * Each action stopPropagation so the parent onClick does not also
           * fire.
           */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-between gap-1 px-2 py-1.5 bg-background/70 backdrop-blur-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto transition-opacity duration-200">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openDialog(); }}
              title="Expand creative"
              className="pressable hit-target-24 flex items-center gap-1 text-caption font-medium text-foreground/80 hover:text-foreground transition-colors"
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
                  className="pressable hit-target-24 flex items-center gap-1 text-caption font-medium text-foreground/70 hover:text-foreground transition-colors"
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
              <span className="text-caption text-muted-foreground/75">{data.conceptCode}</span>
              {data.stage && (
                <span className={cn(TYPE.microLabel, "border border-border/30 px-1 py-0.5 rounded leading-none")}>
                  {data.stage}
                </span>
              )}
              {qaFlagged && (
                <span
                  title={`QA mapping: ${data.qaMappingStatus}`}
                  className={cn(TYPE.microLabel, "flex items-center gap-0.5 font-semibold text-status-warning border border-status-warning/30 bg-status-warning/10 px-1 py-0.5 rounded leading-none")}
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
        perfRow={perfRow}
        perfRows={perfRows}
        demographicEmptyReason={demographicEmptyReason}
        placementsEmptyReason={placementsEmptyReason}
        funnelEmptyReason={funnelEmptyReason}
      />
    </>
  );
}
