// Overlap resolution between staged files that describe the same delivery.
//
// Staging is additive by design: two weekly exports of one class union into
// a month. It is NOT additive when two files carry the same ads over the
// same days or the same period, and until 2026-09-04 nothing stopped that:
// the Pure Path account staged a Platform × Placement export and a
// Platform × Placement × Impression device export of the same 28 days, two
// daily Ad Summaries (28 and 30 days), and two Gender × Age exports. Every
// class summed its files, the daily ad rows put each whole-period file's
// 28-day total on one day, and the account read $4.07M against Meta's
// $1.44M (register §15).
//
// One rule, used by the engine's class arrays, the reconciliation
// observations and the truth candidates alike, so the three can never
// disagree about which file counts:
//
//   For every ad a file covers, on every day (a daily file) or over its
//   period (a whole-period file):
//     1. a DAILY file beats a WHOLE-PERIOD file of the same kind for that
//        ad (days sum to the period; the period cannot be split into days)
//     2. otherwise the file carrying the FINER breakdown wins (its margin
//        reproduces the coarser file; the coarser file adds nothing)
//     3. on equal depth the LATER-STAGED file wins (a re-export supersedes)
//   Rows of the losing file for that ad/day are not counted; the loss is
//   recorded per pair with row count and spend so the run can say what it
//   did and the reader can remove a file that carries nothing.
//
// Disjoint files (different ads, different days) never lose a row. Nothing
// here is scaled, averaged or blended. Pure; no I/O.

/** One staged file as the resolver sees it. `order` is staging order, earlier first. */
export interface OverlapSource {
  id: string;
  order: number;
  /** Delivery dimensions the file breaks down by (Gender, Age, Platform, Placement, Impression device …). */
  depth: number;
  /** Rows are dated by day. False for a whole-period export. */
  daily: boolean;
}

/** What a row covers: an ad (or an ad × result type × asset type for observations) on a day, or over the file's period (`day: null`). */
export interface OverlapKey {
  group: string;
  day: string | null;
}

export type OverlapReason = "daily_over_period" | "finer_breakdown" | "later_staged";

const SEP = "";

function better(a: OverlapSource, b: OverlapSource): OverlapSource {
  if (b.depth !== a.depth) return b.depth > a.depth ? b : a;
  return b.order > a.order ? b : a;
}

/**
 * Two passes: `register` every row's key in pass 1, ask `winner` for each
 * key in pass 2. A whole-period key loses to the group's best daily source
 * when one exists; every other key goes to the deepest, then latest, file.
 */
export class OverlapResolver {
  private readonly candidates = new Map<string, OverlapSource[]>();
  private readonly bestDaily = new Map<string, OverlapSource>();

  register(source: OverlapSource, key: OverlapKey): void {
    const k = `${key.group}${SEP}${key.day ?? ""}`;
    const list = this.candidates.get(k);
    if (!list) this.candidates.set(k, [source]);
    else if (!list.some((s) => s.id === source.id)) list.push(source);
    if (key.day !== null && source.daily) {
      const cur = this.bestDaily.get(key.group);
      this.bestDaily.set(key.group, cur ? better(cur, source) : source);
    }
  }

  winner(key: OverlapKey): OverlapSource | null {
    if (key.day === null) {
      const daily = this.bestDaily.get(key.group);
      if (daily) return daily;
    }
    const list = this.candidates.get(`${key.group}${SEP}${key.day ?? ""}`);
    if (!list || list.length === 0) return null;
    return list.reduce((best, s) => better(best, s));
  }

  /** Why `winner` beat `loser` for a key, in the rule's order. */
  static reason(loser: OverlapSource, winner: OverlapSource): OverlapReason {
    if (winner.daily && !loser.daily) return "daily_over_period";
    if (winner.depth > loser.depth) return "finer_breakdown";
    return "later_staged";
  }
}

export interface OverlapSupersession {
  loser: string;
  winner: string;
  reason: OverlapReason;
  /** Rows of the losing file not counted. */
  rows: number;
  /** Their spend (the reference metric), rounded to cents. */
  spend: number;
  /** Distinct groups (ads) the loser gave up. */
  groups: number;
}

export interface OverlapFile<Row> {
  source: OverlapSource;
  rows: readonly Row[];
}

export interface OverlapResolution<Row> {
  /** Kept rows per source id, in the file's own row order. */
  kept: Map<string, Row[]>;
  /** One record per (loser, winner, reason), rows and spend summed. */
  superseded: OverlapSupersession[];
}

/**
 * Resolves the overlaps between the files of one class and returns what
 * each file still contributes. `keyOf` names what a row covers; `spendOf`
 * reads the row's spend for the record (0 when the row carries none).
 */
export function resolveClassOverlaps<Row>(
  files: readonly OverlapFile<Row>[],
  keyOf: (row: Row, source: OverlapSource) => OverlapKey,
  spendOf: (row: Row) => number,
): OverlapResolution<Row> {
  const resolver = new OverlapResolver();
  for (const file of files) {
    for (const row of file.rows) resolver.register(file.source, keyOf(row, file.source));
  }
  const kept = new Map<string, Row[]>();
  const records = new Map<string, OverlapSupersession & { groupSet: Set<string> }>();
  for (const file of files) {
    const mine: Row[] = [];
    for (const row of file.rows) {
      const key = keyOf(row, file.source);
      const win = resolver.winner(key);
      if (!win || win.id === file.source.id) {
        mine.push(row);
        continue;
      }
      const reason = OverlapResolver.reason(file.source, win);
      const rk = `${file.source.id}${SEP}${win.id}${SEP}${reason}`;
      let rec = records.get(rk);
      if (!rec) {
        rec = { loser: file.source.id, winner: win.id, reason, rows: 0, spend: 0, groups: 0, groupSet: new Set() };
        records.set(rk, rec);
      }
      rec.rows += 1;
      rec.spend += spendOf(row);
      rec.groupSet.add(key.group);
    }
    kept.set(file.source.id, mine);
  }
  const superseded = [...records.values()].map(({ groupSet, ...rec }) => ({
    ...rec,
    spend: Math.round(rec.spend * 100) / 100,
    groups: groupSet.size,
  }));
  return { kept, superseded };
}
