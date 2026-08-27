// ─── ad_performance, aggregated in Postgres ───────────────────────────
//
// The seed reads ad_performance for four things and nothing else: totals per
// result_type, the account's date window, the distinct book labels, and
// totals per ad_name. All four are GROUP BYs, and all four were being done
// in Node over every row of the widest and fastest-growing table in the
// schema — one row per ad, per result type, per day, retained across every
// analysis window.
//
// schema.sql defines three views for exactly those shapes. This module
// prefers them and falls back to the rows when they are absent.
//
// The fallback is not defensive padding. schema.sql is applied by the
// importer (`import:metrix`), not by the API server, so a deploy can reach
// production before the migration does. Without a fallback that ordering
// turns the seed into a 500; with one it is a slower seed and a log line.
//
// Which path ran is logged once per process rather than per request, because
// "is the optimisation actually on" is a question someone will need to answer
// from production logs, and a silent fallback answers it with silence.

import type { Row } from "./paginatedSelect";
import { selectAllRows } from "./paginatedSelect";

export interface EventTotals {
  spend: number; reach: number; impressions: number;
  results: number; clicks_all: number; link_clicks: number;
}
export interface AdTotals {
  spend: number; results: number; impressions: number;
  link_clicks: number; result_type: string | null;
}
export interface AccountSummary {
  window_start: string | null;
  window_end: string | null;
  books: string[];
  row_count: number;
}

export interface AdPerformanceAggregates {
  /** account_id -> result_type -> totals */
  eventTotals: Map<string, Map<string, EventTotals>>;
  /** account_id -> ad_name -> totals */
  adTotals: Map<string, Map<string, AdTotals>>;
  /** account_id -> window, books, row count */
  summary: Map<string, AccountSummary>;
  /** Which path produced this, for logging and for tests. */
  source: "views" | "rows";
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const str = (v: unknown): string => String(v ?? "");

/** Aggregate in Node, from raw rows. The original behaviour, kept exactly. */
export function aggregateFromRows(rows: Row[]): AdPerformanceAggregates {
  const eventTotals = new Map<string, Map<string, EventTotals>>();
  const adTotals = new Map<string, Map<string, AdTotals>>();
  const summary = new Map<string, AccountSummary>();

  for (const r of rows) {
    const acct = str(r["account_id"]);
    const event = str(r["result_type"]);

    const byEvent = eventTotals.get(acct) ?? new Map<string, EventTotals>();
    const e = byEvent.get(event) ?? {
      spend: 0, reach: 0, impressions: 0, results: 0, clicks_all: 0, link_clicks: 0,
    };
    e.spend += num(r["spend"]);
    e.reach += num(r["reach"]);
    e.impressions += num(r["impressions"]);
    e.results += num(r["results"]);
    e.clicks_all += num(r["clicks_all"]);
    e.link_clicks += num(r["link_clicks"]);
    byEvent.set(event, e);
    eventTotals.set(acct, byEvent);

    const adName = str(r["ad_name"]);
    if (adName) {
      const byAd = adTotals.get(acct) ?? new Map<string, AdTotals>();
      const a = byAd.get(adName) ?? {
        spend: 0, results: 0, impressions: 0, link_clicks: 0, result_type: null,
      };
      a.spend += num(r["spend"]);
      a.results += num(r["results"]);
      a.impressions += num(r["impressions"]);
      a.link_clicks += num(r["link_clicks"]);
      // Lowest wins, matching the view's min(result_type).
      //
      // The original took the FIRST row's value via `??=`, which depends on
      // row order — not stable across a re-ingestion, and not something SQL
      // can reproduce without an ORDER BY the table does not have. For an ad
      // measured against two result types the two paths would silently
      // disagree. min() is deterministic on both sides.
      const rt = r["result_type"] ? str(r["result_type"]) : null;
      if (rt && (a.result_type === null || rt < a.result_type)) a.result_type = rt;
      byAd.set(adName, a);
      adTotals.set(acct, byAd);
    }

    const s = summary.get(acct) ?? {
      window_start: null, window_end: null, books: [], row_count: 0,
    };
    const ds = r["date_start"] == null ? null : str(r["date_start"]);
    const de = r["date_end"] == null ? null : str(r["date_end"]);
    if (ds && (s.window_start === null || ds < s.window_start)) s.window_start = ds;
    if (de && (s.window_end === null || de > s.window_end)) s.window_end = de;
    const book = str(r["book"]);
    if (book && !s.books.includes(book)) s.books.push(book);
    s.row_count += 1;
    summary.set(acct, s);
  }

  for (const s of summary.values()) s.books.sort();
  return { eventTotals, adTotals, summary, source: "rows" };
}

/** Shape the three views' rows into the same maps. */
export function aggregateFromViews(
  eventRows: Row[], adRows: Row[], summaryRows: Row[],
): AdPerformanceAggregates {
  const eventTotals = new Map<string, Map<string, EventTotals>>();
  for (const r of eventRows) {
    const acct = str(r["account_id"]);
    const m = eventTotals.get(acct) ?? new Map<string, EventTotals>();
    m.set(str(r["result_type"]), {
      spend: num(r["spend"]), reach: num(r["reach"]), impressions: num(r["impressions"]),
      results: num(r["results"]), clicks_all: num(r["clicks_all"]), link_clicks: num(r["link_clicks"]),
    });
    eventTotals.set(acct, m);
  }

  const adTotals = new Map<string, Map<string, AdTotals>>();
  for (const r of adRows) {
    const acct = str(r["account_id"]);
    const m = adTotals.get(acct) ?? new Map<string, AdTotals>();
    m.set(str(r["ad_name"]), {
      spend: num(r["spend"]), results: num(r["results"]),
      impressions: num(r["impressions"]), link_clicks: num(r["link_clicks"]),
      result_type: r["result_type"] == null ? null : str(r["result_type"]),
    });
    adTotals.set(acct, m);
  }

  const summary = new Map<string, AccountSummary>();
  for (const r of summaryRows) {
    summary.set(str(r["account_id"]), {
      window_start: r["window_start"] == null ? null : str(r["window_start"]),
      window_end: r["window_end"] == null ? null : str(r["window_end"]),
      books: Array.isArray(r["books"]) ? (r["books"] as unknown[]).map(str).filter(Boolean).sort() : [],
      row_count: num(r["row_count"]),
    });
  }

  return { eventTotals, adTotals, summary, source: "views" };
}

/** Logged once per process — see the note at the top of this file. */
let announced = false;

/**
 * Prefer the views; fall back to the rows.
 *
 * `fetchRows` is injected so the fallback uses the caller's own projection
 * and ordering rather than this module guessing at them, and so a test can
 * drive both paths without a database.
 */
export async function loadAdPerformanceAggregates(
  fetchRows: () => Promise<Row[]>,
  log?: (msg: string) => void,
): Promise<AdPerformanceAggregates> {
  try {
    const [eventRows, adRows, summaryRows] = await Promise.all([
      selectAllRows("ad_performance_event_totals"),
      selectAllRows("ad_performance_ad_totals"),
      selectAllRows("ad_performance_account_summary"),
    ]);
    if (!announced) {
      announced = true;
      log?.("ad_performance aggregates: reading the Postgres views");
    }
    return aggregateFromViews(eventRows, adRows, summaryRows);
  } catch (err) {
    if (!announced) {
      announced = true;
      log?.(
        "ad_performance aggregates: the views are not present, aggregating in Node instead. " +
          "Apply schema.sql (pnpm --filter @workspace/scripts run import:metrix) to use them. " +
          `Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return aggregateFromRows(await fetchRows());
  }
}
