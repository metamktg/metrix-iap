// ─── Seed payload budget ──────────────────────────────────────────────
//
// The seed is a bootstrap payload: ONE document containing every ad
// account the signed-in user may see, each with its full nested `iap`
// object, fetched once at app boot and held in a React context for the
// session. That shape is what makes account switching instant, agency
// rollups computable client-side, and cross-page navigation free of
// loading states — real benefits, deliberately chosen.
//
// Its cost is that both halves are O(every account), not O(the account
// being looked at). The server assembles all of them on every cache miss;
// the browser downloads and parses all of them to render one page. At the
// current 11 accounts that is ~1.2 MB and nobody notices. The growth is
// linear in accounts and in each account's history, and the heavy part is
// not the account list — it is the nested analysis blobs (one account's
// conversion_tracking_signal alone is 172 KB).
//
// This platform has already been bitten by exactly this, once, at the
// exact same place: BUG-25, where the seed dragged every creative file's
// bytes along and production hung on the splash screen. That was found by
// a user watching a spinner, because nothing was watching the payload.
//
// So: watch the payload. This does not fix the architecture — the fix is
// to split the seed into a thin index plus per-account detail fetched on
// demand, which the per-account analysis endpoints already exist to serve
// — but it means the next approach to the ceiling is a log line with the
// responsible account named, rather than a support ticket.

import { logger } from "./logger";

/**
 * Warn above this. Chosen as roughly 4x today's real payload: high enough
 * that ordinary growth is silent, low enough to fire with room to act.
 */
export const SEED_WARN_BYTES = 5 * 1024 * 1024;

/** Above this, say plainly that the page load is the thing at risk. */
export const SEED_CRITICAL_BYTES = 12 * 1024 * 1024;

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * Measure an assembled seed and log if it has grown past its budget.
 *
 * Attributes the size to the accounts driving it, because "the seed is
 * big" is not actionable and "these three accounts are 80% of it" is.
 * Returns the measured byte length so callers can surface it if useful.
 */
export function checkSeedBudget(seed: Record<string, unknown>): number {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(seed));
  } catch {
    // Never let observability break the request it is observing.
    return 0;
  }
  if (bytes < SEED_WARN_BYTES) return bytes;

  const accounts = Array.isArray(seed["ad_accounts"]) ? (seed["ad_accounts"] as Record<string, unknown>[]) : [];
  const heaviest = accounts
    .map((a) => {
      let size = 0;
      try {
        size = Buffer.byteLength(JSON.stringify(a));
      } catch {
        size = 0;
      }
      return { id: String(a["id"] ?? "unknown"), bytes: size };
    })
    .sort((x, y) => y.bytes - x.bytes)
    .slice(0, 5)
    .map((a) => ({ id: a.id, size: MB(a.bytes) }));

  const detail = {
    seedBytes: bytes,
    seedSize: MB(bytes),
    accountCount: accounts.length,
    heaviest,
  };

  if (bytes >= SEED_CRITICAL_BYTES) {
    logger.error(
      detail,
      "metrixSeedAssembly: seed payload is large enough to slow the app's first paint — " +
        "every signed-in user downloads and parses this on boot. Split the bundle into a thin " +
        "index plus per-account detail before it grows further.",
    );
  } else {
    logger.warn(
      detail,
      "metrixSeedAssembly: seed payload has passed its budget. It is assembled for every " +
        "account on each cache miss and parsed in full by every client.",
    );
  }
  return bytes;
}
