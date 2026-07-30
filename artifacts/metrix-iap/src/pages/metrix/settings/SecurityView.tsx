// ─── Settings · Security ───────────────────────────────────────────────
// Password, active sessions (list/revoke), and current-session sign-out.
// Split out of the old Account/General page — see the Settings restructure.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, useListMySessions, useRevokeMySession, getListMySessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleHeader, SectionCard, useFocusParam } from "../shared";
import { cn } from "@/lib/utils";
import { UserCircle2, LogOut, Loader2, KeyRound, CheckCircle2, Monitor, ShieldCheck } from "lucide-react";

const SECTION = "Settings · 10";

function SessionSection() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SectionCard title="Your session" desc="The account you're currently signed in with.">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
        <UserCircle2 className="w-4 h-4 text-interactive shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate" data-testid="text-session-email">{user.email}</div>
          <div className="text-[10px] text-muted-foreground/85">Signed in</div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
          data-testid="button-sign-out"
        >
          {signingOut ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
          Sign out
        </button>
      </div>
    </SectionCard>
  );
}

function ActiveSessionsSection() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useListMySessions();
  const revoke = useRevokeMySession({
    mutation: {
      onSuccess: (_result, vars) => {
        void queryClient.invalidateQueries({ queryKey: getListMySessionsQueryKey() });
        // Revoking the current session logs this browser out immediately.
        const wasCurrent = data?.sessions.find((s) => s.id === vars.sessionId)?.is_current;
        if (wasCurrent) void logout();
      },
    },
  });
  const sessions = [...(data?.sessions ?? [])].sort((a, b) => Number(b.is_current) - Number(a.is_current));

  return (
    <SectionCard title="Active sessions" desc="Every browser currently signed in as you. Revoking a session signs it out immediately." table="user_sessions">
      {sessions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">No active sessions found.</p>
      ) : (
        <div className="divide-y divide-border/20">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <Monitor className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-foreground">
                    {s.is_current ? "This device" : "Other session"}
                  </span>
                  {s.is_current && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 rounded leading-none">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Signed in {new Date(s.created_at).toLocaleString()} · expires {new Date(s.expires_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => revoke.mutate({ sessionId: s.id })}
                disabled={revoke.isPending}
                className={cn(
                  "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[10px] font-medium transition-colors shrink-0",
                  s.is_current
                    ? "border-red-400/30 text-red-300 hover:bg-red-400/10"
                    : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5",
                  revoke.isPending && "opacity-50 pointer-events-none"
                )}
              >
                {s.is_current ? "Sign out" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

const inputClass =
  "w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/40";

function PasswordSection() {
  const { changePassword } = useAuth();
  const focus = useFocusParam();
  const cardRef = useRef<HTMLDivElement>(null);
  const arrivedFocused = useRef(focus === "password");
  const [highlighted, setHighlighted] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!arrivedFocused.current) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("focus");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    const t1 = setTimeout(() => {
      cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      setHighlighted(true);
    }, 100);
    const t2 = setTimeout(() => setHighlighted(false), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(err.message || "Could not change password. Check your current password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={cardRef}
      id="password"
      className={cn(
        "rounded-xl transition-shadow duration-500",
        highlighted && "ring-2 ring-primary/60 shadow-[0_0_24px_rgba(120,170,255,0.25)]",
      )}
      data-testid="section-password"
    >
      <SectionCard title="Password" desc="Change the password you use to sign in. Changing it signs you out everywhere else.">
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm" data-testid="form-account-change-password">
          <div className="space-y-1.5">
            <label htmlFor="account-current-password" className="text-[11px] font-medium text-muted-foreground">
              Current password
            </label>
            <input
              id="account-current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              data-testid="input-account-current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account-new-password" className="text-[11px] font-medium text-muted-foreground">
              New password <span className="text-muted-foreground/80">(min. 8 characters)</span>
            </label>
            <input
              id="account-new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              data-testid="input-account-new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account-confirm-password" className="text-[11px] font-medium text-muted-foreground">
              Confirm new password
            </label>
            <input
              id="account-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              data-testid="input-account-confirm-password"
            />
          </div>
          {error && (
            <div className="text-[11px] text-red-400/90" data-testid="text-account-change-password-error">
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90" data-testid="text-account-change-password-success">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Password updated. Other sessions have been signed out.
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            data-testid="button-account-change-password"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            {isSubmitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

export function SecurityView() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="Security" subtitle="Password, active sessions, and sign-out." />
      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SessionSection />
        <PasswordSection />
        <ActiveSessionsSection />
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
          <ShieldCheck className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Two-factor authentication and login history are planned but not yet built.
          </p>
        </div>
      </div>
    </div>
  );
}
