// ─── SortableTable ─────────────────────────────────────────────────────
// Generic sortable data table with the shared analysis-table look:
// sticky tokenized header, 14px cells, tabular numerals, hover rows.
// Column defs drive both rendering and sorting; null sort values always
// sink to the bottom so honest "—" gaps never fake a ranking position.

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortableColumn<T> {
  id: string;
  header: React.ReactNode;
  /** Right-align (numeric) column. */
  right?: boolean;
  /** Provide to make the column sortable. Return null for missing data. */
  sortValue?: (row: T) => number | string | null;
  cell: (row: T) => React.ReactNode;
  /** Extra classes for body cells. */
  className?: string;
}

export interface SortState {
  columnId: string;
  direction: "asc" | "desc";
}

function compareValues(a: number | string | null, b: number | string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last, regardless of direction
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
}

export function sortRows<T>(rows: T[], columns: SortableColumn<T>[], sort: SortState | null): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.columnId);
  if (!col?.sortValue) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((ra, rb) => {
    const va = col.sortValue!(ra);
    const vb = col.sortValue!(rb);
    if (va == null || vb == null) return compareValues(va, vb); // nulls last always
    return compareValues(va, vb) * dir;
  });
}

export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  maxHeightClass = "max-h-[520px]",
  emptyMessage = "No rows to display.",
}: {
  columns: SortableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  initialSort?: SortState;
  maxHeightClass?: string;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  const toggleSort = (col: SortableColumn<T>) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.columnId !== col.id) return { columnId: col.id, direction: "desc" };
      if (prev.direction === "desc") return { columnId: col.id, direction: "asc" };
      return null; // third click clears back to source order
    });
  };

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden bg-white/[0.015]">
      <div className={cn("overflow-x-auto overflow-y-auto", maxHeightClass)}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-table-header z-10">
            <tr className="border-b border-border/40">
              {columns.map((col) => {
                const active = sort?.columnId === col.id;
                const sortable = Boolean(col.sortValue);
                return (
                  <th
                    key={col.id}
                    aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "text-label font-mono uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 py-2.5",
                      col.right ? "text-right" : "text-left"
                    )}
                  >
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(col)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
                          col.right && "flex-row-reverse",
                          active && "text-foreground"
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort!.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-body text-muted-foreground/60">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={cn("border-b border-border/20 hover:bg-white/[0.02]", onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      "px-3 py-2.5 text-sm text-foreground/85 align-top",
                      col.right && "text-right tabular-nums",
                      col.className
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
