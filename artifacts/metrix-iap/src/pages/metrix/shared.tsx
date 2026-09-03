// ─── Shared building blocks for seed-hydrated Metrix pages ────────────
//
// Verbosity rulebook — platform-wide content consolidation:
//
// ★ CHROME vs PAYLOAD — read this before applying any rule below. ★
//   CHROME is the furniture that helps a reader navigate: tile captions,
//   table cells, chips, breadcrumbs, card faces, eyebrows, provenance
//   ("where did this number come from"). Chrome is terse. Truncate it,
//   clamp it, put its detail behind a reveal.
//   PAYLOAD is the thing the customer is paying for: a message pillar, a
//   hypothesis and what it isolates, an ICP's psychographic read, a
//   strategic recommendation, a stated risk, "why it matters", a budget
//   reallocation instruction, brief direction. Payload is LEGIBLE. It
//   stays on the page, in full, with no interaction required to read it.
//   Clamp it with <DenseText> if length demands — that keeps the words
//   present and expandable in place, and shows no control at all when the
//   text already fits.
//   The rules below are about chrome. Applying them to payload hides the
//   product, which is exactly what happened to the Strategy pages: a
//   message pillar was cut to 72 characters and a stated risk was
//   deriveLabel'd to 90 chars INSIDE a one-line clamp. Enforced by
//   scripts/check-payload-legibility.ts.
//
// • FIRST-LAYER RULE (chrome): no full sentences on the primary dashboard
//   layer. Cards/lists show concise, high-impact labels only; sentence
//   prose moves behind <DetailReveal> — a click/tap/keyboard popover with
//   an always-visible info affordance. Derive labels mechanically with
//   deriveLabel() (first clause, word-boundary cut) — never invent copy.
// • Inside <button> cards whose full text lives in a drawer/modal: clamp with
//   CSS `line-clamp-N` (nested buttons are invalid HTML, so no DetailReveal,
//   DenseText or roll-downs there) and let the drawer carry the prose. Clamp
//   ONCE — a deriveLabel() inside a line-clamp cuts the same text twice.
// • Second-layer surfaces (drawers, modals, expanded detail sections) keep
//   full prose; use <DenseText> there if clamping is still needed —
//   <ExpandableText>/<ClampedProse> are legacy aliases over it.
// • Data caveats / honesty disclaimers: <CaveatNote> (collapsible amber pill,
//   optional `source` badge).
// • Metric definitions and methodology asides: <InfoTooltip>.
// • Drawers (InfoDrawer/DrawerField) and modals may show full-length prose.
//
// Typography roles — import { TYPE } from "./typography":
// • TYPE.microLabel 11px uppercase micro index/eyebrow labels (below
//   TYPE.label — e.g. "Spend"/"Results" strip labels, run-scope captions)
// • TYPE.label   12px uppercase eyebrow/section labels
// • TYPE.caption 13px secondary/meta prose — THE READING FLOOR
// • TYPE.body    15px primary prose in cards/tiles; every sentence lands
//   here or above
// • TYPE.title   18px BOLD card/list titles — bold is the one enforced
//   title weight platform-wide (matches SectionCard's own <h3>)
//   (These were 9/10/11/12/14px before the ramp lift; the constants are
//   presets over the .text-* role classes declared in index.css, which are
//   equally canonical — chrome spells it that way.)
// Standard tile anatomy: eyebrow label → title → clamped body → chip rows →
// footer/meta. No half-pixel sizes (10.5/11.5/12.5px) in card bodies, and no
// raw text-[Npx] classes — every size composes from TYPE (enforced by
// scripts/check-disclosure-rulebook.ts).
//
// Header ownership: a page composing tab-switched sub-views (e.g. a command
// center that toggles between two child views) owns the single <ModuleHeader>
// itself; sub-views mounted this way must not render their own — accept and
// honor a `renderHeader={false}` prop instead, so a route never shows two
// stacked headings for the same title.
//
// Normalization rulebook — import from "@/lib/normalize" (pure, tested):
// • TITLES: compound "Main — Qualifier" analysis/pillar titles split with
//   splitTitle() at the FIRST " — "; card face shows main (line-clamp-1) +
//   qualifier caption; full compound stays in title attr / popover eyebrow.
// • HIERARCHY REFS: free-text refs into the Book → Concept → Row hierarchy
//   ("BOOK0 Concept C2 (esp. Row B)") parse with parseHierarchyRef() and
//   render as compact mono chips ("B0 · C2 · Row B") via <NormalizedRefItem>
//   (strategyShared.tsx); annotation + raw string move behind DetailReveal.
//   Unparseable strings fall back to deriveLabel — never dropped.
// • METRICS: fmtMetric(kind, n) is the single precision table — usd_unit
//   (CPA/CPC: 2dp < $1,000, 0dp above), usd_total (spend: 0dp), pct (2dp
//   < 10%, 1dp above, "0%" for zero), count (separators; fmtCount compact
//   opt-in). No per-call-site digit choices.
// • CONFIDENCE: normalizeConfidence() extracts level + qualifier + polarity;
//   <ConfidenceBadge> colors by POLARITY first — "high (of failure)" renders
//   red, never emerald. Unknown levels pass through as their raw label.
// • CHIP ROWS: cap at 4 visible chips (maxVisible), overflow collapses into
//   a "+N" popover chip (ChipOverflow in strategyShared.tsx). Inside a
//   DetailReveal label or a <button> card the overflow is a plain "+N" text
//   span instead — no nested popovers/buttons.
// • CHIP FACES: variable chips show the resolved label only — family eyebrow
//   and raw code live in the title attr. ICP chips show compactIcpName()
//   (trailing parentheticals / " - …" qualifiers stripped); full name + id
//   stay in the title attr.
// • HYPOTHESES: sentences are import/LLM prose with no stable grammar —
//   NEVER parsed into actions. First layer shows the variable codes the
//   sentence mentions (extractVariableCodes → chips) via <HypothesisLabel>
//   (strategyShared.tsx); full sentence + isolates stay behind DetailReveal.
//   Codeless sentences fall back to deriveLabel. Inside <button> queue cards:
//   <HypothesisCodeChipsRow> + a line-clamp-1 caption, drawer keeps prose.

import { usePanelSize } from "@/lib/panel-prefs";
import { useState, useCallback, useId, useRef, useLayoutEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import { TabRail } from "@/components/nav/TabRail";
import { cn } from "@workspace/command-deck/lib/utils";
import { useLocation, useSearch } from "wouter";
import { ConnectMetaDialog, ManualImportDialog } from "./ConnectAccountDialogs";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { useListManualImports } from "@workspace/api-client-react";
import { navTree, visibleChildren, LOOP_STAGES } from "@/navigation/navTree";
import { fromOriginTarget } from "@/navigation/navHistory";
import { Plug, FileUp, Clock, Info, ArrowRight, ArrowLeftRight, CheckCircle2, CalendarRange, Maximize2, Minimize2, CalendarX2, AlertTriangle, ChevronDown, ChevronLeft, Sparkles, Map as MapIcon, Lock, Venus, Mars, AlignLeft, Download } from "lucide-react";
import { useDateRange, formatIsoRange } from "@/contexts/DateRangeContext";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/command-deck/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import { resolveVariableLabel } from "@/lib/variable-registry";
import { normalizeConfidence } from "@/lib/normalize";
import { TYPE, HEADING } from "./typography";
// NOTE: seedTypes exports `LoopStageStatus` (a per-stage record read from
// the seed) and this file exports its own `LoopStageStatus` further down (a
// "locked"|"none"|"running"|"success"|"error" run-state union for the loop
// chain). Same name, two unrelated concepts. Importing it unaliased broke
// seven files, so the seed record comes in as SeedLoopStage here.
import type { AdAccount, LoopStageStatus as SeedLoopStage } from "@/lib/data/seedTypes";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { RevealPanel } from "@/components/widgets/LayeredDisclosure";

// ─── Section info icon ────────────────────────────────────────────────
// Small ⓘ icon with a hover tooltip — used in SectionCard right slots
// and on Core controls card eyebrows to explain section/card purpose.

export function SectionInfoIcon({ tip }: { tip: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label="Section info"
            className="inline-flex items-center justify-center shrink-0 h-6 w-6 -m-[6px] cursor-default text-muted-foreground/75 hover:text-muted-foreground/75 transition-colors"
          >
            <Info className="w-3 h-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-left leading-relaxed text-caption whitespace-normal">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Info tooltip ──────────────────────────────────────────────────────

export function InfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More info"
            // 24×24 hit area around a 14px glyph (WCAG 2.2 AA target size);
            // the negative margin keeps the glyph's layout footprint.
            className="inline-flex items-center justify-center shrink-0 h-6 w-6 -m-[5px] text-muted-foreground/75 hover:text-muted-foreground/80 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        {/* Width was capped, height was not. A tooltip given a long body grew
            until it blanketed the card behind it — the disclosure rulebook puts
            full prose behind DetailReveal (a click popover, already capped at
            60vh) precisely so a hover surface never has to carry it. */}
        <TooltipContent className="max-w-[280px] max-h-[min(40vh,320px)] overflow-y-auto text-left leading-relaxed text-caption whitespace-normal">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Resolve a raw variable code — including compound "A + B" stacks — to labels. */
export function readableVariables(code: string | null | undefined): string {
  if (!code) return "–";
  return code
    .split(/\s*\+\s*/)
    .map((c) => resolveVariableLabel(c.trim()))
    .join(" + ");
}

// ─── Formatting ───────────────────────────────────────────────────────

export function fmtUSD(n: number | null | undefined, digits = 2): string {
  if (n == null) return "–";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "–";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null) return "–";
  return `${n.toFixed(digits)}%`;
}

/** Human-readable label for a Meta result event key. */
export const EVENT_LABEL: Record<string, string> = {
  "Website registrations completed": "Registrations",
  "Website trials started": "Trials",
  "Website purchases": "Purchases",
  onb_initiate_checkout: "Checkouts",
  // NOT an event. The analysis engine writes "unknown" when an export row
  // carries no result_type at all — its own comment calls this "a real
  // data-quality gap, not a normal value", and it counts the rows. Listed
  // raw, it sat in the results table as a lowercase peer of Purchases and
  // Leads, which reads as an event nobody bothered to name; on the largest
  // account in the seed it holds 41% of spend. It must stay visible —
  // hiding it would hide that spend — so it is named for what it is.
  unknown: "Unclassified result type",
};

export function eventLabel(key: string): string {
  if (!key) return key;
  const mapped = EVENT_LABEL[key];
  if (mapped) return mapped;
  // Result types come from client exports and custom `onb_*` events, so an
  // unmapped snake_case key is ordinary rather than exceptional. Rendering it
  // raw is the same defect as the "raw_token variables" one: the value is
  // right, the wording leaks an identifier. The namespace prefix is dropped
  // the way the mapped `onb_` siblings already drop it.
  if (!key.includes("_")) return key;
  const parts = key.split("_").filter(Boolean);
  const words = parts.length > 2 && /^[a-z]+$/.test(parts[0]!) ? parts.slice(1) : parts;
  const text = words.join(" ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

// ─── Delivery dimension terminology ───────────────────────────────────
// Meta reports platform and device as lowercase snake_case tokens
// (audience_network, android_smartphone). Three surfaces leaned on CSS
// `capitalize`, which turns audience_network into "Audience_network", and the
// KPI drill-down's platform and device breakdowns rendered the token verbatim
// — the same class as the "raw_token variables" leak. PlacementsView had
// grown its own private deviceLabel, so the app disagreed with itself about
// what a device is called. One map, used everywhere.

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  threads: "Threads",
  audience_network: "Audience Network",
  unknown: "Unknown",
};

const DEVICE_LABEL: Record<string, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  ipod: "iPod",
  android_smartphone: "Android smartphone",
  android_tablet: "Android tablet",
  desktop: "Desktop",
  other: "Other",
  unknown: "Unknown",
};

/** Sentence-case a snake_case token: android_tablet → "Android tablet". */
function humanizeToken(token: string): string {
  const text = token.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : token;
}

export function platformLabel(key: string): string {
  if (!key) return key;
  return PLATFORM_LABEL[key.toLowerCase()] ?? humanizeToken(key);
}

export function deviceLabel(key: string): string {
  if (!key) return key;
  return DEVICE_LABEL[key.toLowerCase()] ?? humanizeToken(key);
}

// ─── Account result terminology ───────────────────────────────────────
// Each account converts on a different result event (registrations,
// purchases, trials, …). UI copy derives the noun from the account's own
// data instead of hardcoding any one client's result type.

export interface ResultTerm {
  /** e.g. "registration" */ singular: string;
  /** e.g. "registrations" */ plural: string;
  /** e.g. "Registration" */ Singular: string;
  /** e.g. "Registrations" */ Plural: string;
}

const RESULT_NOUNS: Array<[RegExp, string, string]> = [
  [/registration/i, "registration", "registrations"],
  [/purchase/i, "purchase", "purchases"],
  [/trial/i, "trial", "trials"],
  [/checkout/i, "checkout", "checkouts"],
  [/lead/i, "lead", "leads"],
  [/subscri/i, "subscription", "subscriptions"],
  [/install/i, "install", "installs"],
  [/sign.?up/i, "sign-up", "sign-ups"],
];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Singular/plural noun match for a single result-event key, or undefined when no known pattern fits. */
function nounMatchFor(key: string): [singular: string, plural: string] | undefined {
  const found = RESULT_NOUNS.find(([re]) => re.test(key));
  return found ? [found[1], found[2]] : undefined;
}

/**
 * "Cost per X" label for one specific result-event key (not the account's
 * dominant event) — used by per-objective cost metrics so every real event
 * type an account reports gets its own honestly-labeled tile, never a
 * hardcoded ecommerce-flavored list.
 */
export function costPerResultLabel(key: string): string {
  const noun = nounMatchFor(key)?.[0] ?? eventLabel(key).toLowerCase();
  return `Cost per ${noun}`;
}

/**
 * Derive the account's result noun from its own analysis data: the
 * dominant "Result type" across creative-cell rows (what the analysis
 * actually measured), falling back to the bottom-line totals event with
 * the most results, then the campaign windows' declared result type.
 * Falls back to the neutral "result".
 */
export function resultTerm(account: AdAccount | null | undefined): ResultTerm {
  const iap = account?.iap;
  let dominant: string | null = null;

  // 1. What the analysis measured: cell rows keyed by result type,
  //    ranked by result volume (row count breaks ties).
  const byType = new Map<string, { results: number; rows: number }>();
  for (const row of iap?.analysis?.performance_by_cell ?? []) {
    const type = row["Result type"];
    if (!type) continue;
    const agg = byType.get(type) ?? { results: 0, rows: 0 };
    agg.results += Number(row.Results ?? 0);
    agg.rows += 1;
    byType.set(type, agg);
  }
  let best = { results: -1, rows: -1 };
  for (const [type, agg] of byType) {
    if (agg.results > best.results || (agg.results === best.results && agg.rows > best.rows)) {
      best = agg;
      dominant = type;
    }
  }

  // 2. Bottom-line totals event with the most results.
  // Only consult campaign-level aggregates when analysis has actually been run —
  // accounts without performance_by_cell rows have no measured result type yet
  // and must fall back to the neutral "result" rather than guessing from totals.
  const hasAnalysisData = (iap?.analysis?.performance_by_cell?.length ?? 0) > 0;
  if (!dominant && hasAnalysisData) {
    let max = -1;
    for (const [key, totals] of Object.entries(iap?.campaign_summary?.bottom_line_totals ?? {})) {
      const n = Number(totals?.results ?? 0);
      if (n > max) {
        max = n;
        dominant = key;
      }
    }
  }

  // 3. Declared campaign result type.
  if (!dominant && hasAnalysisData) {
    dominant = iap?.campaign_summary?.campaign_windows?.find((w) => w.result_type)?.result_type ?? null;
  }

  const match = dominant ? nounMatchFor(dominant) : undefined;
  const singular = match?.[0] ?? "result";
  const plural = match?.[1] ?? "results";
  return { singular, plural, Singular: capitalize(singular), Plural: capitalize(plural) };
}

// ─── Segment gender icon ────────────────────────────────────────────────
// Small glyph next to a demographic segment's age·gender label (e.g.
// "Women 45-54") — breaks up the cognitive load of scanning a grid of
// text-only labels. Renders nothing for a gender value that isn't
// female/male — never fabricates an icon for data the segment doesn't
// actually carry.

export function SegmentGenderIcon({ gender }: { gender: string }) {
  const g = gender.trim().toLowerCase();
  if (g === "female") {
    return (
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-status-danger/15 text-status-danger shrink-0"
      >
        <Venus className="w-3 h-3" />
      </span>
    );
  }
  if (g === "male") {
    return (
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-chart-1/15 text-interactive shrink-0"
      >
        <Mars className="w-3 h-3" />
      </span>
    );
  }
  return null;
}

// ─── Confidence badge ─────────────────────────────────────────────────

export function ConfidenceBadge({ value }: { value: string }) {
  const c = normalizeConfidence(value);
  const v = value.toLowerCase();
  const cls =
    c.polarity === "negative"
      ? "bg-status-danger/10 text-status-danger border-status-danger/20"
      : c.level === "high"
        ? "bg-status-success/10 text-status-success border-status-success/20"
        : v.includes("validation") || v.includes("required")
          ? "bg-accent/10 text-accent border-accent/20"
          : c.level === "directional"
            ? "bg-primary/10 text-interactive border-primary/20"
            : c.level === "medium"
              ? "bg-status-warning/10 text-status-warning border-status-warning/20"
              : "bg-muted text-muted-foreground/75 border-border/40";
  return (
    <span
      title={c.qualifier ? value : undefined}
      className={cn("inline-flex text-label font-semibold border px-1.5 py-0.5 rounded leading-none", cls)}
    >
      {c.label}
      {c.qualifier && <span className="ml-1 font-normal opacity-70">({c.qualifier})</span>}
    </span>
  );
}

// ─── Section-level horizontal tab bar ─────────────────────────────────
// Renders below the title area on Analysis and Strategy pages, giving
// users persistent in-section navigation. Active tab is URL-matched.

function spaNav(href: string, e: React.MouseEvent) {
  e.preventDefault();
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// The tabs ARE the section's menu rows. They used to be a second hand-typed
// list of the same eight routes, one rename away from the sidebar saying
// "Creative DNA" while the tab bar said something else. Any navTree section
// id with visible children renders; an unknown id renders no tabs.
function sectionTabs(section: string): { label: string; to: string }[] {
  const node = navTree.find((s) => s.id === section);
  return node ? visibleChildren(node).map((c) => ({ label: c.label, to: c.to })) : [];
}

export function SectionTabBar({ section }: { section: string }) {
  const [location] = useLocation();
  const tabs = sectionTabs(section);
  return (
    <div className="flex items-center gap-0.5 px-4 border-b border-border/40 overflow-x-auto shrink-0 bg-foreground/[0.008]">
      {tabs.map((tab) => {
        const active = location === tab.to;
        return (
          <a
            key={tab.to}
            href={tab.to}
            onClick={(e) => spaNav(tab.to, e)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 px-3.5 h-9 flex items-center text-body font-medium transition-colors whitespace-nowrap select-none",
              active
                ? "text-foreground"
                : "text-muted-foreground/75 hover:text-foreground/80 hover:bg-foreground/[0.04]"
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t-full" />
            )}
          </a>
        );
      })}
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────

export function ModuleHeader({
  section,
  title,
  subtitle,
  table,
  right,
  tabs,
  accountName,
}: {
  section: string;
  title: string;
  subtitle?: string;
  table?: string;
  right?: React.ReactNode;
  tabs?: "analysis" | "strategy";
  accountName?: string;
}) {
  const sectionLabel = section.split(" · ")[0];
  // A stage's command-center hub sets title to the bare stage name (e.g.
  // title="Strategy" on the page whose section is "Strategy · 04"), which
  // would otherwise render the eyebrow and H1 as an exact duplicate. Fall
  // back to the full section string (surfacing the "· 04" stage position
  // that's normally trimmed off) instead of inventing new copy. Keep this
  // comparison against the bare `title`, not the account-prefixed H1 below —
  // the account name belongs only in the H1, never duplicated into the eyebrow.
  const eyebrowText = sectionLabel.toLowerCase() === title.toLowerCase() ? section : sectionLabel;

  return (
    <div className="shrink-0">
      <div className={cn("px-6 py-4", !tabs && "border-b border-border/40")}>
        {/* flex-wrap: at phone width the right slot (date presets, export,
            table chips — 500px of controls on some routes) drops onto its
            own line under the title instead of overlaying the eyebrow. Its
            own inner flex-wrap only works once it has a full line to wrap
            within. */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0 mx-section-header">
            <div className="flex items-center gap-1.5">
              {/* Nocturne breadcrumb eyebrow: view context · module. This is a
                  single-workspace agency deployment, so the view is static. */}
              <span className="mx-section-header__eyebrow">
                <span className="text-muted-foreground/75">Agency view · </span>
                {eyebrowText}
              </span>
              {subtitle && <InfoTooltip content={subtitle} />}
            </div>
            <h1 className="mx-section-header__title">
              {/* The nowrap span keeps "Name ·" together so the separator
                  never orphans onto its own line at phone width — while the
                  DOM text stays plain-spaced for assertions and copy-paste
                  (an NBSP here made four exact-textContent tests fail on an
                  invisible character). */}
              {accountName ? (
                <>
                  <span className="whitespace-nowrap">{accountName} ·</span> {title}
                </>
              ) : (
                title
              )}
            </h1>
          </div>
          <div className="shrink-0 max-w-full pt-0.5 flex items-center gap-2 flex-wrap">
            {right}
            {table && <DataSourceBadge table={table} collapsible />}
          </div>
        </div>
      </div>
      {tabs && <SectionTabBar section={tabs} />}
    </div>
  );
}


// ─── Date-range scope bar ─────────────────────────────────────────────
// Standard strip under the scope banner: shows the active global range,
// and is explicit about grain — flight-window aggregates, no daily rows.

export function RangeScopeBar({ grainNote }: { grainNote?: string }) {
  const { range, bounds, preset, compare, compareRange } = useDateRange();
  if (!range || !bounds) return null;
  const narrowed = preset !== "all";
  if (!narrowed && !compare) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-foreground/[0.01]">
      {compare && compareRange && (
        <span className="inline-flex items-center gap-1 text-caption text-interactive/80 tabular-nums">
          <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
          vs {formatIsoRange(compareRange)}
        </span>
      )}
      {narrowed && (
        <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground/75">
          Flight-window scope
          <InfoTooltip content={grainNote ?? "Items are included when their flight window overlaps this range; metrics cover each item's full flight. This import has no daily grain."} />
        </span>
      )}
    </div>
  );
}

/** Explicit empty state when the selected range has no overlap with this module's data. */
export function NoDataInRangeState({ what, detail }: { what: string; detail?: string }) {
  const { range, setPreset } = useDateRange();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
        <CalendarX2 className="w-4 h-4 text-muted-foreground/75" />
      </div>
      <p className="text-callout font-semibold text-foreground/80">No {what} in this range</p>
      <p className="text-body text-muted-foreground/75 max-w-xs">
        {detail ?? (range ? `The selected range (${formatIsoRange(range)}) is outside this data's available window.` : "No dated data is available.")}
      </p>
      <button
        onClick={() => setPreset("all")}
        className="pressable text-body font-semibold text-primary-foreground bg-primary border border-primary hover:bg-primary/90 rounded-md px-3.5 py-2 transition-colors shadow-md shadow-primary/25"
      >
        Show all available data
      </button>
    </div>
  );
}

// ─── Data caveat note ─────────────────────────────────────────────────
// Compact collapsible pill — truncated by default, click to expand.
// Pass `source` to show a monospace source badge before the text.
// Pass `defaultExpanded` to start expanded (e.g. short caveats with no truncation).

/** Whole sentences up to `max` characters; a first sentence longer than that is cut at a word. */
function previewSentences(text: string, max: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  return out || deriveLabel(text, max);
}

export function CaveatNote({
  text,
  source,
  defaultExpanded = false,
}: {
  text: string | null | undefined;
  source?: string;
  defaultExpanded?: boolean;
}) {
  const THRESHOLD = 110;
  // An empty caveat is not a caveat. Without this guard a blank string
  // rendered the full amber warning surface — border, tint and icon — around
  // no text at all, which reads as a warning the reader cannot act on or
  // even read. Nothing to say means nothing rendered.
  const body = (text ?? "").trim();
  const isLong = body.length > THRESHOLD;
  const [expanded, setExpanded] = useState(defaultExpanded || !isLong);
  // Collapsed, the pill shows whole SENTENCES while they fit the threshold,
  // so it says one complete thing (and names what the first sentence names,
  // such as the account's terminal metric). It used to cut mid-sentence at
  // 110 characters, which took the space of a message and said nothing.
  const preview = isLong ? previewSentences(body, THRESHOLD) : body;

  if (!body) return null;

  return (
    <div className="rounded-lg border border-status-warning/15 bg-status-warning/[0.03] overflow-hidden">
      <button
        onClick={isLong ? () => setExpanded((v) => !v) : undefined}
        disabled={!isLong}
        className={cn(
          "w-full flex items-start gap-2 px-3 py-2 text-left",
          isLong && "hover:bg-status-warning/[0.05] active:bg-status-warning/[0.08] transition-colors"
        )}
      >
        <Info className="w-3.5 h-3.5 text-status-warning/70 shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          {source && (
            <span className="text-label uppercase tracking-widest text-status-warning/65 block mb-0.5">
              {source}
            </span>
          )}
          <p className="text-body text-status-warning/90 leading-snug">
            {expanded ? body : preview}
          </p>
        </div>
        {isLong && (
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-status-warning/40 shrink-0 mt-1 transition-transform duration-150",
              expanded && "rotate-180"
            )}
          />
        )}
      </button>
    </div>
  );
}

// ─── Dense text (universal clamped prose) ─────────────────────────────
// The one text-density primitive: CSS line-clamp preview + in-place
// "More/Less" roll-down. Works with plain strings or a custom renderer
// (e.g. TokenizedConceptText). Never deletes information — the full text
// is always one click away. Not for use inside <button> cards (nested
// buttons are invalid HTML): clamp with raw `line-clamp-N` there and let
// the drawer/modal carry the full prose.
//
// WHY THE BUTTON IS MEASURED AND NOT GUESSED
// This used to show "More" whenever `text.length > threshold`. The clamp,
// though, is CSS and counts LINES, not characters — so how much fits
// depends on the column width, which the character count knows nothing
// about. Rendering the provenance page at 1440px caught the consequence:
// three registry notes of ~135 characters each fit entirely inside
// `line-clamp-2` (measured `scrollHeight === clientHeight === 48`) and every
// one still carried a "More" button. Pressing it did nothing a reader could
// see. An affordance that promises hidden content and delivers none is worse
// than no affordance — it teaches people that this control is a lie, and
// they stop pressing the ones that work.
//
// So the button now appears only when the paragraph is ACTUALLY clipped,
// re-measured whenever the element resizes. That makes it correct at every
// width for free: the same note that needs no button on a desktop column
// gets one on a phone.
//
// The character threshold survives as a FALLBACK for environments with no
// layout — jsdom reports every height as 0, and suppressing the control
// there would silently change what component tests can reach. When
// `clientHeight` is 0 there is nothing to measure, so the old heuristic
// answers; the moment a real measurement exists, it wins.

export function DenseText({
  text,
  render,
  className,
  clampClass = "line-clamp-2",
  threshold = 120,
}: {
  text: string;
  render?: (text: string) => React.ReactNode;
  className?: string;
  clampClass?: string;
  /** Fallback only — used when the environment reports no layout at all. */
  threshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // null = not measured yet (or unmeasurable); true/false = a real answer.
  const [clipped, setClipped] = useState<boolean | null>(null);
  const paraRef = useRef<HTMLParagraphElement | null>(null);

  const measure = useCallback(() => {
    const el = paraRef.current;
    if (!el) return;
    // A zero client height means no layout engine (jsdom, display:none, a
    // detached subtree). Reporting "not clipped" from that would hide the
    // control everywhere it cannot be measured.
    if (el.clientHeight === 0) {
      setClipped(null);
      return;
    }
    setClipped(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useLayoutEffect(() => {
    // Only the clamped state can be measured for overflow; once expanded the
    // paragraph is its full height by definition, so keep the last verdict.
    if (expanded) return;
    measure();
    const el = paraRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, expanded, text, clampClass, className]);

  const showToggle = clipped ?? text.length > threshold;
  const content = render ? render(text) : text;

  // Still render the ref'd paragraph when nothing is clipped — the element
  // has to exist and be observed for a later resize to change the answer.
  return (
    <div className="min-w-0">
      <p ref={paraRef} className={cn(className, !expanded && clampClass)}>
        {content}
      </p>
      {(showToggle || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="pressable mt-0.5 inline-flex items-center gap-0.5 text-label font-semibold text-interactive/80 hover:text-interactive transition-colors"
        >
          {expanded ? "Less" : "More"}
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

// ─── Expandable prose (legacy alias) ──────────────────────────────────
// Thin wrapper over <DenseText> kept for existing call sites. Previews
// now clamp by line (CSS) instead of a character slice, so preview
// heights stay visually consistent across cards.

export function ExpandableText({
  text,
  className,
  threshold = 120,
}: {
  text: string;
  className?: string;
  threshold?: number;
}) {
  return <DenseText text={text} className={className} threshold={threshold} />;
}

// ─── Clamped prose (legacy alias) ─────────────────────────────────────
// Thin wrapper over <DenseText> kept for existing call sites that pass a
// custom renderer or clamp depth.

export function ClampedProse({
  text,
  render,
  className,
  clampClass = "line-clamp-2",
  threshold = 160,
}: {
  text: string;
  render?: (text: string) => React.ReactNode;
  className?: string;
  clampClass?: string;
  threshold?: number;
}) {
  return (
    <DenseText
      text={text}
      render={render}
      className={className}
      clampClass={clampClass}
      threshold={threshold}
    />
  );
}

// ─── Label derivation (mechanical, never fabricates copy) ────────────
// Extracts a concise, high-impact label from existing prose: takes the
// first clause (up to the first sentence end, em-dash, or colon), then
// cuts at a word boundary if still over `max`. Purely mechanical — the
// label is always a prefix/clause of the source text, never new copy.

export function deriveLabel(text: string | null | undefined, max = 60): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const m = t.match(/^(.*?)(?:[.!?](?:\s|$)|\s—\s|:\s)/);
  let clause = m && m[1].trim().length >= 8 ? m[1].trim() : t;
  if (clause.length <= max) return clause;
  const cut = clause.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  clause = lastSpace > 24 ? cut.slice(0, lastSpace) : clause.slice(0, max);
  return clause.replace(/[\s,;:—-]+$/, "") + "…";
}

// ─── Detail reveal (first-layer popover) ──────────────────────────────
// THE first-layer primitive: a concise label stays visible on the card;
// the full sentence prose lives in a click/tap/keyboard popover. The
// info affordance is always visible (never hover-only), so the reveal is
// discoverable on touch and accessible by keyboard (Radix handles focus,
// Escape, and viewport collision). Not for use inside <button> cards —
// nested buttons are invalid HTML; clamp + drawer there instead.

/** DetailReveal widths: compact (the long-standing 380px) or wide. */
const DETAIL_REVEAL_BOUNDS = { min: 380, max: 560, default: 380 } as const;

export interface DetailSection {
  /** Small uppercase section label inside the popover. */
  label?: string;
  /** Full prose for this section. */
  text?: string;
  /** Custom renderer (takes precedence over `text`). */
  render?: () => React.ReactNode;
}

export function DetailReveal({
  label,
  eyebrow,
  sections,
  labelClassName,
  className,
  align = "start",
  testId,
  defaultOpen,
}: {
  /** Concise always-visible label (derive with deriveLabel — no new copy). */
  label: React.ReactNode;
  /** Small uppercase kicker at the top of the popover. */
  eyebrow?: string;
  /** Full-prose sections revealed in the popover. */
  sections: DetailSection[];
  /** Classes for the visible label span (defaults to TYPE.body). */
  labelClassName?: string;
  /** Classes for the trigger row. */
  className?: string;
  align?: "start" | "center" | "end";
  testId?: string;
  /** Opt-in initial open state (e.g. a page's own "Summary/Detailed" density
   *  toggle). Unset preserves the default closed-until-clicked behavior. */
  defaultOpen?: boolean;
}) {
  const content = sections.filter((s) => (s.text ?? "").trim() || s.render);
  // Every reveal on the page shares one width preference (compact 380 or
  // wide 560), persisted per viewer — the owner's ask that panels be
  // expandable and consistent across every surface, without a drag handle
  // on a popover.
  const size = usePanelSize("detail-reveal", DETAIL_REVEAL_BOUNDS);
  if (content.length === 0) {
    return <span className={cn(labelClassName ?? TYPE.body, "block min-w-0", className)}>{label}</span>;
  }
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          data-testid={testId}
          className={cn(
            "group hit-target-24 inline-flex items-start gap-1.5 text-left min-w-0 max-w-full rounded-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            className
          )}
        >
          <span className={cn(labelClassName ?? TYPE.body, "min-w-0 group-hover:text-foreground transition-colors")}>
            {label}
          </span>
          <Info
            aria-hidden
            className="w-3.5 h-3.5 shrink-0 mt-1 text-muted-foreground/75 group-hover:text-interactive/80 transition-colors"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        collisionPadding={12}
        style={{ width: size.width }}
        className="max-w-[min(90vw,600px)] max-h-[min(60vh,480px)] overflow-y-auto p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          {eyebrow ? <div className={cn(TYPE.label, "text-muted-foreground/75")}>{eyebrow}</div> : <span />}
          <button
            type="button"
            onClick={size.toggleExpanded}
            aria-pressed={size.expanded}
            aria-label={size.expanded ? "Compact panel" : "Wide panel"}
            title={size.expanded ? "Compact" : "Wide"}
            data-testid="detail-reveal-size"
            className="pressable hit-target-24 inline-flex items-center justify-center w-6 h-6 -mt-1 -mr-1 rounded text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.06] transition-colors shrink-0"
          >
            {size.expanded ? <Minimize2 className="w-3.5 h-3.5" aria-hidden /> : <Maximize2 className="w-3.5 h-3.5" aria-hidden />}
          </button>
        </div>
        {content.map((s, i) => (
          <div key={i} className="space-y-1">
            {s.label && (
              <div className="text-label font-semibold uppercase text-muted-foreground/75">{s.label}</div>
            )}
            {s.render ? s.render() : <p className={TYPE.body}>{s.text}</p>}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Unconfigured / pending states ────────────────────────────────────

// ── Loop Checklist ──────────────────────────────────────────────────

export interface LoopChecklistStep {
  label: string;
  done: boolean;
  route?: string;
  onClick?: () => void;
}

/**
 * Compact checklist that shows ✓ / next / pending state for each step.
 * Used in UnconfiguredState (setup flow) and as a sidebar progress widget
 * on AdAccountOverview for configured accounts mid-loop.
 *
 * When `allComplete` is true the list stays visible and a "Loop complete ✓"
 * banner replaces the progress bar, with a "Start re-run" link so users
 * know the sidebar is always useful — not just mid-flight.
 */
export function LoopChecklist({ steps, allComplete = false }: { steps: LoopChecklistStep[]; allComplete?: boolean }) {
  const [, navigate] = useLocation();
  const doneCount = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="rounded-xl border border-border/30 bg-foreground/[0.02] overflow-hidden">
      {/* Header + fraction */}
      <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
        <span className={cn(TYPE.label, allComplete ? "text-status-success/70" : "text-muted-foreground/75")}>
          {allComplete ? "Loop complete" : "Setup progress"}
        </span>
        <div className="flex-1 h-px bg-border/20" />
        <span className="text-label tabular-nums text-muted-foreground/75">{doneCount}/{steps.length}</span>
      </div>
      {/* Completion banner — shown when all steps are done */}
      {allComplete ? (
        <div className="px-3 py-2.5 border-b border-border/15">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
            <span className={cn(TYPE.caption, "text-status-success/90 font-semibold leading-none")}>Loop complete ✓</span>
          </div>
          <p className={cn(TYPE.caption, "text-muted-foreground/75 leading-snug mb-2")}>
            All stages finished. Ready for the next re-run cycle.
          </p>
          <a
            href="/app/analysis"
            onClick={(e) => { e.preventDefault(); navigate("/app/analysis"); }}
            className="inline-flex items-center gap-1 text-label font-semibold text-interactive/80 hover:text-interactive transition-colors"
          >
            Start re-run <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      ) : (
        /* Progress bar — only shown when at least one step is done */
        (doneCount > 0 && (<div className="px-3 pt-2 pb-0">
          <ProgressMeter
            value={doneCount}
            total={steps.length}
            label="Loop progress"
            size="sm"
            fillClassName="bg-status-success/50"
          />
        </div>))
      )}
      {steps.map((step, i) => {
        const isNext = !allComplete && i === nextIdx;
        const isAction = !!step.onClick || !!step.route;
        const Tag = step.onClick ? "button" : step.route ? "a" : "div";
        return (
          <Tag
            key={i}
            {...(step.onClick
              ? { type: "button" as const, onClick: step.onClick }
              : step.route
                ? {
                    href: step.route,
                    onClick: (e: React.MouseEvent) => { e.preventDefault(); navigate(step.route!); },
                  }
                : {})}
            className={cn(
              "flex items-center gap-2 px-3 py-2 border-b border-border/15 last:border-0 w-full text-left",
              isAction && !allComplete ? "hover:bg-foreground/[0.03] transition-colors cursor-pointer" : "cursor-default",
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
              step.done
                ? "text-status-success"
                : isNext
                  ? "border border-primary/50 bg-primary/[0.08]"
                  : "border border-border/35 bg-foreground/[0.02]",
            )}>
              {step.done
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : isNext
                  ? <ArrowRight className="w-2.5 h-2.5 text-interactive/70" />
                  : <span className="text-label font-bold text-muted-foreground/75 tabular-nums leading-none">{i + 1}</span>
              }
            </div>
            <span className={cn(
              TYPE.caption, "leading-none",
              step.done
                ? "text-foreground/55 line-through"
                : isNext
                  ? "text-foreground/75 font-semibold"
                  : "text-muted-foreground/75",
            )}>
              {step.label}
            </span>
            {isNext && step.route && (
              <ArrowRight className="w-3 h-3 text-interactive/40 ml-auto shrink-0" />
            )}
          </Tag>
        );
      })}
    </div>
  );
}

export function UnconfiguredState({ account }: { account: AdAccount }) {
  const s = account.overview_state;
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const isManual = !["meta", "facebook", "meta ads"].includes((account.platform ?? "").toLowerCase());
  const { data: importsData } = useListManualImports(account.id);
  const imports = importsData?.imports ?? [];
  const csvsDone = isManual && (
    imports.some((i) => i.kind === "performance_demo_csv") &&
    imports.some((i) => i.kind === "performance_placement_csv")
  );
  const creativesMapped = isManual && imports.filter((i) => i.kind === "creative_asset").some((a) => a.ad_names.length > 0);

  const setupSteps: LoopChecklistStep[] = isManual
    ? [
        { label: "Name the account", done: true },
        { label: "Upload performance CSVs", done: csvsDone, onClick: () => setImportOpen(true) },
        { label: "Map creative assets", done: creativesMapped, route: "/app/settings/general" },
        // The run control lives on the Analysis command center, not Settings.
        { label: "Run analysis", done: false, route: "/app/analysis" },
      ]
    : [
        { label: "Connect data source", done: false, onClick: () => setConnectOpen(true) },
        { label: "Run analysis", done: false, route: "/app/analysis" },
        { label: "Generate strategy", done: false, route: "/app/strategy/overview" },
        { label: "Generate briefs", done: false, route: "/app/creative/builder" },
      ];

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-6">
      <div className="max-w-sm w-full space-y-5">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center mx-auto mb-3">
            <Plug className="w-5 h-5 text-muted-foreground/75" />
          </div>
          <h2 className={HEADING.h2}>{s?.title ?? "Get started with " + account.name}</h2>
          <p className="text-caption text-muted-foreground/75 leading-relaxed">
            {s?.description ?? (isManual
              ? "Upload your Meta CSV exports, then run analysis to see performance data."
              : "Connect a data source, then follow the setup checklist below.")}
          </p>
        </div>

        {/* Guided setup checklist — first actionable step opens its dialog inline */}
        <LoopChecklist steps={setupSteps} />

        {/* Switch account */}
        <div className="text-center space-y-1.5">
          <p className="text-caption font-semibold uppercase tracking-widest text-muted-foreground/75">
            Or view a different account
          </p>
          <InlineAccountPicker label="Switch ad account" excludeAccountId={account.id} />
        </div>
      </div>
      <ConnectMetaDialog account={account} open={connectOpen} onOpenChange={setConnectOpen} />
      <ManualImportDialog account={account} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

export function PendingState({ title, message, icon: Icon = Clock, action }: { title: string; message?: string; icon?: React.ComponentType<{ className?: string }>; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/75" />
      </div>
      <h3 className="text-h4 font-h4 font-bold text-foreground/85 text-balance">{title}</h3>
      {/* The message stays ON the page rather than behind an info tooltip.
          The density rule that hides prose exists to stop a dashboard full
          of competing text; an empty state has no competing text, and the
          sentence explaining WHY the surface is empty is the only content
          there is. Hiding it left the reader a title and a shrug. */}
      {message && (
        <p className="text-body font-body text-muted-foreground max-w-[42ch] leading-relaxed text-pretty">
          {message}
        </p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

// ─── Stage-not-run state ──────────────────────────────────────────────
//
// A surface fed by an IAP loop stage that has not produced anything must
// not describe itself as a measured zero, and must not instruct an action
// that cannot produce the missing output.
//
// The Action Queue did both. Its empty state read "No actions yet — Run
// analysis to generate optimization recommendations for this account."
// `metrixSeedAssembly.ts` sets `optimization_loop: null` as a hardcoded
// literal for every account and nothing anywhere writes it, so that
// instruction could never be satisfied by anyone. A user runs analysis,
// comes back, and is told to run analysis. That is worse than an empty
// page: it spends the reader's time and teaches them the product lies.
//
// The seed already carries the truth, per account, in `loop_status` —
// assembled under a comment that literally says "honest pending states":
//
//   optimization_loop | pending | "Not yet run — golden-formula output
//     requires the Creative Scan / Test Engine stage plus raw Meta exports
//     with real ad_id."
//   optimization_loop | pending | "Not yet run — blocked on creative_scan
//     (which is blocked on tracking fix + budget delivery)."
//
// Two different accounts, two different real blockers, both more useful
// than any sentence written at the call site. So this reads the note
// rather than inventing one, and distinguishes three states the generic
// copy collapsed into one:
//
//   pending + note   the stage is registered and blocked, here is why
//   pending, no note the stage is registered and has not run
//   no row at all    the stage was never registered for this account —
//                    true of every manual-upload account in the seed, and
//                    a different fact from "pending"
//
// `AnalysisDnaView` established this pattern for the golden-formula line;
// this is the same read, made shareable so the next surface does not
// hand-roll a third variant.

export function useLoopStage(
  account: { iap?: { loop_status?: SeedLoopStage[] } | null } | null | undefined,
  stage: string,
): SeedLoopStage | null {
  return account?.iap?.loop_status?.find((s) => s.stage === stage) ?? null;
}

export function StageNotRunState({
  title,
  stageLabel,
  stage,
  account,
  icon: Icon = Clock,
  action,
}: {
  /** Heading. Says what is absent, never "no results". */
  title: string;
  /** Human name of the stage, for the fallback sentences. */
  stageLabel: string;
  /** loop_status stage key, e.g. "optimization_loop". */
  stage: string;
  account: { iap?: { loop_status?: SeedLoopStage[] } | null } | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
  /** Somewhere real to go — never a control that re-runs the wrong stage. */
  action?: React.ReactNode;
}) {
  const entry = useLoopStage(account, stage);
  const message = entry?.note
    ? entry.note
    : entry
      ? `The ${stageLabel} stage is registered for this account and has not run yet.`
      : `The ${stageLabel} stage has not run for this account.`;
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/40 py-16 text-center px-6">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/75" />
      </div>
      <h3 className="text-h4 font-h4 font-bold text-foreground/85 text-balance">{title}</h3>
      {/* The stage's own note, verbatim. It is the most specific true thing
          available and it is already account-scoped; a sentence written here
          would be a generic guess standing in front of it. */}
      <p className="text-body font-body text-muted-foreground max-w-[46ch] leading-relaxed text-pretty">
        {message}
      </p>
      <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>
        loop_status → {stage}
      </p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

// ─── Skeleton loading primitives ──────────────────────────────────────
// animate-pulse shimmer blocks that mirror the shape of real content so
// the layout doesn't jump when data arrives. Use for any async operation
// longer than ~300 ms that would otherwise leave a frozen or blank area.

export function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-foreground/[0.06]", className)}
    />
  );
}

/** A row of evenly-sized shimmer tiles that matches the metric tile grid. */
export function SkeletonTileRow({ count = 4 }: { count?: number }) {
  return (
    // The real tile rows use the responsive grid-cols-dashboard-* utilities
    // (2 columns on a phone, 4 from a tablet). This was a fixed N-column
    // grid, so on a 390px screen it laid four tiles across at ~90px each and
    // then re-flowed to two the instant data arrived — a skeleton that
    // causes the layout jump it exists to prevent.
    <div
      aria-hidden="true"
      className={cn(
        "grid gap-2",
        count >= 5 ? "grid-cols-dashboard-5" : count === 3 ? "grid-cols-dashboard-3" : count <= 2 ? "grid-cols-dashboard-2" : "grid-cols-dashboard-4",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/30 bg-foreground/[0.02] px-3 py-2.5 space-y-2">
          <SkeletonBlock className="h-2 w-2/3" />
          <SkeletonBlock className="h-5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────
// When the tile is placed inside a `group` button, border lifts on hover.

// variant="primary" — accent bar at top, higher-contrast label; use on the
// single most important tile in a row group to establish visual authority.
export function MetricTile({
  label, value, sub, onClick, variant = "default",
  actionLabel = "Segment breakdown",
  actionTitle = "Open segment breakdown for this metric",
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  onClick?: () => void;
  variant?: "primary" | "default";
  /** What the press opens. Say the truth: a tile that opens every dimension
   *  must not promise only segments (register L-4). */
  actionLabel?: string;
  actionTitle?: string;
}) {
  const isPrimary = variant === "primary";
  const labelCls = isPrimary
    ? cn(TYPE.microLabel, "text-muted-foreground/75 mb-1.5 truncate")
    : cn(TYPE.microLabel, "text-muted-foreground/75 mb-2 truncate");

  // The label sits ABOVE the tile, on the page ground (owner, 2026-09-03):
  // the tile's border boxes the number, not its name.
  if (onClick) {
    return (
      <div className="flex flex-col gap-1.5 min-w-0 h-full group/tile">
        <div className={cn(labelCls, "mb-0 px-0.5 group-hover/tile:text-interactive/70 transition-colors")}>{label}</div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mx-kpi-tile p-4 text-left w-full relative flex-1",
          "hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.98]",
          "transition-[border-color,background-color,scale] duration-150 ease-[var(--mx-ease)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isPrimary && "border-primary/35 bg-primary/[0.03]"
        )}
        title={actionTitle}
        aria-label={typeof label === "string" ? `${label}: ${value}` : undefined}
        data-testid="metric-tile"
      >
        {isPrimary && <div data-testid="metric-tile-primary-accent" className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />}
        <div className="relative z-10">
          <div className="text-bignum font-h1 font-bold text-foreground metric-num leading-none">{value}</div>
          {sub && <div className="text-caption text-muted-foreground/75 mt-2 leading-snug line-clamp-2">{sub}</div>}
          {/* Visible at rest, not only on hover. A touch device has no hover
              state, so text-interactive/0 meant this affordance never
              appeared on a phone or tablet at all — the tile looked
              identical to the static variant beside it and gave the reader
              no reason to press it. It brightens on hover instead of
              materialising. */}
          <div className="mt-2 text-micro uppercase tracking-wider text-interactive/80 group-hover/tile:text-interactive transition-[color] duration-150 ease-[var(--mx-ease)]">
            {actionLabel} →
          </div>
        </div>
      </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 min-w-0 h-full">
      <div className={cn(labelCls, "mb-0 px-0.5")}>{label}</div>
      {/* The tile names its metric: with the label lifted out of the tile,
          a null value's dash lost the sibling that resolved it, and
          check:unexplained-dashes reads a title within four ancestors. */}
      <div
        title={typeof label === "string" ? label : undefined}
        className={cn(
        "mx-kpi-tile p-4 relative flex-1 transition-[border-color] duration-150 ease-[var(--mx-ease)]",
        isPrimary && "border-primary/35 bg-primary/[0.03]"
      )}>
        {isPrimary && <div data-testid="metric-tile-primary-accent" className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />}
        <div className="relative z-10">
          <div className="text-bignum font-h1 font-bold text-foreground metric-num leading-none">{value}</div>
          {sub && <div className="text-caption text-muted-foreground/75 mt-2 leading-snug line-clamp-2">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── In-page module tabs (sub-navigation) ────────────────────────────
//
// Kept as a named wrapper because ~20 call sites read as ModuleTabs and the
// module-level left padding is this rail's own convention. The behaviour is
// TabRail's — see components/nav/TabRail.tsx for why four hand-rolled rails
// became one.

export function ModuleTabs<T extends string>({
  tabs,
  active,
  onChange,
  label = "Section",
}: {
  tabs: { id: T; label: string; count?: number; Icon?: React.ComponentType<{ className?: string }>; disabledReason?: string }[];
  active: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return <TabRail tabs={tabs} active={active} onChange={onChange} label={label} className="px-6" />;
}

// ─── Module scope gate ────────────────────────────────────────────────
// Standard gating for account-scoped subpages: no account selected →
// pending state; unconfigured account → connect state; else children.
// Children are a render function so gated content is never evaluated
// (and can never leak another account's data) when the gate blocks.

export function ModuleScopeGate({
  section,
  title,
  account,
  renderHeader = true,
  children,
}: {
  section: string;
  title: string;
  account: AdAccount | null;
  /** Pass false when a parent (e.g. a tab-switched command center) already
   *  owns the single ModuleHeader for this route — prevents a duplicate
   *  heading from rendering in the blocked (no-account/unconfigured) states. */
  renderHeader?: boolean;
  children: () => React.ReactNode;
}) {
  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        {renderHeader && <ModuleHeader section={section} title={title} />}
        <PendingState
          title="No ad account selected"
          message="Choose an ad account to view this module."
          action={<InlineAccountPicker />}
        />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        {renderHeader && <ModuleHeader section={section} title={title} accountName={account.name} />}
        <UnconfiguredState account={account} />
      </div>
    );
  }
  return <>{children()}</>;
}

// ─── Cross-module link ────────────────────────────────────────────────
// Visible pill button — navigates to another module. Use whenever a
// UI surface should surface a clear actionable jump to a sibling module.

export function CrossLink({ to, label, srNote }: { to: string; label: string; srNote?: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(to)}
      className="pressable inline-flex items-center gap-2 text-caption font-semibold px-4 py-2 rounded-lg bg-primary/12 border border-primary/30 text-interactive hover:bg-primary/20 hover:border-primary/50 transition-[color,background-color,border-color,box-shadow,opacity,transform] shadow-sm shadow-primary/5"
    >
      {label}
      {srNote && <span className="sr-only">{` · ${srNote}`}</span>}
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

// ─── Hub navigation grid ────────────────────────────────────────────────
// Every command center ends with a grid of links into its child pages.
// This is the single shared rendering for that grid — one real fix beats
// seven near-identical inline copies drifting out of sync. The whole card
// is the click target (not a small trailing "Open" pill) so the affordance
// matches the visual weight, a labeled "Explore" eyebrow gives the grid its
// own place in the page hierarchy (rather than trailing off the primary
// action with no heading at all), and each icon sits in a tinted chip so
// the row doesn't read as one undifferentiated wall of identical cards.

export interface HubNavItem {
  to: string;
  label: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Canvas hub composition: the data lineage this view reads (mono caption, e.g. "analysis.concept_rollup[] · performance_by_cell[]"). */
  lineage?: string;
}

export function HubNavGrid({ items, label = "Explore" }: { items: HubNavItem[]; label?: string }) {
  const [, navigate] = useLocation();
  return (
    <div>
      <div className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-2.5 px-0.5")}>{label}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((c) => (
          <button
            key={c.to}
            type="button"
            onClick={() => navigate(c.to)}
            className="pressable-lg group relative flex items-start gap-3 text-left rounded-xl border border-border/40 bg-foreground/[0.02] p-4 pr-8 transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:border-primary/35 hover:bg-primary/[0.05] hover:-translate-y-px"
          >
            <span className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center transition-colors group-hover:bg-primary/20 group-hover:border-primary/35">
              <c.Icon className="w-4 h-4 text-interactive" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-title font-bold text-foreground">{c.label}</div>
              <p className="text-caption text-muted-foreground/80 leading-relaxed mt-0.5">{c.desc}</p>
              {c.lineage && (
                <p className={cn(TYPE.microLabel, "text-muted-foreground/75 mt-1 truncate")} data-testid="hub-nav-lineage">{c.lineage}</p>
              )}
            </div>
            <ArrowRight className="absolute right-3.5 top-4 w-3.5 h-3.5 text-muted-foreground/75 transition-[color,background-color,border-color,box-shadow,opacity,transform] group-hover:text-interactive group-hover:translate-x-0.5" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Prominent loop-action button — Analysis → Strategy → Brief closed-loop CTAs.
 * Always ≥14px, solid fill on primary variant so it reads as a clear action.
 */
export function LoopAction({
  to, label, icon = "strategy", variant = "primary",
}: {
  to: string;
  label: string;
  icon?: "strategy" | "brief" | "analysis";
  variant?: "primary" | "secondary";
}) {
  const [, navigate] = useLocation();
  const Icon = icon === "strategy" ? MapIcon : icon === "brief" ? Sparkles : ArrowRight;
  return (
    <button
      onClick={() => navigate(to)}
      className={cn(
        "pressable inline-flex items-center gap-2 text-caption font-semibold px-4 py-2.5 rounded-lg border transition-[color,background-color,border-color,box-shadow,opacity,transform]",
        variant === "primary"
          ? "bg-primary text-foreground border-primary hover:bg-primary/90 shadow-md shadow-primary/25 hover:shadow-primary/35"
          : "bg-foreground/[0.07] border-border/55 text-foreground/90 hover:bg-foreground/[0.11] hover:text-foreground hover:border-border/75 elevation-raised",
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
      <ArrowRight className="w-3.5 h-3.5 opacity-75 ml-0.5" />
    </button>
  );
}

// ─── Flow back-navigation ─────────────────────────────────────────────
// Pages in the Analysis→Strategy→Brief loop pass ?from=&fromCell=&fromHyp=
// so the destination page can render a contextual "← Back" button.

export interface FromParams {
  from: string | null;
  fromCell: string | null;
  fromHyp: string | null;
}

export function useFromParam(): FromParams {
  const search = useSearch();
  const p = new URLSearchParams(search);
  return { from: p.get("from"), fromCell: p.get("fromCell"), fromHyp: p.get("fromHyp") };
}

/**
 * Threads the current page's origin onto an outgoing link, so a hop through
 * a command center (IAP Library cell → Creative hub → Brief Builder) keeps
 * the cell that started it. Without this the hub's own links dropped the
 * params and the crumb on the next page never rendered. A link with no
 * origin is returned unchanged; an existing query string is preserved.
 */
export function withFrom(to: string, fp: FromParams): string {
  if (!fp.from) return to;
  const [path, qs = ""] = to.split("?");
  const p = new URLSearchParams(qs);
  p.set("from", fp.from);
  if (fp.fromCell) p.set("fromCell", fp.fromCell);
  if (fp.fromHyp) p.set("fromHyp", fp.fromHyp);
  return `${path}?${p.toString()}`;
}

// The origin → target table lives in navigation/navHistory.ts (keyed by
// navTree section id, so from=creative / from=mst resolve too) because the
// Topbar's structural Back reads the same table; these are its page-side
// views.

/** Returns the back-navigation URL for a given origin param set. */
function backUrl(fp: FromParams): string | null {
  return fromOriginTarget(fp)?.to ?? null;
}

function backLabel(fp: FromParams): string {
  return fromOriginTarget(fp)?.label ?? "Back";
}

/**
 * "← Back to [origin]" button. Renders only when a valid ?from= param is
 * present so pages without the param stay unaffected.
 */
export function BackLink() {
  const fp = useFromParam();
  const [, navigate] = useLocation();
  const url = backUrl(fp);
  if (!url) return null;
  return (
    <button
      onClick={() => navigate(url)}
      className="pressable inline-flex items-center gap-1 text-caption font-medium text-muted-foreground/75 hover:text-foreground/80 transition-colors"
    >
      <ChevronLeft className="w-3.5 h-3.5" />
      {backLabel(fp)}
    </button>
  );
}

/**
 * Slim breadcrumb strip shown just below the module header when a page was
 * reached via a loop navigation link. Provides constant orientation + back.
 */
export function FlowCrumb({ from, fromCell, fromHyp }: FromParams) {
  const [, navigate] = useLocation();
  const target = fromOriginTarget({ from, fromCell, fromHyp });
  if (!target) return null;
  const { to: url, crumb: origin } = target;

  return (
    <div className="px-6 py-1.5 border-b border-border/20 bg-foreground/[0.01] flex items-center gap-1.5">
      <button
        onClick={() => navigate(url)}
        className="pressable inline-flex items-center gap-1 text-label font-medium text-muted-foreground/75 hover:text-muted-foreground/80 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        {origin}
      </button>
      <span className="text-muted-foreground/75 text-label">/</span>
      <span className="text-label text-muted-foreground/75">This page</span>
    </div>
  );
}

// ─── Tab URL param (?tab=<id>) ─────────────────────────────────────────
// In-module tab state lives in the URL (same convention as ?focus= below)
// so a copied link or refresh reproduces the exact tab. Tab switches use
// replace-navigation: Back never walks through tab clicks. The default tab
// keeps a clean URL (param removed). Pass `validIds` when the tab set is
// static so an unrecognized/stale value falls back to the default instead
// of being trusted as-is; omit it when the call site validates dynamically.

export function useTabParam<T extends string = string>(
  defaultTab: T,
  validIds?: readonly T[],
): [T, (id: T) => void] {
  const search = useSearch();
  const [pathname, navigate] = useLocation();
  const raw = new URLSearchParams(search).get("tab");
  const isValid = raw != null && (!validIds || (validIds as readonly string[]).includes(raw));
  const tab = isValid ? (raw as T) : defaultTab;
  const setTab = useCallback(
    (id: T) => {
      const params = new URLSearchParams(search);
      if (id === defaultTab) params.delete("tab");
      else params.set("tab", id);
      const qs = params.toString();
      navigate(qs ? `${pathname}?${qs}` : pathname, { replace: true });
    },
    [search, pathname, navigate, defaultTab],
  );
  return [tab, setTab];
}

// ─── Focus deep-link param (?focus=<id>) ──────────────────────────────

export function useFocusParam(): string | null {
  const search = useSearch();
  const params = new URLSearchParams(search);
  return params.get("focus");
}

// Detects a deep-link (`?focus=<id>`) that no longer resolves to any item in
// the current data set (e.g. the report was regenerated, the cell rolled off
// the date window, or the item was deleted). Returns true only once the data
// is present but the id is absent — never while data is still loading.
export function useStaleFocus(
  focus: string | null,
  hasData: boolean,
  resolved: boolean,
): boolean {
  return Boolean(focus) && hasData && !resolved;
}

export function StaleFocusNotice({ label = "item" }: { label?: string }) {
  return (
    <div
      className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-status-warning/15 bg-status-warning/[0.03] px-3 py-1.5"
      data-testid="notice-stale-focus"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-status-warning/70 shrink-0" />
      <p className="text-body text-foreground/75 leading-none">
        Linked {label} no longer available · removed, regenerated, or outside the current range.
      </p>
    </div>
  );
}

// ─── Shared filter/sort active-state tokens ───────────────────────────
// Single source of truth for "this chip/pill is the one currently active"
// styling. Every sort-by-metric pill, filter chip, and date/window picker
// across the platform composes from these two strings instead of each
// picking its own opacity values — the actual fix for controls whose
// active state was too subtle to register as "this took effect."
// Layout (radius, padding, icon gaps) stays per-component; only the
// active/inactive color treatment is shared here.
export const PILL_ACTIVE =
  "border-primary/60 bg-primary/20 text-interactive shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]";
export const PILL_INACTIVE =
  "border-border/40 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] hover:border-border/60";

// ─── Segmented toggle ─────────────────────────────────────────────────
// Contained 2-4 option mode switch (e.g. "Avatars / Profiles",
// "Map / Pockets / Ranked") — the boxed-pill sibling of the outlined
// chip-row pattern above. Same active-state strength, different shape.
export function SegmentedToggle<T extends string>({
  options,
  active,
  onChange,
  ariaLabel,
  responsiveLabels,
}: {
  options: { id: T; label: string; Icon?: React.ComponentType<{ className?: string }> }[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** Collapse to icon-only below the sm breakpoint, for tight header rows. */
  responsiveLabels?: boolean;
}) {
  const reduced = useReducedMotion();
  // Per-instance, for the same reason TabRail's is: two toggles on one page
  // sharing a layoutId animate their pills into each other across the page.
  const pillId = `segmented-${useId()}`;
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-border/30 bg-foreground/[0.03] p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={isActive}
            // Under `sm` the label is hidden and only the icon shows; the
            // name must survive that, for assistive tech and for the
            // tooltip a pointer gets.
            aria-label={label}
            title={label}
            className={cn(
              "pressable relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-body font-medium transition-colors",
              isActive ? "text-interactive" : "text-muted-foreground/75 hover:text-foreground/80"
            )}
          >
            {/* The pill TRAVELS between options rather than blinking out of one
                and into another. In a two-to-four option switch the distance is
                short enough that a jump reads as a flicker — the eye registers
                that something changed without registering what. */}
            {isActive && (
              <motion.span
                layoutId={pillId}
                transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
                className="absolute inset-0 rounded-md bg-primary/20 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                aria-hidden
              />
            )}
            {Icon && <Icon className="relative w-3.5 h-3.5 shrink-0" />}
            <span className={cn("relative", responsiveLabels && "hidden sm:inline")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}


// ─── Date preset bar ─────────────────────────────────────────────────
// Pill selector for 7d · 14d · 28d · 90d · All time, placed below the
// ModuleHeader on analysis views. "All" uses seed totals (no API call);
// other presets re-aggregate from daily rows on the server.

export type ViewPreset = "7d" | "14d" | "28d" | "90d" | "all";
export const VIEW_PRESETS: { value: ViewPreset; label: string }[] = [
  { value: "7d",  label: "7d"  },
  { value: "14d", label: "14d" },
  { value: "28d", label: "28d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All time" },
];

export function DatePresetBar({
  value,
  onChange,
  availableWindow,
  isFetching,
}: {
  value: ViewPreset;
  onChange: (p: ViewPreset) => void;
  availableWindow?: { start: string; end: string } | null;
  isFetching?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-foreground/[0.01]">
      <span className="text-caption uppercase tracking-widest text-muted-foreground/75 shrink-0">
        Window
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {VIEW_PRESETS.map(({ value: v, label }) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={cn(
              "pressable inline-flex items-center h-6 px-2.5 rounded-md border text-caption font-medium transition-colors",
              value === v ? PILL_ACTIVE : PILL_INACTIVE
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {availableWindow && (
        <span className="text-caption text-muted-foreground/75 ml-1 tabular-nums">
          data: {availableWindow.start} – {availableWindow.end}
        </span>
      )}
      {isFetching && (
        <span className="text-caption text-muted-foreground/75 ml-1 animate-pulse">loading…</span>
      )}
    </div>
  );
}

// ─── Overview header control cluster ──────────────────────────────────
// Canvas's page-chrome header row (date-range segmented control · vs-prior
// compare · Summary/Detailed density · Export), rendered into ModuleHeader's
// `right` slot on Account Overview / Manager Overview — the two screens the
// canvas spec covers in detail. This intentionally does NOT include a Tray
// button: Topbar already renders the one real Tray affordance app-wide, so
// a second one here would duplicate it rather than reconcile it.
export function OverviewHeaderControls({
  preset,
  onPresetChange,
  isFetching,
  compareOn,
  onToggleCompare,
  detailOn,
  onToggleDetail,
  exportTo,
  availableWindow,
}: {
  preset: ViewPreset;
  onPresetChange: (p: ViewPreset) => void;
  isFetching?: boolean;
  /** Omit both to hide the "vs prior" pill (nothing on the page to compare). */
  compareOn?: boolean;
  onToggleCompare?: () => void;
  /** Omit both to hide the Summary/Detailed pill (no detail panels to fold). */
  detailOn?: boolean;
  onToggleDetail?: () => void;
  /** Route the Export button opens — the real Exports command center for this scope. */
  exportTo: string;
  /** Actual data coverage for the active window, surfaced as a tooltip on the segmented control. */
  availableWindow?: { start: string; end: string } | null;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Below lg the five chips become one select: at 390 px they pushed the
          title onto two lines under a row of controls. */}
      <label className="lg:hidden inline-flex items-center h-7 rounded-md border border-border/40 px-2 text-caption text-muted-foreground/75">
        <span className="sr-only">Date range</span>
        <select
          value={preset}
          onChange={(e) => onPresetChange(e.target.value as ViewPreset)}
          className="bg-transparent text-caption font-medium text-foreground outline-none"
          aria-label="Date range"
        >
          {VIEW_PRESETS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div
        className="hidden lg:flex items-center rounded-md border border-border/40 overflow-hidden"
        role="group"
        aria-label="Date range"
        title={availableWindow ? `Data: ${availableWindow.start} – ${availableWindow.end}` : undefined}
      >
        {VIEW_PRESETS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onPresetChange(value)}
            aria-pressed={preset === value}
            className={cn(
              "pressable h-7 px-2.5 text-caption font-medium transition-colors",
              preset === value
                ? "bg-primary/18 text-interactive"
                : "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {isFetching && <span className="text-caption text-muted-foreground/75 animate-pulse">loading…</span>}
      {onToggleCompare && (
        <button
          type="button"
          onClick={onToggleCompare}
          aria-pressed={!!compareOn}
          title="Compare each tile against the prior period of equal length"
          className={cn(
            "pressable inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-caption font-medium transition-colors",
            compareOn ? PILL_ACTIVE : PILL_INACTIVE
          )}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          vs prior
        </button>
      )}
      {onToggleDetail && (
        <button
          type="button"
          onClick={onToggleDetail}
          aria-pressed={!!detailOn}
          title={detailOn ? "Collapse this page's detail panels" : "Expand this page's detail panels"}
          className={cn(
            "pressable inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-caption font-medium transition-colors",
            detailOn ? PILL_ACTIVE : PILL_INACTIVE
          )}
        >
          <AlignLeft className="w-3.5 h-3.5" />
          {detailOn ? "Detailed" : "Summary"}
        </button>
      )}
      <button
        type="button"
        onClick={() => navigate(exportTo)}
        className="pressable inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-caption font-medium text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>
    </div>
  );
}

// ─── Data-window picker bar ───────────────────────────────────────────
// Replaces the old run-picker. Driven by actual ad_performance data via
// getAccountAnalysisDataWindows — not by manual_analysis_runs metadata.
// Accounts with ≤60 days show one date-range pill; accounts with >60 days
// get one pill per month. ECAS (and any future account) shows whatever
// date buckets actually exist in the database.

export type DataWindowSelection = { start: string; end: string };

type DataWindowItem = {
  label: string;
  start: string;
  end: string;
  spend: number;
  rows: number;
};

function windowKey(w: DataWindowItem) {
  return `${w.start}|${w.end}`;
}

export function DataWindowBar({
  windows,
  selected,
  onSelect,
  isFetching,
}: {
  windows: DataWindowItem[];
  selected: DataWindowSelection | null;
  onSelect: (w: DataWindowSelection | null) => void;
  isFetching?: boolean;
}) {
  const selectedKey = selected ? `${selected.start}|${selected.end}` : null;
  return (
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-foreground/[0.01]">
      <span className="text-caption uppercase tracking-widest text-muted-foreground/75 shrink-0">
        Period
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => onSelect(null)}
          aria-pressed={selectedKey === null}
          className={cn(
            "pressable inline-flex items-center h-6 px-2.5 rounded-md border text-caption font-medium transition-colors",
            selectedKey === null ? PILL_ACTIVE : PILL_INACTIVE,
          )}
        >
          All data
        </button>
        {windows.map((w) => {
          const key     = windowKey(w);
          const pressed = selectedKey === key;
          return (
            <button
              key={key}
              onClick={() => onSelect({ start: w.start, end: w.end })}
              aria-pressed={pressed}
              title={`${w.rows.toLocaleString()} rows · $${w.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} spend`}
              className={cn(
                "pressable inline-flex items-center h-6 px-2.5 rounded-md border text-caption font-medium transition-colors",
                pressed ? PILL_ACTIVE : PILL_INACTIVE,
              )}
            >
              {w.label}
            </button>
          );
        })}
        {windows.length === 0 && !isFetching && (
          <span className="text-caption text-muted-foreground/75 italic">No data uploaded yet</span>
        )}
      </div>
      {isFetching && (
        <span className="text-caption text-muted-foreground/75 ml-1 animate-pulse">loading…</span>
      )}
    </div>
  );
}

// ─── Impact / scope badge styles (shared across Listen + decks) ───────

export const IMPACT_STYLE: Record<string, string> = {
  high: "bg-status-danger/10 text-status-danger border-status-danger/20",
  medium: "bg-status-warning/10 text-status-warning border-status-warning/20",
  low: "bg-muted text-muted-foreground/75 border-border/40",
  setup: "bg-primary/10 text-interactive border-primary/20",
};

export const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-status-warning/10 text-status-warning border-status-warning/20",
  funnel: "bg-metrix-cyan/10 text-metrix-cyan border-metrix-cyan/20",
  placement: "bg-status-success/10 text-status-success border-status-success/20",
  mst: "bg-primary/10 text-interactive border-primary/20",
  ad_account: "bg-primary/10 text-interactive border-primary/20",
};

export function ImpactBadge({ impact }: { impact: string }) {
  return (
    <span className={cn("text-label font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", IMPACT_STYLE[impact] ?? IMPACT_STYLE.low)}>
      {impact} impact
    </span>
  );
}

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={cn("text-label font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", SCOPE_STYLE[scope] ?? "bg-muted text-muted-foreground/75 border-border/40")}>
      {scope}
    </span>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────

export function SectionCard({
  title,
  desc,
  table,
  children,
  right,
  collapsible = true,
  defaultOpen = true,
}: {
  title: string;
  desc?: string;
  table?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  /** Every module is progressively disclosable by default; pass false to pin open. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyVisible = !collapsible || open;
  const bodyId = useId();

  // The disclosure control IS the heading row, so the whole strip is one
  // button rather than a div with onClick wrapping a second button with the
  // same onClick. That shape had three problems: the div was not reachable
  // by keyboard, nothing announced it as a control, and the nested button
  // meant a click near the chevron fired one handler and a click an inch
  // left fired a different one for the same action.
  //
  // The right-hand slot stays OUTSIDE the button. It holds real controls
  // (run pickers, sliders, cross-links); nesting them inside a button is
  // invalid HTML and swallows their clicks.
  const heading = (
    <>
      {/* H2: the first real content heading under the page's H1
          (ModuleHeader) — see typography.ts's H1–H6 hierarchy doc. */}
      {/* One line, always: the head row is a strip, and a title that wraps
          pushes the module's controls under itself. `text-wrap: balance`
          on the h2 role would otherwise reflow it. */}
      <h2 className={cn(HEADING.h2, "truncate whitespace-nowrap [text-wrap:nowrap]")} title={title}>{title}</h2>
      {collapsible && (
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 shrink-0 text-muted-foreground/75",
            "transition-transform duration-150 ease-[var(--mx-ease)]",
            bodyVisible && "rotate-180"
          )}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <section className="mx-module" data-testid="section-card">
      {/* The title row lives OUTSIDE the tile, above it (owner, 2026-09-03):
          the module's authority is the heading, so it is not boxed in with
          the data it labels. Title and its collapse control left, the
          module's own controls (filters, breakdowns, metric selectors,
          cross-links) right, in one row; the rounded, bordered tile below
          holds only the data. See .mx-module-head in index.css. */}
      <div className="mx-module-head relative flex items-center gap-2 flex-wrap">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={bodyVisible}
            aria-controls={bodyId}
            aria-label={`${bodyVisible ? "Collapse" : "Expand"} section: ${title}`}
            // h-10 is the hit-area floor. The old control was a p-0.5
            // chevron, about 18px square, and the only part of the strip
            // a keyboard could reach.
            className={cn(
              "min-w-0 flex items-center gap-1.5 h-10 pl-1 pr-1.5 -ml-1 text-left rounded-md",
              "hover:bg-foreground/[0.03] active:scale-[0.99]",
              "transition-[background-color,scale] duration-150 ease-[var(--mx-ease)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
          >
            {heading}
          </button>
        ) : (
          <div className="min-w-0 flex items-center gap-1.5 h-10 pr-1">{heading}</div>
        )}
        {desc && <InfoTooltip content={desc} />}
        <div className="ml-auto shrink-0 flex items-center gap-2 flex-wrap justify-end">
          {right}
          {table && <DataSourceBadge table={table} collapsible />}
        </div>
      </div>
      {/* The body arrives and leaves with the one reveal signature.
          RevealPanel's AnimatePresence has initial={false}, so a section
          that mounts open (the default) renders instantly; only a user's
          own expand/collapse animates. This one wiring is what puts the
          motion system on every module section of every page. */}
      <RevealPanel open={bodyVisible}>
        <div id={bodyId} className="mx-card-hero relative p-3">
          {children}
        </div>
      </RevealPanel>
    </section>
  );
}

// ─── Show-more fold (cognitive-load cap for long lists) ───────────────
// Platform density rule: any unbounded card/row list shows the first N
// items and folds the rest behind an explicit "Show all …" toggle.

/** Fold state for a long list: first `limit` items visible until expanded. */
export function useShowMore<T>(items: T[], limit: number): {
  visible: T[];
  expanded: boolean;
  toggle: () => void;
  hiddenCount: number;
} {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  return {
    visible,
    expanded,
    toggle: () => setExpanded((v) => !v),
    hiddenCount: Math.max(0, items.length - limit),
  };
}

/** The companion toggle button — renders nothing when the list fits. */
export function ShowMoreButton({
  total, hiddenCount, expanded, onToggle, noun,
}: {
  total: number;
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
  noun: string;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="pressable-lg w-full flex items-center justify-center gap-1.5 py-2 mt-2 rounded-lg text-body font-medium text-muted-foreground/75 hover:text-foreground/80 hover:bg-foreground/[0.02] border border-border/25 transition-colors"
    >
      {expanded ? "Show fewer" : `Show all ${total} ${noun}`}
      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
    </button>
  );
}

// (The "Scoped to ad account" banner and header account chip were removed —
// the active ad account is shown once, in the sidebar account switcher.)

// ─── Prerequisite gate ─────────────────────────────────────────────────
// Hard gating between loop stages (e.g. Strategy requires a completed
// Analysis run). Composes *inside* ModuleScopeGate's children() so an
// unscoped/unconfigured account is still caught first. Children are a
// render function — never evaluated while the prerequisite is unmet.

export function PrerequisiteGate({
  met,
  title,
  message,
  ctaLabel,
  ctaTo,
  children,
}: {
  met: boolean;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaTo?: string;
  children: () => React.ReactNode;
}) {
  if (!met) {
    return (
      <PendingState
        title={title}
        message={message}
        icon={Lock}
        action={ctaTo && ctaLabel ? <CrossLink to={ctaTo} label={ctaLabel} /> : undefined}
      />
    );
  }
  return <>{children()}</>;
}

// ─── Loop hub (command-center stage strip) ─────────────────────────────
// Every command center renders this row: the 6 loop stages (Listen,
// Analysis, Strategy, Creative, MST, Reports), the current one highlighted,
// each a link to that stage's command center. Locked stages (prerequisite
// unmet) are visibly disabled, never hidden.
//
// Visual spec matches the Nocturne canvas's command-center stepper (a
// different spec from the checkmark-based per-account rollup rendered on
// Manager Overview via OverviewLoopHub.tsx — do not conflate the two): a numbered circle per
// stage — the number is always shown, there is no checkmark glyph on this
// stepper — filled solid for the current stage, filled dim for a stage
// already completed, transparent-with-outline for anything not yet
// reached, connected by a 1px line that lights up once a stage is behind
// you. `running`/`error`/`locked` (states the canvas mock has no concept
// of, since it doesn't model live execution) are layered on as a small
// status dot on the circle and, for `locked`, a disabled/non-clickable
// affordance — real signal preserved, structural fidelity kept.

export type LoopStageStatus = "locked" | "none" | "running" | "success" | "error";

export interface LoopStageInfo {
  id: string;
  label: string;
  to: string;
  status: LoopStageStatus;
}

export function StageLoopHub({ stages, current }: { stages: LoopStageInfo[]; current?: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center flex-wrap px-6 py-4 border-b border-border/30 bg-foreground/[0.01]">
      {stages.map((s, i) => {
        const isCurrent = s.id === current;
        const locked = s.status === "locked";
        // A stage reads as "done" once it has real success output and isn't
        // the one you're standing on — matches the canvas's done/current/
        // future three-way split while deriving "done" from real status
        // instead of screen position.
        const done = !isCurrent && s.status === "success";
        // A run in flight is flagged on the stage you are standing on too:
        // the Analysis node used to suppress its own pulse, so the one page
        // a run is started from was the one page that never showed it.
        const flagged = s.status === "running" || (!isCurrent && s.status === "error");
        return (
          <div key={s.id} className="flex items-center flex-1 min-w-[104px]">
            <button
              type="button"
              onClick={() => !locked && navigate(s.to)}
              disabled={locked}
              aria-current={isCurrent ? "step" : undefined}
              title={locked ? `${s.label} · locked` : s.label}
              className={cn("pressable group flex items-center gap-1.5", locked ? "cursor-not-allowed" : "cursor-pointer")}
            >
              <span
                className={cn(
                  "relative flex items-center justify-center w-[22px] h-[22px] shrink-0 rounded-full border text-label font-semibold tabular-nums transition-colors",
                  isCurrent
                    ? "bg-primary border-transparent text-primary-foreground"
                    : done
                      ? "bg-primary/25 border-transparent text-primary-foreground/90"
                      : "bg-transparent text-muted-foreground/75 " +
                        (locked ? "border-border/40" : "border-border/60 group-hover:border-border")
                )}
              >
                {i + 1}
                {flagged && (
                  <span
                    className={cn(
                      "absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full ring-2 ring-background",
                      s.status === "running" ? "bg-status-warning animate-pulse" : "bg-status-danger"
                    )}
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-body whitespace-nowrap transition-colors",
                  isCurrent
                    ? "text-foreground font-medium"
                    : locked
                      ? "text-muted-foreground/75"
                      : "text-muted-foreground/75 group-hover:text-foreground/80 font-normal"
                )}
              >
                {s.label}
              </span>
            </button>
            <span className={cn("flex-1 h-px mx-2.5 min-w-[12px]", done ? "bg-primary/40" : "bg-border/30")} />
          </div>
        );
      })}
    </div>
  );
}

export interface StageStatusLike {
  analysis: { status: LoopStageStatus | "none"; validated?: boolean };
  strategy: { status: LoopStageStatus | "none" };
  briefs: { status: LoopStageStatus | "none"; count: number };
  mst: { unlocked: boolean };
}

/**
 * Builds the loop row every command center renders: the six stages of
 * `LOOP_STAGES` (Listen → Analysis → Strategy → Creative → MST → Action),
 * each with its run state. Ids, labels and routes come from navTree; only
 * the status is decided here. Reports is an output of the loop, not a stage
 * of it — it stays reachable through the Outputs group and the account
 * overview's command chain, never as a loop node.
 */
export function buildLoopStages(s: StageStatusLike): LoopStageInfo[] {
  // Strategy (and downstream stages) unlock only when the analysis is
  // VALIDATED — status=success plus the server-side completeness check
  // confirming every analysis surface received data. `validated` may be
  // absent on older payloads; treat only an explicit false as "not ready".
  const analysisOk = s.analysis.status === "success" && s.analysis.validated !== false;
  const strategyOk = s.strategy.status === "success";
  const statusById: Record<string, LoopStageStatus> = {
    // Listen has no prerequisite and no discrete "done" state to reach —
    // it's a continuous signal-monitoring surface (real data, ListenCommandCenter)
    // rather than a completable pipeline step, so it's always reachable
    // and never reports "success"/"locked".
    listen: "none",
    analysis: s.analysis.status as LoopStageStatus,
    strategy: analysisOk ? (s.strategy.status as LoopStageStatus) : "locked",
    creative: strategyOk ? (s.briefs.status as LoopStageStatus) : "locked",
    mst: s.mst.unlocked ? "none" : "locked",
    // The queue renders the loop's recommendations, which exist only once
    // an analysis has validated; like Listen it has no run of its own.
    action: analysisOk ? "none" : "locked",
  };
  return LOOP_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    to: stage.to,
    status: statusById[stage.id] ?? "none",
  }));
}

/**
 * Slim informational banner shown when there is no live Meta connection.
 * Renders null when `hasMetaConnection` is true so it disappears cleanly.
 */
export function ConnectionNudgeBanner({ hasMetaConnection }: { hasMetaConnection: boolean }) {
  const [, navigate] = useLocation();
  if (hasMetaConnection) return null;
  return (
    <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-lg border border-border/40 bg-foreground/[0.03] px-4 py-2.5 text-caption text-muted-foreground/80">
      <Plug className="w-3.5 h-3.5 shrink-0 text-muted-foreground/75" />
      <span className="flex-1">Connect Meta in Settings to enable live data refresh.</span>
      <button
        onClick={() => navigate("/app/settings/integrations")}
        className="pressable shrink-0 text-interactive hover:text-interactive/80 font-medium transition-colors"
      >
        Go to Integrations
        <ArrowRight className="inline w-3 h-3 ml-1" />
      </button>
    </div>
  );
}
