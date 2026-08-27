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
): Promise<Row[]> {
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
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
}
