// ─── Login landing page ────────────────────────────────────────────────
// Shown to unauthenticated visitors: sign in, join the waitlist, or visit
// the marketing site.

import { useState, type FormEvent } from "react";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { joinAgentWaitlist, ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistState, setWaitlistState] = useState<
    "idle" | "submitting" | "joined" | "already" | "error"
  >("idle");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      await login(email.trim(), password);
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

  const handleJoinWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = waitlistEmail.trim();
    if (!EMAIL_RE.test(trimmed) || waitlistState === "submitting") return;
    setWaitlistState("submitting");
    try {
      const result = await joinAgentWaitlist({ email: trimmed });
      setWaitlistState(result.status === "already_joined" ? "already" : "joined");
    } catch {
      setWaitlistState("error");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center space-y-1.5">
          <div className="text-[13px] font-mono text-muted-foreground/60 tracking-widest">MX</div>
          <h1 className="text-xl font-semibold text-foreground">Metrix</h1>
          <p className="text-[12px] text-muted-foreground">
            Sign in to your workspace
          </p>
        </div>

        {/* Login */}
        <form onSubmit={handleLogin} className="space-y-3" data-testid="form-login">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-[11px] font-medium text-muted-foreground">
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
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-login-email"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-[11px] font-medium text-muted-foreground">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
              data-testid="input-login-password"
            />
          </div>
          {loginError && (
            <div className="text-[11px] text-red-400/90" data-testid="text-login-error">
              {loginError}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoggingIn || !email.trim() || !password}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            data-testid="button-login"
          >
            {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isLoggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
            No account?
          </span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        {/* Waitlist */}
        <div className="space-y-2.5">
          {waitlistState === "joined" || waitlistState === "already" ? (
            <div
              className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06]"
              data-testid="text-waitlist-success"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[12px] text-foreground">
                {waitlistState === "already"
                  ? "You're already on the waitlist. We'll email you when your access is approved."
                  : "You're on the waitlist. We'll email you a temporary password once your access is approved."}
              </div>
            </div>
          ) : (
            <form onSubmit={handleJoinWaitlist} className="flex items-center gap-2" data-testid="form-waitlist">
              <input
                type="email"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="flex-1 h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                data-testid="input-waitlist-email"
              />
              <button
                type="submit"
                disabled={waitlistState === "submitting" || !EMAIL_RE.test(waitlistEmail.trim())}
                className="h-9 px-3.5 rounded-md border border-primary/30 bg-primary/10 text-[12px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 shrink-0"
                data-testid="button-join-waitlist"
              >
                {waitlistState === "submitting" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                Join waitlist
              </button>
            </form>
          )}
          {waitlistState === "error" && (
            <div className="text-[11px] text-red-400/90" data-testid="text-waitlist-error">
              Couldn't join the waitlist right now. Please try again shortly.
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/70 text-center">
            Access is approved by the Metrix team. Approved users receive a temporary
            password by email.
          </p>
        </div>

        {/* Marketing site link */}
        <div className="text-center">
          <a
            href="/www/"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-marketing-site"
          >
            Learn more about Metrix <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
