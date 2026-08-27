// ─── Metric table ─────────────────────────────────────────────────────
//
// The workhorse: any breakdown, filtered and sorted, with the reader
// choosing which metrics are columns. Every dense list in the product had
// been hand-rolled — twelve files with their own <th>, their own sort (or
// none), and their own idea of what an unmeasured cell looks like.
//
// Three rules it enforces so those cannot diverge again:
//
//   · A null is a dash, never a zero. `results: 0` and "results were not
//     measured" are different facts, and a right-aligned 0 in a numeric
//     column is the most confident-looking lie a table can tell.
//   · Sorting puts unmeasured rows LAST in both directions. They are not
//     the smallest value; they are not a value.
//   · Numbers are tabular. A column of proportional digits does not line
//     up on the decimal, which is the only reason to right-align at all.
//
// Sort state and column selection live in the URL-free local state by
// design — this is a view preference, not a filter that should survive a
// share link.

import { useMemo, useState, useId } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, Search, X } from "lucide-react";
import { HEADING, TYPE } from "@/pages/metrix/typography";

export interface MetricColumn<Row> {
  /** Stable key — also the column-picker identity. */
  key: string;
  label: string;
  /** Null means the source could not measure it for this row. */
  value: (row: Row) => number | null;
  format: (n: number) => string;
  /** Ascending default for cost-style metrics where lower is better. */
  defaultDirection?: "asc" | "desc";
  /** Shown but not removable — e.g. spend on a spend table. */
  locked?: boolean;
  /** Hidden until the reader adds it from the picker. */
  optional?: boolean;
  /** One-line explanation, surfaced in the header's title attribute. */
  hint?: string;
}

export interface MetricTableProps<Row> {
  rows: Row[];
  /** Stable row identity for React keys and for colour assignment upstream. */
  rowKey: (row: Row) => string;
  /** First column — the thing each row *is*. Always present, always left. */
  label: (row: Row) => string;
  /** Optional second line under the label (e.g. a campaign or concept). */
  sublabel?: (row: Row) => string | null;
  columns: MetricColumn<Row>[];
  /** Text the filter box matches against. Defaults to the label. */
  searchText?: (row: Row) => string;
  filterPlaceholder?: string;
  emptyLabel?: string;
  /** Rows past this are collapsed behind a "Show all" control. */
  initialVisible?: number;
  caption?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

/** Unmeasured sorts last in BOTH directions — absence is not a low value. */
function compare(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function MetricTable<Row>({
  rows,
  rowKey,
  label,
  sublabel,
  columns,
  searchText,
  filterPlaceholder = "Filter rows…",
  emptyLabel = "No rows yet",
  initialVisible = 12,
  caption,
}: MetricTableProps<Row>) {
  const pickerId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(() =>
    columns.filter((c) => !c.optional).map((c) => c.key),
  );

  const active = useMemo(
    () => columns.filter((c) => c.locked || chosen.includes(c.key)),
    [columns, chosen],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const text = searchText ?? label;
    return rows.filter((r) => text(r).toLowerCase().includes(q));
  }, [rows, query, searchText, label]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => compare(col.value(a), col.value(b), sort.dir));
  }, [filtered, sort, columns]);

  const visible = expanded ? sorted : sorted.slice(0, initialVisible);
  const hidden = sorted.length - visible.length;

  const toggleSort = (col: MetricColumn<Row>) => {
    setSort((s) =>
      s?.key === col.key
        ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.defaultDirection ?? "desc" },
    );
  };

  return (
    <div className="w-full">
      {/* Controls in one row above the table — filter left, columns right. */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/75 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={filterPlaceholder}
            aria-label={filterPlaceholder}
            className="w-full h-9 pl-8 pr-8 rounded-lg bg-input/40 text-body text-foreground
                       placeholder:text-muted-foreground/75 outline-none
                       transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
                       focus:bg-input/60 focus:shadow-[0_0_0_2px_hsl(var(--ring)/0.45)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center
                         text-muted-foreground/75 hover:text-foreground active:scale-[0.96]
                         transition-[color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            aria-controls={pickerId}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-input/40
                       text-caption text-muted-foreground hover:text-foreground active:scale-[0.96]
                       transition-[color,background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Metrics</span>
            <span className="tabular-nums text-muted-foreground/75">{active.length}</span>
          </button>
          {pickerOpen && (
            // Outer radius 12px with 6px padding -> inner rows at 6px.
            <div
              id={pickerId}
              className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl bg-popover p-1.5"
              style={{
                boxShadow:
                  "0 0 0 1px hsl(var(--border) / 0.6), 0 2px 6px hsl(0 0% 0% / 0.28), " +
                  "0 12px 32px hsl(0 0% 0% / 0.32)",
              }}
            >
              <p className={`${TYPE.label} px-2 pt-1 pb-1.5`}>Columns</p>
              {columns.map((c) => {
                const on = c.locked || chosen.includes(c.key);
                return (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 px-2 h-10 rounded-md text-body
                                transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]
                                ${c.locked ? "opacity-50" : "cursor-pointer hover:bg-muted/40"}`}
                    title={c.hint}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={c.locked}
                      onChange={() =>
                        setChosen((prev) =>
                          prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key],
                        )
                      }
                      className="accent-[hsl(var(--primary))]"
                    />
                    <span className="flex-1 truncate">{c.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-body text-muted-foreground/75 py-6 text-center">
          {query ? `No rows match "${query}"` : emptyLabel}
        </p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="w-full border-collapse">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr>
                <th scope="col" className={`${HEADING.h4} text-left py-2 pr-3 whitespace-nowrap`}>
                  Name
                </th>
                {active.map((c) => {
                  const isSorted = sort?.key === c.key;
                  const Icon = !isSorted ? ChevronsUpDown : sort!.dir === "asc" ? ChevronUp : ChevronDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={isSorted ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                      className="py-0 px-0 whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        title={c.hint}
                        className={`${HEADING.h4} w-full h-10 px-3 inline-flex items-center justify-end gap-1
                                    hover:text-foreground active:scale-[0.96]
                                    transition-[color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]`}
                      >
                        <span>{c.label}</span>
                        <Icon
                          className={`w-3 h-3 shrink-0 ${isSorted ? "opacity-100" : "opacity-35"}`}
                          aria-hidden="true"
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={rowKey(r)}
                  className="border-t border-border/40 transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted/25"
                >
                  <td className="py-2.5 pr-3 align-top">
                    <div className="text-body text-foreground leading-snug" style={{ textWrap: "pretty" }}>
                      {label(r)}
                    </div>
                    {sublabel?.(r) && (
                      <div className="text-caption text-muted-foreground/80 leading-snug mt-0.5">
                        {sublabel(r)}
                      </div>
                    )}
                  </td>
                  {active.map((c) => {
                    const v = c.value(r);
                    return (
                      <td key={c.key} className="py-2.5 px-3 text-right align-top">
                        {v == null ? (
                          <span className="text-body text-muted-foreground/75" title="Not measured for this row">
                            —
                          </span>
                        ) : (
                          <span className="text-body text-foreground tabular-nums">{c.format(v)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 h-10 px-3 -ml-3 text-caption text-muted-foreground hover:text-foreground
                     active:scale-[0.96] transition-[color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
        >
          Show all <span className="tabular-nums">{sorted.length}</span> rows
        </button>
      )}
    </div>
  );
}
