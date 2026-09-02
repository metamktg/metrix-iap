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
// prior match) is never rescored. Only an identifier match (a cell code
// such as C2B, a creative ID) or a confident similarity match is applied;
// a low-confidence guess never is. A file with no credible match stays
// unmapped and visible — never force-mapped to noise. Candidates are the
// ad name plus the Meta image / video names the export recorded for it.

import { getSupabase } from "./supabase";
import { logger } from "./logger";
import { extractIdCodes, suggestAdNameMatch } from "./adNameMatch";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";

export interface CreativeAutoMapResult {
  /** Creative imports that had no mapping when this ran. */
  considered: number;
  /** Of those, how many now carry an auto-matched ad name. */
  mapped: number;
  /** Filenames that had no credible match and stay unmapped. */
  unmatched: string[];
}

/**
 * The names a file can be matched against, each pointing back at the ad
 * that owns it: the ad name itself, and the Meta image / video asset names
 * the export recorded for that ad when it carried them. A file named after
 * the asset Meta served ("skov_hero_v2.mp4") and a file named after the ad
 * ("SKOV_C2B.png") both resolve to the ad.
 */
export interface AdNameCandidate {
  adName: string;
  names: string[];
}

export async function loadAdCandidates(accountId: string): Promise<AdNameCandidate[]> {
  const supabase = getSupabase();
  const [ads, instances] = await Promise.all([
    supabase.from("ads").select("ad_name, image_name, video_name").eq("account_id", accountId),
    supabase.from("ad_instances").select("ad_name, image_name, video_name").eq("account_id", accountId),
  ]);
  if (ads.error) throw new Error(ads.error.message);
  if (instances.error) throw new Error(instances.error.message);
  const byAd = new Map<string, Set<string>>();
  for (const row of [...(ads.data ?? []), ...(instances.data ?? [])]) {
    const adName = String(row["ad_name"] ?? "").trim();
    if (!adName) continue;
    const names = byAd.get(adName) ?? new Set<string>([adName]);
    for (const key of ["image_name", "video_name"] as const) {
      const v = String(row[key] ?? "").trim();
      if (v) names.add(v);
    }
    byAd.set(adName, names);
  }
  return [...byAd.entries()].map(([adName, names]) => ({ adName, names: [...names] }));
}

export type FileAdDecision =
  | { kind: "match"; adName: string; method: "id" | "fuzzy" }
  | { kind: "suggestion"; adName: string }
  | { kind: "none" };

/**
 * Pure: which ad a filename belongs to, if the evidence is good enough to
 * act on. Only an identifier match or a confident similarity match is
 * applied. A low-confidence "guess" is NOT: on the first fresh-account run
 * the guess tier attached seventeen unrelated "ChatGPT Image …" files to
 * one ad and six "SKOV 03 (n)" files to another, and a wrong creative on
 * an ad is worse than no creative — it is shown as that ad's creative
 * everywhere. A guess is returned as a suggestion for the editor only.
 */
export function decideAdForFile(filename: string, candidates: AdNameCandidate[]): FileAdDecision {
  const nameToAd = new Map<string, string>();
  for (const c of candidates) for (const n of c.names) if (!nameToAd.has(n)) nameToAd.set(n, c.adName);

  // Identifier pass at the AD level: an ad owns every code carried by any of
  // its names (ad name, image name, video name). A code the file carries
  // that exactly one ad owns decides the match, even when that ad carries
  // the code under two names — the name-level pass would read those two
  // names as two owners and refuse to decide. A code several ads own
  // restricts the similarity pass to those ads' names.
  const fileCodes = extractIdCodes(filename);
  let pool = [...nameToAd.keys()];
  if (fileCodes.length > 0) {
    const adsByCode = new Map<string, Set<string>>();
    for (const c of candidates) {
      const codes = new Set(c.names.flatMap((n) => extractIdCodes(n)));
      for (const code of codes) {
        if (!adsByCode.has(code)) adsByCode.set(code, new Set());
        adsByCode.get(code)!.add(c.adName);
      }
    }
    const restrictedAds = new Set<string>();
    for (const code of fileCodes) {
      const owners = adsByCode.get(code);
      if (owners && owners.size === 1) return { kind: "match", adName: [...owners][0]!, method: "id" };
      if (owners) for (const a of owners) restrictedAds.add(a);
    }
    if (restrictedAds.size > 0) pool = pool.filter((n) => restrictedAds.has(nameToAd.get(n) ?? ""));
  }

  const match = suggestAdNameMatch(filename, pool);
  if (!match) return { kind: "none" };
  const adName = nameToAd.get(match.name) ?? match.name;
  if (match.method === "guess") return { kind: "suggestion", adName };
  return { kind: "match", adName, method: match.method };
}

/**
 * Maps every unmapped creative import of the account whose filename has a
 * credible ad match, then links the matched ad to the file.
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

  const candidates = await loadAdCandidates(accountId);
  if (candidates.length === 0) {
    // Nothing to match against yet — the first analysis run writes the
    // registry, and syncAllCreativeLinksForAccount calls back here then.
    result.unmatched = unmapped.map((i) => String(i["filename"]));
    return result;
  }

  for (const imp of unmapped) {
    const filename = String(imp["filename"]);
    const decision = decideAdForFile(filename, candidates);
    if (decision.kind !== "match") {
      result.unmatched.push(filename);
      continue;
    }
    const importId = String(imp["id"]);
    const update = await supabase
      .from("manual_imports")
      .update({ ad_names: [decision.adName], match_method: decision.method })
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
      .eq("ad_name", decision.adName);
    if (link.error) throw new Error(link.error.message);
    result.mapped += 1;
  }

  if (result.mapped > 0) {
    invalidateMetrixSeedCache();
    logger.info(
      { accountId, considered: result.considered, mapped: result.mapped, unmatched: result.unmatched.length },
      "Creative auto-map: filenames matched to ads on the server",
    );
  }
  return result;
}
