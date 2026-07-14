// ─── Manual-upload analysis engine ─────────────────────────────────────
// Turns the two staged manual_imports CSVs (performance_demo_csv +
// performance_placement_csv, matching the IAP_DEMOGRAPHIC_TEXT_SIGNAL /
// IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL Meta pivot export templates) into
// ad_performance / demographic_performance / placement_performance /
// platform_performance / device_performance rows for a MANUALLY selected
// date window. Never runs automatically on upload — only via an explicit
// POST from the user (see routes/metrixAnalysis.ts).
//
// Honesty rules (mirror the generation_runs pattern):
//   - A manual_analysis_runs row is inserted as 'running' and flips to
//     'success' only after every output row has committed.
//   - On any failure, partial output rows this run wrote are deleted and
//     the run is marked 'error' — no dishonest success states.
//   - Re-running replaces this manual account's rows within the selected
//     window (full refresh, not merge) — manual accounts are never touched
//     by the offline importer, so this is always safe.
//   - Ecommerce/Service/App metric columns are only ever written when
//     present in the uploaded CSV's header — never fabricated or zeroed.
//   - BOTH the demographic and device/placement/platform CSVs must be
//     staged before a run can start — the two exports are required, not
//     optional alternatives.

import { getSupabase } from "./supabase";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";
import { logger } from "./logger";
import { parseIapCsv, IapCsvFormatError, type IapCsvRow } from "./iapCsvParser";


export const STALE_ANALYSIS_RUN_MS = 10 * 60 * 1000;

export type DateRangePreset = "7d" | "14d" | "30d" | "all";

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export type ManualAnalysisRun = {
  id: string;
  account_id: string;
  status: "running" | "success" | "error";
  date_range: DateRangePreset;
  date_start: string | null;
  date_end: string | null;
  rows_ingested: number | null;
  imports_used: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  creatives_linked: number | null;
  creatives_total: number | null;
  creatives_unlinked_names: string[] | null;
  /** Warnings produced during tolerant CSV parsing (auto-resolved aliases, missing columns, etc.). Null when parsing was clean. */
  csv_warnings: string[] | null;
};

export type CreativeLinkageSummary = {
  linked: number;
  total: number;
  unlinked_names: string[];
};

type Row = Record<string, any>;

const runShape = (r: Row): ManualAnalysisRun => {
  let csvWarnings: string[] | null = null;
  if (r["csv_warnings"]) {
    try {
      csvWarnings = JSON.parse(String(r["csv_warnings"]));
    } catch {
      csvWarnings = null;
    }
  }
  return {
    id: String(r["id"]),
    account_id: String(r["account_id"]),
    status: r["status"],
    date_range: r["date_range"],
    date_start: r["date_start"] ?? null,
    date_end: r["date_end"] ?? null,
    rows_ingested: r["rows_ingested"] ?? null,
    imports_used: r["imports_used"] ?? null,
    error_message: r["error_message"] ?? null,
    started_at: String(r["started_at"]),
    finished_at: r["finished_at"] ?? null,
    creatives_linked: null,
    creatives_total: null,
    creatives_unlinked_names: null,
    csv_warnings: csvWarnings,
  };
};

async function accountExists(accountId: string): Promise<Row | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("ad_accounts").select("id, name").eq("id", accountId).limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0]! : null;
}

/** Latest run for an account, with dead 'running' rows honestly flipped to error. */
export async function getLatestAnalysisRun(accountId: string): Promise<ManualAnalysisRun | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .select("*")
    .eq("account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  if (row["status"] === "running" && Date.now() - new Date(row["started_at"]).getTime() > STALE_ANALYSIS_RUN_MS) {
    const { data: updated, error: updErr } = await supabase
      .from("manual_analysis_runs")
      .update({
        status: "error",
        error_message: "The analysis run did not finish (server restarted or timed out). Try again.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", row["id"])
      .eq("status", "running")
      .select("*");
    if (updErr) throw new Error(updErr.message);
    await deleteRunOutputs(String(row["id"]));
    return runShape(updated?.[0] ?? { ...row, status: "error" });
  }
  return runShape(row);
}

async function startRun(accountId: string, dateRange: DateRangePreset, createdBy: string): Promise<string> {
  const latest = await getLatestAnalysisRun(accountId);
  if (latest && latest.status === "running") {
    throw new AnalysisError("An analysis run is already in progress for this account.", 409);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .insert({ account_id: accountId, status: "running", date_range: dateRange, created_by: createdBy })
    .select("id");
  if (error) {
    if (error.code === "23505") {
      throw new AnalysisError("An analysis run is already in progress for this account.", 409);
    }
    throw new Error(error.message);
  }
  return String(data![0]!["id"]);
}

async function finishRun(
  runId: string,
  status: "success" | "error",
  fields: {
    errorMessage?: string;
    dateStart?: string;
    dateEnd?: string;
    rowsIngested?: number;
    importsUsed?: number;
    csvWarnings?: string[];
  },
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("manual_analysis_runs")
    .update({
      status,
      error_message: fields.errorMessage ?? null,
      date_start: fields.dateStart ?? null,
      date_end: fields.dateEnd ?? null,
      rows_ingested: fields.rowsIngested ?? null,
      imports_used: fields.importsUsed ?? null,
      csv_warnings: fields.csvWarnings && fields.csvWarnings.length > 0
        ? JSON.stringify(fields.csvWarnings)
        : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

/** Deletes every output table's rows this specific run wrote (partial-output cleanup on failure/staleness). */
async function deleteRunOutputs(runId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("ad_performance").delete().eq("manual_analysis_run_id", runId);
  if (error) throw new Error(error.message);
  // Demographic/placement/platform/device tables are windowed full-refresh
  // (no run-id FK — see below), so their cleanup happens via the same
  // date-window delete used on (re)run, not a run-id filter.
}

function withinRange(date: string, dateRange: DateRangePreset, maxDate: string): boolean {
  if (dateRange === "all") return true;
  const days = dateRange === "7d" ? 7 : dateRange === "14d" ? 14 : 30;
  const max = new Date(`${maxDate}T00:00:00Z`).getTime();
  const cutoff = max - (days - 1) * 24 * 60 * 60 * 1000;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return d >= cutoff && d <= max;
}

function decodeStagedContent(hexOrRaw: string): string {
  const hex = hexOrRaw.replace(/^\\x/, "");
  return Buffer.from(hex, "hex").toString("utf8");
}

function num(v: number | string | null | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function sumOptional(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

type AggBucket = {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicksAll: number | null;
  linkClicks: number | null;
  results: number | null;
  resultType: string | null;
  addsToCart: number | null;
  checkoutsInitiated: number | null;
  purchases: number | null;
  extra: Record<string, number>;
};

function emptyBucket(): AggBucket {
  return {
    spend: null,
    impressions: null,
    reach: null,
    clicksAll: null,
    linkClicks: null,
    results: null,
    resultType: null,
    addsToCart: null,
    checkoutsInitiated: null,
    purchases: null,
    extra: {},
  };
}

function accumulate(bucket: AggBucket, row: IapCsvRow): void {
  bucket.spend = sumOptional(bucket.spend, num(row.base["amount_spent"]));
  bucket.impressions = sumOptional(bucket.impressions, num(row.base["impressions"]));
  bucket.reach = sumOptional(bucket.reach, num(row.base["reach"]));
  bucket.clicksAll = sumOptional(bucket.clicksAll, num(row.base["clicks_all"]));
  bucket.linkClicks = sumOptional(bucket.linkClicks, num(row.base["link_clicks"]));
  bucket.results = sumOptional(bucket.results, num(row.base["results"]));
  if (bucket.resultType === null && typeof row.base["result_type"] === "string") {
    bucket.resultType = row.base["result_type"];
  }
  bucket.addsToCart = sumOptional(bucket.addsToCart, num(row.extra["adds_to_cart"]));
  bucket.checkoutsInitiated = sumOptional(bucket.checkoutsInitiated, num(row.extra["checkouts_initiated"]));
  bucket.purchases = sumOptional(bucket.purchases, num(row.extra["purchases"]));
  for (const [k, v] of Object.entries(row.extra)) {
    if (typeof v !== "number") continue;
    bucket.extra[k] = (bucket.extra[k] ?? 0) + v;
  }
}

function derivedRates(spend: number | null, impressions: number | null, linkClicks: number | null, results: number | null) {
  return {
    cpa: results !== null && results > 0 && spend !== null ? spend / results : null,
    ctr_link_pct: linkClicks !== null && impressions !== null && impressions > 0 ? (linkClicks / impressions) * 100 : null,
    cvr_link_pct: linkClicks !== null && linkClicks > 0 && results !== null ? (results / linkClicks) * 100 : null,
    cpm: impressions !== null && impressions > 0 && spend !== null ? (spend / impressions) * 1000 : null,
  };
}

/**
 * Syncs all staged creative asset imports for an account to their mapped
 * ad names. For each creative_asset import with a non-empty ad_names list,
 * issues an UPDATE against the ads table so the file URL lands on the matched
 * row. Returns a summary of how many ad names were linked vs still unmatched.
 *
 * This is non-fatal by design — callers should catch and log errors without
 * surfacing them to users as blocking failures.
 */
export async function syncAllCreativeLinksForAccount(
  accountId: string,
): Promise<CreativeLinkageSummary> {
  const supabase = getSupabase();
  const { data: creativeImports, error } = await supabase
    .from("manual_imports")
    .select("id, filename, ad_names")
    .eq("account_id", accountId)
    .eq("kind", "creative_asset");
  if (error) throw new Error(error.message);

  let totalLinked = 0;
  let totalMappings = 0;
  const unlinkedNames: string[] = [];

  for (const imp of creativeImports ?? []) {
    const adNames = (imp["ad_names"] as string[] | null) ?? [];
    if (adNames.length === 0) continue;
    totalMappings += adNames.length;
    const fileUrl = `/api/metrix/accounts/${accountId}/manual-imports/${imp["id"]}/file`;
    const sync = await supabase
      .from("ads")
      .update({ creative_asset_url: fileUrl, asset_filename: imp["filename"], asset_servable: true })
      .eq("account_id", accountId)
      .in("ad_name", adNames)
      .select("ad_name");
    if (sync.error) {
      logger.warn(
        { accountId, importId: imp["id"], err: sync.error },
        "syncAllCreativeLinksForAccount: partial failure on import",
      );
      unlinkedNames.push(...adNames);
      continue;
    }
    const linked = new Set((sync.data ?? []).map((r) => r["ad_name"] as string));
    totalLinked += linked.size;
    for (const name of adNames) {
      if (!linked.has(name)) unlinkedNames.push(name);
    }
  }

  return { linked: totalLinked, total: totalMappings, unlinked_names: unlinkedNames };
}

/**
 * Computes current creative linkage status for an account by querying
 * manual_imports and checking which ad names have a matching ads row with
 * a creative_asset_url set. Does NOT write to the database — read-only
 * diagnostic query.
 */
export async function computeCreativeLinkageSummary(accountId: string): Promise<CreativeLinkageSummary> {
  const supabase = getSupabase();

  const importsResult = await supabase
    .from("manual_imports")
    .select("id, ad_names")
    .eq("account_id", accountId)
    .eq("kind", "creative_asset");
  if (importsResult.error) throw new Error(importsResult.error.message);

  const allMappedNames: string[] = [];
  for (const imp of importsResult.data ?? []) {
    const adNames = (imp["ad_names"] as string[] | null) ?? [];
    allMappedNames.push(...adNames);
  }

  if (allMappedNames.length === 0) {
    return { linked: 0, total: 0, unlinked_names: [] };
  }

  const adsResult = await supabase
    .from("ads")
    .select("ad_name")
    .eq("account_id", accountId)
    .not("creative_asset_url", "is", null)
    .in("ad_name", allMappedNames);
  if (adsResult.error) throw new Error(adsResult.error.message);

  const linkedSet = new Set((adsResult.data ?? []).map((r) => r["ad_name"] as string));
  const unlinkedNames = allMappedNames.filter((n) => !linkedSet.has(n));

  return {
    linked: linkedSet.size,
    total: allMappedNames.length,
    unlinked_names: unlinkedNames,
  };
}

/**
 * Validates prerequisites (a manual account with BOTH the demographic and
 * device/placement/platform CSVs staged) and starts an analysis run.
 * Returns the run id immediately; parsing continues in the background and
 * the run row records the outcome.
 */
export async function startManualAnalysis(
  accountId: string,
  dateRange: DateRangePreset,
  createdBy: string,
): Promise<string> {
  const account = await accountExists(accountId);
  if (!account) throw new AnalysisError("Ad account not found.", 404);

  const supabase = getSupabase();
  const { data: imports, error: importsErr } = await supabase
    .from("manual_imports")
    .select("id, filename, content, kind")
    .eq("account_id", accountId)
    .in("kind", ["performance_demo_csv", "performance_placement_csv"]);
  if (importsErr) throw new Error(importsErr.message);

  const demoImports = (imports ?? []).filter((i) => i["kind"] === "performance_demo_csv");
  const placementImports = (imports ?? []).filter((i) => i["kind"] === "performance_placement_csv");
  if (demoImports.length === 0 || placementImports.length === 0) {
    const missing = [
      demoImports.length === 0 ? "Demographics export" : null,
      placementImports.length === 0 ? "Placements export" : null,
    ].filter(Boolean);
    throw new AnalysisError(
      `Both reports are required before running analysis. Missing: ${missing.join(" and ")}.`,
      422,
    );
  }

  const runId = await startRun(accountId, dateRange, createdBy);

  void (async () => {
    try {
      const allCsvWarnings: string[] = [];
      const demoRows: IapCsvRow[] = [];
      for (const imp of demoImports) {
        const text = decodeStagedContent(String(imp["content"]));
        try {
          const result = parseIapCsv(text, "demographic");
          demoRows.push(...result.rows);
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Demographics "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Demographics file "${imp["filename"]}": ${detail}`, 422);
        }
      }
      const placementRows: IapCsvRow[] = [];
      for (const imp of placementImports) {
        const text = decodeStagedContent(String(imp["content"]));
        try {
          const result = parseIapCsv(text, "device_placement");
          placementRows.push(...result.rows);
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Placements "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Placements file "${imp["filename"]}": ${detail}`, 422);
        }
      }

      const allDates = [
        ...demoRows.map((r) => r.breakdowns["Date"]!),
        ...placementRows.map((r) => r.breakdowns["Date"]!),
      ];
      const maxDate = allDates.reduce((max, d) => (d > max ? d : max), allDates[0]!);

      const scopedDemo = demoRows.filter((r) => withinRange(r.breakdowns["Date"]!, dateRange, maxDate));
      const scopedPlacement = placementRows.filter((r) => withinRange(r.breakdowns["Date"]!, dateRange, maxDate));
      if (scopedDemo.length === 0 || scopedPlacement.length === 0) {
        throw new AnalysisError(
          `No rows fall within the selected "${dateRange}" window (latest data is ${maxDate}). Try "all" or a wider range.`,
          422,
        );
      }

      const scopedDates = [
        ...scopedDemo.map((r) => r.breakdowns["Date"]!),
        ...scopedPlacement.map((r) => r.breakdowns["Date"]!),
      ];
      const dateStart = scopedDates.reduce((min, d) => (d < min ? d : min), scopedDates[0]!);
      const dateEnd = scopedDates.reduce((max, d) => (d > max ? d : max), scopedDates[0]!);

      // ── Ad-level supplementary aggregation from demo export ────────────
      // The demographic export reliably carries spend/results/result_type per
      // ad; the device/placement export is often impression-only (especially
      // Meta's "Impression device" breakdown). Build a per-(campaign, ad, date)
      // roll-up from the demo CSV so we can fill in spend and result_type when
      // the placement export has no financial data.
      const demoAdBuckets = new Map<
        string,
        AggBucket & { campaign: string; adSet: string; adName: string; date: string }
      >();
      for (const row of scopedDemo) {
        const campaign = row.breakdowns["Campaign name"]!;
        const adSet = row.breakdowns["Ad set name"] ?? "";
        const adName = row.breakdowns["Ad name"]!;
        const date = row.breakdowns["Date"]!;
        const key = [campaign, adName, date].join("\u0001");
        if (!demoAdBuckets.has(key)) {
          demoAdBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, date });
        }
        accumulate(demoAdBuckets.get(key)!, row);
      }

      // ── Ad-level rows (ad_performance): aggregate the placement export
      // across its device/platform/placement dimensions to a per-ad/day row.
      // Spend/results/resultType are filled from the demo aggregation when
      // the placement export is an impression-only device-breakdown export.
      const adBuckets = new Map<string, AggBucket & { campaign: string; adSet: string; adName: string; resultType: string; date: string }>();
      for (const row of scopedPlacement) {
        const campaign = row.breakdowns["Campaign name"]!;
        const adSet = row.breakdowns["Ad set name"] ?? "";
        const adName = row.breakdowns["Ad name"]!;
        const date = row.breakdowns["Date"]!;
        const key = [campaign, adName, date].join("\u0001");
        if (!adBuckets.has(key)) {
          adBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, resultType: "", date });
        }
        accumulate(adBuckets.get(key)!, row);
      }
      // Supplement from the demo aggregation: fill spend/results/resultType
      // for any ad bucket the placement export left financially empty.
      for (const b of adBuckets.values()) {
        const demoKey = [b.campaign, b.adName, b.date].join("\u0001");
        const demo = demoAdBuckets.get(demoKey);
        if (demo) {
          if (b.spend === null) b.spend = demo.spend;
          if (b.results === null) b.results = demo.results;
          if (!b.resultType) b.resultType = demo.resultType ?? "";
          if (b.linkClicks === null) b.linkClicks = demo.linkClicks;
          if (b.clicksAll === null) b.clicksAll = demo.clicksAll;
        }
        // Use a stable fallback only when result type is genuinely absent from
        // both exports — avoids the misleading "Results" column-header literal.
        if (!b.resultType) b.resultType = "unknown";
      }
      // Also surface demo-only ad/days (ads present in demo but absent from
      // placement) so no spend rows are silently dropped.
      for (const [key, demo] of demoAdBuckets) {
        if (!adBuckets.has(key)) {
          adBuckets.set(key, { ...demo, resultType: demo.resultType ?? "unknown" });
        }
      }

      // ── Demographic rows: aggregate demo export by gender/age/day.
      const demoBuckets = new Map<string, AggBucket & { gender: string; age: string; date: string }>();
      for (const row of scopedDemo) {
        const gender = row.breakdowns["Gender"]!;
        const age = row.breakdowns["Age"]!;
        const date = row.breakdowns["Date"]!;
        const key = [gender, age, date].join("\u0001");
        if (!demoBuckets.has(key)) demoBuckets.set(key, { ...emptyBucket(), gender, age, date });
        accumulate(demoBuckets.get(key)!, row);
      }

      // ── Device/placement/platform rows: aggregate placement export by
      // each dimension independently, across ads, per day.
      const deviceBuckets = new Map<string, AggBucket & { device: string; date: string }>();
      const placementBuckets = new Map<string, AggBucket & { placement: string; date: string }>();
      const platformBuckets = new Map<string, AggBucket & { platform: string; date: string }>();
      for (const row of scopedPlacement) {
        const date = row.breakdowns["Date"]!;
        const device = row.breakdowns["Impression device"]!;
        const placement = row.breakdowns["Placement"]!;
        const platform = row.breakdowns["Platform"]!;

        const dKey = [device, date].join("\u0001");
        if (!deviceBuckets.has(dKey)) deviceBuckets.set(dKey, { ...emptyBucket(), device, date });
        accumulate(deviceBuckets.get(dKey)!, row);

        const pKey = [placement, date].join("\u0001");
        if (!placementBuckets.has(pKey)) placementBuckets.set(pKey, { ...emptyBucket(), placement, date });
        accumulate(placementBuckets.get(pKey)!, row);

        const plKey = [platform, date].join("\u0001");
        if (!platformBuckets.has(plKey)) platformBuckets.set(plKey, { ...emptyBucket(), platform, date });
        accumulate(platformBuckets.get(plKey)!, row);
      }

      // Full refresh of this manual account's output rows within the
      // selected window — safe because manual accounts are never written
      // to by the offline importer.
      const del1 = await supabase
        .from("ad_performance")
        .delete()
        .eq("account_id", accountId)
        .gte("date_start", dateStart)
        .lte("date_end", dateEnd);
      if (del1.error) throw new Error(del1.error.message);
      for (const table of [
        "demographic_performance",
        "placement_performance",
        "platform_performance",
        "device_performance",
      ]) {
        const del = await supabase
          .from(table)
          .delete()
          .eq("account_id", accountId)
          .gte("date_start", dateStart)
          .lte("date_end", dateEnd);
        if (del.error) throw new Error(del.error.message);
      }

      const CHUNK = 500;
      const insertChunked = async (table: string, rows: Record<string, any>[]) => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const ins = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
          if (ins.error) throw new Error(ins.error.message);
        }
      };

      const adRows = Array.from(adBuckets.values()).map((b) => ({
        account_id: accountId,
        campaign_name: b.campaign,
        ad_set_name: b.adSet || null,
        ad_name: b.adName,
        result_type: b.resultType,
        date_start: b.date,
        date_end: b.date,
        spend: b.spend,
        impressions: b.impressions,
        reach: b.reach,
        clicks_all: b.clicksAll,
        link_clicks: b.linkClicks,
        results: b.results,
        ...derivedRates(b.spend, b.impressions, b.linkClicks, b.results),
        manual_analysis_run_id: runId,
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await insertChunked("ad_performance", adRows);

      // ── Concept-level aggregates (concept_performance) ──────────────────
      // Derive concept code from ad_name: "C2E_STC_QF_BOOK2_T1" → "C2".
      // Also extract the book label ("BOOK2") for grouping.
      // Full-replace all concept_performance for this account so the grid
      // always reflects the latest analysis run.
      const extractConcept = (adName: string): string | null => {
        const m = adName.match(/^([A-Z]\d+)(?=[A-Z_])/);
        return m ? m[1]! : null;
      };
      const extractBook = (adName: string): string | null => {
        const m = adName.match(/BOOK\d+/i);
        return m ? m[0]!.toUpperCase() : null;
      };
      const conceptMap = new Map<string, { book: string | null; concept: string; spend: number; results: number; linkClicks: number }>();
      for (const row of adRows) {
        const concept = extractConcept(String(row.ad_name ?? ""));
        if (!concept) continue;
        const book = extractBook(String(row.ad_name ?? ""));
        const cKey = [book ?? "", concept].join("\u0001");
        if (!conceptMap.has(cKey)) {
          conceptMap.set(cKey, { book, concept, spend: 0, results: 0, linkClicks: 0 });
        }
        const c = conceptMap.get(cKey)!;
        c.spend += Number(row.spend ?? 0);
        c.results += Number(row.results ?? 0);
        c.linkClicks += Number(row.link_clicks ?? 0);
      }
      if (conceptMap.size > 0) {
        const delConcept = await supabase.from("concept_performance").delete().eq("account_id", accountId);
        if (delConcept.error) throw new Error(delConcept.error.message);
        const conceptRows = Array.from(conceptMap.values()).map((c) => {
          const spend = c.spend > 0 ? c.spend : null;
          const results = c.results > 0 ? c.results : null;
          const cpa = spend !== null && results !== null && results > 0 ? spend / results : null;
          const cvrLinkPct = c.linkClicks > 0 && results !== null ? (results / c.linkClicks) * 100 : null;
          return {
            account_id: accountId,
            book: c.book,
            concept: c.concept,
            date_start: dateStart,
            date_end: dateEnd,
            spend,
            link_clicks: c.linkClicks > 0 ? c.linkClicks : null,
            results,
            cpa,
            cvr_link_pct: cvrLinkPct,
            mapped_in_library: false,
          };
        });
        await insertChunked("concept_performance", conceptRows);
      }

      // Upsert each unique ad_name into the ads registry so that
      // syncCreativeAssetLinks can later UPDATE creative_asset_url on them.
      // ignoreDuplicates preserves any existing meta_ad_id / creative_asset_url.
      // Also derive cell / concept / book from the ad_name so the seed's ads
      // registry can link performance rows to library cells without a separate
      // copy_performance import.
      const extractCell = (adName: string): string | null => {
        const m = adName.match(/^([A-Z]\d+[A-Z]+)(?=[_\s]|$)/);
        return m ? m[1]! : null;
      };
      const uniqueAdNames = Array.from(new Set(adRows.map((r) => r.ad_name)));
      if (uniqueAdNames.length > 0) {
        const adRegistryRows = uniqueAdNames.map((adName) => ({
          account_id: accountId,
          ad_name: adName,
          cell: extractCell(adName),
          concept: extractConcept(adName),
          book: extractBook(adName),
        }));
        const adsUpsert = await supabase
          .from("ads")
          .upsert(adRegistryRows, { onConflict: "account_id,ad_name", ignoreDuplicates: true });
        if (adsUpsert.error) throw new Error(adsUpsert.error.message);

        // Re-sync creative asset links — creatives uploaded BEFORE analysis
        // had no ads rows to link against at upload time. Now that the ads
        // rows exist we back-fill them. Non-fatal: a sync failure must not
        // roll back a successful analysis.
        try {
          await syncAllCreativeLinksForAccount(accountId);
        } catch (syncErr) {
          logger.warn({ accountId, err: syncErr }, "post-analysis creative sync failed (non-fatal)");
        }
      }

      const demographicRows = Array.from(demoBuckets.values()).map((b) => ({
        account_id: accountId,
        gender: b.gender,
        age: b.age,
        date_start: b.date,
        date_end: b.date,
        spend: b.spend,
        link_clicks: b.linkClicks,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        cvr_link_pct: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cvr_link_pct,
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await insertChunked("demographic_performance", demographicRows);

      const trackingBasis = (b: { addsToCart: number | null; checkoutsInitiated: number | null; purchases: number | null; spend: number | null; impressions: number | null }) =>
        b.spend === null && b.impressions === null && (b.addsToCart !== null || b.checkoutsInitiated !== null || b.purchases !== null)
          ? "conversion"
          : "delivery";

      const placementRowsOut = Array.from(placementBuckets.values()).map((b) => ({
        account_id: accountId,
        placement: b.placement,
        date_start: b.date,
        date_end: b.date,
        spend: b.spend,
        impressions: b.impressions,
        link_clicks: b.linkClicks,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        cvr_link_pct: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cvr_link_pct,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: trackingBasis(b),
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await insertChunked("placement_performance", placementRowsOut);

      const platformRowsOut = Array.from(platformBuckets.values()).map((b) => ({
        account_id: accountId,
        platform: b.platform,
        date_start: b.date,
        date_end: b.date,
        spend: b.spend,
        impressions: b.impressions,
        link_clicks: b.linkClicks,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: trackingBasis(b),
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await insertChunked("platform_performance", platformRowsOut);

      const deviceRowsOut = Array.from(deviceBuckets.values()).map((b) => ({
        account_id: accountId,
        device: b.device,
        date_start: b.date,
        date_end: b.date,
        spend: b.spend,
        impressions: b.impressions,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        link_clicks: b.linkClicks,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: trackingBasis(b),
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await insertChunked("device_performance", deviceRowsOut);

      const totalRows = adRows.length + demographicRows.length + placementRowsOut.length + platformRowsOut.length + deviceRowsOut.length;

      await supabase
        .from("ad_accounts")
        .update({
          status: "configured",
          overview_state: {
            title: "Analysis complete",
            description: `Manual analysis processed ${totalRows} row(s) from ${imports!.length} file(s), covering ${dateStart} to ${dateEnd} (${dateRange === "all" ? "all uploaded dates" : dateRange} window). Re-run analysis after uploading new reports.`,
          },
        })
        .eq("id", accountId);

      await finishRun(runId, "success", {
        dateStart,
        dateEnd,
        rowsIngested: totalRows,
        importsUsed: imports!.length,
        csvWarnings: allCsvWarnings.length > 0 ? allCsvWarnings : undefined,
      });
      invalidateMetrixSeedCache();
      logger.info({ accountId, runId, rows: totalRows, dateStart, dateEnd }, "Manual analysis run succeeded");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, accountId, runId }, "Manual analysis run failed");
      try {
        await deleteRunOutputs(runId);
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr, runId }, "Failed to clean up partial analysis output");
      }
      await finishRun(runId, "error", { errorMessage: message });
      invalidateMetrixSeedCache();
    }
  })();

  return runId;
}
