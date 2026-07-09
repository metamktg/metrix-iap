import { Router, type IRouter } from "express";
import {
  GetMetaConnectionResponse,
  DisconnectMetaAccountResponse,
  GetMetaOauthUrlResponse,
  ListMetaAdAccountsResponse,
  SelectMetaAdAccountBody,
  SelectMetaAdAccountResponse,
  RunMetaReportsResponse,
  ListMetaReportRowsQueryParams,
  ListMetaReportRowsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getSupabase } from "../lib/supabase";
import { getAppBaseUrl } from "../lib/appUrl";
import {
  createOauthState,
  verifyOauthState,
  encryptToken,
  decryptToken,
  isTokenEncryptionConfigured,
} from "../lib/metaCrypto";
import {
  REPORT_CLASSES,
  type ReportClass,
  buildOauthDialogUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchAdAccounts,
  fetchInsights,
  getMetaAppCredentials,
  getPilotRequiredAdAccountId,
  isPilotMode,
  normalizeInsightRow,
  buildMetricMappingStatus,
  sanitizeMetaPayload,
} from "../lib/metaGraph";

const router: IRouter = Router();

const AD_ACCOUNT_ID_RE = /^act_\d+$/;

function getRedirectUri(): string {
  return `${getAppBaseUrl()}api/auth/meta/callback`;
}

function integrationsUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${getAppBaseUrl()}app/settings/integrations?${qs}`;
}

interface ConnectedAccountRow {
  id: string;
  user_id: string;
  ad_account_id: string;
  account_name: string | null;
  currency: string | null;
  timezone: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  connected_at: string;
  status: string;
}

function tokenStatus(expiresAt: string | null): "active" | "expiring" | "expired" {
  if (!expiresAt) return "active";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  if (remaining < 7 * 24 * 60 * 60 * 1000) return "expiring";
  return "active";
}

function toConnectedAccountView(row: ConnectedAccountRow) {
  return {
    ad_account_id: row.ad_account_id,
    account_name: row.account_name,
    currency: row.currency,
    timezone: row.timezone,
    connected_at: row.connected_at,
    token_expires_at: row.token_expires_at,
    token_status: tokenStatus(row.token_expires_at),
    status: row.status,
  };
}

async function getActiveConnection(userId: string): Promise<ConnectedAccountRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("connected_ad_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("connected_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as ConnectedAccountRow | undefined) ?? null;
}

async function getPendingToken(
  userId: string,
): Promise<{ access_token_encrypted: string; token_expires_at: string | null } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("meta_oauth_pending")
    .select("access_token_encrypted, token_expires_at")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as { access_token_encrypted: string; token_expires_at: string | null } | undefined) ?? null;
}

// ── OAuth start URL ────────────────────────────────────────────────────

router.get("/metrix/meta/oauth-url", requireAuth, (req, res) => {
  if (!getMetaAppCredentials() || !isTokenEncryptionConfigured()) {
    res.status(503).json({
      message:
        "Meta connection is not configured yet (missing Meta app credentials or token encryption key).",
    });
    return;
  }
  const state = createOauthState(req.authUser!.id);
  const url = buildOauthDialogUrl(getRedirectUri(), state);
  res.json(GetMetaOauthUrlResponse.parse({ url }));
});

// ── OAuth callback (browser redirect target; registered in the Meta app) ──

router.get("/auth/meta/callback", requireAuth, async (req, res) => {
  const fail = (reason: string) => {
    req.log.warn({ reason }, "Meta OAuth callback rejected");
    res.redirect(integrationsUrl({ meta_error: reason }));
  };

  const errorParam = typeof req.query["error"] === "string" ? req.query["error"] : null;
  if (errorParam) {
    fail(errorParam === "access_denied" ? "access_denied" : "oauth_error");
    return;
  }

  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  const state = typeof req.query["state"] === "string" ? req.query["state"] : null;
  if (!code || !state) {
    fail("missing_code_or_state");
    return;
  }
  if (!verifyOauthState(state, req.authUser!.id)) {
    fail("invalid_state");
    return;
  }

  try {
    const shortLived = await exchangeCodeForToken(code, getRedirectUri());
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken);
    const expiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString()
      : null;

    const supabase = getSupabase();
    const { error } = await supabase.from("meta_oauth_pending").upsert(
      {
        user_id: String(req.authUser!.id),
        access_token_encrypted: encryptToken(longLived.accessToken),
        token_expires_at: expiresAt,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    res.redirect(integrationsUrl({ meta: "connected" }));
  } catch (err) {
    // Never log token material; the error messages from metaGraph are redacted.
    req.log.error({ err }, "Meta OAuth token exchange failed");
    fail("token_exchange_failed");
  }
});

// ── Connection status ──────────────────────────────────────────────────

router.get("/metrix/meta/connection", requireAuth, async (req, res) => {
  try {
    const userId = String(req.authUser!.id);
    const [connection, pending] = await Promise.all([
      getActiveConnection(userId),
      getPendingToken(userId),
    ]);

    const supabase = getSupabase();
    const reports: unknown[] = [];
    if (connection) {
      for (const reportClass of REPORT_CLASSES) {
        const { data, error } = await supabase
          .from("report_pulls")
          .select("report_class, status, fetched_at, date_range_start, date_range_end, error_message, id")
          .eq("user_id", userId)
          .eq("ad_account_id", connection.ad_account_id)
          .eq("report_class", reportClass)
          .order("fetched_at", { ascending: false })
          .limit(1);
        if (error) throw new Error(error.message);
        const pull = data?.[0];
        if (!pull) continue;
        const { count } = await supabase
          .from("report_rows")
          .select("id", { count: "exact", head: true })
          .eq("report_pull_id", pull.id as string);
        reports.push({
          report_class: pull.report_class,
          status: pull.status === "success" ? "success" : "error",
          fetched_at: pull.fetched_at,
          date_range_start: pull.date_range_start,
          date_range_end: pull.date_range_end,
          row_count: count ?? 0,
          error_message: pull.error_message ?? null,
        });
      }
    }

    res.json(
      GetMetaConnectionResponse.parse({
        connected: !!connection,
        pending_selection: !connection && !!pending,
        pilot_mode: isPilotMode(),
        account: connection ? toConnectedAccountView(connection) : null,
        reports,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to load Meta connection status");
    res.status(503).json({ message: "Could not load Meta connection status." });
  }
});

router.delete("/metrix/meta/connection", requireAuth, async (req, res) => {
  try {
    const userId = String(req.authUser!.id);
    const supabase = getSupabase();
    const del1 = await supabase.from("meta_oauth_pending").delete().eq("user_id", userId);
    if (del1.error) throw new Error(del1.error.message);
    const del2 = await supabase
      .from("connected_ad_accounts")
      .update({ status: "disconnected" })
      .eq("user_id", userId)
      .eq("status", "active");
    if (del2.error) throw new Error(del2.error.message);
    res.json(DisconnectMetaAccountResponse.parse({ status: "disconnected" }));
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect Meta account");
    res.status(503).json({ message: "Could not disconnect the Meta account." });
  }
});

// ── Ad account discovery ───────────────────────────────────────────────

async function getUsableToken(userId: string): Promise<string | null> {
  const pending = await getPendingToken(userId);
  if (pending) {
    if (pending.token_expires_at && new Date(pending.token_expires_at).getTime() <= Date.now()) {
      return null;
    }
    return decryptToken(pending.access_token_encrypted);
  }
  const connection = await getActiveConnection(userId);
  if (connection) {
    if (tokenStatus(connection.token_expires_at) === "expired") return null;
    return decryptToken(connection.access_token_encrypted);
  }
  return null;
}

router.get("/metrix/meta/adaccounts", requireAuth, async (req, res) => {
  try {
    const userId = String(req.authUser!.id);
    const token = await getUsableToken(userId);
    if (!token) {
      res.status(409).json({
        message: "No Meta connection found (or the token expired). Please connect Meta first.",
      });
      return;
    }

    const accounts = await fetchAdAccounts(token);
    const pilotId = getPilotRequiredAdAccountId();
    const payload = {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name ?? null,
        account_status: a.account_status ?? null,
        currency: a.currency ?? null,
        timezone_name: a.timezone_name ?? null,
      })),
      pilot_mode: isPilotMode(),
      pilot_required_account_id: pilotId,
      pilot_required_account_present: pilotId
        ? accounts.some((a) => a.id === pilotId)
        : null,
    };
    res.json(ListMetaAdAccountsResponse.parse(payload));
  } catch (err) {
    req.log.error({ err }, "Failed to list Meta ad accounts");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Meta API request failed.",
    });
  }
});

// ── Account selection ──────────────────────────────────────────────────

router.post("/metrix/meta/select-account", requireAuth, async (req, res) => {
  const parsed = SelectMetaAdAccountBody.safeParse(req.body);
  if (!parsed.success || !AD_ACCOUNT_ID_RE.test(parsed.data.ad_account_id)) {
    res.status(400).json({ message: "A valid ad account id (act_...) is required." });
    return;
  }
  const adAccountId = parsed.data.ad_account_id;

  try {
    const userId = String(req.authUser!.id);
    const pending = await getPendingToken(userId);
    const existing = await getActiveConnection(userId);
    const encrypted = pending?.access_token_encrypted ?? existing?.access_token_encrypted;
    const expiresAt = pending ? pending.token_expires_at : (existing?.token_expires_at ?? null);
    if (!encrypted) {
      res.status(409).json({ message: "No Meta connection found. Please connect Meta first." });
      return;
    }

    const token = decryptToken(encrypted);
    // Re-validate the selection against what Meta says this user can access.
    const accounts = await fetchAdAccounts(token);
    const chosen = accounts.find((a) => a.id === adAccountId);
    if (!chosen) {
      res.status(400).json({
        message: "That ad account is not available to the connected Meta user.",
      });
      return;
    }

    const supabase = getSupabase();
    // One active connection per user in the pilot: retire any others.
    const retire = await supabase
      .from("connected_ad_accounts")
      .update({ status: "disconnected" })
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("ad_account_id", adAccountId);
    if (retire.error) throw new Error(retire.error.message);

    const { data, error } = await supabase
      .from("connected_ad_accounts")
      .upsert(
        {
          user_id: userId,
          ad_account_id: adAccountId,
          account_name: chosen.name ?? null,
          currency: chosen.currency ?? null,
          timezone: chosen.timezone_name ?? null,
          access_token_encrypted: encrypted,
          token_expires_at: expiresAt,
          connected_at: new Date().toISOString(),
          status: "active",
        },
        { onConflict: "user_id,ad_account_id" },
      )
      .select("*")
      .limit(1);
    if (error) throw new Error(error.message);

    const cleanup = await supabase.from("meta_oauth_pending").delete().eq("user_id", userId);
    if (cleanup.error) {
      req.log.warn({ err: cleanup.error.message }, "Failed to clear pending Meta token");
    }

    req.log.info({ adAccountId }, "Meta ad account connected");
    res.json(
      SelectMetaAdAccountResponse.parse({
        account: toConnectedAccountView(data![0] as ConnectedAccountRow),
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to save Meta ad account selection");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not save the selection.",
    });
  }
});

// ── Report pulls ───────────────────────────────────────────────────────

function last30dRange(): { start: string; end: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1); // Meta's last_30d ends yesterday
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

router.post("/metrix/meta/run-reports", requireAuth, async (req, res) => {
  try {
    const userId = String(req.authUser!.id);
    const connection = await getActiveConnection(userId);
    if (!connection) {
      res.status(409).json({ message: "Connect a Meta ad account before running reports." });
      return;
    }
    if (tokenStatus(connection.token_expires_at) === "expired") {
      res.status(409).json({
        message: "Your Meta connection has expired. Please reconnect your Meta account.",
      });
      return;
    }

    const token = decryptToken(connection.access_token_encrypted);
    const supabase = getSupabase();
    const range = last30dRange();
    const pulls: unknown[] = [];

    // Both report classes use the same exact date range and are stored
    // separately — never merged before storage.
    for (const reportClass of REPORT_CLASSES) {
      const fetchedAt = new Date().toISOString();
      // One pull row per class per run. It starts as "running" and is only
      // flipped to "success" after every row chunk has been written, so a
      // mid-write failure can never leave a dishonest "success" pull behind.
      let pullId: string | null = null;
      try {
        const { rows: rawRows, sanitizedPages } = await fetchInsights(
          connection.ad_account_id,
          reportClass as ReportClass,
          token,
        );
        const normalized = rawRows.map((r) => normalizeInsightRow(r, reportClass as ReportClass));
        const mappingStatus = buildMetricMappingStatus(normalized);

        const { data: pullData, error: pullError } = await supabase
          .from("report_pulls")
          .insert({
            user_id: userId,
            ad_account_id: connection.ad_account_id,
            report_class: reportClass,
            date_range_start: range.start,
            date_range_end: range.end,
            raw_response: sanitizeMetaPayload({ pages: sanitizedPages.length }),
            raw_pages: sanitizedPages,
            fetched_at: fetchedAt,
            status: "running",
            metric_mapping_status: mappingStatus,
          })
          .select("id")
          .limit(1);
        if (pullError) throw new Error(pullError.message);
        pullId = (pullData![0] as { id: string }).id;

        // Insert rows in chunks to stay under payload limits.
        const CHUNK = 500;
        for (let i = 0; i < normalized.length; i += CHUNK) {
          const chunk = normalized.slice(i, i + CHUNK).map((row) => ({
            report_pull_id: pullId,
            user_id: userId,
            ad_account_id: connection.ad_account_id,
            report_class: reportClass,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            adset_id: row.adset_id,
            adset_name: row.adset_name,
            ad_id: row.ad_id,
            ad_name: row.ad_name,
            date: row.date,
            dimensions: row.dimensions,
            metrics: row.metrics,
          }));
          const ins = await supabase.from("report_rows").insert(chunk);
          if (ins.error) throw new Error(ins.error.message);
        }

        const done = await supabase
          .from("report_pulls")
          .update({ status: "success" })
          .eq("id", pullId);
        if (done.error) throw new Error(done.error.message);

        req.log.info(
          { reportClass, rowCount: normalized.length },
          "Meta report pull completed",
        );
        pulls.push({
          report_class: reportClass,
          status: "success",
          fetched_at: fetchedAt,
          date_range_start: range.start,
          date_range_end: range.end,
          row_count: normalized.length,
          error_message: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Report pull failed.";
        req.log.error({ err, reportClass }, "Meta report pull failed");

        if (pullId) {
          // Mark the existing pull as failed and drop any partial rows so
          // nothing incomplete can ever be served.
          const cleanup = await supabase.from("report_rows").delete().eq("report_pull_id", pullId);
          if (cleanup.error) {
            req.log.error({ err: cleanup.error.message }, "Failed to remove partial report rows");
          }
          const mark = await supabase
            .from("report_pulls")
            .update({ status: "error", error_message: message })
            .eq("id", pullId);
          if (mark.error) {
            req.log.error({ err: mark.error.message }, "Failed to mark pull as failed");
          }
        } else {
          const failIns = await supabase.from("report_pulls").insert({
            user_id: userId,
            ad_account_id: connection.ad_account_id,
            report_class: reportClass,
            date_range_start: range.start,
            date_range_end: range.end,
            fetched_at: fetchedAt,
            status: "error",
            error_message: message,
          });
          if (failIns.error) {
            req.log.error({ err: failIns.error.message }, "Failed to record failed pull");
          }
        }
        pulls.push({
          report_class: reportClass,
          status: "error",
          fetched_at: fetchedAt,
          date_range_start: range.start,
          date_range_end: range.end,
          row_count: 0,
          error_message: message,
        });
      }
    }

    res.json(
      RunMetaReportsResponse.parse({
        date_range_start: range.start,
        date_range_end: range.end,
        pulls,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Meta report run failed");
    res.status(503).json({ message: "Could not run the report pulls." });
  }
});

// ── Normalized rows for the dashboard ──────────────────────────────────

router.get("/metrix/meta/report-rows", requireAuth, async (req, res) => {
  const parsed = ListMetaReportRowsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query parameters." });
    return;
  }
  const { report_class: reportClass } = parsed.data;
  const limit = parsed.data.limit ?? 200;
  const offset = parsed.data.offset ?? 0;

  try {
    const userId = String(req.authUser!.id);
    const connection = await getActiveConnection(userId);
    if (!connection) {
      res.status(404).json({ message: "No connected ad account." });
      return;
    }

    const supabase = getSupabase();
    const { data: pullData, error: pullError } = await supabase
      .from("report_pulls")
      .select("id, fetched_at, date_range_start, date_range_end, metric_mapping_status")
      .eq("user_id", userId)
      .eq("ad_account_id", connection.ad_account_id)
      .eq("report_class", reportClass)
      .eq("status", "success")
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (pullError) throw new Error(pullError.message);
    const pull = pullData?.[0];
    if (!pull) {
      res.status(404).json({ message: "No successful pull exists for this report class yet." });
      return;
    }

    const { data, error, count } = await supabase
      .from("report_rows")
      .select(
        "id, report_class, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, dimensions, metrics",
        { count: "exact" },
      )
      .eq("report_pull_id", pull.id as string)
      .order("date", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    res.json(
      ListMetaReportRowsResponse.parse({
        rows: data ?? [],
        total: count ?? 0,
        report_class: reportClass,
        fetched_at: pull.fetched_at,
        date_range_start: pull.date_range_start,
        date_range_end: pull.date_range_end,
        metric_mapping_status: pull.metric_mapping_status ?? null,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list report rows");
    res.status(503).json({ message: "Could not load report rows." });
  }
});

export default router;
