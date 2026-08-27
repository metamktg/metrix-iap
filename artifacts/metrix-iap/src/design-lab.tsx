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
import { FunnelChart } from "@/components/charts/FunnelChart";
import { HeatMatrix } from "@/components/charts/HeatMatrix";
import { ViewSwitcher } from "@/components/data-module/ViewSwitcher";
import { SignalDeck } from "@/components/signals/SignalDeck";
import type { SignalCard } from "@/lib/data/seedTypes";
import { ChartTooltip, ChartEmpty, ChartSkeleton } from "@/components/charts/chartChrome";
import { TabRail } from "@/components/nav/TabRail";
import { SectionCard, MetricTile, PendingState, SkeletonTileRow } from "@/pages/metrix/shared";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { GoalProgressCard } from "@/components/metrics/GoalProgressCard";
import { VariableStack } from "@/components/charts/VariableStack";
import { BreakdownControl } from "@/components/data-module/BreakdownControl";
import { Popover, PopoverTrigger, PopoverContent } from "@workspace/command-deck/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { SERIES_VARS, seriesColor, divergingFill, divergingLegend, magnitudeFill, magnitudeLegend, VERDICT } from "@/components/charts/chartTokens";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const money2 = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString();
const pct = (n: number) => `${n.toFixed(2)}%`;

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/40 bg-foreground/[0.02] p-4 mb-4">
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
  ["text-bignum font-h1 font-bold leading-none", "32 · Space Grotesk 700", "H1 — route title"],
  ["text-h2 font-h2 font-bold leading-tight", "27 · Space Grotesk 700", "H2 — section title"],
  ["text-h3 font-h3 font-semibold leading-snug", "23 · Outfit 600", "H3 — card title"],
  ["text-h4 font-h4 font-bold leading-snug", "20 · Lato 700", "H4 — group header"],
  ["text-h5 font-h5 font-semibold leading-snug", "17 · Rubik 600", "H5 — sub-group"],
  ["text-body font-body", "14 · Figtree 400", "Body — the floor. Every sentence lands here or above."],
  ["text-caption font-body", "12 · Figtree", "Caption — non-sentence metadata"],
  ["text-label font-h6 font-bold uppercase", "11 · Rubik 700", "H6 / label — eyebrow"],
  ["text-micro font-mono uppercase", "10 · mono", "Micro — index"],
];

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="mx-section-header__title">Design Lab</h1>
        <p className="mx-section-header__sub mb-6">
          The real stylesheet, the real tokens, fixture data · everything jsdom cannot see
        </p>

        <Panel title="Type scale" note="Five heading levels, each on its own face · every step ≥3px · body floor 14px">
          <div className="flex flex-col gap-2">
            {TYPE_LADDER.map(([cls, px, desc]) => (
              <div key={cls} className="flex items-baseline gap-4 border-b border-border/25 pb-2">
                <span className="text-micro font-mono text-muted-foreground/75 w-28 shrink-0 tabular-nums">{px}</span>
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
                <span className="text-micro font-mono text-muted-foreground/75 tabular-nums">{t.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <div className="w-16 h-12 rounded-md grid place-items-center" style={{ background: divergingFill(null) }}>
                <span className="text-caption text-muted-foreground/75">—</span>
              </div>
              <span className="text-micro font-mono text-muted-foreground/75">n/a</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
              <span className="text-micro font-mono text-muted-foreground/75 w-16 shrink-0">{role}</span>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => (
                <div key={step} className="flex-1 min-w-0">
                  <div className="h-9 rounded-md" style={{ background: `var(--mx-${role}-${step})` }} />
                  <div className="text-micro font-mono tabular-nums text-muted-foreground text-center mt-1">{step}</div>
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
                <span className="text-micro font-mono text-muted-foreground/75 tabular-nums">{t.toFixed(2)}</span>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <Panel title="Signal deck" note="Priority is the only thing colour encodes · a delta is shown with its sign but never judged · nothing is derived from prose">
          <SignalDeck
            actionLabel="Detail"
            onOpen={() => {}}
            cards={[
              {
                id: "1", account_id: "a", scope: "creative", impact: "high", confidence: "high",
                title: "Testimonial hook", headline: "Testimonial problem-hook is the cheapest route to a result",
                metric_value: "$18.40", metric_context: "vs $23.10 account mean", delta_pct: -20.3,
                priority: "critical", confidence_level: "high", evidence_ref: "cell/AAFE_HK_v3",
                implication: "Three of the four lowest-cost cells this window share the testimonial problem-hook opening. The pattern holds across both avatars it ran against, which is what separates it from a single-cell fluke.",
                rationale: "", recommended_action: "Brief two more variants on this opening before the next sprint closes.",
                action: "Brief two more variants on this opening before the next sprint closes.",
              },
              {
                id: "2", account_id: "a", scope: "audience", impact: "medium", confidence: "medium",
                title: "Frequency", headline: "Frequency is climbing on the 45–54 pocket",
                priority: "important", confidence_level: "medium", needs_validation: true,
                implication: "Delivery to this segment has narrowed while spend held, so the same people are seeing more. No CTR decay yet — this is early enough to act on rather than a diagnosis of fatigue.",
                rationale: "", recommended_action: "Widen the exclusion window or add a second creative to the set.",
              },
              {
                id: "3", account_id: "a", scope: "placement", impact: "low", confidence: "low",
                title: "Audience Network delivered no measurable results this window",
                rationale: "Spend registered but no result events were attributed. Whether that is a tracking gap or genuine non-performance cannot be told from this export alone.",
                recommended_action: "Check the pixel on the destination before drawing a conclusion.",
                evidence_ref: "placement/audience_network",
              },
            ] as SignalCard[]}
          />
        </Panel>

        <Panel title="View switcher" note="Every view always present · unsupported ones disabled WITH the reason, never hidden">
          <div className="flex flex-col gap-3">
            {(["performance_by_cell", "conversion_tracking_signal", "historical_matrix_4x4"] as const).map((shape) => (
              <div key={shape} className="flex items-center gap-3 flex-wrap">
                <span className="text-micro font-mono text-muted-foreground/75 w-56 shrink-0">{shape}</span>
                <ViewSwitcher shape={shape} value="table" onChange={() => {}} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Funnel" note="Proportional bars on a common baseline · a stage the export never carried is a hatched GAP, not a zero">
          <FunnelChart
            stages={[
              { key: "impr", label: "Impressions", value: 2_140_882 },
              { key: "clicks", label: "Clicks (all)", value: 41_204 },
              { key: "link", label: "Link clicks", value: 28_917 },
              { key: "atc", label: "Adds to cart", value: 3_940 },
              { key: "checkout", label: "Checkouts", value: null },
              { key: "purchase", label: "Purchases", value: 1_207 },
            ]}
            unitLabel="conversion-attributed actions"
          />
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Map — verdict scale" note="CPA against a $20 goal · lower is better · diverging">
            <HeatMatrix
              rows={["18–24", "25–34", "35–44", "45–54", "55+"]}
              cols={["Female", "Male", "Unknown"]}
              rowHeaderLabel="Age"
              scale="verdict"
              lowerIsBetter
              goal={20}
              measureLabel="Cost per result"
              format={money2}
              onSelect={() => {}}
              cells={[
                { row: "18–24", col: "Female", value: 31.2 }, { row: "18–24", col: "Male", value: 44.9 }, { row: "18–24", col: "Unknown", value: null },
                { row: "25–34", col: "Female", value: 12.4 }, { row: "25–34", col: "Male", value: 19.8 }, { row: "25–34", col: "Unknown", value: 26.0 },
                { row: "35–44", col: "Female", value: 9.1 },  { row: "35–44", col: "Male", value: 15.2 }, { row: "35–44", col: "Unknown", value: null },
                { row: "45–54", col: "Female", value: 20.4 }, { row: "45–54", col: "Male", value: 21.1 }, { row: "45–54", col: "Unknown", value: null },
                { row: "55+",   col: "Female", value: 38.7 }, { row: "55+",   col: "Male", value: null }, { row: "55+",   col: "Unknown", value: null },
              ]}
            />
          </Panel>
          <Panel title="Map — magnitude scale" note="Spend across the MST 4×4 · more is simply more · one hue">
            <HeatMatrix
              rows={["Hook A", "Hook B", "Hook C", "Hook D"]}
              cols={["Avatar 1", "Avatar 2", "Avatar 3", "Avatar 4"]}
              rowHeaderLabel="Concept"
              scale="magnitude"
              measureLabel="Spend"
              format={money}
              onSelect={() => {}}
              cells={[
                { row: "Hook A", col: "Avatar 1", value: 4820, sub: "C1·A1" }, { row: "Hook A", col: "Avatar 2", value: 1210, sub: "C1·A2" }, { row: "Hook A", col: "Avatar 3", value: 310, sub: "C1·A3" }, { row: "Hook A", col: "Avatar 4", value: null },
                { row: "Hook B", col: "Avatar 1", value: 2940, sub: "C2·A1" }, { row: "Hook B", col: "Avatar 2", value: 3810, sub: "C2·A2" }, { row: "Hook B", col: "Avatar 3", value: null },              { row: "Hook B", col: "Avatar 4", value: 640, sub: "C2·A4" },
                { row: "Hook C", col: "Avatar 1", value: 880, sub: "C3·A1" },  { row: "Hook C", col: "Avatar 2", value: null },              { row: "Hook C", col: "Avatar 3", value: 5120, sub: "C3·A3" }, { row: "Hook C", col: "Avatar 4", value: 1490, sub: "C3·A4" },
                { row: "Hook D", col: "Avatar 1", value: null },               { row: "Hook D", col: "Avatar 2", value: 720, sub: "C4·A2" },  { row: "Hook D", col: "Avatar 3", value: 2260, sub: "C4·A3" }, { row: "Hook D", col: "Avatar 4", value: 3370, sub: "C4·A4" },
              ]}
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

        {/* The Radix overlay primitives, rendered OPEN. Their chrome comes
            from the design system package, and nothing else in this lab
            exercises it — a popover that lost its shadow or a tooltip that
            went back to bg-primary would otherwise only be visible by
            hovering the real app. */}
        {/* The chrome every one of the ten IA sections composes from.
            SectionCard is on 37 files, ModuleHeader 54, PendingState 41,
            MetricTile 23 — so a defect here is a defect everywhere, and
            nothing else in this lab exercised them. */}
        <Panel title="Section card" note="the disclosure strip IS the control · 40px · keyboard-reachable">
          <div className="space-y-3">
            <SectionCard title="Audience heatmap" desc="Age × gender · CPA against goal">
              <p className="text-body font-body text-muted-foreground">Body content.</p>
            </SectionCard>
            <SectionCard title="Pinned open" collapsible={false}>
              <p className="text-body font-body text-muted-foreground">No disclosure control on this one.</p>
            </SectionCard>
          </div>
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <Panel title="Metric tiles" note="the affordance is visible at rest, not only on hover">
            <div className="grid grid-cols-dashboard-2 gap-2">
              <MetricTile label="Amount spent" value="$14,820" sub="across 31 ads" variant="primary" />
              <MetricTile label="Cost per result" value="$18.40" sub="vs $23.10 mean" onClick={() => {}} />
            </div>
            <div className="mt-3">
              <SkeletonTileRow count={4} />
            </div>
          </Panel>
          <Panel title="Pending state" note="the message is content, not a tooltip">
            <PendingState
              title="No analysis yet"
              message="Analysis appears once performance data is connected or imported. Upload two Meta pivot exports, then pick a date range and run it."
            />
          </Panel>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Popover — open" note="design-system chrome · elevation-floating · rounded-xl">
            <Popover defaultOpen>
              <PopoverTrigger asChild>
                <button type="button" className="text-body text-interactive">Trigger</button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8}>
                <p className="text-body text-foreground">
                  The popover surface: popover token at 95%, a border at 60%, and the
                  inset ring plus soft shadow that every floating surface here wears.
                </p>
              </PopoverContent>
            </Popover>
          </Panel>
          <Panel title="Tooltip — open" note="was bg-primary, which read as an action surface">
            <TooltipProvider>
              <Tooltip open>
                <TooltipTrigger asChild>
                  <button type="button" className="text-body text-interactive">Hover target</button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  Cost per result, blended across every ad in the window.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Panel>
        </div>

        <Panel title="Tab rail" note="tablist · arrow keys · 40px hit area · scrolls rather than pushing the page">
          <TabRail
            tabs={[
              { id: "pending", label: "Pending", count: 4 },
              { id: "tray", label: "In Tray", count: 0 },
              { id: "dismissed", label: "Dismissed", count: 12 },
              { id: "compare", label: "Compare", disabledReason: "Needs two completed runs to compare." },
            ]}
            active="pending"
            onChange={() => {}}
            label="Queue status"
          />
        </Panel>

        <Panel title="Goal progress" note="no goal, no bar — and an overrun is reported, not clipped">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <GoalProgressCard label="Cost per result" value={18.4} goal={25} format={money2} lowerIsBetter
                              goalSource="median of this window" deltaPct={-8.2} />
            <GoalProgressCard label="Cost per result" value={60} goal={25} format={money2} lowerIsBetter
                              goalSource="median of this window" deltaPct={41} />
            <GoalProgressCard label="Results" value={318} goal={500} format={count} deltaPct={4.1} />
            <GoalProgressCard label="Link CTR" value={1.94} goal={null} format={pct} />
          </div>
          <div className="mt-3 space-y-2 max-w-md">
            <ProgressMeter value={30} total={120} label="Matrix coverage" size="md" />
            <ProgressMeter value={5} total={0} label="Result share" size="md" />
            <ProgressMeter value={2} total={3} segments={3} label="Confidence — Medium" size="md" />
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Panel title="Variable stack" note="one slot per family · reads are marginal, never attributed">
            <VariableStack
              stack={{ hk: "HK_ProofFirst", tn: "TN_Direct", fw: "FW_PAS", cta: "CTA_StartFree" }}
              registry={[
                { prefix: "HK", family: "Hook", status: "active", note: null },
                { prefix: "TN", family: "Tone", status: "active", note: null },
                { prefix: "FW", family: "Framework", status: "active", note: null },
                { prefix: "CN", family: "Concept", status: "active", note: null },
                { prefix: "HP", family: "Pain proof", status: "active", note: null },
                { prefix: "PR", family: "Proof type", status: "active", note: null },
                { prefix: "AW", family: "Awareness level", status: "registry_missing",
                  note: "Confirmed known gap: no AW_ registry definition exists in the client library." },
                { prefix: "CTA", family: "Call to action", status: "registry_missing",
                  note: "Confirmed known gap: CTA_ codes appear in creative stacks but no CTA_ registry definition is backed by the client library." },
                { prefix: "ST", family: "Structure", status: "registry_missing",
                  note: "Confirmed known gap: no ST_ registry definition exists in the client library." },
              ]}
              marginal={new Map([
                ["HK_ProofFirst", { label: "CPA", value: "$18.40" }],
                ["TN_Direct", { label: "CPA", value: "$22.10" }],
                ["FW_PAS", { label: "CPA", value: "—" }],
              ])}
              marginalLabel="CPA"
              onSelect={() => {}}
            />
          </Panel>
          <Panel title="Breakdown control" note="a single-valued dimension stays visible, disabled, with its count">
            <BreakdownControl
              shape="demographic_registration_signal"
              rows={[
                { Age: "25-34", Gender: "male", cell_id: "AAFE_HK_v3" },
                { Age: "35-44", Gender: "female", cell_id: "AAFE_HK_v3" },
                { Age: "45-54", Gender: null, cell_id: "AAFE_HK_v3" },
              ]}
              value="Age"
              onChange={() => {}}
            />
          </Panel>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
