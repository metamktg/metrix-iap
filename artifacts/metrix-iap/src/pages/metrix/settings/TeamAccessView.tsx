// ─── Settings · Team & Access ─────────────────────────────────────────
// Workspace-wide: members, roles, and the account-level access policy.
// "Add member" is single-step: role, master permissions, and initial
// ad-account grants are all set before the invite is sent, and the account
// is provisioned immediately (no separate "accept invite" flow exists).

import { TYPE } from "../typography";
import { useState, type FormEvent } from "react";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState, CaveatNote, DetailReveal, deriveLabel, CrossLink } from "../shared";
import { cn } from "@/lib/utils";
import { Users, UserPlus, ShieldCheck, Loader2, X, RotateCw, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useListWorkspaceInvites,
  useListWorkspaceMembers,
  useCreateWorkspaceInvite,
  useRevokeWorkspaceInvite,
  useResendWorkspaceInvite,
  useListMemberAdAccounts,
  useGrantMemberAdAccount,
  useRevokeMemberAdAccount,
  useUpdateMemberPermissions,
  useResendMemberTempPassword,
  useUpdateMemberStatus,
  getListWorkspaceInvitesQueryKey,
  getListWorkspaceMembersQueryKey,
  getListMemberAdAccountsQueryKey,
} from "@workspace/api-client-react";
import type { WorkspaceInviteInputRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdAccount } from "@/lib/data/seedTypes";

const SECTION = "Settings · 09";

const INVITE_ROLES: { id: WorkspaceInviteInputRole; label: string }[] = [
  { id: "analyst", label: "Analyst" },
  { id: "client_viewer", label: "Client Viewer" },
];

// Used whenever the seed has no `workspace_settings` block (every live,
// Supabase-backed workspace — only the static demo seed populates it). The
// real roster/permissions always come from the auth DB via
// useListWorkspaceMembers/useListWorkspaceInvites, so this is just static
// copy plus a generous default seat limit — never a source of truth.
const DEFAULT_TEAM_ROLES = [
  { id: "owner", label: "Owner", description: "Full admin access: manages team, billing, and every ad account." },
  { id: "analyst", label: "Analyst", description: "Can be granted specific ad accounts to analyze and build reports for." },
  { id: "client_viewer", label: "Client Viewer", description: "Read-only access to the ad accounts they're granted." },
];
const DEFAULT_ACCESS_POLICY =
  "Admins see every ad account. Members see only the ad accounts an admin explicitly grants them, plus the reports they generate.";
const DEFAULT_SEAT_LIMIT = 20;

function PermissionToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        "w-full flex items-start gap-2.5 p-2.5 rounded-md border text-left transition-colors disabled:opacity-40 disabled:pointer-events-none",
        checked
          ? "border-primary/30 bg-primary/[0.06]"
          : "border-border/40 bg-white/[0.02] hover:bg-white/[0.04]",
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "w-4 h-4 rounded shrink-0 mt-0.5 border flex items-center justify-center",
          checked ? "border-primary bg-primary/20 text-primary" : "border-border/50",
        )}
      >
        {checked && <Check className="w-3.5 h-3.5" />}
      </div>
      <div className="min-w-0">
        <div className="text-caption font-medium text-foreground">{label}</div>
        <div className="text-label text-muted-foreground/70 leading-relaxed">{description}</div>
      </div>
    </button>
  );
}

function AddMemberDialog({
  workspaceId,
  open,
  onOpenChange,
  atSeatLimit,
  seatLimit,
  adAccounts,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atSeatLimit: boolean;
  seatLimit: number;
  adAccounts: AdAccount[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceInviteInputRole>("analyst");
  const [manageTeam, setManageTeam] = useState(false);
  const [viewAgencyRollups, setViewAgencyRollups] = useState(false);
  const [grantedAccountIds, setGrantedAccountIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { mutate, isPending } = useCreateWorkspaceInvite();

  const reset = () => {
    setEmail("");
    setRole("analyst");
    setManageTeam(false);
    setViewAgencyRollups(false);
    setGrantedAccountIds([]);
    setFeedback(null);
    setSuccessNotice(null);
  };

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) reset();
  };

  const toggleAccount = (id: string) => {
    setGrantedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || isPending || atSeatLimit) return;
    setFeedback(null);
    setSuccessNotice(null);
    mutate(
      {
        workspaceId,
        data: {
          email: trimmed,
          role,
          manage_team: manageTeam,
          view_agency_rollups: viewAgencyRollups,
          ad_account_ids: grantedAccountIds,
        },
      },
      {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({
            queryKey: getListWorkspaceInvitesQueryKey(workspaceId),
          });
          void queryClient.invalidateQueries({
            queryKey: getListWorkspaceMembersQueryKey(workspaceId),
          });
          if (result.status === "already_invited") {
            setFeedback(`${result.invite.email} already has a pending invite.`);
            return;
          }
          if (result.email_sent === false && result.temp_password) {
            setSuccessNotice(
              `Account created. Email delivery failed — share this temporary password manually: ${result.temp_password}`,
            );
            return;
          }
          handleOpenChange(false);
        },
        onError: (error) => {
          const serverMessage =
            error?.data && typeof error.data === "object" && "message" in error.data
              ? String((error.data as { message: unknown }).message)
              : null;
          setFeedback(
            serverMessage ?? "Could not add this member. Check the email address and try again.",
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center mb-1">
            <UserPlus className="w-4 h-4 text-primary" />
          </div>
          <DialogTitle className="text-base">Add member</DialogTitle>
          <DialogDescription className="text-body leading-relaxed">
            Set permissions and account access, then send the invite — the account is provisioned
            immediately with a temp password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-caption font-medium text-foreground/80">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="off"
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-invite-email"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-caption font-medium text-foreground/80">Role</span>
            <div className="grid grid-cols-2 gap-2">
              {INVITE_ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "h-9 rounded-md border text-body font-medium transition-colors",
                    role === r.id
                      ? "border-primary/30 bg-primary/[0.08] text-primary"
                      : "border-border/40 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                  )}
                  data-testid={`button-invite-role-${r.id}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-caption font-medium text-foreground/80">Permissions</span>
            <div className="space-y-1.5">
              <PermissionToggleRow
                label="Manage team"
                description="Can add/remove members and change their permissions and account access."
                checked={manageTeam}
                onChange={setManageTeam}
                testId="toggle-invite-manage-team"
              />
              <PermissionToggleRow
                label="View agency rollups"
                description="Can see manager-level totals across all ad accounts, not just their own grants."
                checked={viewAgencyRollups}
                onChange={setViewAgencyRollups}
                testId="toggle-invite-view-agency-rollups"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-caption font-medium text-foreground/80">Ad account access</span>
            {adAccounts.length === 0 ? (
              <p className="text-label text-muted-foreground/60">No ad accounts available yet.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/20">
                {adAccounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 px-2.5 py-2 text-caption text-foreground/85 cursor-pointer hover:bg-white/[0.03]"
                    data-testid={`checkbox-invite-account-${a.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={grantedAccountIds.includes(a.id)}
                      onChange={() => toggleAccount(a.id)}
                      className="w-3.5 h-3.5 accent-primary"
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {atSeatLimit && (
            <div className="text-caption text-amber-400/90" data-testid="text-seat-limit-warning">
              This workspace is full: all {seatLimit} seats are in use. Remove a member or cancel a
              pending invite before adding someone new.
            </div>
          )}

          {feedback && (
            <div className="text-caption text-amber-400/90" data-testid="text-invite-feedback">
              {feedback}
            </div>
          )}

          {successNotice && (
            <div className="text-caption text-emerald-400/90" data-testid="text-invite-success">
              {successNotice}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="h-9 px-4 rounded-md border border-border/50 text-body font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              {successNotice ? "Close" : "Cancel"}
            </button>
            {!successNotice && (
              <button
                type="submit"
                disabled={!email.trim() || isPending || atSeatLimit}
                className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary border border-primary text-body font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25 disabled:opacity-40 disabled:pointer-events-none"
                data-testid="button-send-invite"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                {isPending ? "Adding…" : "Add member"}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingInviteRow({
  workspaceId,
  invite,
}: {
  workspaceId: string;
  invite: { id: number; email: string; role: string; created_at: string };
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const { mutate: revoke, isPending: isRevoking } = useRevokeWorkspaceInvite();
  const { mutate: resend, isPending: isResending } = useResendWorkspaceInvite();

  const invalidateInvites = () =>
    queryClient.invalidateQueries({
      queryKey: getListWorkspaceInvitesQueryKey(workspaceId),
    });

  const handleRevoke = () => {
    if (isRevoking || isResending) return;
    setError(null);
    revoke(
      { workspaceId, inviteId: invite.id },
      {
        onSuccess: () => void invalidateInvites(),
        onError: () => setError("Could not revoke the invite. Try again."),
      },
    );
  };

  const handleResend = () => {
    if (isRevoking || isResending) return;
    setError(null);
    resend(
      { workspaceId, inviteId: invite.id },
      {
        onSuccess: () => {
          setResent(true);
          void invalidateInvites();
        },
        onError: () => setError("Could not resend the invite. Try again."),
      },
    );
  };

  return (
    <div
      className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2.5 items-center"
      data-testid={`row-invite-${invite.email}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-foreground truncate">{invite.email}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">Invited</span>
        </div>
        <div className="text-label text-muted-foreground/70 truncate">
          {error ? (
            <span className="text-red-400/90" data-testid={`text-invite-error-${invite.email}`}>{error}</span>
          ) : (
            <>
              {resent ? "Resent" : "Invited"}{" "}
              {new Date(invite.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </>
          )}
        </div>
      </div>
      <span className="text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none text-foreground/75 border-border/40 bg-white/[0.03]">
        {invite.role}
      </span>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={handleResend}
          disabled={isRevoking || isResending}
          title="Resend invite"
          className="flex items-center gap-1 h-6 px-2 rounded border border-border/40 bg-white/[0.02] text-label font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          data-testid={`button-resend-invite-${invite.email}`}
        >
          {isResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
          Resend
        </button>
        <button
          type="button"
          onClick={() => setConfirmRevoke(true)}
          disabled={isRevoking || isResending}
          title="Revoke invite"
          className="flex items-center gap-1 h-6 px-2 rounded border border-red-400/25 bg-red-400/[0.06] text-label font-medium text-red-400/90 hover:bg-red-400/[0.12] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          data-testid={`button-revoke-invite-${invite.email}`}
        >
          {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Revoke
        </button>
      </div>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invite?</AlertDialogTitle>
            <AlertDialogDescription>
              The invite for <strong>{invite.email}</strong> will be cancelled. They will lose access and any temporary password stops working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600"
            >
              Revoke invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberPermissionsCell({
  workspaceId,
  email,
  manageTeam,
  viewAgencyRollups,
}: {
  workspaceId: string;
  email: string;
  manageTeam: boolean;
  viewAgencyRollups: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { mutate, isPending } = useUpdateMemberPermissions();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListWorkspaceMembersQueryKey(workspaceId) });

  const handleToggle = (next: { manage_team: boolean; view_agency_rollups: boolean }) => {
    if (isPending) return;
    setError(null);
    mutate(
      { workspaceId, email, data: next },
      {
        onSuccess: () => void invalidate(),
        onError: () => setError("Could not update permissions. Try again."),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`cell-permissions-${email}`}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleToggle({ manage_team: !manageTeam, view_agency_rollups: viewAgencyRollups })}
        className={cn(
          "h-5 px-1.5 rounded border text-label font-medium transition-colors disabled:opacity-40",
          manageTeam
            ? "border-primary/30 bg-primary/[0.08] text-primary"
            : "border-border/40 bg-white/[0.02] text-muted-foreground hover:text-foreground",
        )}
        data-testid={`toggle-manage-team-${email}`}
      >
        Manage team
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleToggle({ manage_team: manageTeam, view_agency_rollups: !viewAgencyRollups })}
        className={cn(
          "h-5 px-1.5 rounded border text-label font-medium transition-colors disabled:opacity-40",
          viewAgencyRollups
            ? "border-primary/30 bg-primary/[0.08] text-primary"
            : "border-border/40 bg-white/[0.02] text-muted-foreground hover:text-foreground",
        )}
        data-testid={`toggle-view-agency-rollups-${email}`}
      >
        View rollups
      </button>
      {error && (
        <span className="text-label text-red-400/90 w-full" data-testid={`text-permissions-error-${email}`}>
          {error}
        </span>
      )}
    </div>
  );
}

function MemberAdAccountsCell({
  workspaceId,
  email,
  adAccounts,
}: {
  workspaceId: string;
  email: string;
  adAccounts: AdAccount[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useListMemberAdAccounts(workspaceId, email);
  const { mutate: grant, isPending: isGranting } = useGrantMemberAdAccount();
  const { mutate: revoke, isPending: isRevoking } = useRevokeMemberAdAccount();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListMemberAdAccountsQueryKey(workspaceId, email),
    });

  const grantedIds = new Set(data?.ad_account_ids ?? []);
  const grantedAccounts = adAccounts.filter((a) => grantedIds.has(a.id));
  const busy = isGranting || isRevoking;

  const handleToggle = (adAccountId: string, currentlyGranted: boolean) => {
    if (busy) return;
    setError(null);
    if (currentlyGranted) {
      revoke(
        { workspaceId, email, adAccountId },
        {
          onSuccess: () => void invalidate(),
          onError: () => setError("Could not revoke access. Try again."),
        },
      );
    } else {
      grant(
        { workspaceId, email, data: { ad_account_id: adAccountId } },
        {
          onSuccess: () => void invalidate(),
          onError: () => setError("Could not grant access. Try again."),
        },
      );
    }
  };

  if (isLoading) {
    return <span className="text-label text-muted-foreground/60">Loading…</span>;
  }

  return (
    <div className="space-y-1.5" data-testid={`cell-account-access-${email}`}>
      <div className="flex items-center flex-wrap gap-1.5">
        {grantedAccounts.length === 0 ? (
          <span className="text-label text-muted-foreground/60" data-testid={`text-no-access-${email}`}>
            No account access yet
          </span>
        ) : (
          grantedAccounts.map((a) => (
            <span
              key={a.id}
              className="h-5 px-1.5 rounded border border-border/40 bg-white/[0.03] text-label text-foreground/80"
              data-testid={`chip-account-${email}-${a.id}`}
            >
              {a.name}
            </span>
          ))
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          disabled={busy && !editing}
          className={cn(
            "flex items-center gap-1 h-5 px-1.5 rounded border text-label font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none",
            editing
              ? "border-primary/30 bg-primary/[0.08] text-primary"
              : "border-dashed border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70",
          )}
          data-testid={`button-edit-accounts-${email}`}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {editing && (
        <div
          className="rounded-md border border-border/40 divide-y divide-border/20 max-h-36 overflow-y-auto"
          data-testid={`picker-accounts-${email}`}
        >
          {adAccounts.length === 0 ? (
            <p className="px-2.5 py-2 text-label text-muted-foreground/60">No ad accounts available.</p>
          ) : (
            adAccounts.map((a) => {
              const granted = grantedIds.has(a.id);
              return (
                <label
                  key={a.id}
                  className="flex items-center gap-2 px-2.5 py-2 text-caption text-foreground/85 cursor-pointer hover:bg-white/[0.03]"
                  data-testid={`checkbox-account-${email}-${a.id}`}
                >
                  <input
                    type="checkbox"
                    checked={granted}
                    disabled={busy}
                    onChange={() => handleToggle(a.id, granted)}
                    className="w-3.5 h-3.5 accent-primary disabled:opacity-40"
                  />
                  {a.name}
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto text-muted-foreground/40" />}
                </label>
              );
            })
          )}
        </div>
      )}

      {error && (
        <span className="text-label text-red-400/90" data-testid={`text-account-access-error-${email}`}>
          {error}
        </span>
      )}
    </div>
  );
}

function MemberActionsCell({
  workspaceId,
  email,
  disabled,
}: {
  workspaceId: string;
  email: string;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const { mutate: resend, isPending: isResending } = useResendMemberTempPassword();
  const { mutate: setStatus, isPending: isUpdatingStatus } = useUpdateMemberStatus();
  const busy = isResending || isUpdatingStatus;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListWorkspaceMembersQueryKey(workspaceId) });

  const handleResend = () => {
    if (busy) return;
    setError(null);
    setTempPassword(null);
    resend(
      { workspaceId, email },
      {
        onSuccess: (data) => {
          setResent(true);
          if (!data.email_sent && data.temp_password) setTempPassword(data.temp_password);
          void invalidate();
        },
        onError: () => setError("Could not send a new temp password. Try again."),
      },
    );
  };

  const [confirmDisable, setConfirmDisable] = useState(false);

  const doStatusChange = (next: "active" | "disabled") => {
    if (busy) return;
    setError(null);
    setStatus(
      { workspaceId, email, data: { status: next } },
      {
        onSuccess: () => void invalidate(),
        onError: () =>
          setError(
            next === "disabled"
              ? "Could not remove this member. Try again."
              : "Could not restore this member. Try again.",
          ),
      },
    );
  };

  const handleStatusChange = (next: "active" | "disabled") => {
    if (busy) return;
    if (next === "disabled") {
      setConfirmDisable(true);
      return;
    }
    doStatusChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`cell-actions-${email}`}>
      {!disabled && (
        <button
          type="button"
          onClick={handleResend}
          disabled={busy}
          title="Send a new temp password"
          className="flex items-center gap-1 h-6 px-2 rounded border border-border/40 bg-white/[0.02] text-label font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          data-testid={`button-resend-temp-password-${email}`}
        >
          {isResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
          Resend temp password
        </button>
      )}
      <button
        type="button"
        onClick={() => handleStatusChange(disabled ? "active" : "disabled")}
        disabled={busy}
        title={disabled ? "Restore access" : "Remove access"}
        className={cn(
          "flex items-center gap-1 h-6 px-2 rounded border text-label font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none",
          disabled
            ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-400/90 hover:bg-emerald-400/[0.12]"
            : "border-red-400/25 bg-red-400/[0.06] text-red-400/90 hover:bg-red-400/[0.12]",
        )}
        data-testid={disabled ? `button-restore-member-${email}` : `button-remove-member-${email}`}
      >
        {isUpdatingStatus ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : disabled ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
        {disabled ? "Restore" : "Remove"}
      </button>
      {tempPassword && (
        <span
          className="text-label text-amber-400/90 font-mono w-full"
          data-testid={`text-temp-password-${email}`}
        >
          Email didn't send — temp password: {tempPassword}
        </span>
      )}
      {resent && !tempPassword && !error && (
        <span className="text-label text-emerald-400/90 w-full" data-testid={`text-resend-success-${email}`}>
          New temp password sent.
        </span>
      )}
      {error && (
        <span className="text-label text-red-400/90 w-full" data-testid={`text-actions-error-${email}`}>
          {error}
        </span>
      )}

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member access?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{email}</strong> will lose access to this workspace immediately. You can restore their access at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doStatusChange("disabled")}
              className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600"
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TeamAccessView() {
  const { user } = useAuth();

  // Team management requires the manage_team master permission (admins
  // always qualify; the API enforces the same rule server-side).
  if (user?.role !== "admin" && !user?.manage_team) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Team & Access" />
        <PendingState
          title="Access required"
          message="Team management is available to admins and members with the Manage team permission. Ask a workspace admin if you need a change to your access."
          icon={ShieldCheck}
          action={<CrossLink to="/app/analysis/overview" label="Back to Overview" />}
        />
      </div>
    );
  }

  return <TeamAccessViewInner />;
}

function TeamAccessViewInner() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const ws = getWorkspaceSettings(seed);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { user } = useAuth();
  const { data: invitesData, isError: invitesFailed } = useListWorkspaceInvites(manager.id);
  const { data: membersData } = useListWorkspaceMembers(manager.id);

  // The real roster (members/invites) always comes from the auth DB, not the
  // seed — `workspace_settings` only exists on the static demo seed. Live
  // workspaces fall back to static role copy + a default seat limit so the
  // page still works instead of showing an empty "not available" state.
  const team = ws?.team ?? {
    seat_limit: DEFAULT_SEAT_LIMIT,
    members: [],
    roles: DEFAULT_TEAM_ROLES,
    access_policy: DEFAULT_ACCESS_POLICY,
  };

  // Real provisioned accounts from the auth database take precedence over the
  // seed roster; seed members without a real account remain listed as roster
  // entries so the workspace's intended team stays visible.
  const realMembers = membersData?.members ?? [];
  const realByEmail = new Map(realMembers.map((m) => [m.email.toLowerCase(), m]));
  const seedEmails = new Set(team.members.map((m) => m.email.toLowerCase()));

  const memberRows = [
    ...team.members.map((m) => {
      const real = realByEmail.get(m.email.toLowerCase());
      return {
        key: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        invited: real ? real.status === "invited" : m.status === "invited",
        disabled: real ? real.status === "disabled" : false,
        lastActive: real ? real.last_login_at : m.last_active,
        hasAccount: Boolean(real),
        manageTeam: real ? real.manage_team : m.role === "owner",
        viewAgencyRollups: real ? real.view_agency_rollups : m.role === "owner",
        isAdmin: real ? real.role === "admin" : m.role === "owner",
      };
    }),
    ...realMembers
      .filter((m) => !seedEmails.has(m.email.toLowerCase()))
      .map((m) => ({
        key: `user-${m.email}`,
        name: m.email.split("@")[0],
        email: m.email,
        role: "member",
        invited: m.status === "invited",
        disabled: m.status === "disabled",
        lastActive: m.last_login_at,
        hasAccount: true,
        manageTeam: m.manage_team,
        viewAgencyRollups: m.view_agency_rollups,
        isAdmin: m.role === "admin",
      })),
  ];

  const memberEmails = new Set(memberRows.map((m) => m.email.toLowerCase()));
  const pendingInvites = (invitesData?.invites ?? []).filter(
    (inv) => !memberEmails.has(inv.email.toLowerCase()),
  );
  const seatsUsed = memberRows.length + pendingInvites.length;
  const atSeatLimit = seatsUsed >= team.seat_limit;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Team & Access"
        subtitle={`Workspace-wide · who can access ${manager.name} and what they can do.`}
        right={
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-caption font-medium text-primary hover:bg-primary/25 transition-colors"
            data-testid="button-invite-member"
          >
            <UserPlus className="w-3.5 h-3.5" /> Add member
          </button>
        }
      />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard
          title="Members"
          desc={`${seatsUsed} of ${team.seat_limit} seats in use.`}
        >
          <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-b border-border/30">
              <span className="text-label uppercase tracking-wide text-muted-foreground/70 font-medium">Member</span>
              <span className="text-label uppercase tracking-wide text-muted-foreground/70 font-medium">Role</span>
              <span className="text-label uppercase tracking-wide text-muted-foreground/70 font-medium text-right w-24">Last active</span>
            </div>
            <div className="divide-y divide-border/20">
              {memberRows.map((m) => (
                <div key={m.key} className="px-3 py-2.5 space-y-2" data-testid={`row-member-${m.email}`}>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium text-foreground truncate">{m.name}</span>
                      {m.disabled ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-red-400 border border-red-400/25 bg-red-400/10 px-1.5 py-0.5 rounded leading-none">Removed</span>
                      ) : m.invited ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">Invited</span>
                      ) : m.hasAccount ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 rounded leading-none">Active</span>
                      ) : null}
                    </div>
                    <div className="text-label text-muted-foreground/70 truncate">{m.email}</div>
                  </div>
                  <span className={cn(
                    "text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none",
                    m.role === "owner" ? "text-primary border-primary/25 bg-primary/10" : "text-foreground/75 border-border/40 bg-white/[0.03]"
                  )}>
                    {m.role}
                  </span>
                  <span className="text-label font-mono text-muted-foreground/70 text-right w-24">
                    {m.lastActive
                      ? new Date(m.lastActive).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </div>
                {!m.isAdmin && (
                  <div className="pl-0 space-y-1.5">
                    {m.hasAccount ? (
                      <>
                        <MemberPermissionsCell
                          workspaceId={manager.id}
                          email={m.email}
                          manageTeam={m.manageTeam}
                          viewAgencyRollups={m.viewAgencyRollups}
                        />
                        <MemberAdAccountsCell workspaceId={manager.id} email={m.email} adAccounts={seed.ad_accounts} />
                      </>
                    ) : (
                      <span className="text-label text-muted-foreground/60">
                        Account access can be granted once this member signs in for the first time.
                      </span>
                    )}
                  </div>
                )}
                {m.hasAccount && m.email.toLowerCase() !== user?.email.toLowerCase() && (
                  <div className="pl-0">
                    <MemberActionsCell workspaceId={manager.id} email={m.email} disabled={m.disabled} />
                  </div>
                )}
                </div>
              ))}
              {invitesFailed && (
                <div
                  className="px-3 py-2.5 text-caption text-amber-400/90 bg-amber-400/[0.05]"
                  data-testid="text-invites-load-error"
                >
                  Couldn't load pending invites — this list may be incomplete. Refresh to try again.
                </div>
              )}
              {pendingInvites.map((inv) => (
                <PendingInviteRow key={`invite-${inv.id}`} workspaceId={manager.id} invite={inv} />
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Roles" desc="Per-role visibility & permissions">
          <div className="grid grid-cols-dashboard-3 gap-3">
            {team.roles.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5">
                <div className="text-body font-semibold text-foreground capitalize">{r.label}</div>
                <p className="text-caption text-muted-foreground/80 mt-1 leading-relaxed">{r.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Access policy" desc="Ad-account access grants">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <DetailReveal
              label={deriveLabel(team.access_policy, 72)}
              labelClassName={TYPE.caption}
              eyebrow="Access policy"
              sections={[{ text: team.access_policy }]}
            />
          </div>
          <div className="mt-2.5">
            <CaveatNote text="Data isolation still applies per ad account regardless of role — no member sees cross-account analysis." />
          </div>
        </SectionCard>
      </div>

      <AddMemberDialog
        workspaceId={manager.id}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        atSeatLimit={atSeatLimit}
        seatLimit={team.seat_limit}
        adAccounts={seed.ad_accounts}
      />
    </div>
  );
}
