// ─── Forced password change (first login with a temporary password) ────

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/brand/BrandMark";

export function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1.5">
          <BrandLogo className="w-10 h-10 mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">Choose a new password</h1>
          <p className="text-body text-muted-foreground">
            You signed in with a temporary password{user ? ` as ${user.email}` : ""}. Set
            your own password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-change-password">
          <div className="space-y-1.5">
            <label htmlFor="current-password" className="text-label font-medium text-muted-foreground">
              Temporary password
            </label>
            <input
              id="current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-password" className="text-label font-medium text-muted-foreground">
              New password <span className="text-muted-foreground/60">(min. 8 characters)</span>
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className="text-label font-medium text-muted-foreground">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-confirm-password"
            />
          </div>
          {error && (
            <div className="text-label text-red-400/90" data-testid="text-change-password-error">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            data-testid="button-change-password"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isSubmitting ? "Saving…" : "Set new password"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => void logout()}
            className="text-label text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-signout-change-password"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
