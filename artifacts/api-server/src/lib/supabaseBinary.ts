// ─── Raw bytea reads through PostgREST binary output ──────────────────
//
// Why this exists (2026-09-02, first fresh-account validation run):
//
// Staged upload bytes live in `manual_imports.content` (bytea, up to 75 MB)
// and `manual_import_chunks.content`. Reading them with supabase-js means
// `select=content`, which PostgREST serves as JSON: Postgres hex-encodes
// the bytea (2× the bytes), wraps it in json_agg (another full copy in one
// backend's memory), PostgREST buffers the document, and Node parses a
// string twice the file size before decoding it back to bytes. The run
// that pulled FOUR staged files in ONE such query took the database down
// for over an hour (register §13.1).
//
// PostgREST can return bytes raw when asked with `Accept:
// application/octet-stream`. On this project it REFUSES that for a table
// column (406, confirmed in the edge logs on the first re-run after the
// fix) but honours it for a function returning bytea — the documented
// path — and on PostgREST 12+ only when the function RETURNS a domain
// named after the media type ("application/octet-stream" as bytea); a
// plain bytea return is refused the same way. So the readers are two SQL
// functions in schema.sql
// (`manual_import_content`, `manual_import_chunk_content`), executable by
// the service role only, and this module calls them: one cell per
// request, no hex, no JSON, no aggregate.
//
// If binary output is ever refused again (a PostgREST upgrade, a config
// change), the fallback is the ONE thing that was always safe: a single
// row's `content` as JSON, one file at a time. That is 2× the bytes in
// memory for one file, which the instance handled for years — what it
// could not handle was every file at once. The fallback logs so it is
// never silent.

import { getSupabase, getSupabaseRest } from "./supabase";
import { logger } from "./logger";

export class ByteaReadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ByteaReadError";
  }
}

/** Decodes PostgREST's JSON rendering of a bytea (`\x…` hex, or raw text). */
export function decodeByteaJson(value: string): Buffer {
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  return Buffer.from(value, "utf8");
}

async function callBinaryRpc(fn: string, args: Record<string, string | number>): Promise<Buffer | null> {
  const { url, serviceRoleKey } = getSupabaseRest();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/octet-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (res.status === 406) return null;
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new ByteaReadError(`rpc/${fn} failed: HTTP ${res.status} ${detail}`, res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** JSON fallback: ONE row's bytea column, as PostgREST's hex string. */
async function selectSingleBytea(
  table: string,
  column: string,
  filters: Record<string, string | number>,
): Promise<Buffer | null> {
  let q = getSupabase().from(table).select(column);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q.limit(1);
  if (error) throw new ByteaReadError(`${table}.${column} fallback read failed: ${error.message}`);
  if (!data || data.length === 0) return null;
  const cell = (data[0] as unknown as Record<string, unknown>)[column];
  if (cell === null || cell === undefined) return Buffer.alloc(0);
  if (typeof cell !== "string") throw new ByteaReadError(`${table}.${column} fallback read returned a non-string cell`);
  return decodeByteaJson(cell);
}

/**
 * Bytes of one staged import's inline `content`. Resolves to null when no
 * row matches; a NULL cell (chunked import) comes back as an empty buffer.
 */
export async function fetchImportContent(importId: string): Promise<Buffer | null> {
  const viaRpc = await callBinaryRpc("manual_import_content", { p_import_id: importId });
  if (viaRpc !== null) return viaRpc;
  logger.warn({ importId }, "PostgREST refused binary output for manual_import_content; falling back to a single-row JSON read");
  return selectSingleBytea("manual_imports", "content", { id: importId });
}

/** Bytes of one chunk of a chunked import. Null when no such chunk. */
export async function fetchImportChunk(importId: string, chunkIndex: number): Promise<Buffer | null> {
  const viaRpc = await callBinaryRpc("manual_import_chunk_content", {
    p_import_id: importId,
    p_chunk_index: chunkIndex,
  });
  if (viaRpc !== null) return viaRpc;
  logger.warn({ importId, chunkIndex }, "PostgREST refused binary output for manual_import_chunk_content; falling back to a single-row JSON read");
  return selectSingleBytea("manual_import_chunks", "content", { import_id: importId, chunk_index: chunkIndex });
}
