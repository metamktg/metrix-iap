// ─── Staged creative file cache (tenant-scoped) ───────────────────────
//
// Decoded bytes for staged `manual_imports` files, held in memory so the
// creative library does not re-fetch and re-decode the same asset for
// every card render. Two properties matter here, and they pull in
// different directions — this module exists to hold both at once.
//
// PERFORMANCE. Hex-decoding a bytea payload out of PostgREST is slow
// (10-17 s on large images) and twenty thumbnails mounting at once used to
// open twenty connections and trigger statement timeouts. So: a TTL cache
// of decoded Buffers, plus an in-flight map that coalesces concurrent
// requests for the same file into one query.
//
// TENANCY. Both of those maps return bytes WITHOUT consulting the
// database, which makes their keys an access-control decision. They were
// keyed by importId alone, and the caller's account-scoped query
// (`.eq("account_id", ...)`) ran only on a miss — so the cache was the one
// path to a staged file that never checked who owns it:
//
//   1. A member of account A fetches import X. It lands in the cache.
//   2. A member of account B requests import X. The route guard passes,
//      because they really do have access to B. The cache hits on X and
//      hands them A's bytes.
//
// Uncached, step 2 returns 404 — the query finds no row. Import ids are
// uuids, so this was never brute-forceable, but uuids are not secrets:
// they travel in URLs, screenshots, support tickets, HAR captures and
// server logs, and revoking a grant does not un-see the ids someone
// already had.
//
// The key is therefore (accountId, importId), so an entry can only ever be
// served back to the account it was fetched for, and the database stays the
// only thing that decides ownership. Do not reduce this key.
//
// The cache lives in one process's memory. On a multi-instance deployment
// each instance keeps its own copy — correct, just less effective. It is
// not a shared cache and must never become one without re-deciding the
// key, because a shared cache turns a local key mistake into a global one.

export const CREATIVE_FILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// Byte-bounded: the TTL alone let the cache grow to the whole creative
// library's decoded size (a real account holds 125 assets, roughly 257 MB —
// more RAM than the deployment instance can spare). Insertion order doubles
// as the eviction order (oldest first); a single file bigger than the cap is
// served without being cached at all.
export const CREATIVE_FILE_CACHE_MAX_BYTES = 64 * 1024 * 1024;

export interface CreativeFile {
  buf: Buffer;
  contentType: string;
  /** Original upload filename, used to name a downgraded download. */
  filename?: string | null;
}

interface CacheEntry extends CreativeFile {
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CreativeFile>>();
let cacheBytes = 0;

/** Cache key. The account id is half of it, and must stay half of it. */
function keyFor(accountId: string, importId: string): string {
  return `${accountId} ${importId}`;
}

function store(key: string, entry: CacheEntry): void {
  const prior = cache.get(key);
  if (prior) {
    cacheBytes -= prior.buf.length;
    cache.delete(key);
  }
  if (entry.buf.length > CREATIVE_FILE_CACHE_MAX_BYTES) return;
  for (const [evictKey, value] of cache) {
    if (cacheBytes + entry.buf.length <= CREATIVE_FILE_CACHE_MAX_BYTES) break;
    cache.delete(evictKey);
    cacheBytes -= value.buf.length;
  }
  cache.set(key, entry);
  cacheBytes += entry.buf.length;
}

/**
 * Serve a staged file's decoded bytes, fetching at most once per
 * (account, import) across concurrent callers.
 *
 * `load` is the account-scoped fetch — it MUST apply the account filter
 * itself and reject when the row does not belong to `accountId`. This
 * module decides only when to call it, never whether the caller is allowed.
 */
export async function getCreativeFile(
  accountId: string,
  importId: string,
  load: () => Promise<CreativeFile>,
): Promise<CreativeFile> {
  const key = keyFor(accountId, importId);

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = load()
    .then((file) => {
      store(key, { ...file, expires: Date.now() + CREATIVE_FILE_CACHE_TTL_MS });
      return file;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Test-only: drop everything so cases cannot leak state into each other. */
export function __resetCreativeFileCacheForTests(): void {
  cache.clear();
  inFlight.clear();
  cacheBytes = 0;
}
