// ─── Foreplay-style creative card ─────────────────────────────────────
// Used anywhere a specific ad / creative concept is referenced: dominant
// visual, copy beneath, compact stat strip, variable tag chips, click to
// expand. Renders the real creative when ads.creative_asset_url has been
// backfilled from a raw Meta export; otherwise (including on image load
// error) it falls back to a labeled placeholder keyed to the concept
// code — never a broken image.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ImageOff, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { AdsManagerButton } from "./AdsManagerLink";

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

// ─── Formatting (local, avoids circular import with pages/shared) ─────

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

// ─── Placeholder visual keyed to concept code ─────────────────────────

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
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 45% 14%) 0%, hsl(${(hue + 40) % 360} 40% 9%) 100%)`,
      }}
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

function CreativeVisual({ data, className }: { data: CreativeCardData; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (data.assetUrl && !broken) {
    return (
      <img
        src={data.assetUrl}
        alt={`Creative for ${data.conceptCode}`}
        className={cn("w-full h-full object-cover", className)}
        onError={() => setBroken(true)}
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
          title={resolveVariableLabel(c)}
          className={cn(
            "text-[8px] font-mono border px-1 py-0.5 rounded leading-none",
            PREFIX_COLORS[getVariablePrefix(c)]
          )}
        >
          {c}
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

function StatStrip({ stats, dense }: { stats: CreativeCardStats; dense?: boolean }) {
  const items: { label: string; value: string }[] = [
    { label: "Spend", value: usd(stats.spend, 0) },
    { label: stats.resultLabel ?? "Results", value: num(stats.results) },
    { label: "CPA", value: stats.cpa != null ? usd(stats.cpa) : "—" },
    { label: "Link CTR", value: pct(stats.ctrPct) },
  ];
  return (
    <div className={cn("grid grid-cols-4 gap-px bg-border/30 rounded-md overflow-hidden border border-border/30", dense && "grid-cols-4")}>
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
}: {
  data: CreativeCardData;
  className?: string;
  /** Extra actions rendered in the expanded dialog (cross-links, segment drill-down). */
  expandFooter?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Expand creative ${data.conceptCode} — ${data.title}`}
        className={cn(
          "group text-left rounded-xl border border-border/40 bg-white/[0.02] overflow-hidden hover:border-primary/30 hover:bg-white/[0.03] transition-colors flex flex-col",
          className
        )}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-border/30">
          <CreativeVisual data={data} />
          <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="w-2.5 h-2.5 text-white/80" />
          </span>
        </div>
        <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-muted-foreground/60">{data.conceptCode}</span>
              {data.stage && <span className="text-[8px] font-mono uppercase text-muted-foreground/60 border border-border/30 px-1 py-0.5 rounded leading-none">{data.stage}</span>}
            </div>
            <p className="text-[12px] font-semibold text-foreground leading-tight mt-0.5 line-clamp-2">{data.title}</p>
          </div>
          {data.primaryText && (
            <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2">{data.primaryText}</p>
          )}
          {data.stats && <StatStrip stats={data.stats} dense />}
          {data.tags.length > 0 && <VariableTagChips codes={data.tags} max={4} />}
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl bg-[hsl(222_61%_6%)] border-border/50 p-0 gap-0 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-[240px_1fr]">
            <div className="relative aspect-[4/5] sm:aspect-auto sm:min-h-[360px] border-b sm:border-b-0 sm:border-r border-border/30">
              <CreativeVisual data={data} className="absolute inset-0" />
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <DialogHeader className="space-y-1 text-left">
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                  Creative · {data.conceptCode}
                </div>
                <DialogTitle className="text-[15px] font-semibold text-foreground leading-tight">
                  {data.title}
                </DialogTitle>
                {data.visualSystem && (
                  <DialogDescription className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    {data.visualSystem}
                  </DialogDescription>
                )}
              </DialogHeader>

              {(data.primaryText || data.secondaryText || data.cta) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Copy</p>
                  {data.primaryText && <p className="text-[12px] text-foreground/85 leading-relaxed">{data.primaryText}</p>}
                  {data.secondaryText && <p className="text-[11px] text-muted-foreground/75 leading-relaxed">{data.secondaryText}</p>}
                  {data.cta && (
                    <span className="inline-flex text-[10px] font-semibold text-primary border border-primary/25 bg-primary/10 px-2 py-1 rounded">
                      CTA · {data.cta}
                    </span>
                  )}
                </div>
              )}

              {data.stats && <StatStrip stats={data.stats} />}

              {data.iapRead && (
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">IAP read</p>
                  <p className="text-[11px] text-foreground/80 leading-relaxed">{data.iapRead}</p>
                </div>
              )}

              {data.tags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Variable stack</p>
                  <VariableTagChips codes={data.tags} />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30">
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <AdsManagerButton metaAdId={data.metaAdId} adAccountId={data.adAccountId} />
                  {expandFooter}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
