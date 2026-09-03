// ─── Result scope bar ────────────────────────────────────────────────────
// The one control that sets which result event (or allowed blend) every
// analysis surface on the page sums and ranks under. Chips are grouped by
// intent class — Conversion · Consideration · Awareness · Unplaced — in a
// fixed order, so the reader always sees where the account's spend sits
// and can never rank an awareness event beside a purchase: choosing one
// deselects the other. Fragments only on the first layer; the sentence
// about what a scale means lives behind the reveal.

import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DetailReveal, PILL_ACTIVE, PILL_INACTIVE, fmtUSD, fmtNum } from "@/pages/metrix/shared";
import { scopeRank, scopeSubtitle, type ResultScope, type ResultScopeGroup } from "@/lib/result-scope";

const RANK_LABEL: Record<string, string> = { cpa: "cost per result", cpc: "cost per link click", link_ctr: "link click-through", cpm: "CPM", results: "results", cvr: "conversion rate" };

const SCALE_TEXT: Record<string, string> = {
  conversion: "Purchase-intent events. Each event is judged on its own cost per result; \"All conversions\" blends terminal outcomes only (a purchase and a lead), never a funnel step such as a checkout.",
  consideration: "Traffic events. Judged on cost per visit and click-through — never against a purchase.",
  awareness: "Communication signals — CPM, click-through, reach, frequency and the event's own rate — read for gaps against this class's own median. Never cost per result, and never weighted against a purchase.",
  unplaced: "Result types Metrix cannot place on a scale (\"unknown\", custom events). Their spend stays visible here; nothing is judged.",
};

export function ResultScopeBar({
  scope,
  groups,
  onChange,
  className,
}: {
  scope: ResultScope | null;
  groups: ResultScopeGroup[];
  onChange: (id: string) => void;
  className?: string;
}) {
  if (groups.length === 0) return null;
  const activeGroup = groups.find((g) => g.scopes.some((s) => s.id === scope?.id)) ?? null;
  const scaleKey = activeGroup ? (activeGroup.intent ?? "unplaced") : "conversion";
  return (
    <div
      data-testid="result-scope-bar"
      role="group"
      aria-label="Result scope"
      className={cn("flex items-center gap-x-4 gap-y-2 flex-wrap px-6 py-2.5 border-b border-border/30 bg-foreground/[0.01] min-w-0", className)}
    >
      <span className={cn(TYPE.label, "text-muted-foreground/75 shrink-0")}>Result scope</span>
      {groups.map((g) => (
        <div key={g.label} className="flex items-center gap-1.5 flex-wrap min-w-0" data-testid={`result-scope-group-${g.intent ?? "unplaced"}`}>
          <span className={cn(TYPE.microLabel, "text-muted-foreground/75 shrink-0 pr-0.5")}>{g.label}</span>
          {g.scopes.map((s) => {
            const on = s.id === scope?.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                aria-pressed={on}
                data-testid="result-scope-chip"
                data-scope-kind={s.kind}
                title={`${s.label} · ${fmtUSD(s.spend, 0)} spend · ${fmtNum(s.results)} results${s.ads > 0 ? ` · ${fmtNum(s.ads)} ads` : ""}`}
                className={cn(
                  "pressable inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-body font-medium transition-colors whitespace-nowrap",
                  on ? PILL_ACTIVE : PILL_INACTIVE,
                  s.kind === "blended" && !on && "border-dashed",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ))}
      <DetailReveal
        label={activeGroup?.scale === "communication" ? "Communication scale" : activeGroup?.intent === null ? "Not judged" : "Cost per result"}
        eyebrow="How this scope is read"
        sections={[
          { label: activeGroup?.label ?? "Scope", text: SCALE_TEXT[scaleKey]! },
          ...(scope ? [{ label: "Reading", text: `${scopeSubtitle(scope)}. Rankings under this scope lead with ${RANK_LABEL[scopeRank(scope).metric] ?? scopeRank(scope).metric}, ${scopeRank(scope).direction === "asc" ? "lowest first" : "highest first"}.` }] : []),
        ]}
        labelClassName={cn(TYPE.caption, "text-muted-foreground/75")}
        testId="result-scope-why"
      />
    </div>
  );
}

/** Compact scope name for a module header or a dialog: "Purchases", "All conversions", "ThruPlays · communication scale". */
export function ResultScopeTag({ scope, className }: { scope: ResultScope | null; className?: string }) {
  if (!scope) return null;
  const communication = scope.scale === "communication";
  return (
    <span
      data-testid="result-scope-tag"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px whitespace-nowrap",
        TYPE.microLabel,
        communication ? "border-primary/30 bg-primary/10 text-interactive" : "border-border/50 text-muted-foreground/75",
        className,
      )}
      title={`${scopeSubtitle(scope)} — ${communication ? "judged on communication signals, never cost per result" : "judged on cost per result"}`}
    >
      {scope.label}
      {communication && <span aria-hidden className="w-1 h-1 rounded-full bg-current" />}
      {communication && "communication"}
    </span>
  );
}

/**
 * One line under the bar when a surface LANDED on a scope other than the
 * account default because its own rows carry nothing under that default
 * (useResultScope.landRows). Null when nothing landed — the common case —
 * so it costs no chrome. The reader learns that the chips above reflect
 * where this page's data is, not a choice they made.
 */
export function LandedScopeNote({ landed, what = "This page", className }: { landed: ResultScope | null; what?: string; className?: string }) {
  if (!landed) return null;
  return (
    <p data-testid="result-scope-landed" className={cn(TYPE.caption, "text-muted-foreground/75 px-6 pt-2 flex items-center gap-1.5 flex-wrap", className)}>
      <span>{what} landed on</span>
      <ResultScopeTag scope={landed} />
      <span>· no rows under the account's default scope. Pick a chip above to change it.</span>
    </p>
  );
}
