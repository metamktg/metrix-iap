// ─── Settings · Integrations · Live Meta connection (pilot) ───────────
// Real Meta OAuth + ad-account connection flow. Everything shown here is
// live data from the API server — no seed data, no fabricated values.

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMetaConnection,
  getGetMetaConnectionQueryKey,
  getMetaOauthUrl,
  useListMetaAdAccounts,
  getListMetaAdAccountsQueryKey,
  useSelectMetaAdAccount,
  useRunMetaReports,
  useDisconnectMetaAccount,
  useListMetaReportRows,
  getListMetaReportRowsQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type {
  MetaAdAccount,
  MetaConnectedAccount,
  MetaReportPullStatus,
  MetaReportRow,
} from "@workspace/api-client-react";
import { SectionCard } from "../shared";
import { cn } from "@/lib/utils";
import {
  Plug,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Unlink,
  Table2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const REPORT_CLASS_LABELS: Record<string, string> = {
  IAP_DEMOGRAPHIC_TEXT_SIGNAL: "Demographic + text signal",
  IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL: "Device / placement / platform signal",
};

const REPORT_CLASSES = [
  "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
  "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
] as const;

function errMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data as { message?: string } | null;
    if (data?.message) return data.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const OAUTH_ERROR_COPY: Record<string, string> = {
  access_denied: "Meta authorization was cancelled — no connection was made.",
  invalid_state: "The authorization link expired or didn't match this session. Please try again.",
  missing_code_or_state: "Meta returned an incomplete authorization response. Please try again.",
  token_exchange_failed: "Could not complete the Meta token exchange. Please try again.",
  oauth_error: "Meta reported an authorization error. Please try again.",
};

export function MetaLiveConnection() {
  const queryClient = useQueryClient();
  const connectionQuery = useGetMetaConnection();
  const connection = connectionQuery.data;

  const [flashError, setFlashError] = useState<string | null>(null);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Read ?meta=connected / ?meta_error=... left by the OAuth callback.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaOk = params.get("meta");
    const metaErr = params.get("meta_error");
    if (metaOk === "connected") setFlashSuccess(true);
    if (metaErr) setFlashError(OAUTH_ERROR_COPY[metaErr] ?? OAUTH_ERROR_COPY["oauth_error"]!);
    if (metaOk || metaErr) {
      params.delete("meta");
      params.delete("meta_error");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, []);

  const invalidateConnection = () =>
    queryClient.invalidateQueries({ queryKey: getGetMetaConnectionQueryKey() });

  const handleConnect = async () => {
    setActionError(null);
    setConnecting(true);
    try {
      const { url } = await getMetaOauthUrl();
      window.location.href = url;
    } catch (err) {
      setActionError(errMessage(err));
      setConnecting(false);
    }
  };

  const disconnect = useDisconnectMetaAccount({
    mutation: {
      onSuccess: () => {
        setActionError(null);
        void invalidateConnection();
        void queryClient.invalidateQueries({ queryKey: getListMetaAdAccountsQueryKey() });
      },
      onError: (err) => setActionError(errMessage(err)),
    },
  });

  return (
    <SectionCard
      title="Live Meta connection"
      desc="Read-only (ads_read) connection · IAP report classes · all data live from Meta"
    >
      <div className="space-y-3">
        {flashSuccess && !connection?.connected && (
          <Banner tone="success" icon={CheckCircle2}>
            Meta authorization complete. Now choose the ad account to connect.
          </Banner>
        )}
        {flashError && (
          <Banner tone="error" icon={XCircle}>
            {flashError}
          </Banner>
        )}
        {actionError && (
          <Banner tone="error" icon={XCircle}>
            {actionError}
          </Banner>
        )}

        {connectionQuery.isLoading && (
          <div className="flex items-center gap-2 p-3 text-caption text-muted-foreground/85">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking connection status…
          </div>
        )}

        {connectionQuery.isError && (
          <Banner tone="error" icon={XCircle}>
            {errMessage(connectionQuery.error)}
          </Banner>
        )}

        {connection && !connection.connected && !connection.pending_selection && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
            <ShieldCheck className="w-4 h-4 text-primary/80 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-body font-semibold text-foreground">No Meta account connected</div>
              <p className="text-caption text-muted-foreground/85 leading-relaxed mt-0.5">
                Sign in with the Meta profile that has access to the pilot ad account. Metrix only
                requests <span className="font-mono text-foreground/80">ads_read</span> — it can
                never modify campaigns.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-caption font-medium text-primary hover:bg-primary/25 transition-colors shrink-0 disabled:opacity-50"
              data-testid="button-connect-meta-live"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
              Connect with Meta
            </button>
          </div>
        )}

        {connection?.pending_selection && (
          <AccountPicker
            pilotMode={connection.pilot_mode}
            onSelected={() => {
              setFlashSuccess(false);
              void invalidateConnection();
            }}
          />
        )}

        {connection?.connected && connection.account && (
          <ConnectedPanel
            account={connection.account}
            reports={connection.reports}
            onDisconnect={() => disconnect.mutate()}
            disconnecting={disconnect.isPending}
            onReportsRan={() => void invalidateConnection()}
          />
        )}
      </div>
    </SectionCard>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "success" | "error" | "warn";
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const classes =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-400/[0.06] text-amber-300"
        : "border-red-400/25 bg-red-400/[0.06] text-red-300";
  return (
    <div className={cn("flex items-start gap-2 p-2.5 rounded-lg border text-caption leading-relaxed", classes)}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// ─── Step 2: pick the ad account ──────────────────────────────────────

function AccountPicker({ pilotMode, onSelected }: { pilotMode: boolean; onSelected: () => void }) {
  const accountsQuery = useListMetaAdAccounts();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const select = useSelectMetaAdAccount({
    mutation: {
      onSuccess: () => onSelected(),
      onError: (err) => setError(errMessage(err)),
    },
  });

  const data = accountsQuery.data;
  const pilotId = data?.pilot_required_account_id ?? null;

  useEffect(() => {
    if (!chosen && data && pilotId && data.pilot_required_account_present) {
      setChosen(pilotId);
    }
  }, [data, pilotId, chosen]);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.accounts].sort((a, b) => {
      if (pilotId) {
        if (a.id === pilotId) return -1;
        if (b.id === pilotId) return 1;
      }
      return (a.name ?? a.id).localeCompare(b.name ?? b.id);
    });
  }, [data, pilotId]);

  return (
    <div className="space-y-2.5">
      <div className="text-caption font-mono uppercase tracking-widest text-muted-foreground/80">
        Select the ad account to connect
      </div>

      {accountsQuery.isLoading && (
        <div className="flex items-center gap-2 p-3 text-caption text-muted-foreground/85">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your Meta ad accounts…
        </div>
      )}
      {accountsQuery.isError && (
        <Banner tone="error" icon={XCircle}>
          {errMessage(accountsQuery.error)}
        </Banner>
      )}

      {data && pilotMode && pilotId && data.pilot_required_account_present === false && (
        <Banner tone="warn" icon={AlertTriangle}>
          The pilot ad account ({pilotId}) is not visible to this Meta profile. Make sure you
          authorized with a profile that has access to it, or disconnect and try a different login.
        </Banner>
      )}

      {sorted.map((a: MetaAdAccount) => {
        const isPilot = pilotId !== null && a.id === pilotId;
        const isChosen = chosen === a.id;
        return (
          <button
            key={a.id}
            onClick={() => setChosen(a.id)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
              isChosen
                ? "border-primary/40 bg-primary/[0.08]"
                : "border-border/40 bg-white/[0.02] hover:bg-white/[0.04]",
            )}
            data-testid={`button-pick-account-${a.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-body font-semibold text-foreground flex items-center gap-2">
                {a.name ?? a.id}
                {isPilot && (
                  <span className="mx-inline-badge mx-inline-badge--info">
                    Pilot account
                  </span>
                )}
              </div>
              <div className="text-label font-mono text-muted-foreground/85">
                {a.id}
                {a.currency ? ` · ${a.currency}` : ""}
                {a.timezone_name ? ` · ${a.timezone_name}` : ""}
              </div>
            </div>
            {isChosen && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
          </button>
        );
      })}

      {data && sorted.length === 0 && (
        <Banner tone="warn" icon={AlertTriangle}>
          This Meta profile has no ad accounts. Authorize with a profile that can access the pilot
          ad account.
        </Banner>
      )}

      {error && (
        <Banner tone="error" icon={XCircle}>
          {error}
        </Banner>
      )}

      <div className="flex justify-end">
        <button
          disabled={!chosen || select.isPending}
          onClick={() => chosen && select.mutate({ data: { ad_account_id: chosen } })}
          className={cn(
            "flex items-center gap-1.5 h-9 px-4 rounded-md border text-body font-medium transition-colors",
            chosen && !select.isPending
              ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
              : "border-border/40 text-muted-foreground/80 cursor-not-allowed",
          )}
          data-testid="button-save-account-selection"
        >
          {select.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Connect this account
        </button>
      </div>
    </div>
  );
}

// ─── Connected state: account card + report pulls + live rows ─────────

function ConnectedPanel({
  account,
  reports,
  onDisconnect,
  disconnecting,
  onReportsRan,
}: {
  account: MetaConnectedAccount;
  reports: MetaReportPullStatus[];
  onDisconnect: () => void;
  disconnecting: boolean;
  onReportsRan: () => void;
}) {
  const queryClient = useQueryClient();
  const [runError, setRunError] = useState<string | null>(null);

  const runReports = useRunMetaReports({
    mutation: {
      onSuccess: () => {
        setRunError(null);
        onReportsRan();
        for (const rc of REPORT_CLASSES) {
          void queryClient.invalidateQueries({
            queryKey: getListMetaReportRowsQueryKey({ report_class: rc }),
          });
        }
      },
      onError: (err) => setRunError(errMessage(err)),
    },
  });

  const tokenTone =
    account.token_status === "active"
      ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
      : account.token_status === "expiring"
        ? "text-amber-400 border-amber-400/25 bg-amber-400/10"
        : "text-red-400 border-red-400/25 bg-red-400/10";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04]">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-body font-semibold text-foreground">
            {account.account_name ?? account.ad_account_id}
          </div>
          <div className="text-label font-mono text-muted-foreground/85">
            {account.ad_account_id}
            {account.currency ? ` · ${account.currency}` : ""}
            {account.timezone ? ` · ${account.timezone}` : ""}
            {` · connected ${fmtDate(account.connected_at)}`}
          </div>
        </div>
        <span
          className={cn(
            "text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none shrink-0",
            tokenTone,
          )}
        >
          Token {account.token_status}
        </span>
        <button
          onClick={onDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-caption font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0 disabled:opacity-50"
          data-testid="button-disconnect-meta"
        >
          {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
          Disconnect
        </button>
      </div>

      {account.token_status === "expired" && (
        <Banner tone="error" icon={XCircle}>
          The Meta access token has expired. Disconnect and reconnect to keep pulling reports.
        </Banner>
      )}

      <div className="flex items-center justify-between">
        <div className="text-caption font-mono uppercase tracking-widest text-muted-foreground/80">
          IAP report pulls · last 30 days
        </div>
        <button
          onClick={() => runReports.mutate()}
          disabled={runReports.isPending || account.token_status === "expired"}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-caption font-medium text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
          data-testid="button-run-reports"
        >
          {runReports.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {runReports.isPending ? "Pulling from Meta…" : "Run report pulls"}
        </button>
      </div>

      {runError && (
        <Banner tone="error" icon={XCircle}>
          {runError}
        </Banner>
      )}

      <div className="space-y-2">
        {REPORT_CLASSES.map((rc) => {
          const pull = reports.find((r) => r.report_class === rc) ?? null;
          return <ReportClassRow key={rc} reportClass={rc} pull={pull} />;
        })}
      </div>
    </div>
  );
}

function ReportClassRow({
  reportClass,
  pull,
}: {
  reportClass: (typeof REPORT_CLASSES)[number];
  pull: MetaReportPullStatus | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasData = pull?.status === "success" && pull.row_count > 0;

  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.02]">
      <div className="flex items-center gap-3 p-3">
        {pull ? (
          pull.status === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          )
        ) : (
          <Table2 className="w-4 h-4 text-muted-foreground/75 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-body font-medium text-foreground">
            {REPORT_CLASS_LABELS[reportClass]}
          </div>
          <div className="text-label text-muted-foreground/85">
            {pull
              ? pull.status === "success"
                ? `${pull.row_count.toLocaleString()} rows · ${pull.date_range_start} → ${pull.date_range_end} · fetched ${fmtDate(pull.fetched_at)}`
                : `Failed ${fmtDate(pull.fetched_at)}: ${pull.error_message ?? "unknown error"}`
              : "Not pulled yet"}
          </div>
        </div>
        {hasData && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-border/50 text-label font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
            data-testid={`button-toggle-rows-${reportClass}`}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Hide data" : "View data"}
          </button>
        )}
      </div>
      {expanded && hasData && <ReportRowsTable reportClass={reportClass} />}
    </div>
  );
}

function ReportRowsTable({ reportClass }: { reportClass: (typeof REPORT_CLASSES)[number] }) {
  const rowsQuery = useListMetaReportRows({ report_class: reportClass, limit: 50 });
  const data = rowsQuery.data;

  const isDemo = reportClass === "IAP_DEMOGRAPHIC_TEXT_SIGNAL";
  const dimCols = isDemo
    ? [
        { key: "age", label: "Age" },
        { key: "gender", label: "Gender" },
        { key: "text", label: "Primary text" },
      ]
    : [
        { key: "impression_device", label: "Device" },
        { key: "platform", label: "Platform" },
        { key: "placement", label: "Placement" },
      ];

  const num = (row: MetaReportRow, key: string): string => {
    const v = (row.metrics as Record<string, unknown>)[key];
    if (typeof v !== "number") return "—";
    return key === "spend" ? v.toFixed(2) : v.toLocaleString();
  };
  const dim = (row: MetaReportRow, key: string): string => {
    const v = (row.dimensions as Record<string, unknown>)[key];
    return typeof v === "string" && v ? v : "—";
  };

  return (
    <div className="border-t border-border/40 p-3">
      {rowsQuery.isLoading && (
        <div className="flex items-center gap-2 text-caption text-muted-foreground/85">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading rows…
        </div>
      )}
      {rowsQuery.isError && (
        <Banner tone="error" icon={XCircle}>
          {errMessage(rowsQuery.error)}
        </Banner>
      )}
      {data && (
        <div className="space-y-2">
          <div className="text-label text-muted-foreground/80">
            Showing {Math.min(50, data.rows.length)} of {data.total.toLocaleString()} rows ·{" "}
            {data.date_range_start} → {data.date_range_end}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="text-left text-muted-foreground/80 uppercase tracking-wide">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Ad</th>
                  {dimCols.map((c) => (
                    <th key={c.key} className="py-1.5 pr-3 font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th className="py-1.5 pr-3 font-medium text-right">Spend</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Impr.</th>
                  <th className="py-1.5 pr-0 font-medium text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/20 text-foreground/85">
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{row.date ?? "—"}</td>
                    <td className="py-1.5 pr-3 max-w-[180px] truncate">{row.ad_name ?? row.ad_id ?? "—"}</td>
                    {dimCols.map((c) => (
                      <td key={c.key} className="py-1.5 pr-3 max-w-[200px] truncate">
                        {dim(row, c.key)}
                      </td>
                    ))}
                    <td className="py-1.5 pr-3 text-right font-mono">{num(row, "spend")}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{num(row, "impressions")}</td>
                    <td className="py-1.5 pr-0 text-right font-mono">{num(row, "clicks")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
