// ─── Reading a whole table, not the first 1000 rows of it ─────────────
//
// PostgREST caps an unbounded SELECT at 1000 rows and says nothing about
// it: no error, no flag, no indication in the response that more exist.
// A query that forgets to paginate does not fail — it quietly returns a
// prefix, and any sum computed over that prefix looks exactly like a
// complete one.
//
// This has bitten the codebase before. `device_performance` truncated to
// 1000 of 1544 rows, which broke conversion_tracking_signal for two
// accounts, and is why selectAllPagination.test.ts exists. That fix was
// applied to the seed assembly's reader and nowhere else — the analysis
// summary path kept eight unpaginated reads of the SAME rollup tables,
// three of which pull an account's entire history and then filter by date
// in JavaScript. Truncation there does not just drop the tail: it can
// remove the very rows the requested window needs, so a 7-day preset can
// under-report against data that is sitting in the table.
//
// The rollups are per (entity x day), so the ceiling arrives early: one
// account's demographic_performance is roughly ads x age/gender buckets x
// days, which passes 1000 within a single month of ordinary delivery.
//
// One implementation, imported by both readers, so a table can never again
// be paginated on one path and truncated on another.

import { getSupabase } from "./supabase";

export type Row = Record<string, unknown>;

/**
 * Append `rows` to `target` one element at a time.
 *
 * `target.push(...rows)` passes every row as a call argument, and V8 throws
 * `RangeError: Maximum call stack size exceeded` once the spread reaches
 * roughly 125,000 elements (Node 22, measured). A page is 1,000 rows, so the
 * page loops were never at risk; the seed's per-(account, run) aggregation
 * was, and on 2026-09-05 it threw on the Pure Path ledger (162,141 rows)
 * in production and in the workspace alike, and the account shipped with no
 * ledger at all while every page had been read. Use this wherever a whole
 * table's rows are appended, never the spread.
 */
export function appendRows<T>(target: T[], rows: readonly T[]): T[] {
  for (const row of rows) target.push(row);
  return target;
}

/** PostgREST's default ceiling; also our page size. */
export const PAGE_SIZE = 1000;

/**
 * Select every row matching `build`, following pages until the table is
 * exhausted.
 *
 * `columns` exists for tables carrying bytea payloads: `select("*")` on
 * manual_imports dragged every uploaded file's bytes through PostgREST on
 * each read (observed live: 125 assets, roughly 257 MB of bytea and half a
 * gigabyte of hex JSON in one page — the request never completed and
 * production hung on the splash screen). Callers touching such tables MUST
 * enumerate the metadata columns they need.
 *
 * Ordering note: pagination by offset is only stable under a deterministic
 * sort. Callers that care about row order should order by a unique column
 * (typically `id`); callers that only aggregate do not, since a sum does
 * not depend on the order its terms arrive in.
 */
export async function selectAllRows(
  table: string,
  build?: (q: any) => any,
  columns = "*",
  opts: SelectAllOptions = {},
): Promise<Row[]> {
  if (opts.keyset) return selectAllByKeyset(table, opts.keyset, build, columns);
  const supabase = getSupabase();
  let offset = 0;
  const allRows: Row[] = [];
  for (;;) {
    let query: any = supabase.from(table).select(columns);
    if (build) query = build(query);
    query = query.range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase query failed for "${table}": ${error.message}`);
    }
    const rows: Row[] = data ?? [];
    appendRows(allRows, rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
}

export interface SelectAllOptions {
  /**
   * Page by a monotonic unique column instead of by offset: each page asks
   * for the rows AFTER the last one it received (`gt` on the column, ordered
   * by it, limited to PAGE_SIZE). The caller's `build` supplies the filter
   * and must not add an order of its own.
   *
   * Why it exists: an offset page over a large filtered set makes the
   * database produce and discard every row before the offset, so page N
   * costs N times page one and a 162,000-row read is 162 pages of a
   * repeated full scan and sort. On 2026-09-04 the seed's read of the
   * reconciliation ledger (292k rows across runs) did exactly that on every
   * rebuild: PostgREST killed the later pages on its statement timeout, the
   * read fell back to an empty evidence layer, and the next rebuild started
   * the storm again. Keyset pages walk the primary key from where the last
   * page stopped; the rows a run wrote are contiguous in id, so every page
   * is one short index range.
   */
  keyset?: string;
}

async function selectAllByKeyset(table: string, keyset: string, build?: (q: any) => any, columns = "*"): Promise<Row[]> {
  const supabase = getSupabase();
  const allRows: Row[] = [];
  let after: unknown = null;
  for (;;) {
    let query: any = supabase.from(table).select(columns);
    if (build) query = build(query);
    if (after !== null) query = query.gt(keyset, after);
    query = query.order(keyset, { ascending: true }).limit(PAGE_SIZE);
    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase query failed for "${table}": ${error.message}`);
    }
    const rows: Row[] = data ?? [];
    appendRows(allRows, rows);
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1]?.[keyset];
    if (last === undefined || last === null) {
      throw new Error(`Keyset pagination on "${table}" needs "${keyset}" in the selected columns`);
    }
    after = last;
  }
  return allRows;
}
