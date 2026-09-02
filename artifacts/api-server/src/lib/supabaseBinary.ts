// ─── Raw bytea reads through PostgREST binary output ──────────────────
//
// Why this exists (2026-09-02, first fresh-account validation run):
//
// Staged upload bytes live in `manual_imports.content` (bytea, up to 75 MB)
// and `manual_import_chunks.content`. Reading them with supabase-js means
// `select=content`, which PostgREST serves as JSON: Postgres hex-encodes
// the bytea (2× the bytes), wraps it in json_agg (another full copy in one
// backend's memory), PostgREST buffers the document, and Node parses a
// string twice the file size before decoding it back to bytes. One 50 MB
// file became a ~13 s query on the shared instance; the run that pulled
// FOUR staged files in ONE query — every kind at once, `.select("id,
// filename, content, kind")` — took the database down: PostgREST's threads
// were killed by its timeout manager, every request from 11:48 to well
// past 12:00 returned 522, and the app sat on its boot splash because the
// seed could not load either. That is the "reload stalls in the loading
// interface" report.
//
// PostgREST can return a single bytea cell as raw bytes when asked with
// `Accept: application/octet-stream` — no hex, no JSON, no aggregate, a
// streamed response. That is the only thing this module does. Rules:
//
//   • one cell per request, always `limit=1`;
//   • callers read files ONE AT A TIME (see loadImportContentBuffer), never
//     a list of rows with their content;
//   • the received length is checked against the row's own `size_bytes`
//     where the caller knows it — a short read is an error, not a file.

import { getSupabaseRest } from "./supabase";

export class ByteaReadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ByteaReadError";
  }
}

/**
 * Reads one bytea cell as raw bytes. `filters` are PostgREST query
 * operators, e.g. `{ id: "eq.<uuid>", account_id: "eq.<id>" }`.
 * Resolves to null when the query matches no row. A NULL cell comes back
 * as an empty buffer — callers that need to tell "empty" from "null"
 * compare against the row's `size_bytes`.
 */
export async function fetchByteaCell(
  table: string,
  column: string,
  filters: Record<string, string>,
): Promise<Buffer | null> {
  const { url, serviceRoleKey } = getSupabaseRest();
  const params = new URLSearchParams({ select: column, limit: "1" });
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  const res = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/octet-stream",
    },
  });
  // PostgREST answers 406 when binary output cannot be produced for the
  // request — including "no row matched", which is the only way it arises
  // for a single-column, limit=1 read of a bytea column.
  if (res.status === 406) return null;
  if (!res.ok) {
    throw new ByteaReadError(`Reading ${table}.${column} failed: HTTP ${res.status}`, res.status);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes;
}
