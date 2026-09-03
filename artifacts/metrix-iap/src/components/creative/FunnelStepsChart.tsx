// ─── Funnel steps chart ────────────────────────────────────────────────
// Vertical step-funnel visualization for a creative cell's path. The
// delivery steps (Impressions → Link Clicks) come first for every account;
// the conversion chain after them is BUILT FROM THE ACCOUNT'S OBSERVED
// RESULT EVENTS, ordered by funnel stage through the result-event taxonomy
// (intermediate purchase-intent steps, then terminal outcomes) — never a
// fixed Adds to Cart → Checkouts → Purchases list that assumed every client
// sold physical goods (G8, 2026-09-03).
//
// Steps with null data render greyed-out with a "No data" label. Between
// each pair of adjacent steps with data, the step-to-step rate is shown.

import { cn } from "@workspace/command-deck/lib/utils";
import { classifyResultEvent, RESULT_EVENTS, type ResultEventClassification, type ResultEventKey } from "@/lib/resultEvents";
import { eventLabel } from "@/pages/metrix/shared";

export interface FunnelStep {
  label: string;
  value: number | null;
  /** Formatted display value */
  formatted: string;
  /** "delivery" for impressions / link clicks; "conversion" for a result-event step. */
  kind: "delivery" | "conversion";
  /** The raw Meta result type a conversion step counts, when it is one. */
  resultType?: string;
}

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct(num: number | null, den: number | null): string | null {
  if (num == null || den == null || den === 0) return null;
  return `${((num / den) * 100).toFixed(1)}%`;
}

export function FunnelStepsChart({ steps }: { steps: FunnelStep[] }) {
  const maxVal = Math.max(...steps.map((s) => s.value ?? 0), 1);

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1] : null;
        const convRate = prev ? fmtPct(step.value, prev.value) : null;
        const hasData = step.value != null;
        const barW = hasData ? Math.max(4, Math.round((step.value! / maxVal) * 100)) : 0;

        return (
          <div key={step.resultType ?? step.label}>
            {/* Conversion rate connector between steps */}
            {i > 0 && (
              <div className="flex items-center gap-2 pl-2 py-1">
                <div className="w-px h-4 bg-border/30 shrink-0 ml-1.5" />
                {convRate ? (
                  <span className="text-micro-num text-interactive/70 tabular-nums">
                    {convRate} conversion
                  </span>
                ) : (
                  <span className="text-caption text-muted-foreground/75">
                    — no rate
                  </span>
                )}
              </div>
            )}

            {/* Step row */}
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5 transition-colors",
                hasData
                  ? "border-border/35 bg-foreground/[0.02]"
                  : "border-border/20 bg-foreground/[0.01] opacity-50"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn(
                  "text-label font-medium",
                  hasData ? "text-foreground/80" : "text-muted-foreground/75"
                )}>
                  {step.label}
                </span>
                <span className={cn(
                  "text-body font-bold tabular-nums",
                  hasData ? "text-foreground" : "text-muted-foreground/75"
                )}>
                  {hasData ? step.formatted : "No data"}
                </span>
              </div>
              {/* Bar */}
              <div className="h-1.5 rounded-full bg-foreground/[0.04] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-700",
                    hasData ? "bg-primary/50" : "bg-muted/20"
                  )}
                  style={{ width: hasData ? `${barW}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Building the chain ────────────────────────────────────────────────

/** Funnel order within the conversion class: purchase-intent steps first, in the order a buyer takes them, then terminal outcomes. */
const INTERMEDIATE_ORDER: readonly string[] = ["add_to_wishlist", "add_to_cart", "initiate_checkout", "add_payment_info"];

/** The legacy per-row funnel columns, by the event they count. */
const LEGACY_COLUMN: Record<string, "adds_to_cart" | "checkouts_initiated" | "purchases"> = {
  add_to_cart: "adds_to_cart",
  initiate_checkout: "checkouts_initiated",
  purchase: "purchases",
};

function stageRank(c: ResultEventClassification): number {
  if (c.stage === "intermediate") {
    const i = INTERMEDIATE_ORDER.indexOf(c.key);
    return i >= 0 ? i : INTERMEDIATE_ORDER.length;
  }
  return INTERMEDIATE_ORDER.length + 1;
}

/**
 * Split an account's observed result types into the conversion chain (in
 * funnel order, one entry per raw type) and everything else it ran — the
 * events a reader is told exist when there is no chain to draw.
 */
export function describeFunnelChain(events: readonly string[]): { chain: ResultEventClassification[]; other: ResultEventClassification[] } {
  const seen = new Set<string>();
  const chain: ResultEventClassification[] = [];
  const other: ResultEventClassification[] = [];
  for (const rt of events) {
    const raw = (rt ?? "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    const c = classifyResultEvent(raw);
    if (c.intent === "conversion" && c.key !== "custom") chain.push(c);
    else other.push(c);
  }
  chain.sort((a, b) => stageRank(a) - stageRank(b) || events.indexOf(a.raw) - events.indexOf(b.raw));
  return { chain, other };
}

/** Reader-facing label for a result type: the taxonomy's, or the export's own string tidied. */
export function funnelStepLabel(resultType: string): string {
  const c = classifyResultEvent(resultType);
  return c.key === "custom" || c.key === "unknown" ? eventLabel(resultType) : c.label;
}

export interface FunnelRowLike {
  Impressions: number;
  "Link clicks": number;
  "Result type"?: string;
  Results?: number;
  adds_to_cart?: number | null;
  checkouts_initiated?: number | null;
  purchases?: number | null;
}

export interface BuildFunnelStepsOptions {
  /**
   * The account's observed result types (seed `result_events[].raw`). Decides
   * WHICH conversion steps exist; the cell's own counts fill them in. When
   * omitted, the chain is what the row itself carries: its own result type
   * when that is a conversion event, plus any legacy funnel column present.
   */
  events?: readonly string[];
  /** Every per-result-event row for this cell — each supplies the count for its own event. */
  rowsByEvent?: readonly { "Result type": string; Results: number }[];
}

/**
 * Build funnel steps for one cell: delivery first, then one step per
 * conversion event the account carries, ordered by funnel stage. A step's
 * count comes from the cell's row for that event, else from the legacy
 * funnel column that counts the same event, else it is null — "No data",
 * never 0. Delivery steps are always present.
 */
export function buildFunnelSteps(row: FunnelRowLike, opts: BuildFunnelStepsOptions = {}): FunnelStep[] {
  const steps: FunnelStep[] = [
    { label: "Impressions", value: row.Impressions, formatted: fmtNum(row.Impressions), kind: "delivery" },
    { label: "Link Clicks", value: row["Link clicks"], formatted: fmtNum(row["Link clicks"]), kind: "delivery" },
  ];

  let events: string[];
  if (opts.events) {
    events = [...opts.events];
  } else {
    // No account context: only what this row itself measured.
    events = [];
    const own = (row["Result type"] ?? "").trim();
    if (own && classifyResultEvent(own).intent === "conversion") events.push(own);
    for (const [key, column] of Object.entries(LEGACY_COLUMN)) {
      if (row[column] !== undefined && !events.some((rt) => classifyResultEvent(rt).key === key)) {
        // A legacy column names its event by the taxonomy's own label, which
        // classifies back to the same key.
        events.push(RESULT_EVENTS[key as ResultEventKey].label);
      }
    }
  }
  const { chain } = describeFunnelChain(events);

  const byType = new Map<string, number>();
  for (const r of opts.rowsByEvent ?? []) {
    const rt = (r["Result type"] ?? "").trim();
    if (rt) byType.set(rt, (byType.get(rt) ?? 0) + (r.Results ?? 0));
  }
  const ownType = (row["Result type"] ?? "").trim();
  if (ownType && !byType.has(ownType) && row.Results != null) byType.set(ownType, row.Results);

  for (const c of chain) {
    let value: number | null = byType.get(c.raw) ?? null;
    if (value == null) {
      const column = LEGACY_COLUMN[c.key];
      if (column) value = row[column] ?? null;
    }
    steps.push({ label: funnelStepLabel(c.raw), value, formatted: fmtNum(value), kind: "conversion", resultType: c.raw });
  }
  return steps;
}
