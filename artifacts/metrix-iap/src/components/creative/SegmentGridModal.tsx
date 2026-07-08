// ─── Avatar × placement segment grid (A4 modal pattern) ───────────────
// Drill-down behind every variable/concept stat: blended top-line first,
// expandable into the avatar × placement grid. This import carries real
// MARGINALS — avatar segments (age × gender rows per creative cell) and
// placement performance (account level) — but no joint avatar × placement
// grain. Marginals render real numbers; intersections render an explicit
// "no joint grain" state. Never fabricated.

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import type { AnalysisData, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";

function usd(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

interface AvatarSegment {
  key: string;
  age: string;
  gender: string;
  spend: number;
  results: number;
  cpa: number | null;
}

function buildAvatarSegments(rows: DemographicRow[], cellIds: string[] | null): AvatarSegment[] {
  const scoped = cellIds ? rows.filter((r) => cellIds.includes(r.cell_id)) : rows;
  const map = new Map<string, AvatarSegment>();
  for (const r of scoped) {
    const key = `${r.Age}|${r.Gender}`;
    const seg = map.get(key) ?? { key, age: r.Age, gender: r.Gender, spend: 0, results: 0, cpa: null };
    seg.spend += r["Amount spent (USD)"];
    seg.results += r.Results;
    map.set(key, seg);
  }
  for (const seg of map.values()) {
    seg.cpa = seg.results > 0 ? seg.spend / seg.results : null;
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

function topPlacements(a: AnalysisData, max = 5): PlacementRow[] {
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
  const merged = Array.from(map.values()).map((r) => ({
    ...r,
    CPA: r.Results > 0 ? r["Amount spent (USD)"] / r.Results : null,
  }));
  return merged.sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).slice(0, max);
}

export function SegmentGridModal({
  open,
  onClose,
  kicker,
  title,
  analysis,
  /** Scope avatar rows to these creative cells; null = whole account. */
  cellIds,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  analysis: AnalysisData;
  cellIds: string[] | null;
}) {
  const avatars = useMemo(
    () => buildAvatarSegments(analysis.demographic_registration_signal ?? [], cellIds),
    [analysis, cellIds]
  );
  const placements = useMemo(() => topPlacements(analysis), [analysis]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-[hsl(222_61%_6%)] border-border/50">
        <DialogHeader className="text-left space-y-1">
          <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">{kicker}</div>
          <DialogTitle className="text-[15px] font-semibold text-foreground">{title} — avatar × placement</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Avatar rows and placement columns are real marginals from this import. Meta's export
            does not break results down jointly by demographic and placement, so intersections
            stay explicitly empty rather than estimated.
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
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
                  <tr className="border-b border-border/40">
                    <th className="text-left text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-semibold px-2.5 py-2">
                      Avatar segment
                    </th>
                    {placements.map((p) => (
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
                  {avatars.map((seg) => (
                    <tr key={seg.key} className="border-b border-border/20">
                      <td className="px-2.5 py-2">
                        <div className="text-[11px] font-medium text-foreground">{seg.age}</div>
                        <div className="text-[9px] text-muted-foreground/60 capitalize">{seg.gender}</div>
                      </td>
                      {placements.map((p) => (
                        <td
                          key={p.Placement + p.Platform}
                          className="px-2 py-2 text-center text-[10px] text-muted-foreground/40"
                          title="No joint avatar × placement grain in this import"
                        >
                          —
                        </td>
                      ))}
                      <td className="px-2.5 py-2 text-right tabular-nums">
                        <div className="text-[11px] font-semibold text-foreground">{seg.cpa != null ? usd(seg.cpa) : "—"} <span className="text-[8px] font-normal text-muted-foreground/60">CPA</span></div>
                        <div className="text-[9px] text-muted-foreground/60">{usd(seg.spend, 0)} · {num(seg.results)} res</div>
                      </td>
                    </tr>
                  ))}
                  {/* Placement marginal row (account level) */}
                  <tr className="border-t border-border/40 bg-white/[0.015]">
                    <td className="px-2.5 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-wide text-primary/70">All avatars</div>
                      <div className="text-[8px] text-muted-foreground/60">placement marginals · account level</div>
                    </td>
                    {placements.map((p) => (
                      <td key={p.Placement + p.Platform} className="px-2 py-2 text-center tabular-nums">
                        <div className="text-[10px] font-semibold text-foreground/90">{p.CPA != null ? usd(p.CPA) : "—"}</div>
                        <div className="text-[8px] text-muted-foreground/60">{usd(p["Amount spent (USD)"], 0)}</div>
                      </td>
                    ))}
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
            Avatar rows: demographic registration signal{cellIds ? ` scoped to ${cellIds.join(", ")}` : " for the whole account"}.
            Placement columns: account-level placement signal. Joint cells populate automatically
            when an export with combined demographic × placement breakdowns is imported.
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
      className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary border border-primary/20 bg-primary/[0.06] hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors"
    >
      <span className="w-1 h-1 rounded-full bg-primary/60" />
      {label}
    </button>
  );
}
