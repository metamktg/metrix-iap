// ─── Funnel steps chart ────────────────────────────────────────────────
// Vertical step-funnel visualization for a creative cell's conversion
// path: Impressions → Link Clicks → Adds to Cart → Checkouts → Purchases.
// Steps with null data render greyed-out with a "No data" label.
// Between each pair of adjacent steps with data, the conversion rate is
// shown as a percentage.

import { cn } from "@workspace/command-deck/lib/utils";

export interface FunnelStep {
  label: string;
  value: number | null;
  /** Formatted display value */
  formatted: string;
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
          <div key={step.label}>
            {/* Conversion rate connector between steps */}
            {i > 0 && (
              <div className="flex items-center gap-2 pl-2 py-1">
                <div className="w-px h-4 bg-border/30 shrink-0 ml-1.5" />
                {convRate ? (
                  <span className="text-[9px] font-mono text-interactive/70 tabular-nums">
                    {convRate} conversion
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-muted-foreground/35">
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
                  ? "border-border/35 bg-white/[0.02]"
                  : "border-border/20 bg-white/[0.01] opacity-50"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn(
                  "text-label font-medium",
                  hasData ? "text-foreground/80" : "text-muted-foreground/40"
                )}>
                  {step.label}
                </span>
                <span className={cn(
                  "text-body font-bold tabular-nums",
                  hasData ? "text-foreground" : "text-muted-foreground/30"
                )}>
                  {hasData ? step.formatted : "No data"}
                </span>
              </div>
              {/* Bar */}
              <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
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

/** Build funnel steps from a cell performance row. */
export function buildFunnelSteps(row: {
  Impressions: number;
  "Link clicks": number;
  adds_to_cart?: number | null;
  checkouts_initiated?: number | null;
  purchases?: number | null;
}): FunnelStep[] {
  return [
    { label: "Impressions",          value: row.Impressions,          formatted: fmtNum(row.Impressions) },
    { label: "Link Clicks",          value: row["Link clicks"],       formatted: fmtNum(row["Link clicks"]) },
    { label: "Adds to Cart",         value: row.adds_to_cart ?? null,         formatted: fmtNum(row.adds_to_cart ?? null) },
    { label: "Checkouts Initiated",  value: row.checkouts_initiated ?? null,  formatted: fmtNum(row.checkouts_initiated ?? null) },
    { label: "Purchases",            value: row.purchases ?? null,            formatted: fmtNum(row.purchases ?? null) },
  ];
}
