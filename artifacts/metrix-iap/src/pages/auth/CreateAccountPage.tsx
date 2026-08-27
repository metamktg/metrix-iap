// ─── Create Account page ────────────────────────────────────────────────────
// Shown to logged-out visitors who follow the "Create Account" button on the
// login page. Collects email + password (+ confirmation), POSTs to the register
// endpoint, and redirects into the app on success.

import { useState, type FormEvent } from "react";
import { Loader2, ArrowLeft, UserPlus } from "lucide-react";
import { authRegister, ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthBrandHeader } from "@/components/brand/BrandMark";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateAccountPage({ onBack }: { onBack: () => void }) {
  const { setUser } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMatch = password === confirm;
  const canSubmit =
    !isSubmitting &&
    EMAIL_RE.test(email.trim()) &&
    password.length >= 8 &&
    passwordsMatch;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await authRegister({
        email: email.trim(),
        password,
        ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
      });
      // The API set a session cookie — push the user object into AuthContext
      // so AuthGate immediately shows the authenticated app.
      setUser(result.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("An account with that email already exists. Try signing in instead.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError("Please enter a valid email and a password of at least 8 characters.");
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
        <AuthBrandHeader subtitle="Create your account" />

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          data-testid="form-create-account"
        >
          {/* Display name (optional) */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-display-name"
              className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/55"
            >
              Display name <span className="normal-case font-normal text-foreground/55">(optional)</span>
            </label>
            <input
              id="register-display-name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full h-10 px-3.5 rounded-lg text-[13px] text-foreground placeholder:text-foreground/55 focus:outline-none transition-colors"
              style={{
                background: "hsl(222 30% 11%)",
                border: "1px solid hsl(222 20% 20%)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(222 100% 54% / 0.5)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "hsl(222 20% 20%)"; }}
              data-testid="input-register-display-name"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-email"
              className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/55"
            >
              Email
            </label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full h-10 px-3.5 rounded-lg text-[13px] text-foreground placeholder:text-foreground/55 focus:outline-none transition-colors"
              style={{
                background: "hsl(222 30% 11%)",
                border: "1px solid hsl(222 20% 20%)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(222 100% 54% / 0.5)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "hsl(222 20% 20%)"; }}
              data-testid="input-register-email"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-password"
              className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/55"
            >
              Password
            </label>
            <input
              id="register-password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full h-10 px-3.5 rounded-lg text-[13px] text-foreground placeholder:text-foreground/55 focus:outline-none transition-colors"
              style={{
                background: "hsl(222 30% 11%)",
                border: "1px solid hsl(222 20% 20%)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(222 100% 54% / 0.5)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "hsl(222 20% 20%)"; }}
              data-testid="input-register-password"
            />
            {password.length > 0 && password.length < 8 && (
              <p className="text-[11px] text-status-warning/70">
                Password must be at least 8 characters.
              </p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-confirm"
              className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/55"
            >
              Confirm password
            </label>
            <input
              id="register-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-10 px-3.5 rounded-lg text-[13px] text-foreground placeholder:text-foreground/55 focus:outline-none transition-colors"
              style={{
                background: "hsl(222 30% 11%)",
                border: "1px solid hsl(222 20% 20%)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(222 100% 54% / 0.5)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "hsl(222 20% 20%)"; }}
              data-testid="input-register-confirm"
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-[11px] text-status-warning/70">
                Passwords don't match.
              </p>
            )}
          </div>

          {error && (
            <div
              className="text-[12px] text-status-danger/90 bg-status-danger/5 border border-status-danger/10 rounded-lg px-3 py-2"
              data-testid="text-register-error"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-[color,background-color,border-color,box-shadow,opacity,transform] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
            style={{ boxShadow: "0 0 16px hsl(222 100% 54% / 0.25)" }}
            data-testid="button-create-account-submit"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={onBack}
            className="pressable inline-flex items-center gap-1 text-[11px] text-foreground/55 hover:text-foreground/70 transition-colors"
            data-testid="button-back-to-login"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
