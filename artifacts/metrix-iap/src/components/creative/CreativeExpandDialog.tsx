// ─── Creative expand dialog ────────────────────────────────────────────
// Full-size split-view dialog: creative visual left, tabbed data panel
// right. Tabs: Overview (stats/copy/tags) · Demographics (age × gender
// bar chart) · Placements (account-level spend/CPA bars).
// Self-contained — intentionally does NOT import runtime code from
// CreativeCard to avoid circular deps; types only via import type.

import { useState, useMemo } from "react";
import { TabRail } from "@/components/nav/TabRail";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DenseText, platformLabel } from "@/pages/metrix/shared";
import { Upload, ImageOff, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { humanizeEnum } from "@/lib/normalize";
import type { CreativeCardData } from "./CreativeCard";

/** The key a card's media shares with this dialog's: an ad tile is one ad, never the "AD" code every ad tile shares. */
export function creativeLayoutKey(data: Pick<CreativeCardData, "conceptCode" | "adNames">): string {
  return data.adNames && data.adNames.length > 0 ? `ad:${data.adNames.join("|")}` : data.conceptCode;
}
import { FunnelStepsChart, buildFunnelSteps, describeFunnelChain, funnelStepLabel } from "./FunnelStepsChart";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { AdsManagerButton } from "./AdsManagerLink";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { useCreativeEmptyReasons } from "@/hooks/useCreativeEmptyReasons";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { useCreativeEvidence } from "@/hooks/useCreativeEvidence";
import { DemographicHeatGrid } from "@/components/evidence/DemographicHeatGrid";
import { PlacementDrill } from "@/components/evidence/PlacementDrill";
import { EvidenceTab } from "@/components/evidence/EvidenceTab";
import { EvidenceChip, EvidenceExplainer } from "@/components/evidence/EvidenceChip";
import { KpiTileRow } from "@/components/metrics/KpiTile";
import { SharePieChart } from "@/components/charts/SharePieChart";
import { buildLibraryMetricCatalog } from "@/lib/data/metricsCatalog";

// ─── QA mapping status ─────────────────────────────────────────────────
// MSTLibraryCell.qa_mapping_status, observed values: "pass",
// "mapped_to_performance" (validated), "flagged", "library_only_no_export_match"
// (needs attention). Unrecognized values fall back to neutral styling.

const QA_STATUS_STYLE: Record<string, string> = {
  pass: "bg-status-success/10 text-status-success border-status-success/25",
  mapped_to_performance: "bg-status-success/10 text-status-success border-status-success/25",
  flagged: "bg-status-danger/10 text-status-danger border-status-danger/25",
  library_only_no_export_match: "bg-status-warning/10 text-status-warning border-status-warning/25",
};

const QA_STATUS_LABEL: Record<string, string> = {
  pass: "Pass",
  mapped_to_performance: "Mapped to performance",
  flagged: "Flagged",
  library_only_no_export_match: "No export match",
};

// ─── Local creative visual (avoids circular import with CreativeCard) ──

const VIDEO_EXT = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);

function isVideo(url: string, filename?: string | null): boolean {
  const src = filename || url;
  const ext = /\.([a-zA-Z0-9]+)(?:[?#]|$)/.exec(src)?.[1]?.toLowerCase();
  return !!ext && VIDEO_EXT.has(ext);
}

function hueFor(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
  return h;
}

function ExpandVisualInner({ data, className }: { data: CreativeCardData; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loading = !broken && !loaded;
  const hue = hueFor(data.conceptCode);
  if (data.assetUrl && !broken) {
    if (isVideo(data.assetUrl, data.assetFilename)) {
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
            <div className="w-6 h-6 rounded-full border-2 border-primary/20 border-t-primary/50 animate-spin" />
          </div>
        )}
        <img
          src={data.assetUrl}
          alt={`Creative ${data.conceptCode}`}
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
  return (
    <div
      className={cn("w-full h-full flex flex-col items-center justify-center gap-2 select-none", className)}
      style={{ background: `linear-gradient(140deg, hsl(${hue} 45% 14%) 0%, hsl(${(hue + 40) % 360} 40% 9%) 100%)` }}
    >
      <span className="text-hero font-black tracking-tight leading-none" style={{ color: `hsl(${hue} 70% 72% / 0.85)` }}>
        {data.conceptCode}
      </span>
      <span className={cn(TYPE.microLabel, "flex items-center gap-1.5 text-foreground/55")}>
        <ImageOff className="w-3.5 h-3.5" /> No asset in import
      </span>
    </div>
  );
}

function ExpandVisual({ data, className }: { data: CreativeCardData; className?: string }) {
  return <ExpandVisualInner key={data.assetUrl ?? "__placeholder__"} data={data} className={className} />;
}

function LocalTagChips({ codes }: { codes: string[] }) {
  const flat = useMemo(() => codes.flatMap((c) => c.split(/\s*\+\s*/)).filter(Boolean), [codes]);
  return (
    <div className="flex flex-wrap gap-1">
      {flat.map((c, i) => (
        <span
          key={c + i}
          title={c}
          className={cn("text-micro font-medium border px-1.5 py-0.5 rounded leading-none", PREFIX_COLORS[getVariablePrefix(c)])}
        >
          {resolveVariableLabel(c)}
        </span>
      ))}
    </div>
  );
}

// ─── Formatting ────────────────────────────────────────────────────────

function usd(n: number | null | undefined, d = 0): string {
  if (n == null) return "–";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
}
function num(n: number | null | undefined): string {
  if (n == null) return "–";
  return Math.round(n).toLocaleString("en-US");
}
function pct(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${n.toFixed(2)}%`;
}

// ─── Tab chrome ────────────────────────────────────────────────────────
//
// The local TabBar is gone — see components/nav/TabRail.tsx. Its tabs stay
// ENABLED when their panel has nothing to show: each panel takes an
// emptyReason and explains itself, which tells the reader why this creative
// has no placement rows. A disabled tab would only say "no".

type Tab = "overview" | "demographics" | "placements" | "funnel" | "evidence";
type DemoMetric = "spend" | "results";
type PlacementMetric = "spend" | "cpa";

function MetricToggle({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded border border-border/30 overflow-hidden text-micro">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "pressable px-2.5 py-1 uppercase tracking-wide transition-colors",
            value === o.value
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground/75 hover:text-muted-foreground/75"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Overview tab ──────────────────────────────────────────────────────

function OverviewTab({ data, perfRows }: { data: CreativeCardData; perfRows: CellPerformanceRow[] }) {
  const s = data.stats;
  // Owner spec "Creative Overview Tiles": the platform's KpiTileRow over this
  // creative's own per-result-event rows, so the split behind a blended
  // results figure is shown (SharePieChart in the tile's ⓘ disclosure —
  // the existing hover/touch mechanic) instead of being lost one layer up.
  // The hand-rolled grid stays as the fallback when no rows exist.
  const catalog = useMemo(
    () => (perfRows.length > 0 ? buildLibraryMetricCatalog(perfRows).filter((m) => m.id !== "lib_cells") : []),
    [perfRows],
  );
  const eventSplit = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of perfRows) by.set(r["Result type"] || "results", (by.get(r["Result type"] || "results") ?? 0) + r.Results);
    return [...by.entries()].map(([name, value]) => ({ name, value }));
  }, [perfRows]);
  const disclosures = useMemo(
    () =>
      eventSplit.length > 1
        ? { lib_results: <SharePieChart data={eventSplit} unit="count" height={180} />, lib_cpa: <SharePieChart data={eventSplit} unit="count" height={180} /> }
        : undefined,
    [eventSplit],
  );
  return (
    <div className="space-y-5">
      {catalog.length > 0 && (
        <div className="grid grid-cols-2 gap-2" data-testid="creative-kpi-tiles">
          <KpiTileRow viewKey="creative-overview" catalog={catalog} tileCount={4} primaryFirst={false} disclosures={disclosures} />
        </div>
      )}
      {s && catalog.length === 0 && (
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: "Spend", value: usd(s.spend) },
            { label: s.resultLabel ?? "Results", value: num(s.results) },
            { label: "CPA", value: s.cpa != null ? usd(s.cpa) : "–" },
            { label: "Link CTR", value: pct(s.ctrPct) },
          ] as const).map((item) => (
            <div key={item.label} className="rounded-lg border border-border/30 bg-foreground/[0.02] px-3 py-2.5 text-center">
              <div className="text-micro uppercase text-muted-foreground/75 mb-1">{item.label}</div>
              <div className="text-callout font-bold text-foreground tabular-nums leading-none">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {(data.primaryText || data.secondaryText || data.cta || data.description) && (
        <div className="space-y-2">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>
            Copy
            {data.copySource && data.copySource !== "library" && (
              <span className="ml-1 normal-case tracking-normal font-normal">
                · from {data.copySource === "performance_export" ? "the performance export" : data.copySource === "meta_api" ? "the Meta API" : "the uploaded creative"}
              </span>
            )}
          </p>
          {data.primaryText && <p className="text-body text-foreground/85 leading-relaxed">{data.primaryText}</p>}
          {data.secondaryText && <p className="text-caption text-muted-foreground/75 leading-relaxed">{data.secondaryText}</p>}
          {data.description && <p className="text-caption text-muted-foreground/75 leading-relaxed">{data.description}</p>}
          {data.cta && (
            <span className="inline-flex text-label font-semibold text-interactive border border-primary/25 bg-primary/10 px-2 py-1 rounded">
              CTA · {data.cta}
            </span>
          )}
          {(data.linkDestination || data.mediaName) && (
            <p className="text-label text-muted-foreground/75 truncate" title={[data.linkDestination, data.mediaName].filter(Boolean).join(" · ")}>
              {[data.linkDestination, data.mediaName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}

      {data.iapRead && (
        <div className="space-y-1.5">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>IAP read</p>
          <p className="text-caption text-foreground/80 leading-relaxed">{data.iapRead}</p>
        </div>
      )}

      {(data.qaMappingStatus || data.mappingConfidence) && (
        <div className="space-y-1.5">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>QA mapping</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.qaMappingStatus && (
              <span
                className={cn(
                  "inline-flex text-label font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                  QA_STATUS_STYLE[data.qaMappingStatus] ?? "bg-muted text-muted-foreground/75 border-border/40",
                )}
              >
                {QA_STATUS_LABEL[data.qaMappingStatus] ?? humanizeEnum(data.qaMappingStatus)}
              </span>
            )}
            {data.mappingConfidence && (
              <span className="text-label font-semibold uppercase tracking-wide text-muted-foreground/75 border border-border/40 px-1.5 py-0.5 rounded leading-none">
                {data.mappingConfidence} confidence
              </span>
            )}
          </div>
        </div>
      )}

      {data.tags.length > 0 && (
        <div className="space-y-1.5">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Variable stack</p>
          <LocalTagChips codes={data.tags} />
        </div>
      )}
    </div>
  );
}

// ─── Demographics tab ──────────────────────────────────────────────────

interface AgeBucket {
  age: string;
  male: number; female: number; total: number;
  maleResults: number; femaleResults: number;
  maleCpa: number | null; femaleCpa: number | null;
  maleCtr: number | null; femaleCtr: number | null;
  maleReach: number; femaleReach: number;
  maleImpressions: number; femaleImpressions: number;
  maleLinkClicks: number; femaleLinkClicks: number;
  maleGender: string | null; femaleGender: string | null;
}

function DemographicsTab({
  rows,
  onSegmentClick,
  emptyReason,
}: {
  rows: DemographicRow[];
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
  /** Cause-specific empty-state text (file never imported vs account-level-only grain vs no rows for this cell). */
  emptyReason?: string | null;
}) {
  const [metric, setMetric] = useState<DemoMetric>("spend");

  const buckets = useMemo<AgeBucket[]>(() => {
    const map = new Map<string, AgeBucket>();
    for (const r of rows) {
      const g = r.Gender.toLowerCase();
      const b = map.get(r.Age) ?? {
        age: r.Age, male: 0, female: 0, total: 0,
        maleResults: 0, femaleResults: 0,
        maleCpa: null, femaleCpa: null,
        maleCtr: null, femaleCtr: null,
        maleReach: 0, femaleReach: 0,
        maleImpressions: 0, femaleImpressions: 0,
        maleLinkClicks: 0, femaleLinkClicks: 0,
        maleGender: null, femaleGender: null,
      };
      // CPA and CTR used to be ASSIGNED here from each row's own rate —
      // inside a loop over every row in the age×gender bucket, so the last
      // row silently won and the dialog reported one ad's rate as the
      // bucket's (F-c). They are ratios; averaging or picking them across
      // rows is not the blend. Accumulate the denominators and derive once
      // below, which is what every other audience surface already does.
      if (g === "male") {
        b.male += r["Amount spent (USD)"];
        b.maleResults += r.Results;
        b.maleReach += r.Reach;
        b.maleImpressions += r.Impressions;
        b.maleLinkClicks += r["Link clicks"];
        b.maleGender = r.Gender;
      } else {
        b.female += r["Amount spent (USD)"];
        b.femaleResults += r.Results;
        b.femaleReach += r.Reach;
        b.femaleImpressions += r.Impressions;
        b.femaleLinkClicks += r["Link clicks"];
        b.femaleGender = r.Gender;
      }
      b.total += r["Amount spent (USD)"];
      map.set(r.Age, b);
    }
    for (const b of map.values()) {
      // Null, not 0, on a zero denominator: a bucket with no results has
      // no CPA, and $0.00 would assert one.
      b.maleCpa = b.maleResults > 0 ? b.male / b.maleResults : null;
      b.femaleCpa = b.femaleResults > 0 ? b.female / b.femaleResults : null;
      b.maleCtr = b.maleImpressions > 0 ? (b.maleLinkClicks / b.maleImpressions) * 100 : null;
      b.femaleCtr = b.femaleImpressions > 0 ? (b.femaleLinkClicks / b.femaleImpressions) * 100 : null;
    }
    return Array.from(map.values()).sort((a, b) => (parseInt(a.age) || 999) - (parseInt(b.age) || 999));
  }, [rows]);

  // Default-select the bucket with highest spend
  const [selectedAge, setSelectedAge] = useState<string | null>(null);
  const defaultBucket = useMemo(() => {
    if (!buckets.length) return null;
    return [...buckets].sort((a, b) => b.total - a.total)[0];
  }, [buckets]);
  const activeBucket = buckets.find((b) => b.age === selectedAge) ?? defaultBucket;

  const maxSpend = useMemo(() => Math.max(...buckets.map((b) => b.total), 1), [buckets]);
  const maxResults = useMemo(() => Math.max(...buckets.map((b) => b.maleResults + b.femaleResults), 1), [buckets]);

  const barVal = (b: AgeBucket) => metric === "spend" ? b.total : (b.maleResults + b.femaleResults);
  const barMax = metric === "spend" ? maxSpend : maxResults;
  const fmtMain = (n: number) => metric === "spend" ? usd(n) : num(n);

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center space-y-1.5">
        <p className="text-body font-medium text-muted-foreground/75">No demographic data for this cell</p>
        <p className="text-label text-muted-foreground/75">
          {emptyReason ?? "Import a demographic pivot export to see the age × gender breakdown."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-label uppercase tracking-widest text-muted-foreground/75">Age × Gender</p>
        <MetricToggle
          options={[{ value: "spend", label: "Spend" }, { value: "results", label: "Results" }]}
          value={metric}
          onChange={(v) => setMetric(v as DemoMetric)}
        />
      </div>

      {/* Bar chart — each row is a clickable card */}
      <div className="space-y-1.5">
        {buckets.map((b) => {
          const isActive = activeBucket?.age === b.age;
          const barW = Math.round((barVal(b) / barMax) * 100);
          const mSpend = b.male; const fSpend = b.female;
          const mPct = b.total > 0 ? (mSpend / b.total) * 100 : 50;
          const fPct = 100 - mPct;
          const mRes = b.maleResults; const fRes = b.femaleResults;
          const totalRes = mRes + fRes;
          const mResPct = totalRes > 0 ? (mRes / totalRes) * 100 : 50;
          const fResPct = 100 - mResPct;
          const [mBarPct, fBarPct] = metric === "spend" ? [mPct, fPct] : [mResPct, fResPct];

          return (
            <button
              key={b.age}
              onClick={() => setSelectedAge(b.age)}
              className={cn(
                "pressable-lg w-full text-left rounded-lg border px-3 py-2.5 transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                isActive
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border/30 bg-foreground/[0.015] hover:border-border/50 hover:bg-foreground/[0.03]"
              )}
            >
              {/* Row header: age + value */}
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-title font-bold", isActive ? "text-foreground" : "text-foreground/75")}>
                  {b.age}
                </span>
                <span className="text-body tabular-nums text-muted-foreground/75 font-medium">
                  {fmtMain(barVal(b))}
                </span>
              </div>

              {/* Stacked bar */}
              <div className="h-4 rounded-md bg-foreground/[0.04] overflow-hidden">
                <div
                  className="h-full flex rounded-md overflow-hidden transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-500"
                  style={{ width: `${barW}%` }}
                >
                  <div
                    className="h-full bg-chart-1/50"
                    style={{ width: `${mBarPct}%` }}
                    title={`Male: ${metric === "spend" ? usd(mSpend) : num(mRes)}`}
                  />
                  <div
                    className="h-full bg-status-danger/50"
                    style={{ width: `${fBarPct}%` }}
                    title={`Female: ${metric === "spend" ? usd(fSpend) : num(fRes)}`}
                  />
                </div>
              </div>

              {/* M/F inline values */}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-label text-accent/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-chart-1/60 shrink-0" />
                  M {metric === "spend" ? usd(mSpend) : num(mRes)}
                </span>
                <span className="flex items-center gap-1 text-label text-status-danger/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-danger/60 shrink-0" />
                  F {metric === "spend" ? usd(fSpend) : num(fRes)}
                </span>
                {isActive && (
                  <span className="ml-auto text-micro uppercase text-interactive/70">
                    Selected ↑
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* KPI panel for selected bucket */}
      {activeBucket && (
        <div className="rounded-xl border border-border/40 bg-foreground/[0.025] overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
            <div>
              <span className="text-label uppercase tracking-widest text-muted-foreground/75">Segment KPIs</span>
              <span className="ml-2 text-body font-semibold text-foreground">{activeBucket.age}</span>
            </div>
          </div>

          {/* KPI grid: Male vs Female */}
          <div className="grid grid-cols-2 divide-x divide-border/30">
            {([
              {
                label: "Male", dot: "bg-chart-1", color: "text-accent",
                spend: activeBucket.male, results: activeBucket.maleResults,
                cpa: activeBucket.maleCpa, ctr: activeBucket.maleCtr,
                reach: activeBucket.maleReach, gender: activeBucket.maleGender,
              },
              {
                label: "Female", dot: "bg-status-danger", color: "text-status-danger",
                spend: activeBucket.female, results: activeBucket.femaleResults,
                cpa: activeBucket.femaleCpa, ctr: activeBucket.femaleCtr,
                reach: activeBucket.femaleReach, gender: activeBucket.femaleGender,
              },
            ] as const).map((g) => (
              <div key={g.label} className="p-3 space-y-3">
                {/* Gender header */}
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", g.dot)} />
                  <span className={cn("text-caption font-semibold", g.color)}>{g.label}</span>
                </div>

                {/* KPI rows */}
                <div className="space-y-2">
                  {([
                    { key: "spend", label: "Spend", value: usd(g.spend) },
                    { key: "results", label: "Results", value: num(g.results) },
                    { key: "cpa", label: "CPA", value: g.cpa != null ? usd(g.cpa, 2) : "–" },
                    { key: "ctr", label: "Link CTR", value: g.ctr != null ? pct(g.ctr) : "–" },
                    { key: "reach", label: "Reach", value: num(g.reach) },
                  ] as const).map((kpi) => (
                    <div key={kpi.key} className="flex items-center justify-between">
                      <span className="text-label text-muted-foreground/75">{kpi.label}</span>
                      <span className="text-body font-semibold tabular-nums text-foreground/90">{kpi.value}</span>
                    </div>
                  ))}
                </div>

                {/* Drill-down button */}
                {onSegmentClick && g.gender && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSegmentClick({ age: activeBucket.age, gender: g.gender! }); }}
                    data-testid={`chip-demo-${activeBucket.age}-${g.label.toLowerCase()}`}
                    className={cn(
                      "pressable-lg w-full text-label font-medium rounded-md border py-1.5 transition-colors",
                      g.label === "Male"
                        ? "border-accent/25 text-accent/80 hover:bg-accent/10"
                        : "border-status-danger/25 text-status-danger/80 hover:bg-status-danger/10"
                    )}
                  >
                    Drill down
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={cn(TYPE.caption, "text-muted-foreground/75 pt-1")}>
        Click an age group to inspect its segment KPIs. Bar width = proportion of highest group.
      </p>
    </div>
  );
}

// ─── Placements tab ────────────────────────────────────────────────────

function PlacementsTab({ rows, emptyReason }: { rows: PlacementRow[]; emptyReason?: string | null }) {
  const [metric, setMetric] = useState<PlacementMetric>("spend");

  const buckets = useMemo(() => {
    const map = new Map<string, PlacementRow>();
    for (const r of rows) {
      const key = `${r.Placement}|${r.Platform}`;
      const prev = map.get(key);
      map.set(key, prev ? {
        ...prev,
        "Amount spent (USD)": prev["Amount spent (USD)"] + r["Amount spent (USD)"],
        Results: prev.Results + r.Results,
        Impressions: prev.Impressions + r.Impressions,
        "Link clicks": prev["Link clicks"] + r["Link clicks"],
        CPA: null,
      } : { ...r });
    }
    return Array.from(map.values())
      .sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"])
      .slice(0, 7);
  }, [rows]);

  const maxVal = useMemo(() => {
    if (metric === "spend") return Math.max(...buckets.map((b) => b["Amount spent (USD)"]), 1);
    return Math.max(...buckets.map((b) => b.Results > 0 ? b["Amount spent (USD)"] / b.Results : 0), 1);
  }, [buckets, metric]);

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center space-y-1.5">
        <p className="text-body font-medium text-muted-foreground/75">No placement data for this account</p>
        <p className="text-label text-muted-foreground/75">
          {emptyReason ?? "Import a device × placement export to see placement signal."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Account-level placements</p>
        <MetricToggle
          options={[{ value: "spend", label: "Spend" }, { value: "cpa", label: "CPA" }]}
          value={metric}
          onChange={(v) => setMetric(v as PlacementMetric)}
        />
      </div>

      <div className="space-y-4">
        {buckets.map((b) => {
          const cpa = b.Results > 0 ? b["Amount spent (USD)"] / b.Results : null;
          const val = metric === "spend" ? b["Amount spent (USD)"] : (cpa ?? 0);
          const barW = Math.round((val / maxVal) * 100);
          return (
            <div key={b.Placement + b.Platform} className="space-y-1.5">
              <div className="flex items-center justify-between text-label">
                <div className="min-w-0">
                  <span className="font-medium text-foreground/80">{b.Placement}</span>
                  <span className={cn(TYPE.caption, "ml-1.5 text-muted-foreground/75")}>{platformLabel(b.Platform)}</span>
                </div>
                <span className="tabular-nums text-muted-foreground/75 shrink-0 ml-2">
                  {metric === "spend" ? usd(b["Amount spent (USD)"]) : cpa != null ? usd(cpa) : "–"}
                </span>
              </div>
              <ProgressMeter
                value={barW}
                total={100}
                label={`${b.Placement} ${metric === "spend" ? "spend" : "CPA"} share`}
                size="md"
                fillClassName="bg-primary/50"
              />
              <div className={cn(TYPE.caption, "text-muted-foreground/75")}>
                {num(b.Results)} results · {usd(b["Amount spent (USD)"])} spend
              </div>
            </div>
          );
        })}
      </div>

      <p className={cn(TYPE.caption, "text-muted-foreground/75 pt-2 border-t border-border/20")}>
        Placement signal is account-level · not scoped to this creative cell.
      </p>
    </div>
  );
}

// ─── Funnel tab ─────────────────────────────────────────────────────────

/**
 * The result types the scoped account's ads ran under — the seed's derived
 * `result_events`, else the distinct types on its cell rows. This is what
 * decides which conversion steps the funnel has (G8): the chain is built
 * from observed events, never from a fixed cart → checkout → purchase list.
 */
function useAccountResultTypes(): string[] {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  return useMemo(() => {
    const fromEvents = (account?.result_events ?? []).map((e) => e.raw);
    if (fromEvents.length > 0) return fromEvents;
    return [...new Set((account?.iap?.analysis?.performance_by_cell ?? []).map((r) => r["Result type"]).filter(Boolean))];
  }, [account]);
}

function FunnelTab({ perfRow, perfRows, emptyReason }: { perfRow: CellPerformanceRow | null; perfRows: CellPerformanceRow[]; emptyReason?: string | null }) {
  const events = useAccountResultTypes();
  if (!perfRow) {
    return (
      <div className="py-10 text-center space-y-1.5">
        <p className="text-body font-medium text-muted-foreground/75">No performance data</p>
        <p className="text-label text-muted-foreground/75">
          {emptyReason ?? "Funnel steps require performance data for this creative."}
        </p>
      </div>
    );
  }
  const steps = buildFunnelSteps(perfRow, { events, rowsByEvent: perfRows });
  const { chain, other } = describeFunnelChain(events);
  const unmeasured = steps.filter((s) => s.kind === "conversion" && s.value == null);
  const observed = other.map((c) => funnelStepLabel(c.raw));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-label uppercase tracking-widest text-muted-foreground/75">{chain.length > 0 ? "Conversion funnel" : "Delivery"}</p>
      </div>
      <FunnelStepsChart steps={steps} />
      {chain.length === 0 && (
        <p className={cn(TYPE.caption, "text-muted-foreground/75 pt-1 border-t border-border/20")} data-testid="funnel-no-chain">
          No conversion chain · this account's ads ran under {observed.length > 0 ? observed.join(", ") : "no placed result event"}. Delivery steps only.
        </p>
      )}
      {chain.length > 0 && unmeasured.length > 0 && (
        <p className={cn(TYPE.caption, "text-muted-foreground/75 pt-1 border-t border-border/20")}>
          Not measured for this cell: {unmeasured.map((s) => s.label).join(", ")}. A step is filled from the cell's own row for that event, or from the export's funnel column that counts it.
        </p>
      )}
    </div>
  );
}

// ─── Main dialog export ────────────────────────────────────────────────

export interface CreativeExpandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CreativeCardData;
  demographic?: DemographicRow[];
  placements?: PlacementRow[];
  /**
   * Extra footer actions. The render-prop form receives close() so an
   * action can dismiss this dialog before opening another surface
   * (otherwise the new surface stacks BEHIND the still-open dialog).
   */
  expandFooter?: React.ReactNode | ((close: () => void) => React.ReactNode);
  unmapped?: boolean;
  onUploadCreatives?: () => void;
  /** When provided, Demographics rows become tappable → segment drill-down. */
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
  /** Performance row for this cell — used to render the Funnel tab. */
  perfRow?: CellPerformanceRow | null;
  /** Every per-result-event row for this cell (the blended-results split). */
  perfRows?: CellPerformanceRow[];
  /** Cause-specific empty-state text per tab (§1.4 honesty: "file never imported" vs "imported but no rows for this cell" vs "account-level grain only" each need a different remedy). */
  demographicEmptyReason?: string | null;
  placementsEmptyReason?: string | null;
  funnelEmptyReason?: string | null;
}

export function CreativeExpandDialog({
  open, onOpenChange, data,
  demographic = [], placements = [],
  expandFooter, unmapped, onUploadCreatives, onSegmentClick,
  perfRow = null,
  perfRows,
  demographicEmptyReason,
  placementsEmptyReason,
  funnelEmptyReason,
}: CreativeExpandDialogProps) {
  const [tab, setTab] = useState<Tab>("overview");

  // Empty-state reasons are DERIVED here from the scoped account's own
  // analysis data, so every call site gets the cause-specific text without
  // having to pass it (seven of ten did not). An explicitly supplied reason
  // still wins — callers that scope a card differently than by cell code
  // know better than the derivation does.
  const derivedReasons = useCreativeEmptyReasons(data.conceptCode);
  // Evidence joined through the creative's mapped Ad IDs first, cell code
  // second (spec §14). When ad-grain rows exist they replace the cell-only
  // paths below; the account-level fallbacks stay for accounts whose latest
  // run predates the layer.
  const evidence = useCreativeEvidence(data.conceptCode, data.adNames);
  // The cell-grain demographic rows live on the account's analysis; a call
  // site that passes none (the Creative Library did) must not turn a cell
  // with rows into "No demographic data" — the derivation one line down
  // reads the same rows and would say they exist.
  const cellDemographic = useMemo(
    () => (demographic.length > 0 ? demographic : (evidence.cellDemographic ?? [])),
    [demographic, evidence.cellDemographic],
  );
  const hasAdDemo = evidence.demographic.length > 0;
  const hasAdPlacement = evidence.placement.length > 0;
  const funnelFromAds = !perfRow && evidence.funnel ? evidence.funnel : null;
  const effectivePerfRow = perfRow ?? funnelFromAds?.row ?? null;
  const effectivePerfRows = perfRows && perfRows.length > 0 ? perfRows : effectivePerfRow ? [effectivePerfRow] : [];
  const demoReason = hasAdDemo ? null : demographicEmptyReason ?? derivedReasons.demographic;
  const placeReason = hasAdPlacement ? null : placementsEmptyReason ?? derivedReasons.placements;
  const funnelReason = effectivePerfRow ? null : funnelEmptyReason ?? derivedReasons.funnel;

  // Labels only: five tabs beside the media pane clipped the last one when
  // each carried an icon (the rail scrolls, but a clipped "Evi…" reads as a
  // defect). The icon set stays in the imports for the tab content headers.
  const TABS: { id: Tab; label: string }[] = [
    { id: "overview",     label: "Overview" },
    { id: "demographics", label: "Demographics" },
    { id: "placements",   label: "Placements" },
    { id: "funnel",       label: "Funnel" },
    { id: "evidence",     label: "Evidence" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl bg-surface-deep border-border/40 p-0 gap-0 overflow-hidden duration-200 max-h-[92vh]"
      >
        <div className="grid grid-rows-[260px_1fr] sm:grid-rows-none sm:grid-cols-[42%_1fr] min-h-0 max-h-[92vh] overflow-hidden">

          {/* ── Left: creative visual ──
              The other half of the shared-layout pair. This carries the same
              `layoutId` as the tile's visual in CreativeCard, so the creative
              travels from the grid into this pane rather than the tile
              disappearing and a modal fading in elsewhere. See the comment on
              the card side for why the tile stays mounted. */}
          <div className="relative overflow-hidden bg-surface-preview sm:border-r border-b sm:border-b-0 border-border/30">
            <motion.div layoutId={`creative-media-${creativeLayoutKey(data)}`} className="absolute inset-0">
              <ExpandVisual data={data} className="absolute inset-0" />
            </motion.div>

            {unmapped && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-status-warning/20 border border-status-warning/30 text-status-warning text-micro font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-status-warning" />
                Unmapped
              </div>
            )}

            {data.assetFormat && (
              <div className="absolute bottom-3 left-3">
                <span className="text-micro uppercase text-foreground/55 border border-foreground/10 bg-background/40 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {data.assetFormat}
                </span>
              </div>
            )}
          </div>

          {/* ── Right: data panel ── */}
          <div className="flex flex-col min-h-0 overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-border/30 shrink-0">
              <div className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-0.5")}>
                Creative · {data.conceptCode}
              </div>
              {/* This heading was a <p>, so DialogContent had no
                  aria-labelledby target and a screen reader announced an
                  unnamed dialog (Radix also warns for it). DialogTitle
                  renders the h2 the heading already was semantically and
                  wires the label; the visible text is unchanged. The
                  visual-system line becomes the description, and when a
                  creative has none an sr-only one stands in — so
                  aria-describedby always points at a real element instead
                  of being suppressed on some creatives and not others. */}
              <DialogTitle className={cn(TYPE.title, "leading-tight")}>{data.title}</DialogTitle>
              {/* The description is always present and always sr-only, so
                  aria-describedby points at a stable element whether or not
                  this creative has a visual system. The visible line is
                  separate and readable: it was a raw line-clamp-2 with no
                  way to reach the hidden remainder. */}
              <DialogDescription className="sr-only">
                {data.visualSystem ?? `Performance detail for creative ${data.conceptCode}.`}
              </DialogDescription>
              {data.visualSystem && (
                <DenseText
                  text={data.visualSystem}
                  className="text-caption text-muted-foreground/75 mt-0.5 leading-relaxed"
                />
              )}
            </div>

            {/* Tab bar */}
            <TabRail tabs={TABS} active={tab} onChange={setTab as (id: Tab) => void} label="Creative detail section" className="shrink-0 px-1" />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {/* Unmapped warning shown in overview */}
              {unmapped && tab === "overview" && (
                <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg border border-status-warning/25 bg-status-warning/[0.05]">
                  <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-px" strokeWidth={1.5} />
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-caption font-medium text-status-warning/90">Not fully mapped to IAP library</p>
                    <p className="text-label text-muted-foreground/75 leading-relaxed">
                      This cell has performance data but no library entry. Variable codes, copy, and asset may be absent.
                    </p>
                    {onUploadCreatives && (
                      <button
                        onClick={() => { onOpenChange(false); onUploadCreatives(); }}
                        className="pressable flex items-center gap-1 text-label font-medium text-status-warning hover:text-status-warning border border-status-warning/25 bg-status-warning/[0.06] hover:bg-status-warning/10 px-2 py-1 rounded transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload creatives
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tab === "overview"     && <OverviewTab      data={data} perfRows={effectivePerfRows} />}
              {tab === "demographics" && (hasAdDemo
                ? <DemographicHeatGrid rows={evidence.demographic} resultLabel={data.stats?.resultLabel ?? "results"} />
                : <DemographicsTab  rows={cellDemographic} onSegmentClick={onSegmentClick} emptyReason={demoReason} />)}
              {tab === "placements"   && (hasAdPlacement
                ? <PlacementDrill rows={evidence.placement} unattributedSpend={evidence.placementUnattributed} resultLabel={data.stats?.resultLabel ?? "results"} />
                : <PlacementsTab    rows={placements} emptyReason={placeReason} />)}
              {tab === "funnel"       && (
                <div className="space-y-3">
                  {funnelFromAds && (
                    <div className="flex items-center gap-2 flex-wrap" data-testid="funnel-evidence">
                      <EvidenceChip state={funnelFromAds.evidence_state} testId="funnel-evidence-chip" />
                      <span className={cn(TYPE.caption, "text-muted-foreground/75")}>
                        joined through {evidence.identity.adIds.length} mapped Ad ID{evidence.identity.adIds.length === 1 ? "" : "s"} · {funnelFromAds.source === "ad_summary" ? "Ad Summary control" : "ad-level totals"}
                      </span>
                      <EvidenceExplainer state={funnelFromAds.evidence_state} contextual={funnelFromAds.source !== "ad_summary"} />
                    </div>
                  )}
                  <FunnelTab perfRow={effectivePerfRow} perfRows={effectivePerfRows} emptyReason={funnelReason} />
                </div>
              )}
              {tab === "evidence"     && <EvidenceTab identity={evidence.identity} assets={evidence.assets} evidence={evidence.variableEvidence} segments={evidence.variableSegments} />}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-3 border-t border-border/30 flex items-center gap-2 flex-wrap bg-surface-deep">
              <AdsManagerButton metaAdId={data.metaAdId} adAccountId={data.adAccountId} />
              {typeof expandFooter === "function" ? expandFooter(() => onOpenChange(false)) : expandFooter}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
