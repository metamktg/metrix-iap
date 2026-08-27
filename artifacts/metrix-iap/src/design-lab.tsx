// ─── Design Lab ───────────────────────────────────────────────────────
//
// A dev-only page that renders the design system against the REAL
// stylesheet and the REAL tokens, so it can be looked at in a browser.
//
// Why it exists: jsdom applies no CSS and resolves no custom properties.
// That blind spot has now produced three shipped bugs on this codebase —
// the KPI metric picker clipped by `overflow:hidden` (four passing tests),
// the share donut painting two segments the same colour (all ten palette
// strings textually distinct), and "at goal" and "above goal" rendering
// the same green across five files (1833 passing tests). Every one was
// invisible to the test suite by construction.
//
// So: a page a browser can render and a screenshot can catch. It is served
// by `vite dev` at /design-lab.html and is NOT part of the production
// build — vite's default input is index.html alone.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { MetricBarChart } from "@/components/charts/MetricBarChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { MetricTable, type MetricColumn } from "@/components/charts/MetricTable";
import { SharePieChart } from "@/components/charts/SharePieChart";
import { ChartTooltip, ChartEmpty, ChartSkeleton } from "@/components/charts/chartChrome";
import { SERIES_VARS, seriesColor, divergingFill, divergingLegend, magnitudeFill, magnitudeLegend, VERDICT } from "@/components/charts/chartTokens";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const money2 = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString();
const pct = (n: number) => `${n.toFixed(2)}%`;

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/40 bg-white/[0.02] p-4 mb-4">
      <h2 className="text-cardtitle font-bold text-foreground leading-tight">{title}</h2>
      {note && <p className="text-label mt-0.5 mb-3">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────
const BARS = [
  { key: "reels", label: "Instagram Reels", value: 14820, detail: "31 ads · 2.1M impressions" },
  { key: "feed", label: "Facebook Feed", value: 9640 },
  { key: "stories", label: "Instagram Stories", value: 6210 },
  { key: "explore", label: "Instagram Explore", value: 2870 },
  { key: "search", label: "Facebook Search", value: 1140 },
  { key: "audience", label: "Audience Network", value: null },
  { key: "messenger", label: "Messenger Inbox", value: null },
];

const DAYS = Array.from({ length: 28 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`);
const wave = (base: number, amp: number, phase: number) =>
  DAYS.map((_, i) => (i === 12 || i === 13 ? null : Math.round((base + Math.sin((i + phase) / 3.1) * amp) * 100) / 100));

interface TRow { id: string; name: string; concept: string; spend: number | null; cpa: number | null; ctr: number | null; results: number | null }
const TABLE: TRow[] = [
  { id: "1", name: "AAFE_HK_Proof_v3", concept: "Proof-led", spend: 4820, cpa: 12.44, ctr: 1.82, results: 387 },
  { id: "2", name: "AAFE_HK_Fear_v1", concept: "Loss-framed", spend: 3110, cpa: 28.90, ctr: 0.94, results: 107 },
  { id: "3", name: "AAFE_TN_Warm_v2", concept: "Peer story", spend: 2740, cpa: null, ctr: 2.31, results: null },
  { id: "4", name: "AAFE_FW_Direct_v4", concept: "Direct offer", spend: 1980, cpa: 8.12, ctr: 3.04, results: 243 },
  { id: "5", name: "AAFE_ST_Founder_v1", concept: "Founder POV", spend: 1220, cpa: 41.03, ctr: 0.71, results: 29 },
  { id: "6", name: "AAFE_CN_Compare_v2", concept: "Comparison", spend: 0, cpa: null, ctr: null, results: 0 },
];
const COLS: MetricColumn<TRow>[] = [
  { key: "spend", label: "Spend", value: (r) => r.spend, format: money, locked: true },
  { key: "results", label: "Results", value: (r) => r.results, format: count },
  { key: "cpa", label: "Cost/result", value: (r) => r.cpa, format: money2, defaultDirection: "asc", hint: "Spend divided by results" },
  { key: "ctr", label: "Link CTR", value: (r) => r.ctr, format: pct, optional: true },
];

const TYPE_LADDER: [string, string, string][] = [
  ["mx-section-header__title", "32px", "H1 · page title"],
  ["text-cardtitle", "21px", "H2 · section card title"],
  ["text-title", "17px", "H3 · card / list title"],
  ["text-body", "14px", "Body — the floor. Every sentence lands here or above."],
  ["text-caption", "12px", "Caption · non-sentence metadata"],
  ["text-label", "11px", "LABEL · eyebrow"],
  ["text-micro", "10px", "MICRO · index"],
];

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="mx-section-header__title">Design Lab</h1>
        <p className="mx-section-header__sub mb-6">
          The real stylesheet, the real tokens, fixture data · everything jsdom cannot see
        </p>

        <Panel title="Type scale" note="Each role must outrank the one below it by at least 3px · body floor is 14px">
          <div className="flex flex-col gap-2">
            {TYPE_LADDER.map(([cls, px, desc]) => (
              <div key={cls} className="flex items-baseline gap-4 border-b border-border/25 pb-2">
                <span className="text-micro font-mono text-muted-foreground/60 w-14 shrink-0 tabular-nums">{px}</span>
                <span className={cls}>{desc}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Categorical scale" note="Five slots · fixed order · never cycled · the 6th is neutral, not slot 1 again">
          <div className="flex flex-wrap gap-3">
            {SERIES_VARS.map((v, i) => (
              <div key={v} className="flex flex-col gap-1.5">
                <div className="w-28 h-14 rounded-lg" style={{ background: seriesColor(i) }} />
                <span className="text-label">chart-{i + 1}</span>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <div className="w-28 h-14 rounded-lg" style={{ background: seriesColor(5) }} />
              <span className="text-label">6th → neutral</span>
            </div>
          </div>
        </Panel>

        <Panel title="Diverging scale — verdicts" note="Fills from ramp steps 700–900 · neutral midpoint · legend derived from the same function">
          <div className="flex flex-wrap gap-2 items-end mb-3">
            {[0, 0.15, 0.3, 0.45, 0.5, 0.55, 0.7, 0.85, 1].map((t) => (
              <div key={t} className="flex flex-col gap-1.5">
                <div className="w-16 h-12 rounded-md grid place-items-center" style={{ background: divergingFill(t) }}>
                  <span className="text-caption text-foreground tabular-nums">$12.44</span>
                </div>
                <span className="text-micro font-mono text-muted-foreground/60 tabular-nums">{t.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <div className="w-16 h-12 rounded-md grid place-items-center" style={{ background: divergingFill(null) }}>
                <span className="text-caption text-muted-foreground/60">—</span>
              </div>
              <span className="text-micro font-mono text-muted-foreground/60">n/a</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-label">Legend</span>
            {divergingLegend().map((l, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="w-4 h-3 rounded-sm" style={{ background: l.fill }} />
                {l.label && <span className="text-caption text-muted-foreground">{l.label}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            {(Object.entries(VERDICT) as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: v }} />
                <span className="text-caption text-muted-foreground">chip · {k}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="v3 tonal ramps" note="Six roles, one shared perceptual lightness scale · 100 lightest → 900 darkest">
          {["blue", "cyan", "neutral", "success", "danger", "warning"].map((role) => (
            <div key={role} className="flex items-center gap-1 mb-1">
              <span className="text-micro font-mono text-muted-foreground/60 w-16 shrink-0">{role}</span>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => (
                <div key={step} className="flex-1 h-9 rounded-md grid place-items-center"
                     style={{ background: `var(--mx-${role}-${step})` }}>
                  <span className="text-micro font-mono tabular-nums"
                        style={{ color: step <= 400 ? "var(--mx-neutral-900)" : "var(--mx-neutral-100)" }}>{step}</span>
                </div>
              ))}
            </div>
          ))}
        </Panel>

        <Panel title="Sequential scale — magnitude" note="One role's ramp, darkest for the smallest · magnitude has no good end">
          <div className="flex flex-wrap gap-2 items-end">
            {[0.05, 0.2, 0.45, 0.6, 0.8, 0.95].map((t) => (
              <div key={t} className="flex flex-col gap-1.5">
                <div className="w-16 h-12 rounded-md border border-border/25 grid place-items-center" style={{ background: magnitudeFill(t, 0) }}>
                  <span className="text-caption text-foreground tabular-nums">$4,820</span>
                </div>
                <span className="text-micro font-mono text-muted-foreground/60 tabular-nums">{t.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 ml-4">
              <span className="text-label mr-1">Legend</span>
              {magnitudeLegend().map((f, i) => (
                <span key={i} className="w-4 h-3 rounded-sm border border-border/25" style={{ background: f }} />
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Bar chart" note="Ranked · one axis · unmeasured excluded and counted, never a zero-length bar">
          <MetricBarChart data={BARS} format={money} measureLabel="Spend" height={240} />
        </Panel>

        <div className="grid grid-cols-2 gap-4">
          <Panel title="Trend — one series" note="Days 13–14 have no rows: the line breaks">
            <TrendChart
              days={DAYS}
              missingDays={["2026-07-13", "2026-07-14"]}
              series={[{ key: "spend", label: "Spend", values: wave(620, 210, 0), format: money }]}
              height={200}
            />
          </Panel>
          <Panel title="Trend — two series, indexed" note="Different units on ONE axis · no second y-scale">
            <TrendChart
              days={DAYS}
              normalize="index"
              missingDays={["2026-07-13", "2026-07-14"]}
              series={[
                { key: "spend", label: "Spend", values: wave(620, 210, 0), format: money },
                { key: "ctr", label: "Link CTR", values: wave(1.8, 0.7, 4), format: pct },
              ]}
              height={200}
            />
          </Panel>
        </div>

        <Panel title="Table" note="Sortable · filterable · column picker · nulls are dashes and sort LAST">
          <MetricTable
            rows={TABLE}
            rowKey={(r) => r.id}
            label={(r) => r.name}
            sublabel={(r) => r.concept}
            columns={COLS}
            filterPlaceholder="Filter creatives…"
          />
        </Panel>

        <div className="grid grid-cols-3 gap-4">
          <Panel title="Donut">
            <SharePieChart
              data={BARS.filter((b) => b.value != null).map((b) => ({ name: b.label, value: b.value! }))}
              unit="usd"
              height={200}
            />
          </Panel>
          <Panel title="Tooltip">
            <ChartTooltip
              title="Instagram Reels"
              rows={[
                { label: "Spend", value: "$14,820", swatch: seriesColor(0) },
                { label: "Cost/result", value: "$12.44", swatch: seriesColor(1) },
                { label: "Link CTR", value: "—", swatch: seriesColor(2) },
              ]}
              detail="31 ads · 2.1M impressions"
            />
          </Panel>
          <Panel title="Empty / loading">
            <ChartEmpty height={110} label="No data yet" />
            <ChartSkeleton height={90} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
