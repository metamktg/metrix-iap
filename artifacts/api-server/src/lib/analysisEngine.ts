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
import { getAppBaseUrl } from "./appUrl";

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
};

type Row = Record<string, any>;

const runShape = (r: Row): ManualAnalysisRun => ({
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
});

async function accountExists(accountId: string): Promise<Row | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("id, name, source_status")
    .eq("id", accountId)
    .limit(1);
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
  fields: { errorMessage?: string; dateStart?: string; dateEnd?: string; rowsIngested?: number; importsUsed?: number },
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
  // The run's full-refresh deletes assume this account's performance and
  // signal rows are owned exclusively by manual analysis. Imported accounts
  // (offline importer) and live Meta accounts own their rows elsewhere —
  // running a manual analysis against them would destroy that data.
  if (account["source_status"] !== "manual_reports") {
    throw new AnalysisError(
      "Manual analysis is only available for manual-report accounts. This account's data is managed by its own import pipeline.",
      422,
    );
  }

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
      const demoRows: IapCsvRow[] = [];
      for (const imp of demoImports) {
        const text = decodeStagedContent(String(imp["content"]));
        try {
          demoRows.push(...parseIapCsv(text, "demographic").rows);
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Demographics file "${imp["filename"]}": ${detail}`, 422);
        }
      }
      const placementRows: IapCsvRow[] = [];
      for (const imp of placementImports) {
        const text = decodeStagedContent(String(imp["content"]));
        try {
          placementRows.push(...parseIapCsv(text, "device_placement").rows);
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

      // ── Ad-level rows (ad_performance): aggregate the placement export
      // across its device/platform/placement dimensions to a per-ad/day row.
      const adBuckets = new Map<string, AggBucket & { campaign: string; adSet: string; adName: string; resultType: string; date: string }>();
      for (const row of scopedPlacement) {
        const campaign = row.breakdowns["Campaign name"]!;
        const adSet = row.breakdowns["Ad set name"] ?? "";
        const adName = row.breakdowns["Ad name"]!;
        const resultType = (row.base["result_type"] as string) || "Results";
        const date = row.breakdowns["Date"]!;
        const key = [campaign, adName, resultType, date].join("\u0001");
        if (!adBuckets.has(key)) {
          adBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, resultType, date });
        }
        accumulate(adBuckets.get(key)!, row);
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

      // ── Window-level signal buckets (whole selected window, no daily
      // grain): these feed the importer-shaped signal tables the Analysis
      // UI (Audience / Placements) and the strategy evidence pack read.
      // Without them a manual account's analysis would populate totals but
      // leave those surfaces permanently empty.
      const demoWindowBuckets = new Map<string, AggBucket & { gender: string; age: string }>();
      for (const row of scopedDemo) {
        const gender = row.breakdowns["Gender"]!;
        const age = row.breakdowns["Age"]!;
        const key = [gender, age].join("");
        if (!demoWindowBuckets.has(key)) demoWindowBuckets.set(key, { ...emptyBucket(), gender, age });
        accumulate(demoWindowBuckets.get(key)!, row);
      }
      const placementWindowBuckets = new Map<string, AggBucket & { placement: string; platform: string }>();
      for (const row of scopedPlacement) {
        const placement = row.breakdowns["Placement"]!;
        const platform = row.breakdowns["Platform"]!;
        const key = [placement, platform].join("");
        if (!placementWindowBuckets.has(key)) {
          placementWindowBuckets.set(key, { ...emptyBucket(), placement, platform });
        }
        accumulate(placementWindowBuckets.get(key)!, row);
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

      // Upsert each unique ad_name into the ads registry so that
      // syncCreativeAssetLinks can later UPDATE creative_asset_url on them.
      // ignoreDuplicates preserves any existing meta_ad_id / creative_asset_url.
      const uniqueAdNames = Array.from(new Set(adRows.map((r) => r.ad_name)));
      if (uniqueAdNames.length > 0) {
        const adRegistryRows = uniqueAdNames.map((adName) => ({
          account_id: accountId,
          ad_name: adName,
        }));
        const adsUpsert = await supabase
          .from("ads")
          .upsert(adRegistryRows, { onConflict: "account_id,ad_name", ignoreDuplicates: true });
        if (adsUpsert.error) throw new Error(adsUpsert.error.message);

        // Re-sync creative asset links — creatives uploaded BEFORE analysis
        // had no ads rows to link against at upload time (syncCreativeAssetLinks
        // logged "unmatched"). Now that the ads rows exist we back-fill them.
        // Non-fatal: a sync failure must not roll back a successful analysis.
        try {
          const creativeImports = await supabase
            .from("manual_imports")
            .select("id, filename, ad_names")
            .eq("account_id", accountId)
            .eq("kind", "creative_asset");
          if (!creativeImports.error && creativeImports.data) {
            for (const imp of creativeImports.data) {
              const adNames = (imp["ad_names"] as string[] | null) ?? [];
              if (adNames.length === 0) continue;
              const fileUrl = `${getAppBaseUrl()}api/metrix/accounts/${accountId}/manual-imports/${imp["id"]}/file`;
              const sync = await supabase
                .from("ads")
                .update({ creative_asset_url: fileUrl, asset_filename: imp["filename"], asset_servable: true })
                .eq("account_id", accountId)
                .in("ad_name", adNames);
              if (sync.error) {
                logger.warn({ accountId, importId: imp["id"], err: sync.error }, "post-analysis creative sync partial failure");
              }
            }
          }
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

      // ── Signal tables (what the Analysis UI + strategy evidence read) ──
      // Full per-account refresh: the source guard above ensures this
      // account's signal rows are owned exclusively by manual analysis, and
      // a full replace keeps row_index unique-constraint collisions with a
      // previous run impossible. Payload shapes mirror the offline importer
      // (DemographicRow / PlacementRow) so every existing render path and
      // the strategy evidence pack work unchanged.
      const pctOr = (numerator: number | null, denominator: number | null): number | null =>
        numerator !== null && denominator !== null && denominator > 0
          ? (numerator / denominator) * 100
          : null;
      const cpaOr = (spend: number | null, results: number | null): number | null =>
        spend !== null && results !== null && results > 0 ? spend / results : null;

      const delDemoSignal = await supabase.from("demographic_signal").delete().eq("account_id", accountId);
      if (delDemoSignal.error) throw new Error(delDemoSignal.error.message);
      const delPlacementSignal = await supabase
        .from("placement_signal")
        .delete()
        .eq("account_id", accountId)
        .eq("signal_scope", "v3");
      if (delPlacementSignal.error) throw new Error(delPlacementSignal.error.message);

      const MANUAL_DEMO_AD_NAME = "All ads (manual demographic upload)";
      const demoSignalRows = Array.from(demoWindowBuckets.values())
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
        .map((b, i) => ({
          account_id: accountId,
          cell_id: "ACCOUNT",
          ad_name: MANUAL_DEMO_AD_NAME,
          age: b.age,
          gender: b.gender,
          date_start: dateStart,
          date_end: dateEnd,
          row_index: i,
          payload: {
            cell_id: "ACCOUNT",
            "Ad name": MANUAL_DEMO_AD_NAME,
            Age: b.age,
            Gender: b.gender,
            "Result type": b.resultType,
            "Amount spent (USD)": b.spend,
            Reach: b.reach,
            Impressions: b.impressions,
            Results: b.results,
            "Clicks (all)": b.clicksAll,
            "Link clicks": b.linkClicks,
            CPA_result: cpaOr(b.spend, b.results),
            CTR_link_pct: pctOr(b.linkClicks, b.impressions),
            Result_per_link_click_pct: pctOr(b.results, b.linkClicks),
          },
        }));
      await insertChunked("demographic_signal", demoSignalRows);

      const placementSignalRows = Array.from(placementWindowBuckets.values())
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
        .map((b, i) => ({
          account_id: accountId,
          signal_scope: "v3",
          placement: b.placement,
          platform: b.platform,
          date_start: dateStart,
          date_end: dateEnd,
          row_index: i,
          payload: {
            Placement: b.placement,
            Platform: b.platform,
            "Amount spent (USD)": b.spend,
            Impressions: b.impressions,
            "Link clicks": b.linkClicks,
            Results: b.results,
            CPA: cpaOr(b.spend, b.results),
            CTR_link_pct: pctOr(b.linkClicks, b.impressions),
          },
        }));
      await insertChunked("placement_signal", placementSignalRows);

      // Register the loop stage so the account's IAP loop status reflects
      // that its Analysis Core equivalent has really run.
      const loopUpsert = await supabase.from("iap_runs").upsert(
        {
          account_id: accountId,
          stage: "analysis_core",
          status: "complete",
          window_start: dateStart,
          window_end: dateEnd,
          generated_at: new Date().toISOString(),
          note: `Manual analysis run ${runId}.`,
        },
        { onConflict: "account_id,stage" },
      );
      if (loopUpsert.error) throw new Error(loopUpsert.error.message);

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
