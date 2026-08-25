// ─── data_quality flag presentation (shared) ───────────────────────────
// The account's real data_quality flags, raised by the last analysis run.
// `kind` is the only real tiering field a flag carries; nothing here is
// computed or guessed, and no confidence percentage is derived — flags carry
// no confidence score and fabricating one was ruled out.
//
// Shared because these flags surface in two places: the Ad Performance
// signal tiers and the Listen · Alerts page. Alerts documents its lineage as
// iap.data_quality[] but rendered only data_caveat, so importer quality
// findings (including cross_export_mismatch) never reached the page users
// check for what needs attention.

import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import type { DataQualityFlag } from "@/lib/data/seedTypes";

export function flagHeadline(f: DataQualityFlag): string {
  const type = typeof f["type"] === "string" ? (f["type"] as string) : null;
  if (type) return type.replace(/_/g, " ");
  // Some quality_flag entries (e.g. the live-pilot underspend/zero-conversion
  // set) carry a `flag` id instead of `type` — a real, specific label beats
  // the generic kind-only fallback below.
  const flagId = typeof f["flag"] === "string" ? (f["flag"] as string) : null;
  if (flagId) return flagId.replace(/_/g, " ");
  return f.kind === "attribution_window" ? "Attribution window" : f.kind.replace(/_/g, " ");
}

export function flagBody(f: DataQualityFlag): string {
  const note = typeof f["note"] === "string" ? (f["note"] as string) : null;
  if (note) return note;
  const campaign = typeof f["campaign"] === "string" ? (f["campaign"] as string) : null;
  const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
  const parts = [campaign, spend != null ? `${fmtUSD(spend)} affected` : null].filter(Boolean);
  return parts.join(" · ") || "Raised by the last analysis run.";
}

// Evidence grid behind "Show evidence" — every scalar field actually present
// on the real flag object, beyond the ones already surfaced in the headline
// and so-what paragraph. Nothing here is computed or guessed; keys that
// aren't present on a given flag simply don't produce a row.
export function flagEvidence(f: DataQualityFlag): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = [{ k: "Kind", v: f.kind.replace(/_/g, " ") }];
  const spend = typeof f["spend"] === "number" ? (f["spend"] as number) : null;
  if (spend != null) rows.push({ k: "Spend affected", v: fmtUSD(spend) });
  const results = typeof f["results"] === "number" ? (f["results"] as number) : null;
  if (results != null) rows.push({ k: "Results", v: fmtNum(results) });
  const campaign = typeof f["campaign"] === "string" ? (f["campaign"] as string) : null;
  if (campaign) rows.push({ k: "Campaign", v: campaign });
  const platform = typeof f["platform"] === "string" ? (f["platform"] as string) : null;
  if (platform) rows.push({ k: "Platform", v: platform });
  const placement = typeof f["placement"] === "string" ? (f["placement"] as string) : null;
  if (placement) rows.push({ k: "Placement", v: placement });
  const impressions = typeof f["impressions"] === "number" ? (f["impressions"] as number) : null;
  if (impressions != null) rows.push({ k: "Impressions", v: fmtNum(impressions) });
  const severity = typeof f["severity"] === "string" ? (f["severity"] as string) : null;
  if (severity) rows.push({ k: "Severity", v: severity.charAt(0).toUpperCase() + severity.slice(1) });
  return rows;
}

