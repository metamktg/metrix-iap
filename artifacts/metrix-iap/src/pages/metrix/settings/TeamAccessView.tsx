// ─── Settings · Team & Access ─────────────────────────────────────────
// Workspace-wide: members, roles, and the account-level access policy.
// Invites persist via the API and merge with the seed member list.

import { useState, type FormEvent } from "react";
import { useAccount } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState, CaveatNote } from "../shared";
import { cn } from "@/lib/utils";
import { Users, UserPlus, ShieldCheck, Loader2, X, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useListWorkspaceInvites,
  useListWorkspaceMembers,
  useCreateWorkspaceInvite,
  useRevokeWorkspaceInvite,
  useResendWorkspaceInvite,
  getListWorkspaceInvitesQueryKey,
} from "@workspace/api-client-react";
import type { WorkspaceInviteInputRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const SECTION = "Settings · 09";

const INVITE_ROLES: { id: WorkspaceInviteInputRole; label: string }[] = [
  { id: "analyst", label: "Analyst" },
  { id: "client_viewer", label: "Client Viewer" },
];

function InviteMemberDialog({
  workspaceId,
  open,
  onOpenChange,
  atSeatLimit,
  seatLimit,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atSeatLimit: boolean;
  seatLimit: number;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceInviteInputRole>("analyst");
  const [feedback, setFeedback] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { mutate, isPending } = useCreateWorkspaceInvite();

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setEmail("");
      setRole("analyst");
      setFeedback(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || isPending || atSeatLimit) return;
    setFeedback(null);
    mutate(
      { workspaceId, data: { email: trimmed, role } },
      {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({
            queryKey: getListWorkspaceInvitesQueryKey(workspaceId),
          });
          if (result.status === "already_invited") {
            setFeedback(`${result.invite.email} already has a pending invite.`);
          } else {
            handleOpenChange(false);
          }
        },
        onError: (error) => {
          const serverMessage =
            error?.data && typeof error.data === "object" && "message" in error.data
              ? String((error.data as { message: unknown }).message)
              : null;
          setFeedback(
            serverMessage ??
              "Could not send the invite. Check the email address and try again.",
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center mb-1">
            <UserPlus className="w-4 h-4 text-primary" />
          </div>
          <DialogTitle className="text-[16px]">Invite member</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Send a pending invite to join this workspace. The invite persists until the member
            accepts.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-[11px] font-medium text-foreground/80">
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
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-invite-email"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-foreground/80">Role</span>
            <div className="grid grid-cols-2 gap-2">
              {INVITE_ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "h-9 rounded-md border text-[12px] font-medium transition-colors",
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

          {atSeatLimit && (
            <div className="text-[11px] text-amber-400/90" data-testid="text-seat-limit-warning">
              This workspace is full: all {seatLimit} seats are in use. Remove a member or cancel a
              pending invite before inviting someone new.
            </div>
          )}

          {feedback && (
            <div className="text-[11px] text-amber-400/90" data-testid="text-invite-feedback">
              {feedback}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="h-9 px-4 rounded-md border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!email.trim() || isPending || atSeatLimit}
              className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              data-testid="button-send-invite"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {isPending ? "Inviting…" : "Send invite"}
            </button>
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
          <span className="text-[12px] font-medium text-foreground truncate">{invite.email}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">Invited</span>
        </div>
        <div className="text-[10px] text-muted-foreground/70 truncate">
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
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none text-foreground/75 border-border/40 bg-white/[0.03]">
        {invite.role}
      </span>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={handleResend}
          disabled={isRevoking || isResending}
          title="Resend invite"
          className="flex items-center gap-1 h-6 px-2 rounded border border-border/40 bg-white/[0.02] text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          data-testid={`button-resend-invite-${invite.email}`}
        >
          {isResending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
          Resend
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={isRevoking || isResending}
          title="Revoke invite"
          className="flex items-center gap-1 h-6 px-2 rounded border border-red-400/25 bg-red-400/[0.06] text-[10px] font-medium text-red-400/90 hover:bg-red-400/[0.12] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          data-testid={`button-revoke-invite-${invite.email}`}
        >
          {isRevoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Revoke
        </button>
      </div>
    </div>
  );
}

export function TeamAccessView() {
  const { user } = useAuth();

  // Team management is admin-only (the API rejects members with 403).
  if (user?.role !== "admin") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Team & Access" />
        <PendingState
          title="Admin access required"
          message="Team management is available to workspace admins only. Ask a workspace admin if you need a change to your access."
          icon={ShieldCheck}
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
  const { data: invitesData } = useListWorkspaceInvites(manager.id);
  const { data: membersData } = useListWorkspaceMembers(manager.id);

  if (!ws) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Team & Access" />
        <PendingState title="No workspace settings" message="Team and access settings are not available for this workspace yet." icon={Users} />
      </div>
    );
  }

  const { team } = ws;

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
        lastActive: real ? real.last_login_at : m.last_active,
        hasAccount: Boolean(real),
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
        lastActive: m.last_login_at,
        hasAccount: true,
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
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
            data-testid="button-invite-member"
          >
            <UserPlus className="w-3 h-3" /> Invite member
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
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Member</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Role</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-right w-24">Last active</span>
            </div>
            <div className="divide-y divide-border/20">
              {memberRows.map((m) => (
                <div key={m.key} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2.5 items-center" data-testid={`row-member-${m.email}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-foreground truncate">{m.name}</span>
                      {m.invited ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">Invited</span>
                      ) : m.hasAccount ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 rounded leading-none">Active</span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 truncate">{m.email}</div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none",
                    m.role === "owner" ? "text-primary border-primary/25 bg-primary/10" : "text-foreground/75 border-border/40 bg-white/[0.03]"
                  )}>
                    {m.role}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/70 text-right w-24">
                    {m.lastActive
                      ? new Date(m.lastActive).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </div>
              ))}
              {pendingInvites.map((inv) => (
                <PendingInviteRow key={`invite-${inv.id}`} workspaceId={manager.id} invite={inv} />
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Roles" desc="What each role can see and do.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {team.roles.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5">
                <div className="text-[12px] font-semibold text-foreground capitalize">{r.label}</div>
                <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{r.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Access policy" desc="How ad-account access is granted across the workspace.">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/75 leading-relaxed">{team.access_policy}</p>
          </div>
          <div className="mt-2.5">
            <CaveatNote text="Data isolation still applies per ad account regardless of role — no member sees cross-account analysis." />
          </div>
        </SectionCard>
      </div>

      <InviteMemberDialog
        workspaceId={manager.id}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        atSeatLimit={atSeatLimit}
        seatLimit={team.seat_limit}
      />
    </div>
  );
}
