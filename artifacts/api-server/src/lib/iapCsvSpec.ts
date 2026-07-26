// Canonical column spec for the two Meta Ads Reporting pivot export classes
// used by manual IAP uploads: IAP_DEMOGRAPHIC_TEXT_SIGNAL and
// IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL. These are the SAME classes the live
// Meta OAuth report pulls use (see metaGraph.ts) — manual uploads must match
// them exactly so both ingestion paths produce comparable data.
//
// Source of truth: attached_assets/metrix_iap_ads_reporting_pivot_template_classes_final_*.json
// Do not hand-edit the metric name lists below — they must match the exact
// Meta pivot export column headers verbatim (only the {ACCOUNT_CURRENCY}
// placeholder in "Amount spent" varies per account currency).

export const BASE_METRICS: readonly string[] = [
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Reach",
  "Impressions",
  "Frequency",
  "CPM (cost per 1,000 impressions)",
  "Cost per 1,000 Accounts Center accounts reached",
  "Result type",
  "Results",
  "Cost per result",
  "Result rate",
  "Results rate per link clicks",
  "Result value type",
  "Results value",
  "Views",
  "Clicks (all)",
  "CPC (all)",
  "CTR (all)",
  "Link clicks",
  "CPC (cost per link click)",
  "CTR (link click-through rate)",
  "Unique CTR (link click-through rate)",
  "Unique clicks (all)",
  "Cost per unique click (all)",
  "Cost per unique link click",
  "Outbound clicks",
  "Unique outbound clicks",
  "Outbound CTR (click-through rate)",
  "Unique outbound CTR (click-through rate)",
  "Cost per outbound click",
  "Cost per unique outbound click",
  "Landing page views",
  "Cost per landing page view",
  "Landing page views rate per link clicks",
  "Page engagement",
  "Post engagements",
  "Post comments",
  "Post reactions",
  "Post saves",
  "Post shares",
  "Cost per Page engagement",
  "Cost per post engagement",
  "Cost per post share",
  "Cost per interaction",
  "Instagram profile visits",
  "Quality ranking",
  "Engagement rate ranking",
  "Conversion rate ranking",
  "Ad recall lift rate",
  "Video average play time",
  "Video plays",
  "3-second video plays",
  "Unique 2-second continuous video plays",
  "Video plays at 25%",
  "Video plays at 50%",
  "Video plays at 75%",
  "Video plays at 95%",
  "Video plays at 100%",
  "ThruPlays",
  "Cost per ThruPlay",
  "Cost per 3-second video play",
  "Cost per 2-second continuous video play",
];

export const ECOMMERCE_METRICS: readonly string[] = [
  "Adds to cart",
  "Cost per add to cart",
  "Adds to cart conversion value",
  "Content views",
  "Cost per content view",
  "Content views conversion value",
  "Checkouts initiated",
  "Cost per checkout initiated",
  "Purchases",
  "Cost per purchase",
  "Purchase ROAS (return on ad spend)",
  "Website purchase ROAS (return on ad spend)",
  "Website purchases",
  "Website purchases conversion value",
  "Direct website purchases",
  "Direct website purchases conversion value",
  "Shops-assisted purchases",
  "Shops-assisted purchases conversion value",
  "Meta purchases",
  "Meta purchases conversion value",
  "Purchases conversion value",
  "Average purchases conversion value",
  "Purchases rate per landing page views",
  "Purchases rate per link clicks",
];

export const SERVICE_METRICS: readonly string[] = [
  "Leads",
  "Cost per lead",
  "Leads conversion value",
  "Meta leads",
  "Website leads",
  "Contacts",
  "Cost per contact",
  "Contact conversion value",
  "Appointments scheduled",
  "Cost per appointment scheduled",
  "Registrations completed",
  "Cost per registration completed",
  "Registrations completed conversion value",
  "Calls placed",
  "20-second calls",
  "60-second calls",
  "Estimated call confirmation clicks",
  "Callback requests submitted",
];

export const APP_METRICS: readonly string[] = [
  "App installs",
  "Cost per app install",
  "Mobile app installs",
  "Cost per mobile app install",
  "Cost per app activation",
  "App activations",
  "App activations conversion value",
  "In-app sessions",
  "Cost per in-app session",
  "In-app sessions conversion value",
  "In-app purchases",
  "Cost per in-app purchase",
  "In-app registrations completed",
  "Cost per in-app registration completed",
  "In-app trials started",
  "Cost per in-app trial started",
  "In-app subscriptions",
  "Cost per in-app subscription",
  "In-app subscriptions conversion value",
  "Ratings submitted",
  "Cost per rating submitted",
  "Ratings submitted conversion value",
];

/** Ecommerce + Service + App metrics: optional, present only for accounts of that business type. Never fabricated when absent. */
export const OPTIONAL_METRICS: readonly string[] = [...ECOMMERCE_METRICS, ...SERVICE_METRICS, ...APP_METRICS];

export const DEMOGRAPHIC_BREAKDOWN_COLUMNS: readonly string[] = [
  "Date",
  "Campaign ID",
  "Campaign name",
  "Ad set ID",
  "Ad set name",
  "Ad ID",
  "Ad name",
  "Gender",
  "Age",
  "Text",
];

export const DEVICE_PLACEMENT_BREAKDOWN_COLUMNS: readonly string[] = [
  "Date",
  "Campaign ID",
  "Campaign name",
  "Ad set ID",
  "Ad set name",
  "Ad ID",
  "Ad name",
  "Impression device",
  "Platform",
  "Placement",
];

/**
 * Ad-level summary breakdown columns: no demographic (Gender/Age) or
 * device/placement breakdown dimensions. One row per ad per day — the only
 * format from Meta that carries full spend unaffected by iOS privacy limits.
 */
export const AD_SUMMARY_BREAKDOWN_COLUMNS: readonly string[] = [
  "Date",
  "Campaign ID",
  "Campaign name",
  "Ad set ID",
  "Ad set name",
  "Ad ID",
  "Ad name",
];

export type IapCsvClass = "demographic" | "device_placement" | "ad_summary";

export type IapCsvClassSpec = {
  className: "IAP_DEMOGRAPHIC_TEXT_SIGNAL" | "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL" | "IAP_AD_SUMMARY";
  breakdownColumns: readonly string[];
  /** Breakdown columns that must have a value on every row (Date, Ad name are load-bearing). */
  requiredBreakdownColumns: readonly string[];
};

export const IAP_CSV_CLASS_SPECS: Record<IapCsvClass, IapCsvClassSpec> = {
  demographic: {
    className: "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    breakdownColumns: DEMOGRAPHIC_BREAKDOWN_COLUMNS,
    requiredBreakdownColumns: ["Date", "Campaign name", "Ad name", "Gender", "Age"],
  },
  device_placement: {
    className: "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
    breakdownColumns: DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
    requiredBreakdownColumns: ["Date", "Campaign name", "Ad name", "Impression device", "Platform", "Placement"],
  },
  ad_summary: {
    className: "IAP_AD_SUMMARY",
    breakdownColumns: AD_SUMMARY_BREAKDOWN_COLUMNS,
    // Ad name is required; Campaign name used for bucketing but tolerated blank
    requiredBreakdownColumns: ["Date", "Ad name"],
  },
};

/** Slugifies a Meta metric/breakdown column header into a stable object key (e.g. "Cost per result" -> "cost_per_result"). */
export function slugifyColumn(name: string): string {
  return name
    .replace(/\{ACCOUNT_CURRENCY\}/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/** Matches a raw CSV header against a canonical column name, tolerating the {ACCOUNT_CURRENCY} placeholder (e.g. "Amount spent (USD)"). */
export function headerMatchesColumn(header: string, canonical: string): boolean {
  if (!canonical.includes("{ACCOUNT_CURRENCY}")) return header.trim() === canonical;
  // Escape the whole canonical name, then swap the (now-escaped) placeholder
  // for a 3-letter currency-code pattern. The surrounding parentheses live in
  // the canonical string itself, so they must not be re-added here.
  const pattern = canonical
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\\{ACCOUNT_CURRENCY\\}", "[A-Za-z]{3}");
  return new RegExp(`^${pattern}$`).test(header.trim());
}

/**
 * Known Meta Ads Manager / Ads Reporting column name aliases.
 * Key: lowercase alias as it appears in real Meta exports.
 * Value: canonical column name from this spec.
 *
 * These cover the most common discrepancies between Meta's UI exports and the
 * exact column names the IAP template spec requires. When a CSV contains an
 * alias key, the parser accepts it transparently and records a mapping notice
 * so the user can see what was auto-resolved.
 *
 * Provenance notes are inline. When adding entries, document the source
 * (e.g. "Meta Ads Manager UI vXX", "observed in real client export", etc.)
 * so future maintainers can verify or remove stale aliases.
 */
export const COLUMN_ALIASES: Record<string, string> = {
  // ── Date / time breakdowns ───────────────────────────────────────────
  // Meta Ads Manager standard UI exports use "Day" for the date breakdown
  "day": "Date",
  // Reporting period labels seen in Meta Business Suite / legacy exports
  "report date": "Date",
  "reporting date": "Date",
  "reporting starts": "Date",
  "report start": "Date",
  "date start": "Date",
  "week": "Date",                  // weekly-rollup exports sometimes emit "Week"

  // ── Spend / amount ───────────────────────────────────────────────────
  // Spend column — sometimes labelled without the currency suffix
  "spend": "Amount spent ({ACCOUNT_CURRENCY})",
  "total spend": "Amount spent ({ACCOUNT_CURRENCY})",
  "amount spent": "Amount spent ({ACCOUNT_CURRENCY})",
  // Variants observed in localised/agency-processed exports
  "budget spent": "Amount spent ({ACCOUNT_CURRENCY})",
  "ad spend": "Amount spent ({ACCOUNT_CURRENCY})",
  "cost": "Amount spent ({ACCOUNT_CURRENCY})",

  // ── CPM ─────────────────────────────────────────────────────────────
  // Meta sometimes shortens the label to the abbreviation only
  "cpm": "CPM (cost per 1,000 impressions)",
  "cpm (cost per 1000 impressions)": "CPM (cost per 1,000 impressions)",

  // ── Accounts Center reached ──────────────────────────────────────────
  "cost per 1,000 accounts center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  "cost per 1000 accounts center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  "cost per 1,000 account center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  "cost per 1000 account center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",

  // ── Results / conversions ────────────────────────────────────────────
  "conversions": "Results",
  "total results": "Results",
  "total conversions": "Results",
  "actions": "Results",             // legacy Meta label pre-2020
  "total actions": "Results",

  // ── CPC ─────────────────────────────────────────────────────────────
  // "CPC (all)" — the blended click cost across all click types
  "cpc": "CPC (all)",
  "cost per click": "CPC (all)",
  // "CPC (cost per link click)" — the link-specific cost (higher specificity)
  "link cpc": "CPC (cost per link click)",
  "cost per link click": "CPC (cost per link click)",

  // ── CTR ─────────────────────────────────────────────────────────────
  // "CTR (all)" — blended CTR
  "ctr": "CTR (all)",
  "click-through rate": "CTR (all)",
  "click through rate": "CTR (all)",
  // "CTR (link click-through rate)" — link-specific CTR
  "link ctr": "CTR (link click-through rate)",
  "ctr (link)": "CTR (link click-through rate)",
  "link click-through rate": "CTR (link click-through rate)",
  "link click through rate": "CTR (link click-through rate)",

  // ── Link clicks ──────────────────────────────────────────────────────
  "link click": "Link clicks",

  // ── Reach ────────────────────────────────────────────────────────────
  "unique reach": "Reach",

  // ── Impression device / placement breakdown ──────────────────────────
  // Impression device label variants seen in Ads Manager UI
  "device": "Impression device",
  "device type": "Impression device",
  "ad impression device": "Impression device",
  // Placement
  "ad placement": "Placement",
  "placement type": "Placement",

  // ── Frequency ────────────────────────────────────────────────────────
  "avg. frequency": "Frequency",
  "average frequency": "Frequency",
  "avg frequency": "Frequency",

  // ── Landing page views ───────────────────────────────────────────────
  "landing page view": "Landing page views",
  "lpv": "Landing page views",

  // ── Video metrics ─────────────────────────────────────────────────────
  // ThruPlays — Meta sometimes shows "Thruplays" or plural variant
  "thruplays": "ThruPlays",
  "thruplay": "ThruPlays",
  // 3-second video plays
  "3 second video plays": "3-second video plays",
  "3s video plays": "3-second video plays",
  "3 sec video plays": "3-second video plays",
  // Video play-through quartile variants (no space before %)
  "video plays at 25": "Video plays at 25%",
  "video plays at 50": "Video plays at 50%",
  "video plays at 75": "Video plays at 75%",
  "video plays at 95": "Video plays at 95%",
  "video plays at 100": "Video plays at 100%",
  "video p25": "Video plays at 25%",
  "video p50": "Video plays at 50%",
  "video p75": "Video plays at 75%",
  "video p95": "Video plays at 95%",
  "video p100": "Video plays at 100%",
};

/** How a CSV header was resolved to a canonical column name. */
export type ColumnMatchVia = "exact" | "currency" | "case_insensitive" | "alias" | "slug" | "inferred";

/**
 * Represents a successful mapping from a CSV header to a canonical column.
 *
 * `confidence` ranges 0–1:
 *   - exact       → 1.00
 *   - currency    → 0.99 (amount spent with locale currency suffix)
 *   - case_insensitive → 0.97
 *   - alias       → 0.95 (known Meta UI export variant)
 *   - slug        → 0.90 (normalized slug match)
 *   - inferred    → Jaccard similarity score (0.5–1.0 when promoted)
 *
 * `method` is a short human-readable label suitable for display in the UI.
 */
export type ColumnMatch = {
  headerValue: string;
  via: ColumnMatchVia;
  confidence: number;
  method: string;
};

/** Fixed confidence values for each resolution tier. */
export const CONFIDENCE_BY_VIA: Record<ColumnMatchVia, number> = {
  exact: 1.0,
  currency: 0.99,
  case_insensitive: 0.97,
  alias: 0.95,
  slug: 0.90,
  inferred: 0, // overridden per-call with actual Jaccard score
};

const METHOD_LABEL_BY_VIA: Record<ColumnMatchVia, string> = {
  exact: "Exact match",
  currency: "Currency suffix match",
  case_insensitive: "Case-insensitive match",
  alias: "Known alias",
  slug: "Normalized slug match",
  inferred: "Inferred (Jaccard similarity)",
};

/**
 * Tries to find a canonical column in a CSV header row using a cascade:
 *  1. Exact match
 *  2. {ACCOUNT_CURRENCY} placeholder match (e.g. "Amount spent (USD)")
 *  3. Case-insensitive exact match
 *  4. Known alias lookup (COLUMN_ALIASES)
 *  5. Slug-based match (normalize both sides to slug form)
 *
 * Returns null if no match found even with fuzzy resolution.
 */
export function findColumnInHeader(headers: string[], canonical: string): ColumnMatch | null {
  const makeMatch = (headerValue: string, via: ColumnMatchVia, confidence?: number): ColumnMatch => ({
    headerValue,
    via,
    confidence: confidence ?? CONFIDENCE_BY_VIA[via],
    method: METHOD_LABEL_BY_VIA[via],
  });

  // 1. Exact match
  const exact = headers.find((h) => h.trim() === canonical);
  if (exact !== undefined) return makeMatch(exact.trim(), "exact");

  // 2. Currency placeholder match (e.g. "Amount spent (USD)")
  if (canonical.includes("{ACCOUNT_CURRENCY}")) {
    const cur = headers.find((h) => headerMatchesColumn(h, canonical));
    if (cur !== undefined) return makeMatch(cur.trim(), "currency");
    // Also check: header might literally say "Amount spent" with no currency
    const plainSpend = headers.find(
      (h) => h.trim().toLowerCase() === "amount spent" || COLUMN_ALIASES[h.trim().toLowerCase()] === canonical,
    );
    if (plainSpend !== undefined) return makeMatch(plainSpend.trim(), "alias");
  }

  const lower = canonical.toLowerCase();

  // 3. Case-insensitive exact match
  const ci = headers.find((h) => h.trim().toLowerCase() === lower);
  if (ci !== undefined) return makeMatch(ci.trim(), "case_insensitive");

  // 4. Alias lookup — check if any header's lowercase form is an alias that maps to this canonical
  for (const [aliasKey, aliasCanon] of Object.entries(COLUMN_ALIASES)) {
    if (aliasCanon === canonical) {
      const found = headers.find((h) => h.trim().toLowerCase() === aliasKey);
      if (found !== undefined) return makeMatch(found.trim(), "alias");
    }
  }

  // 5. Slug match — normalize both sides and compare
  const canonSlug = slugifyColumn(canonical);
  const slugMatch = headers.find((h) => slugifyColumn(h) === canonSlug);
  if (slugMatch !== undefined) return makeMatch(slugMatch.trim(), "slug");

  return null;
}

/**
 * Infers the best mapping from a list of unmapped CSV headers to a missing
 * canonical column using Jaccard token similarity on slugified forms.
 *
 * Returns a `ColumnMatch` (via: "inferred") when the best scoring unmapped
 * header exceeds the minimum threshold (score ≥ 0.5); null otherwise.
 *
 * Callers should use this after `findColumnInHeader` has already failed —
 * i.e. only for headers that weren't matched by exact/alias/slug resolution.
 *
 * Threshold semantics:
 *   ≥ 0.75 — high confidence, auto-promote silently
 *   0.50–0.74 — moderate confidence, auto-promote with a warning
 *   < 0.50 — not promoted; canonical stays missing
 */
export function inferColumnMapping(
  unmappedHeaders: string[],
  missingCanonical: string,
): ColumnMatch | null {
  const canonTokens = new Set(slugifyColumn(missingCanonical).split("_").filter(Boolean));
  if (canonTokens.size === 0) return null;

  let best: { headerValue: string; score: number } | null = null;
  for (const h of unmappedHeaders) {
    const hTokens = new Set(slugifyColumn(h).split("_").filter(Boolean));
    if (hTokens.size === 0) continue;
    const intersection = [...canonTokens].filter((t) => hTokens.has(t)).length;
    const union = new Set([...canonTokens, ...hTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard >= 0.5 && (!best || jaccard > best.score)) {
      best = { headerValue: h, score: jaccard };
    }
  }

  if (!best) return null;
  return {
    headerValue: best.headerValue,
    via: "inferred",
    confidence: best.score,
    method: `Inferred (${Math.round(best.score * 100)}% token match)`,
  };
}

/**
 * For an unknown CSV header (one that didn't map to any canonical column),
 * finds the closest missing canonical it might represent using Jaccard token
 * similarity. Returns null if no candidate scores ≥ 0.4.
 *
 * Used to surface auto-suggestions when the parser encounters unrecognised
 * columns that look like they might be renamed versions of expected ones.
 *
 * @deprecated Prefer `inferColumnMapping` which returns a typed `ColumnMatch`
 *   and handles auto-promotion logic. This function is kept for backward
 *   compatibility with callers that only need the suggestion string.
 */
export function suggestCanonicalForUnknown(
  unknownHeader: string,
  missingCanonicals: string[],
): string | null {
  const unknownTokens = new Set(slugifyColumn(unknownHeader).split("_").filter(Boolean));
  if (unknownTokens.size === 0) return null;
  let best: { canonical: string; score: number } | null = null;
  for (const canonical of missingCanonicals) {
    const canonTokens = new Set(slugifyColumn(canonical).split("_").filter(Boolean));
    const intersection = [...unknownTokens].filter((t) => canonTokens.has(t)).length;
    const union = new Set([...unknownTokens, ...canonTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard >= 0.4 && (!best || jaccard > best.score)) {
      best = { canonical, score: jaccard };
    }
  }
  return best?.canonical ?? null;
}

/**
 * Columns that uniquely identify each CSV class. Their presence in a file
 * parsed under the OTHER class is strong evidence of a wrong-slot upload.
 * Each set uses columns that cannot appear in the opposing class's template.
 *
 * Demographic signatures: "Gender" and "Age" only exist in the demographic pivot.
 * Device/placement signatures: "Placement" and "Impression device" only exist
 *   in the device/placement pivot.
 */
export const CSV_CLASS_SIGNATURE_COLUMNS: Record<IapCsvClass, readonly string[]> = {
  demographic: ["Gender", "Age"],
  device_placement: ["Placement", "Impression device"],
  // ad_summary has no exclusive signature columns — it is the absence of the
  // above that identifies it (and it is always uploaded via its own kind slot).
  ad_summary: [],
};

/**
 * Checks whether the CSV headers look like they belong to a DIFFERENT class
 * than the one the caller is trying to parse.
 *
 * Returns a human-readable error message when a mismatch is detected, or null
 * when the headers are consistent with the expected class. Uses the same
 * `findColumnInHeader` resolution cascade (aliases, case-insensitive, slug)
 * so that variants like "ad placement" or "device type" are also caught.
 *
 * A single matching signature column is sufficient to flag the mismatch,
 * since these columns are exclusive to their respective pivot classes and
 * cannot appear in the other class's export.
 */
export function detectCsvClassMismatch(
  headers: string[],
  expectedClass: IapCsvClass,
): string | null {
  if (expectedClass === "ad_summary") {
    // ad_summary must NOT contain demographic or device/placement exclusive columns.
    const demoMatched = CSV_CLASS_SIGNATURE_COLUMNS.demographic.filter(
      (col) => findColumnInHeader(headers, col) !== null,
    );
    if (demoMatched.length > 0) {
      const quotedCols = demoMatched.map((c) => `"${c}"`).join(", ");
      return (
        `This file looks like a Demographic pivot export — it contains ${quotedCols}, ` +
        `which only appears in that pivot type. ` +
        `Upload it as the Demographics CSV instead, and provide an ad-level summary export here.`
      );
    }
    const deviceMatched = CSV_CLASS_SIGNATURE_COLUMNS.device_placement.filter(
      (col) => findColumnInHeader(headers, col) !== null,
    );
    if (deviceMatched.length > 0) {
      const quotedCols = deviceMatched.map((c) => `"${c}"`).join(", ");
      return (
        `This file looks like a Device/Placement pivot export — it contains ${quotedCols}, ` +
        `which only appears in that pivot type. ` +
        `Upload it as the Device/Placement CSV instead, and provide an ad-level summary export here.`
      );
    }
    return null;
  }

  const otherClass: IapCsvClass = expectedClass === "demographic" ? "device_placement" : "demographic";
  const otherSignature = CSV_CLASS_SIGNATURE_COLUMNS[otherClass];

  const matchedCols = otherSignature.filter((col) => findColumnInHeader(headers, col) !== null);
  if (matchedCols.length === 0) return null;

  const quotedCols = matchedCols.map((c) => `"${c}"`).join(", ");
  if (expectedClass === "demographic") {
    return (
      `This file looks like a Device/Placement pivot export — it contains ${quotedCols}, ` +
      `which only appears in that pivot type. ` +
      `Did you upload it in the wrong slot? ` +
      `Upload this file as the Device/Placement CSV instead, and provide a Demographic pivot export here.`
    );
  }
  return (
    `This file looks like a Demographic pivot export — it contains ${quotedCols}, ` +
    `which only appears in that pivot type. ` +
    `Did you upload it in the wrong slot? ` +
    `Upload this file as the Demographic CSV instead, and provide a Device/Placement pivot export here.`
  );
}

/**
 * Core base metrics whose absence meaningfully degrades analysis quality.
 * Missing any of these triggers a "reduced confidence" warning rather than
 * a hard error — analysis proceeds with nulls for the missing columns.
 */
export const CORE_BASE_METRICS: ReadonlySet<string> = new Set([
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Reach",
  "Impressions",
  "Results",
  "Cost per result",
  "Link clicks",
  "CTR (link click-through rate)",
  "CPM (cost per 1,000 impressions)",
]);

export type IapCsvMetricGroup = { name: string; required: boolean; columns: readonly string[] };

export type IapCsvClassFormat = {
  report_name: string;
  breakdown_columns: readonly string[];
  metric_groups: IapCsvMetricGroup[];
  sample_csv: string;
};

function resolveCurrencyColumn(col: string): string {
  return col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;
}

function buildSampleRow(breakdowns: Record<string, string>, baseValues: Record<string, string>): string[] {
  return [...Object.values(breakdowns), ...Object.values(baseValues)];
}

/**
 * Detects which IAP CSV class a file belongs to by checking for the class's
 * exclusive signature columns in the header row.
 *
 * Returns the detected class, or null when neither class's signature columns
 * appear (e.g. a CSV with no breakdown columns at all). The check is tolerant
 * of column aliases and case variations — it uses the same `findColumnInHeader`
 * cascade as the full parser.
 *
 * Signature columns are mutually exclusive between the two classes:
 *   demographic     → "Gender", "Age"
 *   device_placement → "Placement", "Impression device"
 */
export function detectCsvClassFromHeaders(headers: string[]): IapCsvClass | null {
  // Check classes that have exclusive signature columns first.
  for (const cls of ["demographic", "device_placement"] as const) {
    const signatures = CSV_CLASS_SIGNATURE_COLUMNS[cls];
    if (signatures.some((col) => findColumnInHeader(headers, col) !== null)) {
      return cls;
    }
  }
  // ad_summary has no exclusive signature columns — return null; callers rely
  // on the upload kind slot to identify these files rather than auto-detection.
  return null;
}

/**
 * Checks whether both CSV staging slots (demo and placement) resolved to the
 * same CSV class — which means one required class is duplicated and the other
 * is entirely missing.
 *
 * Pass in the detected classes for all imports in each slot (may include nulls
 * for files where detection was inconclusive). Returns a descriptor of the
 * duplicate/missing pair when a conflict is found, or null when the coverage
 * looks correct.
 *
 * This is a pure function — it does no I/O and can be unit-tested directly.
 */
export function checkDuplicateCsvClasses(
  demoDetected: (IapCsvClass | null)[],
  placementDetected: (IapCsvClass | null)[],
): { duplicatedClass: IapCsvClass; missingClass: IapCsvClass } | null {
  const demoClass = demoDetected.find((c) => c !== null) ?? null;
  const placementClass = placementDetected.find((c) => c !== null) ?? null;
  if (demoClass !== null && placementClass !== null && demoClass === placementClass) {
    // When both slots have the same class, the missing one is the other
    // primary pivot class (ad_summary never appears via header detection so
    // it can't be the duplicated class here).
    const missingClass: IapCsvClass =
      demoClass === "demographic" ? "device_placement" : "demographic";
    return { duplicatedClass: demoClass, missingClass };
  }
  return null;
}

const CSV_CLASS_LABEL: Record<IapCsvClass, string> = {
  demographic: "Demographic (Gender/Age)",
  device_placement: "Device/Placement (Impression device, Platform, Placement)",
  ad_summary: "Ad Summary (ad-level, no demographic or placement breakdown)",
};

/** Human-readable label for a CSV class, for use in error messages. */
export function iapCsvClassLabel(cls: IapCsvClass): string {
  return CSV_CLASS_LABEL[cls];
}

/** Builds the user-facing format spec (columns + a valid sample CSV) for one CSV class. */
export function buildIapCsvClassFormat(csvClass: IapCsvClass): IapCsvClassFormat {
  const spec = IAP_CSV_CLASS_SPECS[csvClass];
  const header = [...spec.breakdownColumns, ...BASE_METRICS.map(resolveCurrencyColumn)];

  const isDemo = csvClass === "demographic";
  const isSummary = csvClass === "ad_summary";
  const commonBreakdowns: Record<string, string> = {
    Date: "2026-06-01",
    "Campaign ID": "6001",
    "Campaign name": "Prospecting - Broad",
    "Ad set ID": "7001",
    "Ad set name": "Prospecting - Broad - AS1",
    "Ad ID": "8001",
    "Ad name": "UGC_Testimonial_v1",
  };
  const breakdownSample1: Record<string, string> = isDemo
    ? { ...commonBreakdowns, Gender: "female", Age: "25-34", Text: "" }
    : isSummary
    ? { ...commonBreakdowns }
    : { ...commonBreakdowns, "Impression device": "iphone", Platform: "facebook", Placement: "feed" };
  const breakdownSample2: Record<string, string> = isDemo
    ? { ...breakdownSample1, Gender: "male", Age: "35-44" }
    : isSummary
    ? { ...commonBreakdowns, Date: "2026-06-02" }
    : { ...breakdownSample1, "Impression device": "android_smartphone", Platform: "instagram", Placement: "story" };

  const baseSample1: Record<string, string> = {};
  const baseSample2: Record<string, string> = {};
  for (const col of BASE_METRICS) {
    const label = resolveCurrencyColumn(col);
    if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
      baseSample1[label] = "42.50";
      baseSample2[label] = "55.10";
    } else if (col === "Result type") {
      baseSample1[label] = "Purchases";
      baseSample2[label] = "Purchases";
    } else if (col === "Result value type") {
      baseSample1[label] = "";
      baseSample2[label] = "";
    } else if (col === "Impressions") {
      baseSample1[label] = "5100";
      baseSample2[label] = "6200";
    } else if (col === "Reach") {
      baseSample1[label] = "4800";
      baseSample2[label] = "5850";
    } else if (col === "Link clicks") {
      baseSample1[label] = "180";
      baseSample2[label] = "210";
    } else if (col === "Clicks (all)") {
      baseSample1[label] = "205";
      baseSample2[label] = "240";
    } else if (col === "Results") {
      baseSample1[label] = "3";
      baseSample2[label] = "5";
    } else {
      baseSample1[label] = "";
      baseSample2[label] = "";
    }
  }

  const rows = [
    buildSampleRow(breakdownSample1, baseSample1),
    buildSampleRow(breakdownSample2, baseSample2),
  ];
  const sampleCsv = [header.join(","), ...rows.map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(","))].join("\n");

  return {
    report_name: spec.className,
    breakdown_columns: spec.breakdownColumns,
    metric_groups: [
      { name: "Base", required: true, columns: BASE_METRICS.map(resolveCurrencyColumn) },
      { name: "Ecommerce", required: false, columns: ECOMMERCE_METRICS },
      { name: "Service", required: false, columns: SERVICE_METRICS },
      { name: "App", required: false, columns: APP_METRICS },
    ],
    sample_csv: sampleCsv,
  };
}
