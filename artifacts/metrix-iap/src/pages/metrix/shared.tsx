// ─── Shared building blocks for seed-hydrated Metrix pages ────────────

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";
import { ConnectMetaDialog, ManualImportDialog } from "./ConnectAccountDialogs";
import { InlineAccountPicker } from "@/components/layout/InlineAccountPicker";
import { Plug, FileUp, Clock, Database, Info, ArrowRight, CheckSquare, Square, CalendarRange, CalendarX2, AlertTriangle, ChevronDown, ChevronLeft, Sparkles, Map as MapIcon } from "lucide-react";
import { useDateRange, formatIsoRange } from "@/contexts/DateRangeContext";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { resolveVariableLabel } from "@/lib/variable-registry";
import type { AdAccount } from "@/lib/data/seedTypes";

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
  "Website registrations completed": "Registrations completed",
  "Website trials started": "Trials started",
  "Website purchases": "Purchases",
  onb_initiate_checkout: "Checkouts initiated",
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
  if (!dominant) {
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
  if (!dominant) {
    dominant = iap?.campaign_summary?.campaign_windows?.find((w) => w.result_type)?.result_type ?? null;
  }

  const match = dominant ? RESULT_NOUNS.find(([re]) => re.test(dominant)) : undefined;
  const singular = match?.[1] ?? "result";
  const plural = match?.[2] ?? "results";
  return { singular, plural, Singular: capitalize(singular), Plural: capitalize(plural) };
}

// ─── Confidence badge ─────────────────────────────────────────────────

export function ConfidenceBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const cls = v.includes("high")
    ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
    : v.includes("validation") || v.includes("required")
      ? "bg-blue-400/10 text-blue-300 border-blue-400/20"
      : v.includes("directional")
        ? "bg-purple-400/10 text-purple-300 border-purple-400/20"
        : v.includes("medium")
          ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
          : "bg-muted text-muted-foreground/60 border-border/40";
  return (
    <span className={cn("inline-flex text-[10px] font-semibold border px-1.5 py-0.5 rounded leading-none", cls)}>
      {value}
    </span>
  );
}

// ─── Page header ──────────────────────────────────────────────────────

export function ModuleHeader({
  section,
  title,
  subtitle,
  table,
  right,
}: {
  section: string;
  title: string;
  subtitle?: string;
  table?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-4 border-b border-border/40">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <span className="block mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">{section}</span>
          <h1 className="text-[21px] font-bold text-foreground leading-tight tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted-foreground/80 mt-1 leading-relaxed max-w-2xl">{subtitle}</p>}
        </div>
        <div className="shrink-0 pt-0.5 flex items-center gap-2">
          {right}
          {table && <DataSourceBadge table={table} collapsible />}
        </div>
      </div>
    </div>
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

// ─── Date-range scope bar ─────────────────────────────────────────────
// Standard strip under the scope banner: shows the active global range,
// and is explicit about grain — flight-window aggregates, no daily rows.

export function RangeScopeBar({ grainNote }: { grainNote?: string }) {
  const { range, bounds, preset, compare, compareRange } = useDateRange();
  if (!range || !bounds) return null;
  const narrowed = preset !== "all";
  return (
    <div className="flex items-center gap-2 flex-wrap px-6 py-2 border-b border-border/30 bg-white/[0.01]">
      <CalendarRange className="w-3 h-3 text-muted-foreground/60 shrink-0" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Date range</span>
      <span className="text-[12px] font-medium text-foreground/90 tabular-nums">{formatIsoRange(range)}</span>
      {compare && compareRange && (
        <span className="text-[11px] text-primary/80 tabular-nums">vs {formatIsoRange(compareRange)}</span>
      )}
      {narrowed && (
        <span className="text-[11px] text-muted-foreground/65">
          {grainNote ?? "Items are included when their flight window overlaps this range; metrics cover each item's full flight — this import has no daily grain."}
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
      <p className="text-[15px] font-semibold text-foreground/80">No {what} in this range</p>
      <p className="text-[12px] text-muted-foreground/70 max-w-xs">
        {detail ?? (range ? `The selected range (${formatIsoRange(range)}) is outside this data's available window.` : "No dated data is available.")}
      </p>
      <button
        onClick={() => setPreset("all")}
        className="text-[12px] font-medium text-primary border border-primary/30 bg-primary/10 hover:bg-primary/15 rounded-md px-3 py-1.5 transition-colors"
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
        <Info className="w-3 h-3 text-amber-400/70 shrink-0 mt-[3px]" />
        <div className="flex-1 min-w-0">
          {source && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/65 block mb-0.5">
              {source}
            </span>
          )}
          <p className="text-[12px] text-amber-400/90 leading-snug">
            {expanded ? text : preview}
          </p>
        </div>
        {isLong && (
          <ChevronDown
            className={cn(
              "w-3 h-3 text-amber-400/40 shrink-0 mt-[3px] transition-transform duration-150",
              expanded && "rotate-180"
            )}
          />
        )}
      </button>
    </div>
  );
}

// ─── Unconfigured / pending states ────────────────────────────────────

export function UnconfiguredState({ account }: { account: AdAccount }) {
  const s = account.overview_state;
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  return (
    <div className="flex-1 flex items-center justify-center py-20 px-6">
      <div className="max-w-md text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto">
          <Plug className="w-6 h-6 text-muted-foreground/70" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[18px] font-semibold text-foreground">{s?.title ?? "Connect Meta Ad Account"}</h2>
          <p className="text-[13px] text-muted-foreground/70 leading-relaxed">
            {account.name} has no connected data yet. Connect the ad account or add a manual import to begin.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setConnectOpen(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-[13px] font-medium text-primary hover:bg-primary/25 transition-colors"
          >
            <Plug className="w-3.5 h-3.5" /> {s?.primary_action ?? "Connect Meta Ad Account"}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-border/50 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" /> {s?.secondary_action ?? "Add Manual Import"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          No performance, analysis, or report data is shown until this account is configured.
        </p>
        <div className="pt-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/75">
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

export function PendingState({ title, message, icon: Icon = Clock, action }: { title: string; message: string; icon?: React.ComponentType<{ className?: string }>; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/60" />
      </div>
      <p className="text-[15px] font-semibold text-foreground/80">{title}</p>
      <p className="text-[12px] text-muted-foreground/70 max-w-xs">{message}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────
// When the tile is placed inside a `group` button, border lifts on hover.

export function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mx-card p-4 transition-colors group-hover:border-primary/30 group-hover:bg-primary/[0.02]">
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">{label}</div>
        <div className="text-[26px] font-bold text-foreground tabular-nums leading-none tracking-[-0.035em]">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground/65 mt-2 leading-snug">{sub}</div>}
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
            "flex items-center gap-1.5 h-10 px-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            active === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground/70 hover:text-foreground"
          )}
        >
          {t.Icon && <t.Icon className="w-3 h-3" />}
          {t.label}
          {t.count != null && <span className="text-[10px] font-mono text-muted-foreground/60">{t.count}</span>}
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
  children,
}: {
  section: string;
  title: string;
  account: AdAccount | null;
  children: () => React.ReactNode;
}) {
  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={section} title={title} />
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
        <ModuleHeader section={section} title={title} />
        <UnconfiguredState account={account} />
      </div>
    );
  }
  return <>{children()}</>;
}

// ─── Cross-module link ────────────────────────────────────────────────
// Visible pill button — navigates to another module. Use whenever a
// UI surface should surface a clear actionable jump to a sibling module.

export function CrossLink({ to, label }: { to: string; label: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-2 text-[14px] font-semibold px-4 py-2 rounded-lg bg-primary/12 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 transition-all shadow-sm shadow-primary/5"
    >
      {label}
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
        "inline-flex items-center gap-2 text-[14px] font-semibold px-4 py-2.5 rounded-lg border transition-all",
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
      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground/80 transition-colors"
    >
      <ChevronLeft className="w-3 h-3" />
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
        className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
      >
        <ChevronLeft className="w-2.5 h-2.5" />
        {origin}
      </button>
      <span className="text-muted-foreground/30 text-[10px]">/</span>
      <span className="text-[10px] text-muted-foreground/50">This page</span>
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
      <AlertTriangle className="w-3 h-3 text-amber-400/70 shrink-0" />
      <p className="text-[12px] text-foreground/75 leading-none">
        Linked {label} no longer available — removed, regenerated, or outside the current range.
      </p>
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
      <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">
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
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] font-medium transition-colors",
              on
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.03]"
            )}
          >
            {on ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            {eventLabel(e)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Impact / scope badge styles (shared across Listen + decks) ───────

export const IMPACT_STYLE: Record<string, string> = {
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
  setup: "bg-primary/10 text-primary border-primary/20",
};

export const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  funnel: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  placement: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  mst: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  ad_account: "bg-primary/10 text-primary border-primary/20",
};

export function ImpactBadge({ impact }: { impact: string }) {
  return (
    <span className={cn("text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", IMPACT_STYLE[impact] ?? IMPACT_STYLE.low)}>
      {impact} impact
    </span>
  );
}

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={cn("text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", SCOPE_STYLE[scope] ?? "bg-muted text-muted-foreground/60 border-border/40")}>
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
}: {
  title: string;
  desc?: string;
  table?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="mx-card overflow-hidden">
      <div className="relative flex items-center gap-3 px-4 py-2.5 border-b border-[rgba(120,170,255,0.10)]">
        <div className="flex-1 min-w-0">
          <h3 className="text-[16px] font-semibold text-foreground leading-tight">{title}</h3>
          {desc && <p className="text-[13px] text-muted-foreground/80 mt-0.5 leading-snug">{desc}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {right}
          {table && <DataSourceBadge table={table} collapsible />}
        </div>
      </div>
      <div className="relative p-4">{children}</div>
    </section>
  );
}
