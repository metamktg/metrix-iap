// ─── Settings · Metrix Agent waitlist (workspace admin) ───────────────
// Lists waitlist signups from the API with paging and CSV export.
// Access is gated behind the ADMIN_API_KEY admin key (Bearer auth).

import { useState, type FormEvent } from "react";
import { SectionCard } from "../shared";
import { Users, Download, Loader2, Lock } from "lucide-react";
import { listAgentWaitlist, getListAgentWaitlistQueryKey, ApiError } from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

const WAITLIST_PAGE_SIZE = 50;
const WAITLIST_EXPORT_PAGE_SIZE = 200;
const ADMIN_KEY_STORAGE = "metrix-admin-key";

export function AgentWaitlistSection() {
  const [isExporting, setIsExporting] = useState(false);
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
            <div className="text-[12px] font-medium text-foreground">Admin access required</div>
          </div>
          {lastKeyRejected && (
            <div className="text-[11px] text-red-400/80" data-testid="text-waitlist-unauthorized">
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
              className="flex-1 h-8 px-2.5 rounded-md bg-white/[0.03] border border-border/40 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-admin-key"
            />
            <button
              type="submit"
              disabled={!keyInput.trim()}
              className="h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              data-testid="button-unlock-waitlist"
            >
              Unlock
            </button>
          </form>
          <div className="text-[10px] text-muted-foreground/70">
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
    try {
      const all: { email: string; joined_at: string }[] = [];
      let offset = 0;
      for (;;) {
        const page = await listAgentWaitlist(
          { limit: WAITLIST_EXPORT_PAGE_SIZE, offset },
          { headers: authHeaders },
        );
        all.push(...page.entries);
        offset += page.entries.length;
        if (page.entries.length === 0 || offset >= page.total) break;
      }
      if (all.length === 0) return;
      const escapeCsv = (value: string) =>
        /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      const header = "email,joined_at";
      const lines = all.map((e) => `${escapeCsv(e.email)},${e.joined_at}`);
      const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "metrix-agent-waitlist.csv";
      a.click();
      URL.revokeObjectURL(url);
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
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            data-testid="button-export-waitlist"
          >
            {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={handleLock}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-lock-waitlist"
          >
            <Lock className="w-3 h-3" /> Lock
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="text-[11px] text-muted-foreground/70 p-3">Loading waitlist…</div>
      ) : isError ? (
        <div className="text-[11px] text-red-400/80 p-3">Could not load waitlist signups. Check that the API server is running.</div>
      ) : entries.length === 0 ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
          <Users className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          <div className="text-[11px] text-muted-foreground/70">No waitlist signups yet.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden" data-testid="list-waitlist-entries">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Email</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Joined</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/20">
            {entries.map((entry) => (
              <div key={entry.email} className="flex items-center justify-between px-3 py-2" data-testid={`row-waitlist-${entry.email}`}>
                <span className="text-[12px] text-foreground truncate mr-3">{entry.email}</span>
                <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                  {new Date(entry.joined_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
            {hasNextPage && (
              <div className="p-2">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-border/40 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
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
          <div className="px-3 py-2 border-t border-border/30 text-[10px] text-muted-foreground/70">
            Showing {entries.length} of {total} signup{total === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
