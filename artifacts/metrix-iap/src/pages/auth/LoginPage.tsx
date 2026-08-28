// ─── Login landing page ────────────────────────────────────────────────
// Split-panel layout: premium brand value proposition on the left,
// login form on the right. Mobile: left collapses to a compact strip.

import { useState, type FormEvent } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/brand/BrandMark";
import { CREATE_ACCOUNT_PATH } from "@/navigation/preLoginRoutes";

// ── Value proposition copy (mirrors marketing site COPY) ─────────────────
const FEATURES = [
  { label: "Sprint Test System",      sub: "Structured rapid testing." },
  { label: "Signal Detection",        sub: "Identify what moves performance." },
  { label: "Actionable Intelligence", sub: "Decisions, not passive reports." },
  { label: "Scale With Confidence",   sub: "Repeatable, predictable growth." },
] as const;

const PROOF_POINTS = [
  { value: "+34%",  label: "Avg. ROAS Increase",   evidence: "214 audited campaigns" },
  { value: "−18%",  label: "CPA Reduction",         evidence: "Top quartile partners"  },
  { value: "$2.4M", label: "Wasted Spend Saved",    evidence: "Reallocated, 2025"      },
] as const;

// ── Tiny reusable icon marks ──────────────────────────────────────────────
function SprintIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function SignalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
      <circle cx="8" cy="8" r="7.2" stroke="currentColor" strokeWidth="0.8" opacity=".4" />
    </svg>
  );
}
function IntelligenceIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <polyline points="2,11 5,7 8,9 11,5 14,3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="3" r="1.2" fill="currentColor" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <path d="M5.5 8c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M2 8c0-3.31 2.69-6 6-6s6 2.69 6 6-2.69 6-6 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

const FEATURE_ICONS = [SprintIcon, SignalIcon, IntelligenceIcon, ScaleIcon];

// ─────────────────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-background flex items-stretch">

      {/* ══ LEFT PANEL — brand value proposition ════════════════════════════ */}
      <div className="hidden lg:flex flex-col w-1/2 border-r border-border/50 relative overflow-hidden bg-surface-deep">

        {/* ── Content column ── */}
        <div className="relative z-10 flex flex-col h-full py-10 max-w-[600px] mx-auto w-full px-10">

          {/* Brand mark */}
          <div className="flex items-center gap-2.5">
            <BrandLogo className="w-8 h-8" />
            <span className="text-cardtitle font-bold tracking-tight text-foreground">
              metrix
            </span>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col justify-center space-y-8 py-10">

            {/* Headline */}
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-label font-semibold uppercase tracking-widest text-muted-foreground/75">
                <span className="w-5 h-px bg-border shrink-0" />
                Performance Intelligence Platform
              </p>
              <h1 className="text-[2.35rem] font-bold leading-[1.09] tracking-tight text-foreground">
                Performance<br />
                intelligence for<br />
                marketers who need<br />
                to move <span className="text-interactive">faster.</span>
              </h1>
              <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75">
                TEST · OPTIMIZE · SCALE · REPEAT
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-2">
              {FEATURES.map(({ label, sub }, i) => {
                const Icon = FEATURE_ICONS[i];
                return (
                  <div
                    key={label}
                    className="group rounded-2xl border border-border/40 bg-foreground/[0.02] px-4 py-3.5 space-y-1.5 hover:border-border/60 hover:bg-foreground/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-interactive/75 group-hover:text-interactive transition-colors">
                        <Icon />
                      </span>
                      <span className="text-caption font-semibold text-foreground/80 group-hover:text-foreground transition-colors">{label}</span>
                    </div>
                    <p className="text-caption text-muted-foreground/75 leading-snug">{sub}</p>
                  </div>
                );
              })}
            </div>

            {/* Stats — bordered section */}
            <div className="border-t border-border/40 pt-5">
              <div className="grid grid-cols-3 gap-4">
                {PROOF_POINTS.map(({ value, label, evidence }) => (
                  <div key={label}>
                    <p className="text-[2rem] font-bold text-foreground tracking-tight">
                      {value}
                    </p>
                    <p className="text-caption font-semibold text-muted-foreground/75 mt-0.5">{label}</p>
                    <p className="text-label text-muted-foreground/75 mt-0.5">{evidence}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="flex items-center gap-3">
              <a
                href="/waitlist/#request-access"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-body font-semibold hover:bg-primary/90 shadow-md shadow-primary/25 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
              >
                Request Demo Access <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="/waitlist/"
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border/40 text-body text-muted-foreground hover:text-foreground hover:border-border/60 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
              >
                See More <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Footer */}
          <p className="text-label font-medium uppercase text-muted-foreground/75">
            Built for marketers · Engineered for growth · METRIX.AD
          </p>
        </div>
      </div>

      {/* ══ RIGHT PANEL — login form ═════════════════════════════════════════
          Outer = scrollable region.
          Inner = min-h-full + justify-center → always vertically centred,
          scrollable when content is taller than viewport.
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">

          {/* ── Mobile brand strip (hidden on desktop) ── */}
          <div className="lg:hidden w-full max-w-[480px] mb-8 pb-6 border-b border-border/40 space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandLogo className="w-7 h-7" />
              <span className="text-cardtitle font-bold tracking-tight text-foreground">metrix</span>
            </div>
            <p className="text-body text-muted-foreground/75 leading-snug">
              Performance intelligence for marketers who need to move faster.
            </p>
            <a
              href="/waitlist/#request-access"
              className="inline-flex items-center gap-1.5 text-body font-semibold text-interactive hover:opacity-75 transition-opacity"
            >
              Request Demo Access <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* ── Form column ── */}
          <div className="w-full max-w-[480px]">

            {/* Heading */}
            <div className="mb-7">
              <h2 className="text-cardtitle font-bold text-foreground">
                Sign in
              </h2>
              <p className="text-body text-muted-foreground mt-1.5">
                Welcome back — enter your credentials below.
              </p>
            </div>

            {/* ── Sign-in form ── */}
            <form onSubmit={handleLogin} className="space-y-4" data-testid="form-login">

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-label font-semibold uppercase tracking-widest text-muted-foreground/75">
                  Email
                </label>
                <input
                  id="login-email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-11 px-4 rounded-xl bg-foreground/[0.03] border border-border/40 text-title text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/50 focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                  data-testid="input-login-email"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-label font-semibold uppercase tracking-widest text-muted-foreground/75">
                    Password
                  </label>
                  <button
                    type="button" onClick={() => navigate("/forgot-password")}
                    className="pressable text-caption text-interactive/70 hover:text-interactive transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="login-password" type="password" required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-11 px-4 rounded-xl bg-foreground/[0.03] border border-border/40 text-title text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/50 focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                  data-testid="input-login-password"
                />
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <input
                  id="login-remember-me" type="checkbox"
                  checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                  data-testid="checkbox-remember-me"
                />
                <span className="text-body text-muted-foreground/75">Remember me</span>
              </label>

              {/* Error */}
              {loginError && (
                <div
                  className="text-body text-status-danger/90 rounded-xl px-4 py-2.5 bg-status-danger/10 border border-status-danger/20"
                  data-testid="text-login-error"
                >
                  {loginError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoggingIn || !email.trim() || !password}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-body font-semibold hover:bg-primary/90 active:scale-[0.99] shadow-md shadow-primary/25 transition-[color,background-color,border-color,box-shadow,opacity,transform] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center gap-2 mt-1"
                data-testid="button-login"
              >
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isLoggingIn ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* ── No account section — visually separated block ── */}
            <div
              className="mt-7 pt-6 space-y-3 border-t border-border/40"
            >
              <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75 text-center">
                No account?
              </p>
              <a
                href="/waitlist/#request-access"
                className="w-full h-11 rounded-xl border border-primary/30 bg-primary/10 text-body font-semibold text-interactive hover:bg-primary/20 hover:border-primary/50 transition-[color,background-color,border-color,box-shadow,opacity,transform] flex items-center justify-center gap-2"
                data-testid="link-request-access"
              >
                Request access <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <p className="text-caption text-muted-foreground/75 text-center leading-relaxed px-3">
                Access is approved by the Metrix team. Approved users receive a temporary password by email.
              </p>
              <button
                type="button" onClick={() => navigate(CREATE_ACCOUNT_PATH)}
                className="pressable-lg w-full h-10 rounded-xl border border-border/40 text-body font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 hover:border-border/60 transition-[color,background-color,border-color,box-shadow,opacity,transform] flex items-center justify-center"
                data-testid="button-create-account"
              >
                Create Account
              </button>
            </div>

            {/* Marketing link — desktop only */}
            <div className="mt-6 text-center hidden lg:block">
              <a
                href="/waitlist/"
                className="inline-flex items-center gap-1 text-caption text-muted-foreground/75 hover:text-foreground/70 transition-colors"
                data-testid="link-marketing-site"
              >
                Learn more about Metrix <ArrowRight className="w-3 h-3" />
              </a>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
