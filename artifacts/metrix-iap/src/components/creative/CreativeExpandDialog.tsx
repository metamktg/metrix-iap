// ─── Creative expand dialog ────────────────────────────────────────────
// Full-size split-view dialog: creative visual left, tabbed data panel
// right. Tabs: Overview (stats/copy/tags) · Demographics (age × gender
// bar chart) · Placements (account-level spend/CPA bars).
// Self-contained — intentionally does NOT import runtime code from
// CreativeCard to avoid circular deps; types only via import type.

import { useState, useMemo } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { Upload, BarChart2, Users, Monitor, ImageOff, AlertTriangle, TrendingDown } from "lucide-react";
import { Dialog, DialogContent } from "@workspace/command-deck/components/ui/dialog";
import type { CellPerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import type { CreativeCardData } from "./CreativeCard";
import { FunnelStepsChart, buildFunnelSteps } from "./FunnelStepsChart";
import { AdsManagerButton } from "./AdsManagerLink";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";
import { useCreativeEmptyReasons } from "@/hooks/useCreativeEmptyReasons";

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
          <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
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
      <span className={cn(TYPE.microLabel, "flex items-center gap-1.5 text-white/35")}>
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
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

// ─── Tab chrome ────────────────────────────────────────────────────────

type Tab = "overview" | "demographics" | "placements" | "funnel";
type DemoMetric = "spend" | "results";
type PlacementMetric = "spend" | "cpa";

function TabBar({ tabs, active, onChange }: {
  tabs: { id: Tab; label: string; icon: React.ReactNode }[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="flex border-b border-border/30 shrink-0 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2.5 text-label font-medium transition-colors border-b-2 -mb-px",
            active === t.id
              ? "text-foreground border-primary"
              : "text-muted-foreground/50 border-transparent hover:text-muted-foreground/80"
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

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
            "px-2.5 py-1 font-mono uppercase tracking-wide transition-colors",
            value === o.value
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground/50 hover:text-muted-foreground/70"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Overview tab ──────────────────────────────────────────────────────

function OverviewTab({ data }: { data: CreativeCardData }) {
  const s = data.stats;
  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: "Spend", value: usd(s.spend) },
            { label: s.resultLabel ?? "Results", value: num(s.results) },
            { label: "CPA", value: s.cpa != null ? usd(s.cpa) : "—" },
            { label: "Link CTR", value: pct(s.ctrPct) },
          ] as const).map((item) => (
            <div key={item.label} className="rounded-lg border border-border/30 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-1">{item.label}</div>
              <div className="text-lg font-bold text-foreground tabular-nums leading-none">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {(data.primaryText || data.secondaryText || data.cta) && (
        <div className="space-y-2">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/50")}>Copy</p>
          {data.primaryText && <p className="text-body text-foreground/85 leading-relaxed">{data.primaryText}</p>}
          {data.secondaryText && <p className="text-caption text-muted-foreground/60 leading-relaxed">{data.secondaryText}</p>}
          {data.cta && (
            <span className="inline-flex text-label font-semibold text-interactive border border-primary/25 bg-primary/10 px-2 py-1 rounded">
              CTA · {data.cta}
            </span>
          )}
        </div>
      )}

      {data.iapRead && (
        <div className="space-y-1.5">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/50")}>IAP read</p>
          <p className="text-caption text-foreground/80 leading-relaxed">{data.iapRead}</p>
        </div>
      )}

      {(data.qaMappingStatus || data.mappingConfidence) && (
        <div className="space-y-1.5">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/50")}>QA mapping</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.qaMappingStatus && (
              <span
                className={cn(
                  "inline-flex text-label font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                  QA_STATUS_STYLE[data.qaMappingStatus] ?? "bg-muted text-muted-foreground/60 border-border/40",
                )}
              >
                {QA_STATUS_LABEL[data.qaMappingStatus] ?? data.qaMappingStatus}
              </span>
            )}
            {data.mappingConfidence && (
              <span className="text-label font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border/40 px-1.5 py-0.5 rounded leading-none">
                {data.mappingConfidence} confidence
              </span>
            )}
          </div>
        </div>
      )}

      {data.tags.length > 0 && (
        <div className="space-y-1.5">
          <p className={cn(TYPE.microLabel, "text-muted-foreground/50")}>Variable stack</p>
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
        <p className="text-body font-medium text-muted-foreground/60">No demographic data for this cell</p>
        <p className="text-label text-muted-foreground/50">
          {emptyReason ?? "Import a demographic pivot export to see the age × gender breakdown."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Age × Gender</p>
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
                "w-full text-left rounded-lg border px-3 py-2.5 transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                isActive
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border/30 bg-white/[0.015] hover:border-border/50 hover:bg-white/[0.03]"
              )}
            >
              {/* Row header: age + value */}
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-title font-semibold", isActive ? "text-foreground" : "text-foreground/75")}>
                  {b.age}
                </span>
                <span className="text-body tabular-nums text-muted-foreground/70 font-medium">
                  {fmtMain(barVal(b))}
                </span>
              </div>

              {/* Stacked bar */}
              <div className="h-4 rounded-md bg-white/[0.04] overflow-hidden">
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
                  <span className="ml-auto text-micro font-mono uppercase tracking-wider text-interactive/70">
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
        <div className="rounded-xl border border-border/40 bg-white/[0.025] overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
            <div>
              <span className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Segment KPIs</span>
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
                    { key: "cpa", label: "CPA", value: g.cpa != null ? usd(g.cpa, 2) : "—" },
                    { key: "ctr", label: "Link CTR", value: g.ctr != null ? pct(g.ctr) : "—" },
                    { key: "reach", label: "Reach", value: num(g.reach) },
                  ] as const).map((kpi) => (
                    <div key={kpi.key} className="flex items-center justify-between">
                      <span className="text-label text-muted-foreground/60">{kpi.label}</span>
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
                      "w-full text-label font-medium rounded-md border py-1.5 transition-colors",
                      g.label === "Male"
                        ? "border-accent/25 text-accent/80 hover:bg-accent/10"
                        : "border-status-danger/25 text-status-danger/80 hover:bg-status-danger/10"
                    )}
                  >
                    Drill down →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={cn(TYPE.caption, "text-muted-foreground/40 pt-1")}>
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
        <p className="text-body font-medium text-muted-foreground/60">No placement data for this account</p>
        <p className="text-label text-muted-foreground/50">
          {emptyReason ?? "Import a device × placement export to see placement signal."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={cn(TYPE.microLabel, "text-muted-foreground/50")}>Account-level placements</p>
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
                  <span className={cn(TYPE.caption, "ml-1.5 text-muted-foreground/50 capitalize")}>{b.Platform}</span>
                </div>
                <span className="tabular-nums text-muted-foreground/60 shrink-0 ml-2">
                  {metric === "spend" ? usd(b["Amount spent (USD)"]) : cpa != null ? usd(cpa) : "—"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/50 transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-700"
                  style={{ width: `${barW}%` }}
                />
              </div>
              <div className={cn(TYPE.caption, "text-muted-foreground/45")}>
                {num(b.Results)} results · {usd(b["Amount spent (USD)"])} spend
              </div>
            </div>
          );
        })}
      </div>

      <p className={cn(TYPE.caption, "text-muted-foreground/40 pt-2 border-t border-border/20")}>
        Placement signal is account-level — not scoped to this creative cell.
      </p>
    </div>
  );
}

// ─── Funnel tab ─────────────────────────────────────────────────────────

function FunnelTab({ perfRow, emptyReason }: { perfRow: CellPerformanceRow | null; emptyReason?: string | null }) {
  if (!perfRow) {
    return (
      <div className="py-10 text-center space-y-1.5">
        <p className="text-body font-medium text-muted-foreground/60">No performance data</p>
        <p className="text-label text-muted-foreground/50">
          {emptyReason ?? "Funnel steps require performance data for this creative."}
        </p>
      </div>
    );
  }
  const steps = buildFunnelSteps(perfRow);
  const hasAnyFunnel = perfRow.adds_to_cart != null || perfRow.checkouts_initiated != null || perfRow.purchases != null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-label font-mono uppercase tracking-widest text-muted-foreground/60">Conversion funnel</p>
      </div>
      <FunnelStepsChart steps={steps} />
      {!hasAnyFunnel && (
        <p className={cn(TYPE.caption, "text-muted-foreground/40 pt-1 border-t border-border/20")}>
          Adds to cart, checkouts, and purchases are only available when the source export includes conversion-event columns.
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
  const demoReason = demographicEmptyReason ?? derivedReasons.demographic;
  const placeReason = placementsEmptyReason ?? derivedReasons.placements;
  const funnelReason = funnelEmptyReason ?? derivedReasons.funnel;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",      label: "Overview",      icon: <BarChart2    className="w-3.5 h-3.5" /> },
    { id: "demographics",  label: "Demographics",  icon: <Users        className="w-3.5 h-3.5" /> },
    { id: "placements",    label: "Placements",    icon: <Monitor      className="w-3.5 h-3.5" /> },
    { id: "funnel",        label: "Funnel",        icon: <TrendingDown className="w-3.5 h-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl bg-surface-deep border-border/40 p-0 gap-0 overflow-hidden duration-200 max-h-[92vh]"
      >
        <div className="grid grid-rows-[260px_1fr] sm:grid-rows-none sm:grid-cols-[42%_1fr] min-h-0 max-h-[92vh] overflow-hidden">

          {/* ── Left: creative visual ── */}
          <div className="relative overflow-hidden bg-surface-preview sm:border-r border-b sm:border-b-0 border-border/30">
            <ExpandVisual data={data} className="absolute inset-0" />

            {unmapped && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-status-warning/20 border border-status-warning/30 text-status-warning text-micro font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-status-warning" />
                Unmapped
              </div>
            )}

            {data.assetFormat && (
              <div className="absolute bottom-3 left-3">
                <span className="text-[8px] font-mono uppercase text-white/50 border border-white/10 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {data.assetFormat}
                </span>
              </div>
            )}
          </div>

          {/* ── Right: data panel ── */}
          <div className="flex flex-col min-h-0 overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-border/30 shrink-0">
              <div className={cn(TYPE.microLabel, "text-muted-foreground/50 mb-0.5")}>
                Creative · {data.conceptCode}
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight">{data.title}</p>
              {data.visualSystem && (
                <p className="text-caption text-muted-foreground/55 mt-0.5 leading-relaxed line-clamp-2">{data.visualSystem}</p>
              )}
            </div>

            {/* Tab bar */}
            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {/* Unmapped warning shown in overview */}
              {unmapped && tab === "overview" && (
                <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg border border-status-warning/25 bg-status-warning/[0.05]">
                  <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-px" strokeWidth={1.5} />
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-caption font-medium text-status-warning/90">Not fully mapped to IAP library</p>
                    <p className="text-label text-muted-foreground/70 leading-relaxed">
                      This cell has performance data but no library entry — variable codes, copy, and asset may be absent.
                    </p>
                    {onUploadCreatives && (
                      <button
                        onClick={() => { onOpenChange(false); onUploadCreatives(); }}
                        className="flex items-center gap-1 text-label font-medium text-status-warning hover:text-status-warning border border-status-warning/25 bg-status-warning/[0.06] hover:bg-status-warning/10 px-2 py-1 rounded transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload creatives
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tab === "overview"     && <OverviewTab      data={data} />}
              {tab === "demographics" && <DemographicsTab  rows={demographic} onSegmentClick={onSegmentClick} emptyReason={demoReason} />}
              {tab === "placements"   && <PlacementsTab    rows={placements} emptyReason={placeReason} />}
              {tab === "funnel"       && <FunnelTab        perfRow={perfRow} emptyReason={funnelReason} />}
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
