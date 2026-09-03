// ─── Library grid controls — sort · group · page size ─────────────────
//
// The IAP Library's cell grid had no controls of its own. It inherited a
// sort key from the funnel-stage config set on another page, showed ten
// tiles in a five-column grid (two rows), and paged with prev/next only —
// so a hundred-cell account was ten clicks from its last tile and could
// not be ordered by anything the funnel config did not already say.
//
// WHAT DECIDES WHICH OPTIONS EXIST. Only what the rows can back. The sort
// keys are the ones `sortValueForCell` computes, no more. The group-by
// dimensions are filtered against the rows in scope at render time, so a
// dimension every row leaves blank is never offered — an empty grouping is
// a worse answer than not offering the grouping. This is the same rule the
// Universal Data Module states: no module offers a view its data can't
// support.
//
// Grouping is presentational and deliberately sits BEFORE paging: you page
// through groups, not through a flat list that happens to be sorted by the
// group key, because the point of grouping is to see a segment whole.

import { useMemo } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import type { SortKey } from "@/lib/funnelStages";

/** Page sizes offered. `null` means "every cell in scope, no paging". */
export type PageSize = 10 | 25 | 50 | 100 | null;

const PAGE_SIZES: readonly PageSize[] = [10, 25, 50, 100, null];

/** The sort keys `sortValueForCell` can actually compute a number for. */
const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string; lowerIsBetter?: boolean }> = [
  { key: "spend", label: "Spend" },
  { key: "results", label: "Results" },
  { key: "cpa", label: "Cost per result", lowerIsBetter: true },
  { key: "ctr", label: "Link CTR" },
  { key: "cvr", label: "Result rate" },
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "link_clicks", label: "Link clicks" },
];

/**
 * Dimensions a cell row can be grouped by. Each reads ONE field that is
 * already on the row — nothing is derived, so a group label is always a
 * value the data actually carried.
 */
export type GroupKey =
  | "none"
  | "concept"
  | "result_type"
  | "funnel_stage"
  | "awareness"
  | "hook"
  | "tone"
  | "framework"
  | "cta";

type GroupableRow = {
  book2_concept_name?: string;
  "Result type"?: string;
  funnel_stage_variable?: string;
  awareness_variable?: string;
  hook_variable?: string;
  tone_variable?: string;
  framework_variable?: string;
  cta_variable?: string;
};

const GROUP_FIELD: Record<Exclude<GroupKey, "none">, { label: string; read: (r: GroupableRow) => string | undefined }> = {
  concept: { label: "Concept", read: (r) => r.book2_concept_name },
  result_type: { label: "Result type", read: (r) => r["Result type"] },
  funnel_stage: { label: "Funnel stage", read: (r) => r.funnel_stage_variable },
  awareness: { label: "Awareness", read: (r) => r.awareness_variable },
  hook: { label: "Hook", read: (r) => r.hook_variable },
  tone: { label: "Tone", read: (r) => r.tone_variable },
  framework: { label: "Framework", read: (r) => r.framework_variable },
  cta: { label: "CTA", read: (r) => r.cta_variable },
};

/** The value a row sits under for a grouping, or null when it carries none. */
export function groupValueOf(row: GroupableRow, key: GroupKey): string | null {
  if (key === "none") return null;
  const v = GROUP_FIELD[key].read(row);
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export function groupLabelOf(key: Exclude<GroupKey, "none">): string {
  return GROUP_FIELD[key].label;
}

/**
 * Which groupings the rows in scope can actually back: at least two distinct
 * values, and set on more than a third of the rows. One value groups nothing;
 * a field three rows in ninety carry produces a wall of "Not set".
 */
export function usableGroupKeys(rows: readonly GroupableRow[]): Exclude<GroupKey, "none">[] {
  if (rows.length === 0) return [];
  return (Object.keys(GROUP_FIELD) as Exclude<GroupKey, "none">[]).filter((k) => {
    let set = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const v = groupValueOf(r, k);
      if (v !== null) { set += 1; seen.add(v); }
    }
    return seen.size >= 2 && set / rows.length > 1 / 3;
  });
}

// ─── Controls ─────────────────────────────────────────────────────────

const segBtn = (active: boolean) =>
  cn(
    "pressable px-2 py-1 rounded transition-[color,background-color] duration-[140ms] ease-[var(--ease-out)]",
    TYPE.label,
    "font-medium normal-case tracking-normal",
    active
      ? "bg-primary/15 text-interactive"
      : "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]",
  );

export function LibraryGridControls({
  sortKey, sortDir, onSort,
  groupKey, groupOptions, onGroup,
  pageSize, onPageSize,
  shown, total,
}: {
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey, dir: "asc" | "desc") => void;
  groupKey: GroupKey;
  groupOptions: Exclude<GroupKey, "none">[];
  onGroup: (k: GroupKey) => void;
  pageSize: PageSize;
  onPageSize: (n: PageSize) => void;
  shown: number;
  total: number;
}) {
  const active = useMemo(() => SORT_OPTIONS.find((o) => o.key === sortKey), [sortKey]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="library-grid-controls">
      {/* Sort — the key, then the direction as its own control so a reader
          can flip "worst first" without hunting for a second sort entry. */}
      <label className="flex items-center gap-1.5">
        <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Sort</span>
        <select
          value={sortKey}
          onChange={(e) => onSort(e.target.value as SortKey, sortDir)}
          aria-label="Sort cells by"
          data-testid="library-sort-key"
          className={cn(
            TYPE.caption,
            "bg-foreground/[0.04] border border-border/40 rounded px-2 py-1 min-h-6 text-foreground",
            "hover:border-border/60 transition-[border-color] duration-[140ms] ease-[var(--ease-out)]",
          )}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => onSort(sortKey, sortDir === "asc" ? "desc" : "asc")}
          data-testid="library-sort-dir"
          aria-label={sortDir === "asc" ? "Sort ascending — click for descending" : "Sort descending — click for ascending"}
          title={
            active?.lowerIsBetter
              ? sortDir === "asc" ? "Best first (lower is better)" : "Worst first"
              : sortDir === "desc" ? "Best first (higher is better)" : "Worst first"
          }
          className={cn(
            "pressable w-6 h-6 rounded border border-border/30 flex items-center justify-center",
            "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]",
            "transition-[color,background-color] duration-[140ms] ease-[var(--ease-out)]",
          )}
        >
          <span aria-hidden="true" className="text-body leading-none">{sortDir === "asc" ? "↑" : "↓"}</span>
        </button>
      </label>

      {/* Group — only the dimensions the rows in scope can back. */}
      {groupOptions.length > 0 && (
        <label className="flex items-center gap-1.5">
          <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Group</span>
          <select
            value={groupKey}
            onChange={(e) => onGroup(e.target.value as GroupKey)}
            aria-label="Group cells by"
            data-testid="library-group-key"
            className={cn(
              TYPE.caption,
              "bg-foreground/[0.04] border border-border/40 rounded px-2 py-1 min-h-6 text-foreground",
              "hover:border-border/60 transition-[border-color] duration-[140ms] ease-[var(--ease-out)]",
            )}
          >
            <option value="none">No grouping</option>
            {groupOptions.map((k) => (
              <option key={k} value={k}>{groupLabelOf(k)}</option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center gap-0.5" data-testid="library-page-size">
        {PAGE_SIZES.map((n) => (
          <button
            key={String(n)}
            onClick={() => onPageSize(n)}
            className={segBtn(pageSize === n)}
            aria-pressed={pageSize === n}
          >
            {n === null ? "All" : n}
          </button>
        ))}
        <span className={cn(TYPE.microLabel, "text-muted-foreground/75 ml-1")}>per page</span>
      </div>

      <span className={cn(TYPE.microLabel, "text-muted-foreground/75 tabular-nums ml-auto")} data-testid="library-shown-count">
        {shown === total ? `${total} cells` : `${shown} of ${total} cells`}
      </span>
    </div>
  );
}

// ─── Pager ────────────────────────────────────────────────────────────

/**
 * Page numbers to render, with `null` standing for an elided run. Always
 * shows the first and last page so the ends of the set are one click away —
 * prev/next alone made the last tile of a hundred-cell account ten clicks
 * from the first.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push(null);
  out.push(total);
  return out;
}

export function Pager({
  page, totalPages, onPage, rangeStart, rangeEnd, total,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  rangeStart: number;
  rangeEnd: number;
  total: number;
}) {
  if (totalPages <= 1) return null;
  const step = cn(
    "pressable min-w-6 h-6 px-1 flex items-center justify-center rounded border border-border/30",
    "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-25",
    "transition-[color,background-color] duration-[140ms] ease-[var(--ease-out)]",
  );
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="library-pager">
      <span className={cn(TYPE.microLabel, "text-muted-foreground/75 tabular-nums")}>
        {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1} className={step} aria-label="First page">«</button>
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className={step} aria-label="Previous page">‹</button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} aria-hidden="true" className={cn(TYPE.microLabel, "text-muted-foreground/75 px-0.5")}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "pressable min-w-6 h-6 px-1 flex items-center justify-center rounded tabular-nums",
                TYPE.microLabel,
                "transition-[color,background-color] duration-[140ms] ease-[var(--ease-out)]",
                p === page
                  ? "bg-primary/15 text-interactive border border-primary/30"
                  : "border border-border/30 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04]",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className={step} aria-label="Next page">›</button>
        <button onClick={() => onPage(totalPages)} disabled={page === totalPages} className={step} aria-label="Last page">»</button>
      </div>
    </div>
  );
}
