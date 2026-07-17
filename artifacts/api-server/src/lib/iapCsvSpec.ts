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
  // Quote header cells too — several canonical column names contain commas
  // (e.g. "CPM (cost per 1,000 impressions)"), so an unquoted header row
  // would be malformed CSV and the sample would fail its own re-upload.
  const sampleCsv = [header, ...rows]
    .map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(","))
    .join("\n");

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
