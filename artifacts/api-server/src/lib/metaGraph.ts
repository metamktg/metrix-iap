/**
 * Meta Graph API helpers for the ad-account connection + IAP report pulls.
 *
 * Non-negotiables implemented here:
 * - ads_read scope only, Facebook user OAuth only (no page/app tokens).
 * - Read-only: insights + adaccounts GETs, never mutates campaigns.
 * - Access tokens are never logged and never stored in raw responses:
 *   sanitizeMetaPayload() strips access_token from paging.next URLs (and any
 *   other string) before anything is persisted.
 * - The pilot ad account id comes from PILOT_REQUIRED_AD_ACCOUNT_ID env, it
 *   is never hardcoded in onboarding logic.
 */

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG_BASE = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

export const REPORT_CLASSES = [
  "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
  "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
] as const;
export type ReportClass = (typeof REPORT_CLASSES)[number];

export function getMetaAppCredentials(): { appId: string; appSecret: string } | null {
  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isPilotMode(): boolean {
  return process.env["PILOT_MODE"] === "true";
}

export function getPilotRequiredAdAccountId(): string | null {
  if (!isPilotMode()) return null;
  return process.env["PILOT_REQUIRED_AD_ACCOUNT_ID"] || null;
}

export function buildOauthDialogUrl(redirectUri: string, state: string): string {
  const creds = getMetaAppCredentials();
  if (!creds) throw new Error("Meta app credentials are not configured.");
  const params = new URLSearchParams({
    client_id: creds.appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: "ads_read",
  });
  return `${DIALOG_BASE}?${params.toString()}`;
}

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = (await res.json().catch(() => ({}))) as T & MetaErrorBody;
  if (!res.ok || body.error) {
    const msg = body.error?.message || `Meta API request failed (${res.status}).`;
    // Never include tokens in error messages.
    throw new Error(msg.replace(/access_token=[^&\s]+/gi, "access_token=REDACTED"));
  }
  return body;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const creds = getMetaAppCredentials();
  if (!creds) throw new Error("Meta app credentials are not configured.");
  const body = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    client_id: creds.appId,
    client_secret: creds.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? null };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const creds = getMetaAppCredentials();
  if (!creds) throw new Error("Meta app credentials are not configured.");
  const body = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: creds.appId,
    client_secret: creds.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? null };
}

export interface MetaAdAccountInfo {
  id: string;
  name?: string | null;
  account_status?: number | null;
  currency?: string | null;
  timezone_name?: string | null;
}

export async function fetchAdAccounts(accessToken: string): Promise<MetaAdAccountInfo[]> {
  const accounts: MetaAdAccountInfo[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = {
      fields: "id,name,account_status,currency,timezone_name",
      limit: "100",
      access_token: accessToken,
    };
    if (after) params["after"] = after;
    const body = await graphGet<{
      data?: MetaAdAccountInfo[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>("/me/adaccounts", params);
    accounts.push(...(body.data ?? []));
    after = body.paging?.next ? (body.paging.cursors?.after ?? null) : null;
    if (!after) break;
  }
  return accounts;
}

// ── Insights pulls ─────────────────────────────────────────────────────

const SHARED_INSIGHT_FIELDS = [
  "date_start",
  "date_stop",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "reach",
  "impressions",
  "frequency",
  "cpm",
  "cpp",
  "clicks",
  "cpc",
  "ctr",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "cost_per_inline_link_click",
  "actions",
  "action_values",
  "cost_per_action_type",
  "outbound_clicks",
  "outbound_clicks_ctr",
  "unique_outbound_clicks",
  "unique_outbound_clicks_ctr",
  "purchase_roas",
  "website_purchase_roas",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
].join(",");

export const REPORT_CLASS_CONFIG: Record<ReportClass, { breakdowns: string }> = {
  IAP_DEMOGRAPHIC_TEXT_SIGNAL: { breakdowns: "age,gender,body_asset" },
  IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL: {
    breakdowns: "impression_device,publisher_platform,platform_position",
  },
};

export interface InsightsPullResult {
  rows: Record<string, unknown>[];
  /** Token-sanitized raw pages, safe to persist. */
  sanitizedPages: unknown[];
}

const MAX_INSIGHT_PAGES = 200;

export async function fetchInsights(
  adAccountId: string,
  reportClass: ReportClass,
  accessToken: string,
): Promise<InsightsPullResult> {
  const rows: Record<string, unknown>[] = [];
  const sanitizedPages: unknown[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_INSIGHT_PAGES; page++) {
    const params: Record<string, string> = {
      level: "ad",
      time_increment: "1",
      date_preset: "last_30d",
      breakdowns: REPORT_CLASS_CONFIG[reportClass].breakdowns,
      fields: SHARED_INSIGHT_FIELDS,
      limit: "500",
      access_token: accessToken,
    };
    if (after) params["after"] = after;

    const body = await graphGet<{
      data?: Record<string, unknown>[];
      paging?: { cursors?: { before?: string; after?: string }; next?: string };
    }>(`/${adAccountId}/insights`, params);

    rows.push(...(body.data ?? []));
    sanitizedPages.push(sanitizeMetaPayload(body));

    after = body.paging?.next ? (body.paging.cursors?.after ?? null) : null;
    if (!after) break;
  }

  return { rows, sanitizedPages };
}

// ── Token sanitization ─────────────────────────────────────────────────

/**
 * Deep-copies a Meta payload with every access_token occurrence removed:
 * - strips access_token query params from any URL-ish string (paging.next)
 * - replaces bare token-looking values under keys named access_token
 * Cursors are preserved.
 */
export function sanitizeMetaPayload<T>(payload: T): T {
  return sanitizeValue(payload, "") as T;
}

function sanitizeValue(value: unknown, keyHint: string): unknown {
  if (typeof value === "string") {
    if (keyHint.toLowerCase().includes("token")) return "REDACTED";
    return value.replace(/([?&])access_token=[^&\s]+/gi, "$1access_token=REDACTED");
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, keyHint));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v, k);
    }
    return out;
  }
  return value;
}

// ── Row normalization / metric flattening ──────────────────────────────

const DIRECT_NUMERIC_METRICS = [
  "spend",
  "reach",
  "impressions",
  "frequency",
  "cpm",
  "cpp",
  "clicks",
  "cpc",
  "ctr",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "cost_per_inline_link_click",
] as const;

const DIRECT_STRING_METRICS = [
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
] as const;

const NESTED_METRIC_FAMILIES = [
  "actions",
  "action_values",
  "cost_per_action_type",
  "outbound_clicks",
  "outbound_clicks_ctr",
  "unique_outbound_clicks",
  "unique_outbound_clicks_ctr",
  "purchase_roas",
  "website_purchase_roas",
] as const;

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** action_type keys become deterministic metric keys: dots → underscores. */
function normalizeActionKey(actionType: string): string {
  return actionType.replace(/\./g, "_");
}

export interface NormalizedReportRow {
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  date: string | null;
  dimensions: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function normalizeInsightRow(
  raw: Record<string, unknown>,
  reportClass: ReportClass,
): NormalizedReportRow {
  const metrics: Record<string, unknown> = {};

  for (const field of DIRECT_NUMERIC_METRICS) {
    if (field in raw) metrics[field] = toNumberOrNull(raw[field]);
  }
  for (const field of DIRECT_STRING_METRICS) {
    if (field in raw) metrics[field] = asStringOrNull(raw[field]);
  }
  for (const family of NESTED_METRIC_FAMILIES) {
    const arr = raw[family];
    if (!Array.isArray(arr)) continue;
    const flat: Record<string, number | null> = {};
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const actionType = typeof entry["action_type"] === "string" ? entry["action_type"] : null;
      if (!actionType) continue;
      flat[normalizeActionKey(actionType)] = toNumberOrNull(entry["value"]);
    }
    metrics[family] = flat;
  }

  let dimensions: Record<string, unknown>;
  if (reportClass === "IAP_DEMOGRAPHIC_TEXT_SIGNAL") {
    const bodyAsset =
      raw["body_asset"] && typeof raw["body_asset"] === "object"
        ? (raw["body_asset"] as Record<string, unknown>)
        : {};
    dimensions = {
      age: asStringOrNull(raw["age"]),
      gender: asStringOrNull(raw["gender"]),
      text: asStringOrNull(bodyAsset["text"]),
      body_asset_id: asStringOrNull(bodyAsset["id"]),
    };
  } else {
    dimensions = {
      impression_device: asStringOrNull(raw["impression_device"]),
      platform: asStringOrNull(raw["publisher_platform"]),
      placement: asStringOrNull(raw["platform_position"]),
    };
  }

  return {
    campaign_id: asStringOrNull(raw["campaign_id"]),
    campaign_name: asStringOrNull(raw["campaign_name"]),
    adset_id: asStringOrNull(raw["adset_id"]),
    adset_name: asStringOrNull(raw["adset_name"]),
    ad_id: asStringOrNull(raw["ad_id"]),
    ad_name: asStringOrNull(raw["ad_name"]),
    date: asStringOrNull(raw["date_start"]),
    dimensions,
    metrics,
  };
}

/**
 * Debug object recording which template metrics were mapped from the API,
 * which came back empty for this account/date range, and which nested
 * families produced values. Never claims parity that the data doesn't show.
 */
export function buildMetricMappingStatus(rows: NormalizedReportRow[]): Record<string, unknown> {
  const mappedDirect = new Set<string>();
  const mappedNested: Record<string, Set<string>> = {};

  for (const row of rows) {
    for (const [key, value] of Object.entries(row.metrics)) {
      if ((NESTED_METRIC_FAMILIES as readonly string[]).includes(key)) {
        const family = (mappedNested[key] ??= new Set<string>());
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (v !== null && v !== undefined) family.add(k);
        }
      } else if (value !== null && value !== undefined) {
        mappedDirect.add(key);
      }
    }
  }

  const allDirect = [...DIRECT_NUMERIC_METRICS, ...DIRECT_STRING_METRICS];
  const missingDirect = allDirect.filter((f) => !mappedDirect.has(f));
  const emptyFamilies = NESTED_METRIC_FAMILIES.filter(
    (f) => !mappedNested[f] || mappedNested[f].size === 0,
  );

  return {
    mapped: [...mappedDirect].sort(),
    mapped_nested: Object.fromEntries(
      Object.entries(mappedNested).map(([k, v]) => [k, [...v].sort()]),
    ),
    missing: missingDirect,
    unavailable: emptyFamilies,
    derived: [],
    note: "Metrics Meta did not return for this account/date range/objective are absent or null, never fabricated.",
  };
}
