// ─── Forgot password: request a reset link ─────────────────────────────
// Always shows the same neutral confirmation whether or not the account
// exists — no account enumeration.

import { useState, type FormEvent } from "react";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { authRequestPasswordReset, ApiError } from "@workspace/api-client-react";
import { AuthBrandHeader } from "@/components/brand/BrandMark";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "submitting" | "sent">("idle");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed) || state === "submitting") return;
    setError(null);
    setState("submitting");
    try {
      await authRequestPasswordReset({ email: trimmed });
      setState("sent");
    } catch (err) {
      setState("idle");
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests. Please wait a few minutes and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <AuthBrandHeader subtitle="Reset your password" />

        {state === "sent" ? (
          <div
            className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06]"
            data-testid="text-reset-request-success"
          >
            <MailCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-body text-foreground">
              If an account exists for that email, we sent a password reset link.
              The link works once and expires in 1 hour.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-forgot-password">
            <p className="text-body text-muted-foreground">
              Enter the email you use to sign in and we&apos;ll send you a link to
              choose a new password.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="forgot-email" className="text-caption font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-title text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                data-testid="input-forgot-email"
              />
            </div>
            {error && (
              <div className="text-caption text-red-400/90" data-testid="text-forgot-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={state === "submitting" || !EMAIL_RE.test(email.trim())}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              data-testid="button-send-reset-link"
            >
              {state === "submitting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {state === "submitting" ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="text-center">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back-to-login"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
