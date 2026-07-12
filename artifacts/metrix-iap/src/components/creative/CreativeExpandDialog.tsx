// ─── Creative expand dialog ────────────────────────────────────────────
// Full-size split-view dialog: creative visual left, tabbed data panel
// right. Tabs: Overview (stats/copy/tags) · Demographics (age × gender
// bar chart) · Placements (account-level spend/CPA bars).
// Self-contained — intentionally does NOT import runtime code from
// CreativeCard to avoid circular deps; types only via import type.

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Upload, BarChart2, Users, Monitor, ImageOff, ArrowUpRight, ArrowUp, ArrowDown, LayoutGrid } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import type { CreativeCardData } from "./CreativeCard";
import { AdsManagerButton } from "./AdsManagerLink";
import { resolveVariableLabel, getVariablePrefix, PREFIX_COLORS } from "@/lib/variable-registry";

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

function ExpandVisual({ data, className }: { data: CreativeCardData; className?: string }) {
  const [broken, setBroken] = useState(false);
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
      <img
        src={data.assetUrl}
        alt={`Creative ${data.conceptCode}`}
        className={cn("w-full h-full object-cover", className)}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={cn("w-full h-full flex flex-col items-center justify-center gap-2 select-none", className)}
      style={{ background: `linear-gradient(140deg, hsl(${hue} 45% 14%) 0%, hsl(${(hue + 40) % 360} 40% 9%) 100%)` }}
    >
      <span className="text-[40px] font-black tracking-tight leading-none" style={{ color: `hsl(${hue} 70% 72% / 0.85)` }}>
        {data.conceptCode}
      </span>
      <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-white/35">
        <ImageOff className="w-3 h-3" /> No asset in import
      </span>
    </div>
  );
}

function LocalTagChips({ codes }: { codes: string[] }) {
  const flat = useMemo(() => codes.flatMap((c) => c.split(/\s*\+\s*/)).filter(Boolean), [codes]);
  return (
    <div className="flex flex-wrap gap-1">
      {flat.map((c, i) => (
        <span
          key={c + i}
          title={resolveVariableLabel(c)}
          className={cn("text-[8px] font-mono border px-1.5 py-0.5 rounded leading-none", PREFIX_COLORS[getVariablePrefix(c)])}
        >
          {c}
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

type Tab = "overview" | "demographics" | "placements";
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
            "flex items-center gap-1.5 px-3.5 py-2.5 text-[10px] font-medium transition-colors border-b-2 -mb-px",
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
    <div className="flex rounded border border-border/30 overflow-hidden text-[8.5px]">
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
              <div className="text-[18px] font-bold text-foreground tabular-nums leading-none">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {(data.primaryText || data.secondaryText || data.cta) && (
        <div className="space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Copy</p>
          {data.primaryText && <p className="text-[12px] text-foreground/85 leading-relaxed">{data.primaryText}</p>}
          {data.secondaryText && <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{data.secondaryText}</p>}
          {data.cta && (
            <span className="inline-flex text-[10px] font-semibold text-primary border border-primary/25 bg-primary/10 px-2 py-1 rounded">
              CTA · {data.cta}
            </span>
          )}
        </div>
      )}

      {data.iapRead && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">IAP read</p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">{data.iapRead}</p>
        </div>
      )}

      {data.tags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Variable stack</p>
          <LocalTagChips codes={data.tags} />
        </div>
      )}
    </div>
  );
}

// ─── Demographics tab ──────────────────────────────────────────────────

interface AgeBucket {
  age: string;
  male: number; female: number; total: number; grandTotal: number;
  maleResults: number; femaleResults: number;
  maleCpa: number | null; femaleCpa: number | null;
  maleCtr: number | null; femaleCtr: number | null;
  maleReach: number; femaleReach: number;
  maleGender: string | null; femaleGender: string | null;
}

type DemoSortDir = "desc" | "asc";

function DemographicsTab({
  rows,
  onSegmentClick,
  onFullBreakdownClick,
}: {
  rows: DemographicRow[];
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
  /** When provided, shows a "Full audience breakdown" button that opens the segment grid. */
  onFullBreakdownClick?: () => void;
}) {
  const [metric, setMetric] = useState<DemoMetric>("spend");
  const [sortDir, setSortDir] = useState<DemoSortDir>("desc");

  // Build buckets with full KPI fields (HEAD) + grandTotal for share % (base)
  const allBuckets = useMemo<AgeBucket[]>(() => {
    const map = new Map<string, AgeBucket>();
    for (const r of rows) {
      const g = r.Gender.toLowerCase();
      const b = map.get(r.Age) ?? {
        age: r.Age, male: 0, female: 0, total: 0, grandTotal: 0,
        maleResults: 0, femaleResults: 0,
        maleCpa: null, femaleCpa: null,
        maleCtr: null, femaleCtr: null,
        maleReach: 0, femaleReach: 0,
        maleGender: null, femaleGender: null,
      };
      if (g === "male") {
        b.male += r["Amount spent (USD)"];
        b.maleResults += r.Results;
        b.maleCpa = r.CPA_result;
        b.maleCtr = r.CTR_link_pct;
        b.maleReach += r.Reach;
        b.maleGender = r.Gender;
      } else {
        b.female += r["Amount spent (USD)"];
        b.femaleResults += r.Results;
        b.femaleCpa = r.CPA_result;
        b.femaleCtr = r.CTR_link_pct;
        b.femaleReach += r.Reach;
        b.femaleGender = r.Gender;
      }
      b.total += r["Amount spent (USD)"];
      map.set(r.Age, b);
    }
    const arr = Array.from(map.values());
    const gt = arr.reduce((s, bucket) => s + bucket.total, 0);
    arr.forEach((bucket) => { bucket.grandTotal = gt; });
    return arr;
  }, [rows]);

  // Sortable by spend asc/desc (base feature)
  const buckets = useMemo(() => {
    return [...allBuckets].sort((a, b) =>
      sortDir === "desc" ? b.total - a.total : a.total - b.total
    );
  }, [allBuckets, sortDir]);

  // Default-select the bucket with highest spend for the KPI panel (HEAD feature)
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
  const fmt = (n: number) => metric === "spend" ? usd(n) : num(n);

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center space-y-1.5">
        <p className="text-[12px] font-medium text-muted-foreground/60">No demographic data for this cell</p>
        <p className="text-[10px] text-muted-foreground/50">Import a demographic pivot export to see the age × gender breakdown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: label + sort toggle + full-breakdown + metric toggle (base) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Age × gender</p>
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            title={sortDir === "desc" ? "Sorted high → low. Click for low → high." : "Sorted low → high. Click for high → low."}
            className="flex items-center gap-0.5 text-[8px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            {sortDir === "desc" ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onFullBreakdownClick && (
            <button
              onClick={onFullBreakdownClick}
              className="flex items-center gap-1 text-[8.5px] font-medium text-primary/70 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-2 py-1 rounded transition-colors"
            >
              <LayoutGrid className="w-2.5 h-2.5" />
              Full breakdown
            </button>
          )}
          <MetricToggle
            options={[{ value: "spend", label: "Spend" }, { value: "results", label: "Results" }]}
            value={metric}
            onChange={(v) => setMetric(v as DemoMetric)}
          />
        </div>
      </div>

      {/* Bar chart rows — clickable to select for KPI panel (HEAD), with share % (base) */}
      <div className="space-y-3">
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
          const sharePct = b.grandTotal > 0 ? (b.total / b.grandTotal) * 100 : 0;

          return (
            <button
              key={b.age}
              onClick={() => setSelectedAge(b.age)}
              className={cn(
                "w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary group/row",
                isActive
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border/30 bg-white/[0.015] hover:border-border/50 hover:bg-white/[0.03]"
              )}
            >
              {/* Row header: age + share % + total value */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[13px] font-semibold", isActive ? "text-foreground" : "text-foreground/75")}>
                    {b.age}
                  </span>
                  <span className="text-[8.5px] tabular-nums text-muted-foreground/40">{sharePct.toFixed(0)}%</span>
                </div>
                <span className="text-[12px] tabular-nums text-muted-foreground/70 font-medium">
                  {fmt(barVal(b))}
                </span>
              </div>

              {/* Stacked bar */}
              <div className="h-4 rounded-md bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full flex rounded-md overflow-hidden transition-all duration-500"
                  style={{ width: `${barW}%` }}
                >
                  <div
                    className="h-full bg-blue-400/50"
                    style={{ width: `${mBarPct}%` }}
                    title={`Male: ${metric === "spend" ? usd(mSpend) : num(mRes)}`}
                  />
                  <div
                    className="h-full bg-rose-400/50"
                    style={{ width: `${fBarPct}%` }}
                    title={`Female: ${metric === "spend" ? usd(fSpend) : num(fRes)}`}
                  />
                </div>
              </div>

              {/* M/F chips — clickable for segment drill-down (base), with ArrowUpRight on hover */}
              <div className="flex items-center gap-2 mt-1.5 text-[8.5px]">
                {([
                  { key: "male", dot: "bg-blue-400/60", short: "M", value: metric === "spend" ? mSpend : mRes, gender: b.maleGender },
                  { key: "female", dot: "bg-rose-400/60", short: "F", value: metric === "spend" ? fSpend : fRes, gender: b.femaleGender },
                ] as const).map((gd) => {
                  const clickable = !!onSegmentClick && !!gd.gender;
                  return (
                    <span
                      key={gd.key}
                      onClick={clickable ? (e) => { e.stopPropagation(); onSegmentClick!({ age: b.age, gender: gd.gender! }); } : undefined}
                      data-testid={clickable ? `chip-demo-${b.age}-${gd.key}` : undefined}
                      title={clickable ? `Drill into ${gd.key} ${b.age} segment` : undefined}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors",
                        clickable
                          ? "text-muted-foreground/65 hover:bg-white/[0.07] hover:text-foreground cursor-pointer border border-transparent hover:border-border/30"
                          : "text-muted-foreground/40 cursor-default"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", gd.dot)} />
                      {gd.short} {fmt(gd.value)}
                      {clickable && <ArrowUpRight className="w-2 h-2 opacity-0 group-hover/row:opacity-60 transition-opacity" />}
                    </span>
                  );
                })}
                {isActive && (
                  <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-primary/70">
                    Selected ↑
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* KPI panel for selected bucket — click a row above to inspect (HEAD) */}
      {activeBucket && (
        <div className="rounded-xl border border-border/40 bg-white/[0.025] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Segment KPIs</span>
              <span className="ml-2 text-[12px] font-semibold text-foreground">{activeBucket.age}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/30">
            {([
              {
                label: "Male", dot: "bg-blue-400", color: "text-blue-300",
                spend: activeBucket.male, results: activeBucket.maleResults,
                cpa: activeBucket.maleCpa, ctr: activeBucket.maleCtr,
                reach: activeBucket.maleReach, gender: activeBucket.maleGender,
              },
              {
                label: "Female", dot: "bg-rose-400", color: "text-rose-300",
                spend: activeBucket.female, results: activeBucket.femaleResults,
                cpa: activeBucket.femaleCpa, ctr: activeBucket.femaleCtr,
                reach: activeBucket.femaleReach, gender: activeBucket.femaleGender,
              },
            ] as const).map((g) => (
              <div key={g.label} className="p-3 space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", g.dot)} />
                  <span className={cn("text-[11px] font-semibold", g.color)}>{g.label}</span>
                </div>
                <div className="space-y-2">
                  {([
                    { key: "spend", label: "Spend", value: usd(g.spend) },
                    { key: "results", label: "Results", value: num(g.results) },
                    { key: "cpa", label: "CPA", value: g.cpa != null ? usd(g.cpa, 2) : "—" },
                    { key: "ctr", label: "Link CTR", value: g.ctr != null ? pct(g.ctr) : "—" },
                    { key: "reach", label: "Reach", value: num(g.reach) },
                  ] as const).map((kpi) => (
                    <div key={kpi.key} className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/60">{kpi.label}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-foreground/90">{kpi.value}</span>
                    </div>
                  ))}
                </div>
                {onSegmentClick && g.gender && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSegmentClick({ age: activeBucket.age, gender: g.gender! }); }}
                    data-testid={`chip-demo-${activeBucket.age}-${g.label.toLowerCase()}`}
                    className={cn(
                      "w-full text-[10px] font-medium rounded-md border py-1.5 transition-colors",
                      g.label === "Male"
                        ? "border-blue-400/25 text-blue-300/80 hover:bg-blue-400/10"
                        : "border-rose-400/25 text-rose-300/80 hover:bg-rose-400/10"
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

      <p className="text-[8.5px] text-muted-foreground/40 pt-2 border-t border-border/20">
        % share of total {metric === "spend" ? "spend" : "results"} shown next to each age group. Click a row to inspect segment KPIs. Click M / F chips to open drill-down. Blue = male, pink = female.
      </p>
    </div>
  );
}

// ─── Placements tab ────────────────────────────────────────────────────

function PlacementsTab({ rows }: { rows: PlacementRow[] }) {
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
        <p className="text-[12px] font-medium text-muted-foreground/60">No placement data for this account</p>
        <p className="text-[10px] text-muted-foreground/50">Import a device × placement export to see placement signal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Account-level placements</p>
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
              <div className="flex items-center justify-between text-[10px]">
                <div className="min-w-0">
                  <span className="font-medium text-foreground/80">{b.Placement}</span>
                  <span className="ml-1.5 text-[9px] text-muted-foreground/50 capitalize">{b.Platform}</span>
                </div>
                <span className="tabular-nums text-muted-foreground/60 shrink-0 ml-2">
                  {metric === "spend" ? usd(b["Amount spent (USD)"]) : cpa != null ? usd(cpa) : "—"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/50 transition-all duration-700"
                  style={{ width: `${barW}%` }}
                />
              </div>
              <div className="text-[8.5px] text-muted-foreground/45">
                {num(b.Results)} results · {usd(b["Amount spent (USD)"])} spend
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[8.5px] text-muted-foreground/40 pt-2 border-t border-border/20">
        Placement signal is account-level — not scoped to this creative cell.
      </p>
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
  /**
   * When provided, a "Full breakdown" button appears on the Demographics tab
   * that navigates to the full segment grid for this cell. The dialog closes
   * itself before calling this so the grid doesn't stack behind it.
   */
  onFullBreakdownClick?: () => void;
}

export function CreativeExpandDialog({
  open, onOpenChange, data,
  demographic = [], placements = [],
  expandFooter, unmapped, onUploadCreatives, onSegmentClick, onFullBreakdownClick,
}: CreativeExpandDialogProps) {
  const [tab, setTab] = useState<Tab>("overview");

  const handleFullBreakdown = onFullBreakdownClick
    ? () => { onOpenChange(false); onFullBreakdownClick(); }
    : undefined;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",      label: "Overview",      icon: <BarChart2 className="w-3 h-3" /> },
    { id: "demographics",  label: "Demographics",  icon: <Users    className="w-3 h-3" /> },
    { id: "placements",    label: "Placements",    icon: <Monitor  className="w-3 h-3" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl bg-[hsl(222_61%_6%)] border-border/40 p-0 gap-0 overflow-hidden duration-200 max-h-[92vh]"
      >
        <div className="grid grid-rows-[260px_1fr] sm:grid-rows-none sm:grid-cols-[42%_1fr] min-h-0 max-h-[92vh] overflow-hidden">

          {/* ── Left: creative visual ── */}
          <div className="relative overflow-hidden bg-[hsl(222_65%_5%)] sm:border-r border-b sm:border-b-0 border-border/30">
            <ExpandVisual data={data} className="absolute inset-0" />

            {unmapped && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[9px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
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
              <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-0.5">
                Creative · {data.conceptCode}
              </div>
              <p className="text-[14px] font-semibold text-foreground leading-tight">{data.title}</p>
              {data.visualSystem && (
                <p className="text-[11px] text-muted-foreground/55 mt-0.5 leading-relaxed line-clamp-2">{data.visualSystem}</p>
              )}
            </div>

            {/* Tab bar */}
            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {/* Unmapped warning shown in overview */}
              {unmapped && tab === "overview" && (
                <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.05]">
                  <span className="text-amber-400 shrink-0 mt-px text-[13px]">⚠</span>
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-[11px] font-medium text-amber-300/90">Not fully mapped to IAP library</p>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      This cell has performance data but no library entry — variable codes, copy, and asset may be absent.
                    </p>
                    {onUploadCreatives && (
                      <button
                        onClick={() => { onOpenChange(false); onUploadCreatives(); }}
                        className="flex items-center gap-1 text-[10px] font-medium text-amber-300 hover:text-amber-200 border border-amber-400/25 bg-amber-400/[0.06] hover:bg-amber-400/10 px-2 py-1 rounded transition-colors"
                      >
                        <Upload className="w-3 h-3" /> Upload creatives
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tab === "overview"     && <OverviewTab      data={data} />}
              {tab === "demographics" && <DemographicsTab  rows={demographic} onSegmentClick={onSegmentClick} onFullBreakdownClick={handleFullBreakdown} />}
              {tab === "placements"   && <PlacementsTab    rows={placements} />}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-3 border-t border-border/30 flex items-center gap-2 flex-wrap bg-[hsl(222_61%_6%)]">
              <AdsManagerButton metaAdId={data.metaAdId} adAccountId={data.adAccountId} />
              {typeof expandFooter === "function" ? expandFooter(() => onOpenChange(false)) : expandFooter}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
