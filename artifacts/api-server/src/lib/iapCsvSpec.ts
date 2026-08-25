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

/**
 * Ad creative metadata columns: string-valued fields from the Ad Summary export
 * that carry creative content rather than numeric performance metrics.
 * These are accepted in the ad_summary slot and stored in ad_creative_metadata.
 */
export const CREATIVE_METADATA_COLUMNS: readonly string[] = [
  "Ad creative body text",
  "Ad creative headline",
  "Ad creative call to action type",
  "Ad creative link destination",
  "Ad creative link caption",
];

export const BASE_METRICS: readonly string[] = [
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Reach",
  "Impressions",
  "Frequency",
  "CPM (cost per 1,000 impressions)",
  "Result type",
  "Results",
  "Result value type",
  "Results value",
  "Views",
  "Clicks (all)",
  "CTR (all)",
  "Link clicks",
  "CTR (link click-through rate)",
  "Unique clicks (all)",
  "Outbound clicks",
  "Unique outbound clicks",
  "Landing page views",
  "Page engagement",
  "Post engagements",
  "Post comments",
  "Post reactions",
  "Post saves",
  "Post shares",
  "Instagram profile visits",
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
];

/**
 * Columns that are either fully derivable from raw counts already in
 * BASE_METRICS (cost-per-X ratios: spend ÷ X; rate columns: X ÷ Y) or
 * irrelevant to the analysis (Meta's diagnostic ranking labels).
 *
 * They are ACCEPTED transparently when present (parsed into row.base like any
 * base metric) but are never expected: they don't appear in the Required
 * Format panel, are never listed as missing, and never generate warnings.
 * Where a derived value is needed downstream, the analysis engine computes it
 * from raw counts (see derivedRates in analysisEngine.ts) — the server never
 * trusts a pre-divided ratio column over its own math.
 */
export const DERIVED_OR_IRRELEVANT_METRICS: readonly string[] = [
  // Derivable cost-per-X ratios (spend ÷ raw count)
  "Cost per result",
  "Cost per 1,000 Accounts Center accounts reached",
  "CPC (all)",
  "CPC (cost per link click)",
  "Cost per unique click (all)",
  "Cost per unique link click",
  "Cost per outbound click",
  "Cost per unique outbound click",
  "Cost per landing page view",
  "Cost per Page engagement",
  "Cost per post engagement",
  "Cost per post share",
  "Cost per interaction",
  "Cost per ThruPlay",
  "Cost per 3-second video play",
  "Cost per 2-second continuous video play",
  // Derivable rate columns (count ÷ count)
  "Result rate",
  "Results rate per link clicks",
  "Unique CTR (link click-through rate)",
  "Outbound CTR (click-through rate)",
  "Unique outbound CTR (click-through rate)",
  "Landing page views rate per link clicks",
  // Irrelevant diagnostic / ranking labels
  "Quality ranking",
  "Engagement rate ranking",
  "Conversion rate ranking",
  "Ad recall lift rate",

  // ── Objective-group ratios (ecommerce / service / app) ───────────────
  // Same rule as the cost-per-X block above: every one of these is
  // spend ÷ count, value ÷ spend, or count ÷ count over columns the
  // account already supplies. They were previously listed as expected
  // members of ECOMMERCE_METRICS / SERVICE_METRICS / APP_METRICS, which
  // put 22 derivable columns in front of the user as things to tick in
  // the Ads Manager export dialog. They are now accepted transparently
  // when present and never asked for.
  "Cost per add to cart",
  "Cost per content view",
  "Cost per checkout initiated",
  "Cost per purchase",
  "Purchase ROAS (return on ad spend)",
  "Website purchase ROAS (return on ad spend)",
  "Average purchases conversion value",
  "Purchases rate per landing page views",
  "Purchases rate per link clicks",
  "Cost per lead",
  "Cost per contact",
  "Cost per appointment scheduled",
  "Cost per registration completed",
  "Cost per app install",
  "Cost per mobile app install",
  "Cost per app activation",
  "Cost per in-app session",
  "Cost per in-app purchase",
  "Cost per in-app registration completed",
  "Cost per in-app trial started",
  "Cost per in-app subscription",
  "Cost per rating submitted",
];

// Objective-group metrics list RAW COUNTS AND VALUES ONLY. Every cost-per-X,
// ROAS and rate that Meta offers alongside these is derivable from a count
// already here plus spend, so it lives in DERIVED_OR_IRRELEVANT_METRICS and is
// accepted transparently rather than requested. A column earns a place in this
// list only if it cannot be computed from other columns on the same row.
export const ECOMMERCE_METRICS: readonly string[] = [
  "Adds to cart",
  "Adds to cart conversion value",
  "Content views",
  "Content views conversion value",
  "Checkouts initiated",
  "Purchases",
  "Website purchases",
  "Website purchases conversion value",
  "Direct website purchases",
  "Direct website purchases conversion value",
  "Shops-assisted purchases",
  "Shops-assisted purchases conversion value",
  "Meta purchases",
  "Meta purchases conversion value",
  "Purchases conversion value",
  "Adds of payment info",
];

export const SERVICE_METRICS: readonly string[] = [
  "Leads",
  "Leads conversion value",
  "Meta leads",
  "Website leads",
  "Contacts",
  "Contact conversion value",
  "Appointments scheduled",
  "Registrations completed",
  "Registrations completed conversion value",
  "Calls placed",
  "20-second calls",
  "60-second calls",
  "Estimated call confirmation clicks",
  "Callback requests submitted",
];

export const APP_METRICS: readonly string[] = [
  "App installs",
  "Mobile app installs",
  "App activations",
  "App activations conversion value",
  "In-app sessions",
  "In-app sessions conversion value",
  "In-app purchases",
  "In-app registrations completed",
  "In-app trials started",
  "In-app subscriptions",
  "In-app subscriptions conversion value",
  "Ratings submitted",
  "Ratings submitted conversion value",
];

/** Ecommerce + Service + App metrics: optional, present only for accounts of that business type. Never fabricated when absent. */
export const OPTIONAL_METRICS: readonly string[] = [...ECOMMERCE_METRICS, ...SERVICE_METRICS, ...APP_METRICS];

// ─── Objective column groups ────────────────────────────────────────────
// There are only three REAL column groups in Meta exports, while the
// objective vocabulary has four keys (ecommerce/lead_gen/service/app):
// SERVICE_METRICS (Leads, Appointments, Registrations, Calls…) is shared
// by both the lead_gen and service objectives. Column presence cannot
// distinguish those two — that distinction stays business context set in
// Settings, never inferred from data. Detection therefore reports the
// shared group once as "service_or_lead_gen".
export type ObjectiveColumnGroup = "ecommerce" | "service_or_lead_gen" | "app";

export const OBJECTIVE_COLUMN_GROUPS: Record<ObjectiveColumnGroup, readonly string[]> = {
  ecommerce: ECOMMERCE_METRICS,
  service_or_lead_gen: SERVICE_METRICS,
  app: APP_METRICS,
};

/**
 * Which objective column groups are present, given the optional-metric
 * column names (canonical, pre-slug) found in a CSV header. Presence-based
 * only — a single column from a group counts as the group being present,
 * matching the parser's existing "never fabricate absent optional metrics"
 * presence rule.
 */
export function detectObjectiveColumnGroups(optionalMetricsPresent: readonly string[]): Set<ObjectiveColumnGroup> {
  const present = new Set(optionalMetricsPresent);
  const out = new Set<ObjectiveColumnGroup>();
  for (const [group, cols] of Object.entries(OBJECTIVE_COLUMN_GROUPS) as [ObjectiveColumnGroup, readonly string[]][]) {
    if (cols.some((c) => present.has(c))) out.add(group);
  }
  return out;
}

/**
 * Slugified optional-metric column names belonging to the given objective
 * column groups. Used by the analysis run to keep only the optional metrics
 * that belong to the account's CONFIGURED objectives — columns for
 * unconfigured objectives are dropped before aggregation (they only produce
 * a non-blocking enable-suggestion flag, never persisted analysis data).
 */
export function optionalMetricSlugsForGroups(groups: Iterable<ObjectiveColumnGroup>): Set<string> {
  const out = new Set<string>();
  for (const group of groups) {
    for (const col of OBJECTIVE_COLUMN_GROUPS[group]) out.add(slugifyColumn(col));
  }
  return out;
}

export const DEMOGRAPHIC_BREAKDOWN_COLUMNS: readonly string[] = [
  "Day",
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
  "Day",
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
 * Conversion device breakdown columns: same as device/placement but uses
 * "Conversion device" (the device where the conversion happened) rather than
 * "Impression device" (where the ad was shown). These rows carry only conversion
 * metrics — no spend or impressions — and must be kept in a separate slot to
 * avoid tracking_basis collisions with impression-device rows.
 */
export const CONVERSION_DEVICE_BREAKDOWN_COLUMNS: readonly string[] = [
  "Day",
  "Campaign name",
  "Ad name",
  "Conversion device",
];

/**
 * Ad-level summary breakdown columns: no demographic (Gender/Age) or
 * device/placement breakdown dimensions. One row per ad per day — the only
 * format from Meta that carries full spend unaffected by iOS privacy limits.
 */
export const AD_SUMMARY_BREAKDOWN_COLUMNS: readonly string[] = [
  "Day",
  "Campaign ID",
  "Campaign name",
  "Ad set ID",
  "Ad set name",
  "Ad ID",
  "Ad name",
];

export type IapCsvClass = "demographic" | "device_placement" | "ad_summary" | "conversion_device";

export type IapCsvClassSpec = {
  className: "IAP_DEMOGRAPHIC_TEXT_SIGNAL" | "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL" | "IAP_AD_SUMMARY" | "IAP_CONVERSION_DEVICE_SIGNAL";
  breakdownColumns: readonly string[];
  /** Breakdown columns that must have a value on every row (Day, Ad name are load-bearing). */
  requiredBreakdownColumns: readonly string[];
};

export const IAP_CSV_CLASS_SPECS: Record<IapCsvClass, IapCsvClassSpec> = {
  demographic: {
    className: "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    breakdownColumns: DEMOGRAPHIC_BREAKDOWN_COLUMNS,
    requiredBreakdownColumns: ["Day", "Campaign name", "Ad name", "Gender", "Age"],
  },
  device_placement: {
    className: "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
    breakdownColumns: DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
    // "Impression device" is intentionally NOT required: Meta's own export UI
    // can omit or blank this column for some date ranges/account states (its
    // device breakdown eligibility has shifted over time — see the
    // device_performance schema notes). Treating it as required would hard-fail
    // the entire placement/platform/spend ingestion just because the device
    // dimension is unavailable. analysisEngine degrades gracefully per-row
    // instead: rows with a blank device are excluded from device aggregation
    // only, everything else (Placement, Platform, spend) still ingests.
    requiredBreakdownColumns: ["Day", "Campaign name", "Ad name", "Platform", "Placement"],
  },
  ad_summary: {
    className: "IAP_AD_SUMMARY",
    breakdownColumns: AD_SUMMARY_BREAKDOWN_COLUMNS,
    // Ad name is required; Campaign name used for bucketing but tolerated blank
    requiredBreakdownColumns: ["Day", "Ad name"],
  },
  conversion_device: {
    className: "IAP_CONVERSION_DEVICE_SIGNAL",
    breakdownColumns: CONVERSION_DEVICE_BREAKDOWN_COLUMNS,
    requiredBreakdownColumns: ["Day", "Campaign name", "Ad name", "Conversion device"],
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
  // "Day" is canonical — it is what Meta Ads Manager standard UI exports
  // actually emit. "Date" (and the labels below) are accepted as aliases.
  "date": "Day",
  // Reporting period labels seen in Meta Business Suite / legacy exports
  "report date": "Day",
  "reporting date": "Day",
  "reporting starts": "Day",
  "report start": "Day",
  "date start": "Day",
  "week": "Day",                  // weekly-rollup exports sometimes emit "Week"

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
  // "Device platform" is what the Ads Reporting pivot exporter emits for the
  // impression-device breakdown (observed in a real client export, Aug 2026).
  // Token overlap with "Impression device" is only 0.33 — below the 0.5
  // inference threshold — so without this entry the column never resolves.
  "device platform": "Impression device",
  "impression device platform": "Impression device",
  // Placement
  "ad placement": "Placement",
  "placement type": "Placement",

  // ── Conversion device breakdown ───────────────────────────────────────
  // Only appears in the conversion-device pivot (distinct from impression device)
  "conv. device": "Conversion device",
  "converting device": "Conversion device",
  "device (conversion)": "Conversion device",

  // ── Ad creative metadata columns ──────────────────────────────────────
  // Body text / description variants
  "body text": "Ad creative body text",
  "ad body text": "Ad creative body text",
  "creative body text": "Ad creative body text",
  "description": "Ad creative body text",
  "ad description": "Ad creative body text",
  "creative description": "Ad creative body text",
  // Headline variants
  "headline": "Ad creative headline",
  "ad headline": "Ad creative headline",
  "creative headline": "Ad creative headline",
  // Call to action variants
  "call to action": "Ad creative call to action type",
  "cta": "Ad creative call to action type",
  "call to action type": "Ad creative call to action type",
  "ad cta": "Ad creative call to action type",
  // Link destination / website URL
  "website url": "Ad creative link destination",
  "landing page url": "Ad creative link destination",
  "link destination": "Ad creative link destination",
  "destination url": "Ad creative link destination",
  // Link caption
  "link caption": "Ad creative link caption",
  "caption": "Ad creative link caption",
  "ad caption": "Ad creative link caption",

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

/**
 * Signal weights for each canonical column used in the Confidence Report grade.
 * Weights reflect how much each column contributes to signal analysis quality.
 * Columns not listed here have weight 0 (cosmetic / supplementary).
 * All listed weights must sum to 1.0.
 */
export const SIGNAL_WEIGHTS: Record<string, number> = {
  "Amount spent ({ACCOUNT_CURRENCY})": 0.20,
  "Results": 0.23,
  "Impressions": 0.10,
  "CTR (link click-through rate)": 0.07,
  "Link clicks": 0.07,
  "Reach": 0.06,
  "CPM (cost per 1,000 impressions)": 0.05,
  "Video average play time": 0.03,
  "ThruPlays": 0.03,
  "Landing page views": 0.03,
  "Clicks (all)": 0.02,
  "CTR (all)": 0.02,
  "Frequency": 0.02,
  "Result type": 0.02,
  "Ad creative body text": 0.01,
  "Ad creative headline": 0.01,
  "Conversion device": 0.01,
  // total = 1.00
};

/** How a CSV header was resolved to a canonical column name. */
export type ColumnMatchVia = "exact" | "currency" | "case_insensitive" | "alias" | "slug" | "inferred";

/**
 * Represents a successful mapping from a CSV header to a canonical column.
 *
 * `confidence` ranges 0–1:
 *   - exact       → 1.00
 *   - currency    → 0.99 (monetary column with a locale currency suffix)
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
 *  2. {ACCOUNT_CURRENCY} placeholder match (e.g. "Amount spent (USD)"), or —
 *     for every other column — a trailing currency-suffix match
 *     (e.g. "CPM (cost per 1,000 impressions) (USD)")
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
    // Slug-tolerant currency match: a spreadsheet round-trip mangles
    // "Amount spent (USD)" into "Amount spent _USD_", whose slug is
    // "amount_spent_usd" — but slugifyColumn STRIPS the placeholder from the
    // canonical ("amount_spent"), so the generic slug pass below can never
    // see it and the header used to fall through to a 67% Jaccard inference
    // with a spurious "please verify" hedge. Build the slug pattern with a
    // real 3-letter code slot instead.
    const slugPattern = new RegExp(
      `^${slugifyColumn(canonical.replace("{ACCOUNT_CURRENCY}", "XQZ")).replace("xqz", "[a-z]{3}")}$`,
    );
    const slugCur = headers.find((h) => slugPattern.test(slugifyColumn(h)));
    if (slugCur !== undefined) return makeMatch(slugCur.trim(), "slug");
    // Also check: header might literally say "Amount spent" with no currency
    const plainSpend = headers.find(
      (h) => h.trim().toLowerCase() === "amount spent" || COLUMN_ALIASES[h.trim().toLowerCase()] === canonical,
    );
    if (plainSpend !== undefined) return makeMatch(plainSpend.trim(), "alias");
  } else {
    // 2b. Generic currency-suffix tolerance: some Meta export types append
    // the account currency to EVERY monetary column, not just "Amount spent"
    // — e.g. "CPM (cost per 1,000 impressions) (USD)". Stripping one
    // trailing 3-uppercase-letter parenthetical and re-comparing is 1:1,
    // not a guess, so it must resolve deterministically here instead of
    // falling through to Jaccard inference with a spurious low-confidence
    // flag. Uppercase-only keeps semantic parentheticals like "(all)" out.
    const canonSlugForCurrency = slugifyColumn(canonical);
    const currencySuffixed = headers.find((h) => {
      const trimmed = h.trim();
      const stripped = trimmed.replace(/\s*\([A-Z]{3}\)$/, "");
      if (stripped === trimmed) return false;
      return (
        stripped === canonical ||
        stripped.toLowerCase() === canonical.toLowerCase() ||
        slugifyColumn(stripped) === canonSlugForCurrency
      );
    });
    if (currencySuffixed !== undefined) return makeMatch(currencySuffixed.trim(), "currency");
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

/** Tokens that name a DIFFERENT Meta export concept from any canonical
 *  column in this spec. A header carrying one of these (where the canonical
 *  doesn't) shares its entity words with the canonical — "Ad set budget" and
 *  "Ad set ID" overlap on ad/set — but describes campaign *configuration*,
 *  not the identifier or metric the canonical means, so token similarity is
 *  structurally misleading for it. Observed live (AAFE, Aug 24): "Ad set
 *  budget" auto-promoted to "Ad set ID" at 50%, putting currency amounts
 *  where object IDs belong and asking the user to "please verify" a mapping
 *  that is never correct. Such headers must stay unmapped instead. */
const CONFLICTING_CONCEPT_TOKENS = new Set([
  "budget",
  "bid",
  "bids",
  "schedule",
  "scheduling",
  "delivery",
  "objective",
  "status",
  "cap",
]);

function hasConflictingConceptToken(headerTokens: Set<string>, canonTokens: Set<string>): boolean {
  for (const t of headerTokens) {
    if (CONFLICTING_CONCEPT_TOKENS.has(t) && !canonTokens.has(t)) return true;
  }
  return false;
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
 *
 * Headers whose extra tokens name a conflicting concept (see
 * CONFLICTING_CONCEPT_TOKENS) are never promoted, regardless of score.
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
    if (hasConflictingConceptToken(hTokens, canonTokens)) continue;
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
    if (hasConflictingConceptToken(unknownTokens, canonTokens)) continue;
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
  // conversion_device is identified by the exclusive "Conversion device" column
  conversion_device: ["Conversion device"],
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
    // ad_summary must NOT contain demographic, device/placement, or conversion-device exclusive columns.
    const demoMatched = CSV_CLASS_SIGNATURE_COLUMNS.demographic.filter(
      (col) => findColumnInHeader(headers, col) !== null,
    );
    if (demoMatched.length > 0) {
      const quotedCols = demoMatched.map((c) => `"${c}"`).join(", ");
      return (
        `This file looks like a Demographic pivot export — it contains ${quotedCols}, ` +
        `which only appears in that pivot type. ` +
        `Did you upload it in the wrong slot? ` +
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
        `Did you upload it in the wrong slot? ` +
        `Upload it as the Device/Placement CSV instead, and provide an ad-level summary export here.`
      );
    }
    const convMatched = CSV_CLASS_SIGNATURE_COLUMNS.conversion_device.filter(
      (col) => findColumnInHeader(headers, col) !== null,
    );
    if (convMatched.length > 0) {
      const quotedCols = convMatched.map((c) => `"${c}"`).join(", ");
      return (
        `This file looks like a Conversion Device pivot export — it contains ${quotedCols}, ` +
        `which only appears in that pivot type. ` +
        `Did you upload it in the wrong slot? ` +
        `Upload it as the Conversion Device CSV instead, and provide an ad-level summary export here.`
      );
    }
    return null;
  }

  if (expectedClass === "conversion_device") {
    // conversion_device must NOT contain demographic or device/placement exclusive columns
    const demoMatched = CSV_CLASS_SIGNATURE_COLUMNS.demographic.filter(
      (col) => findColumnInHeader(headers, col) !== null,
    );
    if (demoMatched.length > 0) {
      const quotedCols = demoMatched.map((c) => `"${c}"`).join(", ");
      return (
        `This file looks like a Demographic pivot export — it contains ${quotedCols}. ` +
        `Did you upload it in the wrong slot? ` +
        `Upload it as the Demographics CSV instead.`
      );
    }
    const deviceMatched = CSV_CLASS_SIGNATURE_COLUMNS.device_placement.filter(
      (col) => findColumnInHeader(headers, col) !== null,
    );
    if (deviceMatched.length > 0) {
      const quotedCols = deviceMatched.map((c) => `"${c}"`).join(", ");
      return (
        `This file looks like a Device/Placement pivot export — it contains ${quotedCols}. ` +
        `Did you upload it in the wrong slot? ` +
        `Upload it as the Placements CSV instead.`
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
/**
 * Delivery primitives: metrics that only a DELIVERY-basis export can carry.
 *
 * Meta suppresses every one of these when the export is broken down by an
 * action/conversion dimension (the confirmed case is "Conversion device" —
 * an impression cannot be attributed to the device where a later conversion
 * happened, so spend, reach and impressions come back blank on every row).
 *
 * A file whose spend or impressions column RESOLVES but carries no value on
 * any row is therefore not a partially-degraded delivery export — it is an
 * export from which no cost, efficiency or rate metric can ever be computed.
 * `assertDeliveryCoverage` hard-blocks that case; see the coverage gate in
 * iapCsvParser.ts.
 *
 * This check is deliberately data-driven rather than a list of banned
 * breakdown columns: it catches any future Meta breakdown with the same
 * effect, and it catches genuinely broken exports too.
 */
export const DELIVERY_PRIMITIVES: readonly string[] = [
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Impressions",
  "Reach",
  "Frequency",
];

/**
 * The subset of DELIVERY_PRIMITIVES whose absence makes the file unusable
 * rather than merely degraded. Without spend there is no cost metric at all;
 * without impressions there is no rate metric at all.
 */
export const BLOCKING_DELIVERY_PRIMITIVES: readonly string[] = [
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Impressions",
];

export const CORE_BASE_METRICS: ReadonlySet<string> = new Set([
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Reach",
  "Impressions",
  "Results",
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
  for (const cls of ["demographic", "device_placement", "conversion_device"] as const) {
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
  conversion_device: "Conversion Device (conversion-based device breakdown, no spend/impressions)",
};

/** Human-readable label for a CSV class, for use in error messages. */
export function iapCsvClassLabel(cls: IapCsvClass): string {
  return CSV_CLASS_LABEL[cls];
}

/** Builds the user-facing format spec (columns + a valid sample CSV) for one CSV class. */
export function buildIapCsvClassFormat(csvClass: IapCsvClass): IapCsvClassFormat {
  const spec = IAP_CSV_CLASS_SPECS[csvClass];
  const isDemo = csvClass === "demographic";
  const isSummary = csvClass === "ad_summary";
  const isConversion = csvClass === "conversion_device";

  // For conversion_device, only breakdown + conversion metrics (no spend/impressions columns)
  // For ad_summary, include creative metadata columns in addition to base metrics
  const CONVERSION_METRIC_COLS = ["Results", "Result type"] as const;
  const baseMetricCols = isConversion ? [] : BASE_METRICS.map(resolveCurrencyColumn);
  const conversionMetricCols = isConversion ? [...CONVERSION_METRIC_COLS] : [];
  const creativeMeta = isSummary ? CREATIVE_METADATA_COLUMNS : [];
  const header = [...spec.breakdownColumns, ...baseMetricCols, ...conversionMetricCols, ...creativeMeta];

  const commonBreakdowns: Record<string, string> = {
    Day: "2026-06-01",
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
    : isConversion
    ? { Day: "2026-06-01", "Campaign name": "Prospecting - Broad", "Ad name": "UGC_Testimonial_v1", "Conversion device": "iphone" }
    : { ...commonBreakdowns, "Impression device": "iphone", Platform: "facebook", Placement: "feed" };
  const breakdownSample2: Record<string, string> = isDemo
    ? { ...breakdownSample1, Gender: "male", Age: "35-44" }
    : isSummary
    ? { ...commonBreakdowns, Day: "2026-06-02" }
    : isConversion
    ? { Day: "2026-06-01", "Campaign name": "Prospecting - Broad", "Ad name": "UGC_Testimonial_v1", "Conversion device": "android_smartphone" }
    : { ...breakdownSample1, "Impression device": "android_smartphone", Platform: "instagram", Placement: "story" };

  const baseSample1: Record<string, string> = {};
  const baseSample2: Record<string, string> = {};

  if (!isConversion) {
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
  }

  // For conversion_device, add conversion-only metric samples
  const conversionSample1: Record<string, string> = {};
  const conversionSample2: Record<string, string> = {};
  if (isConversion) {
    conversionSample1["Results"] = "3";
    conversionSample2["Results"] = "5";
    conversionSample1["Result type"] = "Purchases";
    conversionSample2["Result type"] = "Purchases";
  }

  // Creative metadata samples for ad_summary
  const creativeSample1: Record<string, string> = {};
  const creativeSample2: Record<string, string> = {};
  if (isSummary) {
    creativeSample1["Ad creative body text"] = "Try it risk-free today.";
    creativeSample2["Ad creative body text"] = "Limited time offer.";
    creativeSample1["Ad creative headline"] = "The #1 App for Results";
    creativeSample2["Ad creative headline"] = "Start Your Free Trial";
    creativeSample1["Ad creative call to action type"] = "INSTALL_MOBILE_APP";
    creativeSample2["Ad creative call to action type"] = "INSTALL_MOBILE_APP";
    creativeSample1["Ad creative link destination"] = "https://example.com/lp1";
    creativeSample2["Ad creative link destination"] = "https://example.com/lp2";
    creativeSample1["Ad creative link caption"] = "";
    creativeSample2["Ad creative link caption"] = "";
  }

  const combined1 = { ...baseSample1, ...conversionSample1, ...creativeSample1 };
  const combined2 = { ...baseSample2, ...conversionSample2, ...creativeSample2 };

  const rows = [
    buildSampleRow(breakdownSample1, combined1),
    buildSampleRow(breakdownSample2, combined2),
  ];
  // Quote header cells too — several canonical column names contain commas
  // (e.g. "CPM (cost per 1,000 impressions)"), so an unquoted header row
  // would be malformed CSV and the sample would fail its own re-upload.
  const sampleCsv = [header, ...rows]
    .map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(","))
    .join("\n");

  const metricGroups: IapCsvMetricGroup[] = isConversion
    ? [
        { name: "Conversion Metrics", required: true, columns: ["Results", "Result type"] },
        { name: "App (optional)", required: false, columns: APP_METRICS },
      ]
    : [
        { name: "Base", required: true, columns: BASE_METRICS.map(resolveCurrencyColumn) },
        ...(isSummary ? [{ name: "Ad Creative Metadata", required: false, columns: CREATIVE_METADATA_COLUMNS as readonly string[] }] : []),
        { name: "Ecommerce", required: false, columns: ECOMMERCE_METRICS },
        { name: "Service", required: false, columns: SERVICE_METRICS },
        { name: "App", required: false, columns: APP_METRICS },
      ];

  return {
    report_name: spec.className,
    breakdown_columns: spec.breakdownColumns,
    metric_groups: metricGroups,
    sample_csv: sampleCsv,
  };
}
