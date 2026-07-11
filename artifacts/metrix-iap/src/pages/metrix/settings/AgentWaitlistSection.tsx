// ─── Settings · Metrix Agent waitlist (workspace admin) ───────────────
// Lists waitlist signups from the API with paging and CSV export.
// Access is gated behind the ADMIN_API_KEY admin key (Bearer auth).

import { useState, type FormEvent } from "react";
import { SectionCard } from "../shared";
import { Users, Download, Loader2, Lock, CheckCircle2, Copy, MailCheck } from "lucide-react";
import {
  listAgentWaitlist,
  getListAgentWaitlistQueryKey,
  approveAgentWaitlistEntry,
  ApiError,
  type WaitlistApprovalResult,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const WAITLIST_PAGE_SIZE = 50;
const ADMIN_KEY_STORAGE = "metrix-admin-key";

export function AgentWaitlistSection() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState<string | null>(
    () => sessionStorage.getItem(ADMIN_KEY_STORAGE),
  );
  const [keyInput, setKeyInput] = useState("");
  const [lastKeyRejected, setLastKeyRejected] = useState(false);
  const queryClient = useQueryClient();

  const authHeaders = adminKey ? { authorization: `Bearer ${adminKey}` } : undefined;

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...getListAgentWaitlistQueryKey(), "infinite", WAITLIST_PAGE_SIZE],
    queryFn: ({ pageParam, signal }) =>
      listAgentWaitlist(
        { limit: WAITLIST_PAGE_SIZE, offset: pageParam },
        { signal, headers: authHeaders },
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.entries.length, 0);
      return loaded < lastPage.total && lastPage.entries.length > 0 ? loaded : undefined;
    },
    enabled: adminKey !== null,
    retry: false,
  });

  const isUnauthorized = error instanceof ApiError && error.status === 401;

  const [approvalResults, setApprovalResults] = useState<Record<number, WaitlistApprovalResult>>({});
  const [copiedEntryId, setCopiedEntryId] = useState<number | null>(null);

  const approveMutation = useMutation({
    mutationFn: (entryId: number) =>
      approveAgentWaitlistEntry(entryId, { headers: authHeaders }),
    onSuccess: (result, entryId) => {
      setApprovalResults((prev) => ({ ...prev, [entryId]: result }));
      void queryClient.invalidateQueries({ queryKey: getListAgentWaitlistQueryKey() });
    },
  });

  const handleCopyTempPassword = async (entryId: number, tempPassword: string) => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopiedEntryId(entryId);
      setTimeout(() => setCopiedEntryId((prev) => (prev === entryId ? null : prev)), 2000);
    } catch {
      // Clipboard unavailable — password stays visible for manual copy.
    }
  };

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
    setAdminKey(trimmed);
    setKeyInput("");
    setLastKeyRejected(false);
    void queryClient.resetQueries({ queryKey: getListAgentWaitlistQueryKey() });
  };

  const handleLock = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey(null);
    setKeyInput("");
    setLastKeyRejected(false);
    queryClient.removeQueries({ queryKey: getListAgentWaitlistQueryKey() });
  };

  if (isUnauthorized && adminKey !== null && !lastKeyRejected) {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey(null);
    setLastKeyRejected(true);
  }

  if (adminKey === null || isUnauthorized) {
    return (
      <SectionCard
        title="Metrix Agent waitlist"
        desc="Waitlist signups contain personal emails and are restricted to admins."
      >
        <div className="p-3 rounded-lg border border-border/30 bg-white/[0.02] space-y-2.5" data-testid="panel-waitlist-locked">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-muted-foreground/70 shrink-0" />
            <div className="text-body font-medium text-foreground">Admin access required</div>
          </div>
          {lastKeyRejected && (
            <div className="text-label text-red-400/80" data-testid="text-waitlist-unauthorized">
              That admin key was not accepted. Check the key and try again.
            </div>
          )}
          <form onSubmit={handleUnlock} className="flex items-center gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter admin key"
              autoComplete="off"
              className="flex-1 h-8 px-2.5 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/40"
              data-testid="input-admin-key"
            />
            <button
              type="submit"
              disabled={!keyInput.trim()}
              className="h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-label font-medium text-primary hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              data-testid="button-unlock-waitlist"
            >
              Unlock
            </button>
          </form>
          <div className="text-label text-muted-foreground/70">
            The admin key is set by the app owner via the ADMIN_API_KEY secret.
          </div>
        </div>
      </SectionCard>
    );
  }

  const entries = data?.pages.flatMap((page) => page.entries) ?? [];
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;

  const handleExport = async () => {
    if (isExporting || total === 0) return;
    setIsExporting(true);
    setExportError(null);
    try {
      // Single server-streamed request: the API writes the entire waitlist as
      // CSV in one response (keyset-paged server-side), so there is no
      // client-side page loop and export stays fast at any scale.
      const res = await fetch("/api/metrix/agent-waitlist/export.csv", {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Admin authorization required to export."
            : `Export failed (HTTP ${res.status}).`,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "metrix-agent-waitlist.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed. Try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SectionCard
      title="Metrix Agent waitlist"
      desc="Emails collected from the Metrix Agent waitlist signup, newest first."
      right={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting || total === 0}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-label font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            data-testid="button-export-waitlist"
          >
            {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={handleLock}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-label font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-lock-waitlist"
          >
            <Lock className="w-3 h-3" /> Lock
          </button>
        </div>
      }
    >
      {exportError && (
        <div className="mb-2 text-label text-red-400/90 px-3 py-2 rounded-md border border-red-400/25 bg-red-400/[0.06]">
          {exportError}
        </div>
      )}
      {isLoading ? (
        <div className="text-label text-muted-foreground/70 p-3">Loading waitlist…</div>
      ) : isError ? (
        <div className="text-label text-red-400/80 p-3">Could not load waitlist signups. Check that the API server is running.</div>
      ) : entries.length === 0 ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
          <Users className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          <div className="text-label text-muted-foreground/70">No waitlist signups yet.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden" data-testid="list-waitlist-entries">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
            <span className="text-label uppercase tracking-wide text-muted-foreground/70 font-medium">Email</span>
            <span className="text-label uppercase tracking-wide text-muted-foreground/70 font-medium">Joined</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/20">
            {entries.map((entry) => {
              const result = approvalResults[entry.id];
              const isApproving = approveMutation.isPending && approveMutation.variables === entry.id;
              return (
                <div key={entry.id} className="px-3 py-2 space-y-1.5" data-testid={`row-waitlist-${entry.email}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-body text-foreground truncate">{entry.email}</span>
                      {entry.status === "approved" ? (
                        <span className="flex items-center gap-1 text-label font-medium text-emerald-400 shrink-0" data-testid={`badge-approved-${entry.email}`}>
                          <CheckCircle2 className="w-3 h-3" /> Approved
                        </span>
                      ) : (
                        <span className="text-label font-medium text-amber-400/80 shrink-0" data-testid={`badge-pending-${entry.email}`}>
                          Pending
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.status === "pending" && (
                        <button
                          onClick={() => approveMutation.mutate(entry.id)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 h-6 px-2 rounded border border-primary/30 bg-primary/10 text-label font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          data-testid={`button-approve-${entry.email}`}
                        >
                          {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          {isApproving ? "Approving…" : "Approve"}
                        </button>
                      )}
                      <span className="text-label font-mono text-muted-foreground/70">
                        {new Date(entry.joined_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                  {result && result.status === "approved" && (
                    result.email_sent ? (
                      <div className="flex items-center gap-1.5 text-label text-emerald-400/90" data-testid={`text-approval-emailed-${entry.email}`}>
                        <MailCheck className="w-3 h-3" /> Temporary password emailed to {result.email}.
                      </div>
                    ) : result.temp_password ? (
                      <div className="flex items-center gap-2 p-2 rounded border border-amber-500/20 bg-amber-500/[0.06]" data-testid={`panel-temp-password-${entry.email}`}>
                        <div className="text-label text-foreground min-w-0">
                          Email not sent — share this temporary password manually:{" "}
                          <span className="font-mono text-label text-amber-300">{result.temp_password}</span>
                        </div>
                        <button
                          onClick={() => void handleCopyTempPassword(entry.id, result.temp_password!)}
                          className="flex items-center gap-1 h-6 px-2 rounded border border-border/40 text-label text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
                          data-testid={`button-copy-temp-password-${entry.email}`}
                        >
                          <Copy className="w-3 h-3" /> {copiedEntryId === entry.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              );
            })}
            {approveMutation.isError && (
              <div className="px-3 py-2 text-label text-red-400/80" data-testid="text-approve-error">
                Approval failed. Check the admin key and try again.
              </div>
            )}
            {hasNextPage && (
              <div className="p-2">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-border/40 text-label font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  data-testid="button-load-more-waitlist"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                    </>
                  ) : (
                    <>Load more ({total - entries.length} remaining)</>
                  )}
                </button>
              </div>
            )}
          </div>
          <div className="px-3 py-2 border-t border-border/30 text-label text-muted-foreground/70">
            Showing {entries.length} of {total} signup{total === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
