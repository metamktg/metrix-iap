// ─── Avatar × placement segment grid (A4 modal pattern) ───────────────
// Drill-down behind every variable/concept stat: blended top-line first,
// expandable into the avatar × placement grid. This import carries real
// MARGINALS — avatar segments (age × gender rows per creative cell) and
// placement performance (account level) — but no joint avatar × placement
// grain. Marginals render real numbers; intersections render an explicit
// "no joint grain" state. Never fabricated.

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Info, ZoomIn } from "lucide-react";
import type { AnalysisData, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import {
  scopeDemographicRows,
  listSegments,
  rowsForSegment,
  computeSegmentTotals,
  segmentKey,
  type SegmentId,
} from "@/lib/segment-analytics";
import { SegmentDrilldownModal } from "./SegmentDrilldownModal";

function usd(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** Common numeric fields we can sum across avatar/placement rows. */
interface SegmentTotals {
  spend: number;
  results: number;
  impressions: number;
  reach: number | null;
  clicksAll: number | null;
  linkClicks: number;
}

/** Resolve the value + display for whichever metric tile was clicked, from a segment's totals. */
function metricValueForSegment(t: SegmentTotals, metric: Pick<MetricDef, "id" | "isResultEvent">): { value: number | null; display: string } {
  if (metric.isResultEvent) {
    // Result-event metrics: the segment's totals are already scoped to the driving cells
    // (see topConceptsForMetric / cellIds threading), so `results` is this event's count.
    return { value: t.results, display: num(t.results) };
  }
  switch (metric.id) {
    case "spend":
      return { value: t.spend, display: usd(t.spend, 0) };
    case "impressions":
      return { value: t.impressions, display: num(t.impressions) };
    case "reach":
      return { value: t.reach, display: t.reach != null ? num(t.reach) : "—" };
    case "clicks_all":
      return { value: t.clicksAll, display: t.clicksAll != null ? num(t.clicksAll) : "—" };
    case "link_clicks":
      return { value: t.linkClicks, display: num(t.linkClicks) };
    case "link_ctr": {
      const v = t.impressions > 0 ? (t.linkClicks / t.impressions) * 100 : null;
      return { value: v, display: v != null ? `${v.toFixed(2)}%` : "—" };
    }
    case "cpa_blended":
    default: {
      const v = t.results > 0 ? t.spend / t.results : null;
      return { value: v, display: v != null ? usd(v) : "—" };
    }
  }
}

interface AvatarSegment {
  key: string;
  age: string;
  gender: string;
  totals: SegmentTotals;
}

/**
 * Avatar segments via the shared segment-analytics layer so the grid's
 * marginals and the per-segment drill-down are computed by the same
 * code (they must reconcile by construction). This also keeps imports
 * with an "ACCOUNT" aggregate grain honest — account-level totals use
 * that grain instead of double-counting the overlapping per-cell rows,
 * and missing fields (e.g. reach) stay null instead of reading as 0.
 */
function buildAvatarSegments(rows: DemographicRow[], cellIds: string[] | null): AvatarSegment[] {
  const scoped = scopeDemographicRows(rows, cellIds);
  return listSegments(scoped).map((seg) => {
    const t = computeSegmentTotals(rowsForSegment(scoped, seg));
    return {
      key: segmentKey(seg),
      age: seg.age,
      gender: seg.gender,
      totals: {
        spend: t.spend ?? 0,
        results: t.results ?? 0,
        impressions: t.impressions ?? 0,
        reach: t.reach,
        clicksAll: t.clicksAll,
        linkClicks: t.linkClicks ?? 0,
      },
    };
  });
}

function topPlacements(a: AnalysisData, max = 5): { row: PlacementRow; totals: SegmentTotals }[] {
  const rows = [...(a.v3_placement_signal ?? []), ...(a.c4e_placement_signal ?? [])];
  const map = new Map<string, PlacementRow>();
  for (const r of rows) {
    const key = `${r.Placement}|${r.Platform}`;
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        ...prev,
        "Amount spent (USD)": prev["Amount spent (USD)"] + r["Amount spent (USD)"],
        Results: prev.Results + r.Results,
        Impressions: prev.Impressions + r.Impressions,
        "Link clicks": prev["Link clicks"] + r["Link clicks"],
        CPA: null,
      });
    } else {
      map.set(key, { ...r });
    }
  }
  const merged = Array.from(map.values())
    .sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"])
    .slice(0, max)
    .map((row) => ({
      row,
      // Placement export has no Reach / Clicks (all) breakdown — surface honestly as unavailable, never fabricated.
      totals: {
        spend: row["Amount spent (USD)"],
        results: row.Results,
        impressions: row.Impressions,
        reach: null,
        clicksAll: null,
        linkClicks: row["Link clicks"],
      } satisfies SegmentTotals,
    }));
  return merged;
}

export function SegmentGridModal({
  open,
  onClose,
  kicker,
  title,
  analysis,
  /** Scope avatar rows to these creative cells; null = whole account. */
  cellIds,
  /** Which metric tile this drill-down is for; defaults to blended CPA. */
  metric,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  analysis: AnalysisData;
  cellIds: string[] | null;
  metric?: MetricDef | null;
}) {
  const avatars = useMemo(
    () => buildAvatarSegments(analysis.demographic_registration_signal ?? [], cellIds),
    [analysis, cellIds]
  );
  const placements = useMemo(() => topPlacements(analysis), [analysis]);
  const metricLabel = metric?.label ?? "Blended CPA";
  const unavailableOnPlacements = metric?.id === "reach" || metric?.id === "clicks_all";
  const [drilldownSegment, setDrilldownSegment] = useState<SegmentId | null>(null);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-[hsl(222_61%_6%)] border-border/50">
        <DialogHeader className="text-left space-y-1">
          <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">{kicker}</div>
          <DialogTitle className="text-[15px] font-semibold text-foreground">{title} — avatar × placement</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Avatar rows and placement columns are real marginals from this import, broken out by{" "}
            <span className="text-foreground/80 font-medium">{metricLabel}</span>. Meta's export does not break
            results down jointly by demographic and placement, so intersections stay explicitly empty rather than
            estimated.{unavailableOnPlacements ? " The placement export doesn't carry this metric, so those cells show as unavailable rather than estimated." : ""}
          </DialogDescription>
        </DialogHeader>

        {avatars.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <p className="text-[12px] font-medium text-foreground/60">No demographic rows for this selection</p>
            <p className="text-[11px] text-muted-foreground/60">
              The demographic export doesn't include rows for {cellIds?.join(", ") ?? "this account"}.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full min-w-[500px] border-collapse">
                <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
                  <tr className="border-b border-border/40">
                    <th className="text-left text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-semibold px-2.5 py-2">
                      Avatar segment
                    </th>
                    {placements.map(({ row: p }) => (
                      <th key={p.Placement + p.Platform} className="text-center text-[9px] font-mono uppercase tracking-wide text-muted-foreground/60 font-semibold px-2 py-2 min-w-[76px]">
                        <div className="normal-case">{p.Placement}</div>
                        <div className="text-[8px] text-muted-foreground/50 capitalize">{p.Platform}</div>
                      </th>
                    ))}
                    <th className="text-right text-[9px] font-mono uppercase tracking-widest text-primary/70 font-semibold px-2.5 py-2">
                      Blended
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {avatars.map((seg) => {
                    const blended = metricValueForSegment(seg.totals, metric ?? { id: "cpa_blended", isResultEvent: false });
                    return (
                      <tr key={seg.key} className="border-b border-border/20">
                        <td className="px-2.5 py-2">
                          <button
                            onClick={() => setDrilldownSegment({ age: seg.age, gender: seg.gender })}
                            className="group text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-primary/[0.07] transition-colors"
                            title="Open segment drill-down"
                            data-testid={`button-segment-drilldown-${seg.key}`}
                          >
                            <div className="text-[11px] font-medium text-foreground inline-flex items-center gap-1">
                              {seg.age}
                              <ZoomIn className="w-2.5 h-2.5 text-primary/0 group-hover:text-primary/70 transition-colors" />
                            </div>
                            <div className="text-[9px] text-muted-foreground/60 capitalize">{seg.gender}</div>
                          </button>
                        </td>
                        {placements.map(({ row: p }) => (
                          <td
                            key={p.Placement + p.Platform}
                            className="px-2 py-2 text-center text-[10px] text-muted-foreground/40"
                            title="No joint avatar × placement grain in this import"
                          >
                            —
                          </td>
                        ))}
                        <td className="px-2.5 py-2 text-right tabular-nums">
                          <div className="text-[11px] font-semibold text-foreground">
                            {blended.display} <span className="text-[8px] font-normal text-muted-foreground/60">{metricLabel}</span>
                          </div>
                          <div className="text-[9px] text-muted-foreground/60">{usd(seg.totals.spend, 0)} · {num(seg.totals.results)} res</div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Placement marginal row (account level) */}
                  <tr className="border-t border-border/40 bg-white/[0.015]">
                    <td className="px-2.5 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-wide text-primary/70">All avatars</div>
                      <div className="text-[8px] text-muted-foreground/60">placement marginals · account level</div>
                    </td>
                    {placements.map(({ row: p, totals }) => {
                      const v = metricValueForSegment(totals, metric ?? { id: "cpa_blended", isResultEvent: false });
                      return (
                        <td key={p.Placement + p.Platform} className="px-2 py-2 text-center tabular-nums">
                          <div className="text-[10px] font-semibold text-foreground/90">{v.display}</div>
                          <div className="text-[8px] text-muted-foreground/60">{usd(p["Amount spent (USD)"], 0)}</div>
                        </td>
                      );
                    })}
                    <td className="px-2.5 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-[10px] text-muted-foreground/60 leading-relaxed">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            Avatar rows: demographic audience signal{cellIds ? ` scoped to ${cellIds.join(", ")}` : " for the whole account"}.
            Placement columns: account-level placement signal. Joint cells populate automatically
            when an export with combined demographic × placement breakdowns is imported.
            Click an avatar segment to see the concepts and creative variables driving it.
          </span>
        </div>

        <SegmentDrilldownModal
          open={drilldownSegment != null}
          onClose={() => setDrilldownSegment(null)}
          segment={drilldownSegment}
          analysis={analysis}
          cellIds={cellIds}
          kicker={kicker}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Small affordance to open the segment grid behind a stat row. */
export function SegmentDrilldownButton({ onClick, label = "Avatar × placement" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
    >
      <span className="w-1 h-1 rounded-full bg-primary/60" />
      {label}
    </button>
  );
}
