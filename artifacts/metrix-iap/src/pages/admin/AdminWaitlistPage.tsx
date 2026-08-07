// ─── /admin — password-protected waitlist & access-request console ─────
// Standalone admin page (no user login needed). Gated by the
// ADMIN_PANEL_PASSWORD secret: POST /metrix/admin/session sets a 12-hour
// httpOnly admin cookie. Shows both lists — full access-request form
// submissions (Supabase) and plain waitlist emails (Replit Postgres) —
// with approve / reject actions. Approving provisions an account with a
// temporary password and emails it; when email delivery is unavailable
// the temp password is shown here with a copy button instead.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useGetAdminSession,
  useAdminLogin,
  useAdminLogout,
  useListAgentWaitlist,
  useApproveAgentWaitlistEntry,
  useRejectAgentWaitlistEntry,
  useListRequestAccessEntries,
  useApproveRequestAccessEntry,
  useRejectRequestAccessEntry,
  useGetAdminEmailStatus,
  useListAdminUsers,
  useAdminResendTempPassword,
  useAdminSendPasswordReset,
  useAdminRevokeUser,
  useAdminRestoreUser,
  useCreateAdminUser,
  useGetAdminUserAdAccounts,
  useUpdateAdminUserAdAccounts,
  useListAdminAdAccounts,
} from "@workspace/api-client-react";
import type {
  RequestAccessEntry,
  WaitlistEntry,
  AdminUser,
  AdminCreateUserResult,
} from "@workspace/api-client-react";
import { AuthBrandHeader } from "@/components/brand/BrandMark";
import {
  Loader2,
  LogOut,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Mail,
  Globe,
  Linkedin,
  Phone,
  Briefcase,
  DollarSign,
  Factory,
  AlertTriangle,
  KeyRound,
  Link2,
  UserX,
  UserCheck,
  UserPlus,
  Trash2,
  Settings2,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";

const INPUT_CLS =
  "w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-title text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus-visible:ring-1 focus-visible:ring-ring";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
      : status === "rejected"
        ? "text-red-400 border-red-400/25 bg-red-400/10"
        : "text-amber-400 border-amber-400/25 bg-amber-400/10";
  return (
    <span
      className={cn(
        "text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none shrink-0",
        cls,
      )}
      data-testid={`badge-status-${status}`}
    >
      {status}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-label text-interactive hover:text-primary/80 transition-colors"
      data-testid="button-copy-temp-password"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

type ApproveOutcome = {
  email: string;
  email_sent: boolean;
  temp_password?: string;
  email_error?: string;
};

function ApproveResultNote({ outcome }: { outcome: ApproveOutcome }) {
  if (outcome.email_sent) {
    return (
      <div
        className="flex items-center gap-1.5 text-caption text-emerald-400"
        data-testid="text-approve-emailed"
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> Temporary password emailed to {outcome.email}
      </div>
    );
  }
  if (outcome.temp_password) {
    return (
      <div
        className="space-y-1 rounded-md border border-amber-400/25 bg-amber-400/5 p-2"
        data-testid="panel-temp-password"
      >
        <div className="text-caption text-amber-400">
          Email could not be sent — share this temporary password with {outcome.email} manually:
        </div>
        <div className="flex items-center gap-2">
          <code className="text-body font-mono text-foreground bg-white/[0.05] px-1.5 py-0.5 rounded">
            {outcome.temp_password}
          </code>
          <CopyButton value={outcome.temp_password} />
        </div>
        {outcome.email_error && (
          <div className="text-label text-muted-foreground" data-testid="text-email-error">
            {outcome.email_error}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="text-caption text-muted-foreground" data-testid="text-already-approved">
      Already approved.
    </div>
  );
}

function ActionButtons({
  status,
  onApprove,
  onReject,
  busy,
  idKey,
}: {
  status: string;
  onApprove: () => void;
  onReject: () => void;
  busy: "approve" | "reject" | null;
  idKey: string;
}) {
  if (status !== "pending") return null;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onApprove}
        disabled={busy !== null}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-caption font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        data-testid={`button-approve-${idKey}`}
      >
        {busy === "approve" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5" />
        )}
        Approve
      </button>
      <button
        onClick={onReject}
        disabled={busy !== null}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-red-500/10 border border-red-500/25 text-caption font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        data-testid={`button-reject-${idKey}`}
      >
        {busy === "reject" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <XCircle className="w-3.5 h-3.5" />
        )}
        Reject
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ─── Email delivery status banner ──────────────────────────────────────

function EmailStatusBanner() {
  const status = useGetAdminEmailStatus();
  if (!status.data) return null;
  const { mode, from, environment } = status.data;

  if (mode === "configured") {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/5 px-3 py-2"
        data-testid="banner-email-status"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <div className="text-caption text-muted-foreground">
          Email delivery is configured (sending as <span className="text-foreground">{from}</span>).
          {" "}Environment: <span className="text-foreground">{environment}</span> — approvals create
          accounts in this environment only.
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-400/5 px-3 py-2"
      data-testid="banner-email-status"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-caption text-muted-foreground space-y-0.5">
        {mode === "missing_key" ? (
          <div>
            <span className="text-amber-400 font-medium">Email delivery is disabled</span> — no
            email API key is set. Temporary passwords and reset links will be shown here for you
            to share manually.
          </div>
        ) : (
          <div>
            <span className="text-amber-400 font-medium">Email delivery is in sandbox mode</span>
            {" "}— the sandbox sender ({from}) only delivers to the email account owner's inbox.
            Emails to anyone else will fail, and their credentials will be shown here instead.
            To fix: verify a domain at resend.com/domains and set REQUEST_ACCESS_FROM_EMAIL to a
            sender on that domain.
          </div>
        )}
        <div>
          Environment: <span className="text-foreground">{environment}</span> — approvals create
          accounts in this environment only. Approving here does <span className="text-foreground">not</span>{" "}
          create the account in {environment === "development" ? "production" : "development"}.
        </div>
      </div>
    </div>
  );
}

// ─── Provisioned users section ─────────────────────────────────────────

function UserStatusBadge({ status }: { status: AdminUser["status"] }) {
  const cls =
    status === "active"
      ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10"
      : status === "disabled"
        ? "text-red-400 border-red-400/25 bg-red-400/10"
        : "text-sky-400 border-sky-400/25 bg-sky-400/10";
  return (
    <span
      className={cn(
        "text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none shrink-0",
        cls,
      )}
      data-testid={`badge-user-status-${status}`}
    >
      {status}
    </span>
  );
}

type UserActionOutcome =
  | { kind: "temp_password"; email_sent: boolean; value?: string; email_error?: string }
  | { kind: "reset_link"; email_sent: boolean; value?: string; email_error?: string };

function UserActionNote({ outcome, email }: { outcome: UserActionOutcome; email: string }) {
  const noun = outcome.kind === "temp_password" ? "temporary password" : "reset link";
  if (outcome.email_sent) {
    return (
      <div
        className="flex items-center gap-1.5 text-caption text-emerald-400"
        data-testid="text-user-action-emailed"
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> New {noun} emailed to {email}
      </div>
    );
  }
  return (
    <div
      className="space-y-1 rounded-md border border-amber-400/25 bg-amber-400/5 p-2"
      data-testid="panel-user-action-fallback"
    >
      <div className="text-caption text-amber-400">
        Email could not be sent — share this {noun} with {email} manually
        {outcome.kind === "reset_link" ? " (expires in 1 hour)" : ""}:
      </div>
      {outcome.value && (
        <div className="flex items-center gap-2 min-w-0">
          <code className="text-caption font-mono text-foreground bg-white/[0.05] px-1.5 py-0.5 rounded truncate">
            {outcome.value}
          </code>
          <CopyButton value={outcome.value} />
        </div>
      )}
      {outcome.email_error && (
        <div className="text-label text-muted-foreground" data-testid="text-user-action-email-error">
          {outcome.email_error}
        </div>
      )}
    </div>
  );
}

// ─── Manage ad-account access panel ────────────────────────────────────

function ManageAccessPanel({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const allAccounts = useListAdminAdAccounts();
  const currentGrants = useGetAdminUserAdAccounts(user.id);
  const update = useUpdateAdminUserAdAccounts();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Initialise checkboxes once we have the current grants
  const grantsLoaded = useRef(false);
  useEffect(() => {
    if (!grantsLoaded.current && currentGrants.data) {
      setSelected(new Set(currentGrants.data.ad_account_ids));
      grantsLoaded.current = true;
    }
  }, [currentGrants.data]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = () => {
    setSaveError(null);
    setSaved(false);
    update.mutate(
      { userId: user.id, data: { ad_account_ids: Array.from(selected) } },
      {
        onSuccess: () => {
          setSaved(true);
          onChanged();
          setTimeout(onClose, 800);
        },
        onError: () => setSaveError("Could not update grants. Please try again."),
      },
    );
  };

  const accounts = allAccounts.data?.ad_accounts ?? [];
  const loading = allAccounts.isLoading || currentGrants.isLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      data-testid="panel-manage-access"
    >
      <div className="w-full max-w-sm rounded-xl border border-border/40 bg-background shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div>
            <div className="text-body font-semibold text-foreground">Manage ad account access</div>
            <div className="text-label text-muted-foreground truncate max-w-[240px]">{user.email}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-caption text-muted-foreground py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading accounts…
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-caption text-muted-foreground/70 py-4">
              No ad accounts found in the Metrix data layer.
            </div>
          ) : (
            accounts.map((acct) => (
              <label
                key={acct.id}
                className="flex items-center gap-2.5 cursor-pointer group"
                data-testid={`checkbox-account-${acct.id}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(acct.id)}
                  onChange={() => toggle(acct.id)}
                  className="w-3.5 h-3.5 accent-primary shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-body text-foreground truncate">
                    {acct.name ?? acct.id}
                  </div>
                  {acct.name && (
                    <div className="text-label text-muted-foreground/60 truncate">{acct.id}</div>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
        {saveError && (
          <div className="px-4 pb-2 text-caption text-red-400/90">{saveError}</div>
        )}
        {saved && (
          <div className="px-4 pb-2 flex items-center gap-1.5 text-caption text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </div>
        )}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/30">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-border/50 text-caption text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={update.isPending || loading}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-caption font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
            data-testid="button-save-access"
          >
            {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save access
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete-account confirmation modal ────────────────────────────────

function DeleteConfirmModal({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirm === user.email && !isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    setError(null);
    setIsPending(true);
    try {
      // The generated hook lacks ?confirm=true (Orval path+query param naming collision),
      // so we call the endpoint directly. The metrix_admin cookie is sent automatically.
      const res = await fetch(`/api/metrix/admin/users/${user.id}?confirm=true`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Could not delete this account. Please try again.");
        return;
      }
      onDeleted();
    } catch {
      setError("Could not delete this account. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      data-testid="modal-delete-confirm"
    >
      <div className="w-full max-w-sm rounded-xl border border-red-500/30 bg-background shadow-2xl">
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-body font-semibold text-foreground">Delete account</span>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="text-caption text-muted-foreground">
            This permanently deletes{" "}
            <span className="text-foreground font-medium">{user.email}</span> and all their
            sessions and grants. This cannot be undone.
          </div>
          <div className="space-y-1">
            <label className="text-label font-medium text-muted-foreground">
              Type the user's email to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={user.email}
              className={INPUT_CLS}
              data-testid="input-delete-confirm"
              autoComplete="off"
            />
          </div>
          {error && <div className="text-caption text-red-400/90">{error}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md border border-border/50 text-caption text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canDelete}
              className="h-8 px-3 rounded-md bg-red-500/20 border border-red-500/40 text-caption font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
              data-testid="button-delete-confirm-submit"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add User dialog ───────────────────────────────────────────────────

function AddUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createUser = useCreateAdminUser();
  const allAccounts = useListAdminAdAccounts();
  const accounts = allAccounts.data?.ad_accounts ?? [];

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [outcome, setOutcome] = useState<AdminCreateUserResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleAccount = (id: string) =>
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || createUser.isPending) return;
    setError(null);
    createUser.mutate(
      {
        data: {
          email,
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          role,
          ad_account_ids: role === "member" ? Array.from(selectedAccounts) : [],
        },
      },
      {
        onSuccess: (res) => {
          setOutcome(res);
          onCreated(); // refresh the user list; dialog stays open to show outcome
        },
        onError: (err) => {
          const msg = (err as { message?: string }).message;
          setError(msg ?? "Could not create the account. Please try again.");
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      data-testid="dialog-add-user"
    >
      <div className="w-full max-w-md rounded-xl border border-border/40 bg-background shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-interactive shrink-0" />
            <span className="text-body font-semibold text-foreground">Add user</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {outcome ? (
          <div className="p-4 space-y-3">
            {outcome.email_sent ? (
              <div className="flex items-center gap-1.5 text-caption text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Temporary password emailed to {outcome.email}
              </div>
            ) : outcome.temp_password ? (
              <div className="space-y-1 rounded-md border border-amber-400/25 bg-amber-400/5 p-2">
                <div className="text-caption text-amber-400">
                  Email could not be sent — share this temporary password with {outcome.email} manually:
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-body font-mono text-foreground bg-white/[0.05] px-1.5 py-0.5 rounded">
                    {outcome.temp_password}
                  </code>
                  <CopyButton value={outcome.temp_password} />
                </div>
                {outcome.email_error && (
                  <div className="text-label text-muted-foreground">{outcome.email_error}</div>
                )}
              </div>
            ) : null}
            <button
              onClick={onClose}
              className="w-full h-8 rounded-md border border-border/50 text-caption text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 space-y-3">
            <div className="space-y-1">
              <label className="text-label font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className={INPUT_CLS}
                data-testid="input-add-user-email"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-label font-medium text-muted-foreground">
                Display name{" "}
                <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                className={INPUT_CLS}
                data-testid="input-add-user-display-name"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-label font-medium text-muted-foreground">Role</label>
              <div className="flex items-center gap-2">
                {(["member", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      "h-7 px-3 rounded-md border text-label font-medium transition-colors capitalize",
                      role === r
                        ? "border-primary/50 bg-primary/15 text-interactive"
                        : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {role === "member" && (
              <div className="space-y-1">
                <label className="text-label font-medium text-muted-foreground">
                  Ad account access{" "}
                  <span className="text-muted-foreground/50">(optional)</span>
                </label>
                {allAccounts.isLoading ? (
                  <div className="flex items-center gap-1.5 text-label text-muted-foreground py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading accounts…
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="text-label text-muted-foreground/60 py-1">
                    No ad accounts available.
                  </div>
                ) : (
                  <div className="rounded-md border border-border/30 bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => setShowAccountPicker((v) => !v)}
                      className="w-full flex items-center justify-between px-3 h-8 text-caption text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-account-picker"
                    >
                      <span>
                        {selectedAccounts.size === 0
                          ? "Select accounts…"
                          : `${selectedAccounts.size} account${selectedAccounts.size > 1 ? "s" : ""} selected`}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 transition-transform",
                          showAccountPicker && "rotate-180",
                        )}
                      />
                    </button>
                    {showAccountPicker && (
                      <div className="border-t border-border/30 p-2 space-y-1.5 max-h-40 overflow-y-auto">
                        {accounts.map((acct) => (
                          <label
                            key={acct.id}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAccounts.has(acct.id)}
                              onChange={() => toggleAccount(acct.id)}
                              className="w-3.5 h-3.5 accent-primary shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-caption text-foreground truncate">
                                {acct.name ?? acct.id}
                              </div>
                              {acct.name && (
                                <div className="text-[9px] text-muted-foreground/60 truncate">
                                  {acct.id}
                                </div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && <div className="text-caption text-red-400/90">{error}</div>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-md border border-border/50 text-caption text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!email || createUser.isPending}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-caption font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
                data-testid="button-add-user-submit"
              >
                {createUser.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create account
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const resend = useAdminResendTempPassword();
  const sendReset = useAdminSendPasswordReset();
  const revoke = useAdminRevokeUser();
  const restore = useAdminRestoreUser();
  const [outcome, setOutcome] = useState<UserActionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [showManageAccess, setShowManageAccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const busy =
    resend.isPending || sendReset.isPending || revoke.isPending || restore.isPending;
  const disabled = user.status === "disabled";

  const actionBtn =
    "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-label font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";

  return (
    <>
      {showManageAccess && (
        <ManageAccessPanel
          user={user}
          onClose={() => setShowManageAccess(false)}
          onChanged={onChanged}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          user={user}
          onClose={() => setShowDeleteConfirm(false)}
          onDeleted={() => {
            setShowDeleteConfirm(false);
            onChanged();
          }}
        />
      )}
      <div
        className="rounded-lg border border-border/30 bg-white/[0.02] p-3 space-y-2"
        data-testid={`row-user-${user.id}`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Mail className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
          <div className="flex-1 min-w-0">
            {user.display_name ? (
              <>
                <div className="text-body font-medium text-foreground truncate">
                  {user.display_name}
                </div>
                <div className="text-label text-muted-foreground/70 truncate">{user.email}</div>
              </>
            ) : (
              <div className="text-body font-medium text-foreground truncate">{user.email}</div>
            )}
            <div className="text-label text-muted-foreground/60">
              Created {formatDate(user.created_at)}
              {user.last_login_at
                ? ` · Last login ${formatDate(user.last_login_at)}`
                : " · Never logged in"}
              {user.must_change_password && !disabled ? " · Must change password" : ""}
              {user.role === "admin" ? " · Admin" : ""}
            </div>
            {user.role !== "admin" && (
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {user.ad_account_ids.length === 0 ? (
                  <span className="text-[9px] text-muted-foreground/40 italic">
                    No ad account access
                  </span>
                ) : (
                  user.ad_account_ids.map((id) => (
                    <span
                      key={id}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-border/30 text-muted-foreground/70 font-mono leading-none"
                    >
                      {id}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>
          <UserStatusBadge status={user.status} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Actions available to all non-disabled users (active + invited) */}
          {!disabled && (
            <>
              <button
                onClick={() => {
                  setError(null);
                  setOutcome(null);
                  resend.mutate(
                    { userId: user.id },
                    {
                      onSuccess: (res) => {
                        setOutcome({
                          kind: "temp_password",
                          email_sent: res.email_sent,
                          value: res.temp_password,
                          email_error: res.email_error,
                        });
                        onChanged();
                      },
                      onError: () =>
                        setError("Could not issue a new temporary password. Please try again."),
                    },
                  );
                }}
                disabled={busy}
                className={cn(
                  actionBtn,
                  "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
                data-testid={`button-resend-temp-${user.id}`}
              >
                {resend.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <KeyRound className="w-3.5 h-3.5" />
                )}
                New temp password
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setOutcome(null);
                  sendReset.mutate(
                    { userId: user.id },
                    {
                      onSuccess: (res) => {
                        setOutcome({
                          kind: "reset_link",
                          email_sent: res.email_sent,
                          value: res.reset_url,
                          email_error: res.email_error,
                        });
                        onChanged();
                      },
                      onError: () => setError("Could not create a reset link. Please try again."),
                    },
                  );
                }}
                disabled={busy}
                className={cn(
                  actionBtn,
                  "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
                data-testid={`button-send-reset-${user.id}`}
              >
                {sendReset.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                Send reset link
              </button>
              {confirmRevoke ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-label text-red-400">Revoke access and sign them out?</span>
                  <button
                    onClick={() => {
                      setConfirmRevoke(false);
                      setError(null);
                      setOutcome(null);
                      revoke.mutate(
                        { userId: user.id },
                        {
                          onSuccess: () => onChanged(),
                          onError: () => setError("Could not revoke access. Please try again."),
                        },
                      );
                    }}
                    disabled={busy}
                    className={cn(actionBtn, "border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25")}
                    data-testid={`button-revoke-confirm-${user.id}`}
                  >
                    {revoke.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserX className="w-3.5 h-3.5" />
                    )}
                    Yes, revoke
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(false)}
                    disabled={busy}
                    className={cn(actionBtn, "border-border/50 text-muted-foreground hover:text-foreground")}
                    data-testid={`button-revoke-cancel-${user.id}`}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  disabled={busy}
                  className={cn(
                    actionBtn,
                    "border-red-500/25 text-red-400/90 hover:bg-red-500/10",
                  )}
                  data-testid={`button-revoke-${user.id}`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  Revoke access
                </button>
              )}
            </>
          )}
          {disabled && (
            <button
              onClick={() => {
                setError(null);
                setOutcome(null);
                restore.mutate(
                  { userId: user.id },
                  {
                    onSuccess: () => onChanged(),
                    onError: () => setError("Could not restore access. Please try again."),
                  },
                );
              }}
              disabled={busy}
              className={cn(
                actionBtn,
                "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
              )}
              data-testid={`button-restore-${user.id}`}
            >
              {restore.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
              Restore access
            </button>
          )}

          {/* Manage access — available to all users */}
          <button
            onClick={() => setShowManageAccess(true)}
            disabled={busy}
            className={cn(
              actionBtn,
              "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
            data-testid={`button-manage-access-${user.id}`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Manage access
          </button>

          {/* Delete — available to all users */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={busy}
            className={cn(
              actionBtn,
              "border-red-500/20 text-red-400/70 hover:text-red-400 hover:bg-red-500/10",
            )}
            data-testid={`button-delete-${user.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>

        {outcome && <UserActionNote outcome={outcome} email={user.email} />}
        {error && <div className="text-caption text-red-400/90">{error}</div>}
      </div>
    </>
  );
}

function UsersSection() {
  const users = useListAdminUsers();
  const list = users.data?.users ?? [];
  const [showAddUser, setShowAddUser] = useState(false);

  return (
    <section className="space-y-3">
      {showAddUser && (
        <AddUserDialog
          onClose={() => setShowAddUser(false)}
          onCreated={() => void users.refetch()}
        />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-title font-semibold text-foreground">Provisioned users</h2>
          <span className="text-caption text-muted-foreground">
            {users.data?.total ?? 0} total
          </span>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-primary/40 bg-primary/10 text-label font-medium text-interactive hover:bg-primary/20 transition-colors"
          data-testid="button-add-user"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add user
        </button>
      </div>
      {users.isLoading ? (
        <div className="flex items-center gap-2 text-caption text-muted-foreground py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading users…
        </div>
      ) : users.isError ? (
        <div className="text-caption text-red-400/90 py-4">
          Could not load users. Refresh to try again.
        </div>
      ) : list.length === 0 ? (
        <div className="text-caption text-muted-foreground/70 py-4">
          No provisioned users yet — use "Add user" or approve a request to create the first
          account.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((user) => (
            <UserRow key={user.id} user={user} onChanged={() => void users.refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Access-request card (full form data) ─────────────────────────────

function RequestCard({ entry, onChanged }: { entry: RequestAccessEntry; onChanged: () => void }) {
  const approve = useApproveRequestAccessEntry();
  const reject = useRejectRequestAccessEntry();
  const [outcome, setOutcome] = useState<ApproveOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = approve.isPending ? "approve" : reject.isPending ? "reject" : null;

  const detail: Array<{ icon: typeof Phone; label: string; value: string | null | undefined }> = [
    { icon: Phone, label: "Phone", value: entry.phone },
    { icon: Briefcase, label: "Business type", value: entry.business_type },
    { icon: Factory, label: "Industry", value: entry.industry },
    { icon: DollarSign, label: "Avg monthly ad spend", value: entry.avg_monthly_ad_spend },
    { icon: Globe, label: "Website", value: entry.website },
    { icon: Linkedin, label: "LinkedIn", value: entry.linkedin },
  ];

  return (
    <div
      className="rounded-lg border border-border/30 bg-white/[0.02] p-4 space-y-3"
      data-testid={`card-request-${entry.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-title font-semibold text-foreground truncate">
            {entry.full_name}
          </div>
          <div className="text-caption text-muted-foreground truncate">{entry.email}</div>
          <div className="text-label text-muted-foreground/60 mt-0.5">
            Requested {formatDate(entry.created_at)}
          </div>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {detail
          .filter((d) => d.value)
          .map((d) => (
            <div key={d.label} className="flex items-center gap-1.5 min-w-0">
              <d.icon className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-label text-muted-foreground/70 shrink-0">{d.label}:</span>
              <span className="text-caption text-foreground truncate">{d.value}</span>
            </div>
          ))}
      </div>

      {outcome && <ApproveResultNote outcome={outcome} />}
      {error && <div className="text-caption text-red-400/90">{error}</div>}

      <ActionButtons
        status={outcome ? "handled" : entry.status}
        idKey={`request-${entry.id}`}
        busy={busy}
        onApprove={() => {
          setError(null);
          approve.mutate(
            { requestId: entry.id },
            {
              onSuccess: (res) => {
                setOutcome(res);
                onChanged();
              },
              onError: () => setError("Could not approve this request. Please try again."),
            },
          );
        }}
        onReject={() => {
          setError(null);
          reject.mutate(
            { requestId: entry.id },
            {
              onSuccess: () => onChanged(),
              onError: () => setError("Could not reject this request. Please try again."),
            },
          );
        }}
      />
    </div>
  );
}

// ─── Waitlist email row ────────────────────────────────────────────────

function WaitlistRow({ entry, onChanged }: { entry: WaitlistEntry; onChanged: () => void }) {
  const approve = useApproveAgentWaitlistEntry();
  const reject = useRejectAgentWaitlistEntry();
  const [outcome, setOutcome] = useState<ApproveOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = approve.isPending ? "approve" : reject.isPending ? "reject" : null;

  return (
    <div
      className="rounded-lg border border-border/30 bg-white/[0.02] p-3 space-y-2"
      data-testid={`row-waitlist-${entry.id}`}
    >
      <div className="flex items-center gap-3">
        <Mail className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-body font-medium text-foreground truncate">{entry.email}</div>
          <div className="text-label text-muted-foreground/60">
            Joined {formatDate(entry.joined_at)}
          </div>
        </div>
        <StatusBadge status={entry.status} />
        <ActionButtons
          status={outcome ? "handled" : entry.status}
          idKey={`waitlist-${entry.id}`}
          busy={busy}
          onApprove={() => {
            setError(null);
            approve.mutate(
              { entryId: entry.id },
              {
                onSuccess: (res) => {
                  setOutcome(res);
                  onChanged();
                },
                onError: () => setError("Could not approve this entry. Please try again."),
              },
            );
          }}
          onReject={() => {
            setError(null);
            reject.mutate(
              { entryId: entry.id },
              {
                onSuccess: () => onChanged(),
                onError: () => setError("Could not reject this entry. Please try again."),
              },
            );
          }}
        />
      </div>
      {outcome && <ApproveResultNote outcome={outcome} />}
      {error && <div className="text-caption text-red-400/90">{error}</div>}
    </div>
  );
}

// ─── Login gate ─────────────────────────────────────────────────────────

function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useAdminLogin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (login.isPending || !password) return;
    setError(null);
    login.mutate(
      { data: { password } },
      {
        onSuccess,
        onError: (err) => {
          const status = (err as { status?: number }).status;
          setError(
            status === 429
              ? "Too many attempts. Please wait a few minutes and try again."
              : "Incorrect password.",
          );
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <AuthBrandHeader subtitle="Admin console" />
        <form onSubmit={submit} className="space-y-3" data-testid="form-admin-login">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-password"
              className="text-caption font-medium text-muted-foreground"
            >
              Admin password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className={INPUT_CLS}
              data-testid="input-admin-password"
            />
          </div>
          {error && (
            <div className="text-caption text-red-400/90" data-testid="text-admin-login-error">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={login.isPending || !password}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            data-testid="button-admin-login"
          >
            {login.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enter admin console
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Environment pill ──────────────────────────────────────────────────

function EnvironmentPill() {
  const status = useGetAdminEmailStatus();
  const env = status.data?.environment;
  if (!env) return null;
  const isProd = env === "production";
  return (
    <span
      className={cn(
        "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none",
        isProd
          ? "text-red-400 border-red-400/40 bg-red-400/10"
          : "text-amber-400 border-amber-400/40 bg-amber-400/10",
      )}
      data-testid="pill-environment"
      title={`Operating against the ${env} database`}
    >
      {isProd ? "PROD" : "DEV"}
    </span>
  );
}

// ─── Console ────────────────────────────────────────────────────────────

function AdminConsole({ onLogout }: { onLogout: () => void }) {
  const logout = useAdminLogout();
  const requests = useListRequestAccessEntries();
  const waitlist = useListAgentWaitlist({ limit: 200, offset: 0 });

  const requestEntries = requests.data?.entries ?? [];
  const waitlistEntries = waitlist.data?.entries ?? [];

  const pendingRequests = useMemo(
    () => requestEntries.filter((e) => e.status === "pending").length,
    [requestEntries],
  );
  const pendingWaitlist = useMemo(
    () => waitlistEntries.filter((e) => e.status === "pending").length,
    [waitlistEntries],
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Admin console</h1>
            <EnvironmentPill />
          </div>
          <button
            onClick={() =>
              logout.mutate(undefined, { onSuccess: onLogout, onError: onLogout })
            }
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-caption font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-admin-logout"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
        <p className="text-caption text-muted-foreground -mt-6">
          Manage user accounts, access requests, and ad account grants.
        </p>

        <EmailStatusBanner />

        <UsersSection />

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title font-semibold text-foreground">Access requests</h2>
            <span className="text-caption text-muted-foreground">
              {requestEntries.length} total · {pendingRequests} pending
            </span>
          </div>
          {requests.isLoading ? (
            <div className="flex items-center gap-2 text-caption text-muted-foreground py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading access requests…
            </div>
          ) : requests.isError ? (
            <div className="text-caption text-red-400/90 py-4">
              Could not load access requests. Refresh to try again.
            </div>
          ) : requestEntries.length === 0 ? (
            <div className="text-caption text-muted-foreground/70 py-4">
              No access requests yet.
            </div>
          ) : (
            <div className="space-y-3">
              {requestEntries.map((entry) => (
                <RequestCard
                  key={entry.id}
                  entry={entry}
                  onChanged={() => void requests.refetch()}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title font-semibold text-foreground">Waitlist emails</h2>
            <span className="text-caption text-muted-foreground">
              {waitlist.data?.total ?? 0} total · {pendingWaitlist} pending
            </span>
          </div>
          {waitlist.isLoading ? (
            <div className="flex items-center gap-2 text-caption text-muted-foreground py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading waitlist…
            </div>
          ) : waitlist.isError ? (
            <div className="text-caption text-red-400/90 py-4">
              Could not load the waitlist. Refresh to try again.
            </div>
          ) : waitlistEntries.length === 0 ? (
            <div className="text-caption text-muted-foreground/70 py-4">
              No waitlist signups yet.
            </div>
          ) : (
            <div className="space-y-2">
              {waitlistEntries.map((entry) => (
                <WaitlistRow
                  key={entry.id}
                  entry={entry}
                  onChanged={() => void waitlist.refetch()}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function AdminWaitlistPage() {
  // Default queryClient options (staleTime: Infinity, retry: false) are fine
  // here — we explicitly refetch() after login/logout.
  const session = useGetAdminSession();

  if (session.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session.data?.authenticated) {
    return <AdminLoginForm onSuccess={() => void session.refetch()} />;
  }

  return <AdminConsole onLogout={() => void session.refetch()} />;
}
