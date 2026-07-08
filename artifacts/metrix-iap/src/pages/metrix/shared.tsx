// ─── Shared building blocks for seed-hydrated Metrix pages ────────────

import { cn } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";
import { Plug, FileUp, Clock, Database, Info, ArrowRight, CheckSquare, Square } from "lucide-react";
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
  onb_initiate_checkout: "Checkouts initiated",
};

export function eventLabel(key: string): string {
  return EVENT_LABEL[key] ?? key;
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
    <span className={cn("inline-flex text-[9px] font-semibold border px-1.5 py-0.5 rounded leading-none", cls)}>
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
    <div className="px-6 py-5 border-b border-border/40">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <span className="mx-section-label block mb-1 !text-[10px]">{section}</span>
          <h1 className="text-[20px] font-bold text-foreground leading-tight tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="text-[12px] text-muted-foreground/75 mt-0.5">{subtitle}</p>}
        </div>
        <div className="shrink-0 pt-1 flex items-center gap-2">
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
      <Database className="w-3 h-3 text-muted-foreground/40 shrink-0" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">Scoped to ad account</span>
      <span className="text-[11px] font-medium text-foreground/80">{account.name}</span>
      <span className="text-[9px] font-mono text-muted-foreground/40">{account.platform}</span>
    </div>
  );
}

// ─── Data caveat note ─────────────────────────────────────────────────

export function CaveatNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04]">
      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-400/80 leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Unconfigured / pending states ────────────────────────────────────

export function UnconfiguredState({ account }: { account: AdAccount }) {
  const s = account.overview_state;
  return (
    <div className="flex-1 flex items-center justify-center py-20 px-6">
      <div className="max-w-md text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl border border-border/40 bg-white/[0.03] flex items-center justify-center mx-auto">
          <Plug className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[16px] font-semibold text-foreground">{s?.title ?? "Connect Meta Ad Account"}</h2>
          <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
            {account.name} has no connected data yet. Connect the ad account or add a manual import to begin.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors">
            <Plug className="w-3.5 h-3.5" /> {s?.primary_action ?? "Connect Meta Ad Account"}
          </button>
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <FileUp className="w-3.5 h-3.5" /> {s?.secondary_action ?? "Add Manual Import"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/35 leading-relaxed">
          No performance, analysis, or report data is shown until this account is configured.
        </p>
      </div>
    </div>
  );
}

export function PendingState({ title, message, icon: Icon = Clock }: { title: string; message: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-10 h-10 rounded-xl border border-border/40 bg-white/[0.03] flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/40" />
      </div>
      <p className="text-[13px] font-medium text-foreground/60">{title}</p>
      <p className="text-[11px] text-muted-foreground/40 max-w-xs">{message}</p>
    </div>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────

export function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mx-card p-4">
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">{label}</div>
        <div className="text-[26px] font-bold text-foreground tabular-nums leading-none tracking-[-0.035em]">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground/60 mt-2">{sub}</div>}
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
            "flex items-center gap-1.5 h-10 px-3 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            active === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground"
          )}
        >
          {t.Icon && <t.Icon className="w-3 h-3" />}
          {t.label}
          {t.count != null && <span className="text-[9px] font-mono text-muted-foreground/40">{t.count}</span>}
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
        <PendingState title="No ad account selected" message="Choose an ad account to view this module." />
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

export function CrossLink({ to, label }: { to: string; label: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
    >
      {label}
      <ArrowRight className="w-3 h-3" />
    </button>
  );
}

// ─── Focus deep-link param (?focus=<id>) ──────────────────────────────

export function useFocusParam(): string | null {
  const search = useSearch();
  const params = new URLSearchParams(search);
  return params.get("focus");
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
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
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
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors",
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
    <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", IMPACT_STYLE[impact] ?? IMPACT_STYLE.low)}>
      {impact} impact
    </span>
  );
}

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", SCOPE_STYLE[scope] ?? "bg-muted text-muted-foreground/60 border-border/40")}>
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
      <div className="relative flex items-start gap-3 px-4 py-3 border-b border-[rgba(120,170,255,0.12)]">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground leading-tight">{title}</h3>
          {desc && <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-tight">{desc}</p>}
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
