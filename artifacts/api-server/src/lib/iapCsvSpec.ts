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

export type IapCsvClass = "demographic" | "device_placement";

export type IapCsvClassSpec = {
  className: "IAP_DEMOGRAPHIC_TEXT_SIGNAL" | "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL";
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
 */
export const COLUMN_ALIASES: Record<string, string> = {
  // Meta Ads Manager standard UI exports use "Day" for the date breakdown
  "day": "Date",
  // CPM — Meta sometimes shortens the label
  "cpm": "CPM (cost per 1,000 impressions)",
  // Accounts Center reached — various capitalisation/abbreviation variants
  "cost per 1,000 accounts center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  "cost per 1000 accounts center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  "cost per 1,000 account center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  "cost per 1000 account center accounts reached":
    "Cost per 1,000 Accounts Center accounts reached",
  // Spend column — sometimes labelled without the currency suffix
  "spend": "Amount spent ({ACCOUNT_CURRENCY})",
  "total spend": "Amount spent ({ACCOUNT_CURRENCY})",
  "amount spent": "Amount spent ({ACCOUNT_CURRENCY})",
  // Results
  "conversions": "Results",
  "total results": "Results",
  "total conversions": "Results",
  // Link clicks
  "link click": "Link clicks",
  // CPC variations
  "cpc": "CPC (all)",
  "cost per click": "CPC (all)",
  // CTR variations
  "ctr": "CTR (all)",
  "click-through rate": "CTR (all)",
  // Reach
  "unique reach": "Reach",
  // Impression device
  "device": "Impression device",
  "device type": "Impression device",
  // Frequency
  "avg. frequency": "Frequency",
  "average frequency": "Frequency",
};

/** How a CSV header was resolved to a canonical column name. */
export type ColumnMatchVia = "exact" | "currency" | "case_insensitive" | "alias" | "slug";

export type ColumnMatch = {
  headerValue: string;
  via: ColumnMatchVia;
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
  // 1. Exact match
  const exact = headers.find((h) => h.trim() === canonical);
  if (exact !== undefined) return { headerValue: exact.trim(), via: "exact" };

  // 2. Currency placeholder match (e.g. "Amount spent (USD)")
  if (canonical.includes("{ACCOUNT_CURRENCY}")) {
    const cur = headers.find((h) => headerMatchesColumn(h, canonical));
    if (cur !== undefined) return { headerValue: cur.trim(), via: "currency" };
    // Also check: header might literally say "Amount spent" with no currency
    const plainSpend = headers.find(
      (h) => h.trim().toLowerCase() === "amount spent" || COLUMN_ALIASES[h.trim().toLowerCase()] === canonical,
    );
    if (plainSpend !== undefined) return { headerValue: plainSpend.trim(), via: "alias" };
  }

  const lower = canonical.toLowerCase();

  // 3. Case-insensitive exact match
  const ci = headers.find((h) => h.trim().toLowerCase() === lower);
  if (ci !== undefined) return { headerValue: ci.trim(), via: "case_insensitive" };

  // 4. Alias lookup — check if any header's lowercase form is an alias that maps to this canonical
  for (const [aliasKey, aliasCanon] of Object.entries(COLUMN_ALIASES)) {
    if (aliasCanon === canonical) {
      const found = headers.find((h) => h.trim().toLowerCase() === aliasKey);
      if (found !== undefined) return { headerValue: found.trim(), via: "alias" };
    }
  }

  // 5. Slug match — normalize both sides and compare
  const canonSlug = slugifyColumn(canonical);
  const slugMatch = headers.find((h) => slugifyColumn(h) === canonSlug);
  if (slugMatch !== undefined) return { headerValue: slugMatch.trim(), via: "slug" };

  return null;
}

/**
 * For an unknown CSV header (one that didn't map to any canonical column),
 * finds the closest missing canonical it might represent using Jaccard token
 * similarity. Returns null if no candidate scores ≥ 0.4.
 *
 * Used to surface auto-suggestions when the parser encounters unrecognised
 * columns that look like they might be renamed versions of expected ones.
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

/** Builds the user-facing format spec (columns + a valid sample CSV) for one CSV class. */
export function buildIapCsvClassFormat(csvClass: IapCsvClass): IapCsvClassFormat {
  const spec = IAP_CSV_CLASS_SPECS[csvClass];
  const header = [...spec.breakdownColumns, ...BASE_METRICS.map(resolveCurrencyColumn)];

  const isDemo = csvClass === "demographic";
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
    : { ...commonBreakdowns, "Impression device": "iphone", Platform: "facebook", Placement: "feed" };
  const breakdownSample2: Record<string, string> = isDemo
    ? { ...breakdownSample1, Gender: "male", Age: "35-44" }
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
