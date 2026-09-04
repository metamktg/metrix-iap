// ─── Avatar × placement segment grid (A4 modal pattern) ───────────────
// Drill-down behind every variable/concept stat: blended top-line first,
// expandable into the avatar × placement grid. This import carries real
// MARGINALS — avatar segments (age × gender rows per creative cell) and
// placement performance (account level) — but no joint avatar × placement
// grain, so there is no intersection to render at all. Both marginals show
// real numbers, side by side, and nothing is estimated between them.

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/command-deck/components/ui/dialog";
import { Info } from "lucide-react";
import type { AnalysisData, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import { DIALOG } from "@/pages/metrix/typography";
import { platformLabel } from "@/pages/metrix/shared";

function usd(n: number | null | undefined, digits = 2): string {
  if (n == null) return "–";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function num(n: number | null | undefined): string {
  if (n == null) return "–";
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
  /** Downstream funnel counts — null when not present in the demographic export. */
  addsToCart: number | null;
  checkoutsInitiated: number | null;
  purchases: number | null;
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
      return { value: t.reach, display: t.reach != null ? num(t.reach) : "–" };
    case "clicks_all":
      return { value: t.clicksAll, display: t.clicksAll != null ? num(t.clicksAll) : "–" };
    case "link_clicks":
      return { value: t.linkClicks, display: num(t.linkClicks) };
    case "link_ctr": {
      const v = t.impressions > 0 ? (t.linkClicks / t.impressions) * 100 : null;
      return { value: v, display: v != null ? `${v.toFixed(2)}%` : "–" };
    }
    // ── Lower-funnel metrics ────────────────────────────────────────
    case "add_to_cart_rate": {
      const v = t.linkClicks > 0 && t.addsToCart != null ? (t.addsToCart / t.linkClicks) * 100 : null;
      return { value: v, display: v != null ? `${v.toFixed(2)}%` : "–" };
    }
    case "cost_per_add_to_cart": {
      const v = t.addsToCart != null && t.addsToCart > 0 ? t.spend / t.addsToCart : null;
      return { value: v, display: v != null ? usd(v) : "–" };
    }
    case "checkout_rate": {
      const v = t.linkClicks > 0 && t.checkoutsInitiated != null ? (t.checkoutsInitiated / t.linkClicks) * 100 : null;
      return { value: v, display: v != null ? `${v.toFixed(2)}%` : "–" };
    }
    case "cost_per_checkout": {
      const v = t.checkoutsInitiated != null && t.checkoutsInitiated > 0 ? t.spend / t.checkoutsInitiated : null;
      return { value: v, display: v != null ? usd(v) : "–" };
    }
    case "cvr": {
      const v = t.linkClicks > 0 ? (t.results / t.linkClicks) * 100 : null;
      return { value: v, display: v != null ? `${v.toFixed(2)}%` : "–" };
    }
    // ── Library tile ID aliases (lib_* → same computation as segment IDs) ──
    case "lib_clicks_all":
      return metricValueForSegment(t, { id: "clicks_all", isResultEvent: false });
    case "lib_atc_rate":
      return metricValueForSegment(t, { id: "add_to_cart_rate", isResultEvent: false });
    case "lib_cost_per_atc":
      return metricValueForSegment(t, { id: "cost_per_add_to_cart", isResultEvent: false });
    case "lib_checkout_rate":
      return metricValueForSegment(t, { id: "checkout_rate", isResultEvent: false });
    case "lib_cost_per_checkout":
      return metricValueForSegment(t, { id: "cost_per_checkout", isResultEvent: false });
    case "lib_cvr":
      return metricValueForSegment(t, { id: "cvr", isResultEvent: false });
    case "lib_cpa":
      return metricValueForSegment(t, { id: "cpa_blended", isResultEvent: false });
    case "lib_spend":
      return metricValueForSegment(t, { id: "spend", isResultEvent: false });
    case "lib_link_clicks":
      return metricValueForSegment(t, { id: "link_clicks", isResultEvent: false });
    case "lib_impressions":
      return metricValueForSegment(t, { id: "impressions", isResultEvent: false });
    case "lib_reach":
      return metricValueForSegment(t, { id: "reach", isResultEvent: false });
    case "lib_link_ctr":
      return metricValueForSegment(t, { id: "link_ctr", isResultEvent: false });
    case "lib_results":
      return metricValueForSegment(t, { id: "results", isResultEvent: true });
    case "cpa_blended":
    default: {
      const v = t.results > 0 ? t.spend / t.results : null;
      return { value: v, display: v != null ? usd(v) : "–" };
    }
  }
}

interface AvatarSegment {
  key: string;
  age: string;
  gender: string;
  totals: SegmentTotals;
}

function buildAvatarSegments(rows: DemographicRow[], cellIds: string[] | null): AvatarSegment[] {
  const scoped = cellIds ? rows.filter((r) => cellIds.includes(r.cell_id)) : rows;
  const map = new Map<string, AvatarSegment>();
  for (const r of scoped) {
    const key = `${r.Age}|${r.Gender}`;
    const seg = map.get(key) ?? {
      key,
      age: r.Age,
      gender: r.Gender,
      totals: { spend: 0, results: 0, impressions: 0, reach: 0, clicksAll: 0, linkClicks: 0, addsToCart: null, checkoutsInitiated: null, purchases: null },
    };
    seg.totals.spend += r["Amount spent (USD)"];
    seg.totals.results += r.Results;
    seg.totals.impressions += r.Impressions;
    seg.totals.reach = (seg.totals.reach ?? 0) + r.Reach;
    seg.totals.clicksAll = (seg.totals.clicksAll ?? 0) + r["Clicks (all)"];
    seg.totals.linkClicks += r["Link clicks"];
    if (r.adds_to_cart != null) seg.totals.addsToCart = (seg.totals.addsToCart ?? 0) + r.adds_to_cart;
    if (r.checkouts_initiated != null) seg.totals.checkoutsInitiated = (seg.totals.checkoutsInitiated ?? 0) + r.checkouts_initiated;
    if (r.purchases != null) seg.totals.purchases = (seg.totals.purchases ?? 0) + r.purchases;
    map.set(key, seg);
  }
  return Array.from(map.values()).sort((a, b) => b.totals.spend - a.totals.spend);
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
        addsToCart: null,
        checkoutsInitiated: null,
        purchases: null,
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-surface-deep border-border/50">
        <DialogHeader className="text-left space-y-1">
          <div className="text-label text-muted-foreground/75 uppercase tracking-widest">{kicker}</div>
          <DialogTitle className={DIALOG.title}>{title}, avatar × placement</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground/75 leading-relaxed">
            Two real marginals from this import, both by{" "}
            <span className="text-foreground/80 font-medium">{metricLabel}</span>: avatar segments, and placements at
            account level. Meta's export carries no joint demographic × placement breakdown, so there is no
            intersection to show · and none is estimated.{unavailableOnPlacements ? " The placement export doesn't carry this metric, so those figures show as unavailable rather than estimated." : ""}
          </DialogDescription>
        </DialogHeader>

        {avatars.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <p className="text-body font-medium text-foreground/60">No demographic rows for this selection</p>
            <p className="text-caption text-muted-foreground/75">
              The demographic export doesn't include rows for {cellIds?.join(", ") ?? "this account"}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Two marginals, not a cross-tab.
                The interior of an avatar × placement grid is a literal "—" in
                every cell — not a lookup that came back empty, but a dash the
                component writes, because Meta's export carries no joint
                demographic × placement grain at all. Drawing the grid spent
                most of the modal on dashes and implied the cells might fill
                in; the footnote went further and said they would "populate
                automatically", which no code path could deliver. What the
                import really has is two marginals, so the modal shows two. */}
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-surface-table z-10">
                    <tr className="border-b border-border/40">
                      <th className="text-left text-micro uppercase text-muted-foreground/75 font-semibold px-2.5 py-2">
                        Avatar segment
                      </th>
                      <th className="text-right text-micro uppercase text-interactive/70 font-semibold px-2.5 py-2">
                        {metricLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {avatars.map((seg) => {
                      const blended = metricValueForSegment(seg.totals, metric ?? { id: "cpa_blended", isResultEvent: false });
                      return (
                        <tr key={seg.key} className="border-b border-border/20 last:border-b-0">
                          <td className="px-2.5 py-2">
                            <div className="text-caption font-medium text-foreground">{seg.age}</div>
                            <div className="text-caption text-muted-foreground/75">{seg.gender}</div>
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums">
                            <div className="text-caption font-semibold text-foreground">{blended.display}</div>
                            <div className="text-caption text-muted-foreground/75">
                              {usd(seg.totals.spend, 0)} · {num(seg.totals.results)} res
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-surface-table z-10">
                    <tr className="border-b border-border/40">
                      <th className="text-left text-micro uppercase text-muted-foreground/75 font-semibold px-2.5 py-2">
                        Placement · account level
                      </th>
                      <th className="text-right text-micro uppercase text-interactive/70 font-semibold px-2.5 py-2">
                        {metricLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {placements.map(({ row: p, totals }) => {
                      const v = metricValueForSegment(totals, metric ?? { id: "cpa_blended", isResultEvent: false });
                      return (
                        <tr key={p.Placement + p.Platform} className="border-b border-border/20 last:border-b-0">
                          <td className="px-2.5 py-2">
                            <div className="text-caption font-medium text-foreground">{p.Placement}</div>
                            <div className="text-caption text-muted-foreground/75">{platformLabel(p.Platform)}</div>
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums">
                            <div className="text-caption font-semibold text-foreground">{v.display}</div>
                            <div className="text-caption text-muted-foreground/75">{usd(p["Amount spent (USD)"], 0)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-label text-muted-foreground/75 leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Avatars: demographic audience signal{cellIds ? ` scoped to ${cellIds.join(", ")}` : " for the whole account"}.
            Placements: account-level placement signal. The two are separate marginals of the same spend, so
            reading one against the other is directional. They do not multiply out.
          </span>
        </div>
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
      className="pressable inline-flex items-center gap-1 text-label font-medium text-interactive/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
    >
      <span className="w-1 h-1 rounded-full bg-primary/60" />
      {label}
    </button>
  );
}
