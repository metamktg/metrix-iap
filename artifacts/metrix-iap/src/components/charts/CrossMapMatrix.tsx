// ─── Cross-Map Heat Matrix ───────────────────────────────────────────
// Concept × Placement cross-map: a heat-matrix grid showing spend
// concentration per concept per placement. Higher spend = brighter.
// This is a UVP feature — standard reporting tools don't show this
// intersection natively.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { fmtUSD } from "@/pages/metrix/shared";

interface CrossMapMatrixProps {
  rows: Array<{
    concept: string;
    placement: string;
    spend: number;
    results?: number;
  }>;
  maxSpend: number;
}

export function CrossMapMatrix({ rows, maxSpend }: CrossMapMatrixProps) {
  const { concepts, placements, matrix } = useMemo(() => {
    const conceptSet = new Set<string>();
    const placementSet = new Set<string>();
    for (const r of rows) {
      conceptSet.add(r.concept);
      placementSet.add(r.placement);
    }
    const concepts = [...conceptSet];
    const placements = [...placementSet];
    const matrix = new Map<string, { spend: number; results?: number }>();
    for (const r of rows) {
      const key = `${r.concept}|${r.placement}`;
      matrix.set(key, { spend: r.spend, results: r.results });
    }
    return { concepts, placements, matrix };
  }, [rows]);

  if (concepts.length === 0 || placements.length === 0) return null;

  const cellSize = Math.max(32, Math.min(64, 320 / Math.max(concepts.length, placements.length)));

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header row */}
        <div className="flex">
          <div className="shrink-0" style={{ width: cellSize }} />
          {placements.map((p) => (
            <div
              key={p}
              className="shrink-0 text-label-xs font-mono text-muted-foreground/60 uppercase tracking-wider text-center leading-none py-2"
              style={{ width: cellSize }}
            >
              <span className="block rotate-0" title={p}>{p.slice(0, 12)}</span>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {concepts.map((c) => (
          <div key={c} className="flex items-center">
            <div
              className="shrink-0 text-label-xs font-medium text-foreground/80 pr-2 text-right leading-none"
              style={{ width: cellSize, lineHeight: `${cellSize}px` }}
              title={c}
            >
              <span className="truncate block">{c.length > 14 ? c.slice(0, 14) + "…" : c}</span>
            </div>
            {placements.map((p) => {
              const cell = matrix.get(`${c}|${p}`);
              const intensity = cell ? Math.max(0.08, Math.min(1, cell.spend / maxSpend)) : 0;
              return (
                <div
                  key={p}
                  className={cn(
                    "shrink-0 rounded-sm border border-white/[0.06] flex items-center justify-center text-[10px] font-mono tabular-nums cursor-default transition-opacity hover:opacity-90",
                    cell ? "text-white/80" : "text-transparent"
                  )}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: cell
                      ? `rgba(59, 130, 246, ${0.08 + intensity * 0.72})`
                      : "rgba(255,255,255,0.02)",
                  }}
                  title={cell ? `${c} × ${p}: ${fmtUSD(cell.spend, 0)}${cell.results != null ? ` · ${cell.results} results` : ""}` : ""}
                >
                  {cell ? (cell.spend >= 1000 ? `$${(cell.spend / 1000).toFixed(1)}k` : `$${Math.round(cell.spend)}`) : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-label-xs text-muted-foreground/50">Low</span>
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.5, 0.7, 1].map((a) => (
            <div
              key={a}
              className="w-4 h-3 rounded-sm border border-white/[0.06]"
              style={{ backgroundColor: `rgba(59, 130, 246, ${0.08 + a * 0.72})` }}
            />
          ))}
        </div>
        <span className="text-label-xs text-muted-foreground/50">High spend</span>
      </div>
    </div>
  );
}
