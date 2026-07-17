// ─── Login landing page ────────────────────────────────────────────────
// Shown to unauthenticated visitors: sign in, or request access via the
// full sign-up form on the marketing site (no quick email-only waitlist
// here — everyone goes through the proper request-access form).

import { useState, type FormEvent } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthBrandHeader } from "@/components/brand/BrandMark";

export function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      await login(email.trim(), password, rememberMe);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLoginError("Invalid email or password.");
      } else if (err instanceof ApiError && err.status === 429) {
        setLoginError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setLoginError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <AuthBrandHeader subtitle="Sign in to your workspace" />

        {/* Login */}
        <form onSubmit={handleLogin} className="space-y-3" data-testid="form-login">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-caption font-medium text-muted-foreground">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-title text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-login-email"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-caption font-medium text-muted-foreground">
                Password
              </label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-caption text-muted-foreground/70 hover:text-foreground transition-colors"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-title text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-login-password"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <input
              id="login-remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
              data-testid="checkbox-remember-me"
            />
            <span className="text-caption text-muted-foreground">Remember me</span>
          </label>
          {loginError && (
            <div className="text-caption text-red-400/90" data-testid="text-login-error">
              {loginError}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoggingIn || !email.trim() || !password}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-body font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            data-testid="button-login"
          >
            {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isLoggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-label uppercase tracking-wide text-muted-foreground/60">
            No account?
          </span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        {/* Request access — full sign-up form lives on the marketing site */}
        <div className="space-y-2.5">
          <a
            href="/www/#request-access"
            className="w-full h-9 rounded-md border border-primary/30 bg-primary/10 text-body font-medium text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
            data-testid="link-request-access"
          >
            Request access <ArrowRight className="w-3.5 h-3.5" />
          </a>
          <p className="text-caption text-muted-foreground/70 text-center">
            Access is approved by the Metrix team. Approved users receive a temporary
            password by email.
          </p>
        </div>

        {/* Marketing site link */}
        <div className="text-center">
          <a
            href="/www/"
            className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-marketing-site"
          >
            Learn more about Metrix <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
