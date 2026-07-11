// ─── Set a new password from an emailed reset link ─────────────────────
// Consumes the single-use token from the link's ?token= query param.

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { authResetPassword, ApiError } from "@workspace/api-client-react";
import { AuthBrandHeader } from "@/components/brand/BrandMark";

export function ResetPasswordPage({ onBackToLogin }: { onBackToLogin: () => void }) {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
    [],
  );

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "submitting" | "done" | "invalid">(
    token ? "idle" : "invalid",
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "submitting") return;
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setState("submitting");
    try {
      await authResetPassword({ token, new_password: newPassword });
      setState("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setState("invalid");
      } else if (err instanceof ApiError && err.status === 429) {
        setState("idle");
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setState("idle");
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <AuthBrandHeader subtitle="Choose a new password" />

        {state === "done" ? (
          <div className="space-y-4">
            <div
              className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06]"
              data-testid="text-reset-success"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-body text-foreground">
                Your password has been reset. Sign in with your new password to
                continue.
              </div>
            </div>
            <button
              onClick={onBackToLogin}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors"
              data-testid="button-go-to-login"
            >
              Go to sign in
            </button>
          </div>
        ) : state === "invalid" ? (
          <div className="space-y-4">
            <div
              className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06]"
              data-testid="text-reset-invalid"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-body text-foreground">
                This reset link is invalid, expired, or has already been used.
                Request a new one from the login page.
              </div>
            </div>
            <button
              onClick={onBackToLogin}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors"
              data-testid="button-back-to-login-invalid"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-reset-password">
            <div className="space-y-1.5">
              <label htmlFor="reset-new-password" className="text-label font-medium text-muted-foreground">
                New password <span className="text-muted-foreground/60">(min. 8 characters)</span>
              </label>
              <input
                id="reset-new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                data-testid="input-reset-new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reset-confirm-password" className="text-label font-medium text-muted-foreground">
                Confirm new password
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                data-testid="input-reset-confirm-password"
              />
            </div>
            {error && (
              <div className="text-label text-red-400/90" data-testid="text-reset-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={state === "submitting" || !newPassword || !confirmPassword}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              data-testid="button-reset-password"
            >
              {state === "submitting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {state === "submitting" ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        {state === "idle" || state === "submitting" ? (
          <div className="text-center">
            <button
              onClick={onBackToLogin}
              className="inline-flex items-center gap-1 text-label text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-back-to-login-reset"
            >
              <ArrowLeft className="w-3 h-3" /> Back to sign in
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
