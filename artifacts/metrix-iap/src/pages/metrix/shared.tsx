// ─── Shared building blocks for seed-hydrated Metrix pages ────────────
//
// Verbosity rulebook — platform-wide content consolidation:
// • FIRST-LAYER RULE: no full sentences on the primary dashboard layer.
//   Cards/lists show concise, high-impact labels only; sentence prose moves
//   behind <DetailReveal> — a click/tap/keyboard popover with an always-
//   visible info affordance. Derive labels mechanically with deriveLabel()
//   (first clause, word-boundary cut) — never invent new copy.
// • Inside <button> cards whose full text lives in a drawer/modal: clamp with
//   CSS `line-clamp-N` (nested buttons are invalid HTML, so no DetailReveal
//   or roll-downs there) and let the drawer carry the prose.
// • Second-layer surfaces (drawers, modals, expanded detail sections) keep
//   full prose; use <DenseText> there if clamping is still needed —
//   <ExpandableText>/<ClampedProse> are legacy aliases over it.
// • Data caveats / honesty disclaimers: <CaveatNote> (collapsible amber pill,
//   optional `source` badge).
// • Metric definitions and methodology asides: <InfoTooltip>.
// • Drawers (InfoDrawer/DrawerField) and modals may show full-length prose.
//
// Typography roles — import { TYPE } from "./typography":
// • TYPE.microLabel 9px mono uppercase micro index/eyebrow labels (below
//   TYPE.label — e.g. "Spend"/"Results" strip labels, run-scope captions)
// • TYPE.label   10px uppercase eyebrow/section labels
// • TYPE.title   14px BOLD card/list titles — bold is the one enforced
//   title weight platform-wide (matches SectionCard's own <h3>)
// • TYPE.body    12px primary prose in cards/tiles
// • TYPE.caption 11px secondary/meta prose
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

import { useState } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useLocation, useSearch } from "wouter";
import { ConnectMetaDialog, ManualImportDialog } from "./ConnectAccountDialogs";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { useListManualImports } from "@workspace/api-client-react";
import { Plug, FileUp, Clock, Database, Info, ArrowRight, ArrowLeftRight, CheckSquare, CheckCircle2, Square, CalendarRange, CalendarX2, AlertTriangle, ChevronDown, ChevronLeft, Sparkles, Map as MapIcon, Lock, Circle, Loader2, CircleCheck, CircleX, Venus, Mars } from "lucide-react";
import { useDateRange, formatIsoRange } from "@/contexts/DateRangeContext";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/command-deck/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import { resolveVariableLabel } from "@/lib/variable-registry";
import { normalizeConfidence } from "@/lib/normalize";
import { TYPE } from "./typography";
import type { AdAccount } from "@/lib/data/seedTypes";

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
            className="inline-flex items-center justify-center shrink-0 cursor-default text-muted-foreground/35 hover:text-muted-foreground/65 transition-colors"
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
            className="inline-flex items-center justify-center shrink-0 text-muted-foreground/45 hover:text-muted-foreground/80 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-left leading-relaxed text-caption whitespace-normal">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Resolve a raw variable code — including compound "A + B" stacks — to labels. */
export function readableVariables(code: string | null | undefined): string {
  if (!code) return "—";
  return code
    .split(/\s*\+\s*/)
    .map((c) => resolveVariableLabel(c.trim()))
    .join(" + ");
}

// ─── Formatting ───────────────────────────────────────────────────────

export function fmtUSD(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Human-readable label for a Meta result event key. */
export const EVENT_LABEL: Record<string, string> = {
  "Website registrations completed": "Registrations",
  "Website trials started": "Trials",
  "Website purchases": "Purchases",
  onb_initiate_checkout: "Checkouts",
};

export function eventLabel(key: string): string {
  return EVENT_LABEL[key] ?? key;
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

  const match = dominant ? RESULT_NOUNS.find(([re]) => re.test(dominant)) : undefined;
  const singular = match?.[1] ?? "result";
  const plural = match?.[2] ?? "results";
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
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-400/15 text-rose-300 shrink-0"
      >
        <Venus className="w-3 h-3" />
      </span>
    );
  }
  if (g === "male") {
    return (
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-400/15 text-blue-300 shrink-0"
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
      ? "bg-red-400/10 text-red-300 border-red-400/20"
      : c.level === "high"
        ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
        : v.includes("validation") || v.includes("required")
          ? "bg-[#16d9ff]/10 text-[#62e6ff] border-[#16d9ff]/20"
          : c.level === "directional"
            ? "bg-purple-400/10 text-purple-300 border-purple-400/20"
            : c.level === "medium"
              ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
              : "bg-muted text-muted-foreground/60 border-border/40";
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

const SECTION_TABS: Record<"analysis" | "strategy", { label: string; to: string }[]> = {
  analysis: [
    { label: "Overview",       to: "/app/analysis/overview" },
    { label: "IAP Library",    to: "/app/analysis/library" },
    { label: "Audience",       to: "/app/analysis/audience" },
    { label: "Placements",     to: "/app/analysis/placements" },
    { label: "Budget Insight", to: "/app/analysis/budget" },
  ],
  strategy: [
    { label: "Overview",          to: "/app/strategy/overview" },
    { label: "Strategy Map",      to: "/app/strategy/map" },
    { label: "Avatars / ICP",     to: "/app/strategy/avatars" },
    { label: "Hypothesis Queue",  to: "/app/strategy/hypotheses" },
  ],
};

export function SectionTabBar({ section }: { section: "analysis" | "strategy" }) {
  const [location] = useLocation();
  const tabs = SECTION_TABS[section];
  return (
    <div className="flex items-center gap-0.5 px-4 border-b border-border/40 overflow-x-auto shrink-0 bg-white/[0.008]">
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
                : "text-muted-foreground/55 hover:text-foreground/80 hover:bg-white/[0.04]"
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
  account,
}: {
  section: string;
  title: string;
  subtitle?: string;
  table?: string;
  right?: React.ReactNode;
  tabs?: "analysis" | "strategy";
  account?: AdAccount;
}) {
  const sectionLabel = section.split(" · ")[0];
  return (
    <div className="shrink-0">
      <div className={cn("px-6 py-4", !tabs && "border-b border-border/40")}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 mx-section-header">
            <div className="flex items-center gap-1.5">
              <span className="mx-section-header__eyebrow">{sectionLabel}</span>
              {subtitle && <InfoTooltip content={subtitle} />}
            </div>
            <h1 className="mx-section-header__title">{title}</h1>
          </div>
          <div className="shrink-0 pt-0.5 flex items-center gap-2">
            {account && (
              <span
                data-testid="banner-scope"
                className="hidden sm:inline-flex items-center gap-1.5 text-caption text-muted-foreground/65"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0" />
                <span className="font-medium text-foreground/80 truncate max-w-[140px]">{account.name}</span>
              </span>
            )}
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
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-white/[0.01]">
      {compare && compareRange && (
        <span className="inline-flex items-center gap-1 text-caption text-interactive/80 tabular-nums">
          <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
          vs {formatIsoRange(compareRange)}
        </span>
      )}
      {narrowed && (
        <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground/65">
          Flight-window scope
          <InfoTooltip content={grainNote ?? "Items are included when their flight window overlaps this range; metrics cover each item's full flight — this import has no daily grain."} />
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
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
        <CalendarX2 className="w-4 h-4 text-muted-foreground/60" />
      </div>
      <p className="text-callout font-semibold text-foreground/80">No {what} in this range</p>
      <p className="text-body text-muted-foreground/70 max-w-xs">
        {detail ?? (range ? `The selected range (${formatIsoRange(range)}) is outside this data's available window.` : "No dated data is available.")}
      </p>
      <button
        onClick={() => setPreset("all")}
        className="text-body font-semibold text-primary-foreground bg-primary border border-primary hover:bg-primary/90 rounded-md px-3.5 py-2 transition-colors shadow-md shadow-primary/25"
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

export function CaveatNote({
  text,
  source,
  defaultExpanded = false,
}: {
  text: string;
  source?: string;
  defaultExpanded?: boolean;
}) {
  const THRESHOLD = 110;
  const isLong = text.length > THRESHOLD;
  const [expanded, setExpanded] = useState(defaultExpanded || !isLong);
  const preview = isLong ? text.slice(0, THRESHOLD).trimEnd() + "…" : text;

  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] overflow-hidden">
      <button
        onClick={isLong ? () => setExpanded((v) => !v) : undefined}
        disabled={!isLong}
        className={cn(
          "w-full flex items-start gap-2 px-3 py-2 text-left",
          isLong && "hover:bg-amber-400/[0.05] active:bg-amber-400/[0.08] transition-colors"
        )}
      >
        <Info className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          {source && (
            <span className="text-label font-mono uppercase tracking-widest text-amber-400/65 block mb-0.5">
              {source}
            </span>
          )}
          <p className="text-body text-amber-400/90 leading-snug">
            {expanded ? text : preview}
          </p>
        </div>
        {isLong && (
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-amber-400/40 shrink-0 mt-1 transition-transform duration-150",
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
  threshold?: number;
}) {
  const isLong = text.length > threshold;
  const [expanded, setExpanded] = useState(false);
  const content = render ? render(text) : text;
  if (!isLong) return <p className={className}>{content}</p>;
  return (
    <div className="min-w-0">
      <p className={cn(className, !expanded && clampClass)}>{content}</p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-0.5 inline-flex items-center gap-0.5 text-label font-semibold text-interactive/80 hover:text-interactive transition-colors"
      >
        {expanded ? "Less" : "More"}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", expanded && "rotate-180")} />
      </button>
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
}) {
  const content = sections.filter((s) => (s.text ?? "").trim() || s.render);
  if (content.length === 0) {
    return <span className={cn(labelClassName ?? TYPE.body, "block min-w-0", className)}>{label}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          data-testid={testId}
          className={cn(
            "group inline-flex items-start gap-1.5 text-left min-w-0 max-w-full rounded-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            className
          )}
        >
          <span className={cn(labelClassName ?? TYPE.body, "min-w-0 group-hover:text-foreground transition-colors")}>
            {label}
          </span>
          <Info
            aria-hidden
            className="w-3.5 h-3.5 shrink-0 mt-1 text-muted-foreground/45 group-hover:text-interactive/80 transition-colors"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        collisionPadding={12}
        className="w-[380px] max-w-[min(90vw,420px)] max-h-[min(60vh,480px)] overflow-y-auto p-4 space-y-3 border-border/60 bg-popover/95 backdrop-blur-sm"
      >
        {eyebrow && (
          <div className="text-label font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{eyebrow}</div>
        )}
        {content.map((s, i) => (
          <div key={i} className="space-y-1">
            {s.label && (
              <div className="text-label font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">{s.label}</div>
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
    <div className="rounded-xl border border-border/30 bg-white/[0.02] overflow-hidden">
      {/* Header + fraction */}
      <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
        <span className={cn(TYPE.label, allComplete ? "text-emerald-400/70" : "text-muted-foreground/50")}>
          {allComplete ? "Loop complete" : "Setup progress"}
        </span>
        <div className="flex-1 h-px bg-border/20" />
        <span className="text-label font-mono tabular-nums text-muted-foreground/40">{doneCount}/{steps.length}</span>
      </div>

      {/* Completion banner — shown when all steps are done */}
      {allComplete ? (
        <div className="px-3 py-2.5 border-b border-border/15">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className={cn(TYPE.caption, "text-emerald-400/90 font-semibold leading-none")}>Loop complete ✓</span>
          </div>
          <p className={cn(TYPE.caption, "text-muted-foreground/55 leading-snug mb-2")}>
            All stages finished. Ready for the next re-run cycle.
          </p>
          <a
            href="/app/settings/account"
            onClick={(e) => { e.preventDefault(); navigate("/app/settings/account"); }}
            className="inline-flex items-center gap-1 text-label font-semibold text-interactive/80 hover:text-interactive transition-colors"
          >
            Start re-run <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      ) : (
        /* Progress bar — only shown when at least one step is done */
        doneCount > 0 && (
          <div className="px-3 pt-2 pb-0">
            <div className="h-0.5 rounded-full bg-border/30 overflow-hidden">
              <div
                className="h-full bg-emerald-400/50 rounded-full transition-all"
                style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
              />
            </div>
          </div>
        )
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
              isAction && !allComplete ? "hover:bg-white/[0.03] transition-colors cursor-pointer" : "cursor-default",
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
              step.done
                ? "text-emerald-400"
                : isNext
                  ? "border border-primary/50 bg-primary/[0.08]"
                  : "border border-border/35 bg-white/[0.02]",
            )}>
              {step.done
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : isNext
                  ? <ArrowRight className="w-2.5 h-2.5 text-interactive/70" />
                  : <span className="text-label font-bold text-muted-foreground/30 tabular-nums leading-none">{i + 1}</span>
              }
            </div>
            <span className={cn(
              TYPE.caption, "leading-none",
              step.done
                ? "text-foreground/35 line-through"
                : isNext
                  ? "text-foreground/75 font-semibold"
                  : "text-muted-foreground/45",
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
        { label: "Map creative assets", done: creativesMapped, route: "/app/settings/account" },
        { label: "Run analysis", done: false, route: "/app/settings/account" },
      ]
    : [
        { label: "Connect data source", done: false, onClick: () => setConnectOpen(true) },
        { label: "Run analysis", done: false, route: "/app/settings/account" },
        { label: "Generate strategy", done: false, route: "/app/strategy/overview" },
        { label: "Generate briefs", done: false, route: "/app/briefs/builder" },
      ];

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-6">
      <div className="max-w-sm w-full space-y-5">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
            <Plug className="w-5 h-5 text-muted-foreground/60" />
          </div>
          <h2 className="text-base font-semibold text-foreground">{s?.title ?? "Get started with " + account.name}</h2>
          <p className="text-caption text-muted-foreground/60 leading-relaxed">
            {s?.description ?? (isManual
              ? "Upload your Meta CSV exports, then run analysis to see performance data."
              : "Connect a data source, then follow the setup checklist below.")}
          </p>
        </div>

        {/* Guided setup checklist — first actionable step opens its dialog inline */}
        <LoopChecklist steps={setupSteps} />

        {/* Switch account */}
        <div className="text-center space-y-1.5">
          <p className="text-caption font-semibold uppercase tracking-widest text-muted-foreground/40">
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
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/60" />
      </div>
      <div className="flex items-center gap-1.5">
        <p className="text-callout font-semibold text-foreground/80">{title}</p>
        {message && <InfoTooltip content={message} />}
      </div>
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
      className={cn("animate-pulse rounded-md bg-white/[0.06]", className)}
    />
  );
}

/** A row of evenly-sized shimmer tiles that matches the metric tile grid. */
export function SkeletonTileRow({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/30 bg-white/[0.02] px-3 py-2.5 space-y-2">
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
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  onClick?: () => void;
  variant?: "primary" | "default";
}) {
  const isPrimary = variant === "primary";
  const labelCls = isPrimary
    ? cn(TYPE.microLabel, "text-muted-foreground/65 mb-1.5 truncate")
    : cn(TYPE.microLabel, "text-muted-foreground/40 mb-2 truncate");

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mx-kpi-tile p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.04] text-left w-full group/tile relative",
          isPrimary && "border-primary/35 bg-primary/[0.03]"
        )}
        title="Open segment breakdown for this metric"
      >
        {isPrimary && <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />}
        <div className="relative z-10">
          <div className={cn(labelCls, "group-hover/tile:text-interactive/70 transition-colors")}>{label}</div>
          <div className="text-bignum font-bold text-foreground metric-num leading-none tracking-[-0.035em]">{value}</div>
          {sub && <div className="text-caption text-muted-foreground/65 mt-2 leading-snug line-clamp-2">{sub}</div>}
          <div className="mt-2 text-[8px] font-mono uppercase tracking-wider text-interactive/0 group-hover/tile:text-interactive/50 transition-colors">Segment breakdown →</div>
        </div>
      </button>
    );
  }
  return (
    <div className={cn(
      "mx-kpi-tile p-4 transition-colors group-hover:border-primary/30 relative",
      isPrimary && "border-primary/35 bg-primary/[0.03]"
    )}>
      {isPrimary && <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-primary/55 pointer-events-none" />}
      <div className="relative z-10">
        <div className={labelCls}>{label}</div>
        <div className="text-bignum font-bold text-foreground metric-num leading-none tracking-[-0.035em]">{value}</div>
        {sub && <div className="text-caption text-muted-foreground/65 mt-2 leading-snug line-clamp-2">{sub}</div>}
      </div>
    </div>
  );
}

// ─── In-page module tabs (sub-navigation) ────────────────────────────
// Restores the layered feel inside a module without URL sub-routes.

export function ModuleTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number; Icon?: React.ComponentType<{ className?: string }> }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="px-6 border-b border-border/40 flex items-center gap-0 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 h-10 px-3 text-title font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            active === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground/70 hover:text-foreground"
          )}
        >
          {t.Icon && <t.Icon className="w-3.5 h-3.5" />}
          {t.label}
          {t.count != null && <span className="text-label font-mono text-muted-foreground/60">{t.count}</span>}
        </button>
      ))}
    </div>
  );
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
        {renderHeader && <ModuleHeader section={section} title={title} />}
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
      className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-primary/12 border border-primary/30 text-interactive hover:bg-primary/20 hover:border-primary/50 transition-all shadow-sm shadow-primary/5"
    >
      {label}
      {srNote && <span className="sr-only">{` — ${srNote}`}</span>}
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
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
        "inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border transition-all",
        variant === "primary"
          ? "bg-primary text-white border-primary hover:bg-primary/90 shadow-md shadow-primary/25 hover:shadow-primary/35"
          : "bg-white/[0.07] border-border/55 text-foreground/90 hover:bg-white/[0.11] hover:text-foreground hover:border-border/75 shadow-sm",
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

/** Returns the back-navigation URL for a given origin param set. */
function backUrl(fp: FromParams): string | null {
  if (fp.from === "analysis") {
    return fp.fromCell ? `/app/analysis/library?focus=${fp.fromCell}` : "/app/analysis/library";
  }
  if (fp.from === "strategy") {
    return fp.fromHyp ? `/app/strategy/hypotheses?focus=${fp.fromHyp}` : "/app/strategy/map";
  }
  return null;
}

function backLabel(fp: FromParams): string {
  if (fp.from === "analysis") return fp.fromCell ? `Back to cell ${fp.fromCell}` : "Back to Analysis";
  if (fp.from === "strategy") return fp.fromHyp ? "Back to Hypothesis" : "Back to Strategy";
  return "Back";
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
      className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground/60 hover:text-foreground/80 transition-colors"
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
  const fp = { from, fromCell, fromHyp };
  const url = backUrl(fp);
  if (!url) return null;

  const origin =
    from === "analysis" ? (fromCell ? `Analysis · ${fromCell}` : "Analysis · IAP Library")
    : from === "strategy" ? (fromHyp ? `Strategy · ${fromHyp}` : "Strategy Map")
    : null;

  if (!origin) return null;

  return (
    <div className="px-6 py-1.5 border-b border-border/20 bg-white/[0.01] flex items-center gap-1.5">
      <button
        onClick={() => navigate(url)}
        className="inline-flex items-center gap-1 text-label font-medium text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        {origin}
      </button>
      <span className="text-muted-foreground/30 text-label">/</span>
      <span className="text-label text-muted-foreground/50">This page</span>
    </div>
  );
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
      className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-amber-400/15 bg-amber-400/[0.03] px-3 py-1.5"
      data-testid="notice-stale-focus"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
      <p className="text-body text-foreground/75 leading-none">
        Linked {label} no longer available — removed, regenerated, or outside the current range.
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
  "border-primary/60 bg-primary/20 text-interactive shadow-[0_0_0_1px_rgba(92,155,255,0.15)]";
export const PILL_INACTIVE =
  "border-border/40 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04] hover:border-border/60";

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
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-border/30 bg-white/[0.03] p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-body font-medium transition-colors",
              isActive
                ? "bg-primary/20 text-interactive shadow-[0_0_0_1px_rgba(92,155,255,0.15)]"
                : "text-muted-foreground/60 hover:text-foreground/80"
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span className={responsiveLabels ? "hidden sm:inline" : undefined}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Metric selection bar ─────────────────────────────────────────────
// Result-event metric selection used to filter Analysis views.

export function MetricSelectionBar({
  events,
  isSelected,
  onToggle,
}: {
  events: string[];
  isSelected: (event: string) => boolean;
  onToggle: (event: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-6 py-2.5 border-b border-border/30 bg-white/[0.01]">
      <span className="text-caption font-mono uppercase tracking-widest text-muted-foreground/70">
        Metric selection
      </span>
      {events.map((e) => {
        const on = isSelected(e);
        return (
          <button
            key={e}
            onClick={() => onToggle(e)}
            aria-pressed={on}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-body font-medium transition-colors",
              on ? PILL_ACTIVE : PILL_INACTIVE
            )}
          >
            {on ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            {eventLabel(e)}
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
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-white/[0.01]">
      <span className="text-caption font-mono uppercase tracking-widest text-muted-foreground/70 shrink-0">
        Window
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {VIEW_PRESETS.map(({ value: v, label }) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={cn(
              "inline-flex items-center h-6 px-2.5 rounded-md border text-caption font-medium transition-colors",
              value === v ? PILL_ACTIVE : PILL_INACTIVE
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {availableWindow && (
        <span className="text-caption text-muted-foreground/40 ml-1 tabular-nums">
          data: {availableWindow.start} – {availableWindow.end}
        </span>
      )}
      {isFetching && (
        <span className="text-caption text-muted-foreground/50 ml-1 animate-pulse">loading…</span>
      )}
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
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-white/[0.01]">
      <span className="text-caption font-mono uppercase tracking-widest text-muted-foreground/70 shrink-0">
        Period
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => onSelect(null)}
          aria-pressed={selectedKey === null}
          className={cn(
            "inline-flex items-center h-6 px-2.5 rounded-md border text-caption font-medium transition-colors",
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
                "inline-flex items-center h-6 px-2.5 rounded-md border text-caption font-medium transition-colors",
                pressed ? PILL_ACTIVE : PILL_INACTIVE,
              )}
            >
              {w.label}
            </button>
          );
        })}
        {windows.length === 0 && !isFetching && (
          <span className="text-caption text-muted-foreground/40 italic">No data uploaded yet</span>
        )}
      </div>
      {isFetching && (
        <span className="text-caption text-muted-foreground/50 ml-1 animate-pulse">loading…</span>
      )}
    </div>
  );
}

// ─── Impact / scope badge styles (shared across Listen + decks) ───────

export const IMPACT_STYLE: Record<string, string> = {
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
  setup: "bg-primary/10 text-interactive border-primary/20",
};

export const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  funnel: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  placement: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  mst: "bg-purple-500/10 text-purple-300 border-purple-500/20",
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
    <span className={cn("text-label font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", SCOPE_STYLE[scope] ?? "bg-muted text-muted-foreground/60 border-border/40")}>
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
  return (
    <section className="mx-card-hero overflow-hidden">
      <div
        className={cn(
          "mx-accent-bar relative flex items-center gap-2 px-3.5 py-2 border-b border-[rgba(120,170,255,0.12)]",
          collapsible && "cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        )}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-title font-bold text-foreground leading-tight">{title}</h3>
          {desc && (
            <p className="text-label text-muted-foreground/50 leading-snug mt-0.5 line-clamp-1">{desc}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {right}
          {table && <DataSourceBadge table={table} collapsible />}
          {collapsible && (
            <button
              type="button"
              aria-label={bodyVisible ? "Collapse section" : "Expand section"}
              aria-expanded={bodyVisible}
              onClick={() => setOpen((v) => !v)}
              className="p-0.5 rounded hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground/40 transition-transform",
                  bodyVisible && "rotate-180"
                )}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
      {bodyVisible && <div className="relative p-3">{children}</div>}
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
      className="w-full flex items-center justify-center gap-1.5 py-2 mt-2 rounded-lg text-body font-medium text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/[0.02] border border-border/25 transition-colors"
    >
      {expanded ? "Show fewer" : `Show all ${total} ${noun}`}
      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
    </button>
  );
}

// ─── Scope banner (which ad account a module is reading) ──────────────

export function ScopeBanner({ account }: { account: AdAccount }) {
  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b border-border/30 bg-white/[0.015]">
      <Database className="w-3 h-3 text-muted-foreground/60 shrink-0" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Scoped to ad account</span>
      <span className="text-[12px] font-medium text-foreground/90">{account.name}</span>
      <span className="text-[10px] font-mono text-muted-foreground/70">{account.platform}</span>
    </div>
  );
}

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
// Every command center renders this row: the 6 loop stages, the current
// one highlighted, each a link to that stage's command center. Locked
// stages (prerequisite unmet) are visibly disabled, never hidden.

export type LoopStageStatus = "locked" | "none" | "running" | "success" | "error";

export interface LoopStageInfo {
  id: string;
  label: string;
  to: string;
  status: LoopStageStatus;
}

const STAGE_DOT: Record<LoopStageStatus, React.ComponentType<{ className?: string }>> = {
  locked: Lock,
  none: Circle,
  running: Loader2,
  success: CircleCheck,
  error: CircleX,
};

const STAGE_DOT_CLASS: Record<LoopStageStatus, string> = {
  locked: "text-muted-foreground/40",
  none: "text-muted-foreground/50",
  running: "text-amber-400 animate-spin",
  success: "text-emerald-400",
  error: "text-red-400",
};

export function StageLoopHub({ stages, current }: { stages: LoopStageInfo[]; current?: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center gap-1 flex-wrap px-6 py-3 border-b border-border/30 bg-white/[0.01]">
      {stages.map((s, i) => {
        const Dot = STAGE_DOT[s.status];
        const isCurrent = s.id === current;
        const locked = s.status === "locked";
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/25 shrink-0 mx-0.5" />}
            <button
              onClick={() => !locked && navigate(s.to)}
              disabled={locked}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] font-medium transition-colors",
                isCurrent
                  ? "border-primary/40 bg-primary/10 text-interactive"
                  : locked
                    ? "border-border/25 text-muted-foreground/40 cursor-not-allowed"
                    : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03]"
              )}
            >
              <Dot className={cn("w-3 h-3 shrink-0", STAGE_DOT_CLASS[s.status])} />
              {s.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export interface StageStatusLike {
  analysis: { status: LoopStageStatus | "none" };
  strategy: { status: LoopStageStatus | "none" };
  briefs: { status: LoopStageStatus | "none"; count: number };
  mst: { unlocked: boolean };
}

/** Builds the 5-stage Analysis→Strategy→Creative→MST→Reports row every command center renders. */
export function buildLoopStages(s: StageStatusLike): LoopStageInfo[] {
  const analysisOk = s.analysis.status === "success";
  const strategyOk = s.strategy.status === "success";
  return [
    { id: "analysis", label: "Analysis", to: "/app/analysis", status: s.analysis.status as LoopStageStatus },
    { id: "strategy", label: "Strategy", to: "/app/strategy", status: analysisOk ? (s.strategy.status as LoopStageStatus) : "locked" },
    { id: "creative", label: "Creative", to: "/app/creative", status: strategyOk ? (s.briefs.status as LoopStageStatus) : "locked" },
    { id: "mst", label: "MST", to: "/app/mst", status: s.mst.unlocked ? "none" : "locked" },
    { id: "reports", label: "Reports", to: "/app/reports", status: analysisOk ? "none" : "locked" },
  ];
}

/**
 * Slim informational banner shown when there is no live Meta connection.
 * Renders null when `hasMetaConnection` is true so it disappears cleanly.
 */
export function ConnectionNudgeBanner({ hasMetaConnection }: { hasMetaConnection: boolean }) {
  const [, navigate] = useLocation();
  if (hasMetaConnection) return null;
  return (
    <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-lg border border-border/40 bg-white/[0.03] px-4 py-2.5 text-sm text-muted-foreground/80">
      <Plug className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
      <span className="flex-1">Connect Meta in Settings to enable live data refresh.</span>
      <button
        onClick={() => navigate("/app/settings/integrations")}
        className="shrink-0 text-interactive hover:text-interactive/80 font-medium transition-colors"
      >
        Go to Integrations
        <ArrowRight className="inline w-3 h-3 ml-1" />
      </button>
    </div>
  );
}
