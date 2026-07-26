// ═══════════════════════════════════════════════════════════════════════
// One-off backfill: bridge already-pulled Meta report rows into the
// dashboard tables for accounts connected BEFORE the live-Meta bridge
// existed (see routes/metaConnect.ts POST /metrix/meta/run-reports).
//
// Those accounts already have real, honest report_pulls/report_rows —
// the pull itself always worked — but nothing ever promoted those rows
// into ad_performance/demographic_performance/etc, so the account's
// dashboard has been stuck on "Analysis not run yet" regardless of how
// many times reports were re-pulled. This script runs the exact same
// aggregation the live bridge now runs automatically on every future
// pull, against each affected account's most recent successful pull pair.
//
// Idempotent — safe to re-run. Only touches accounts with
// source_status = 'live_meta_connection' AND status = 'unconfigured';
// once an account is reconciled (or freshly bridged by a new pull) its
// status flips to 'configured' and this script skips it on the next run.
// Delivery metrics only (spend, impressions, reach, CTR, CPM) — Results/
// CPA/CVR stay honestly null, same rule as the live bridge (see
// metaDemoRowToAgg/metaPlacementRowToAgg in lib/analysisEngine.ts).
//
// Requires the same server-side Supabase credentials as the running API
// server: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Run this
// wherever those are actually configured (the deployed environment) —
// it cannot run in a sandbox with no database connection.
//
// Usage: pnpm --filter @workspace/api-server run reconcile:meta-accounts
// ═══════════════════════════════════════════════════════════════════════

import { getSupabase } from "../lib/supabase";
import { runAggregation, metaDemoRowToAgg, metaPlacementRowToAgg } from "../lib/analysisEngine";
import { invalidateMetrixSeedCache } from "../lib/metrixSeedAssembly";
import { REPORT_CLASSES, type ReportClass, type NormalizedReportRow } from "../lib/metaGraph";

type PullRef = { id: string; date_range_start: string; date_range_end: string };

async function latestSuccessfulPull(
  supabase: ReturnType<typeof getSupabase>,
  accountId: string,
  reportClass: ReportClass,
): Promise<PullRef | null> {
  const { data, error } = await supabase
    .from("report_pulls")
    .select("id, date_range_start, date_range_end")
    .eq("ad_account_id", accountId)
    .eq("report_class", reportClass)
    .eq("status", "success")
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as PullRef | undefined) ?? null;
}

async function rowsForPull(
  supabase: ReturnType<typeof getSupabase>,
  pullId: string,
): Promise<NormalizedReportRow[]> {
  const { data, error } = await supabase
    .from("report_rows")
    .select("campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date, dimensions, metrics")
    .eq("report_pull_id", pullId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NormalizedReportRow[];
}

async function main() {
  const supabase = getSupabase();

  const { data: accounts, error } = await supabase
    .from("ad_accounts")
    .select("id, name")
    .eq("source_status", "live_meta_connection")
    .eq("status", "unconfigured");
  if (error) throw new Error(error.message);

  if (!accounts || accounts.length === 0) {
    console.log("No unconfigured live-Meta accounts to reconcile. Nothing to do.");
    return;
  }

  console.log(`Checking ${accounts.length} unconfigured live-Meta account(s)...`);
  let reconciled = 0;

  for (const account of accounts) {
    const accountId = String(account["id"]);
    console.log(`\n— ${accountId} (${account["name"]}) —`);

    const demoPull = await latestSuccessfulPull(supabase, accountId, "IAP_DEMOGRAPHIC_TEXT_SIGNAL");
    const placementPull = await latestSuccessfulPull(supabase, accountId, "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL");
    if (!demoPull || !placementPull) {
      console.log("  Skipped — no successful pull exists yet for both report classes.");
      continue;
    }

    const demoRows = await rowsForPull(supabase, demoPull.id);
    const placementRows = await rowsForPull(supabase, placementPull.id);

    const demoAgg = demoRows
      .filter((r) => r.date && r.dimensions["gender"] && r.dimensions["age"])
      .map(metaDemoRowToAgg);
    const placementAgg = placementRows
      .filter((r) => r.date && r.ad_name && r.campaign_name)
      .map(metaPlacementRowToAgg);

    if (demoAgg.length === 0 || placementAgg.length === 0) {
      console.log("  Skipped — pulled rows exist but none were usable for the dashboard bridge.");
      continue;
    }

    const dateStart = demoPull.date_range_start < placementPull.date_range_start ? demoPull.date_range_start : placementPull.date_range_start;
    const dateEnd = demoPull.date_range_end > placementPull.date_range_end ? demoPull.date_range_end : placementPull.date_range_end;

    const totalRows = await runAggregation(accountId, demoAgg, placementAgg, dateStart, dateEnd);

    const { error: updateErr } = await supabase
      .from("ad_accounts")
      .update({
        status: "configured",
        overview_state: {
          title: "Live delivery data available",
          description:
            `Delivery metrics (spend, impressions, reach, CTR, CPM) from your live Meta connection cover ${dateStart} to ${dateEnd}. ` +
            `Conversion results (CPA/CVR) aren't available from a live connection yet — upload a manual export in Settings → Account to see them.`,
        },
      })
      .eq("id", accountId);
    if (updateErr) throw new Error(updateErr.message);

    console.log(`  Reconciled ${totalRows} row(s) covering ${dateStart} → ${dateEnd}. Marked '${accountId}' as configured.`);
    reconciled++;
  }

  invalidateMetrixSeedCache();
  console.log(
    `\nDone. Reconciled ${reconciled} of ${accounts.length} account(s). ` +
      "(This only clears this process's own in-memory seed cache — the running API server picks up the change on its next request after its own 30s cache TTL expires.)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
