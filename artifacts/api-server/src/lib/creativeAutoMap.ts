// ─── Server-side creative → ad-name auto-mapping ──────────────────────
//
// Owner brief (2026-09-02, first fresh-account run): "anything uploaded
// there should be automatically uploaded in the back end, not in that
// interface, to avoid bugs — staged and mapped appropriately when the
// analysis has conducted its import and run in full."
//
// Until now the ONLY filename → ad-name matcher ran in the browser, inside
// the upload dialog, at the moment a file was chosen. Three consequences:
// a creative uploaded before the first analysis run had no ad names to
// match against and stayed unmapped; the dialog refused to close while any
// file was unmapped and offered to DELETE the files instead; and a run that
// later produced the ad registry never revisited them. The mapping was a
// property of a dialog session, not of the account.
//
// This module makes it a property of the account. The same pure matcher
// (adNameMatch.ts, byte-identical to the client's copy — scripts/src/
// adname-match-drift.test.ts fails if they diverge) runs on the server:
//
//   • at staging, against whatever ads the account already knows;
//   • after every successful analysis run, against the registry that run
//     just wrote (syncAllCreativeLinksForAccount calls it first);
//   • on the manual "sync creative links" action.
//
// Only files with NO mapping are touched: a mapping a person set (or a
// prior match) is never rescored. A file with no credible match stays
// unmapped and visible — never force-mapped to noise.

import { getSupabase } from "./supabase";
import { logger } from "./logger";
import { suggestAdNameMatch } from "./adNameMatch";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";

export interface CreativeAutoMapResult {
  /** Creative imports that had no mapping when this ran. */
  considered: number;
  /** Of those, how many now carry an auto-matched ad name. */
  mapped: number;
  /** Filenames that had no credible match and stay unmapped. */
  unmatched: string[];
}

/** Distinct ad names this account's analysis has produced (the registry the matcher targets). */
export async function loadAccountAdNames(accountId: string): Promise<string[]> {
  const supabase = getSupabase();
  const [ads, instances] = await Promise.all([
    supabase.from("ads").select("ad_name").eq("account_id", accountId),
    supabase.from("ad_instances").select("ad_name").eq("account_id", accountId),
  ]);
  if (ads.error) throw new Error(ads.error.message);
  if (instances.error) throw new Error(instances.error.message);
  const names = new Set<string>();
  for (const row of [...(ads.data ?? []), ...(instances.data ?? [])]) {
    const n = String(row["ad_name"] ?? "").trim();
    if (n) names.add(n);
  }
  return [...names].sort();
}

/**
 * Maps every unmapped creative import of the account whose filename has a
 * credible ad-name match, then links the matched ads to the file.
 * Idempotent: a second call finds nothing left to consider.
 */
export async function autoMapUnmappedCreatives(accountId: string): Promise<CreativeAutoMapResult> {
  const supabase = getSupabase();
  const { data: imports, error } = await supabase
    .from("manual_imports")
    .select("id, filename, ad_names")
    .eq("account_id", accountId)
    .eq("kind", "creative_asset");
  if (error) throw new Error(error.message);
  const unmapped = (imports ?? []).filter((i) => ((i["ad_names"] as string[] | null) ?? []).length === 0);
  const result: CreativeAutoMapResult = { considered: unmapped.length, mapped: 0, unmatched: [] };
  if (unmapped.length === 0) return result;

  const candidates = await loadAccountAdNames(accountId);
  if (candidates.length === 0) {
    // Nothing to match against yet — the first analysis run writes the
    // registry, and syncAllCreativeLinksForAccount calls back here then.
    result.unmatched = unmapped.map((i) => String(i["filename"]));
    return result;
  }

  for (const imp of unmapped) {
    const filename = String(imp["filename"]);
    const match = suggestAdNameMatch(filename, candidates);
    if (!match) {
      result.unmatched.push(filename);
      continue;
    }
    const importId = String(imp["id"]);
    const update = await supabase
      .from("manual_imports")
      .update({ ad_names: [match.name], match_method: match.method })
      .eq("id", importId)
      .eq("account_id", accountId);
    if (update.error) throw new Error(update.error.message);
    const link = await supabase
      .from("ads")
      .update({
        creative_asset_url: `/api/metrix/accounts/${accountId}/manual-imports/${importId}/file`,
        asset_filename: filename,
        asset_servable: true,
      })
      .eq("account_id", accountId)
      .eq("ad_name", match.name);
    if (link.error) throw new Error(link.error.message);
    result.mapped += 1;
  }

  if (result.mapped > 0) {
    invalidateMetrixSeedCache();
    logger.info(
      { accountId, considered: result.considered, mapped: result.mapped, unmatched: result.unmatched.length },
      "Creative auto-map: filenames matched to ad names on the server",
    );
  }
  return result;
}
